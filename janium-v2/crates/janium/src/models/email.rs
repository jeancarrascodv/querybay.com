pub use self::group::{EmailGroup, EmailGroupService};
use crate::prelude::*;
use compact_str::CompactString;
use serde::{Deserialize, Serialize};

mod group;

#[derive(Debug, Clone, Serialize, ormlite::Model)]
pub struct Email {
  #[ormlite(primary_key)]
  pub email: String,
  pub team_id: Id<Team>,
  pub domain: CompactString,
  pub hourly_limit: i32,
  pub daily_limit: i32,
  pub weekly_limit: i32,
  pub forwarding_key: CompactString,
  pub forwarding_rule_last_verified: Option<Timestamp>,
  pub active: bool,
}

#[gql::Object]
impl Email {
  pub async fn email(&self) -> &str {
    &self.email
  }
  pub async fn domain(&self) -> &str {
    &self.domain
  }
  pub async fn hourly_limit(&self) -> i32 {
    self.hourly_limit
  }
  pub async fn daily_limit(&self) -> i32 {
    self.daily_limit
  }
  pub async fn active(&self) -> bool {
    self.active
  }
  pub async fn forwarding_key(&self) -> &str {
    &self.forwarding_key
  }
  pub async fn forwarding_rule_last_verified(&self) -> Option<Timestamp> {
    self.forwarding_rule_last_verified
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, ormlite::Model)]
pub struct EmailDomain {
  #[ormlite(primary_key)]
  pub domain: CompactString,
  pub team_id: Id<Team>,
  pub hourly_limit: i32,
  pub daily_limit: i32,
  pub weekly_limit: i32,
  sender: EmailSender,
}

#[gql::Object]
impl EmailDomain {
  pub async fn domain(&self) -> &str {
    &self.domain
  }
  pub async fn hourly_limit(&self) -> i32 {
    self.hourly_limit
  }
  pub async fn daily_limit(&self) -> i32 {
    self.daily_limit
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EmailSender {
  Ses(SesSender),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SesSender {
  pub ses_verified: bool,
  pub ses_verification_token: Option<String>,
}

impl sqlx::Type<sqlx::Postgres> for EmailSender {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <sqlx::types::Json<EmailSender> as sqlx::Type<sqlx::Postgres>>::type_info()
  }
  fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
    <sqlx::types::Json<EmailSender> as sqlx::Type<sqlx::Postgres>>::compatible(ty)
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for EmailSender {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    sqlx::types::Json::encode_by_ref(&sqlx::types::Json(crate::types::IdReverser(self)), buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for EmailSender {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    sqlx::types::Json::<crate::types::IdReverser<EmailSender>>::decode(value).map(|i| i.0.0)
  }
}

pub struct EmailState {
  _actor_state: super::ActorState<Self>,
}

impl EmailState {
  pub fn new(actor_state: super::ActorState<Self>) -> Self {
    Self {
      _actor_state: actor_state,
    }
  }
}

impl Actor for Email {
  type Id = String;
  type IdRef = str;
  type State = EmailState;
  type StartResult = ();

  fn id_ref(&self) -> &Self::IdRef {
    &self.email
  }

  async fn start(&mut self, _router: &janium_actors::Router, _state: &mut EmailState) -> janium_actors::DynResult {
    tracing::info!("Starting email actor {}", self.email);
    Ok(())
  }
}
