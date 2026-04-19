use crate::models::contact::Contact;
use crate::prelude::*;
use rand::RngExt;

#[derive(Debug, Clone, Model, gql::SimpleObject)]
#[ormlite(table = "linkedin_action_requests")]
#[graphql(complex)]
pub struct LinkedInActionRequest {
  #[ormlite(primary_key)]
  pub id: Id<LinkedInActionRequest>,
  pub action: LinkedInAction,
  pub action_type: LinkedInActionType,
  pub team_id: Id<Team>,
  pub linkedin_id: Id<LinkedIn>,
  pub campaign_id: Option<Id<Campaign>>,
  pub campaign_step_id: Option<Id<CampaignStep>>,
  pub contact_id: Option<Id<Contact>>,
  // If the task is not started before this timestamp, it will be cancelled
  pub expires_at: Timestamp,
  // Overrides default priority
  pub priority: i16,
  pub next_attempt_at: Timestamp,
  pub last_attempt_status: LinkedInActionRequestStatus,
  pub attempts: i16,
  #[ormlite(skip)]
  #[graphql(skip)]
  pub skip_optional_checks: bool,
}

impl Message<LinkedIn> for LinkedInActionRequest {
  type Return = Result<()>;
  #[tracing::instrument(skip_all, fields(
    linkedin_id = %actor.id,
    action_id = %self.id,
    team_id = %self.team_id,
    campaign_id = %self.campaign_id.unwrap_or_default(),
    campaign_step_id = %self.campaign_step_id.unwrap_or_default(),
    contact_id = %self.contact_id.unwrap_or_default(),
  ))]
  async fn handle(self, actor: &mut LinkedIn, router: &Router, state: &mut LinkedInState) -> Self::Return {
    tracing::info!(
      action_type = ?self.action_type,
      expires_at = ?self.expires_at,
      attempts = self.attempts,
      "LinkedIn actor received action request - checking restrictions"
    );
    let now = Timestamp::now();
    let restriction = actor
      .check_restrictions(state, &self, Timestamp::now(), self.skip_optional_checks)
      .await;
    match restriction {
      Err(e) => {
        tracing::error!("Error checking restrictions notifying campaign");
        let response = LinkedInActionResponse {
          id: self.id,
          team_id: self.team_id,
          linkedin_id: self.linkedin_id,
          campaign_id: self.campaign_id,
          campaign_step_id: self.campaign_step_id,
          contact_id: self.contact_id,
          attempt_started: None,
          attempt_ended: now,
          next_attempt_at: Some(now + std::time::Duration::from_secs(300)),
          result: LinkedInActionRequestResult::NotStarted,
        };
        if let Some(campaign_id) = self.campaign_id
          && let Ok(campaign) = router.get_handle::<Campaign>(&campaign_id)
        {
          campaign.notify(response).await?;
        }
        return Err(e);
      }
      Ok(super::RestrictionCheck::Allowed) => {
        tracing::info!(
          linkedin_id = ?actor.id,
          action_id = ?self.id,
          "Restriction check PASSED - will forward to runner"
        );
        // Update approved action timestamps and reschedule next EvaluateLinkedIn
        state.last_approved_action = Timestamp::now();
        state.next_approved_action = state.last_approved_action
          + rand::rng().random_range(std::time::Duration::from_secs(5 * 60)..=std::time::Duration::from_secs(10 * 60));
        super::EvaluateLinkedIn::schedule_next(state, &actor.id, state.next_approved_action);
      }
      Ok(super::RestrictionCheck::Later(future)) => {
        tracing::warn!(
          linkedin_id = ?self.linkedin_id,
          action_id = ?self.id,
          action_type = ?self.action_type,
          next_attempt_at = ?future,
          "Action NOT forwarded to runner - restriction check returned Later"
        );
        let response = LinkedInActionResponse {
          id: self.id,
          team_id: self.team_id,
          linkedin_id: self.linkedin_id,
          campaign_id: self.campaign_id,
          campaign_step_id: self.campaign_step_id,
          contact_id: self.contact_id,
          attempt_started: None,
          attempt_ended: now,
          next_attempt_at: Some(future),
          result: LinkedInActionRequestResult::NotStarted,
        };
        if let Some(campaign_id) = self.campaign_id
          && let Ok(campaign) = router.get_handle::<Campaign>(&campaign_id)
        {
          campaign.notify(response).await?;
        }
        return Ok(());
      }
      Ok(super::RestrictionCheck::FailureLockout { failures, until }) => {
        tracing::warn!(
          linkedin_id = ?self.linkedin_id,
          action_id = ?self.id,
          consecutive_failures = failures,
          locked_until = ?until,
          "LinkedIn action blocked due to failure lockout - manual intervention may be required"
        );
        let response = LinkedInActionResponse {
          id: self.id,
          team_id: self.team_id,
          linkedin_id: self.linkedin_id,
          campaign_id: self.campaign_id,
          campaign_step_id: self.campaign_step_id,
          contact_id: self.contact_id,
          attempt_started: None,
          attempt_ended: now,
          next_attempt_at: Some(until),
          result: LinkedInActionRequestResult::NotStarted,
        };
        if let Some(campaign_id) = self.campaign_id
          && let Ok(campaign) = router.get_handle::<Campaign>(&campaign_id)
        {
          campaign.notify(response).await?;
        }
        return Ok(());
      }
    }
    tracing::info!(
      linkedin_id = ?actor.id,
      action_id = ?self.id,
      "Starting/getting automated runner to forward action"
    );
    let sender = state.start_automated_runner(actor).await?;
    tracing::info!(
      linkedin_id = ?actor.id,
      action_id = ?self.id,
      "Got runner sender, attempting try_send to forward action to runner"
    );
    // This can't wait for the sender, so we return an error if it fails
    // Otherwise it would be easy to get into a deadlock here.
    if let Err(e) = sender.try_send(crate::automator::runner::AutomatorRunnerMessage::Automate(self)) {
      tracing::error!(
        error = ?e,
        "try_send FAILED - AutomatorRunner queue is full or closed"
      );
      let crate::automator::runner::AutomatorRunnerMessage::Automate(message) = e.into_inner() else {
        unreachable!("Just constructed an Automate message");
      };
      tracing::error!(
        linkedin_id = ?message.linkedin_id,
        action_id = ?message.id,
        action_type = ?message.action_type,
        campaign_id = ?message.campaign_id,
        "Action NOT forwarded to runner - try_send failed, notifying campaign of failure"
      );
      if let Some(campaign_id) = message.campaign_id {
        let campaign = router.get_handle::<Campaign>(&campaign_id)?;
        campaign
          .notify(LinkedInActionResponse {
            id: message.id,
            team_id: message.team_id,
            linkedin_id: message.linkedin_id,
            campaign_id: message.campaign_id,
            campaign_step_id: message.campaign_step_id,
            contact_id: message.contact_id,
            attempt_started: None,
            attempt_ended: now,
            next_attempt_at: Some(now + std::time::Duration::from_secs(300)),
            result: LinkedInActionRequestResult::NotStarted,
          })
          .await?;
      }
      return Err(JaniumError::msg(
        "Error sending LinkedInActionRequest to AutomatorRunner",
      ));
    }
    tracing::info!(
      linkedin_id = ?actor.id,
      "Action successfully forwarded to runner via try_send"
    );
    Ok(())
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, gql::Enum)]
#[repr(i16)]
pub enum LinkedInActionRequestStatus {
  // These numbers can never change
  Pending = 0,
  InProgress = 1,
  Success = 2,
  Failed = 3,
  Expired = 4,
}

#[derive(Debug)]
pub enum LinkedInActionRequestResult {
  Success,
  Failed(JaniumError),
  Expired,
  NotStarted,
  AlreadyCompleted,
  EmailVerificationRequired,
  /// The contact responded to a previous message. Detected either by scraping
  /// the conversation before sending (in which case the automated message is
  /// skipped), or from a downloaded inbox sync that discovers a reply. The
  /// campaign should transition the contact out of the automated sequence.
  ContactResponded,
}

#[derive(Debug)]
pub struct LinkedInActionResponse {
  pub id: Id<LinkedInActionRequest>,
  pub team_id: Id<Team>,
  pub linkedin_id: Id<LinkedIn>,
  pub campaign_id: Option<Id<Campaign>>,
  pub campaign_step_id: Option<Id<CampaignStep>>,
  pub contact_id: Option<Id<Contact>>,
  pub attempt_started: Option<Timestamp>,
  pub attempt_ended: Timestamp,
  // Set if retries are allowed
  pub next_attempt_at: Option<Timestamp>,
  pub result: LinkedInActionRequestResult,
}

impl LinkedInActionRequest {
  pub fn new(
    action: LinkedInAction,
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    campaign_id: Option<Id<Campaign>>,
    campaign_step_id: Option<Id<CampaignStep>>,
    contact_id: Option<Id<Contact>>,
    expires_at: Timestamp,
    priority: Option<i16>,
  ) -> Self {
    let priority = priority.unwrap_or(action.priority());
    Self {
      id: Id::new(),
      action_type: action.action_type(),
      action,
      team_id,
      linkedin_id,
      campaign_id,
      campaign_step_id,
      contact_id,
      expires_at,
      priority,
      next_attempt_at: Timestamp::now(),
      last_attempt_status: LinkedInActionRequestStatus::Pending,
      attempts: 0,
      skip_optional_checks: false,
    }
  }
  pub fn with_skip_optional_checks(mut self, skip_optional_checks: bool) -> Self {
    self.skip_optional_checks = skip_optional_checks;
    self
  }
  /// Calculate exponential backoff delay based on attempt count.
  /// Backoff: 5min, 15min, 45min, 2h, 6h (capped at 6 hours)
  fn backoff_delay(attempts: i16) -> jiff::Span {
    let base_minutes = 5i64;
    let multiplier = 3i64.pow(attempts.max(0) as u32);
    let delay_minutes = (base_minutes * multiplier).min(360); // Cap at 6 hours
    jiff::Span::new().minutes(delay_minutes)
  }

  /// Mark action for retry with exponential backoff. Sets status back to Pending.
  pub async fn retry(mut self, db: &mut sqlx::PgConnection) -> Result<Self> {
    self.last_attempt_status = LinkedInActionRequestStatus::Pending;
    let backoff = Self::backoff_delay(self.attempts);
    self.next_attempt_at = Timestamp::now() + backoff;
    tracing::info!(
      attempts = self.attempts,
      next_attempt_at = ?self.next_attempt_at,
      "LinkedIn action failed, scheduling retry with backoff"
    );
    self.save(db).await
  }

  /// Mark action as permanently failed (no more retries).
  pub async fn fail(mut self, db: &mut sqlx::PgConnection) -> Result<Self> {
    self.last_attempt_status = LinkedInActionRequestStatus::Failed;
    self.next_attempt_at = Timestamp::MAX;
    self.save(db).await
  }
  pub async fn save(self, db: &mut sqlx::PgConnection) -> Result<Self> {
    self
      .insert(db)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        Self::primary_key().unwrap(),
      ))
      .await
      .map_err(|e| e.into())
  }
  pub async fn next_task(
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    now: Timestamp,
    db: &mut sqlx::PgConnection,
  ) -> Result<Option<Self>> {
    sqlx::query_as::<_, Self>(
      "with next_task as (
    select id
    from linkedin_action_requests
    where team_id = $1
      and linkedin_id = $2
      and expires_at > $3
      and next_attempt_at <= $3
      and last_attempt_status = $4
      order by priority asc, expires_at asc
      limit 1
  )
  update linkedin_action_requests
  set last_attempt_status = $5
  , attempts = attempts + 1
  where id = (select id from next_task)
  returning *",
    )
    .bind(team_id)
    .bind(linkedin_id)
    .bind(now)
    .bind(LinkedInActionRequestStatus::Pending)
    .bind(LinkedInActionRequestStatus::InProgress)
    .fetch_optional(db)
    .await
    .map_err(|e| e.into())
  }

  pub async fn next_task_at(
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    now: Timestamp,
    db: &mut sqlx::PgConnection,
  ) -> Result<Option<Timestamp>> {
    sqlx::query_scalar::<_, Option<Timestamp>>(
      "select min(next_attempt_at)
      from linkedin_action_requests
      where team_id = $1
        and linkedin_id = $2
        and expires_at > $3
        and last_attempt_status = $4
      ",
    )
    .bind(team_id)
    .bind(linkedin_id)
    .bind(now)
    .bind(LinkedInActionRequestStatus::Pending)
    .fetch_one(db)
    .await
    .map_err(|e| e.into())
  }
  pub async fn delete_old_tasks(db: &mut sqlx::PgConnection) -> Result<()> {
    sqlx::query("delete from linkedin_action_requests where expires_at < $1")
      .bind(Timestamp::now() + 168.hours().negate())
      .execute(db)
      .await?;
    Ok(())
  }

  /// Check if there's already a pending action for this contact, LinkedIn account, and action type
  pub async fn has_pending_action_for_contact(
    linkedin_id: Id<LinkedIn>,
    contact_id: Id<Contact>,
    action_type: LinkedInActionType,
    db: &mut sqlx::PgConnection,
  ) -> Result<bool> {
    let count = sqlx::query_scalar::<_, i64>(
      "SELECT COUNT(*) FROM linkedin_action_requests
       WHERE linkedin_id = $1
       AND contact_id = $2
       AND action_type = $3
       AND last_attempt_status IN ($4, $5)
       AND expires_at > $6",
    )
    .bind(linkedin_id)
    .bind(contact_id)
    .bind(action_type)
    .bind(LinkedInActionRequestStatus::Pending)
    .bind(LinkedInActionRequestStatus::InProgress)
    .bind(Timestamp::now())
    .fetch_one(db)
    .await?;
    Ok(count > 0)
  }
  pub async fn dead_tasks(
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    now: Timestamp,
    db: &mut sqlx::PgConnection,
  ) -> Result<Vec<LinkedInActionResponse>> {
    let tasks = sqlx::query_as::<_, Self>(
      "select * 
      from linkedin_action_requests 
      where team_id = $1 
        and linkedin_id = $2 
        and (
          (expires_at < $3 and last_attempt_status = ANY($4)) 
          or 
          not last_attempt_status = ANY($4)
        )",
    )
    .bind(team_id)
    .bind(linkedin_id)
    .bind(now)
    .bind([
      LinkedInActionRequestStatus::Pending,
      LinkedInActionRequestStatus::InProgress,
    ])
    .fetch_all(db)
    .await?;
    let results = tasks
      .into_iter()
      .filter(|task| task.last_attempt_status != LinkedInActionRequestStatus::InProgress)
      .map(|task| {
        let next_attempt_at = match task.last_attempt_status {
          LinkedInActionRequestStatus::Pending | LinkedInActionRequestStatus::Expired => {
            Some(Timestamp::now() + std::time::Duration::from_secs(600))
          }
          LinkedInActionRequestStatus::InProgress => unreachable!(),
          LinkedInActionRequestStatus::Failed | LinkedInActionRequestStatus::Success => None,
        };
        let result = match task.last_attempt_status {
          LinkedInActionRequestStatus::Pending | LinkedInActionRequestStatus::Expired => {
            LinkedInActionRequestResult::Expired
          }
          LinkedInActionRequestStatus::InProgress => unreachable!(),
          LinkedInActionRequestStatus::Failed => {
            LinkedInActionRequestResult::Failed(JaniumError::ext_msg("Task failed"))
          }
          LinkedInActionRequestStatus::Success => LinkedInActionRequestResult::Success,
        };
        LinkedInActionResponse {
          id: task.id,
          team_id: task.team_id,
          linkedin_id: task.linkedin_id,
          campaign_id: task.campaign_id,
          campaign_step_id: task.campaign_step_id,
          contact_id: task.contact_id,
          attempt_started: None,
          attempt_ended: Timestamp::now(),
          next_attempt_at,
          result,
        }
      })
      .collect();
    Ok(results)
  }
  /// Lockout window duration in minutes. Failures older than this are not counted.
  pub const FAILURE_LOCKOUT_WINDOW_MINUTES: i64 = 240; // 4 hours

  /// Count consecutive failures since last success, only within the lockout window.
  /// This ensures the lockout automatically expires after the window passes.
  pub async fn failures_since_last_success(
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    action_type: LinkedInActionType,
    db: &mut sqlx::PgConnection,
  ) -> Result<i64> {
    // Only count failures within the lockout window
    // This ensures lockout automatically expires after the window passes
    let lockout_window_start = Timestamp::now() - Self::FAILURE_LOCKOUT_WINDOW_MINUTES.minutes();

    let failures = sqlx::query_scalar::<_, i64>(
      "select count(*)
      from linkedin_action_failures
      where team_id = $1
        and linkedin_id = $2
        and action_type = $3
        and failed_at > $4
        and failed_at > COALESCE(
          (select max(completed_at)
           from linkedin_action_history
           where team_id = $1
             and linkedin_id = $2
             and action_type = $3),
          '1970-01-01'::timestamptz
        )",
    )
    .bind(team_id)
    .bind(linkedin_id)
    .bind(action_type)
    .bind(lockout_window_start)
    .fetch_one(db)
    .await?;
    Ok(failures)
  }
  // returns daily then weekly counts for the given linkedin and action type
  pub async fn daily_weekly_counts(
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    action_type: LinkedInActionType,
    now: jiff::Zoned,
    db: &mut sqlx::PgConnection,
  ) -> Result<(i64, i64)> {
    let beginning_of_day = now.start_of_day().unwrap();
    let beginning_of_week = crate::util::start_of_week_at_sunday(&now);
    let (history_today_count, history_week_count) = sqlx::query_as::<_, (i64, i64)>(
      "
  SELECT count(case when completed_at >= $5 then 1 end) as today_count
  , count(*) as week_count
  FROM linkedin_action_history
  WHERE team_id = $1
    AND linkedin_id = $2
    AND action_type = $3
    AND completed_at >= $4",
    )
    .bind(team_id)
    .bind(linkedin_id)
    .bind(action_type)
    .bind(Timestamp::from(beginning_of_week))
    .bind(Timestamp::from(beginning_of_day))
    .fetch_one(&mut *db)
    .await?;

    let (requests_today_count, requests_week_count) = sqlx::query_as::<_, (i64, i64)>(
      "SELECT count(*) as today_count
  , count(*) as week_count
  FROM linkedin_action_requests
  WHERE team_id = $1
    AND linkedin_id = $2
    AND action_type = $3
    AND expires_at > $4
    AND last_attempt_status IN ($5, $6)",
    )
    .bind(team_id)
    .bind(linkedin_id)
    .bind(action_type)
    .bind(Timestamp::from(now.timestamp()))
    .bind(LinkedInActionRequestStatus::Pending)
    .bind(LinkedInActionRequestStatus::InProgress)
    .fetch_one(&mut *db)
    .await?;
    tracing::debug!(
      history_today_count,
      history_week_count,
      requests_today_count,
      requests_week_count,
      "Daily and weekly counts"
    );
    Ok((
      history_today_count + requests_today_count,
      history_week_count + requests_week_count,
    ))
  }
  pub async fn remove(id: Id<LinkedInActionRequest>, db: &mut sqlx::PgConnection) -> Result<()> {
    sqlx::query("delete from linkedin_action_requests where id = $1")
      .bind(id)
      .execute(db)
      .await?;
    Ok(())
  }
  pub async fn reset_pending_actions(db: &sqlx::PgPool, team_id: Id<Team>) -> Result<()> {
    sqlx::query(
      "update linkedin_action_requests set last_attempt_status = $1 where team_id = $3 and last_attempt_status = $2",
    )
    .bind(LinkedInActionRequestStatus::Pending)
    .bind(LinkedInActionRequestStatus::InProgress)
    .bind(team_id)
    .execute(db)
    .await?;
    Ok(())
  }
}

#[gql::ComplexObject]
impl LinkedInActionRequest {
  pub async fn campaign(&self, context: &gql::Context<'_>) -> Result<Option<crate::graphql::GqlQuery<Campaign>>> {
    let Some(campaign_id) = self.campaign_id else {
      return Ok(None);
    };
    let app_state = context.data_unchecked::<AppState>();
    let campaign = app_state.router.get_handle::<Campaign>(&campaign_id)?;
    Ok(Some(GqlQuery {
      app_state: app_state.clone(),
      team: app_state.router.get_handle::<Team>(&self.team_id)?,
      sender: campaign,
    }))
  }
  pub async fn campaign_step(&self, context: &gql::Context<'_>) -> Result<Option<CampaignStep>> {
    let (Some(campaign_id), Some(campaign_step_id)) = (self.campaign_id, self.campaign_step_id) else {
      return Ok(None);
    };
    let app_state = context.data_unchecked::<AppState>();
    let campaign = app_state.router.get_handle::<Campaign>(&campaign_id)?;
    let campaign_step = campaign
      .send(super::Query::new(move |_, _, state: &CampaignState| {
        state.graph.steps().get(&campaign_step_id).cloned()
      }))
      .await?;
    Ok(campaign_step)
  }
  pub async fn contact(&self, context: &gql::Context<'_>) -> Result<Option<Arc<Contact>>> {
    let Some(contact_id) = self.contact_id else {
      return Ok(None);
    };
    let app_state = context.data_unchecked::<AppState>();
    let contact = app_state.contact_service.get(&contact_id).await?;
    Ok(contact)
  }
  pub async fn linked_in(&self, context: &gql::Context<'_>) -> Result<Option<GqlQuery<LinkedIn>>> {
    let app_state = context.data_unchecked::<AppState>();
    let linkedin = app_state.router.get_handle::<LinkedIn>(&self.linkedin_id)?;
    Ok(Some(GqlQuery {
      app_state: app_state.clone(),
      team: app_state.router.get_handle::<Team>(&self.team_id)?,
      sender: linkedin,
    }))
  }
  pub async fn team(&self, context: &gql::Context<'_>) -> Result<Option<GqlQuery<Team>>> {
    let app_state = context.data_unchecked::<AppState>();
    let team = app_state.router.get_handle::<Team>(&self.team_id)?;
    Ok(Some(GqlQuery {
      app_state: app_state.clone(),
      team: team.clone(),
      sender: team,
    }))
  }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, gql::Union, strum::EnumDiscriminants)]
#[strum_discriminants(name(LinkedInActionType), derive(gql::Enum, sqlx::Type, Serialize, Deserialize))]
#[repr(i16)]
pub enum LinkedInAction {
  ScrapeSalesNavQuery(ScrapeSalesNavQuery) = 1,
  SendConnectionRequest(SendConnectionRequest) = 2,
  SyncConnections(SyncConnections) = 3,
  DownloadInbox(DownloadInbox) = 4,
  SendMessage(SendMessage) = 5,
}

impl sqlx::Type<sqlx::Postgres> for LinkedInAction {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <sqlx::types::Json<LinkedInAction> as sqlx::Type<sqlx::Postgres>>::type_info()
  }
  fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
    <sqlx::types::Json<LinkedInAction> as sqlx::Type<sqlx::Postgres>>::compatible(ty)
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for LinkedInAction {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    sqlx::types::Json::encode_by_ref(&sqlx::types::Json(crate::types::IdReverser(self)), buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for LinkedInAction {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    sqlx::types::Json::<crate::types::IdReverser<Self>>::decode(value).map(|i| i.0.0)
  }
}

impl LinkedInAction {
  // 1 is highest priority
  pub fn priority(&self) -> i16 {
    self.action_type() as i16
  }
  pub fn action_type(&self) -> LinkedInActionType {
    LinkedInActionType::from(self)
  }
}

impl LinkedInActionType {
  /// Read-only actions (sync connections, download inbox) don't need inter-action delay
  /// or failure lockout checks — they don't mutate LinkedIn state in ways that risk account flags.
  /// TODO: revisit — read-only actions should probably have different (more lenient) failure
  /// lockout timeouts rather than skipping the check entirely.
  pub fn is_read_only(&self) -> bool {
    matches!(self, Self::SyncConnections | Self::DownloadInbox)
  }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, gql::SimpleObject)]
pub struct ScrapeSalesNavQuery {
  pub sales_navigator_url: String,
  pub max_pages_to_scrape: Option<i32>,
  pub download_full_profile_info: bool,
  pub max_profiles_per_page: Option<i32>,
  pub contact_list_id: Id<ContactList>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, gql::SimpleObject)]
pub struct SendConnectionRequest {
  pub profile_url: LiProfileUrl,
  pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, gql::SimpleObject)]
pub struct SyncConnections {
  pub full_sync: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, gql::SimpleObject)]
pub struct DownloadInbox {
  pub full_sync: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, gql::SimpleObject)]
pub struct SendMessage {
  pub contact_id: Id<Contact>,
  pub contact_name: String,
  pub message_content: String,
  /// When true, skip the check for whether the contact has already responded.
  /// Set to true for user-initiated (GQL API) messages, false for campaign-automated messages.
  pub skip_response_check: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum LiProfileUrl {
  SalesNavigatorId(String),
  ProfileHandle(String),
}

impl LiProfileUrl {
  fn as_str(&self) -> &str {
    match self {
      LiProfileUrl::SalesNavigatorId(hash) => hash,
      LiProfileUrl::ProfileHandle(handle) => handle,
    }
  }
  pub fn as_url(&self) -> String {
    match self {
      LiProfileUrl::SalesNavigatorId(hash) => format!("https://www.linkedin.com/sales/lead/{hash}"),
      LiProfileUrl::ProfileHandle(handle) => format!("https://www.linkedin.com/in/{handle}"),
    }
  }
}

impl gql::OutputType for LiProfileUrl {
  fn type_name() -> std::borrow::Cow<'static, str> {
    <String as gql::OutputType>::type_name()
  }
  fn create_type_info(registry: &mut gql::registry::Registry) -> String {
    <String as gql::OutputType>::create_type_info(registry)
  }
  async fn resolve(
    &self,
    _ctx: &gql::context::ContextSelectionSet<'_>,
    _field: &gql::Positioned<gql::parser::types::Field>,
  ) -> gql::ServerResult<gql::Value> {
    Ok(self.as_str().into())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test::app_state_test;

  #[test]
  fn test_delete_old_tasks() {
    app_state_test(20, async |app_state| {
      // Get test team and linkedin IDs from the database
      let team_id: Id<Team> = sqlx::query_scalar("select id from team limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
      let linkedin = sqlx::query_as::<_, crate::models::LinkedIn>("select * from linked_in limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      let now = Timestamp::now();
      let one_week = 168.hours();

      // Create tasks with different expires_at values
      let old_task = LinkedInActionRequest::new(
        LinkedInAction::SyncConnections(SyncConnections { full_sync: false }),
        team_id,
        linkedin.id,
        None,
        None,
        None,
        now + one_week.negate() + 1.second().negate(), // Older than 1 week
        None,
      );

      let exactly_one_week_old_task = LinkedInActionRequest::new(
        LinkedInAction::SyncConnections(SyncConnections { full_sync: false }),
        team_id,
        linkedin.id,
        None,
        None,
        None,
        now + one_week.negate(), // Exactly 1 week old
        None,
      );

      let recent_task = LinkedInActionRequest::new(
        LinkedInAction::SyncConnections(SyncConnections { full_sync: false }),
        team_id,
        linkedin.id,
        None,
        None,
        None,
        now + one_week.negate() + 1.second(), // Less than 1 week old
        None,
      );

      let future_task = LinkedInActionRequest::new(
        LinkedInAction::SyncConnections(SyncConnections { full_sync: false }),
        team_id,
        linkedin.id,
        None,
        None,
        None,
        now + 24.hours(), // In the future
        None,
      );

      // Save all tasks to the database
      let mut conn = app_state.db.acquire().await.unwrap();
      let old_task = old_task.save(&mut conn).await.unwrap();
      let exactly_one_week_old_task = exactly_one_week_old_task.save(&mut conn).await.unwrap();
      let recent_task = recent_task.save(&mut conn).await.unwrap();
      let future_task = future_task.save(&mut conn).await.unwrap();

      // Verify all tasks exist
      let count_before = sqlx::query_scalar::<_, i64>("select count(*) from linkedin_action_requests")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
      assert_eq!(count_before, 4);

      // Call delete_old_tasks
      LinkedInActionRequest::delete_old_tasks(&mut conn).await.unwrap();

      // Verify old tasks were deleted
      let old_task_exists =
        sqlx::query_scalar::<_, bool>("select exists(select 1 from linkedin_action_requests where id = $1)")
          .bind(old_task.id)
          .fetch_one(&app_state.db)
          .await
          .unwrap();
      assert!(!old_task_exists, "Old task should be deleted");

      let exactly_one_week_old_exists =
        sqlx::query_scalar::<_, bool>("select exists(select 1 from linkedin_action_requests where id = $1)")
          .bind(exactly_one_week_old_task.id)
          .fetch_one(&app_state.db)
          .await
          .unwrap();
      assert!(
        !exactly_one_week_old_exists,
        "Exactly one week old task should be deleted"
      );

      // Verify recent and future tasks still exist
      let recent_task_exists =
        sqlx::query_scalar::<_, bool>("select exists(select 1 from linkedin_action_requests where id = $1)")
          .bind(recent_task.id)
          .fetch_one(&app_state.db)
          .await
          .unwrap();
      assert!(recent_task_exists, "Recent task should not be deleted");

      let future_task_exists =
        sqlx::query_scalar::<_, bool>("select exists(select 1 from linkedin_action_requests where id = $1)")
          .bind(future_task.id)
          .fetch_one(&app_state.db)
          .await
          .unwrap();
      assert!(future_task_exists, "Future task should not be deleted");

      // Verify final count
      let count_after = sqlx::query_scalar::<_, i64>("select count(*) from linkedin_action_requests")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
      assert_eq!(count_after, 2, "Should have 2 tasks remaining (recent and future)");
    });
  }
}
