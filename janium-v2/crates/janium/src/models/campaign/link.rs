use super::CampaignStep;
use crate::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, gql::OneofObject)]
pub enum UuidOrTag {
  Uuid(Id<CampaignStep>),
  Tag(String),
}

impl UuidOrTag {
  pub fn to_uuid(&self, map: impl Fn(&str) -> Option<Id<CampaignStep>>) -> Option<Id<CampaignStep>> {
    match self {
      UuidOrTag::Uuid(uuid) => Some(*uuid),
      UuidOrTag::Tag(tag) => map(tag),
    }
  }
}

impl std::fmt::Display for UuidOrTag {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      UuidOrTag::Uuid(uuid) => write!(f, "uuid:{uuid}"),
      UuidOrTag::Tag(tag) => write!(f, "tag:{tag}"),
    }
  }
}

#[derive(Debug, Clone, Hash, ormlite::Model, gql::SimpleObject)]
pub struct CampaignStepLink {
  #[ormlite(primary_key)]
  pub id: Id<CampaignStepLink>,
  #[graphql(skip)]
  pub campaign_id: Id<Campaign>,
  pub prev: Id<CampaignStep>,
  pub next: Id<CampaignStep>,
  pub enabled: bool,
  pub delay: Span,
  pub random_delay: Span,
  pub priority: i16,
  pub filter: CampaignStepLinkFilter,
}

impl CampaignStepLink {
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
pub struct MutateCampaignStepLink {
  pub id: Id<CampaignStepLink>,
  pub prev: Option<UuidOrTag>,
  pub next: Option<UuidOrTag>,
  pub enabled: Option<bool>,
  pub delay: Option<Span>,
  pub random_delay: Option<Span>,
  pub priority: Option<i16>,
  pub filter: Option<CampaignStepLinkFilter>,
}

impl MutateCampaignStepLink {
  pub async fn mutate(
    self,
    link: &mut CampaignStepLink,
    tag_id_fn: &(dyn Fn(&str) -> Option<Id<CampaignStep>> + Send + Sync),
    transaction: &mut sqlx::PgConnection,
  ) -> Result<()> {
    let start_hash = crate::util::hash(&*link);
    if let Some(prev) = self.prev {
      link.prev = prev
        .to_uuid(tag_id_fn)
        .ok_or_else(|| JaniumError::ext_msg(format!("Invalid previous step: {prev}")))?;
    }
    if let Some(next) = self.next {
      link.next = next
        .to_uuid(tag_id_fn)
        .ok_or_else(|| JaniumError::ext_msg(format!("Invalid next step: {next}")))?;
    }
    if let Some(enabled) = self.enabled {
      link.enabled = enabled;
    }
    if let Some(delay) = self.delay {
      link.delay = delay;
    }
    if let Some(random_delay) = self.random_delay {
      link.random_delay = random_delay;
    }
    if let Some(filter) = self.filter {
      link.filter = filter;
    }
    if let Some(priority) = self.priority {
      link.priority = priority;
    }
    if start_hash != crate::util::hash(&*link) {
      link.clone().save(transaction).await?;
    }
    Ok(())
  }
}

#[derive(Debug, gql::InputObject)]
pub struct CreateCampaignStepLink {
  pub prev: UuidOrTag,
  pub next: UuidOrTag,
  pub enabled: Option<bool>,
  pub delay: Span,
  pub random_delay: Option<Span>,
  pub priority: Option<i16>,
  pub filter: Option<CampaignStepLinkFilter>,
}

impl CreateCampaignStepLink {
  pub fn into_campaign_step_link(
    self,
    campaign_id: Id<Campaign>,
    tag_id_fn: &dyn Fn(&str) -> Option<Id<CampaignStep>>,
  ) -> Result<CampaignStepLink> {
    let link = CampaignStepLink {
      id: Id::new(),
      campaign_id,
      prev: self
        .prev
        .to_uuid(tag_id_fn)
        .ok_or_else(|| JaniumError::ext_msg(format!("Invalid previous step: {}", self.prev)))?,
      next: self
        .next
        .to_uuid(tag_id_fn)
        .ok_or_else(|| JaniumError::ext_msg(format!("Invalid next step: {}", self.next)))?,
      enabled: self.enabled.unwrap_or(true),
      delay: self.delay,
      random_delay: self.random_delay.unwrap_or_else(Span::default_random_delay),
      priority: self.priority.unwrap_or(i16::MAX),
      filter: self.filter.unwrap_or_default(),
    };
    Ok(link)
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::OneofObject, gql::Union)]
#[graphql(input_name = "CampaignStepLinkFilterInput")]
#[serde(rename_all = "snake_case")]
pub enum CampaignStepLinkFilter {
  // OpenedPreviousEmail(OpenedPreviousEmail),
  // OpenedAnyEmail(OpenedAnyEmail),
  // RespondedPreviousEmail(RespondedPreviousEmail),
  // RespondedAnyEmail(RespondedAnyEmail),
  Const(ConstFilter),
  And(AndFilter),
  Or(OrFilter),
  Not(NotFilter),
}

impl CampaignStepLinkFilter {
  #[allow(clippy::only_used_in_recursion)]
  pub fn evaluate(&self, contact: &super::CampaignContact) -> bool {
    match self {
      Self::Const(filter) => filter.pass,
      Self::And(filter) => filter.and.iter().all(|f| f.evaluate(contact)),
      Self::Or(filter) => filter.or.iter().any(|f| f.evaluate(contact)),
      Self::Not(filter) => !filter.not.evaluate(contact),
    }
  }
}

impl Default for CampaignStepLinkFilter {
  fn default() -> Self {
    Self::Const(ConstFilter { pass: true })
  }
}

// #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
// #[graphql(input_name = "OpenedPreviousEmailInput")]
// pub struct OpenedPreviousEmail {
//   within: Option<Span>,
// }

// #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
// #[graphql(input_name = "OpenedAnyEmailInput")]
// pub struct OpenedAnyEmail {
//   within: Option<Span>,
// }

// #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
// #[graphql(input_name = "RespondedPreviousEmailInput")]
// pub struct RespondedPreviousEmail {
//   within: Option<Span>,
// }

// #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
// #[graphql(input_name = "RespondedAnyEmailInput")]
// pub struct RespondedAnyEmail {
//   within: Option<Span>,
// }

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "AndFilterInput")]
pub struct AndFilter {
  and: Vec<CampaignStepLinkFilter>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "OrFilterInput")]
pub struct OrFilter {
  or: Vec<CampaignStepLinkFilter>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "NotFilterInput")]
pub struct NotFilter {
  not: Box<CampaignStepLinkFilter>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "ConstFilterInput")]
pub struct ConstFilter {
  pass: bool,
}

impl sqlx::Type<sqlx::Postgres> for CampaignStepLinkFilter {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    sqlx::types::Json::<Self>::type_info()
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for CampaignStepLinkFilter {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    sqlx::types::Json(self).encode(buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for CampaignStepLinkFilter {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    <sqlx::types::Json<Self>>::decode(value).map(|i| i.0)
  }
}
