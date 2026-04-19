use self::contact::AddCampaignContact;
use self::graph::{CampaignGraph, CampaignGraphVerifier};
use self::link::{CreateCampaignStepLink, MutateCampaignStepLink};
use self::step::{CreateCampaignStep, MutateCampaignStep};
pub use self::{
  contact::CampaignContact, contact::CampaignContactStatus, contact::ConnectionEstablished, contact::ContactMerged,
  link::CampaignStepLink, step::CampaignStep,
};
use crate::models::contact::Contact;
use crate::models::email::EmailGroupService;
use crate::prelude::*;
use crate::restrictions::WeeklyRestrictions;
use crate::util::OptionPatch;
use std::collections::HashMap;

mod contact;
mod graph;
mod link;
mod step;

#[derive(Serialize, Deserialize, Hash, Debug, Clone, ormlite::Model)]
pub struct Campaign {
  #[ormlite(primary_key)]
  pub id: Id<Campaign>,
  pub team_id: Id<Team>,
  name: String,
  pub(crate) active: bool,
  allowed_messaging_day_times: Option<WeeklyRestrictions>,
  default_email_group: Option<Id<EmailGroup>>,
  linkedin_ids: Vec<Id<LinkedIn>>,
}

#[derive(Debug)]
pub struct CampaignState {
  pub actor_state: super::ActorState<Campaign>,
  // arc to prevent writing to the existing graph without it being validated
  pub graph: Arc<CampaignGraph>,
  pub contacts: iddqd::BiHashMap<CampaignContact>,
  pub email_groups: Arc<EmailGroupService>,
  pub team_timezone: ArcSwap<TimeZone>,
  pub team_allowed_messaging_day_times: ArcSwap<WeeklyRestrictions>,
}

impl CampaignState {
  pub fn new(
    actor_state: super::ActorState<Campaign>,
    team_timezone: ArcSwap<TimeZone>,
    team_allowed_messaging_day_times: ArcSwap<WeeklyRestrictions>,
    email_groups: Arc<EmailGroupService>,
  ) -> Self {
    Self {
      actor_state,
      graph: Arc::default(),
      contacts: iddqd::BiHashMap::new(),
      email_groups,
      team_timezone,
      team_allowed_messaging_day_times,
    }
  }
}

impl Campaign {
  pub async fn save(self, transaction: &mut sqlx::PgConnection) -> Result<Self> {
    self
      .insert(transaction)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        Self::primary_key().unwrap(),
      ))
      .await
      .map_err(Into::into)
  }
  pub fn new(team_id: Id<Team>, name: String) -> Self {
    Self {
      id: Id::new(),
      team_id,
      name,
      active: false,
      allowed_messaging_day_times: None,
      default_email_group: None,
      linkedin_ids: Vec::new(),
    }
  }
  async fn evaluate_contact(
    &mut self,
    contact: Id<Contact>,
    state: &mut CampaignState,
    transaction: &mut sqlx::PgConnection,
  ) -> Result<CampaignContactStatus> {
    let Some(mut contact) = state.contacts.get2_mut(&contact) else {
      return Err(JaniumError::not_found(contact));
    };

    let campaign_contact_start_hash = crate::util::hash(&*contact);

    tracing::trace!(%contact.id, campaign_id = %self.id, "Evaluating contact");

    match contact.status {
      CampaignContactStatus::PendingStartStepError
      | CampaignContactStatus::InProgress
      | CampaignContactStatus::InProgressError
      | CampaignContactStatus::WaitingForContact
      | CampaignContactStatus::Finished => {}
      CampaignContactStatus::PendingStartStep => {
        if contact.step_id == Id::nil() {
          contact.step_id = state.graph.start();
        };
        if state.graph.steps().is_empty() {
          tracing::debug!(?contact, "No steps to execute yet");
          return Ok(contact.status);
        }
        let step = state.graph.steps().get(&contact.step_id).ok_or_else(|| {
          tracing::error!(?contact, ?self, ?state.graph, "Step not found");
          JaniumError::not_found(contact.step_id)
        })?;

        // Check delay_until first
        let now = jiff::Timestamp::now();
        if let Some(delay_until) = contact.delay_until {
          if delay_until.0 > now {
            tracing::debug!(?contact, ?delay_until, "Contact delayed until later");
            return Ok(contact.status);
          }
          // Clear the delay_until if we've passed it
          contact.delay_until = None;
        }

        // Check weekly restrictions (all three levels with AND logic)
        let tz = state.team_timezone.get().as_ref().clone();
        let zoned = now.to_zoned(tz.into());

        let team_restrictions = state.team_allowed_messaging_day_times.get();
        let mut effective_restrictions = if let Some(restrictions) = &self.allowed_messaging_day_times {
          team_restrictions.intersect(restrictions)
        } else {
          team_restrictions.as_ref().clone()
        };
        if let Some(weekly_restrictions) = &step.weekly_restrictions {
          effective_restrictions = effective_restrictions.intersect(weekly_restrictions);
        }

        if !effective_restrictions.is_allowed(&zoned) {
          let effective_restriction = effective_restrictions.restriction_for(&zoned);
          let team_restriction = team_restrictions.restriction_for(&zoned);
          let campaign_restriction = self
            .allowed_messaging_day_times
            .as_ref()
            .and_then(|r| r.restriction_for(&zoned));
          let step_restriction = step
            .weekly_restrictions
            .as_ref()
            .and_then(|r| r.restriction_for(&zoned));
          tracing::debug!(?contact, %zoned, ?effective_restriction, ?team_restriction, ?campaign_restriction, ?step_restriction, "Contact outside restriction window, delaying");
          if let Some(next_allowed) = effective_restrictions.next_allowed_time(&zoned) {
            let max_delay = Timestamp::from(now + 20.minutes());
            contact.delay_until = Some(Timestamp::from(next_allowed.timestamp()).min(max_delay));
            if campaign_contact_start_hash != crate::util::hash(&*contact) {
              contact.clone().save(&mut *transaction).await?;
            }
          }
          return Ok(contact.status);
        }

        match step
          .process(&mut contact, self, &state.email_groups, transaction, &state.actor_state)
          .await
        {
          Ok(()) => {
            contact.status = CampaignContactStatus::InProgress;
            contact.evaluation_attempts += 1;
          }
          Err(error) => {
            tracing::error!(?error, ?contact, "Step processing failed");
            contact.status = CampaignContactStatus::PendingStartStepError;
          }
        }
      }
      CampaignContactStatus::EndStep => {
        let links = state
          .graph
          .graph()
          .edges_directed(contact.step_id, petgraph::Direction::Outgoing);
        let mut next_count = 0;
        let last_action = contact.last_action;
        let tz = state.team_timezone.get().as_ref().clone();
        let event = last_action.0.to_zoned(tz.into());
        let now = jiff::Timestamp::now();
        let mut potential_next_steps = Vec::new();
        for (from, to, link) in links {
          assert_eq!(from, contact.step_id);
          next_count += 1;
          let link = state.graph.links().get(link).ok_or(JaniumError::not_found(*link))?;
          let delay = link.delay;

          let available_at = delay.after(&event);
          if available_at.timestamp() > now && link.filter.evaluate(&contact) {
            potential_next_steps.push((link.priority, to));
          }
        }
        if next_count == 0 {
          // No outgoing links — contact stays in EndStep so that if new steps
          // are added later they can continue automatically.
        } else {
          potential_next_steps.sort_by_key(|(priority, _)| *priority);
          if let Some((_, next_step)) = potential_next_steps.first() {
            contact.step_id = *next_step;
            contact.status = CampaignContactStatus::PendingStartStep;
            contact.evaluation_attempts = 0;
            contact.last_action = jiff::Timestamp::now().into();
            contact.clone().save(&mut *transaction).await?;
          }
        }
      }
    }

    if campaign_contact_start_hash != crate::util::hash(&*contact) {
      contact.clone().save(&mut *transaction).await?;
    }

    Ok(contact.status)
  }
}

impl Actor for Campaign {
  type Id = Id<Campaign>;
  type IdRef = Id<Campaign>;
  type State = CampaignState;
  type StartResult = ();

  fn id_ref(&self) -> &Self::IdRef {
    &self.id
  }

  #[tracing::instrument(skip_all, fields(campaign_id = %self.id))]
  async fn start(&mut self, router: &janium_actors::Router, state: &mut CampaignState) -> janium_actors::DynResult {
    tracing::trace!(id = %self.id, "Loading campaign steps");

    let campaign_steps = CampaignStep::select()
      .where_bind("campaign_id = ?", self.id)
      .fetch_all(&state.actor_state.db)
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to load campaign steps"))?
      .into_iter()
      .map(|c| (c.id, c))
      .collect();

    tracing::trace!(id = %self.id, "Loading campaign links");

    let campaign_links = CampaignStepLink::select()
      .where_bind("campaign_id = ?", self.id)
      .fetch_all(&state.actor_state.db)
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to load campaign steps"))?
      .into_iter()
      .map(|c| (c.id, c))
      .collect();

    state.graph = CampaignGraphVerifier {
      steps: campaign_steps,
      links: campaign_links,
    }
    .validate()?
    .pipe(Arc::new);

    tracing::trace!(id = %self.id, "Loading campaign contacts");

    let campaign_contacts = CampaignContact::select()
      .where_bind("campaign_id = ?", self.id)
      .fetch_all(&state.actor_state.db)
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to load campaign steps"))?
      .into_iter()
      .collect();
    state.contacts = campaign_contacts;

    tracing::debug!(id = %self.id, "Starting campaign actor");

    // Register with all LinkedIn actors
    for linkedin_id in &self.linkedin_ids {
      if let Ok(linkedin_sender) = router.get_handle::<LinkedIn>(linkedin_id) {
        let campaign_sender = router.get_handle::<Campaign>(&self.id)?;
        linkedin_sender
          .into_sync()
          .spawn_notify(super::linkedin::RegisterCampaign {
            sender: campaign_sender,
          });
      }
    }

    Ok(())
  }

  async fn stop(&mut self, router: Router, _state: Self::State) -> janium_actors::DynResult {
    for linkedin_id in &self.linkedin_ids {
      if let Ok(linkedin_sender) = router.get_handle::<LinkedIn>(linkedin_id) {
        linkedin_sender
          .into_sync()
          .spawn_notify(super::linkedin::UnregisterCampaign { campaign_id: self.id });
      }
    }
    Ok(())
  }
}

#[gql::Object(name = "CampaignQuery")]
impl GqlQuery<Campaign> {
  async fn get(&self) -> Option<Campaign> {
    self
      .sender
      .send(super::Query::new(|c: &Campaign, _, _| c.clone()))
      .await
      .ok()
  }
  async fn steps(&self) -> Option<Vec<step::CampaignStep>> {
    self
      .sender
      .send(super::Query::new(|_, _, state: &CampaignState| {
        state.graph.steps().values().cloned().collect()
      }))
      .await
      .ok()
  }
  async fn links(&self) -> Option<Vec<link::CampaignStepLink>> {
    self
      .sender
      .send(super::Query::new(|_, _, state: &CampaignState| {
        state.graph.links().values().cloned().collect()
      }))
      .await
      .ok()
  }
  async fn contacts(&self) -> Option<Vec<contact::CampaignContact>> {
    self
      .sender
      .send(super::Query::new(|_, _, state: &CampaignState| {
        state.contacts.iter().cloned().collect()
      }))
      .await
      .ok()
  }
}

#[gql::Object(name = "CampaignMutation")]
impl GqlMutation<Campaign> {
  async fn modify(&self, changes: MutateCampaign) -> Result<Campaign> {
    self.sender.send(changes).await?
  }
  async fn get(&self) -> Result<Campaign> {
    self
      .sender
      .send(super::Query::new(|c: &Campaign, _, _| c.clone()))
      .await
      .map_err(Into::into)
  }
  async fn add_campaign_contact(&self, contacts: Vec<AddCampaignContact>) -> Result<Vec<CampaignContact>> {
    self.sender.send(contact::AddCampaignContacts { contacts }).await?
  }
  // async fn modify_campaign_contact(
  //   &self,
  //   contact: contact::MutateCampaignContact,
  // ) -> Result<CampaignContact> {
  //   self.sender.send(contact).await.map_err(Into::into)
  // }
  async fn modify_steps(
    &self,
    #[graphql(default_with = "Vec::new()")] step_creations: Vec<CreateCampaignStep>,
    #[graphql(default_with = "Vec::new()")] step_mutations: Vec<MutateCampaignStep>,
    #[graphql(default_with = "Vec::new()")] step_deletions: Vec<Id<CampaignStep>>,
    #[graphql(default_with = "Vec::new()")] link_creations: Vec<CreateCampaignStepLink>,
    #[graphql(default_with = "Vec::new()")] link_mutations: Vec<MutateCampaignStepLink>,
    #[graphql(default_with = "Vec::new()")] link_deletions: Vec<Id<CampaignStepLink>>,
  ) -> Result<GqlQuery<Campaign>> {
    self
      .sender
      .send(BulkModifySteps {
        step_creations,
        step_mutations,
        step_deletions,
        link_creations,
        link_mutations,
        link_deletions,
      })
      .await??;
    Ok(GqlQuery {
      app_state: self.app_state.clone(),
      team: self.team.clone(),
      sender: self.sender.clone(),
    })
  }
}

#[gql::Object]
impl Campaign {
  async fn id(&self) -> &Id<Campaign> {
    &self.id
  }
  async fn team_id(&self) -> &Id<Team> {
    &self.team_id
  }
  async fn name(&self) -> &str {
    &self.name
  }
  async fn active(&self) -> bool {
    self.active
  }
  async fn allowed_messaging_day_times(&self) -> Option<&WeeklyRestrictions> {
    self.allowed_messaging_day_times.as_ref()
  }
  async fn default_email_group(&self) -> Option<Id<EmailGroup>> {
    self.default_email_group
  }
  async fn linkedin_ids(&self) -> &[Id<LinkedIn>] {
    &self.linkedin_ids
  }
}

#[derive(Debug, gql::InputObject, Default)]
pub(crate) struct MutateCampaign {
  name: Option<String>,
  active: Option<bool>,
  default_email_group: OptionPatch<Id<EmailGroup>>,
  allowed_messaging_day_times: OptionPatch<WeeklyRestrictions>,
  linkedin_ids: Option<Vec<Id<LinkedIn>>>,
}

impl Message<Campaign> for MutateCampaign {
  type Return = Result<Campaign>;
  #[tracing::instrument(skip_all, fields(campaign_id = %actor.id))]
  async fn handle(
    self,
    actor: &mut Campaign,
    router: &Router,
    extra_state: &mut <Campaign as Actor>::State,
  ) -> Self::Return {
    let hash = crate::util::hash(&*actor);
    if let Some(name) = self.name {
      actor.name = name;
    }
    if let Some(active) = self.active {
      actor.active = active;
    }
    if let Some(default_email_group) = self.default_email_group.0 {
      actor.default_email_group = default_email_group;
    }
    if let Some(allowed_messaging_day_times) = self.allowed_messaging_day_times.0 {
      if let Some(allowed_messaging_day_times) = &allowed_messaging_day_times {
        allowed_messaging_day_times.validate()?;
      }
      actor.allowed_messaging_day_times = allowed_messaging_day_times;
    }
    if let Some(linkedin_ids) = self.linkedin_ids {
      if linkedin_ids.len() > 1 {
        return Err(JaniumError::ext_msg(
          "Only one LinkedIn ID is allowed for a campaign for now",
        ));
      }
      let old_ids = &actor.linkedin_ids;
      // Unregister from removed LinkedIn actors
      for old_id in old_ids.iter() {
        if !linkedin_ids.contains(old_id)
          && let Ok(linkedin_sender) = router.get_handle::<LinkedIn>(old_id)
        {
          linkedin_sender
            .into_sync()
            .spawn_notify(super::linkedin::UnregisterCampaign { campaign_id: actor.id });
        }
      }
      // Register with new LinkedIn actors
      for new_id in linkedin_ids.iter() {
        if !old_ids.contains(new_id)
          && let Ok(linkedin_sender) = router.get_handle::<LinkedIn>(new_id)
          && let Ok(campaign_sender) = router.get_handle::<Campaign>(&actor.id)
        {
          linkedin_sender
            .into_sync()
            .spawn_notify(super::linkedin::RegisterCampaign {
              sender: campaign_sender,
            });
        }
      }
      actor.linkedin_ids = linkedin_ids;
    }
    if hash != crate::util::hash(&*actor) {
      let mut transaction = extra_state.actor_state.db.begin().await?;
      let clone = actor.clone().save(&mut transaction).await?;
      transaction.commit().await?;
      Ok(clone)
    } else {
      Ok(actor.clone())
    }
  }
}

#[derive(Debug)]
struct BulkModifySteps {
  step_creations: Vec<CreateCampaignStep>,
  step_mutations: Vec<MutateCampaignStep>,
  step_deletions: Vec<Id<CampaignStep>>,
  link_creations: Vec<CreateCampaignStepLink>,
  link_mutations: Vec<MutateCampaignStepLink>,
  link_deletions: Vec<Id<CampaignStepLink>>,
}

impl Message<Campaign> for BulkModifySteps {
  type Return = Result<()>;

  #[tracing::instrument(skip_all, fields(campaign_id = %actor.id))]
  async fn handle(self, actor: &mut Campaign, _: &Router, state: &mut CampaignState) -> Self::Return {
    let mut transaction = state
      .actor_state
      .db
      .begin()
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to start transaction"))?;
    let mut verifier = state.graph.verifier();
    let mut tag_id_map = HashMap::<String, Id<CampaignStep>>::new();
    let mut non_unique_tags = None;
    for step in self.step_creations {
      let step = step
        .into_campaign_step(actor.id, &mut |s| {
          let id = Id::new();
          let existing = tag_id_map.insert(s, id);
          if let Some(existing) = existing {
            non_unique_tags = Some(existing);
          }
          id
        })?
        .save(&mut transaction)
        .await
        .inspect_err(|error| tracing::error!(?error, "Unable to save new campaign step"))?;
      verifier.steps.insert(step.id, step);
    }
    if let Some(non_unique_tags) = non_unique_tags {
      return Err(JaniumError::ext_msg(format!("Duplicate tags: {non_unique_tags}")));
    }
    for mutation in self.step_mutations {
      let step = verifier
        .steps
        .get_mut(&mutation.id)
        .ok_or(JaniumError::not_found(mutation.id))?;
      mutation.mutate(step, &mut transaction).await?;
    }
    for deletion in self.step_deletions {
      let step = verifier.steps.remove(&deletion);
      if let Some(step) = step {
        step.delete(&mut *transaction).await?;
      }
    }
    let tag_id_fn = |s: &str| tag_id_map.get(s).copied();
    for link in self.link_creations {
      let link = link
        .into_campaign_step_link(actor.id, &tag_id_fn)?
        .save(&mut transaction)
        .await?;
      verifier.links.insert(link.id, link.clone());
    }
    for mutation in self.link_mutations {
      let link = verifier
        .links
        .get_mut(&mutation.id)
        .ok_or(JaniumError::not_found(mutation.id))?;
      mutation.mutate(link, &tag_id_fn, &mut transaction).await?;
    }
    for deletion in self.link_deletions {
      let link = verifier.links.remove(&deletion);
      if let Some(link) = link {
        link.delete(&mut *transaction).await?;
      }
    }
    let graph = match verifier.validate() {
      Ok(graph) => Arc::new(graph),
      Err(error) => {
        tracing::error!(?error, "Unable to validate campaign graph");
        transaction.rollback().await.ok();
        return Err(error);
      }
    };
    transaction
      .commit()
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to commit transaction"))?;
    // Only set the graph if the transaction was committed successfully.
    state.graph = graph;
    Ok(())
  }
}

#[derive(Debug)]
pub struct EvaluateCampaign;

impl Message<Campaign> for EvaluateCampaign {
  type Return = Result<()>;

  #[tracing::instrument(skip_all, fields(campaign_id = %actor.id))]
  async fn handle(self, actor: &mut Campaign, router: &Router, state: &mut CampaignState) -> Self::Return {
    if !actor.active || state.graph.steps().is_empty() || state.contacts.is_empty() {
      tracing::trace!(
        actor.active,
        step_count = state.graph.steps().len(),
        contact_count = state.contacts.len(),
        "Campaign is not active or has no steps or contacts"
      );
      return Ok(());
    }

    let now = Timestamp::now();
    let contacts = state
      .contacts
      .iter()
      .filter(|c| {
        matches!(
          c.status,
          // EndStep transitions only — PendingStartStep is now driven by EvaluateLinkedIn
          CampaignContactStatus::EndStep
        )
      })
      .filter(|c| c.delay_until.is_none_or(|d| d <= now))
      .map(|c| c.contact_id)
      .collect::<Vec<_>>();
    let sender = router.get_handle::<Campaign>(&actor.id)?;
    if !contacts.is_empty() {
      // TODO: maybe check out a lock so that we don't end up with more than one task sending to the campaign actor at once.
      tokio::spawn(async move {
        for contact in contacts {
          let result = sender
            .send(EvaluateCampaignContact {
              contact,
              linkedin_id: None,
            })
            .await;
          match result {
            Ok(Ok(status)) => {
              // For now just break if one contact gets to in progress so that we don't end up with a bunch of backoffs that needs to be handed back.
              // TODO: re-evaluate this once we have more than just linkedin actions that need to be handled.
              if matches!(status, CampaignContactStatus::InProgress) {
                tracing::debug!(contact_id = ?contact, "in progress, breaking");
                break;
              }
            }
            Ok(Err(error)) => {
              tracing::error!(?error, "Unable to evaluate contact");
            }
            Err(error) => {
              tracing::error!(?error, "Unable to send evaluate campaign message");
            }
          }
        }
      });
    }
    Ok(())
  }
}

pub struct EvaluateCampaignContact {
  pub contact: Id<Contact>,
  pub linkedin_id: Option<Id<LinkedIn>>,
}

impl Message<Campaign> for EvaluateCampaignContact {
  type Return = Result<CampaignContactStatus>;

  #[tracing::instrument(skip_all, fields(campaign_id = %actor.id, contact_id = %self.contact))]
  async fn handle(self, actor: &mut Campaign, router: &Router, state: &mut CampaignState) -> Self::Return {
    let mut transaction = state.actor_state.db.begin().await?;
    let result = actor.evaluate_contact(self.contact, state, &mut transaction).await;
    match result {
      // TODO: if this commit fails, we need to load everything back from the db to ensure consistency or just kill the entire app and start again
      Ok(status) => {
        transaction.commit().await?;
        Ok(status)
      }
      Err(error) => {
        transaction.rollback().await.ok();
        // Notify the LinkedIn actor so it can reschedule immediately
        if let Some(linkedin_id) = self.linkedin_id
          && let Ok(linkedin) = router.get_handle::<LinkedIn>(&linkedin_id)
        {
          linkedin
            .into_sync()
            .spawn_notify(super::linkedin::EvaluateCampaignContactFailed {
              campaign_id: actor.id,
              contact_id: self.contact,
            });
        }
        Err(error)
      }
    }
  }
}

/// Sent by LinkedIn actor to campaign. Campaign responds with CandidateResponse to LinkedIn.
pub struct GetBestCandidate {
  pub linkedin_id: Id<LinkedIn>,
  pub evaluation_id: u64,
}

impl Message<Campaign> for GetBestCandidate {
  type Return = ();

  #[tracing::instrument(skip_all, fields(campaign_id = %actor.id, linkedin_id = %self.linkedin_id))]
  async fn handle(self, actor: &mut Campaign, router: &Router, state: &mut CampaignState) {
    let response = self.find_best_candidate(actor, state).await;
    let campaign_id = actor.id;

    if let Ok(sender) = router.get_handle::<LinkedIn>(&self.linkedin_id) {
      sender.into_sync().spawn_notify(super::linkedin::CandidateResponse {
        evaluation_id: self.evaluation_id,
        campaign_id,
        candidate: response,
      });
    }
  }
}

impl GetBestCandidate {
  pub(crate) async fn find_best_candidate(
    &self,
    actor: &Campaign,
    state: &CampaignState,
  ) -> Option<super::linkedin::Candidate> {
    if !actor.active || state.graph.steps().is_empty() || state.contacts.is_empty() {
      return None;
    }

    let now = jiff::Timestamp::now();
    let tz = state.team_timezone.get().as_ref().clone();
    let zoned = now.to_zoned(tz.into());

    // Build effective restrictions (team AND campaign)
    let team_restrictions = state.team_allowed_messaging_day_times.get();
    let campaign_restrictions = if let Some(restrictions) = &actor.allowed_messaging_day_times {
      team_restrictions.intersect(restrictions)
    } else {
      team_restrictions.as_ref().clone()
    };

    // Collect eligible contacts with their step priority
    let mut candidates: Vec<(Id<Contact>, i16)> = Vec::new();

    for contact in state.contacts.iter() {
      if contact.status != CampaignContactStatus::PendingStartStep {
        continue;
      }
      if contact.delay_until.is_some_and(|d| d.0 > now) {
        continue;
      }
      let step_id = if contact.step_id == Id::nil() {
        state.graph.start()
      } else {
        contact.step_id
      };
      let Some(step) = state.graph.steps().get(&step_id) else {
        continue;
      };

      // Check step-level restrictions too
      let mut effective = campaign_restrictions.clone();
      if let Some(weekly_restrictions) = &step.weekly_restrictions {
        effective = effective.intersect(weekly_restrictions);
      }
      if !effective.is_allowed(&zoned) {
        continue;
      }

      candidates.push((contact.contact_id, step.priority));
    }

    // Sort by priority (lower = higher priority)
    let salt = Id::<()>::new();
    candidates.sort_by(|(id_a, pri_a), (id_b, pri_b)| {
      pri_a.cmp(pri_b).then_with(|| {
        let hash_a = crate::util::hash((id_a, &salt));
        let hash_b = crate::util::hash((id_b, &salt));
        hash_a.cmp(&hash_b)
      })
    });

    candidates
      .first()
      .map(|(contact_id, step_priority)| super::linkedin::Candidate {
        contact_id: *contact_id,
        step_priority: *step_priority,
      })
  }
}

impl Message<Campaign> for LinkedInActionResponse {
  type Return = Result<()>;

  #[tracing::instrument(skip_all, fields(
    campaign_id = %self.campaign_id.unwrap_or_default(),
    campaign_step_id = %self.campaign_step_id.unwrap_or_default(),
    contact_id = %self.contact_id.unwrap_or_default(),
    linkedin_id = %self.linkedin_id,
    action_id = %self.id,
    team_id = %self.team_id,
  ))]
  async fn handle(self, _actor: &mut Campaign, _: &Router, state: &mut CampaignState) -> Self::Return {
    tracing::trace!(linkedin_action_response = ?self, "Handling LinkedIn action response");
    let (Some(contact_id), Some(step_id)) = (self.contact_id, self.campaign_step_id) else {
      // No contact or step - just clean up the action request
      let mut conn = state.actor_state.db.acquire().await?;
      LinkedInActionRequest::remove(self.id, &mut conn).await?;
      tracing::warn!(action_id = ?self.id, "LinkedIn action response has no contact or step");
      return Ok(());
    };

    let Some(mut contact) = state.contacts.get2_mut(&contact_id) else {
      // Contact not found in campaign - clean up and log
      let mut conn = state.actor_state.db.acquire().await?;
      LinkedInActionRequest::remove(self.id, &mut conn).await?;
      tracing::warn!(
        action_id = ?self.id,
        ?contact_id,
        "LinkedIn action response for contact not found in campaign"
      );
      return Ok(());
    };

    let Some(step) = state.graph.steps().get(&step_id) else {
      // Step not found - clean up and log
      let mut conn = state.actor_state.db.acquire().await?;
      LinkedInActionRequest::remove(self.id, &mut conn).await?;
      tracing::warn!(
        action_id = ?self.id,
        ?step_id,
        "LinkedIn action response for step not found in campaign"
      );
      return Ok(());
    };

    // Handle step mismatch gracefully - contact may have been moved manually
    if contact.step_id != step.id {
      let mut conn = state.actor_state.db.acquire().await?;
      LinkedInActionRequest::remove(self.id, &mut conn).await?;
      tracing::warn!(
        action_id = ?self.id,
        contact_step = ?contact.step_id,
        response_step = ?step.id,
        "LinkedIn action response step mismatch - contact may have been moved"
      );
      return Ok(());
    };

    // Handle unexpected contact states gracefully
    // let expected_in_progress = matches!(contact.status, CampaignContactStatus::InProgress);
    // if !expected_in_progress {
    //   tracing::warn!(
    //     action_id = ?self.id,
    //     contact_status = ?contact.status,
    //     result = ?self.result,
    //     "LinkedIn action response for contact not in InProgress state"
    //   );
    //   // For failures/expired, we might still want to update delay_until
    //   // For success in non-InProgress state, just clean up
    //   if matches!(self.result, LinkedInActionRequestResult::Success) {
    //     let mut conn = state.actor_state.db.acquire().await?;
    //     LinkedInActionRequest::remove(self.id, &mut conn).await?;
    //     return Ok(());
    //   }
    // }

    let contact_hash = crate::util::hash(&*contact);
    let max_delay = Timestamp::now() + 20.minutes();

    match (&self.result, contact.status) {
      // These two states are end states and we don't want to move backward
      (_, CampaignContactStatus::EndStep | CampaignContactStatus::Finished) => {
        tracing::warn!(
          action_id = ?self.id,
          contact_status = ?contact.status,
          result = ?self.result,
          "LinkedIn action response for contact in unexpected state"
        );
        return Ok(());
      }
      // TODO: handle already completed separately so that we can branch on it in links
      (LinkedInActionRequestResult::Success | LinkedInActionRequestResult::AlreadyCompleted, _) => {
        contact.status = step.step_data.next_step_after_in_progress();
        contact.last_action = self.attempt_ended;
        contact.delay_until = None;
        contact.evaluation_attempts = 0;
      }
      (LinkedInActionRequestResult::ContactResponded, _) => {
        contact.status = CampaignContactStatus::Finished;
        contact.last_action = self.attempt_ended;
        contact.delay_until = None;
        contact.evaluation_attempts = 0;
      }
      (LinkedInActionRequestResult::Failed(error), _) => {
        tracing::error!(?error, ?contact, ?step, "LinkedIn action failed");
        contact.status = CampaignContactStatus::InProgressError;
        contact.last_action = self.attempt_ended;
        contact.delay_until = self.next_attempt_at.map(|t| t.min(max_delay));
      }
      (LinkedInActionRequestResult::Expired, _) => {
        const MAX_STEP_EVALUATION_ATTEMPTS: i16 = 3;
        if contact.evaluation_attempts >= MAX_STEP_EVALUATION_ATTEMPTS {
          tracing::error!(
            ?contact,
            ?step,
            evaluation_attempts = contact.evaluation_attempts,
            "Contact exceeded max evaluation attempts for current step, moving to error state"
          );
          contact.status = CampaignContactStatus::PendingStartStepError;
        } else {
          contact.status = CampaignContactStatus::PendingStartStep;
        }
        contact.delay_until = self.next_attempt_at.map(|t| t.min(max_delay));
      }
      (LinkedInActionRequestResult::NotStarted, _) => {
        // NotStarted is transient (restriction check failed) — always retry, don't count toward max attempts
        contact.status = CampaignContactStatus::PendingStartStep;
        contact.delay_until = self.next_attempt_at.map(|t| t.min(max_delay));
      }
      (LinkedInActionRequestResult::EmailVerificationRequired, _) => {
        tracing::info!(
          ?contact,
          ?step,
          "LinkedIn connection requires email verification - skipping"
        );
        contact.status = CampaignContactStatus::InProgressError;
        contact.last_action = self.attempt_ended;
      }
    }
    let mut transaction = state.actor_state.db.begin().await?;
    if contact_hash != crate::util::hash(&*contact) {
      contact.clone().save(&mut transaction).await?;
    }
    LinkedInActionRequest::remove(self.id, &mut transaction).await?;
    transaction.commit().await?;
    Ok(())
  }
}
