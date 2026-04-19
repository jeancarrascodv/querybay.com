use crate::campaign::step::CampaignStepData;
use crate::prelude::*;

/// Message sent when a new LinkedIn connection is detected.
/// This notifies the campaign actor to transition contacts from WaitingForContact to EndStep.
#[derive(Debug, Clone)]
pub struct ConnectionEstablished {
  pub linkedin_id: Id<LinkedIn>,
  pub contact_ids: Vec<Id<Contact>>,
}

impl Message<super::Campaign> for ConnectionEstablished {
  type Return = Result<()>;

  #[tracing::instrument(skip_all, fields(campaign_id = %_actor.id, linkedin_id = %self.linkedin_id))]
  async fn handle(
    self,
    _actor: &mut super::Campaign,
    _router: &janium_actors::Router,
    state: &mut <super::Campaign as janium_actors::Actor>::State,
  ) -> Self::Return {
    let mut changed_contacts = Vec::new();
    for contact_id in self.contact_ids {
      let Some(campaign_contact) = state.contacts.get2_mut(&contact_id) else {
        continue; // Contact not in this campaign
      };
      if campaign_contact.linkedin_id != Some(self.linkedin_id) {
        continue;
      }
      let Some(step) = state.graph.steps().get(&campaign_contact.step_id) else {
        continue;
      };
      if !matches!(step.step_data, CampaignStepData::SendLinkedInConnectionRequest(_)) {
        continue;
      }

      tracing::info!(
        contact_id = %contact_id,
        linkedin_id = %self.linkedin_id,
        "Connection established - transitioning contact to EndStep"
      );

      let mut new_campaign_contact = campaign_contact.clone();

      new_campaign_contact.status = CampaignContactStatus::EndStep;
      new_campaign_contact.last_action = Timestamp::now();
      new_campaign_contact.delay_until = None;
      changed_contacts.push(new_campaign_contact);
    }

    // Save to database
    let mut conn = state.actor_state.db.acquire().await?;
    for campaign_contact in changed_contacts {
      let campaign_id = campaign_contact.campaign_id;
      let contact_id = campaign_contact.contact_id;
      let campaign_contact = campaign_contact.save(&mut conn).await?;
      let removed = state.contacts.insert_overwrite(campaign_contact);
      if !removed.is_empty() {
        tracing::error!(campaign_id = %campaign_id, contact_id = %contact_id, "Campaign contact is already in campaign");
      }
    }
    Ok(())
  }
}

/// Message sent when a contact is merged into another.
/// This notifies the campaign actor to update its in-memory BiHashMap
/// to reflect the new contact_id.
#[derive(Debug, Clone)]
pub struct ContactMerged {
  pub old_contact_id: Id<Contact>,
  pub new_contact_id: Id<Contact>,
}

impl Message<super::Campaign> for ContactMerged {
  type Return = ();

  #[tracing::instrument(skip_all, fields(campaign_id = %_actor.id, contact_id = %self.new_contact_id))]
  async fn handle(
    self,
    _actor: &mut super::Campaign,
    _router: &janium_actors::Router,
    state: &mut <super::Campaign as janium_actors::Actor>::State,
  ) -> Self::Return {
    // Remove by old contact_id (K2 lookup in BiHashMap)
    let Some(mut campaign_contact) = state.contacts.remove2(&self.old_contact_id) else {
      return; // Contact not found (shouldn't happen, but be safe)
    };

    tracing::info!(
      old = %self.old_contact_id,
      new = %self.new_contact_id,
      "Updating campaign contact reference after merge"
    );

    // Check if new contact already exists (both were in same campaign)
    if state.contacts.contains_key2(&self.new_contact_id) {
      return; // DB already handled this - don't re-add
    }

    // Update contact_id and re-insert
    campaign_contact.contact_id = self.new_contact_id;
    state.contacts.insert_unique(campaign_contact).ok();
  }
}

#[derive(Debug, Clone, ormlite::Model, Hash, Eq, PartialEq)]
#[ormlite(table = "campaign_contact")]
pub struct CampaignContact {
  #[ormlite(primary_key)]
  pub id: Id<CampaignContact>,
  pub campaign_id: Id<Campaign>,
  pub contact_id: Id<Contact>,
  pub step_id: Id<CampaignStep>,
  pub status: CampaignContactStatus,
  pub extra_data: Option<ExtraData>,
  pub last_action: Timestamp,
  pub delay_until: Option<Timestamp>,
  pub linkedin_id: Option<Id<LinkedIn>>,
  pub evaluation_attempts: i16,
}

/// Contacts are never in a status where they are waiting on a link. Link traversals happen instantly. The step after a link traversal may be backed up due to limits, but will definitely be the next step that is executed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, sqlx::Type, gql::Enum)]
#[repr(i16)]
pub enum CampaignContactStatus {
  /// Contacts are only pending start before the step is completed due to some constraint limits like the number of messages sent per day
  PendingStartStep = 1,
  /// When the contact has failed to start a step (due to missing template data, bad email address, etc.), and something needs to be fixed before it can continue
  PendingStartStepError = -1,
  /// When any step is currently being executed (can take from milliseconds to several minutes)
  InProgress = 2,
  /// When the contact has failed to complete a step (due to missing template data, bad email address, etc.), and something needs to be fixed before it can continue
  InProgressError = -2,
  /// When any step has finished, because we don't necessarily know what the next step will be yet
  EndStep = 3,
  /// When the step is waiting for the contact to do something (like accept a connection request)
  WaitingForContact = 4,
  /// When the last step has finished and there are no more steps to execute
  Finished = i16::MAX,
}

impl CampaignContactStatus {
  pub fn can_restart(&self) -> bool {
    matches!(*self, Self::InProgress | Self::EndStep)
  }
}

impl CampaignContact {
  pub async fn save(self, transaction: &mut sqlx::PgConnection) -> Result<Self> {
    self
      .insert(transaction)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        Self::primary_key().unwrap(),
      ))
      .await
      .map_err(Into::into)
  }
  pub async fn template_data(
    &self,
    app_state: &crate::AppState,
  ) -> Result<std::collections::HashMap<liquid::model::KStringRef<'_>, liquid::model::Value>> {
    let mut map = std::collections::HashMap::with_capacity(16);
    let Some(contact) = app_state.contact_service.get(&self.contact_id).await? else {
      return Err(JaniumError::not_found(self.contact_id));
    };

    contact
      .template_data(app_state, &mut |s, v| {
        map.insert(liquid::model::KStringRef::from_static(s), v);
      })
      .await?;
    if let Some(extra_data) = &self.extra_data {
      for (key, value) in extra_data.data.iter() {
        map.insert(liquid::model::KStringRef::from_ref(key), value_map(value));
      }
    }
    Ok(map)
  }
}

fn value_map(json: &serde_json::Value) -> liquid::model::Value {
  match json {
    serde_json::Value::Null => liquid::model::Value::Nil,
    serde_json::Value::Bool(b) => liquid::model::Value::scalar(*b),
    serde_json::Value::Number(n) => {
      if let Some(i) = n.as_i64() {
        liquid::model::Value::scalar(i)
      } else {
        liquid::model::Value::scalar(n.as_f64().unwrap())
      }
    }
    serde_json::Value::String(s) => liquid::model::Value::scalar(s.clone()),
    serde_json::Value::Array(a) => liquid::model::Value::array(a.iter().map(value_map)),
    serde_json::Value::Object(o) => {
      let mut map = std::collections::HashMap::with_capacity(o.len());
      for (k, v) in o.iter() {
        map.insert(k.clone(), value_map(v));
      }
      liquid::model::Value::Object(liquid::model::Object::from_iter(
        map.into_iter().map(|(k, v)| (liquid::model::KString::from(k), v)),
      ))
    }
  }
}

impl iddqd::BiHashItem for CampaignContact {
  type K1<'a> = Id<Self>;
  type K2<'a> = Id<Contact>;

  fn key1(&self) -> Id<Self> {
    self.id
  }
  fn key2(&self) -> Id<Contact> {
    self.contact_id
  }
  iddqd::bi_upcast! {}
}

#[gql::Object]
impl CampaignContact {
  pub async fn id(&self) -> Id<Self> {
    self.id
  }
  pub async fn contact_id(&self) -> Id<Contact> {
    self.contact_id
  }
  pub async fn step_id(&self) -> Id<CampaignStep> {
    self.step_id
  }
  pub async fn status(&self) -> CampaignContactStatus {
    self.status
  }
  pub async fn extra_data(&self) -> Option<&ExtraData> {
    self.extra_data.as_ref()
  }
  pub async fn last_action(&self) -> Timestamp {
    self.last_action
  }
  pub async fn contact(&self, ctx: &gql::Context<'_>) -> Result<Option<Arc<Contact>>> {
    let app_state = ctx.data_unchecked::<crate::AppState>();
    app_state.contact_service.get(&self.contact_id).await
  }
  #[graphql(name = "templateData")]
  pub async fn gql_template_data(
    &self,
    ctx: &gql::Context<'_>,
  ) -> Result<std::collections::HashMap<liquid::model::KStringRef<'_>, liquid::model::Value>> {
    let app_state = ctx.data_unchecked::<crate::AppState>();
    let data = self.template_data(app_state).await?;
    Ok(data)
  }
}

#[derive(Debug, Clone, gql::InputObject)]
pub struct AddCampaignContact {
  pub contact_id: Id<Contact>,
  pub extra_data: Option<ExtraData>,
}

#[derive(Debug, Clone)]
pub struct AddCampaignContacts {
  pub contacts: Vec<AddCampaignContact>,
}

impl Message<super::Campaign> for AddCampaignContacts {
  type Return = Result<Vec<CampaignContact>>;

  #[tracing::instrument(skip_all, fields(campaign_id = %actor.id))]
  async fn handle(
    self,
    actor: &mut super::Campaign,
    _router: &janium_actors::Router,
    state: &mut <super::Campaign as janium_actors::Actor>::State,
  ) -> Self::Return {
    for add_cc in &self.contacts {
      let contact = state
        .actor_state
        .contact_service
        .get(&add_cc.contact_id)
        .await
        .inspect_err(|error| tracing::error!(?error, "Unable to get contact"))?;
      if contact.is_none() {
        return Err(JaniumError::ext_msg(format!(
          "Contact with id `{}` cannot be found",
          add_cc.contact_id
        )));
      }
    }
    let mut transaction = state
      .actor_state
      .db
      .begin()
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to begin transaction"))?;
    let mut ret = Vec::with_capacity(self.contacts.len());
    for add_cc in self.contacts {
      let cc = CampaignContact {
        id: Id::new(),
        campaign_id: actor.id,
        contact_id: add_cc.contact_id,
        step_id: Id::nil(),
        status: CampaignContactStatus::PendingStartStep,
        extra_data: add_cc.extra_data,
        last_action: jiff::Timestamp::now().into(),
        delay_until: None,
        linkedin_id: None,
        evaluation_attempts: 0,
      };
      let cc = cc
        .save(&mut transaction)
        .await
        .inspect_err(|error| tracing::error!(?error, "Unable to save campaign contact"))?;
      state
        .contacts
        .insert_unique(cc.clone())
        .map_err(|e| JaniumError::msg(format!("Contact {} is already in campaign", e.new_item().contact_id)))?;
      ret.push(cc);
    }
    transaction
      .commit()
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to commit transaction"))?;
    // TODO: add to a queue somehow
    Ok(ret)
  }
}
