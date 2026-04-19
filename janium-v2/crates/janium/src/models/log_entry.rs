use crate::prelude::*;
use futures::StreamExt;

/// Log levels matching tracing::Level
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, gql::Enum)]
#[repr(i16)]
pub enum LogLevel {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
}

impl LogLevel {
  pub fn from_tracing_level(level: &tracing::Level) -> Self {
    match *level {
      tracing::Level::TRACE => Self::Trace,
      tracing::Level::DEBUG => Self::Debug,
      tracing::Level::INFO => Self::Info,
      tracing::Level::WARN => Self::Warn,
      tracing::Level::ERROR => Self::Error,
    }
  }
}

impl sqlx::Type<sqlx::Postgres> for LogLevel {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <i16 as sqlx::Type<sqlx::Postgres>>::type_info()
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for LogLevel {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    <i16 as sqlx::Encode<'_, sqlx::Postgres>>::encode_by_ref(&(*self as i16), buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for LogLevel {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    let val = <i16 as sqlx::Decode<sqlx::Postgres>>::decode(value)?;
    match val {
      0 => Ok(Self::Trace),
      1 => Ok(Self::Debug),
      2 => Ok(Self::Info),
      3 => Ok(Self::Warn),
      4 => Ok(Self::Error),
      _ => Err(format!("Invalid log level: {}", val).into()),
    }
  }
}

impl sqlx::postgres::PgHasArrayType for LogLevel {
  fn array_type_info() -> sqlx::postgres::PgTypeInfo {
    <i16 as sqlx::postgres::PgHasArrayType>::array_type_info()
  }
}

/// Context extracted from tracing spans containing entity IDs
#[derive(Debug, Clone, Default)]
pub struct SpanContext {
  pub team_id: Option<Id<Team>>,
  pub campaign_id: Option<Id<Campaign>>,
  pub campaign_step_id: Option<Id<CampaignStep>>,
  pub contact_id: Option<Id<Contact>>,
  pub linkedin_id: Option<Id<LinkedIn>>,
  pub action_id: Option<Id<LinkedInActionRequest>>,
  pub request_id: Option<Id<http::Request<()>>>,
}

impl SpanContext {
  pub fn merge(&mut self, other: &SpanContext) {
    fn merge<T>(this: &mut Option<Id<T>>, other: Option<Id<T>>) {
      if this.is_none() {
        *this = other;
      }
    }
    merge(&mut self.team_id, other.team_id);
    merge(&mut self.campaign_id, other.campaign_id);
    merge(&mut self.campaign_step_id, other.campaign_step_id);
    merge(&mut self.contact_id, other.contact_id);
    merge(&mut self.linkedin_id, other.linkedin_id);
    merge(&mut self.action_id, other.action_id);
    merge(&mut self.request_id, other.request_id);
  }
}

/// A log entry stored in the database
#[derive(Debug, Clone, sqlx::FromRow, gql::SimpleObject)]
pub struct LogEntry {
  pub level: LogLevel,
  pub message: String,
  pub target: String,
  pub timestamp: Timestamp,
  pub team_id: Option<Id<Team>>,
  pub campaign_id: Option<Id<Campaign>>,
  pub campaign_step_id: Option<Id<CampaignStep>>,
  pub contact_id: Option<Id<Contact>>,
  pub linkedin_id: Option<Id<LinkedIn>>,
  pub action_id: Option<Id<LinkedInActionRequest>>,
  pub request_id: Option<Id<http::Request<()>>>,
  pub fields: serde_json::Value,
}

impl LogEntry {
  pub fn new(
    level: LogLevel,
    message: String,
    target: String,
    timestamp: Timestamp,
    context: SpanContext,
    fields: serde_json::Value,
  ) -> Self {
    Self {
      level,
      message,
      target,
      timestamp,
      team_id: context.team_id,
      campaign_id: context.campaign_id,
      campaign_step_id: context.campaign_step_id,
      contact_id: context.contact_id,
      linkedin_id: context.linkedin_id,
      action_id: context.action_id,
      request_id: context.request_id,
      fields,
    }
  }

  /// Batch insert log entries
  pub async fn batch_insert<'a, T: 'a + core::ops::Deref<Target = LogEntry>>(
    entries: impl Iterator<Item = &'a T> + Clone,
    db: &sqlx::PgPool,
  ) -> Result<(), sqlx::Error> {
    if entries.clone().peekable().peek().is_none() {
      return Ok(());
    }

    // Build batch insert query
    sqlx::query(
      r#"INSERT INTO "log_entries" (
        "level", "message", "target", "timestamp",
        "team_id", "campaign_id", "campaign_step_id", "contact_id",
        "linkedin_id", "action_id", "request_id", "fields"
      ) select * from unnest(
          $1::smallint[]
        , $2::text[]
        , $3::text[]
        , $4::timestamp[]
        , $5::uuid[]
        , $6::uuid[]
        , $7::uuid[]
        , $8::uuid[]
        , $9::uuid[]
        , $10::uuid[]
        , $11::uuid[]
        , $12::jsonb[]
      ) "#,
    )
    .bind(entries.clone().map(|e| e.level).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| &e.message).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| &e.target).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| e.timestamp).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| e.team_id).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| e.campaign_id).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| e.campaign_step_id).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| e.contact_id).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| e.linkedin_id).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| e.action_id).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| e.request_id).collect::<Vec<_>>())
    .bind(entries.clone().map(|e| &e.fields).collect::<Vec<_>>())
    .execute(db)
    .await?;
    Ok(())
  }

  /// Query logs with filter and pagination
  pub fn query(filter: &LogFilter, db: &sqlx::PgPool) -> tokio::sync::mpsc::Receiver<Result<LogEntry, sqlx::Error>> {
    let mut query = sqlx::query_builder::QueryBuilder::new("select * from log_entries");
    query.push(" where 1 = 1");

    // Build WHERE conditions
    if let Some(team_id) = filter.team_id {
      query.push(" and team_id = ");
      query.push_bind(team_id);
    }
    if let Some(campaign_id) = filter.campaign_id {
      query.push(" and campaign_id = ");
      query.push_bind(campaign_id);
    }
    if let Some(linkedin_id) = filter.linkedin_id {
      query.push(" and linkedin_id = ");
      query.push_bind(linkedin_id);
    }
    if let Some(action_id) = filter.action_id {
      query.push(" and action_id = ");
      query.push_bind(action_id);
    }
    if let Some(request_id) = filter.request_id {
      query.push(" and request_id = ");
      query.push_bind(request_id);
    }
    if let Some(min_level) = filter.min_level {
      query.push(" and level >= ");
      query.push_bind(min_level as i16);
    }
    if let Some(start_time) = filter.start_time {
      query.push(" and timestamp >= ");
      query.push_bind(start_time);
    }
    if let Some(end_time) = filter.end_time {
      query.push(" and timestamp <= ");
      query.push_bind(end_time);
    }
    if let Some(target_contains) = &filter.target_contains {
      query.push(" and target ~ ");
      query.push_bind(target_contains.clone());
    }
    if let Some(message_contains) = &filter.message_contains {
      query.push(" and message ~ ");
      query.push_bind(message_contains.clone());
    }

    query.push(" order by timestamp desc");

    query.push(" limit ");
    query.push_bind(i64::from(filter.history_limit.unwrap_or(1000)));

    let (tx, rx) = tokio::sync::mpsc::channel(128);
    let db = db.clone();
    tokio::spawn(async move {
      let mut stream = query.build_query_as::<LogEntry>().fetch(&db);
      while let Some(entry) = stream.next().await {
        let Ok(()) = tx.send(entry).await else {
          break;
        };
      }
    });
    rx
  }

  /// Delete logs older than retention period
  pub async fn cleanup_old_logs(retention_days: i64, db: &sqlx::PgPool) -> Result<u64, sqlx::Error> {
    let now = Timestamp::now() - (retention_days * 24).hours();
    let result = sqlx::query("DELETE FROM log_entries WHERE timestamp < $1")
      .bind(now)
      .execute(db)
      .await?;

    Ok(result.rows_affected())
  }
}

/// Filter for querying and subscribing to logs
#[derive(Debug, Clone, Default, gql::InputObject)]
pub struct LogFilter {
  #[graphql(skip)]
  pub team_id: Option<Id<Team>>,
  pub campaign_id: Option<Id<Campaign>>,
  pub campaign_step_id: Option<Id<CampaignStep>>,
  pub contact_id: Option<Id<Contact>>,
  pub linkedin_id: Option<Id<LinkedIn>>,
  pub action_id: Option<Id<LinkedInActionRequest>>,
  pub request_id: Option<Id<http::Request<()>>>,
  pub min_level: Option<LogLevel>,
  pub start_time: Option<Timestamp>,
  pub end_time: Option<Timestamp>,
  pub target_contains: Option<String>,
  pub message_contains: Option<String>,
  pub live_logs: Option<bool>,
  pub history_logs: Option<bool>,
  pub history_limit: Option<u32>,
  pub heartbeat_interval_secs: Option<u32>,
}

impl LogFilter {
  /// Check if a log entry matches this filter (for subscription filtering)
  pub fn matches(&self, entry: &LogEntry) -> bool {
    if let Some(team_id) = self.team_id
      && entry.team_id != Some(team_id)
    {
      return false;
    }
    if let Some(campaign_id) = self.campaign_id
      && entry.campaign_id != Some(campaign_id)
    {
      return false;
    }
    if let Some(campaign_step_id) = self.campaign_step_id
      && entry.campaign_step_id != Some(campaign_step_id)
    {
      return false;
    }
    if let Some(contact_id) = self.contact_id
      && entry.contact_id != Some(contact_id)
    {
      return false;
    }
    if let Some(linkedin_id) = self.linkedin_id
      && entry.linkedin_id != Some(linkedin_id)
    {
      return false;
    }
    if let Some(action_id) = self.action_id
      && entry.action_id != Some(action_id)
    {
      return false;
    }
    if let Some(request_id) = self.request_id
      && entry.request_id != Some(request_id)
    {
      return false;
    }
    if let Some(min_level) = self.min_level
      && entry.level < min_level
    {
      return false;
    }
    if let Some(start_time) = self.start_time
      && entry.timestamp < start_time
    {
      return false;
    }
    if let Some(end_time) = self.end_time
      && entry.timestamp > end_time
    {
      return false;
    }
    if let Some(ref target_contains) = self.target_contains
      && !entry.target.contains(target_contains)
    {
      return false;
    }
    if let Some(ref message_contains) = self.message_contains
      && !entry.message.contains(message_contains)
    {
      return false;
    }
    true
  }
}
