use super::contact::{ContactList, ContactListResult};
use crate::graphql::{GqlMutation, GqlQuery};
use crate::prelude::*;
use crate::restrictions::WeeklyRestrictions;
use compact_str::CompactString as String;
use futures::StreamExt;
use rand::RngExt;
use std::collections::HashMap;
use std::string::String as StdString;

#[derive(Serialize, Deserialize, Hash, Debug, Clone, Model)]
pub struct Team {
  #[ormlite(primary_key)]
  id: Id<Team>,
  name: String,
  time_zone: ArcSwap<TimeZone>,
  allowed_messaging_day_times: ArcSwap<WeeklyRestrictions>,
}

pub struct TeamState {
  actor_state: super::ActorState<Team>,
  campaigns: HashMap<Arc<<Campaign as Actor>::Id>, Sender<Campaign>>,
  emails: HashMap<Arc<<Email as Actor>::Id>, Sender<Email>>,
  email_groups: Arc<crate::models::email::EmailGroupService>,
  linkedins: HashMap<Arc<<LinkedIn as Actor>::Id>, Sender<LinkedIn>>,
  domains: HashMap<String, crate::models::email::EmailDomain>,
  contact_lists: HashMap<Id<ContactList>, ContactList>,
}

impl TeamState {
  pub fn new(actor_state: super::ActorState<Team>) -> Self {
    Self {
      campaigns: HashMap::new(),
      emails: HashMap::new(),
      email_groups: Arc::new(crate::models::email::EmailGroupService::new_empty(
        1024,
        actor_state.db.clone(),
        actor_state.router.clone(),
      )),
      linkedins: HashMap::new(),
      domains: HashMap::new(),
      contact_lists: HashMap::new(),
      actor_state,
    }
  }
  pub async fn append_contact_list(&mut self, list: ContactList, tx: Option<&mut sqlx::PgConnection>) -> Result<()> {
    let list = match tx {
      Some(tx) => list.save(tx).await?,
      None => {
        let mut conn = self.actor_state.db.acquire().await?;
        list.save(&mut conn).await?
      }
    };
    self.contact_lists.insert(list.id, list);
    Ok(())
  }
}

impl Actor for Team {
  type Id = Id<Team>;
  type IdRef = Id<Team>;
  type State = TeamState;
  type StartResult = ();

  fn id_ref(&self) -> &Self::IdRef {
    &self.id
  }

  async fn start(&mut self, router: &janium_actors::Router, state: &mut TeamState) -> janium_actors::DynResult {
    tracing::info!(id = %self.id, "Starting team actor");

    // Register LinkedIn actors first so campaigns can find them during start()
    let linkedin = LinkedIn::select()
      .where_bind("team_id = ?", self.id)
      .fetch_all(&state.actor_state.db)
      .await?;

    LinkedInActionRequest::reset_pending_actions(&state.actor_state.db, self.id).await?;

    for linkedin in linkedin {
      let user_timezone = state
        .actor_state
        .user_service
        .get_user_by_id(linkedin.primary_user_id)
        .await?
        .ok_or_else(|| JaniumError::not_found(linkedin.primary_user_id))?
        .timezone
        .clone();
      let id = linkedin.id;
      let sender = router
        .register(
          linkedin,
          super::linkedin::LinkedInState::new(
            state.actor_state.as_type(format!("linkedin-{id}")),
            self.time_zone.clone(),
            self.allowed_messaging_day_times.clone(),
            user_timezone,
          ),
        )
        .await?;
      state.linkedins.insert(sender.id_arc().clone(), sender);
    }

    let campaigns = Campaign::select()
      .where_bind("team_id = ?", self.id)
      .fetch_all(&state.actor_state.db)
      .await
      .map_err(|error| {
        tracing::error!(?error, "Unable to load campaigns");
        janium_actors::ActorError::NoRegistration(error.to_string())
      })?;

    for campaign in campaigns {
      let id = campaign.id();
      let sender = router
        .register(
          campaign,
          super::campaign::CampaignState::new(
            super::ActorState::new(state.actor_state.clone(), id.to_string()),
            self.time_zone.clone(),
            self.allowed_messaging_day_times.clone(),
            state.email_groups.clone(),
          ),
        )
        .await?;
      state.campaigns.insert(sender.id_arc().clone(), sender);
    }

    // TODO: add emails here
    let emails = Email::select()
      .where_bind("team_id = ?", self.id)
      .fetch_all(&state.actor_state.db)
      .await?;

    for email in emails {
      let id = email.id();
      let sender = state
        .actor_state
        .router
        .register(
          email,
          crate::models::email::EmailState::new(state.actor_state.as_type(format!("email-{id}"))),
        )
        .await?;
      state.emails.insert(sender.id_arc().clone(), sender);
    }

    state
      .email_groups
      .dynamic_load_many(async |db| {
        crate::models::email::EmailGroup::select()
          .where_bind("team_id = ?", self.id)
          .fetch_all(db)
          .await
          .map_err(Into::into)
      })
      .await?;

    state.domains = crate::models::email::EmailDomain::select()
      .where_bind("team_id = ?", self.id)
      .fetch_all(&state.actor_state.db)
      .await?
      .into_iter()
      .map(|d| (d.domain.clone(), d))
      .collect();

    state.contact_lists = ContactList::load_by_team(self.id, &state.actor_state.db)
      .await
      .inspect_err(|error| {
        tracing::error!(?error, "Unable to load contact lists");
      })?
      .into_iter()
      .map(|cl| (cl.id, cl))
      .collect();

    Ok(())
  }
}

impl Team {
  pub fn new_empty(id: Id<Team>) -> Self {
    Self {
      id,
      name: "".into(),
      time_zone: TimeZone::new("UTC").unwrap().pipe(ArcSwap::new),
      allowed_messaging_day_times: WeeklyRestrictions::default().pipe(ArcSwap::new),
    }
  }
  pub async fn load_and_register_all(
    app_state: &crate::AppState,
    evaluation_interval_min: std::time::Duration,
    evaluation_interval_max: std::time::Duration,
  ) -> Result {
    // let db = DB_POOL_GLOBAL.clone();
    // let db: DatabaseConnection = db.into();

    let teams: Vec<Self> = Self::select().fetch_all(&app_state.db).await?;

    let mut futures = Vec::with_capacity(teams.len());
    for team in teams {
      let id = team.id;
      futures.push(app_state.router.register(
        team,
        TeamState::new(super::ActorState::new(app_state.clone(), id.to_string())),
      ));
    }
    let _team_senders = futures::future::try_join_all(futures).await?;
    let router = app_state.router.clone();

    let mut shutdown = crate::config::ShutdownGuard::<()>::new(&app_state.shutdown_controller, "scheduler-bg");
    tokio::spawn(async move {
      shutdown
        .interrupt(async {
          loop {
            let start = tokio::time::Instant::now();
            let schedule_evaluations = ScheduleEvaluations {
              delay: Arc::new(std::sync::atomic::AtomicU64::new(0)),
              start,
            };
            router
              .broadcast_notify::<Team, _>(|_| schedule_evaluations.clone())
              .await
              .inspect_err(|error| tracing::error!(?error, "Unable to schedule evaluations"))
              .ok();
            let delay =
              rand::rng().random_range(evaluation_interval_min..=evaluation_interval_max.max(evaluation_interval_min));
            tokio::time::sleep(delay).await;
          }
        })
        .await
        .ok();
    });
    Ok(())
  }
  pub async fn save(&self, transaction: &mut sqlx::PgConnection) -> Result<Self> {
    (self.clone())
      .insert(transaction)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        Self::primary_key().unwrap(),
      ))
      .await
      .map_err(Into::into)
  }
  pub async fn create(app_state: &AppState, name: String, timezone: String) -> Result<Self> {
    let team = Self {
      id: Id::new(),
      name,
      time_zone: TimeZone::new(&timezone)
        .ok_or_else(|| JaniumError::ext_msg("unknown timezone"))?
        .pipe(ArcSwap::new),
      allowed_messaging_day_times: WeeklyRestrictions::default().pipe(ArcSwap::new),
    };
    let user_id = crate::auth::CLAIMS.with(|claims| claims.user_id);
    let mut transaction = app_state.db.begin().await?;
    team
      .save(&mut transaction)
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to save new team"))?;
    app_state
      .user_service
      .user_team_map
      .save(
        UserTeamMap::new(user_id, team.id, Privilege::TeamAdmin.into()),
        &mut transaction,
      )
      .await?;
    transaction.commit().await?;
    let id = team.id;
    app_state
      .router
      .register(
        team.clone(),
        TeamState::new(super::ActorState::new(app_state.clone(), id.to_string())),
      )
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to register new team"))?;
    Ok(team)
  }
}

#[gql::Object]
impl Team {
  pub async fn id(&self) -> Id<Team> {
    self.id
  }
  pub async fn name(&self) -> &str {
    &self.name
  }
  pub async fn time_zone(&self) -> &ArcSwap<TimeZone> {
    &self.time_zone
  }
  pub async fn allowed_messaging_day_times(&self) -> &ArcSwap<WeeklyRestrictions> {
    &self.allowed_messaging_day_times
  }
  pub async fn users(&self, context: &gql::Context<'_>) -> Result<Vec<Arc<User>>> {
    let app_state = context.data_unchecked::<AppState>();
    let user_ids = app_state.user_service.user_team_map.get_r(&self.id).await?;
    let mut futures = Vec::with_capacity(user_ids.as_ref().map(|u| u.len()).unwrap_or(0));
    for id in user_ids.iter().flat_map(|u| u.keys().copied()) {
      // If this is not the bootstrap team, and the user is the superadmin, skip it.
      if self.id != Id::nil() && id == Id::nil() {
        continue;
      }
      futures.push(app_state.user_service.get_user_by_id(id));
    }
    let users = futures::future::try_join_all(futures)
      .await?
      .into_iter()
      .flatten()
      .collect::<Vec<_>>();

    Ok(users)
  }
}

#[gql::Object(name = "TeamMutation")]
impl GqlMutation<Team> {
  pub async fn campaign(&self, id: Id<Campaign>) -> Result<GqlMutation<Campaign>> {
    Ok(GqlMutation {
      app_state: self.app_state.clone(),
      team: self.team.clone(),
      sender: self.app_state.router.get_handle::<Campaign>(&id)?,
    })
  }
  pub async fn create_campaign(&self, campaign: CreateCampaign) -> Result<Campaign> {
    self.sender.send(campaign).await?
  }
  pub async fn create_email_group(&self, name: std::string::String) -> crate::Result<crate::models::email::EmailGroup> {
    let email_group = crate::models::email::EmailGroup {
      id: Id::new(),
      team_id: *self.sender.id(),
      name: name.into(),
      emails: Default::default(),
    };
    let email_groups = self
      .sender
      .send(super::Query::new(|_, _, state: &TeamState| state.email_groups.clone()))
      .await?;
    email_groups
      .save_without_transaction(crate::util::HashValue::default(), email_group.clone())
      .await?;
    Ok(email_group)
  }
  pub async fn remove_email_group(&self, group_id: Id<EmailGroup>) -> Result<bool> {
    let email_groups = self
      .sender
      .send(super::Query::new(|_, _, state: &TeamState| state.email_groups.clone()))
      .await?;
    email_groups.delete_without_transaction(&group_id).await?;
    Ok(true)
  }
  pub async fn remove_email_from_group(&self, group_id: Id<EmailGroup>, email: std::string::String) -> Result<bool> {
    let email_groups = self
      .sender
      .send(super::Query::new(|_, _, state: &TeamState| state.email_groups.clone()))
      .await?;
    let email_group = email_groups
      .get(&group_id)
      .await?
      .ok_or_else(|| JaniumError::not_found(group_id))?;
    let hash = crate::util::hash(&email_group);
    let mut email_group = email_group.as_ref().clone();
    email_group.remove_email(&email);
    email_groups.save_without_transaction(hash, email_group.clone()).await?;
    Ok(true)
  }
  pub async fn add_email_to_group(&self, group_id: Id<EmailGroup>, email: std::string::String) -> Result<bool> {
    let email_clone = email.clone();
    let (email_sender, email_groups) = self
      .sender
      .send(super::Query::new(move |_, _, state: &TeamState| {
        let email_clone = email_clone;
        (state.emails.get(&email_clone).cloned(), state.email_groups.clone())
      }))
      .await?;
    if email_sender.is_none() {
      return Err(JaniumError::not_found(email));
    };
    let Some(email_group) = email_groups.get(&group_id).await? else {
      return Err(JaniumError::not_found(group_id));
    };
    let hash = crate::util::hash(&email_group);
    let mut email_group = email_group.as_ref().clone();
    email_group.add_email(email.as_str().into());
    email_groups.save_without_transaction(hash, email_group.clone()).await?;
    Ok(true)
  }
  async fn upload_contact_list_csv(
    &self,
    ctx: &gql::Context<'_>,
    csv_file: gql::Upload,
    list_name: std::string::String,
  ) -> Result<ContactListResult> {
    let csv_file = csv_file.value(ctx).unwrap();
    let bytes = &csv_file.content;
    let name = &csv_file.filename;
    tracing::trace!(list_name, name, content = %std::string::String::from_utf8_lossy(bytes), "Got csv");
    super::contact::ContactList::new_from_reader(&self.app_state, &self.sender, list_name, csv_file.into_read()).await
  }
  pub async fn mutate(&self, changes: MutateTeam) -> Result<Team> {
    self.sender.send(changes).await?
  }
  pub async fn create_invite(&self, invite: CreateInvite) -> Result<Invite> {
    let code = ['j']
      .into_iter()
      .chain((0..10).map(|_| rand::rng().sample(rand::distr::Alphanumeric) as char))
      .collect::<String>();
    if invite.privileges.is_empty() {
      return Err(JaniumError::ext_msg("Invite has no privileges"));
    }
    if invite.email.is_empty() {
      return Err(JaniumError::ext_msg("Invite email is empty"));
    }
    if !invite.email.contains('@') {
      return Err(JaniumError::ext_msg("Invite email is not valid"));
    }
    if invite.email.contains(' ') {
      return Err(JaniumError::ext_msg("Invite email is not valid"));
    }

    let invite = Invite {
      code: code.into(),
      email: invite.email,
      team_id: *self.sender.id(),
      privileges: invite.privileges,
      created_at: Timestamp::now(),
      created_by: crate::auth::CLAIMS.with(|claims| claims.user_id),
      expires_at: Timestamp::now() + chrono::Duration::days(7),
    };
    self
      .app_state
      .invite_service
      .save_without_transaction(crate::util::HashValue::default(), invite.clone())
      .await?;
    Ok(invite)
  }
  pub async fn remove_invite(&self, code: std::string::String) -> Result<bool> {
    self.app_state.invite_service.delete_without_transaction(&code).await?;
    Ok(true)
  }
  pub async fn create_linkedin(&self, linkedin: CreateLinkedIn) -> Result<LinkedIn> {
    static LINKEDIN_BASE_PORT_QUERY_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let (team_timezone, team_allowed_messaging_day_times) = self
      .team
      .send(super::Query::new(|team: &Team, _, _| {
        (team.time_zone.clone(), team.allowed_messaging_day_times.clone())
      }))
      .await?;
    let linkedin = {
      // Ensure that we don't get any race conditions where we can cause intermittent failures.
      let _guard = LINKEDIN_BASE_PORT_QUERY_LOCK.lock().await;
      let base_port = sqlx::query_scalar::<_, i16>(
        "with p as (
  select generate_series(0::smallint, (select coalesce(max(base_port), 0) + 10 from linked_in)) as port
)
select min(p.port)::smallint
from p
where p.port not in (select base_port from linked_in)",
      )
      .fetch_one(&self.app_state.db)
      .await?;
      let linkedin = linkedin
        .into_linkedin(
          *self.sender.id(),
          crate::auth::CLAIMS.with(|claims| claims.user_id),
          base_port,
          team_timezone.get().as_ref(),
          team_allowed_messaging_day_times.get().as_ref(),
        )
        .await?;
      linkedin.insert(&self.app_state.db).await?
    };

    let user_timezone = self
      .app_state
      .user_service
      .get_user_by_id(linkedin.primary_user_id)
      .await?
      .ok_or_else(|| JaniumError::not_found(linkedin.primary_user_id))?
      .timezone
      .clone();

    let sender = self
      .app_state
      .router
      .register(
        linkedin.clone(),
        super::linkedin::LinkedInState::new(
          super::ActorState::new(self.app_state.clone(), linkedin.id.to_string()),
          team_timezone,
          team_allowed_messaging_day_times,
          user_timezone,
        ),
      )
      .await?;
    self
      .sender
      .send(super::Mutation::new(|_, _, state: &mut TeamState| {
        state.linkedins.insert(sender.id_arc().clone(), sender);
      }))
      .await?;
    Ok(linkedin)
  }
  pub async fn linkedin(&self, id: Id<LinkedIn>) -> Result<GqlMutation<LinkedIn>> {
    Ok(GqlMutation {
      app_state: self.app_state.clone(),
      team: self.team.clone(),
      sender: self.app_state.router.get_handle::<LinkedIn>(&id)?,
    })
  }
  pub async fn delete_contact_lists(&self, ids: Vec<Id<ContactList>>) -> Result<Vec<Id<ContactList>>> {
    self
      .sender
      .send(
        async move |_actor: &mut Team, _router: &Router, state: &mut TeamState| {
          let mut transaction = state.actor_state.db.begin().await?;
          let mut new_contact_lists = state.contact_lists.clone();
          let mut deleted_ids = Vec::new();
          for id in ids {
            let contact_list = new_contact_lists.remove(&id);
            if let Some(contact_list) = contact_list {
              contact_list.delete(&mut transaction).await?;
              deleted_ids.push(id);
            }
          }
          transaction.commit().await?;
          state.contact_lists = new_contact_lists;
          Ok(deleted_ids)
        },
      )
      .await?
  }
  pub async fn mutate_contact_list(&self, id: Id<ContactList>, name: Option<StdString>) -> Result<bool> {
    let Some(name) = name else {
      return Ok(false);
    };
    if name.is_empty() {
      return Err(JaniumError::ext_msg("Name is empty"));
    }
    self
      .sender
      .send(
        async move |_actor: &mut Team, _router: &Router, state: &mut TeamState| {
          let Some(contact_list) = state.contact_lists.get_mut(&id) else {
            return Ok(false);
          };
          contact_list.name = name;
          contact_list
            .clone()
            .save(&mut *state.actor_state.db.acquire().await?)
            .await?;
          Ok(true)
        },
      )
      .await?
  }
}

#[gql::Object(name = "TeamQuery")]
impl GqlQuery<Team> {
  pub async fn get(&self) -> Result<Team> {
    self
      .sender
      .send(super::Query::new(|a: &Team, _, _| a.clone()))
      .await
      .map_err(Into::into)
  }
  pub async fn campaigns(&self) -> Result<Vec<GqlQuery<Campaign>>> {
    let team = self.team.clone();
    self
      .sender
      .send(super::Query::new(move |_, _, state: &TeamState| {
        state
          .campaigns
          .values()
          .map(|s| GqlQuery {
            app_state: state.actor_state.clone(),
            team: team.clone(),
            sender: s.clone(),
          })
          .collect::<Vec<_>>()
      }))
      .await
      .map_err(Into::into)
  }
  pub async fn campaign(&self, id: Id<Campaign>) -> Result<GqlQuery<Campaign>> {
    Ok(GqlQuery {
      app_state: self.app_state.clone(),
      team: self.team.clone(),
      sender: self.app_state.router.get_handle::<Campaign>(&id)?,
    })
  }
  pub async fn contact_lists(&self) -> Result<Vec<ContactList>> {
    self
      .sender
      .send(super::Query::<Team, _, _>::new(|_, _, state| {
        state.contact_lists.values().cloned().collect::<Vec<_>>()
      }))
      .await
      .map(|list| list.tap_mut(|list| list.sort_unstable_by_key(|cl| cl.id)))
      .map_err(Into::into)
  }
  pub async fn email_integrations(&self) -> Result<Vec<Email>> {
    let email_senders = self
      .sender
      .send(super::Query::new(|_, _, state: &TeamState| {
        state.emails.values().cloned().collect::<Vec<_>>()
      }))
      .await?;
    let mut futures = email_senders
      .iter()
      .map(|s| s.send(super::Query::new(|email: &Email, _, _| email.clone())))
      .collect::<futures::stream::FuturesOrdered<_>>();
    let mut emails = Vec::with_capacity(email_senders.len());
    while let Some(email) = futures.next().await {
      emails.push(email?);
    }
    Ok(emails)
  }
  pub async fn email_groups(&self) -> Result<Vec<Arc<EmailGroup>>> {
    let email_groups = self
      .sender
      .send(super::Query::new(|_, _, state: &TeamState| state.email_groups.clone()))
      .await?;
    Ok(email_groups.iter().collect())
  }
  pub async fn invites(&self, all_teams: Option<bool>) -> Result<Vec<Invite>> {
    let current_team_id = *self.sender.id();
    let team_ids = if all_teams.unwrap_or(false) {
      let team_ids = self
        .app_state
        .user_service
        .user_team_map
        .get_l(&crate::auth::CLAIMS.with(|claims| claims.user_id))
        .await?;
      let contained = team_ids
        .as_ref()
        .map(|t| t.contains_key(&current_team_id))
        .unwrap_or(false);
      let mut team_ids = team_ids
        .as_ref()
        .map(|t| t.keys().copied().collect::<Vec<_>>())
        .unwrap_or_default();
      if !contained {
        team_ids.push(current_team_id);
      }
      team_ids
    } else {
      vec![current_team_id]
    };
    let invites = Invite::select()
      .where_bind("team_id in (select id from unnest(?) as x(id))", &team_ids)
      .fetch_all(&self.app_state.db)
      .await?;
    Ok(invites)
  }
  pub async fn linked_in_integrations(&self) -> Result<Vec<GqlQuery<LinkedIn>>> {
    let linkedins = self
      .sender
      .send(super::Query::new(|_, _, state: &TeamState| state.linkedins.clone()))
      .await?;
    Ok(
      linkedins
        .values()
        .map(|s| GqlQuery {
          app_state: self.app_state.clone(),
          team: self.team.clone(),
          sender: s.clone(),
        })
        .collect(),
    )
  }
}

#[derive(Debug, gql::InputObject)]
pub struct CreateCampaign {
  name: std::string::String,
}

impl Message<Team> for CreateCampaign {
  type Return = Result<Campaign>;
  #[tracing::instrument(skip_all, fields(team_id = %actor.id))]
  async fn handle(
    self,
    actor: &mut Team,
    router: &janium_actors::Router,
    state: &mut <Team as Actor>::State,
  ) -> Self::Return {
    let mut conn = state.actor_state.db.acquire().await?;
    let campaign = Campaign::new(actor.id, self.name.to_string()).save(&mut conn).await?;
    let id = campaign.id;
    let sender = router
      .register(
        campaign.clone(),
        super::campaign::CampaignState::new(
          super::ActorState::new(state.actor_state.clone(), id.to_string()),
          actor.time_zone.clone(),
          actor.allowed_messaging_day_times.clone(),
          state.email_groups.clone(),
        ),
      )
      .await?;
    state.campaigns.insert(sender.id_arc().clone(), sender);
    Ok(campaign)
  }
}

#[derive(Debug, Clone)]
struct ScheduleEvaluations {
  delay: Arc<std::sync::atomic::AtomicU64>,
  start: tokio::time::Instant,
}

impl Message<Team> for ScheduleEvaluations {
  type Return = Result<()>;
  async fn handle(
    self,
    _actor: &mut Team,
    _router: &janium_actors::Router,
    state: &mut <Team as Actor>::State,
  ) -> Self::Return {
    let delay2 = std::time::Duration::from_millis(self.delay.fetch_add(250, std::sync::atomic::Ordering::Relaxed));
    let deadline1 = self.start;
    let deadline2 = self.start + delay2;
    let campaigns = state.campaigns.values().cloned().collect::<Vec<_>>();
    let linkedins = state.linkedins.values().cloned().collect::<Vec<_>>();

    tokio::spawn(async move {
      tokio::time::sleep_until(deadline1).await;
      for linkedin in linkedins {
        linkedin
          .notify(
            async |linkedin: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
              linkedin.evaluate_settings(state, false, Timestamp::now()).await
            },
          )
          .await
          .ok();
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
      }
      tokio::time::sleep_until(deadline2).await;
      for campaign in campaigns {
        campaign.notify(super::campaign::EvaluateCampaign).await.ok();
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
      }
    });

    Ok(())
  }
}

#[derive(Debug, Clone, gql::InputObject)]
pub struct MutateTeam {
  name: Option<std::string::String>,
  time_zone: Option<TimeZone>,
  allowed_messaging_day_times: Option<WeeklyRestrictions>,
}

impl Message<Team> for MutateTeam {
  type Return = Result<Team>;
  #[tracing::instrument(skip_all, fields(team_id = %actor.id))]
  async fn handle(
    self,
    actor: &mut Team,
    _router: &janium_actors::Router,
    state: &mut <Team as Actor>::State,
  ) -> Self::Return {
    let hash = crate::util::hash(&actor);
    if let Some(name) = self.name {
      actor.name = name.into();
    }
    if let Some(time_zone) = self.time_zone {
      actor.time_zone.set(time_zone);
    }
    if let Some(allowed_messaging_day_times) = self.allowed_messaging_day_times {
      allowed_messaging_day_times.validate()?;
      actor.allowed_messaging_day_times.set(allowed_messaging_day_times);
    }
    if hash == crate::util::hash(&actor) {
      return Ok(actor.clone());
    }
    let mut transaction = state.actor_state.db.begin().await?;
    let team = actor.clone().save(&mut transaction).await?;
    transaction.commit().await?;
    Ok(team)
  }
}
// #[derive(Debug)]
// pub struct UserEmail {
//   pub id: Uuid,
//   pub email: String,
//   pub team_id: Uuid,
// }

// pub struct User {
//   id: Uuid,
//   email: String,
//   password_hash: String,
// }

// pub struct TeamUser {
//   user_id: Uuid,
//   team_id: Uuid,
// }
