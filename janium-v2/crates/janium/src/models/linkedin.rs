pub use self::actions::*;
pub use self::connections::*;
pub use self::failures::*;
pub use self::history::*;
pub use self::messages::*;
use crate::prelude::*;
use crate::util::OptionPatch;
use compact_str::CompactString as String;
use rand::RngExt;
use std::string::String as StdString;

pub mod actions;
pub mod connections;
pub mod failures;
pub mod history;
pub mod messages;

#[derive(Debug, Clone, Hash, Model, gql::SimpleObject)]
#[graphql(complex)]
pub struct LinkedIn {
  pub id: Id<LinkedIn>,
  // Timezone derived from the primary user's timezone.
  pub primary_user_id: Id<User>,
  pub team_id: Id<Team>,
  linkedin_profile_url: StdString,
  full_name: StdString,
  max_pending_connection_requests: i16,
  // These reset sunday morning at midnight using the user's timezone.
  max_connection_requests_per_week: i16,
  max_connection_requests_per_day: i16,
  // The this gets added to and subtracted from the daily connection requests
  // to come up with the range of requests that the maximum number of requests
  // can be sampled from on any given day.
  // The basis for the average is either given by the connection_request_warmup* fields or the max_connection_requests_per_week / active days in weekly_restrictions.
  // This is always between 0 and 100.
  daily_connection_requests_variation_pct: i16,
  minimum_delay_between_connection_requests_ms: i32,
  max_consecutive_errors: Option<i16>,
  warmup_enabled: bool,
  warmup_period_days: Option<i16>,
  warmup_starting_connection_requests_per_day: Option<i16>,
  // Times during the week that externally facing messages can be sent. This means that things like sales navigator queries can happen any time.
  weekly_restrictions: Option<WeeklyRestrictions>,
  // The maximum number of connection requests that can be sent today.
  today_max_connection_requests: i16,
  today_executable_window_start: Time,
  today_executable_window_end: Time,
  today_options_updated: Timestamp,
  connections: i16,
  login_active_last_validated: Option<Timestamp>,
  sales_navigator_active_last_validated: Option<Timestamp>,
  #[graphql(skip)]
  // TODO: ensure this is unique
  // The base port is the first port used for the container when multiplied by some factor and added to some default base.
  base_port: i16,
  #[graphql(skip)]
  docker_username: String,
  #[graphql(skip)]
  docker_hostname: String,
  #[graphql(skip)]
  docker_host_mount: String,
  proxy_url: Option<StdString>,
  last_partial_sync: Option<Timestamp>,
  last_full_sync: Option<Timestamp>,
  pub last_inbox_download: Option<Timestamp>,
  pub last_full_inbox_download: Option<Timestamp>,
  /// Contact record for the LinkedIn account owner. `Id::nil()` until owner detection runs.
  /// Wrapped in ArcSwap so the Automator can read updates without re-querying.
  pub contact_id: ArcSwap<Id<Contact>>,
}

#[gql::ComplexObject]
impl LinkedIn {
  async fn timezone(&self, ctx: &gql::Context<'_>) -> Result<ArcSwap<TimeZone>> {
    let app_state = ctx.data_unchecked::<AppState>();
    let linkedin = app_state.router.get_handle::<LinkedIn>(&self.id)?;
    linkedin
      .send(super::Query::new(|_, _, state: &LinkedInState| {
        state.team_timezone.clone()
      }))
      .await
      .map_err(Into::into)
  }
}

#[derive(Debug, Clone, gql::InputObject)]
pub struct CreateLinkedIn {
  primary_user_id: Option<Id<User>>,
  linkedin_profile_url: StdString,
  full_name: StdString,
  max_pending_connection_requests: i16,
  // These reset sunday morning at midnight using the user's timezone.
  max_connection_requests_per_week: i16,
  max_connection_requests_per_day: i16,
  // The this gets added to and subtracted from the daily connection requests
  // to come up with the range of requests that the maximum number of requests
  // can be sampled from on any given day.
  // The basis for the average is either given by the connection_request_warmup* fields or the max_connection_requests_per_week / active days in weekly_restrictions.
  daily_connection_requests_variation_pct: i16,
  max_consecutive_errors: Option<i16>,
  // #[graphql(skip)]
  // daily_direct_message_range: sqlx::postgres::types::PgRange<i16>,
  minimum_delay_between_connection_requests_ms: i32,
  weekly_restrictions: Option<WeeklyRestrictions>,
  warmup_enabled: bool,
  warmup_period_days: Option<i16>,
  warmup_starting_connection_requests_per_day: Option<i16>,
  proxy_url: Option<StdString>,
}

impl CreateLinkedIn {
  pub async fn into_linkedin(
    self,
    team_id: Id<Team>,
    backup_primary_user_id: Id<User>,
    base_port: i16,
    team_timezone: &TimeZone,
    team_allowed_messaging_day_times: &WeeklyRestrictions,
  ) -> Result<LinkedIn> {
    if let Some(weekly_restrictions) = &self.weekly_restrictions {
      weekly_restrictions.validate()?;
    }
    let name: String = self.full_name.to_ascii_lowercase().replace(" ", ".").into();
    let primary_user_id = self.primary_user_id.unwrap_or(backup_primary_user_id);
    let zoned = jiff::Zoned::new(Timestamp::now().into(), team_timezone.clone().into());
    let executable_window = team_allowed_messaging_day_times
      .intersect(
        &self
          .weekly_restrictions
          .clone()
          .unwrap_or_else(WeeklyRestrictions::always_allowed),
      )
      .choose_window_with_span_in_restriction(&zoned, 3.hours())
      .unwrap_or((
        jiff::civil::Time::midnight().into(),
        jiff::civil::Time::midnight().into(),
      ));
    let linkedin = LinkedIn {
      id: Id::new(),
      primary_user_id,
      team_id,
      linkedin_profile_url: self.linkedin_profile_url,
      full_name: self.full_name,
      max_pending_connection_requests: self.max_pending_connection_requests,
      max_connection_requests_per_week: self.max_connection_requests_per_week,
      max_connection_requests_per_day: self.max_connection_requests_per_day,
      daily_connection_requests_variation_pct: self.daily_connection_requests_variation_pct,
      minimum_delay_between_connection_requests_ms: self.minimum_delay_between_connection_requests_ms,
      weekly_restrictions: self.weekly_restrictions,
      max_consecutive_errors: None,
      warmup_enabled: self.warmup_enabled,
      warmup_period_days: self.warmup_period_days,
      warmup_starting_connection_requests_per_day: self.warmup_starting_connection_requests_per_day,
      connections: 0,
      today_max_connection_requests: 5,
      today_executable_window_start: executable_window.0,
      today_executable_window_end: executable_window.1,
      today_options_updated: Timestamp::now(),
      login_active_last_validated: None,
      sales_navigator_active_last_validated: None,
      base_port,
      docker_username: name.clone(),
      docker_hostname: name.clone(),
      docker_host_mount: name,
      proxy_url: self.proxy_url,
      last_partial_sync: None,
      last_full_sync: None,
      last_inbox_download: None,
      last_full_inbox_download: None,
      contact_id: ArcSwap::new(Id::nil()),
    };
    if linkedin.warmup_enabled && linkedin.warmup_period_days.is_none() {
      return Err(JaniumError::ext_msg("Warmup enabled but warmup period days is not set"));
    }
    if linkedin.warmup_enabled && linkedin.warmup_starting_connection_requests_per_day.is_none() {
      return Err(JaniumError::ext_msg(
        "Warmup enabled but starting connection requests per week is not set",
      ));
    }
    Ok(linkedin)
  }
}

pub struct PendingEvaluation {
  evaluation_id: u64,
  /// Map of campaign_id → response. `None` means still waiting for response.
  campaign_responses: std::collections::HashMap<Id<Campaign>, Option<CandidateResponse>>,
  created_at: Timestamp,
}

impl PendingEvaluation {
  /// All campaigns have responded (no `None` values remain).
  fn all_received(&self) -> bool {
    self.campaign_responses.values().all(|v| v.is_some())
  }

  /// Returns the IDs of campaigns that haven't responded yet.
  fn waiting_on(&self) -> impl Iterator<Item = Id<Campaign>> + '_ {
    self
      .campaign_responses
      .iter()
      .filter_map(|(k, v)| v.is_none().then_some(k))
      .copied()
  }

  /// How long this evaluation has been pending.
  const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2 * 60);

  fn is_timed_out(&self) -> bool {
    Timestamp::now().saturating_duration_since(self.created_at) >= Self::TIMEOUT
  }
}

pub struct LinkedInState {
  pub actor_state: super::ActorState<Self>,
  team_timezone: ArcSwap<TimeZone>,
  team_allowed_messaging_day_times: ArcSwap<crate::restrictions::WeeklyRestrictions>,
  #[allow(unused)]
  user_timezone: ArcSwap<TimeZone>,
  last_approved_action: Timestamp,
  next_approved_action: Timestamp,
  automator_runner_handle: Option<crate::automator::runner::AutomatorRunnerHandle>,
  campaigns: std::collections::HashMap<Id<Campaign>, Sender<Campaign>>,
  next_scheduled_evaluate: Option<Timestamp>,
  pending_evaluation: Option<PendingEvaluation>,
  evaluation_counter: u64,
}

impl LinkedInState {
  pub fn new(
    actor_state: super::ActorState<Self>,
    team_timezone: ArcSwap<TimeZone>,
    team_allowed_messaging_day_times: ArcSwap<crate::restrictions::WeeklyRestrictions>,
    user_timezone: ArcSwap<TimeZone>,
  ) -> Self {
    Self {
      actor_state,
      team_timezone,
      team_allowed_messaging_day_times,
      user_timezone,
      last_approved_action: Timestamp::now() - 5.minutes(),
      next_approved_action: Timestamp::now(),
      automator_runner_handle: None,
      campaigns: std::collections::HashMap::new(),
      next_scheduled_evaluate: None,
      pending_evaluation: None,
      evaluation_counter: 0,
    }
  }
  fn automator_runner_sender(&mut self) -> &mut Option<crate::automator::runner::AutomatorRunnerHandle> {
    if let Some(sender) = self.automator_runner_handle.as_ref().map(|h| &h.sender)
      && sender.is_closed()
    {
      self.automator_runner_handle = None;
    }
    &mut self.automator_runner_handle
  }
  pub async fn stop_user_access(&mut self) -> Option<Id<crate::automator::runner::KeepAlive<LinkedIn>>> {
    let handle = self.automator_runner_sender().as_mut()?;
    let sender = &handle.sender;
    let (tx, rx) = tokio::sync::oneshot::channel();
    sender
      .try_send(crate::automator::runner::AutomatorRunnerMessage::StopUserAccess(tx))
      .ok();
    rx.await.ok()
  }
  pub fn stop_automated_runner(&mut self) -> Option<tokio::sync::oneshot::Receiver<()>> {
    let sender = self.automator_runner_sender().take()?.sender;
    let (tx, rx) = tokio::sync::oneshot::channel();
    if let Err(e) = sender.try_send(crate::automator::runner::AutomatorRunnerMessage::Stop(tx)) {
      tokio::spawn(async move {
        sender.send(e.into_inner()).await.ok();
      });
    }
    Some(rx)
  }
  pub async fn start_automated_runner(
    &mut self,
    linkedin: &LinkedIn,
  ) -> Result<&tokio::sync::mpsc::Sender<crate::automator::runner::AutomatorRunnerMessage>> {
    if self
      .automator_runner_handle
      .as_ref()
      .is_none_or(|h| h.sender.is_closed())
    {
      tracing::debug!("Starting AutomatorRunner for LinkedIn {}", linkedin.id);
      let handle = crate::automator::runner::AutomatorRunner::create(
        linkedin.id,
        linkedin.team_id,
        linkedin.docker_username.clone(),
        linkedin.docker_hostname.clone(),
        // All user sessions (like linkedin) depend on this being stable, so don't change this.
        // Also, this logic is copied to
        linkedin.docker_host_mount().into(),
        u16::try_from(linkedin.base_port)
          .map_err(|_| JaniumError::msg(format!("Invalid base_port value: {}", linkedin.base_port)))?,
        linkedin.proxy_url.clone().map(Into::into),
        self.team_timezone.clone(),
        linkedin.contact_id.clone(),
        self.actor_state.clone(),
        self.actor_state.router.get_handle::<LinkedIn>(&linkedin.id)?,
      )
      .await?;
      tracing::debug!(
        linkedin_id = %linkedin.id,
        runner_id = %handle.runner_id,
        "Started new AutomatorRunner"
      );
      self.automator_runner_handle = Some(handle);
    }
    Ok(&self.automator_runner_handle.as_ref().unwrap().sender)
  }

  /// Called when a runner notifies that it has stopped.
  /// Only clears the sender if the runner_id matches the currently expected runner.
  pub fn handle_runner_stopped(&mut self, runner_id: Id<crate::automator::runner::RunnerInstance>) {
    if self
      .automator_runner_handle
      .as_ref()
      .is_some_and(|h| h.runner_id == runner_id)
    {
      tracing::debug!(
        ?runner_id,
        "Runner stopped notification matches current runner, clearing sender"
      );
      self.automator_runner_handle = None;
    } else {
      tracing::debug!(
        ?runner_id,
        expected = ?self.automator_runner_handle.as_ref().map(|h| h.runner_id),
        "Runner stopped notification does not match current runner, ignoring"
      );
    }
  }
}

#[must_use]
#[derive(Debug)]
pub enum RestrictionCheck {
  Allowed,
  Later(Timestamp),
  /// LinkedIn account is in failure lockout due to consecutive failures
  FailureLockout {
    failures: i64,
    until: Timestamp,
  },
}

/// Calculates the warmup-adjusted daily request value using linear interpolation.
///
/// # Arguments
/// * `warmup_starting_requests_for_today` - Starting daily value (scaled from weekly)
/// * `avg_requests_for_today` - Target daily value (scaled from weekly)
/// * `warmup_period_days` - Total days in warmup period
/// * `total_sending_days` - Days with sends so far
///
/// # Returns
/// The interpolated daily request value between starting and target
pub fn calculate_warmup_value(
  warmup_starting_requests_for_today: f64,
  avg_requests_for_today: f64,
  warmup_period_days: f64,
  total_sending_days: f64,
) -> f64 {
  let warmup_factor = total_sending_days / warmup_period_days;
  warmup_starting_requests_for_today + (avg_requests_for_today - warmup_starting_requests_for_today) * warmup_factor
}

impl LinkedIn {
  fn docker_host_mount(&self) -> StdString {
    format!("{}/{}", self.docker_host_mount, self.id)
  }
  async fn clean_container(&self, app_state: &AppState) -> Result<()> {
    crate::xpra::container::ContainerHandle::clean_mounted_dir(app_state, &self.docker_host_mount()).await
  }
  fn effective_restrictions(&self, state: &LinkedInState) -> WeeklyRestrictions {
    let team_restrictions = state.team_allowed_messaging_day_times.get();
    team_restrictions.intersect(
      &self
        .weekly_restrictions
        .clone()
        .unwrap_or_else(WeeklyRestrictions::always_allowed),
    )
  }
  pub async fn check_all_restrictions(
    &mut self,
    state: &mut LinkedInState,
    action: &LinkedInActionRequest,
    now: Timestamp,
  ) -> Result<RestrictionCheck> {
    let action_type = action.action.action_type();
    tracing::debug!(
      linkedin_id = ?self.id,
      action_id = ?action.id,
      ?action_type,
      "Starting restriction check"
    );
    // Evaluate settings to ensure that it has been updated for today.
    self.evaluate_settings(state, false, now).await?;
    let now = jiff::Zoned::new(now.into(), state.team_timezone.get().as_ref().clone().into());
    let tomorrow = now.tomorrow().unwrap().start_of_day().unwrap().timestamp().into();

    // Check restrictions first
    let effective_restrictions = self.effective_restrictions(state);
    if !effective_restrictions.is_allowed(&now) {
      let next_allowed = effective_restrictions.next_allowed_time(&now);
      let delayed_until = next_allowed.map(|t| t.timestamp().into()).unwrap_or(tomorrow);
      tracing::info!(
        linkedin_id = ?self.id,
        action_id = ?action.id,
        effective_restriction = ?effective_restrictions.restriction_for(&now),
        current_time = %now,
        delayed_until = ?delayed_until,
        "RESTRICTION: restrictions not met"
      );
      return Ok(RestrictionCheck::Later(delayed_until));
    }

    if now.time() < self.today_executable_window_start.start() {
      let span = self.today_executable_window_start.0.duration_since(now.time());
      let future = now.timestamp() + span;
      tracing::info!(
        linkedin_id = ?self.id,
        action_id = ?action.id,
        current_time = %now.time(),
        window_start = %self.today_executable_window_start,
        delayed_until = ?Timestamp::from(future),
        "RESTRICTION: Before today's executable window start"
      );
      return Ok(RestrictionCheck::Later(future.into()));
    }
    if now.time() > self.today_executable_window_end.end() {
      tracing::info!(
        linkedin_id = ?self.id,
        action_id = ?action.id,
        current_time = %now.time(),
        window_end = %self.today_executable_window_end,
        delayed_until = ?tomorrow,
        "RESTRICTION: After today's executable window end"
      );
      return Ok(RestrictionCheck::Later(tomorrow));
    }
    if !action_type.is_read_only() && now.timestamp() < state.next_approved_action.0 {
      let delayed_until = state.next_approved_action;
      let time_since_last_action = now.timestamp().since(state.last_approved_action.0);
      tracing::info!(
        linkedin_id = ?self.id,
        action_id = ?action.id,
        last_approved_action = ?state.last_approved_action,
        next_approved_action = ?state.next_approved_action,
        time_since_last_action = ?time_since_last_action,
        delayed_until = ?delayed_until,
        "RESTRICTION: Minimum delay between actions not met (5 min required)"
      );
      return Ok(RestrictionCheck::Later(delayed_until));
    }
    if !action_type.is_read_only() {
      let failures_since_last_success = LinkedInActionRequest::failures_since_last_success(
        self.team_id,
        self.id,
        action_type,
        &mut *state.actor_state.db.acquire().await?,
      )
      .await?;
      // If too many consecutive failures, enter lockout mode
      tracing::debug!(
        linkedin_id = ?self.id,
        action_id = ?action.id,
        failures_since_last_success,
        max_consecutive_errors = self.max_consecutive_errors,
        "Failure lockout check"
      );
      if failures_since_last_success
        >= self
          .max_consecutive_errors
          .unwrap_or(state.actor_state.opts.default_max_consecutive_errors) as i64
      {
        let until = Timestamp::now() + LinkedInActionRequest::FAILURE_LOCKOUT_WINDOW_MINUTES.minutes();
        tracing::warn!(
          linkedin_id = ?self.id,
          ?action_type,
          failures = failures_since_last_success,
          lockout_until = ?until,
          "LinkedIn account in failure lockout - {} consecutive failures, locked until {:?}",
          failures_since_last_success,
          until
        );
        return Ok(RestrictionCheck::FailureLockout {
          failures: failures_since_last_success,
          until,
        });
      }
    }
    self.check_required_restrictions(state, action, now.into(), false).await
  }
  pub async fn check_required_restrictions(
    &self,
    state: &mut LinkedInState,
    action: &LinkedInActionRequest,
    now: Timestamp,
    skip_optional_checks: bool,
  ) -> Result<RestrictionCheck> {
    let action_type = action.action.action_type();
    if action_type == LinkedInActionType::SendConnectionRequest {
      let now = jiff::Zoned::new(now.into(), state.team_timezone.get().as_ref().clone().into());
      let tomorrow = now.tomorrow().unwrap().start_of_day().unwrap().timestamp().into();
      let mut conn = state.actor_state.db.acquire().await?;
      let (today_count, week_count) = LinkedInActionRequest::daily_weekly_counts(
        self.team_id,
        self.id,
        LinkedInActionType::SendConnectionRequest,
        now,
        &mut conn,
      )
      .await?;
      let effective_weekly_max = self.max_connection_requests_per_week.min(100) as i64;
      let effective_daily_max = if skip_optional_checks {
        self.max_connection_requests_per_day as i64
      } else {
        self
          .today_max_connection_requests
          .min(self.max_connection_requests_per_day) as i64
      };
      tracing::debug!(
        linkedin_id = ?self.id,
        action_id = ?action.id,
        today_count,
        week_count,
        effective_daily_max,
        effective_weekly_max,
        "Connection request rate limit check"
      );
      // Absolute maximum of 100 connection requests per week to stay within LinkedIn's limits.
      // User-configured limits are respected but cannot exceed this safety threshold.
      if week_count >= effective_weekly_max {
        tracing::info!(
          linkedin_id = ?self.id,
          action_id = ?action.id,
          week_count,
          effective_weekly_max,
          delayed_until = ?tomorrow,
          "RESTRICTION: Weekly connection request limit reached"
        );
        return Ok(RestrictionCheck::Later(tomorrow));
      }
      // Absolute maximum of 30 connection requests per day to stay within LinkedIn's limits.
      // User-configured limits are respected but cannot exceed this safety threshold.
      if today_count >= effective_daily_max {
        let delayed_until = Timestamp::now() + std::time::Duration::from_secs(30 * 60);
        tracing::info!(
          linkedin_id = ?self.id,
          action_id = ?action.id,
          today_count,
          effective_daily_max,
          delayed_until = ?delayed_until,
          "RESTRICTION: Daily connection request limit reached"
        );
        return Ok(RestrictionCheck::Later(delayed_until));
      }
    }

    tracing::info!(
      linkedin_id = ?self.id,
      action_id = ?action.id,
      ?action_type,
      "All restriction checks PASSED"
    );
    Ok(RestrictionCheck::Allowed)
  }
  async fn check_restrictions(
    &mut self,
    state: &mut LinkedInState,
    action: &LinkedInActionRequest,
    now: Timestamp,
    skip_optional_checks: bool,
  ) -> Result<RestrictionCheck> {
    if skip_optional_checks {
      self
        .check_required_restrictions(state, action, now, skip_optional_checks)
        .await
    } else {
      self.check_all_restrictions(state, action, now).await
    }
  }
  pub async fn evaluate_settings(&mut self, state: &mut LinkedInState, force: bool, now: Timestamp) -> Result<()> {
    let timezone = state.team_timezone.get().as_ref().clone();
    let now = jiff::Zoned::new(now.into(), timezone.clone().into());
    let last_options_updated = jiff::Zoned::new(self.today_options_updated.into(), timezone.into());
    if force || last_options_updated.date() < now.date() {
      // Intersect team and LinkedIn restrictions to get the effective restrictions
      let team_restrictions = state.team_allowed_messaging_day_times.get();
      let effective_restrictions = team_restrictions.intersect(
        &self
          .weekly_restrictions
          .clone()
          .unwrap_or_else(WeeklyRestrictions::always_allowed),
      );

      let window = effective_restrictions
        .choose_window_with_span_in_restriction(&now, jiff::Span::new().hours(3))
        .unwrap_or_default();
      let today_active_seconds = effective_restrictions
        .restriction_for(&now)
        .map_or(0, |r| r.active_seconds()) as f64;
      let remaining_active_seconds = effective_restrictions.remaining_active_seconds(now.weekday()) as f64;
      let weekly_max = f64::from(self.max_connection_requests_per_week);

      // Query how many connection requests have been sent this week
      let (_, week_count) = LinkedInActionRequest::daily_weekly_counts(
        self.team_id,
        self.id,
        LinkedInActionType::SendConnectionRequest,
        now.clone(),
        &mut *state.actor_state.db.acquire().await?,
      )
      .await?;
      let remaining_requests = (weekly_max - week_count as f64).max(0.0);

      // Distribute remaining requests proportionally by today's sending hours vs remaining sending hours
      let avg_requests_for_today = if remaining_active_seconds > 0.0 {
        today_active_seconds / remaining_active_seconds * remaining_requests
      } else {
        0.0
      };

      let avg_requests_for_today = if self.warmup_enabled
        && let Some(warmup_period_days) = self.warmup_period_days
        && let Some(warmup_starting_connection_requests_per_day) = self.warmup_starting_connection_requests_per_day
      {
        let total_sending_days = LinkedInActionHistory::total_sending_days(
          &state.actor_state.db,
          self.team_id,
          self.id,
          LinkedInActionType::SendConnectionRequest,
          // Need at least one active day per week meaning that the farthest back we have to go is 7 times the number of days in the warmup period
          Timestamp::from((&now - (warmup_period_days * 7).days()).start_of_day().unwrap()),
        )
        .await?;
        if total_sending_days >= i64::from(warmup_period_days) {
          self.warmup_enabled = false;
          avg_requests_for_today
        } else {
          let warmup_starting_requests_for_today = f64::from(warmup_starting_connection_requests_per_day);
          calculate_warmup_value(
            warmup_starting_requests_for_today,
            avg_requests_for_today,
            i64::from(warmup_period_days) as f64,
            total_sending_days as f64,
          )
        }
      } else {
        avg_requests_for_today
      };
      let avg_requests_for_today = avg_requests_for_today.round();
      let variation = self.daily_connection_requests_variation_pct as f64 / 100.0;
      let lower_bound = (avg_requests_for_today * (1.0 - variation)).max(4.0).round() as i16;
      let upper_bound = (avg_requests_for_today * (1.0 + variation)).round() as i16;
      self.today_max_connection_requests = if lower_bound >= upper_bound {
        lower_bound
      } else {
        rand::rng().random_range(lower_bound..=upper_bound)
      };
      self.today_max_connection_requests = self
        .today_max_connection_requests
        .min(self.max_connection_requests_per_day);
      self.today_executable_window_start = window.0;
      self.today_executable_window_end = effective_restrictions
        .restriction_for(&now)
        .map_or(jiff::civil::Time::MIN.into(), |r| r.end().into());
      tracing::debug!(
        %self.today_executable_window_start,
        %self.today_executable_window_end,
        avg_requests_for_today,
        self.today_max_connection_requests,
        "Evaluating LinkedIn settings"
      );
      self.today_options_updated = Timestamp::now();
      let mut conn = state.actor_state.db.acquire().await?;
      self.clone().save(&mut conn).await?;
      LinkedInActionRequest::delete_old_tasks(&mut conn).await?;

      // Schedule daily connection sync if needed (only on natural day rollover, not forced re-evaluations)
      let already_synced_today = force
        || self
          .last_partial_sync
          .map(|t| jiff::Zoned::new(t.into(), now.time_zone().clone()).date() == now.date())
          .unwrap_or(false)
        || self
          .last_full_sync
          .map(|t| jiff::Zoned::new(t.into(), now.time_zone().clone()).date() == now.date())
          .unwrap_or(false);

      let is_sending_day = effective_restrictions.restriction_for(&now).is_some();

      if !already_synced_today && is_sending_day {
        let full_sync = self
          .last_full_sync
          .is_none_or(|t| t < Timestamp::now() - (30 * 24).hours());

        let window_start_today = now
          .with()
          .time(self.today_executable_window_start.start())
          .build()
          .unwrap();
        let random_offset_minutes = rand::rng().random_range(20..=120);
        let sync_at: Timestamp = (window_start_today.timestamp() - random_offset_minutes.minutes()).into();
        let sync_at = if sync_at <= Timestamp::now() {
          Timestamp::now() + 30.seconds()
        } else {
          sync_at
        };

        tracing::debug!(
          %sync_at,
          full_sync,
          "Scheduling daily connection sync"
        );

        state.actor_state.scheduler.spawn_notify(super::scheduler::Schedule {
          execute_at: sync_at,
          kind: super::scheduler::ScheduledTaskKind::SyncLinkedInConnections {
            team_id: self.team_id,
            linkedin_id: self.id,
            full_sync,
          },
          retry_policy: Some(super::scheduler::RetryPolicy {
            max_retries: 2,
            retry_delay_ms: 5 * 60 * 1000,
          }),
        });
      }
    }

    // Schedule inbox download (runs every ~3 hours, not tied to sending days).
    // Always schedule 2.5 hours out — the scheduler deduplicates by (team_id, linkedin_id),
    // so if one is already pending this is a no-op.
    {
      let full_sync = self
        .last_full_inbox_download
        .is_none_or(|t| t < Timestamp::now() - (30 * 24).hours());

      tracing::debug!(full_sync, "Scheduling inbox download");

      state.actor_state.scheduler.spawn_notify(super::scheduler::Schedule {
        execute_at: Timestamp::now() + 150.minutes(),
        kind: super::scheduler::ScheduledTaskKind::DownloadInbox {
          team_id: self.team_id,
          linkedin_id: self.id,
          full_sync,
        },
        retry_policy: Some(super::scheduler::RetryPolicy {
          max_retries: 2,
          retry_delay_ms: 5 * 60 * 1000,
        }),
      });
    }

    Ok(())
  }

  /// Bootstrap EvaluateLinkedIn scheduling if not already scheduled or past due.
  /// Called from `LinkedIn::start()`.
  pub fn bootstrap_evaluate(&self, state: &mut LinkedInState) {
    let now = Timestamp::now();
    if state.next_scheduled_evaluate.is_none_or(|t| t <= now) {
      let tz = state.team_timezone.get().as_ref().clone();
      let now = jiff::Zoned::new(now.into(), tz.into());
      let schedule_at = if now.time() >= self.today_executable_window_start.start()
        && now.time() <= self.today_executable_window_end.end()
      {
        now.timestamp() + 5.seconds()
      } else if now.time() < self.today_executable_window_start.start() {
        let span = self.today_executable_window_start.0.duration_since(now.time());
        now.timestamp() + span
      } else {
        now.tomorrow().unwrap().start_of_day().unwrap().timestamp()
      };
      EvaluateLinkedIn::schedule_next(state, &self.id, schedule_at.into());
    }
  }

  pub async fn save(self, db: &mut sqlx::PgConnection) -> Result<Self> {
    self
      .insert(db)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        Self::primary_key().unwrap(),
      ))
      .await
      .map_err(Into::into)
  }
  async fn apply_mutation(&mut self, mutation: MutateLinkedIn, state: &mut LinkedInState) -> Result<Self> {
    let MutateLinkedIn {
      primary_user_id,
      max_pending_connection_requests,
      max_connection_requests_per_week,
      max_connection_requests_per_day,
      daily_connection_requests_variation_pct,
      minimum_delay_between_connection_requests_ms,
      weekly_restrictions,
      warmup_enabled,
      warmup_period_days,
      warmup_starting_connection_requests_per_day,
      max_consecutive_errors,
      proxy_url,
      today_max_connection_requests,
      today_executable_window_start,
      today_executable_window_end,
    } = mutation;
    let start_hash = crate::util::hash(&*self);
    let now = Timestamp::now();
    let mut force_evaluate_settings = false;
    // anything that can fail validation needs to be done up front to avoid partial updates if we don't just clone the entire struct
    if let Some(weekly_restrictions) = weekly_restrictions.0 {
      if let Some(weekly_restrictions) = &weekly_restrictions {
        weekly_restrictions.validate()?;
      }
      force_evaluate_settings = self.weekly_restrictions != weekly_restrictions;
      self.weekly_restrictions = weekly_restrictions;
    }
    self.primary_user_id = primary_user_id.unwrap_or(self.primary_user_id);
    self.max_pending_connection_requests =
      max_pending_connection_requests.unwrap_or(self.max_pending_connection_requests);
    self.max_connection_requests_per_week =
      max_connection_requests_per_week.unwrap_or(self.max_connection_requests_per_week);
    self.max_connection_requests_per_day =
      max_connection_requests_per_day.unwrap_or(self.max_connection_requests_per_day);
    self.daily_connection_requests_variation_pct =
      daily_connection_requests_variation_pct.unwrap_or(self.daily_connection_requests_variation_pct);
    self.minimum_delay_between_connection_requests_ms =
      minimum_delay_between_connection_requests_ms.unwrap_or(self.minimum_delay_between_connection_requests_ms);
    if let Some(warmup_enabled) = warmup_enabled {
      self.warmup_enabled = warmup_enabled;
    }
    if let Some(warmup_period_days) = warmup_period_days.0 {
      self.warmup_period_days = warmup_period_days;
    }
    if let Some(warmup_starting_connection_requests_per_day) = warmup_starting_connection_requests_per_day.0 {
      self.warmup_starting_connection_requests_per_day = warmup_starting_connection_requests_per_day;
    }
    if let Some(max_consecutive_errors) = max_consecutive_errors.0 {
      self.max_consecutive_errors = max_consecutive_errors;
    }
    if let Some(proxy_url) = proxy_url.0 {
      self.proxy_url = proxy_url;
    }
    if force_evaluate_settings {
      self.evaluate_settings(&mut *state, true, now).await?;
    }
    if let Some(today_max_connection_requests) = today_max_connection_requests {
      self.today_max_connection_requests = today_max_connection_requests;
      self.today_options_updated = now;
    }
    if let Some(today_executable_window_start) = today_executable_window_start {
      self.today_executable_window_start = today_executable_window_start;
      self.today_options_updated = now;
    }
    if let Some(today_executable_window_end) = today_executable_window_end {
      self.today_executable_window_end = today_executable_window_end;
      self.today_options_updated = now;
    }
    if self.warmup_enabled
      && (self.warmup_period_days.is_none() || self.warmup_starting_connection_requests_per_day.is_none())
    {
      return Err(JaniumError::ext_msg(
        "Warmup enabled but warmup period days or starting connection requests per week is not set",
      ));
    }
    if start_hash != crate::util::hash(&*self) {
      let mut conn = state.actor_state.db.acquire().await?;
      self.clone().save(&mut conn).await
    } else {
      Ok(self.clone())
    }
  }

  /// Fetch conversations for this LinkedIn account.
  ///
  /// When `include_messages` is true, messages for the top conversations are loaded
  /// in a second query. When false, only the stored conversation metadata is returned.
  pub async fn conversations(
    &self,
    db: &sqlx::PgPool,
    limit: Option<i64>,
    before_timestamp: Option<Timestamp>,
    include_messages: bool,
  ) -> Result<Vec<LinkedInConversation>> {
    let limit = limit.unwrap_or(50);
    let before = before_timestamp.unwrap_or(Timestamp::MAX);

    let mut conversations = sqlx::query_as::<_, LinkedInConversation>(
      "SELECT * FROM linkedin_conversations
       WHERE linkedin_id = $1 AND last_message_at <= $2
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT $3",
    )
    .bind(self.id)
    .bind(before)
    .bind(limit)
    .fetch_all(db)
    .await?;

    if include_messages && !conversations.is_empty() {
      let conv_ids: Vec<Id<LinkedInConversation>> = conversations.iter().map(|c| c.id).collect();
      let messages = sqlx::query_as::<_, LinkedInMessage>(
        "SELECT * FROM linkedin_messages
         WHERE conversation_id = ANY($1)
         ORDER BY conversation_id, timestamp DESC NULLS LAST",
      )
      .bind(&conv_ids)
      .fetch_all(db)
      .await?;

      let mut conv_map: std::collections::HashMap<Id<LinkedInConversation>, &mut Vec<LinkedInMessage>> =
        conversations.iter_mut().map(|c| (c.id, &mut c.messages)).collect();

      for msg in messages {
        if let Some(messages) = conv_map.get_mut(&msg.conversation_id) {
          messages.push(msg);
        }
      }
    }

    Ok(conversations)
  }
}

impl Actor for LinkedIn {
  type Id = Id<LinkedIn>;
  type IdRef = Id<LinkedIn>;
  type State = LinkedInState;
  type StartResult = ();

  fn id(&self) -> Self::Id {
    self.id
  }

  fn id_ref(&self) -> &Self::IdRef {
    &self.id
  }

  async fn start(&mut self, _router: &Router, state: &mut Self::State) -> janium_actors::DynResult<Self::StartResult> {
    self.evaluate_settings(state, false, Timestamp::now()).await?;
    self.bootstrap_evaluate(state);
    Ok(())
  }

  async fn stop(&mut self, _router: Router, mut state: Self::State) -> janium_actors::DynResult {
    let result = state.stop_automated_runner();
    if let Some(receiver) = result {
      // Wait up to 30 seconds for clean shutdown
      tokio::time::timeout(std::time::Duration::from_secs(30), receiver)
        .await
        .ok();
    }
    Ok(())
  }
}

#[gql::Object(name = "LinkedInQuery")]
impl GqlQuery<LinkedIn> {
  async fn get(&self) -> Result<LinkedIn> {
    self
      .sender
      .send(super::Query::new(|l: &LinkedIn, _, _| l.clone()))
      .await
      .map_err(Into::into)
  }
  async fn action_requests(&self) -> Result<Vec<LinkedInActionRequest>> {
    sqlx::query_as::<_, LinkedInActionRequest>(
      "select * from linkedin_action_requests where (($1 = 1) or (team_id = $2 and linkedin_id = $3))",
    )
    .bind(crate::auth::CLAIMS.with(|claims| claims.privileges.allows(Privilege::SuperAdmin)) as i32)
    .bind(self.team.id())
    .bind(self.sender.id())
    .fetch_all(&self.app_state.db)
    .await
    .map_err(Into::into)
  }
  async fn action_request_history(
    &self,
    limit: Option<i64>,
    max_completed_at: Option<Timestamp>,
  ) -> Result<Vec<LinkedInActionHistory>> {
    sqlx::query_as::<_, LinkedInActionHistory>(
      "select *
      from linkedin_action_history
      where (($1 = 1) or (team_id = $2 and linkedin_id = $3))
        and completed_at < $4
      order by completed_at desc
      limit $5",
    )
    .bind(crate::auth::CLAIMS.with(|claims| claims.privileges.allows(Privilege::SuperAdmin)) as i32)
    .bind(self.team.id())
    .bind(self.sender.id())
    .bind(max_completed_at.unwrap_or(Timestamp::MAX))
    .bind(limit.unwrap_or(100))
    .fetch_all(&self.app_state.db)
    .await
    .map_err(Into::into)
  }
  async fn action_request_failures(&self, limit: Option<i64>) -> Result<Vec<LinkedInActionFailure>> {
    LinkedInActionFailure::query_for_gql(&self.app_state.db, *self.team.id(), *self.sender.id(), limit).await
  }

  async fn conversations(
    &self,
    ctx: &gql::Context<'_>,
    limit: Option<i64>,
    before_timestamp: Option<Timestamp>,
  ) -> Result<Vec<LinkedInConversation>> {
    let wants_messages = ctx.look_ahead().field("messages").exists();
    let linkedin: LinkedIn = self
      .sender
      .send(super::Query::new(|l: &LinkedIn, _, _| l.clone()))
      .await?;
    linkedin
      .conversations(&self.app_state.db, limit, before_timestamp, wants_messages)
      .await
  }
}

#[gql::Object(name = "LinkedInMutation")]
impl GqlMutation<LinkedIn> {
  pub async fn modify(&self, mutation: MutateLinkedIn) -> Result<LinkedIn> {
    // self.sender.send(mutation).await?
    self
      .sender
      .send(
        async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
          actor.apply_mutation(mutation, state).await
        },
      )
      .await?
  }
  pub async fn get(&self) -> Result<LinkedIn> {
    self
      .sender
      .send(super::Query::new(|l: &LinkedIn, _, _| l.clone()))
      .await
      .map_err(Into::into)
  }
  pub async fn start_browser(&self) -> Result<StdString> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    self
      .sender
      .notify(
        async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
          state
            .start_automated_runner(actor)
            .await?
            .send(crate::automator::runner::AutomatorRunnerMessage::StartUserAccess(
              sender,
            ))
            .await
            .map_err(|e| {
              JaniumError::msg(format!(
                "Error sending StartUserAccess message to AutomatorRunner for {}: {e}",
                actor.id
              ))
            })?;
          Ok::<_, JaniumError>(())
        },
      )
      .await?;
    let result = receiver.await.map_err(|e| JaniumError::any(e))?;
    let id = result?;
    Ok(format!("/browser/{id}/index.html"))
  }
  pub async fn stop_browser(&self) -> Result<bool> {
    let _ = self
      .sender
      .send(
        async move |_actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| state.stop_user_access().await,
      )
      .await?;
    Ok(true)
  }
  pub async fn start_container(&self) -> Result<bool> {
    self
      .sender
      .send(
        async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
          state.start_automated_runner(actor).await?;
          Ok::<_, JaniumError>(())
        },
      )
      .await??;
    Ok(true)
  }
  pub async fn stop_container(&self) -> Result<bool> {
    let result = self
      .sender
      .send(
        async move |_actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| state.stop_automated_runner(),
      )
      .await?;
    if let Some(receiver) = result {
      // Wait up to 30 seconds for clean shutdown
      tokio::time::timeout(std::time::Duration::from_secs(30), receiver)
        .await
        .ok();
    }
    Ok(true)
  }
  pub async fn clean_container(&self, ctx: &gql::Context<'_>) -> Result<bool> {
    self.stop_container(ctx).await?;
    self
      .sender
      .send(
        async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
          actor.clean_container(&state.actor_state).await
        },
      )
      .await??;
    Ok(true)
  }
  pub async fn create_contact_list(&self, list_name: StdString, sales_nav_query: StdString) -> Result<Id<ContactList>> {
    let contact_list = ContactList::new(
      *self.team.id(),
      list_name,
      Some(*self.sender.id()),
      Some(sales_nav_query.clone()),
      None,
    );
    let id = contact_list.id;
    self
      .team
      .send(async move |_: &mut Team, _: &Router, state: &mut TeamState| {
        state.append_contact_list(contact_list, None).await?;
        Ok::<_, JaniumError>(())
      })
      .await??;
    self
      .sender
      .send(
        async move |actor: &mut LinkedIn, _: &Router, state: &mut LinkedInState| {
          let sender = state.start_automated_runner(actor).await?;
          sender
            .send(crate::automator::runner::AutomatorRunnerMessage::Automate(
              LinkedInActionRequest::new(
                LinkedInAction::ScrapeSalesNavQuery(ScrapeSalesNavQuery {
                  sales_navigator_url: sales_nav_query,
                  max_pages_to_scrape: None,
                  download_full_profile_info: false,
                  max_profiles_per_page: None,
                  contact_list_id: id,
                }),
                actor.team_id,
                actor.id,
                None,
                None,
                None,
                Timestamp::now() + std::time::Duration::from_secs(60 * 60 * 24),
                None,
              ),
            ))
            .await
            .map_err(|e| {
              JaniumError::msg(format!(
                "Error sending ScrapeSalesNavQuery message to AutomatorRunner for {}: {e}",
                actor.id
              ))
            })?;
          Ok::<_, JaniumError>(())
        },
      )
      .await??;
    Ok(id)
  }
  async fn retry_action_failure(
    &self,
    action_request_id: Id<LinkedInActionRequest>,
  ) -> Result<Id<LinkedInActionRequest>> {
    let action_failure = LinkedInActionFailure::fetch_one(action_request_id, &self.app_state.db).await?;
    if action_failure.team_id != crate::auth::CLAIMS.with(|claims| claims.team_id) {
      return Err(JaniumError::not_found(action_request_id));
    }
    let new_request = LinkedInActionRequest::new(
      action_failure.action,
      action_failure.team_id,
      action_failure.linkedin_id,
      action_failure.campaign_id,
      action_failure.campaign_step_id,
      action_failure.contact_id,
      // If it isn't picked up in 1 hour, it will be cancelled
      Timestamp::now() + std::time::Duration::from_secs(60 * 60),
      Some(0),
    )
    .with_skip_optional_checks(true);
    let id = new_request.id;
    self.sender.send(new_request).await??;
    Ok(id)
  }
  #[graphql(name = "syncConnections")]
  async fn sync_connections_gql(&self, full_sync: bool) -> Result<Id<LinkedInActionRequest>> {
    let new_request = LinkedInActionRequest::new(
      LinkedInAction::SyncConnections(SyncConnections { full_sync }),
      *self.team.id(),
      *self.sender.id(),
      None,
      None,
      None,
      Timestamp::now() + 3.hours(),
      Some(0),
    )
    .with_skip_optional_checks(true);
    let id = new_request.id;
    self.sender.send(new_request).await??;
    Ok(id)
  }
  #[graphql(name = "sendMessage")]
  async fn send_message_gql(
    &self,
    contact_id: Id<Contact>,
    message_content: StdString,
  ) -> Result<Id<LinkedInActionRequest>> {
    let contact = self
      .app_state
      .contact_service
      .get(&contact_id)
      .await?
      .ok_or_else(|| JaniumError::not_found(contact_id))?;
    let contact_name = contact
      .inner
      .full_name
      .clone()
      .unwrap_or_else(|| format!("Contact {}", contact_id));
    let new_request = LinkedInActionRequest::new(
      LinkedInAction::SendMessage(SendMessage {
        contact_id,
        contact_name,
        message_content,
        skip_response_check: true,
      }),
      *self.team.id(),
      *self.sender.id(),
      None,
      None,
      Some(contact_id),
      Timestamp::now() + 1.hours(),
      Some(0),
    )
    .with_skip_optional_checks(true);
    let id = new_request.id;
    self.sender.send(new_request).await??;
    Ok(id)
  }
}

#[derive(Debug, gql::InputObject)]
pub struct MutateLinkedIn {
  primary_user_id: Option<Id<User>>,
  max_pending_connection_requests: Option<i16>,
  max_connection_requests_per_week: Option<i16>,
  max_connection_requests_per_day: Option<i16>,
  daily_connection_requests_variation_pct: Option<i16>,
  minimum_delay_between_connection_requests_ms: Option<i32>,
  weekly_restrictions: OptionPatch<WeeklyRestrictions>,
  warmup_enabled: Option<bool>,
  warmup_period_days: OptionPatch<i16>,
  warmup_starting_connection_requests_per_day: OptionPatch<i16>,
  max_consecutive_errors: OptionPatch<i16>,
  proxy_url: OptionPatch<StdString>,
  today_max_connection_requests: Option<i16>,
  today_executable_window_start: Option<Time>,
  today_executable_window_end: Option<Time>,
}

impl Message<LinkedIn> for MutateLinkedIn {
  type Return = Result<LinkedIn>;
  #[tracing::instrument(skip_all, fields(linkedin_id = %actor.id, team_id = %actor.team_id))]
  async fn handle(self, actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState) -> Self::Return {
    actor.apply_mutation(self, state).await
  }
}

pub struct SyncCompleted {
  pub full_sync: bool,
}

impl Message<LinkedIn> for SyncCompleted {
  type Return = Result<()>;
  #[tracing::instrument(skip_all, fields(linkedin_id = %actor.id, full_sync = %self.full_sync))]
  async fn handle(self, actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState) -> Self::Return {
    let now = Timestamp::now();
    actor.last_partial_sync = Some(now);
    if self.full_sync {
      actor.last_full_sync = Some(now);
    }
    actor.clone().save(&mut *state.actor_state.db.acquire().await?).await?;
    tracing::info!("Sync completed successfully");
    Ok(())
  }
}

pub struct SetLinkedInLastActive {
  pub logged_in: Timestamp,
  pub sales_navigator_active: Option<Timestamp>,
}

impl Message<LinkedIn> for SetLinkedInLastActive {
  type Return = Result<()>;
  #[tracing::instrument(skip_all, fields(linkedin_id = %actor.id, team_id = %actor.team_id))]
  async fn handle(self, actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState) -> Self::Return {
    actor.login_active_last_validated = Some(self.logged_in);
    if let Some(sales_navigator_active) = self.sales_navigator_active {
      actor.sales_navigator_active_last_validated = Some(sales_navigator_active);
    }
    actor.clone().save(&mut *state.actor_state.db.acquire().await?).await?;
    Ok(())
  }
}

pub struct SetLinkedInInactive;

impl Message<LinkedIn> for SetLinkedInInactive {
  type Return = Result<()>;
  #[tracing::instrument(skip_all, fields(linkedin_id = %actor.id, team_id = %actor.team_id))]
  async fn handle(self, actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState) -> Self::Return {
    actor.login_active_last_validated = None;
    actor.sales_navigator_active_last_validated = None;
    actor.clone().save(&mut *state.actor_state.db.acquire().await?).await?;
    Ok(())
  }
}

pub struct SetLinkedInConnectionsCount {
  pub count: i16,
}

impl Message<LinkedIn> for SetLinkedInConnectionsCount {
  type Return = Result<()>;
  #[tracing::instrument(skip_all, fields(linkedin_id = %actor.id, team_id = %actor.team_id, count = %self.count))]
  async fn handle(self, actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState) -> Self::Return {
    actor.connections = self.count;
    actor.clone().save(&mut *state.actor_state.db.acquire().await?).await?;
    tracing::info!("Updated LinkedIn connections count to {}", self.count);
    Ok(())
  }
}

/// Notification sent by the AutomatorRunner when it experiences persistent failures
/// (3+ consecutive container/infrastructure failures)
pub struct RunnerPersistentFailure {
  pub runner_id: Id<crate::automator::runner::RunnerInstance>,
  pub error: StdString,
}

impl Message<LinkedIn> for RunnerPersistentFailure {
  type Return = ();
  #[tracing::instrument(skip_all, fields(linkedin_id = %actor.id))]
  async fn handle(self, actor: &mut LinkedIn, _router: &Router, _state: &mut LinkedInState) -> Self::Return {
    // Log the persistent failure for visibility
    // In the future, this could trigger user notifications or disable automation
    tracing::error!(
      linkedin_id = %actor.id,
      runner_id = %self.runner_id,
      error = %self.error,
      "AutomatorRunner experienced persistent failures - infrastructure issue detected"
    );
  }
}

/// Notification sent by the AutomatorRunner when it stops/exits
pub struct RunnerStopped {
  pub runner_id: Id<crate::automator::runner::RunnerInstance>,
}

impl Message<LinkedIn> for RunnerStopped {
  type Return = ();
  #[tracing::instrument(skip_all, fields(linkedin_id = %actor.id))]
  async fn handle(self, actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState) -> Self::Return {
    tracing::debug!(
      linkedin_id = %actor.id,
      runner_id = %self.runner_id,
      "Received runner stopped notification"
    );
    state.handle_runner_stopped(self.runner_id);
  }
}

// --- Campaign registration and EvaluateLinkedIn ---

pub struct RegisterCampaign {
  pub sender: Sender<Campaign>,
}

impl Message<LinkedIn> for RegisterCampaign {
  type Return = Result<()>;

  async fn handle(self, actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState) -> Self::Return {
    let campaign_id = *self.sender.id();
    tracing::debug!(linkedin_id = %actor.id, %campaign_id, "Registering campaign");
    state.campaigns.insert(campaign_id, self.sender.clone());

    // If there's a pending evaluation in flight, ignore this campaign
    // since it will be picked up by the next evaluation
    Ok(())
  }
}

pub struct UnregisterCampaign {
  pub campaign_id: Id<Campaign>,
}

impl Message<LinkedIn> for UnregisterCampaign {
  type Return = ();

  async fn handle(self, actor: &mut LinkedIn, router: &Router, state: &mut LinkedInState) {
    tracing::debug!(linkedin_id = %actor.id, campaign_id = %self.campaign_id, "Unregistering campaign");
    state.campaigns.remove(&self.campaign_id);

    if let Some(pending) = state.pending_evaluation.as_mut() {
      pending.campaign_responses.remove(&self.campaign_id);
      if pending.all_received() {
        let pending = state.pending_evaluation.take().unwrap();
        EvaluateLinkedIn::resolve_evaluation(actor, state, router, pending).await;
      }
    }
  }
}

pub struct Candidate {
  pub contact_id: Id<crate::models::contact::Contact>,
  pub step_priority: i16,
}

pub struct CandidateResponse {
  pub evaluation_id: u64,
  pub campaign_id: Id<Campaign>,
  pub candidate: Option<Candidate>,
}

impl Message<LinkedIn> for CandidateResponse {
  type Return = ();

  async fn handle(self, actor: &mut LinkedIn, router: &Router, state: &mut LinkedInState) {
    let Some(pending) = state.pending_evaluation.as_mut() else {
      tracing::debug!(linkedin_id = %actor.id, "CandidateResponse with no pending evaluation, discarding");
      return;
    };

    if self.evaluation_id != pending.evaluation_id {
      tracing::debug!(
        linkedin_id = %actor.id,
        received = self.evaluation_id,
        expected = pending.evaluation_id,
        "Stale CandidateResponse, discarding"
      );
      return;
    }

    pending.campaign_responses.insert(self.campaign_id, Some(self));

    if pending.all_received() {
      let pending = state.pending_evaluation.take().unwrap();
      EvaluateLinkedIn::resolve_evaluation(actor, state, router, pending).await;
    }
  }
}

#[derive(Debug)]
pub struct EvaluateLinkedIn;

impl EvaluateLinkedIn {
  async fn resolve_evaluation(
    actor: &mut LinkedIn,
    state: &mut LinkedInState,
    _router: &Router,
    pending: PendingEvaluation,
  ) {
    // Pick the winner: lowest step_priority, with random tiebreaking
    let salt = Id::<()>::new();
    let winner = pending
      .campaign_responses
      .values()
      .filter_map(|r| r.as_ref())
      .filter_map(|r| r.candidate.as_ref().map(|c| (r.campaign_id, c)))
      .min_by(|(id_a, a), (id_b, b)| {
        a.step_priority.cmp(&b.step_priority).then_with(|| {
          let hash_a = crate::util::hash((id_a, &salt));
          let hash_b = crate::util::hash((id_b, &salt));
          hash_a.cmp(&hash_b)
        })
      });

    if let Some((campaign_id, candidate)) = winner {
      let contact_id = candidate.contact_id;
      tracing::info!(
        linkedin_id = %actor.id,
        %campaign_id,
        %contact_id,
        step_priority = candidate.step_priority,
        "Selected winning candidate, dispatching"
      );

      if let Some(sender) = state.campaigns.get(&campaign_id) {
        sender
          .clone()
          .into_sync()
          .spawn_notify(super::campaign::EvaluateCampaignContact {
            contact: contact_id,
            linkedin_id: Some(actor.id),
          });
      }

      // Safety net: schedule a fallback 12 min out. If the action succeeds, the
      // LinkedInActionRequest handler will reschedule sooner (5-10 min) via dedup.
      // If the campaign fails to process the contact, this ensures we don't go dormant.
      Self::schedule_next(state, &actor.id, Timestamp::now() + 12.minutes());
    } else {
      tracing::debug!(linkedin_id = %actor.id, "No candidates available, rescheduling in 30 min");
      Self::schedule_next(state, &actor.id, Timestamp::now() + 30.minutes());
    }
  }

  fn schedule_next(state: &mut LinkedInState, linkedin_id: &Id<LinkedIn>, execute_at: Timestamp) {
    // Limit execution to at most 30 minutes out
    let execute_at = execute_at.min(Timestamp::now() + 30.minutes());
    state.next_scheduled_evaluate = Some(execute_at);
    state.actor_state.scheduler.spawn_notify(super::scheduler::Schedule {
      execute_at,
      kind: super::scheduler::ScheduledTaskKind::EvaluateLinkedIn {
        linkedin_id: *linkedin_id,
      },
      retry_policy: None,
    });
  }
}

impl Message<LinkedIn> for EvaluateLinkedIn {
  type Return = Result<()>;

  #[tracing::instrument(skip_all, fields(linkedin_id = %actor.id))]
  async fn handle(self, actor: &mut LinkedIn, router: &Router, state: &mut LinkedInState) -> Self::Return {
    // Phase 1: Check restrictions
    actor.evaluate_settings(state, false, Timestamp::now()).await?;

    let now = Timestamp::now();
    let tz = state.team_timezone.get().as_ref().clone();
    let zoned = jiff::Zoned::new(now.into(), tz.into());
    let tomorrow = zoned.tomorrow().unwrap().start_of_day().unwrap().timestamp().into();

    // Check weekly restrictions
    let effective_restrictions = actor.effective_restrictions(state);
    if !effective_restrictions.is_allowed(&zoned) {
      let next_allowed = effective_restrictions.next_allowed_time(&zoned);
      let delayed_until = next_allowed.map(|t| t.timestamp().into()).unwrap_or(tomorrow);
      tracing::debug!(linkedin_id = %actor.id, ?delayed_until, "EvaluateLinkedIn: outside restriction window");
      Self::schedule_next(state, &actor.id, delayed_until);
      return Ok(());
    }

    // Check execution window
    if zoned.time() < actor.today_executable_window_start.start() {
      let span = actor.today_executable_window_start.0.duration_since(zoned.time());
      let delayed_until: Timestamp = (zoned.timestamp() + span).into();
      tracing::debug!(linkedin_id = %actor.id, ?delayed_until, "EvaluateLinkedIn: before window start");
      Self::schedule_next(state, &actor.id, delayed_until);
      return Ok(());
    }
    if zoned.time() > actor.today_executable_window_end.end() {
      tracing::debug!(linkedin_id = %actor.id, ?tomorrow, "EvaluateLinkedIn: after window end");
      Self::schedule_next(state, &actor.id, tomorrow);
      return Ok(());
    }

    // Check next_approved_action delay
    if now < state.next_approved_action {
      tracing::debug!(linkedin_id = %actor.id, next = ?state.next_approved_action, "EvaluateLinkedIn: waiting for next_approved_action");
      Self::schedule_next(state, &actor.id, state.next_approved_action);
      return Ok(());
    }

    // Check failure lockout
    let failures_since_last_success = LinkedInActionRequest::failures_since_last_success(
      actor.team_id,
      actor.id,
      LinkedInActionType::SendConnectionRequest,
      &mut *state.actor_state.db.acquire().await?,
    )
    .await?;
    if failures_since_last_success
      >= actor
        .max_consecutive_errors
        .unwrap_or(state.actor_state.opts.default_max_consecutive_errors) as i64
    {
      let until = Timestamp::now() + LinkedInActionRequest::FAILURE_LOCKOUT_WINDOW_MINUTES.minutes();
      tracing::warn!(linkedin_id = %actor.id, failures = failures_since_last_success, ?until, "EvaluateLinkedIn: failure lockout");
      Self::schedule_next(state, &actor.id, until);
      return Ok(());
    }

    // Check daily/weekly connection request limits
    {
      let zoned_now = jiff::Zoned::new(now.into(), state.team_timezone.get().as_ref().clone().into());
      let mut conn = state.actor_state.db.acquire().await?;
      let (today_count, week_count) = LinkedInActionRequest::daily_weekly_counts(
        actor.team_id,
        actor.id,
        LinkedInActionType::SendConnectionRequest,
        zoned_now,
        &mut conn,
      )
      .await?;
      let effective_weekly_max = actor.max_connection_requests_per_week.min(100) as i64;
      let effective_daily_max = actor
        .today_max_connection_requests
        .min(actor.max_connection_requests_per_day) as i64;
      if week_count >= effective_weekly_max {
        tracing::info!(linkedin_id = %actor.id, week_count, effective_weekly_max, "EvaluateLinkedIn: weekly limit reached");
        Self::schedule_next(state, &actor.id, tomorrow);
        return Ok(());
      }
      if today_count >= effective_daily_max {
        let delayed_until = Timestamp::now() + 30.minutes();
        tracing::info!(linkedin_id = %actor.id, today_count, effective_daily_max, "EvaluateLinkedIn: daily limit reached");
        Self::schedule_next(state, &actor.id, delayed_until);
        return Ok(());
      }
    }

    // All checks passed — fan out to campaigns
    if state.campaigns.is_empty() {
      tracing::debug!(linkedin_id = %actor.id, "EvaluateLinkedIn: no campaigns registered, rescheduling in 30 min");
      Self::schedule_next(state, &actor.id, Timestamp::now() + 30.minutes());
      return Ok(());
    }

    // Don't start a new evaluation if one is already in flight.
    // If it's timed out, force-resolve it so we don't go dormant.
    if let Some(pending) = &state.pending_evaluation {
      if pending.is_timed_out() {
        let waiting: Vec<_> = pending.waiting_on().collect();
        tracing::warn!(
          linkedin_id = %actor.id,
          evaluation_id = pending.evaluation_id,
          ?waiting,
          "EvaluateLinkedIn: pending evaluation timed out, force-resolving"
        );
        let pending = state.pending_evaluation.take().unwrap();
        Self::resolve_evaluation(actor, state, router, pending).await;
        return Ok(());
      }
      tracing::debug!(linkedin_id = %actor.id, "EvaluateLinkedIn: evaluation already in flight, skipping");
      return Ok(());
    }

    state.evaluation_counter += 1;
    let evaluation_id = state.evaluation_counter;

    let campaign_responses = state
      .campaigns
      .keys()
      .map(|id| (*id, None))
      .collect::<std::collections::HashMap<_, _>>();

    state.pending_evaluation = Some(PendingEvaluation {
      evaluation_id,
      campaign_responses,
      created_at: Timestamp::now(),
    });

    for sender in state.campaigns.values() {
      sender
        .clone()
        .into_sync()
        .spawn_notify(super::campaign::GetBestCandidate {
          linkedin_id: actor.id,
          evaluation_id,
        });
    }

    Ok(())
  }
}

/// Sent by Campaign to LinkedIn when EvaluateCampaignContact fails,
/// so the LinkedIn actor can immediately reschedule instead of waiting for the safety net.
pub struct EvaluateCampaignContactFailed {
  pub campaign_id: Id<Campaign>,
  pub contact_id: Id<crate::models::contact::Contact>,
}

impl Message<LinkedIn> for EvaluateCampaignContactFailed {
  type Return = ();

  async fn handle(self, actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState) {
    tracing::debug!(
      linkedin_id = %actor.id,
      campaign_id = %self.campaign_id,
      contact_id = %self.contact_id,
      "Campaign contact evaluation failed, rescheduling EvaluateLinkedIn"
    );
    EvaluateLinkedIn::schedule_next(state, &actor.id, Timestamp::now() + 5.seconds());
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::restrictions::WeeklyRestrictions;
  use crate::test::app_state_test;
  use crate::types::Time;
  use rstest::rstest;

  #[test]
  fn zoned_does_what_is_expected() {
    let datetime = jiff::civil::DateTime::new(2026, 1, 9, 2, 16, 44, 987654321).unwrap();
    let zoned = datetime
      .to_zoned(jiff::tz::TimeZone::get("America/Denver").unwrap())
      .unwrap();
    assert_eq!(zoned.timestamp(), jiff::Timestamp::new(1767950204, 987654321).unwrap());
    assert_eq!(zoned.time(), jiff::civil::Time::new(2, 16, 44, 987654321).unwrap());
    assert_eq!(
      zoned.datetime(),
      jiff::civil::DateTime::new(2026, 1, 9, 2, 16, 44, 987654321).unwrap()
    );
    assert_eq!(zoned.offset(), jiff::tz::Offset::constant(-7));
    assert_eq!(zoned.weekday(), jiff::civil::Weekday::Friday);
    assert_eq!(
      zoned.start_of_day().unwrap().timestamp(),
      jiff::Timestamp::new(1767942000, 0).unwrap()
    );
    assert_eq!(
      zoned.tomorrow().unwrap().timestamp(),
      jiff::Timestamp::new(1767950204 + 86400, 987654321).unwrap()
    );
    assert_eq!(
      zoned.tomorrow().unwrap().start_of_day().unwrap().timestamp(),
      jiff::Timestamp::new(1767942000 + 86400, 0).unwrap()
    );
  }

  // Helper to create WeeklyRestrictions with all days allowed (all day)
  fn all_days_allowed_restrictions() -> WeeklyRestrictions {
    serde_json::from_str(
      r#"{
        "sunday": {"start_time": "00:00:00", "end_time": "23:59:59"},
        "monday": {"start_time": "00:00:00", "end_time": "23:59:59"},
        "tuesday": {"start_time": "00:00:00", "end_time": "23:59:59"},
        "wednesday": {"start_time": "00:00:00", "end_time": "23:59:59"},
        "thursday": {"start_time": "00:00:00", "end_time": "23:59:59"},
        "friday": {"start_time": "00:00:00", "end_time": "23:59:59"},
        "saturday": {"start_time": "00:00:00", "end_time": "23:59:59"}
      }"#,
    )
    .unwrap()
  }

  // Helper to create WeeklyRestrictions with no days allowed
  fn no_days_allowed_restrictions() -> WeeklyRestrictions {
    serde_json::from_str(
      r#"{
        "sunday": null,
        "monday": null,
        "tuesday": null,
        "wednesday": null,
        "thursday": null,
        "friday": null,
        "saturday": null
      }"#,
    )
    .unwrap()
  }

  // Helper to create a LinkedIn account for testing
  fn create_test_linkedin(team_id: Id<Team>, user_id: Id<User>) -> LinkedIn {
    LinkedIn {
      id: Id::new(),
      primary_user_id: user_id,
      team_id,
      linkedin_profile_url: "https://linkedin.com/in/test".to_string(),
      full_name: "Test User".to_string(),
      max_pending_connection_requests: 1800,
      max_connection_requests_per_week: 100,
      max_connection_requests_per_day: 30,
      daily_connection_requests_variation_pct: 20,
      minimum_delay_between_connection_requests_ms: 60000,
      weekly_restrictions: None,
      warmup_enabled: true,
      warmup_period_days: Some(20),
      warmup_starting_connection_requests_per_day: Some(5),
      max_consecutive_errors: None,
      today_max_connection_requests: 20,
      today_executable_window_start: Time(jiff::civil::Time::new(0, 0, 0, 0).unwrap()),
      today_executable_window_end: Time(jiff::civil::Time::new(23, 59, 59, 0).unwrap()),
      today_options_updated: Timestamp::now(),
      connections: 500,
      login_active_last_validated: None,
      sales_navigator_active_last_validated: None,
      base_port: 10000,
      docker_username: "test.user".into(),
      docker_hostname: "test.user".into(),
      docker_host_mount: "test.user".into(),
      proxy_url: None,
      last_partial_sync: None,
      last_full_sync: None,
      last_inbox_download: None,
      last_full_inbox_download: None,
      contact_id: ArcSwap::new(Id::nil()),
    }
  }

  // Helper to create a test action request
  fn create_test_action_request(
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    action_type: LinkedInActionType,
  ) -> LinkedInActionRequest {
    let action = match action_type {
      LinkedInActionType::SendConnectionRequest => LinkedInAction::SendConnectionRequest(SendConnectionRequest {
        profile_url: LiProfileUrl::ProfileHandle("target".to_string()),
        message: "Hello!".to_string(),
      }),
      LinkedInActionType::SyncConnections => LinkedInAction::SyncConnections(SyncConnections { full_sync: false }),
      LinkedInActionType::ScrapeSalesNavQuery => LinkedInAction::ScrapeSalesNavQuery(ScrapeSalesNavQuery {
        sales_navigator_url: "https://linkedin.com/sales/search".to_string(),
        max_pages_to_scrape: Some(1),
        download_full_profile_info: false,
        max_profiles_per_page: Some(25),
        contact_list_id: Id::new(),
      }),
      LinkedInActionType::DownloadInbox => LinkedInAction::DownloadInbox(DownloadInbox { full_sync: false }),
      LinkedInActionType::SendMessage => LinkedInAction::SendMessage(SendMessage {
        contact_id: Id::new(),
        contact_name: "Test Contact".to_string(),
        message_content: "Test message".to_string(),
        skip_response_check: false,
      }),
    };
    LinkedInActionRequest::new(
      action,
      team_id,
      linkedin_id,
      None,
      None,
      None,
      Timestamp::now() + std::time::Duration::from_secs(3600),
      None,
    )
  }

  // ============================================================================
  // RSTEST CASES - Parameterized tests for specific scenarios
  // ============================================================================

  /// Test that restrictions pass when all conditions are met
  #[test]
  fn test_restrictions_pass_when_all_conditions_met() {
    app_state_test(20, async |app_state| {
      let team_id: Id<Team> = sqlx::query_scalar("select id from team limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
      let user_id: Id<User> = sqlx::query_scalar("select id from \"user\" limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      let mut linkedin = create_test_linkedin(team_id, user_id);

      // Set wide-open executable window
      linkedin.today_executable_window_start = Time(jiff::civil::Time::new(0, 0, 0, 0).unwrap());
      linkedin.today_executable_window_end = Time(jiff::civil::Time::new(23, 59, 59, 0).unwrap());

      let action = create_test_action_request(team_id, linkedin.id, LinkedInActionType::SyncConnections);

      // Create state with permissive restrictions
      let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
      let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

      let mut state = LinkedInState::new(
        super::super::ActorState::new(app_state.clone(), "test".to_string()),
        team_timezone,
        team_allowed_messaging,
        ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
      );

      let now = Timestamp::now();
      // Set last_approved_action to 6 minutes ago (past the 5-minute restriction)
      state.last_approved_action = now - 6.minutes();

      let result = linkedin.check_all_restrictions(&mut state, &action, now).await.unwrap();

      assert!(
        matches!(result, RestrictionCheck::Allowed),
        "Expected Allowed, got {:?}",
        result
      );
    });
  }

  /// Test that minimum delay restriction is enforced (5 minutes between actions)
  #[test]
  fn test_minimum_delay_restriction() {
    app_state_test(20, async |app_state| {
      let team_id: Id<Team> = sqlx::query_scalar("select id from team limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
      let user_id: Id<User> = sqlx::query_scalar("select id from \"user\" limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      let mut linkedin = create_test_linkedin(team_id, user_id);
      linkedin.today_executable_window_start = Time(jiff::civil::Time::new(0, 0, 0, 0).unwrap());
      linkedin.today_executable_window_end = Time(jiff::civil::Time::new(23, 59, 59, 0).unwrap());

      let action = create_test_action_request(team_id, linkedin.id, LinkedInActionType::SendConnectionRequest);

      let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
      let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

      let mut state = LinkedInState::new(
        super::super::ActorState::new(app_state.clone(), "test".to_string()),
        team_timezone,
        team_allowed_messaging,
        ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
      );

      // Set last_approved_action to just now and next_approved_action 5 minutes in the future
      let now = Timestamp::now();
      state.last_approved_action = now;
      state.next_approved_action = now + std::time::Duration::from_secs(5 * 60);

      let result = linkedin.check_all_restrictions(&mut state, &action, now).await.unwrap();

      match result {
        RestrictionCheck::Later(delayed_until) => {
          assert_eq!(
            delayed_until, state.next_approved_action,
            "Delay should be next_approved_action"
          );
        }
        other => panic!("Expected Later, got {:?}", other),
      }
    });
  }

  /// Test that executable window start time is enforced
  #[test]
  fn test_before_executable_window_start() {
    app_state_test(20, async |app_state| {
      let team_id: Id<Team> = sqlx::query_scalar("select id from team limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
      let user_id: Id<User> = sqlx::query_scalar("select id from \"user\" limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      let mut linkedin = create_test_linkedin(team_id, user_id);

      // Set executable window to start at 23:59 (very late, so current time is before it)
      linkedin.today_executable_window_start = Time(jiff::civil::Time::new(23, 59, 0, 0).unwrap());
      linkedin.today_executable_window_end = Time(jiff::civil::Time::new(23, 59, 59, 0).unwrap());

      let action = create_test_action_request(team_id, linkedin.id, LinkedInActionType::SyncConnections);

      let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
      let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

      let mut state = LinkedInState::new(
        super::super::ActorState::new(app_state.clone(), "test".to_string()),
        team_timezone,
        team_allowed_messaging,
        ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
      );
      let now = Timestamp::now();
      state.last_approved_action = now - 6.minutes();

      let now_time = jiff::Zoned::now().time();
      // Only run this test if we're not already past 23:59
      if now_time < jiff::civil::Time::new(23, 59, 0, 0).unwrap() {
        let result = linkedin.check_all_restrictions(&mut state, &action, now).await.unwrap();
        assert!(
          matches!(result, RestrictionCheck::Later(_)),
          "Expected Later when before executable window, got {:?}",
          result
        );
      }
    });
  }

  /// Test that executable window end time is enforced
  #[test]
  fn test_after_executable_window_end() {
    app_state_test(20, async |app_state| {
      let team_id: Id<Team> = sqlx::query_scalar("select id from team limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
      let user_id: Id<User> = sqlx::query_scalar("select id from \"user\" limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      let mut linkedin = create_test_linkedin(team_id, user_id);

      // Set executable window to end at 00:01 (very early, so current time is after it)
      linkedin.today_executable_window_start = Time(jiff::civil::Time::new(0, 0, 0, 0).unwrap());
      linkedin.today_executable_window_end = Time(jiff::civil::Time::new(0, 0, 1, 0).unwrap());

      let action = create_test_action_request(team_id, linkedin.id, LinkedInActionType::SyncConnections);

      let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
      let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

      let mut state = LinkedInState::new(
        super::super::ActorState::new(app_state.clone(), "test".to_string()),
        team_timezone,
        team_allowed_messaging,
        ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
      );
      let now = Timestamp::now();
      state.last_approved_action = now - 6.minutes();

      let now_time = jiff::Zoned::now().time();
      // Only run this test if we're past 00:01
      if now_time > jiff::civil::Time::new(0, 0, 1, 0).unwrap() {
        let result = linkedin.check_all_restrictions(&mut state, &action, now).await.unwrap();
        assert!(
          matches!(result, RestrictionCheck::Later(_)),
          "Expected Later when after executable window, got {:?}",
          result
        );
      }
    });
  }

  /// Test team-level time restrictions when current day is not allowed
  #[test]
  fn test_team_restrictions_day_not_allowed() {
    app_state_test(20, async |app_state| {
      let team_id: Id<Team> = sqlx::query_scalar("select id from team limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
      let user_id: Id<User> = sqlx::query_scalar("select id from \"user\" limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      let mut linkedin = create_test_linkedin(team_id, user_id);
      linkedin.today_executable_window_start = Time(jiff::civil::Time::new(0, 0, 0, 0).unwrap());
      linkedin.today_executable_window_end = Time(jiff::civil::Time::new(23, 59, 59, 0).unwrap());

      let action = create_test_action_request(team_id, linkedin.id, LinkedInActionType::SyncConnections);

      let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
      // Team restrictions with NO days allowed
      let team_allowed_messaging = ArcSwap::new(no_days_allowed_restrictions());

      let mut state = LinkedInState::new(
        super::super::ActorState::new(app_state.clone(), "test".to_string()),
        team_timezone,
        team_allowed_messaging,
        ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
      );
      let now = Timestamp::now();
      state.last_approved_action = now - 6.minutes();

      let result = linkedin.check_all_restrictions(&mut state, &action, now).await.unwrap();

      assert!(
        matches!(result, RestrictionCheck::Later(_)),
        "Expected Later when team restrictions don't allow current day, got {:?}",
        result
      );
    });
  }

  /// Test daily connection request limit
  #[rstest]
  #[case(20, 19, true)] // Under limit - should pass
  #[case(20, 20, false)] // At limit - should fail
  #[case(20, 21, false)] // Over limit - should fail
  #[case(30, 30, false)] // At safety max - should fail
  #[case(50, 30, false)] // Configured above safety max, at safety max - should fail
  fn test_daily_connection_limit(#[case] configured_max: i16, #[case] today_count: i64, #[case] should_pass: bool) {
    app_state_test(20, async move |app_state| {
      // Use the non-Bootstrap team which has a LinkedIn account from test_initialization.sql
      let team_id: Id<Team> =
        sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
          .fetch_one(&app_state.db)
          .await
          .unwrap();

      let mut linkedin: LinkedIn = sqlx::query_as("select * from linked_in where team_id = $1 limit 1")
        .bind(team_id)
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      linkedin.today_max_connection_requests = configured_max;
      linkedin.today_executable_window_start = Time(jiff::civil::Time::new(0, 0, 0, 0).unwrap());
      linkedin.today_executable_window_end = Time(jiff::civil::Time::new(23, 59, 59, 0).unwrap());
      let now = Timestamp::now();

      // Clean up any existing requests for this LinkedIn account
      sqlx::query("DELETE FROM linkedin_action_requests WHERE linkedin_id = $1")
        .bind(linkedin.id)
        .execute(&app_state.db)
        .await
        .unwrap();

      // Insert pending requests to simulate count
      let mut conn = app_state.db.acquire().await.unwrap();
      for _ in 0..today_count {
        let action = LinkedInAction::SendConnectionRequest(SendConnectionRequest {
          profile_url: LiProfileUrl::ProfileHandle(format!("{}", Id::<()>::new())),
          message: "Test".to_string(),
        });
        let request = LinkedInActionRequest::new(action, team_id, linkedin.id, None, None, None, now + 1.hours(), None);
        request.save(&mut conn).await.unwrap();
      }
      drop(conn);

      let action = create_test_action_request(team_id, linkedin.id, LinkedInActionType::SendConnectionRequest);

      let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
      let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

      let mut state = LinkedInState::new(
        super::super::ActorState::new(app_state.clone(), "test".to_string()),
        team_timezone,
        team_allowed_messaging,
        ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
      );
      state.last_approved_action = now - 6.minutes();
      state.next_approved_action = now - 1.minutes();

      let result = linkedin.check_all_restrictions(&mut state, &action, now).await.unwrap();

      if should_pass {
        assert!(
          matches!(result, RestrictionCheck::Allowed),
          "Expected Allowed with today_count={}, configured_max={}, got {:?}",
          today_count,
          configured_max,
          result
        );
      } else {
        assert!(
          matches!(result, RestrictionCheck::Later(_)),
          "Expected Later with today_count={}, configured_max={}, got {:?}",
          today_count,
          configured_max,
          result
        );
      }
    });
  }

  /// Test failure lockout (3+ consecutive failures)
  #[rstest]
  #[case(0, true)] // No failures - should pass
  #[case(1, true)] // 1 failure - should pass
  #[case(2, true)] // 2 failures - should pass
  #[case(3, false)] // 3 failures - should lockout
  #[case(5, false)] // 5 failures - should lockout
  fn test_failure_lockout(#[case] failure_count: i64, #[case] should_pass: bool) {
    app_state_test(20, async move |app_state| {
      // Use the non-Bootstrap team which has a LinkedIn account from test_initialization.sql
      let team_id: Id<Team> =
        sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
          .fetch_one(&app_state.db)
          .await
          .unwrap();

      // Get the existing LinkedIn account from the test database
      let linkedin_id: Id<LinkedIn> = sqlx::query_scalar("select id from linked_in where team_id = $1 limit 1")
        .bind(team_id)
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      let mut linkedin: LinkedIn = sqlx::query_as("select * from linked_in where id = $1")
        .bind(linkedin_id)
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      linkedin.today_executable_window_start = Time(jiff::civil::Time::new(0, 0, 0, 0).unwrap());
      linkedin.today_executable_window_end = Time(jiff::civil::Time::new(23, 59, 59, 0).unwrap());
      linkedin.max_consecutive_errors = Some(3);

      // Clean up any existing failures for this LinkedIn account
      sqlx::query("DELETE FROM linkedin_action_failures WHERE linkedin_id = $1")
        .bind(linkedin_id)
        .execute(&app_state.db)
        .await
        .unwrap();

      let now = Timestamp::now();
      // Insert failure records (must use a non-read-only action type so lockout checks apply)
      for i in 0..failure_count {
        let action = serde_json::json!({"SendConnectionRequest": {"profile_url": {"ProfileHandle": "target"}, "message": "Hello!"}});
        sqlx::query(
          "INSERT INTO linkedin_action_failures (id, team_id, linkedin_id, action, action_type, priority, failed_at, attempts, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(Id::<()>::new())
        .bind(team_id)
        .bind(linkedin_id)
        .bind(action)
        .bind(LinkedInActionType::SendConnectionRequest)
        .bind(0i16) // priority
        .bind(now - i.minutes()) // Stagger the failures
        .bind(1i16) // attempts
        .bind("Test failure")
        .execute(&app_state.db)
        .await
        .unwrap();
      }

      let action = create_test_action_request(team_id, linkedin_id, LinkedInActionType::SendConnectionRequest);

      let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
      let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

      let mut state = LinkedInState::new(
        super::super::ActorState::new(app_state.clone(), "test".to_string()),
        team_timezone,
        team_allowed_messaging,
        ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
      );
      state.last_approved_action = now - 6.minutes();
      state.next_approved_action = now - 1.minutes();

      let result = linkedin.check_all_restrictions(&mut state, &action, now).await.unwrap();

      if should_pass {
        assert!(
          matches!(result, RestrictionCheck::Allowed),
          "Expected Allowed with {} failures, got {:?}",
          failure_count,
          result
        );
      } else {
        assert!(
          matches!(result, RestrictionCheck::FailureLockout { .. }),
          "Expected FailureLockout with {} failures, got {:?}",
          failure_count,
          result
        );
      }

      // Clean up
      sqlx::query("DELETE FROM linkedin_action_failures WHERE linkedin_id = $1")
        .bind(linkedin_id)
        .execute(&app_state.db)
        .await
        .unwrap();
    });
  }

  // ============================================================================
  // EVALUATE_SETTINGS WARMUP TESTS
  // ============================================================================

  /// Helper to subtract days from a timestamp (jiff::Timestamp doesn't support calendar units)
  fn timestamp_minus_days(days: i64) -> Timestamp {
    let now = jiff::Zoned::now();
    Timestamp::from((now - days.days()).timestamp())
  }

  fn timestamp_minus_days_from(base: Timestamp, days: i64) -> Timestamp {
    base - (days * 24).hours()
  }

  /// Helper to insert history records for specific dates to simulate sending days
  async fn insert_history_for_days(
    db: &sqlx::PgPool,
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    days_ago: &[i64],
    base: Timestamp,
  ) {
    for &day in days_ago {
      let completed_at = timestamp_minus_days_from(base, day);
      let history = LinkedInActionHistory {
        id: Id::new(),
        action: LinkedInAction::SendConnectionRequest(SendConnectionRequest {
          profile_url: LiProfileUrl::ProfileHandle("test".to_string()),
          message: "test".to_string(),
        }),
        action_type: LinkedInActionType::SendConnectionRequest,
        team_id,
        linkedin_id,
        campaign_id: None,
        campaign_step_id: None,
        contact_id: None,
        priority: 0,
        started_at: completed_at,
        completed_at,
        attempts: 1,
      };
      history.save(&mut db.acquire().await.unwrap()).await.unwrap();
    }
  }

  /// Compute the daily fraction of remaining requests for a given weekday with all-days-equal restrictions.
  /// With equal active seconds per day: today_active / remaining_active = 1 / remaining_days_in_week.
  fn remaining_days_fraction(weekday: jiff::civil::Weekday) -> f64 {
    let restrictions = WeeklyRestrictions::always_allowed();
    let remaining = restrictions.remaining_active_seconds(weekday) as f64;
    let today = restrictions.restriction(weekday).unwrap().active_seconds() as f64;
    today / remaining
  }

  /// Create a Timestamp for noon on the next occurrence of the given weekday in America/New_York.
  fn timestamp_for_weekday(weekday: jiff::civil::Weekday) -> Timestamp {
    let tz = jiff::tz::TimeZone::get("America/New_York").unwrap();
    let now = jiff::Zoned::now().with_time_zone(tz);
    let today_wd = now.weekday();
    let days_ahead = (weekday.to_monday_zero_offset() as i64 - today_wd.to_monday_zero_offset() as i64 + 7) % 7;
    let days_ahead = if days_ahead == 0 { 0 } else { days_ahead };
    let target = (now + days_ahead.days())
      .with()
      .time(jiff::civil::time(12, 0, 0, 0))
      .build()
      .unwrap();
    target.timestamp().into()
  }

  const ALL_WEEKDAYS: [jiff::civil::Weekday; 7] = {
    use jiff::civil::Weekday::*;
    [Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday]
  };

  async fn assert_warmup_day_zero(app_state: &AppState, weekday: jiff::civil::Weekday) {
    let team_id: Id<Team> =
      sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

    let mut linkedin: LinkedIn = sqlx::query_as("select * from linked_in where team_id = $1 limit 1")
      .bind(team_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();

    linkedin.warmup_enabled = true;
    linkedin.warmup_period_days = Some(20);
    linkedin.warmup_starting_connection_requests_per_day = Some(5);
    linkedin.max_connection_requests_per_week = 100;
    linkedin.daily_connection_requests_variation_pct = 0;
    linkedin.weekly_restrictions = None;
    linkedin.today_options_updated = timestamp_minus_days(1);

    let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
    let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

    let mut state = LinkedInState::new(
      super::super::ActorState::new(app_state.clone(), "test".to_string()),
      team_timezone,
      team_allowed_messaging,
      ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
    );

    let now = timestamp_for_weekday(weekday);
    linkedin.evaluate_settings(&mut state, true, now).await.unwrap();

    assert!(
      linkedin.today_max_connection_requests >= 5 && linkedin.today_max_connection_requests <= 6,
      "Expected today_max_connection_requests to be near starting value (5-6) on {weekday:?}, got {}",
      linkedin.today_max_connection_requests
    );
    assert!(linkedin.warmup_enabled, "Warmup should still be enabled at day 0");
  }

  #[test]
  fn test_evaluate_settings_warmup_day_zero() {
    app_state_test(20, async |app_state| {
      for weekday in ALL_WEEKDAYS {
        assert_warmup_day_zero(&app_state, weekday).await;
      }
    });
  }

  async fn assert_warmup_midpoint(
    app_state: &AppState,
    sending_days: i64,
    warmup_period: i16,
    weekday: jiff::civil::Weekday,
  ) {
    let team_id: Id<Team> =
      sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

    let mut linkedin: LinkedIn = sqlx::query_as("select * from linked_in where team_id = $1 limit 1")
      .bind(team_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();

    linkedin.warmup_enabled = true;
    linkedin.warmup_period_days = Some(warmup_period);
    linkedin.warmup_starting_connection_requests_per_day = Some(5);
    linkedin.max_connection_requests_per_week = 100;
    linkedin.max_connection_requests_per_day = 100;
    linkedin.daily_connection_requests_variation_pct = 0;
    linkedin.weekly_restrictions = None;
    linkedin.today_options_updated = timestamp_minus_days(1);

    let now = timestamp_for_weekday(weekday);
    let days_ago: Vec<i64> = (1..=sending_days).collect();
    insert_history_for_days(&app_state.db, team_id, linkedin.id, &days_ago, now).await;

    let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
    let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

    let mut state = LinkedInState::new(
      super::super::ActorState::new(app_state.clone(), "test".to_string()),
      team_timezone,
      team_allowed_messaging,
      ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
    );

    linkedin.evaluate_settings(&mut state, true, now).await.unwrap();

    let days_since_sunday = weekday.since(jiff::civil::Weekday::Sunday) as i64;
    let week_count = sending_days.min(days_since_sunday);
    let daily_fraction = remaining_days_fraction(weekday);
    let avg_requests_for_today = daily_fraction * (100.0 - week_count as f64);
    let warmup_starting_requests = 5.0;
    let warmup_factor = sending_days as f64 / warmup_period as f64;
    let expected =
      (warmup_starting_requests + (avg_requests_for_today - warmup_starting_requests) * warmup_factor).round();
    let expected_with_min = expected.max(4.0) as i16;

    assert!(
      linkedin.today_max_connection_requests >= expected_with_min - 1
        && linkedin.today_max_connection_requests <= expected_with_min + 1,
      "Expected near {} for {}/{} days on {weekday:?}, got {}",
      expected_with_min,
      sending_days,
      warmup_period,
      linkedin.today_max_connection_requests
    );
    assert!(
      linkedin.warmup_enabled,
      "Warmup should still be enabled at {}/{} days",
      sending_days, warmup_period
    );

    // Clean up history so next iteration starts fresh
    sqlx::query("DELETE FROM linkedin_action_history WHERE linkedin_id = $1")
      .bind(linkedin.id)
      .execute(&app_state.db)
      .await
      .unwrap();
  }

  #[test]
  fn test_evaluate_settings_warmup_midpoint() {
    app_state_test(20, async |app_state| {
      for (sending_days, warmup_period) in [(5, 20), (10, 20), (15, 20)] {
        for weekday in ALL_WEEKDAYS {
          assert_warmup_midpoint(&app_state, sending_days, warmup_period, weekday).await;
        }
      }
    });
  }

  async fn assert_warmup_complete(
    app_state: &AppState,
    sending_days: i64,
    warmup_period: i16,
    weekday: jiff::civil::Weekday,
  ) {
    let team_id: Id<Team> =
      sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

    let mut linkedin: LinkedIn = sqlx::query_as("select * from linked_in where team_id = $1 limit 1")
      .bind(team_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();

    linkedin.warmup_enabled = true;
    linkedin.warmup_period_days = Some(warmup_period);
    linkedin.warmup_starting_connection_requests_per_day = Some(5);
    linkedin.max_connection_requests_per_week = 100;
    linkedin.max_connection_requests_per_day = 100;
    linkedin.daily_connection_requests_variation_pct = 0;
    linkedin.weekly_restrictions = None;
    linkedin.today_options_updated = timestamp_minus_days(1);

    let now = timestamp_for_weekday(weekday);
    let days_ago: Vec<i64> = (1..=sending_days).collect();
    insert_history_for_days(&app_state.db, team_id, linkedin.id, &days_ago, now).await;

    let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
    let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

    let mut state = LinkedInState::new(
      super::super::ActorState::new(app_state.clone(), "test".to_string()),
      team_timezone,
      team_allowed_messaging,
      ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
    );

    linkedin.evaluate_settings(&mut state, true, now).await.unwrap();

    assert!(
      !linkedin.warmup_enabled,
      "Warmup should be disabled after {} sending days (period={})",
      sending_days, warmup_period
    );

    let days_since_sunday = weekday.since(jiff::civil::Weekday::Sunday) as i64;
    let week_count = sending_days.min(days_since_sunday);
    let expected_full_rate = (remaining_days_fraction(weekday) * (100.0 - week_count as f64)).round() as i16;
    assert!(
      linkedin.today_max_connection_requests >= expected_full_rate - 2
        && linkedin.today_max_connection_requests <= expected_full_rate + 2,
      "Expected near {} after warmup complete on {weekday:?}, got {}",
      expected_full_rate,
      linkedin.today_max_connection_requests
    );

    sqlx::query("DELETE FROM linkedin_action_history WHERE linkedin_id = $1")
      .bind(linkedin.id)
      .execute(&app_state.db)
      .await
      .unwrap();
  }

  #[test]
  fn test_evaluate_settings_warmup_complete() {
    app_state_test(20, async |app_state| {
      for (sending_days, warmup_period) in [(20, 20), (25, 20)] {
        for weekday in ALL_WEEKDAYS {
          assert_warmup_complete(&app_state, sending_days, warmup_period, weekday).await;
        }
      }
    });
  }

  async fn assert_warmup_disabled(app_state: &AppState, weekday: jiff::civil::Weekday) {
    let team_id: Id<Team> =
      sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

    let mut linkedin: LinkedIn = sqlx::query_as("select * from linked_in where team_id = $1 limit 1")
      .bind(team_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();

    linkedin.warmup_enabled = false;
    linkedin.warmup_period_days = None;
    linkedin.warmup_starting_connection_requests_per_day = None;
    linkedin.max_connection_requests_per_week = 70;
    linkedin.max_connection_requests_per_day = 100;
    linkedin.daily_connection_requests_variation_pct = 0;
    linkedin.weekly_restrictions = None;
    linkedin.today_options_updated = timestamp_minus_days(1);

    let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
    let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

    let mut state = LinkedInState::new(
      super::super::ActorState::new(app_state.clone(), "test".to_string()),
      team_timezone,
      team_allowed_messaging,
      ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
    );

    let now = timestamp_for_weekday(weekday);
    linkedin.evaluate_settings(&mut state, true, now).await.unwrap();

    let expected = (remaining_days_fraction(weekday) * 70.0).round() as i16;
    assert!(
      linkedin.today_max_connection_requests >= expected - 1 && linkedin.today_max_connection_requests <= expected + 1,
      "Expected near {} with warmup disabled on {weekday:?}, got {}",
      expected,
      linkedin.today_max_connection_requests
    );
  }

  #[test]
  fn test_evaluate_settings_warmup_disabled() {
    app_state_test(20, async |app_state| {
      for weekday in ALL_WEEKDAYS {
        assert_warmup_disabled(&app_state, weekday).await;
      }
    });
  }

  async fn assert_warmup_with_variation(app_state: &AppState, variation_pct: i16, weekday: jiff::civil::Weekday) {
    let team_id: Id<Team> =
      sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();

    let mut linkedin: LinkedIn = sqlx::query_as("select * from linked_in where team_id = $1 limit 1")
      .bind(team_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();

    linkedin.warmup_enabled = true;
    linkedin.warmup_period_days = Some(20);
    linkedin.warmup_starting_connection_requests_per_day = Some(5);
    linkedin.max_connection_requests_per_week = 100;
    linkedin.max_connection_requests_per_day = 100;
    linkedin.daily_connection_requests_variation_pct = variation_pct;
    linkedin.weekly_restrictions = None;
    linkedin.today_options_updated = timestamp_minus_days(1);

    let now = timestamp_for_weekday(weekday);
    let days_ago: Vec<i64> = (1..=10).collect();
    insert_history_for_days(&app_state.db, team_id, linkedin.id, &days_ago, now).await;

    let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
    let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

    let mut state = LinkedInState::new(
      super::super::ActorState::new(app_state.clone(), "test".to_string()),
      team_timezone,
      team_allowed_messaging,
      ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
    );

    linkedin.evaluate_settings(&mut state, true, now).await.unwrap();

    let days_since_sunday = weekday.since(jiff::civil::Weekday::Sunday) as i64;
    let week_count = 10i64.min(days_since_sunday);
    let daily_fraction = remaining_days_fraction(weekday);
    let avg_requests = daily_fraction * (100.0 - week_count as f64);
    let warmup_starting = 5.0;
    let warmup_factor = 10.0 / 20.0;
    let base_value = (warmup_starting + (avg_requests - warmup_starting) * warmup_factor).round();
    let variation = variation_pct as f64 / 100.0;
    let lower_bound = ((base_value * (1.0 - variation)).max(4.0).round()) as i16;
    let upper_bound = (base_value * (1.0 + variation)).round() as i16;

    assert!(
      linkedin.today_max_connection_requests >= lower_bound && linkedin.today_max_connection_requests <= upper_bound,
      "Expected in [{}, {}] with {}% variation on {weekday:?}, got {}",
      lower_bound,
      upper_bound,
      variation_pct,
      linkedin.today_max_connection_requests
    );

    sqlx::query("DELETE FROM linkedin_action_history WHERE linkedin_id = $1")
      .bind(linkedin.id)
      .execute(&app_state.db)
      .await
      .unwrap();
  }

  #[test]
  fn test_evaluate_settings_warmup_with_variation() {
    app_state_test(20, async |app_state| {
      for variation_pct in [0, 20, 50] {
        for weekday in ALL_WEEKDAYS {
          assert_warmup_with_variation(&app_state, variation_pct, weekday).await;
        }
      }
    });
  }

  // ============================================================================
  // EVALUATE_LINKEDIN FLOW TESTS
  // ============================================================================

  /// Helper to get the test team, linkedin, and campaign from the DB
  async fn test_team_linkedin_campaign(app_state: &crate::AppState) -> (Id<Team>, Sender<LinkedIn>, Sender<Campaign>) {
    let team_id: Id<Team> =
      sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
    let linkedin_id: Id<LinkedIn> = sqlx::query_scalar("select id from linked_in where team_id = $1 limit 1")
      .bind(team_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();
    let campaign_id: Id<Campaign> = sqlx::query_scalar("select id from campaign where team_id = $1 limit 1")
      .bind(team_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();

    let linkedin = app_state.router.get_handle::<LinkedIn>(&linkedin_id).unwrap();
    let campaign = app_state.router.get_handle::<Campaign>(&campaign_id).unwrap();

    // Ensure any pending spawn_notify messages (like RegisterCampaign from Campaign::start())
    // have been processed. spawn_notify spawns a tokio task, so we sleep briefly to let it
    // deliver the message, then send a synchronous query to ensure ordering.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let linkedin_team_id = linkedin
      .send(super::super::Query::new(|actor: &LinkedIn, _, _: &LinkedInState| {
        actor.team_id
      }))
      .await
      .unwrap();
    let campaign_team_id = campaign
      .send(super::super::Query::new(|campaign: &Campaign, _, _: &CampaignState| {
        campaign.team_id
      }))
      .await
      .unwrap();

    assert_eq!(
      linkedin_team_id, campaign_team_id,
      "LinkedIn and Campaign must be in the same team"
    );
    assert_eq!(
      linkedin_team_id, team_id,
      "LinkedIn and Campaign must be in the same team as the test team"
    );

    (team_id, linkedin, campaign)
  }

  /// Helper to query campaigns registered in a LinkedIn actor's state
  async fn query_registered_campaigns(linkedin: &Sender<LinkedIn>) -> usize {
    linkedin
      .send(super::super::Query::new(|_, _, state: &LinkedInState| {
        state.campaigns.len()
      }))
      .await
      .unwrap()
  }

  /// Helper to query pending evaluation state: (evaluation_id, total_campaigns, received_count)
  async fn query_pending_evaluation(linkedin: &Sender<LinkedIn>) -> Option<(u64, usize, usize)> {
    linkedin
      .send(super::super::Query::new(|_, _, state: &LinkedInState| {
        state.pending_evaluation.as_ref().map(|p| {
          let total = p.campaign_responses.len();
          let received = p.campaign_responses.values().filter(|v| v.is_some()).count();
          (p.evaluation_id, total, received)
        })
      }))
      .await
      .unwrap()
  }

  #[test_log::test]
  fn register_campaign_adds_to_state() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Campaign start() should have already registered. Verify.
      let count = query_registered_campaigns(&linkedin).await;
      assert_eq!(count, 1, "Campaign should be registered on startup");
    });
  }

  #[test_log::test]
  fn unregister_campaign_removes_from_state() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;

      assert_eq!(query_registered_campaigns(&linkedin).await, 1);

      linkedin
        .try_notify(UnregisterCampaign {
          campaign_id: *campaign.id(),
        })
        .ok()
        .unwrap();

      assert_eq!(query_registered_campaigns(&linkedin).await, 0);
    });
  }

  #[test_log::test]
  fn evaluate_linkedin_no_campaigns_reschedules() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;

      // Unregister so there are 0 campaigns
      linkedin
        .try_notify(UnregisterCampaign {
          campaign_id: *campaign.id(),
        })
        .ok()
        .unwrap();

      // Clear next_approved_action so restriction check passes
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
        }))
        .ok()
        .unwrap();

      let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
      assert!(result.is_ok());

      // Should have scheduled a follow-up (next_scheduled_evaluate set)
      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "Should have scheduled next evaluation");
    });
  }

  #[test_log::test]
  fn evaluate_linkedin_fans_out_to_campaigns() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Clear timing restrictions
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
        }))
        .ok()
        .unwrap();

      let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
      assert!(result.is_ok());

      // Give time for spawn_notify to deliver GetBestCandidate and CandidateResponse
      tokio::time::sleep(std::time::Duration::from_millis(500)).await;

      // The pending evaluation should be resolved (either picked a winner or no candidates)
      let pending = query_pending_evaluation(&linkedin).await;
      assert!(
        pending.is_none(),
        "Pending evaluation should be resolved after responses come back"
      );
    });
  }

  #[test_log::test]
  fn get_best_candidate_returns_none_when_inactive() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;

      // Deactivate the campaign
      campaign
        .try_notify(super::super::Mutation::new(
          |actor: &mut Campaign, _, _: &mut super::super::campaign::CampaignState| {
            actor.active = false;
          },
        ))
        .ok()
        .unwrap();

      let linkedin_id = *linkedin.id();

      // Send GetBestCandidate directly
      let (tx, rx) = tokio::sync::oneshot::channel();
      campaign
        .send(
          async move |actor: &mut Campaign, _router: &Router, state: &mut super::super::campaign::CampaignState| {
            let msg = super::super::campaign::GetBestCandidate {
              linkedin_id,
              evaluation_id: 999,
            };
            let result = msg.find_best_candidate(actor, state).await;
            tx.send(result).ok();
          },
        )
        .await
        .unwrap();

      let candidate = rx.await.unwrap();
      assert!(candidate.is_none(), "Inactive campaign should return no candidate");

      // Re-activate for other tests
      campaign
        .try_notify(super::super::Mutation::new(
          |actor: &mut Campaign, _, _: &mut super::super::campaign::CampaignState| {
            actor.active = true;
          },
        ))
        .ok()
        .unwrap();
    });
  }

  #[test_log::test]
  fn get_best_candidate_returns_pending_start_step_contact() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;
      let linkedin_id = *linkedin.id();

      // Query for a candidate via the actor
      let (tx, rx) = tokio::sync::oneshot::channel();
      campaign
        .send(
          async move |actor: &mut Campaign, _router: &Router, state: &mut super::super::campaign::CampaignState| {
            let msg = super::super::campaign::GetBestCandidate {
              linkedin_id,
              evaluation_id: 1,
            };
            let result = msg.find_best_candidate(actor, state).await;
            tx.send(result).ok();
          },
        )
        .await
        .unwrap();

      let candidate = rx.await.unwrap();
      assert!(candidate.is_some(), "Should find a PendingStartStep candidate");
    });
  }

  #[test_log::test]
  fn get_best_candidate_skips_delayed_contacts() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;
      let linkedin_id = *linkedin.id();

      // Delay all PendingStartStep contacts into the future
      campaign
        .try_notify(super::super::Mutation::new(
          |_, _, state: &mut super::super::campaign::CampaignState| {
            for mut contact in state.contacts.iter_mut() {
              if contact.status == CampaignContactStatus::PendingStartStep {
                contact.delay_until = Some(Timestamp::now() + 1.hours());
              }
            }
          },
        ))
        .ok()
        .unwrap();

      let (tx, rx) = tokio::sync::oneshot::channel();
      campaign
        .send(
          async move |actor: &mut Campaign, _router: &Router, state: &mut super::super::campaign::CampaignState| {
            let msg = super::super::campaign::GetBestCandidate {
              linkedin_id,
              evaluation_id: 2,
            };
            let result = msg.find_best_candidate(actor, state).await;
            tx.send(result).ok();
          },
        )
        .await
        .unwrap();

      let candidate = rx.await.unwrap();
      assert!(candidate.is_none(), "Should skip delayed contacts");

      // Restore contacts
      campaign
        .try_notify(super::super::Mutation::new(
          |_, _, state: &mut super::super::campaign::CampaignState| {
            for mut contact in state.contacts.iter_mut() {
              contact.delay_until = None;
            }
          },
        ))
        .ok()
        .unwrap();
    });
  }

  #[test_log::test]
  fn candidate_response_stale_evaluation_id_discarded() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set up a pending evaluation with id=5
      let campaign_id = *campaign.id();
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state.pending_evaluation = Some(PendingEvaluation {
            evaluation_id: 5,
            campaign_responses: [(campaign_id, None)].into_iter().collect(),
            created_at: Timestamp::now(),
          });
        }))
        .ok()
        .unwrap();

      // Send a response with wrong evaluation_id
      linkedin
        .try_notify(CandidateResponse {
          evaluation_id: 3, // stale
          campaign_id: *campaign.id(),
          candidate: None,
        })
        .ok()
        .unwrap();

      // Pending evaluation should still be there (not consumed)
      let pending = query_pending_evaluation(&linkedin).await;
      assert!(pending.is_some(), "Stale response should be discarded");
      let (eval_id, _expected, received) = pending.unwrap();
      assert_eq!(eval_id, 5);
      assert_eq!(received, 0, "Stale response should not be counted");

      // Clean up
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.pending_evaluation = None;
        }))
        .ok()
        .unwrap();
    });
  }

  #[test_log::test]
  fn candidate_response_all_none_reschedules() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;
      let campaign_id = *campaign.id();

      // Set up a pending evaluation expecting 1 response
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state.pending_evaluation = Some(PendingEvaluation {
            evaluation_id: 10,
            campaign_responses: [(campaign_id, None)].into_iter().collect(),
            created_at: Timestamp::now(),
          });
        }))
        .ok()
        .unwrap();

      // Send None candidate
      linkedin
        .try_notify(CandidateResponse {
          evaluation_id: 10,
          campaign_id,
          candidate: None,
        })
        .ok()
        .unwrap();

      // Should resolve: no winner → reschedule
      let pending = query_pending_evaluation(&linkedin).await;
      assert!(pending.is_none(), "Pending evaluation should be resolved");

      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "Should have rescheduled");
    });
  }

  #[test_log::test]
  fn candidate_response_picks_lowest_priority_winner() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;
      let campaign_id = *campaign.id();
      let campaign_id2 = Id::<Campaign>::new();

      // Set up a pending evaluation expecting 2 responses
      // Also need a second campaign in the campaigns map
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state
            .campaigns
            .insert(campaign_id2, state.campaigns.get(&campaign_id).unwrap().clone());
          state.pending_evaluation = Some(PendingEvaluation {
            evaluation_id: 20,
            campaign_responses: [(campaign_id, None), (campaign_id2, None)].into_iter().collect(),
            created_at: Timestamp::now(),
          });
        }))
        .ok()
        .unwrap();

      let contact_high = Id::<crate::models::contact::Contact>::new();
      let contact_low = Id::<crate::models::contact::Contact>::new();

      // Campaign 1 offers a priority=5 candidate
      linkedin
        .try_notify(CandidateResponse {
          evaluation_id: 20,
          campaign_id,
          candidate: Some(Candidate {
            contact_id: contact_high,
            step_priority: 5,
          }),
        })
        .ok()
        .unwrap();

      // Pending should still be waiting for second response
      assert!(query_pending_evaluation(&linkedin).await.is_some());

      // Campaign 2 offers a priority=1 candidate (should win)
      linkedin
        .try_notify(CandidateResponse {
          evaluation_id: 20,
          campaign_id: campaign_id2,
          candidate: Some(Candidate {
            contact_id: contact_low,
            step_priority: 1,
          }),
        })
        .ok()
        .unwrap();

      // Should be resolved now
      let pending = query_pending_evaluation(&linkedin).await;
      assert!(pending.is_none(), "Should be resolved after all responses");

      // Clean up
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state.campaigns.remove(&campaign_id2);
        }))
        .ok()
        .unwrap();
    });
  }

  #[test_log::test]
  fn evaluate_campaign_only_processes_end_step() {
    app_state_test(20, async |app_state| {
      let (_team_id, _linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;

      // Count PendingStartStep contacts before
      let pending_count_before = campaign
        .send(super::super::Query::new(
          |_, _, state: &super::super::campaign::CampaignState| {
            state
              .contacts
              .iter()
              .filter(|c| c.status == CampaignContactStatus::PendingStartStep)
              .count()
          },
        ))
        .await
        .unwrap();

      // Run EvaluateCampaign
      campaign
        .send(super::super::campaign::EvaluateCampaign)
        .await
        .unwrap()
        .unwrap();
      tokio::time::sleep(std::time::Duration::from_millis(300)).await;

      // PendingStartStep contacts should NOT have been processed
      let pending_count_after = campaign
        .send(super::super::Query::new(
          |_, _, state: &super::super::campaign::CampaignState| {
            state
              .contacts
              .iter()
              .filter(|c| c.status == CampaignContactStatus::PendingStartStep)
              .count()
          },
        ))
        .await
        .unwrap();

      assert_eq!(
        pending_count_before, pending_count_after,
        "EvaluateCampaign should not process PendingStartStep contacts"
      );
    });
  }

  #[test_log::test]
  fn full_flow_evaluate_linkedin_dispatches_contact() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;

      // Clear timing restrictions so EvaluateLinkedIn passes all checks
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
        }))
        .ok()
        .unwrap();

      // Count InProgress contacts before
      let in_progress_before = campaign
        .send(super::super::Query::new(
          |_, _, state: &super::super::campaign::CampaignState| {
            state
              .contacts
              .iter()
              .filter(|c| c.status == CampaignContactStatus::InProgress)
              .count()
          },
        ))
        .await
        .unwrap();

      // Fire EvaluateLinkedIn
      let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
      assert!(result.is_ok(), "EvaluateLinkedIn should succeed");

      // Wait for the full async chain: EvaluateLinkedIn → GetBestCandidate → CandidateResponse → EvaluateCampaignContact
      tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

      // A PendingStartStep contact should have transitioned to InProgress
      let in_progress_after = campaign
        .send(super::super::Query::new(
          |_, _, state: &super::super::campaign::CampaignState| {
            state
              .contacts
              .iter()
              .filter(|c| c.status == CampaignContactStatus::InProgress)
              .count()
          },
        ))
        .await
        .unwrap();

      assert!(
        in_progress_after > in_progress_before,
        "At least one contact should have moved to InProgress (before={}, after={})",
        in_progress_before,
        in_progress_after
      );

      // next_scheduled_evaluate should be set
      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "Should have scheduled next evaluation");
    });
  }

  #[test_log::test]
  fn action_request_updates_timestamps_and_reschedules() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Clear timing so restriction check passes
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
          state.next_scheduled_evaluate = None;
        }))
        .ok()
        .unwrap();

      let before = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          (
            state.last_approved_action,
            state.next_approved_action,
            state.next_scheduled_evaluate,
          )
        }))
        .await
        .unwrap();

      // Send a LinkedInActionRequest directly to the LinkedIn actor.
      // The runner will fail to start (no Docker in tests), but timestamps
      // are updated before the runner is started.
      let linkedin_id = *linkedin.id();
      let action = LinkedInActionRequest::new(
        LinkedInAction::SyncConnections(SyncConnections { full_sync: false }),
        _team_id,
        linkedin_id,
        None,
        None,
        None,
        Timestamp::now() + 20.minutes(),
        None,
      );
      // notify is fire-and-forget — runner errors won't propagate
      linkedin.notify(action).await.unwrap();

      // Wait for the message to be processed
      tokio::time::sleep(std::time::Duration::from_millis(100)).await;

      let after = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          (
            state.last_approved_action,
            state.next_approved_action,
            state.next_scheduled_evaluate,
          )
        }))
        .await
        .unwrap();

      assert!(
        after.0 > before.0,
        "last_approved_action should have been updated (before={:?}, after={:?})",
        before.0,
        after.0
      );
      assert!(
        after.1 > after.0,
        "next_approved_action should be in the future relative to last_approved_action"
      );
      // next_approved_action should be 5-10 min after last_approved_action
      let delay_secs = after.1.0.as_second() - after.0.0.as_second();
      assert!(
        (5 * 60..=10 * 60).contains(&delay_secs),
        "next_approved_action should be 5-10 min after last_approved_action, got {}s",
        delay_secs
      );
      assert!(
        after.2.is_some(),
        "next_scheduled_evaluate should be set (rescheduled via schedule_next)"
      );
    });
  }

  // ============================================================================
  // EVALUATE_LINKEDIN RESTRICTION CHECK TESTS
  // ============================================================================

  #[test_log::test]
  fn evaluate_linkedin_blocks_when_next_approved_action_in_future() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set next_approved_action 5 minutes in the future
      let future_time = Timestamp::now() + 5.minutes();
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state.next_approved_action = future_time;
          state.last_approved_action = Timestamp::now() - 6.minutes();
        }))
        .ok()
        .unwrap();

      let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
      assert!(result.is_ok());

      // Should NOT have fanned out — pending_evaluation should be None (no fan-out happened)
      let pending = query_pending_evaluation(&linkedin).await;
      assert!(
        pending.is_none(),
        "Should not have fanned out while next_approved_action is in the future"
      );

      // Should have rescheduled to next_approved_action (capped at 30 min)
      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "Should have scheduled next evaluation");
    });
  }

  #[test_log::test]
  fn evaluate_linkedin_blocks_before_execution_window() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set execution window to far in the future (23:58-23:59)
      linkedin
        .try_notify(super::super::Mutation::new(
          |actor: &mut LinkedIn, _, _: &mut LinkedInState| {
            actor.today_executable_window_start = Time(jiff::civil::Time::new(23, 58, 0, 0).unwrap());
            actor.today_executable_window_end = Time(jiff::civil::Time::new(23, 59, 0, 0).unwrap());
          },
        ))
        .ok()
        .unwrap();

      // Clear timing restrictions so we don't get blocked by next_approved_action
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
        }))
        .ok()
        .unwrap();

      let now = jiff::Zoned::now();
      // Only run if we're before 23:58 (otherwise the window is already active)
      if now.time() < jiff::civil::Time::new(23, 58, 0, 0).unwrap() {
        let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
        assert!(result.is_ok());

        let pending = query_pending_evaluation(&linkedin).await;
        assert!(pending.is_none(), "Should not fan out before execution window");

        let next = linkedin
          .send(super::super::Query::new(|_, _, state: &LinkedInState| {
            state.next_scheduled_evaluate
          }))
          .await
          .unwrap();
        assert!(next.is_some(), "Should have rescheduled");
      }
    });
  }

  #[test_log::test]
  fn evaluate_linkedin_blocks_after_execution_window() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set execution window to far in the past (00:00-00:01)
      linkedin
        .try_notify(super::super::Mutation::new(
          |actor: &mut LinkedIn, _, _: &mut LinkedInState| {
            actor.today_executable_window_start = Time(jiff::civil::Time::new(0, 0, 0, 0).unwrap());
            actor.today_executable_window_end = Time(jiff::civil::Time::new(0, 1, 0, 0).unwrap());
          },
        ))
        .ok()
        .unwrap();

      // Clear timing restrictions
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
        }))
        .ok()
        .unwrap();

      let now = jiff::Zoned::now();
      // Only run if we're after 00:01 (otherwise the window is still active)
      if now.time() > jiff::civil::Time::new(0, 1, 0, 0).unwrap() {
        let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
        assert!(result.is_ok());

        let pending = query_pending_evaluation(&linkedin).await;
        assert!(pending.is_none(), "Should not fan out after execution window");

        let next = linkedin
          .send(super::super::Query::new(|_, _, state: &LinkedInState| {
            state.next_scheduled_evaluate
          }))
          .await
          .unwrap();
        assert!(next.is_some(), "Should have rescheduled to tomorrow");
      }
    });
  }

  #[test_log::test]
  fn evaluate_linkedin_blocks_outside_weekly_restrictions() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set linkedin weekly_restrictions to no days allowed
      linkedin
        .try_notify(super::super::Mutation::new(
          |actor: &mut LinkedIn, _, _: &mut LinkedInState| {
            actor.weekly_restrictions = Some(no_days_allowed_restrictions());
          },
        ))
        .ok()
        .unwrap();

      // Clear timing restrictions
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
        }))
        .ok()
        .unwrap();

      let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
      assert!(result.is_ok());

      let pending = query_pending_evaluation(&linkedin).await;
      assert!(pending.is_none(), "Should not fan out outside weekly restrictions");

      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "Should have rescheduled");
    });
  }

  #[test_log::test]
  fn evaluate_linkedin_blocks_on_daily_limit() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set today_max_connection_requests to 0 so daily limit is immediately hit
      linkedin
        .try_notify(super::super::Mutation::new(
          |actor: &mut LinkedIn, _, _: &mut LinkedInState| {
            actor.today_max_connection_requests = 0;
          },
        ))
        .ok()
        .unwrap();

      // Clear timing restrictions
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
        }))
        .ok()
        .unwrap();

      let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
      assert!(result.is_ok());

      let pending = query_pending_evaluation(&linkedin).await;
      assert!(pending.is_none(), "Should not fan out when daily limit is reached");

      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "Should have rescheduled");
    });
  }

  #[test_log::test]
  fn evaluate_linkedin_blocks_on_weekly_limit() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set max_connection_requests_per_week to 0 so weekly limit is immediately hit
      linkedin
        .try_notify(super::super::Mutation::new(
          |actor: &mut LinkedIn, _, _: &mut LinkedInState| {
            actor.max_connection_requests_per_week = 0;
          },
        ))
        .ok()
        .unwrap();

      // Clear timing restrictions
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.last_approved_action = Timestamp::now() - 6.minutes();
          state.next_approved_action = Timestamp::now() - 1.minutes();
        }))
        .ok()
        .unwrap();

      let result = linkedin.send(EvaluateLinkedIn).await.unwrap();
      assert!(result.is_ok());

      let pending = query_pending_evaluation(&linkedin).await;
      assert!(pending.is_none(), "Should not fan out when weekly limit is reached");

      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "Should have rescheduled to tomorrow");
    });
  }

  // ============================================================================
  // UNREGISTER DURING PENDING EVALUATION TESTS
  // ============================================================================

  #[test_log::test]
  fn unregister_during_pending_triggers_resolution_when_all_received() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;
      let campaign_id = *campaign.id();
      let campaign_id2 = Id::<Campaign>::new();

      // Set up: 2 campaigns, pending evaluation expecting 2 responses, 1 already received
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state
            .campaigns
            .insert(campaign_id2, state.campaigns.get(&campaign_id).unwrap().clone());
          state.pending_evaluation = Some(PendingEvaluation {
            evaluation_id: 50,
            campaign_responses: [
              (
                campaign_id,
                Some(CandidateResponse {
                  evaluation_id: 50,
                  campaign_id,
                  candidate: None,
                }),
              ),
              (campaign_id2, None),
            ]
            .into_iter()
            .collect(),
            created_at: Timestamp::now(),
          });
        }))
        .ok()
        .unwrap();

      // Unregister campaign2 — should remove it from the map,
      // and since campaign1 already responded, all_received() triggers resolution
      linkedin
        .try_notify(UnregisterCampaign {
          campaign_id: campaign_id2,
        })
        .ok()
        .unwrap();

      // Pending evaluation should be resolved (taken)
      let pending = query_pending_evaluation(&linkedin).await;
      assert!(
        pending.is_none(),
        "Unregister should have triggered resolution when all remaining campaigns responded"
      );

      // next_scheduled_evaluate should be set (rescheduled since no candidates)
      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "Should have rescheduled after resolution");
    });
  }

  #[test_log::test]
  fn unregister_during_pending_removes_its_response() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, campaign) = test_team_linkedin_campaign(&app_state).await;
      let campaign_id = *campaign.id();
      let campaign_id2 = Id::<Campaign>::new();
      let campaign_id3 = Id::<Campaign>::new();

      // Set up: 3 campaigns, pending evaluation expecting 3, campaign2 already responded
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state
            .campaigns
            .insert(campaign_id2, state.campaigns.get(&campaign_id).unwrap().clone());
          state
            .campaigns
            .insert(campaign_id3, state.campaigns.get(&campaign_id).unwrap().clone());
          state.pending_evaluation = Some(PendingEvaluation {
            evaluation_id: 60,
            campaign_responses: [
              (campaign_id, None),
              (
                campaign_id2,
                Some(CandidateResponse {
                  evaluation_id: 60,
                  campaign_id: campaign_id2,
                  candidate: Some(Candidate {
                    contact_id: Id::new(),
                    step_priority: 1,
                  }),
                }),
              ),
              (campaign_id3, None),
            ]
            .into_iter()
            .collect(),
            created_at: Timestamp::now(),
          });
        }))
        .ok()
        .unwrap();

      // Unregister campaign2 — should remove it from the map entirely
      linkedin
        .try_notify(UnregisterCampaign {
          campaign_id: campaign_id2,
        })
        .ok()
        .unwrap();

      // Pending should still exist (2 campaigns left, 0 responded, still waiting)
      let pending = query_pending_evaluation(&linkedin).await;
      assert!(pending.is_some(), "Should still be pending after unregister");
      let (eval_id, total, received) = pending.unwrap();
      assert_eq!(eval_id, 60);
      assert_eq!(total, 2, "campaign2 should be removed from map");
      assert_eq!(received, 0, "campaign2's response should be removed");

      // Clean up
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state.campaigns.remove(&campaign_id3);
          state.pending_evaluation = None;
        }))
        .ok()
        .unwrap();
    });
  }

  // ============================================================================
  // BOOTSTRAP_EVALUATE TESTS
  // ============================================================================

  #[test_log::test]
  fn bootstrap_evaluate_schedules_when_none() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Clear next_scheduled_evaluate and call bootstrap
      linkedin
        .try_notify(super::super::Mutation::new(|_, _, state: &mut LinkedInState| {
          state.next_scheduled_evaluate = None;
        }))
        .ok()
        .unwrap();

      linkedin
        .send(
          async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
            actor.bootstrap_evaluate(state);
          },
        )
        .await
        .unwrap();

      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(
        next.is_some(),
        "bootstrap_evaluate should schedule when next_scheduled_evaluate is None"
      );
    });
  }

  #[test_log::test]
  fn bootstrap_evaluate_schedules_when_past_due() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set next_scheduled_evaluate to the past
      let past: Timestamp = Timestamp::now() - 10.minutes();
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state.next_scheduled_evaluate = Some(past);
        }))
        .ok()
        .unwrap();

      linkedin
        .send(
          async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
            actor.bootstrap_evaluate(state);
          },
        )
        .await
        .unwrap();

      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some(), "bootstrap_evaluate should reschedule when past due");
      let one_sec_ago: Timestamp = Timestamp::now() - 1.seconds();
      assert!(next.unwrap() > one_sec_ago, "Should be scheduled in the future");
    });
  }

  #[test_log::test]
  fn bootstrap_evaluate_skips_when_future_scheduled() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Set next_scheduled_evaluate to 10 minutes in the future
      let future = Timestamp::now() + 10.minutes();
      linkedin
        .try_notify(super::super::Mutation::new(move |_, _, state: &mut LinkedInState| {
          state.next_scheduled_evaluate = Some(future);
        }))
        .ok()
        .unwrap();

      linkedin
        .send(
          async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
            actor.bootstrap_evaluate(state);
          },
        )
        .await
        .unwrap();

      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      // Should still be the same future time — bootstrap should not have touched it
      assert_eq!(
        next.unwrap(),
        future,
        "bootstrap_evaluate should not reschedule when already scheduled in the future"
      );
    });
  }

  // ============================================================================
  // SCHEDULE_NEXT 30-MINUTE CAP TEST
  // ============================================================================

  #[test_log::test]
  fn schedule_next_caps_at_30_minutes() {
    app_state_test(20, async |app_state| {
      let (_team_id, linkedin, _campaign) = test_team_linkedin_campaign(&app_state).await;

      // Schedule with a timestamp 2 hours in the future
      let far_future = Timestamp::now() + 2.hours();
      linkedin
        .send(
          async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
            EvaluateLinkedIn::schedule_next(state, &actor.id, far_future);
          },
        )
        .await
        .unwrap();

      let next = linkedin
        .send(super::super::Query::new(|_, _, state: &LinkedInState| {
          state.next_scheduled_evaluate
        }))
        .await
        .unwrap();
      assert!(next.is_some());

      let scheduled = next.unwrap();
      let max_allowed = Timestamp::now() + 30.minutes() + 2.seconds(); // small tolerance
      assert!(
        scheduled <= max_allowed,
        "schedule_next should cap at 30 minutes, got {:?} which is more than 30 min from now",
        scheduled
      );
      // Should be much less than the 2 hours we requested
      assert!(
        scheduled < far_future,
        "Scheduled time should be less than the requested 2 hours"
      );
    });
  }

  /// Test that the 30 connection request daily cap is enforced even during warmup
  #[test]
  fn test_evaluate_settings_warmup_respects_daily_cap() {
    app_state_test(20, async |app_state| {
      let team_id: Id<Team> =
        sqlx::query_scalar("select id from team where id != '00000000-0000-0000-0000-000000000000' limit 1")
          .fetch_one(&app_state.db)
          .await
          .unwrap();

      let mut linkedin: LinkedIn = sqlx::query_as("select * from linked_in where team_id = $1 limit 1")
        .bind(team_id)
        .fetch_one(&app_state.db)
        .await
        .unwrap();

      // Set very high values that would exceed daily cap
      linkedin.warmup_enabled = false;
      linkedin.max_connection_requests_per_week = 500; // Would be ~71/day
      linkedin.daily_connection_requests_variation_pct = 0;
      linkedin.weekly_restrictions = None; // Use default always_allowed to avoid day-of-week issues
      linkedin.today_options_updated = timestamp_minus_days(1);

      let team_timezone = ArcSwap::new(TimeZone::new("America/New_York").unwrap());
      let team_allowed_messaging = ArcSwap::new(all_days_allowed_restrictions());

      let mut state = LinkedInState::new(
        super::super::ActorState::new(app_state.clone(), "test".to_string()),
        team_timezone,
        team_allowed_messaging,
        ArcSwap::new(TimeZone::new("America/New_York").unwrap()),
      );

      linkedin
        .evaluate_settings(&mut state, true, Timestamp::now())
        .await
        .unwrap();

      assert!(
        linkedin.today_max_connection_requests <= linkedin.max_connection_requests_per_day,
        "today_max_connection_requests should be capped at {}, got {}",
        linkedin.max_connection_requests_per_day,
        linkedin.today_max_connection_requests
      );
    });
  }
}

// Property-based tests for warmup linear interpolation formula
#[cfg(test)]
mod warmup_property_tests {
  use super::calculate_warmup_value;
  use proptest::prelude::*;

  // Helper to create f64 range strategy
  fn f64_range(min: f64, max: f64) -> impl Strategy<Value = f64> {
    (0u64..1_000_000).prop_map(move |v| min + (max - min) * (v as f64 / 1_000_000.0))
  }

  // Helper to scale weekly value to daily (simulates what evaluate_settings does)
  fn scale_to_daily(weekly_value: f64, daily_fraction: f64) -> f64 {
    daily_fraction * weekly_value
  }

  proptest! {
    /// Property: At day 0, the result should equal the starting value
    #[test]
    fn warmup_at_day_zero_equals_starting(
      starting_weekly in f64_range(1.0, 100.0),
      max_weekly in f64_range(50.0, 200.0),
      period in f64_range(5.0, 30.0),
      daily_fraction in f64_range(0.1, 0.3),
    ) {
      let starting_daily = scale_to_daily(starting_weekly, daily_fraction);
      let max_daily = scale_to_daily(max_weekly, daily_fraction);
      let result = calculate_warmup_value(starting_daily, max_daily, period, 0.0);
      prop_assert!((result - starting_daily).abs() < 0.001, "At day 0: expected {}, got {}", starting_daily, result);
    }

    /// Property: At warmup_period_days, the result should equal the max value
    #[test]
    fn warmup_at_completion_equals_max(
      starting_weekly in f64_range(1.0, 100.0),
      max_weekly in f64_range(50.0, 200.0),
      period in f64_range(5.0, 30.0),
      daily_fraction in f64_range(0.1, 0.3),
    ) {
      let starting_daily = scale_to_daily(starting_weekly, daily_fraction);
      let max_daily = scale_to_daily(max_weekly, daily_fraction);
      let result = calculate_warmup_value(starting_daily, max_daily, period, period);
      prop_assert!((result - max_daily).abs() < 0.001, "At completion: expected {}, got {}", max_daily, result);
    }

    /// Property: The result should always be between starting and max (scaled by daily_fraction)
    #[test]
    fn warmup_result_in_bounds(
      starting_weekly in f64_range(1.0, 100.0),
      max_weekly in f64_range(50.0, 200.0),
      period in f64_range(5.0, 30.0),
      days in f64_range(0.0, 30.0),
      daily_fraction in f64_range(0.1, 0.3),
    ) {
      let starting_daily = scale_to_daily(starting_weekly, daily_fraction);
      let max_daily = scale_to_daily(max_weekly, daily_fraction);
      // Clamp days to period for this test
      let clamped_days = days.min(period);
      let result = calculate_warmup_value(starting_daily, max_daily, period, clamped_days);
      let lower = starting_daily.min(max_daily);
      let upper = starting_daily.max(max_daily);
      prop_assert!(
        result >= lower - 0.001 && result <= upper + 0.001,
        "Result {} should be in [{}, {}]", result, lower, upper
      );
    }

    /// Property: The interpolation is linear (halfway through = halfway between values)
    #[test]
    fn warmup_is_linear(
      starting_weekly in f64_range(1.0, 100.0),
      max_weekly in f64_range(50.0, 200.0),
      period in f64_range(10.0, 30.0),
      daily_fraction in f64_range(0.1, 0.3),
    ) {
      let starting_daily = scale_to_daily(starting_weekly, daily_fraction);
      let max_daily = scale_to_daily(max_weekly, daily_fraction);
      let at_start = calculate_warmup_value(starting_daily, max_daily, period, 0.0);
      let at_end = calculate_warmup_value(starting_daily, max_daily, period, period);
      let at_half = calculate_warmup_value(starting_daily, max_daily, period, period / 2.0);
      let expected_half = (at_start + at_end) / 2.0;
      prop_assert!(
        (at_half - expected_half).abs() < 0.001,
        "Halfway point {} should equal midpoint of [{}, {}] = {}",
        at_half, at_start, at_end, expected_half
      );
    }

    /// Property: The function is monotonic (more days = higher value if max > starting)
    #[test]
    fn warmup_is_monotonic(
      starting_weekly in f64_range(1.0, 50.0),
      max_weekly in f64_range(60.0, 200.0), // Ensure max > starting
      period in f64_range(10.0, 30.0),
      days1 in f64_range(0.0, 15.0),
      days2 in f64_range(0.0, 15.0),
      daily_fraction in f64_range(0.1, 0.3),
    ) {
      let starting_daily = scale_to_daily(starting_weekly, daily_fraction);
      let max_daily = scale_to_daily(max_weekly, daily_fraction);
      let d1 = days1.min(period);
      let d2 = days2.min(period);
      let result1 = calculate_warmup_value(starting_daily, max_daily, period, d1);
      let result2 = calculate_warmup_value(starting_daily, max_daily, period, d2);
      if d1 < d2 {
        prop_assert!(result1 <= result2 + 0.001, "More days should mean higher value: {} days = {}, {} days = {}", d1, result1, d2, result2);
      } else if d1 > d2 {
        prop_assert!(result1 >= result2 - 0.001, "More days should mean higher value: {} days = {}, {} days = {}", d1, result1, d2, result2);
      }
    }
  }
}
