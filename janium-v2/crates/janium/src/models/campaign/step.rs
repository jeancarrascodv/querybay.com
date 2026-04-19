use super::CampaignContactStatus;
use crate::prelude::*;
use crate::util::OptionPatch;
use crate::{templates::Template, ui::Ui};
use futures::StreamExt;
use jiff::ToSpan;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Hash, Clone, Debug, ormlite::Model, gql::SimpleObject)]
#[graphql(complex)]
#[ormlite(table = "campaign_step")]
pub struct CampaignStep {
  #[ormlite(primary_key)]
  pub id: Id<CampaignStep>,
  pub campaign_id: Id<Campaign>,
  pub enabled: bool,
  // lower is higher
  pub priority: i16,
  pub step_data: CampaignStepData,
  pub weekly_restrictions: Option<WeeklyRestrictions>,
  // pub active: bool,
  pub ui: Option<Ui>,
}

#[gql::ComplexObject]
impl CampaignStep {
  pub async fn render(
    &self,
    context: &gql::Context<'_>,
    campaign_contact_ids: Option<Vec<Id<super::CampaignContact>>>,
    template: Template,
  ) -> Result<Vec<Option<String>>> {
    if campaign_contact_ids.as_ref().is_some_and(|ids| ids.is_empty()) {
      return Ok(vec![]);
    }

    let app_state = context.data_unchecked::<AppState>();
    let campaign = app_state.router.get_handle::<super::Campaign>(&self.campaign_id)?;
    let campaign_contacts = campaign
      .send(super::Query::new(move |_, _, state: &super::CampaignState| {
        if let Some(campaign_contact_ids) = campaign_contact_ids {
          campaign_contact_ids
            .iter()
            .flat_map(|id| state.contacts.get1(id))
            .cloned()
            .collect::<Vec<_>>()
        } else {
          state.contacts.iter().cloned().collect::<Vec<_>>()
        }
      }))
      .await?;
    let template_data = campaign_contacts
      .iter()
      .map(|campaign_contact| async { campaign_contact.template_data(app_state).await })
      .collect::<futures::stream::FuturesOrdered<_>>()
      .collect::<Vec<_>>()
      .await;

    let rendered = template_data
      .into_iter()
      .map(|r| r.and_then(|t| template.render(&t)))
      .collect::<Vec<_>>();

    if rendered.len() == 1 {
      Ok(vec![Some(rendered.into_iter().next().unwrap()?)])
    } else {
      let ignored = rendered.into_iter().map(|r| r.ok()).collect::<Vec<_>>();
      Ok(ignored)
    }
  }
}

impl CampaignStep {
  pub async fn save(self, transaction: &mut sqlx::PgConnection) -> Result<Self> {
    self
      .insert(transaction)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        Self::primary_key().unwrap(),
      ))
      .await
      .map_err(Into::into)
  }
}

#[derive(Debug, Clone, gql::InputObject)]
pub struct MutateCampaignStep {
  pub id: Id<CampaignStep>,
  pub step_data: Option<CampaignStepData>,
  pub enabled: Option<bool>,
  /// If not provided, will default to the lowest priority
  pub priority: Option<i16>,
  /// If not provided, will default to allowing all times
  pub weekly_restrictions: OptionPatch<WeeklyRestrictions>,
  pub ui: Option<Option<Ui>>,
}

impl MutateCampaignStep {
  pub async fn mutate(self, step: &mut CampaignStep, transaction: &mut sqlx::PgConnection) -> Result<()> {
    let start_hash = crate::util::hash(&*step);
    if let Some(step_data) = self.step_data {
      step.step_data = step_data;
    }
    if let Some(enabled) = self.enabled {
      step.enabled = enabled;
    }
    if let Some(priority) = self.priority {
      step.priority = priority;
    }
    if let Some(weekly_restrictions) = self.weekly_restrictions.0 {
      step.weekly_restrictions = weekly_restrictions;
    }
    if let Some(ui) = self.ui {
      step.ui = ui;
    }
    if start_hash != crate::util::hash(&*step) {
      step.clone().save(transaction).await?;
    }
    Ok(())
  }
}

#[derive(Debug, gql::InputObject)]
pub struct CreateCampaignStep {
  pub id: String,
  pub step_data: CampaignStepData,
  pub enabled: Option<bool>,
  /// If not provided, will default to the lowest priority
  pub priority: Option<i16>,
  /// If not provided, will default to allowing all times
  pub weekly_restrictions: Option<WeeklyRestrictions>,
  pub ui: Option<Ui>,
}

impl CreateCampaignStep {
  pub fn into_campaign_step(
    self,
    campaign_id: Id<Campaign>,
    tag_id_fn: &mut dyn FnMut(String) -> Id<CampaignStep>,
  ) -> Result<CampaignStep> {
    if let Some(weekly_restrictions) = &self.weekly_restrictions {
      weekly_restrictions.validate()?;
    }
    Ok(CampaignStep {
      id: tag_id_fn(self.id),
      campaign_id,
      enabled: self.enabled.unwrap_or(true),
      step_data: self.step_data,
      priority: self.priority.unwrap_or(i16::MAX),
      weekly_restrictions: self.weekly_restrictions,
      ui: self.ui,
    })
  }
}

#[derive(Clone, Debug, Hash, Serialize, Deserialize, gql::OneofObject, gql::Union)]
#[serde(rename_all = "snake_case")]
#[repr(u8)]
#[graphql(input_name = "CampaignStepDataInput")]
#[allow(clippy::enum_variant_names)]
pub enum CampaignStepData {
  SendEmail(SendEmail),
  SendLinkedInMessage(SendLinkedInMessage),
  SendLinkedInConnectionRequest(SendLinkedInConnectionRequest),
}

impl CampaignStepData {
  pub fn next_step_after_in_progress(&self) -> CampaignContactStatus {
    match self {
      Self::SendEmail(_) => CampaignContactStatus::EndStep,
      Self::SendLinkedInMessage(_) => CampaignContactStatus::EndStep,
      Self::SendLinkedInConnectionRequest(_) => CampaignContactStatus::WaitingForContact,
    }
  }
}

impl sqlx::Type<sqlx::Postgres> for CampaignStepData {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <sqlx::types::Json<CampaignStepData> as sqlx::Type<sqlx::Postgres>>::type_info()
  }
  fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
    <sqlx::types::Json<CampaignStepData> as sqlx::Type<sqlx::Postgres>>::compatible(ty)
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for CampaignStepData {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    sqlx::types::Json::encode_by_ref(&sqlx::types::Json(crate::types::IdReverser(self)), buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for CampaignStepData {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    sqlx::types::Json::<crate::types::IdReverser<Self>>::decode(value).map(|i| i.0.0)
  }
}

impl CampaignStep {
  pub async fn process(
    &self,
    campaign_contact: &mut super::CampaignContact,
    campaign: &super::Campaign,
    email_groups: &crate::models::email::EmailGroupService,
    _transaction: &mut sqlx::PgConnection,
    app_state: &AppState,
  ) -> Result<()> {
    tracing::trace!(%campaign_contact.id, %campaign.id, step_id = %self.id, "Processing step");
    match &self.step_data {
      CampaignStepData::SendEmail(email) => {
        email
          .process(campaign_contact, self, campaign, email_groups, app_state)
          .await
      }
      CampaignStepData::SendLinkedInMessage(message) => message.process(campaign_contact, campaign, app_state).await,
      CampaignStepData::SendLinkedInConnectionRequest(request) => {
        request.process(campaign_contact, campaign, app_state).await
      }
    }
  }
}

#[derive(Clone, Debug, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "SendEmailInput")]
pub struct SendEmail {
  pub subject: Template,
  pub body: Template,
  pub from: Option<Id<EmailGroup>>,
  pub reply_to_previous: bool,
}

impl SendEmail {
  pub async fn process(
    &self,
    campaign_contact: &mut super::CampaignContact,
    step: &CampaignStep,
    campaign: &super::Campaign,
    email_groups: &crate::models::email::EmailGroupService,
    app_state: &AppState,
  ) -> Result<()> {
    let values = campaign_contact.template_data(app_state).await?;
    let _subject = self.subject.render(&values)?;
    let _body = self.body.render(&values)?;
    let Some(contact) = app_state.contact_service.get(&campaign_contact.contact_id).await? else {
      return Err(crate::JaniumError::msg(format!(
        "Contact {} not found for step {} in campaign {}",
        campaign_contact.contact_id, step.id, campaign.id,
      )));
    };
    let Some(group) = self.from.or(campaign.default_email_group) else {
      return Err(crate::JaniumError::msg(format!(
        "No email group selected for step {} in campaign {}",
        step.id, campaign.id,
      )));
    };
    let Some(group) = email_groups.get(&group).await? else {
      return Err(crate::JaniumError::msg(format!(
        "Email group {} not found for step {} in campaign {}",
        group, step.id, campaign.id,
      )));
    };
    if group.emails.is_empty() {
      return Err(crate::JaniumError::msg(format!(
        "Email group {} is empty for step {} in campaign {}",
        group.id, step.id, campaign.id,
      )));
    }
    // TODO: actually select a random email from the group
    let _from = group.emails.first_key_value().map(|(k, _)| k).unwrap();
    let Some(_to) = contact.emails.first() else {
      return Err(crate::JaniumError::msg(format!(
        "No email found for contact {} for step {} in campaign {}",
        campaign_contact.contact_id, step.id, campaign.id,
      )));
    };
    // TODO: send the email once email sending is implemented

    Ok(())
  }
}

#[derive(Clone, Debug, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "SendLinkedInMessageInput")]
pub struct SendLinkedInMessage {
  pub linkedin_message: Template,
}

impl SendLinkedInMessage {
  pub async fn process(
    &self,
    campaign_contact: &mut super::CampaignContact,
    campaign: &super::Campaign,
    app_state: &AppState,
  ) -> Result<()> {
    if campaign_contact.linkedin_id.is_none() {
      campaign_contact.linkedin_id = campaign.linkedin_ids.first().cloned();
    }
    let Some(linkedin_id) = campaign_contact.linkedin_id else {
      return Err(crate::JaniumError::msg(format!(
        "No LinkedIn ID found for contact {} for step {} in campaign {}",
        campaign_contact.contact_id, campaign_contact.step_id, campaign.id,
      )));
    };
    let values = campaign_contact.template_data(app_state).await?;
    let message = self.linkedin_message.render(&values)?;

    // Check for duplicate pending action before queueing
    let has_pending = LinkedInActionRequest::has_pending_action_for_contact(
      linkedin_id,
      campaign_contact.contact_id,
      LinkedInActionType::SendMessage,
      &mut *app_state.db.acquire().await?,
    )
    .await?;
    if has_pending {
      tracing::warn!(
        ?linkedin_id,
        contact_id = ?campaign_contact.contact_id,
        step_id = ?campaign_contact.step_id,
        campaign_id = ?campaign.id,
        "Skipping duplicate send message - action already pending for this contact"
      );
      return Ok(());
    }

    let contact = app_state.contact_service.get(&campaign_contact.contact_id).await?;
    let Some(contact) = contact else {
      return Err(crate::JaniumError::msg(format!(
        "Contact {} not found for step {} in campaign {}",
        campaign_contact.contact_id, campaign_contact.step_id, campaign.id,
      )));
    };
    let contact_name = contact
      .inner
      .full_name
      .clone()
      .unwrap_or_else(|| format!("Contact {}", campaign_contact.contact_id));

    let linkedin_sender = app_state.router.get_handle::<LinkedIn>(&linkedin_id)?;
    linkedin_sender
      .notify(LinkedInActionRequest::new(
        LinkedInAction::SendMessage(SendMessage {
          contact_id: campaign_contact.contact_id,
          contact_name,
          message_content: message,
          skip_response_check: false,
        }),
        campaign.team_id,
        linkedin_id,
        Some(campaign.id),
        Some(campaign_contact.step_id),
        Some(campaign_contact.contact_id),
        Timestamp::now() + 20.minutes(),
        None,
      ))
      .await?;
    Ok(())
  }
}

#[derive(Clone, Debug, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "SendLinkedInConnectionRequestInput")]
pub struct SendLinkedInConnectionRequest {
  pub connection_request_message: Template,
}

impl SendLinkedInConnectionRequest {
  pub async fn process(
    &self,
    campaign_contact: &mut super::CampaignContact,
    campaign: &super::Campaign,
    app_state: &AppState,
  ) -> Result<()> {
    if campaign_contact.linkedin_id.is_none() {
      campaign_contact.linkedin_id = campaign.linkedin_ids.first().cloned();
    }
    let Some(linkedin_id) = campaign_contact.linkedin_id else {
      return Err(crate::JaniumError::msg(format!(
        "No LinkedIn ID found for contact {} for step {} in campaign {}",
        campaign_contact.contact_id, campaign_contact.step_id, campaign.id,
      )));
    };
    let values = campaign_contact.template_data(app_state).await?;
    let message = self.connection_request_message.render(&values)?;

    // Validate message length before queueing - LinkedIn has a 300 character limit
    const MAX_CONNECTION_REQUEST_MESSAGE_LENGTH: usize = 300;
    if message.len() > MAX_CONNECTION_REQUEST_MESSAGE_LENGTH {
      return Err(crate::JaniumError::msg(format!(
        "Connection request message is too long ({} chars). Max {} characters allowed. \
         Contact: {}, Step: {}, Campaign: {}",
        message.len(),
        MAX_CONNECTION_REQUEST_MESSAGE_LENGTH,
        campaign_contact.contact_id,
        campaign_contact.step_id,
        campaign.id,
      )));
    }

    // Check for duplicate pending action before queueing
    let has_pending = LinkedInActionRequest::has_pending_action_for_contact(
      linkedin_id,
      campaign_contact.contact_id,
      LinkedInActionType::SendConnectionRequest,
      &mut *app_state.db.acquire().await?,
    )
    .await?;
    if has_pending {
      tracing::warn!(
        ?linkedin_id,
        contact_id = ?campaign_contact.contact_id,
        step_id = ?campaign_contact.step_id,
        campaign_id = ?campaign.id,
        "Skipping duplicate connection request - action already pending for this contact"
      );
      return Ok(());
    }

    let linkedin_sender = app_state.router.get_handle::<LinkedIn>(&linkedin_id)?;
    let contact = app_state.contact_service.get(&campaign_contact.contact_id).await?;
    let Some(contact) = contact else {
      return Err(crate::JaniumError::msg(format!(
        "Contact {} not found for step {} in campaign {}",
        campaign_contact.contact_id, campaign_contact.step_id, campaign.id,
      )));
    };
    let profile_url = match (&contact.inner.li_profile_handle, &contact.inner.li_sales_nav_profile_id) {
      (Some(profile_url), _) => LiProfileUrl::ProfileHandle(profile_url.clone()),
      (None, Some(sales_nav_profile_id)) => LiProfileUrl::SalesNavigatorId(sales_nav_profile_id.clone()),
      (None, None) => {
        return Err(crate::JaniumError::msg(format!(
          "No profile URL found for contact {} for step {} in campaign {}",
          campaign_contact.contact_id, campaign_contact.step_id, campaign.id,
        )));
      }
    };
    linkedin_sender
      .notify(LinkedInActionRequest::new(
        LinkedInAction::SendConnectionRequest(SendConnectionRequest { profile_url, message }),
        campaign.team_id,
        linkedin_id,
        Some(campaign.id),
        Some(campaign_contact.step_id),
        Some(campaign_contact.contact_id),
        Timestamp::now() + 20.minutes(),
        None,
      ))
      .await?;
    Ok(())
  }
}
