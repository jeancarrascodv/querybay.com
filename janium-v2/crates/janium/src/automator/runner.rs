use super::Automator;
use crate::prelude::*;
use compact_str::CompactString as String;
use futures::FutureExt;
use std::pin::Pin;
use tokio::time::{Instant, interval, sleep, sleep_until, timeout_at};
use tracing::Instrument;

/// Marker type for AutomatorRunner IDs
pub struct RunnerInstance;

/// Sets an `AtomicBool` on creation and clears it on drop, ensuring the flag
/// is reset even if the surrounding future is cancelled or panics.
struct MemoryIntensiveGuard<'a>(&'a std::sync::atomic::AtomicBool);

impl<'a> MemoryIntensiveGuard<'a> {
  fn new(flag: &'a std::sync::atomic::AtomicBool, intensive: bool) -> Self {
    flag.store(intensive, std::sync::atomic::Ordering::Relaxed);
    Self(flag)
  }
}

impl Drop for MemoryIntensiveGuard<'_> {
  fn drop(&mut self) {
    self.0.store(false, std::sync::atomic::Ordering::Relaxed);
  }
}

pub struct AutomatorRunner {
  /// Unique ID for this runner instance - used to match death notifications
  runner_id: Id<RunnerInstance>,
  linkedin_id: Id<LinkedIn>,
  team_id: Id<Team>,
  /// Team timezone (matches container TZ)
  timezone: ArcSwap<TimeZone>,
  app_state: AppState,
  receiver: tokio::sync::mpsc::Receiver<AutomatorRunnerMessage>,
  container: Arc<ContainerHandle>,
  automator: Arc<parking_lot::Mutex<Automator>>,
  automator_state: AutomatorState,
  user_access_keep_alive: UserAccessKeepAlive,
  // This can never be awaited otherwise it can deadlock the automator runner.
  self_sender: tokio::sync::mpsc::Sender<AutomatorRunnerMessage>,
  /// SyncSender ensures we never block waiting on the LinkedIn actor, preventing deadlocks
  linkedin: SyncSender<LinkedIn>,
  /// Shared owner contact ID — same ArcSwap instance is passed to each Automator
  owner_contact_id: ArcSwap<Id<Contact>>,
}

// If this ever drops, we need to notify the LinkedIn actor so it can clean up the runner.
impl Drop for AutomatorRunner {
  fn drop(&mut self) {
    self
      .linkedin
      .try_notify(RunnerStopped {
        runner_id: self.runner_id,
      })
      .ok();
  }
}

#[derive(Debug)]
enum WaitingFor {
  Retry(Pin<Box<tokio::time::Sleep>>),
  Shutdown(Pin<Box<tokio::time::Sleep>>, std::time::Duration),
  UserAccess,
}

impl Clone for WaitingFor {
  fn clone(&self) -> Self {
    match self {
      Self::Retry(sleep) => Self::Retry(Box::pin(sleep_until(sleep.deadline()))),
      Self::Shutdown(sleep, duration) => Self::Shutdown(Box::pin(sleep_until(sleep.deadline())), *duration),
      Self::UserAccess => Self::UserAccess,
    }
  }
}

impl WaitingFor {
  async fn wait(&mut self, assertion: crate::util::YesIAmInASelectBlock) -> Self {
    let _ = assertion;
    match self {
      Self::Retry(sleep) => {
        tracing::trace!(
          "Waiting for retry until {:?}",
          sleep.deadline().saturating_duration_since(Instant::now())
        );
        sleep.await;
      }
      Self::Shutdown(sleep, _) => {
        tracing::trace!(
          "Waiting for shutdown until {:?}",
          sleep.deadline().saturating_duration_since(Instant::now())
        );
        sleep.await;
      }
      Self::UserAccess => {
        tracing::trace!("Waiting for user access");
        futures::future::pending::<()>().await;
      }
    }
    self.clone()
  }
  fn retry(secs: u64) -> Self {
    Self::Retry(Box::pin(sleep(std::time::Duration::from_secs(secs))))
  }
  fn shutdown(secs: u64) -> Self {
    let duration = std::time::Duration::from_secs(secs);
    Self::Shutdown(Box::pin(sleep(duration)), duration)
  }
}

enum AutomatorState {
  Waiting {
    waiting_for: WaitingFor,
  },
  Running {
    task: Pin<Box<dyn Future<Output = Result<AutomatorFutureReturn>> + Send>>,
  },
}

impl Default for AutomatorState {
  fn default() -> Self {
    Self::Waiting {
      waiting_for: WaitingFor::shutdown(900),
    }
  }
}

impl AutomatorState {
  fn as_str(&self) -> &str {
    match self {
      Self::Waiting { waiting_for, .. } => match waiting_for {
        WaitingFor::Retry(_) => "Waiting for retry",
        WaitingFor::Shutdown(_, _) => "Waiting for shutdown",
        WaitingFor::UserAccess => "Waiting for user access",
      },
      Self::Running { .. } => "Running",
    }
  }
  // Use WaitingFor to determine whether a new start, shutdown, or nothing should be done
  async fn run(&mut self, assertion: crate::util::YesIAmInASelectBlock) -> Result<WaitingFor> {
    tracing::trace!(state = self.as_str(), "Running AutomatorState");
    match self {
      Self::Waiting { waiting_for, .. } => {
        waiting_for.wait(assertion).await;
        return Ok(waiting_for.clone());
      }
      Self::Running { task, .. } => {
        let result = task.await;
        match result {
          Ok(AutomatorFutureReturn { next_task_at }) => {
            let waiting_for = if let Some(next_task_at) = next_task_at {
              // wait 1 extra second to ensure that rounding doesn't put us into a quick loop until we hit the actual next task
              WaitingFor::retry(next_task_at.saturating_duration_since(Timestamp::now()).as_secs() + 1)
            } else {
              WaitingFor::shutdown(900)
            };
            *self = Self::Waiting { waiting_for };
          }
          Err(e) => {
            *self = Self::Waiting {
              waiting_for: WaitingFor::retry(60),
            };
            return Err(e);
          }
        }
      }
    }
    Ok(WaitingFor::UserAccess)
  }
  // Will cancel the current task and return to the waiting state by keeping the current automator
  async fn cancel(&mut self, cancel_for: std::time::Duration) {
    tracing::trace!(state = self.as_str(), "Cancelling AutomatorState");
    *self = Self::Waiting {
      waiting_for: WaitingFor::retry(cancel_for.as_secs() + 1),
    };
  }
  async fn stop(&mut self) {
    tracing::trace!(state = self.as_str(), "Stopping AutomatorState");
    *self = Self::default();
  }
  /// Resets the shutdown timer if the automator is waiting for shutdown.
  /// Called when NotifyAlive is received (user watching or task running).
  fn reset_shutdown_timer(&mut self) {
    if let Self::Waiting {
      waiting_for: WaitingFor::Shutdown(sleep, duration),
    } = self
    {
      sleep.as_mut().reset(Instant::now() + *duration);
    }
  }
  // Can be called as often as needed
  async fn start(
    &mut self,
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    app_state: &AppState,
    notify_alive_sender: tokio::sync::mpsc::Sender<AutomatorRunnerMessage>,
    automator: &Arc<parking_lot::Mutex<Automator>>,
    container: &Arc<ContainerHandle>,
  ) -> Result<()> {
    tracing::trace!(state = self.as_str(), "Starting AutomatorState");
    match &self {
      Self::Waiting { .. } => {}
      Self::Running { .. } => {
        tracing::debug!(
          %team_id,
          %linkedin_id,
          "AutomatorRunner is already running, ignoring request"
        );
        return Ok(());
      }
    };
    // Because this is in an async context we have to use try lock. The code should always work this way, so any error here should be impossible.
    let automator = automator
      .try_lock_arc()
      .ok_or_else(|| JaniumError::msg("Failed to lock automator"))?;
    let returner = AutomatorFutureReturner::new(automator, team_id, linkedin_id, app_state.clone(), container.clone());
    *self = Self::Running {
      task: returner.run(notify_alive_sender).boxed(),
    };
    Ok(())
  }
}

/// Result of creating a new AutomatorRunner
pub struct AutomatorRunnerHandle {
  pub sender: tokio::sync::mpsc::Sender<AutomatorRunnerMessage>,
  pub runner_id: Id<RunnerInstance>,
}

impl AutomatorRunner {
  pub async fn create(
    linkedin_id: Id<LinkedIn>,
    team_id: Id<Team>,
    docker_username: String,
    docker_hostname: String,
    docker_host_mount: String,
    start_port: u16,
    proxy_url: Option<String>,
    timezone: ArcSwap<TimeZone>,
    owner_contact_id: ArcSwap<Id<Contact>>,
    app_state: AppState,
    linkedin: Sender<LinkedIn>,
  ) -> Result<AutomatorRunnerHandle> {
    let runner_id = Id::new();
    let span = tracing::trace_span!(parent: tracing::Span::none(), "AutomatorRunner", %linkedin_id, %team_id, %runner_id, user = %docker_username);
    let container = ContainerHandle::new(
      linkedin_id,
      docker_username,
      docker_hostname,
      docker_host_mount,
      start_port,
      proxy_url,
      timezone.clone(),
      &app_state,
    )
    .await?;
    // Convert to SyncSender to prevent deadlocks - the runner must never block
    // waiting on the LinkedIn actor since the actor may be waiting on the runner
    let linkedin = linkedin.into_sync();
    // Must match logic in restart_container()
    let automator = Automator::new(
      format!("http://localhost:{}", container.chromedriver_port),
      container.container_service_port,
      &format!("/home/{}", container.docker_username),
      linkedin.clone(),
      app_state.clone(),
      team_id,
      timezone.clone(),
      owner_contact_id.clone(),
    )
    .await?;
    let (sender, receiver) = tokio::sync::mpsc::channel(16);
    let this = Self {
      runner_id,
      linkedin_id,
      team_id,
      timezone,
      app_state: app_state.clone(),
      receiver,
      container: Arc::new(container),
      automator: Arc::new(parking_lot::Mutex::new(automator)),
      automator_state: AutomatorState::default(),
      linkedin,
      owner_contact_id,
      self_sender: sender.clone(),
      user_access_keep_alive: UserAccessKeepAlive {
        id: linkedin_id.convert::<KeepAlive<LinkedIn>>(),
        receiver: None,
        keep_alive_until: Instant::now(),
        app_state,
        automator_runner_sender: sender.clone(),
      },
    };
    tokio::spawn(this.run().instrument(span));
    Ok(AutomatorRunnerHandle { sender, runner_id })
  }
  fn try_stop(&self) {
    let result = self
      .self_sender
      .try_send(AutomatorRunnerMessage::Stop(tokio::sync::oneshot::channel().0));
    if result.is_err() {
      tracing::error!("Error sending stop message");
      let self_sender = self.self_sender.clone();
      tokio::spawn(async move {
        self_sender
          .send(AutomatorRunnerMessage::Stop(tokio::sync::oneshot::channel().0))
          .await
          .ok()
      });
    }
  }
  async fn restart_container(&mut self) -> Result<()> {
    tracing::warn!(
      linkedin_id = ?self.linkedin_id,
      "Restarting container for infrastructure recovery"
    );
    self.automator_state.stop().await;
    self.container.stop().await.ok();
    // Safe: automator_state.stop() dropped the future returner's Arc clone,
    // so only the runner holds a reference.
    Arc::get_mut(&mut self.container)
      .ok_or_else(|| JaniumError::msg("Container Arc has other references during restart"))?
      .start(&self.app_state.opts.docker)
      .await?;
    // Must match logic in AutomatorRunner::create()
    let new_automator = Automator::new(
      format!("http://localhost:{}", self.container.chromedriver_port),
      self.container.container_service_port,
      &format!("/home/{}", self.container.docker_username),
      self.linkedin.clone(),
      self.app_state.clone(),
      self.team_id,
      self.timezone.clone(),
      self.owner_contact_id.clone(),
    )
    .await?;
    let Some(mut guard) = self.automator.try_lock() else {
      return Err(JaniumError::msg("Failed to lock automator during container restart"));
    };
    *guard = new_automator;
    tracing::info!(
      linkedin_id = ?self.linkedin_id,
      "Container restarted successfully"
    );
    Ok(())
  }
  async fn automator_state_start(&mut self) -> Result<()> {
    self
      .automator_state
      .start(
        self.team_id,
        self.linkedin_id,
        &self.app_state,
        self.self_sender.clone(),
        &self.automator,
        &self.container,
      )
      .await
  }
  async fn handle_message(&mut self, message: AutomatorRunnerMessage) -> Result<()> {
    match message {
      AutomatorRunnerMessage::Stop(_) => unreachable!(),
      AutomatorRunnerMessage::PauseAutomator { duration, sender } => {
        tracing::trace!("Handling PauseAutomator message");
        self.automator_state.cancel(duration).await;
        sender.send(()).ok();
      }
      AutomatorRunnerMessage::Automate(action) => {
        tracing::info!(
          linkedin_id = ?self.linkedin_id,
          action_id = ?action.id,
          action_type = ?action.action_type,
          campaign_id = ?action.campaign_id,
          contact_id = ?action.contact_id,
          expires_at = ?action.expires_at,
          attempts = action.attempts,
          automator_state = self.automator_state.as_str(),
          "Runner RECEIVED Automate message - saving to database"
        );
        action.save(&mut *self.app_state.db.acquire().await?).await?;
        tracing::info!(
          linkedin_id = ?self.linkedin_id,
          "Action saved to database, starting automator state"
        );
        self.automator_state_start().await?;
        tracing::info!(
          linkedin_id = ?self.linkedin_id,
          automator_state = self.automator_state.as_str(),
          "Automator state started/confirmed running"
        );
      }
      AutomatorRunnerMessage::StartUserAccess(sender) => {
        tracing::trace!("Handling StartUserAccess message");
        let result = self.start_user_access().await;
        if result.is_err() {
          self.try_stop();
        }
        sender.send(result).ok();
      }
      AutomatorRunnerMessage::StopUserAccess(sender) => {
        tracing::trace!("Handling StopUserAccess message");
        // Just clean up browser access - automation was never stopped
        if let Some(id) = self.user_access_keep_alive.stop().await {
          sender.send(id).ok();
        }
      }
      AutomatorRunnerMessage::NotifyAlive(message) => {
        // TODO: Send the user_id to the janium actor so it can be displayed in the UI.
        tracing::trace!("Handling NotifyAlive message: {}", message);
        self.automator_state.reset_shutdown_timer();
      }
    }
    Ok(())
  }
  async fn start_user_access(&mut self) -> Result<Id<KeepAlive<LinkedIn>>> {
    tracing::debug!("Starting user access - ensuring browser is running");
    // Start the automator (Chrome) if it's not already running
    self.automator_state_start().await?;
    // Create browser access to Xpra
    let id = self.user_access_keep_alive.create_user_access(&self.container).await;
    Ok(id)
  }
  async fn stop(&mut self) {
    tracing::trace!("Stopping AutomatorRunner");
    // automator_state.stop() stops the automator and does a nice shutdown of the browser, so that is done first before stopping the container.
    let _ = futures::join!(self.user_access_keep_alive.stop(), self.automator_state.stop());
    self.container.stop().await.ok();
    tracing::info!(runner_id = ?self.runner_id, "AutomatorRunner components stopped");
  }
  #[tracing::instrument(skip(self), fields(linkedin_id = %self.linkedin_id, team_id = %self.team_id))]
  async fn run(mut self) {
    const MAX_BACKOFF: std::time::Duration = std::time::Duration::from_secs(10);
    const MAX_CONSECUTIVE_FAILURES: u32 = 3;

    let mut consecutive_failures: u32 = 0;
    let mut backoff = std::time::Duration::from_secs(1);

    while let Err(e) = self.run_inner().await {
      consecutive_failures += 1;
      tracing::error!(
        ?e,
        consecutive_failures,
        backoff_secs = backoff.as_secs(),
        "Error in AutomatorRunner, retrying after backoff"
      );

      if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
        tracing::warn!(
          linkedin_id = ?self.linkedin_id,
          consecutive_failures,
          "Runner has failed {} consecutive times, notifying LinkedIn actor",
          consecutive_failures
        );
        // Notify LinkedIn actor of persistent failure
        self
          .linkedin
          .try_notify(RunnerPersistentFailure {
            runner_id: self.runner_id,
            error: format!("{:?}", e),
          })
          .ok();
        // Reset counter after notification
        consecutive_failures = 0;
      }

      sleep(backoff).await;
      backoff = (backoff * 2).min(MAX_BACKOFF);
    }

    // Notify LinkedIn actor that this runner has stopped
    tracing::info!(
      linkedin_id = ?self.linkedin_id,
      runner_id = ?self.runner_id,
      "AutomatorRunner exiting, notifying LinkedIn actor"
    );
    self
      .linkedin
      .try_notify(RunnerStopped {
        runner_id: self.runner_id,
      })
      .ok();
  }
  pub async fn run_inner(&mut self) -> Result<()> {
    const MAX_INFRA_RETRIES: u32 = 3;
    const MAX_NON_INFRA_RETRIES: u32 = 3;
    let mut infra_retries: u32 = 0;
    let mut non_infra_retries: u32 = 0;

    loop {
      tokio::select! {
        // Monitor user access session - when it ends, just log (automation continues)
        _ = self.user_access_keep_alive.keep_alive(crate::util::YesIAmInASelectBlock) => {
          tracing::debug!("User access session ended, automation continues");
        },
        result = self.automator_state.run(crate::util::YesIAmInASelectBlock) => {
          match result {
            Ok(WaitingFor::Retry(_)) => {
              infra_retries = 0;
              non_infra_retries = 0;
              self.automator_state_start().await?;
            }
            Ok(WaitingFor::UserAccess) => {},
            Ok(WaitingFor::Shutdown(_, _)) => {
              tracing::info!("Automator state returned shutdown, stopping AutomatorRunner");
              self.try_stop();
              // Reset the shutdown timer so that we don't get into a tight loop of shutdown tries.
              self.automator_state = AutomatorState::default();
            }
            Err(error) if error.is_infrastructure_error() && infra_retries < MAX_INFRA_RETRIES => {
              infra_retries += 1;
              tracing::warn!(
                ?error,
                attempt = infra_retries,
                max = MAX_INFRA_RETRIES,
                "[Infrastructure] Container/WebDriver error, restarting container (attempt {}/{})",
                infra_retries,
                MAX_INFRA_RETRIES,
              );
              match self.restart_container().await {
                Ok(()) => {
                  self.automator_state_start().await?;
                }
                Err(restart_err) => {
                  tracing::error!(?restart_err, "Failed to restart container, stopping runner");
                  self.try_stop();
                }
              }
            }
            Err(error) => {
              non_infra_retries += 1;
              if non_infra_retries >= MAX_NON_INFRA_RETRIES {
                tracing::error!(?error, "Error running automator, max retries exceeded, stopping runner");
                self.try_stop();
              } else {
                tracing::error!(
                  ?error,
                  attempt = non_infra_retries,
                  max = MAX_NON_INFRA_RETRIES,
                  "Error running automator, will retry in 60 seconds ({}/{})",
                  non_infra_retries,
                  MAX_NON_INFRA_RETRIES,
                );
                self.automator_state = AutomatorState::Waiting {
                  waiting_for: WaitingFor::retry(60),
                };
              }
            }
          }
        },
        msg = self.receiver.recv() => {
          match msg {
            Some(AutomatorRunnerMessage::Stop(sender)) => {
              tracing::debug!("AutomatorRunner received stop message, stopping immediately");
              // Close receiver to prevent new messages
              self.receiver.close();
              // Cancel any running task immediately
              self.automator_state.cancel(std::time::Duration::ZERO).await;
              // Perform full cleanup
              self.stop().await;
              // Notify the sender that we've stopped
              sender.send(()).ok();
              // Drain any remaining stop messages and notify them too
              while let Ok(msg) = self.receiver.try_recv() {
                match msg {
                  AutomatorRunnerMessage::Stop(s) => {s.send(()).ok();}
                  AutomatorRunnerMessage::Automate(action) => {
                    action.save(&mut *self.app_state.db.acquire().await?).await.ok();
                  }
                  AutomatorRunnerMessage::StopUserAccess(_) | AutomatorRunnerMessage::NotifyAlive(_) | AutomatorRunnerMessage::PauseAutomator { .. } | AutomatorRunnerMessage::StartUserAccess(_) => {},
                }
              }
              tracing::info!("AutomatorRunner stopped via stop command");
              return Ok(());
            }
            None => {
              // Channel closed externally
              self.stop().await;
              tracing::info!("AutomatorRunner returning from run_inner (channel closed)");
              return Ok(());
            }
            Some(msg) => {
              tracing::trace!("AutomatorRunner handling message");
              let result = self.handle_message(msg).await;
              if let Err(e) = result {
                tracing::error!(?e, "Error handling message");
              }
            }
          }
        }
        _ = sleep(std::time::Duration::from_secs(3600)) => {
          tracing::info!("Nothing has happened in the last hour, stopping AutomatorRunner");
          self.try_stop();
        }
      }
    }
  }
}

pub enum AutomatorRunnerMessage {
  Stop(tokio::sync::oneshot::Sender<()>),
  StopUserAccess(tokio::sync::oneshot::Sender<Id<KeepAlive<LinkedIn>>>),
  StartUserAccess(tokio::sync::oneshot::Sender<Result<Id<KeepAlive<LinkedIn>>>>),
  PauseAutomator {
    duration: std::time::Duration,
    sender: tokio::sync::oneshot::Sender<()>,
  },
  Automate(LinkedInActionRequest),
  NotifyAlive(&'static str),
}

struct AutomatorFutureReturn {
  next_task_at: Option<Timestamp>,
}

struct AutomatorFutureReturner {
  automator: parking_lot::ArcMutexGuard<parking_lot::RawMutex, Automator>,
  team_id: Id<Team>,
  linkedin_id: Id<LinkedIn>,
  app_state: AppState,
  container: Arc<ContainerHandle>,
}

impl AutomatorFutureReturner {
  pub fn new(
    automator: parking_lot::ArcMutexGuard<parking_lot::RawMutex, Automator>,
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    app_state: AppState,
    container: Arc<ContainerHandle>,
  ) -> Self {
    Self {
      automator,
      team_id,
      linkedin_id,
      app_state,
      container,
    }
  }
  pub async fn run(
    self,
    notify_alive_sender: tokio::sync::mpsc::Sender<AutomatorRunnerMessage>,
  ) -> Result<AutomatorFutureReturn> {
    let container = self.container.clone();
    let fut = self.run_inner();
    let mut interval = interval(std::time::Duration::from_secs(60));
    interval.reset();
    // Memory watchdog future, filled on each tick so Docker API calls don't
    // block the main automator future. We avoid tokio::spawn here so we don't
    // hold an Arc clone that could prevent Arc::get_mut during container restart.
    let mut memory_check: Option<Pin<Box<dyn Future<Output = ()> + Send>>> = None;
    tokio::pin!(fut);
    loop {
      tokio::select! {
        _ = interval.tick() => {
          notify_alive_sender.try_send(AutomatorRunnerMessage::NotifyAlive("Automator future runner keep alive")).ok();
          // If a previous check is still in-flight (e.g. Docker API slow),
          // skip this tick rather than queue a second one.
          if memory_check.is_none() {
            memory_check = Some(Box::pin(container.clone().check_memory()));
          }
        }
        _ = async { memory_check.as_mut().unwrap().await }, if memory_check.is_some() => {
          memory_check = None;
        }
        result = &mut fut => {
          return result;
        }
      }
    }
  }
  /// Returns all current window handles after ensuring `automator.main_window` still exists.
  /// If the main window was closed externally, adopts the first available window.
  async fn ensure_main_window(automator: &mut Automator) -> Result<Vec<thirtyfour::WindowHandle>> {
    let handles = automator.driver.windows().await?;
    if !handles.contains(&automator.main_window) {
      tracing::warn!("Main window was closed externally, adopting current window");
      let current = handles
        .first()
        .cloned()
        .ok_or_else(|| JaniumError::msg("No browser windows available"))?;
      automator.driver.switch_to_window(current.clone()).await?;
      automator.main_window = current;
    }
    Ok(handles)
  }
  async fn open_new_tab(automator: &mut Automator) -> Result<()> {
    let windows = Self::ensure_main_window(automator).await?;
    if windows.len() <= 1 {
      let handle = automator.driver.new_tab().await?;
      automator.driver.switch_to_window(handle).await?;
    } else {
      let idle = windows.iter().find(|h| *h != &automator.main_window).cloned().unwrap();
      automator.driver.switch_to_window(idle).await?;
      automator.driver.goto("about:blank").await?;
    }
    Ok(())
  }
  async fn close_extra_tabs_and_switch_to_main_tab(automator: &mut Automator) -> Result<()> {
    let handles = Self::ensure_main_window(automator).await?;
    // Close all windows except main, but never close the last one
    for handle in &handles {
      if handle != &automator.main_window {
        automator.driver.switch_to_window(handle.clone()).await?;
        automator.driver.close_window().await?;
      }
    }
    automator.driver.switch_to_window(automator.main_window.clone()).await?;
    Ok(())
  }
  pub async fn run_inner(mut self) -> Result<AutomatorFutureReturn> {
    let automator = &mut *self.automator;
    loop {
      tracing::debug!(
        team_id = ?self.team_id,
        linkedin_id = ?self.linkedin_id,
        "AutomatorFutureReturner: Looking for next task to execute"
      );
      let mut first_task = {
        let mut conn = self.app_state.db.acquire().await?;
        let now = Timestamp::now();
        let dead_tasks = LinkedInActionRequest::dead_tasks(self.team_id, self.linkedin_id, now, &mut conn).await?;
        if !dead_tasks.is_empty() {
          tracing::info!(
            linkedin_id = ?self.linkedin_id,
            dead_task_count = dead_tasks.len(),
            "Found dead tasks to process"
          );
        }
        for task in dead_tasks {
          if let Some(campaign_id) = task.campaign_id
            && let Ok(campaign) = self.app_state.router.get_handle::<Campaign>(&campaign_id)
          {
            campaign
              .notify(task)
              .await
              .inspect_err(|_| tracing::warn!("Unable to notify campaign of dead task"))
              .ok();
          }
        }
        let first_task = LinkedInActionRequest::next_task(self.team_id, self.linkedin_id, now, &mut conn).await?;
        let Some(first_task) = first_task else {
          let next_task_at =
            LinkedInActionRequest::next_task_at(self.team_id, self.linkedin_id, now, &mut conn).await?;
          tracing::info!(
            linkedin_id = ?self.linkedin_id,
            next_task_at = ?next_task_at,
            "No pending task found in database - returning from run_inner"
          );
          #[cfg(debug_assertions)]
          if let Some(next_task_at) = next_task_at {
            assert!(next_task_at >= now);
          }
          // Nothing else to do so return
          return Ok(AutomatorFutureReturn { next_task_at });
        };
        tracing::info!(
          linkedin_id = ?self.linkedin_id,
          action_id = ?first_task.id,
          action_type = ?first_task.action_type,
          campaign_id = ?first_task.campaign_id,
          contact_id = ?first_task.contact_id,
          attempts = first_task.attempts,
          "Found next task in database - starting execution"
        );
        first_task
      };

      Self::close_extra_tabs_and_switch_to_main_tab(automator)
        .await
        .inspect_err(|error| tracing::warn!(?error, "Unable to close extra tabs and switch to main tab"))
        .ok();
      let intensive = matches!(
        first_task.action,
        LinkedInAction::SyncConnections(_) | LinkedInAction::DownloadInbox(_)
      );
      let _guard = MemoryIntensiveGuard::new(&self.container.memory_intensive, intensive);
      let started_at = Timestamp::now();
      let result = run_action(&mut *automator, &first_task, &self.app_state).await;
      drop(_guard);
      let completed_at = Timestamp::now();
      let mut conn = self.app_state.db.begin().await?;
      match result {
        Ok(RunActionResult::Retry(action)) => {
          first_task.action = action;
          first_task.next_attempt_at = Timestamp::now();
          first_task.last_attempt_status = LinkedInActionRequestStatus::Pending;
          tracing::trace!(?first_task, "Task successful, saving for next step");
          first_task.save(&mut conn).await?;
        }
        Ok(RunActionResult::Return { mv, response }) => {
          match mv {
            RunActionMove::DeleteRequest => {
              // Do nothing - the request should be deleted by the campaign
            }
            RunActionMove::CreateHistory => {
              LinkedInActionHistory::new(first_task.clone(), started_at, completed_at)
                .save(&mut conn)
                .await?;
            }
            RunActionMove::CreateFailure(error) => {
              let html = automator
                .source()
                .await
                .inspect_err(|error| tracing::warn!(?error, "Unable to get source from automator"))
                .ok();
              let screenshot_png = automator
                .screenshot_as_png()
                .await
                .inspect_err(|error| tracing::warn!(?error, "Unable to screenshot automator"))
                .ok();
              LinkedInActionFailure::new(
                first_task.clone(),
                Timestamp::now(),
                format!("{:?}", error),
                html,
                screenshot_png,
              )
              .save(&mut conn)
              .await?;
            }
          }
          let mut delete_task = false;
          if let Some(campaign_id) = response.campaign_id
            && let Ok(campaign) = self.app_state.router.get_handle::<Campaign>(&campaign_id)
          {
            // Notify campaign but don't fail the task if notification fails
            if let Err(e) = campaign.notify(response).await {
              tracing::warn!(?e, "Failed to notify campaign of action result - deleting request");
              delete_task = true;
            }
          } else {
            delete_task = true;
          }
          if delete_task {
            first_task.delete(&mut *conn).await?;
          }
        }
        Ok(ref r @ (RunActionResult::Success | RunActionResult::ContactResponded)) => {
          let action_result = match r {
            RunActionResult::ContactResponded => LinkedInActionRequestResult::ContactResponded,
            _ => LinkedInActionRequestResult::Success,
          };
          if let Some(campaign_id) = first_task.campaign_id
            && let Ok(campaign) = self.app_state.router.get_handle::<Campaign>(&campaign_id)
          {
            tracing::trace!(
              ?first_task,
              "Task successful, notifying campaign and letting it clean up"
            );
            let response = LinkedInActionResponse {
              id: first_task.id,
              team_id: first_task.team_id,
              linkedin_id: first_task.linkedin_id,
              campaign_id: first_task.campaign_id,
              campaign_step_id: first_task.campaign_step_id,
              contact_id: first_task.contact_id,
              attempt_started: Some(started_at),
              attempt_ended: completed_at,
              next_attempt_at: None,
              result: action_result,
            };

            first_task.last_attempt_status = LinkedInActionRequestStatus::Success;
            let first_task = first_task.save(&mut conn).await?;
            LinkedInActionHistory::new(first_task, started_at, completed_at)
              .save(&mut conn)
              .await?;
            // Needs to be committed before sending to campaign.
            conn.commit().await?;
            // Notify campaign but don't fail if notification fails - the action is already saved
            if let Err(e) = campaign.notify(response).await {
              tracing::warn!(
                ?e,
                "Failed to notify campaign of successful action - action was saved but campaign may need manual refresh"
              );
            }
            Self::open_new_tab(automator)
              .await
              .inspect_err(|error| tracing::warn!(?error, "Unable to open new tab"))
              .ok();
            // because we already had to commit, we have to continue the loop to skip the automatic commit.
            continue;
          } else {
            tracing::trace!(?first_task, "Task successful, deleting");
            LinkedInActionHistory::new(first_task.clone(), started_at, completed_at)
              .save(&mut conn)
              .await?;
            first_task.delete(&mut *conn).await?;
          }
        }
        Err(error) if error.is_infrastructure_error() => {
          // Infrastructure error (container/WebDriver connectivity) — don't penalize the action.
          // Reset the task so it can be retried after container restart.
          tracing::warn!(
            ?error,
            ?first_task,
            "[Infrastructure] Container/WebDriver error during action execution, resetting task for retry"
          );
          first_task.last_attempt_status = LinkedInActionRequestStatus::Pending;
          first_task.next_attempt_at = Timestamp::now();
          first_task.save(&mut conn).await?;
          conn.commit().await?;
          return Err(error);
        }
        Err(error) => {
          tracing::error!(?error, ?first_task, "Error processing task");
          let now = Timestamp::now();
          let error_string = format!("{:?}", error);
          let html = automator
            .source()
            .await
            .inspect_err(|error| tracing::warn!(?error, "Unable to get source from automator"))
            .ok();
          let screenshot_png = automator
            .screenshot_as_png()
            .await
            .inspect_err(|error| tracing::warn!(?error, "Unable to screenshot automator"))
            .ok();
          LinkedInActionFailure::new(first_task.clone(), now, error_string.clone(), html, screenshot_png)
            .save(&mut conn)
            .await?;

          // Allow retries for transient failures
          const MAX_RETRIES: i16 = 1;
          let attempts = first_task.attempts; // Already incremented when task was fetched

          if attempts < MAX_RETRIES {
            // Retry: save task with backoff delay, don't notify campaign yet
            let retrying_task = first_task.retry(&mut conn).await?;
            tracing::info!(
              task_id = ?retrying_task.id,
              attempts = attempts,
              max_retries = MAX_RETRIES,
              next_attempt_at = ?retrying_task.next_attempt_at,
              "Action failed, will retry"
            );
          } else {
            // Max retries exhausted: notify campaign of final failure
            tracing::warn!(
              task_id = ?first_task.id,
              attempts = attempts,
              "Action failed after {} attempts, notifying campaign",
              attempts
            );
            if let Some(campaign_id) = first_task.campaign_id
              && let Ok(campaign) = self.app_state.router.get_handle::<Campaign>(&campaign_id)
            {
              let response = LinkedInActionResponse {
                id: first_task.id,
                team_id: first_task.team_id,
                linkedin_id: first_task.linkedin_id,
                campaign_id: first_task.campaign_id,
                campaign_step_id: first_task.campaign_step_id,
                contact_id: first_task.contact_id,
                attempt_started: Some(started_at),
                attempt_ended: Timestamp::now(),
                next_attempt_at: None,
                result: LinkedInActionRequestResult::Failed(error),
              };
              // Mark as failed (will be cleaned up by dead_tasks)
              first_task.fail(&mut conn).await?;
              // Notify campaign but don't let notification failure prevent error handling
              if let Err(e) = campaign.notify(response).await {
                tracing::warn!(?e, "Failed to notify campaign of failed action");
              }
            } else {
              first_task.delete(&mut *conn).await?;
            }
            conn.commit().await?;
            Self::open_new_tab(automator)
              .await
              .inspect_err(|error| tracing::warn!(?error, "Unable to open new tab"))
              .ok();
            return Err(JaniumError::msg(error_string));
          }
        }
      }
      Self::open_new_tab(automator)
        .await
        .inspect_err(|error| tracing::warn!(?error, "Unable to open new tab"))
        .ok();
      conn.commit().await?;
    }
  }
}

#[derive(Debug)]
pub enum RunActionMove {
  DeleteRequest,
  #[expect(dead_code)]
  CreateHistory,
  #[expect(dead_code)]
  CreateFailure(JaniumError),
}

#[derive(Debug, Default)]
pub enum RunActionResult {
  #[expect(dead_code)]
  Retry(LinkedInAction),
  Return {
    mv: RunActionMove,
    response: LinkedInActionResponse,
  },
  #[default]
  Success,
  ContactResponded,
}

#[tracing::instrument(skip_all, fields(
  action_id = %request.id,
  action_type = ?request.action_type,
  campaign_id = %request.campaign_id.unwrap_or_default(),
  campaign_step_id = %request.campaign_step_id.unwrap_or_default(),
  contact_id = %request.contact_id.unwrap_or_default(),
))]
async fn run_action(
  automator: &mut Automator,
  request: &LinkedInActionRequest,
  app_state: &AppState,
) -> Result<RunActionResult> {
  let result = match &request.action {
    LinkedInAction::ScrapeSalesNavQuery(scrape_sales_navigator_url) => {
      automator
        .process_sales_navigator_url(scrape_sales_navigator_url, app_state)
        .await?;
      RunActionResult::Success
    }

    LinkedInAction::SendConnectionRequest(send_connection_request) => automator
      .send_connection_request(send_connection_request, request, app_state)
      .await
      .map(|r| {
        if let Some(response) = r {
          RunActionResult::Return {
            mv: RunActionMove::DeleteRequest,
            response,
          }
        } else {
          RunActionResult::Success
        }
      })?,

    LinkedInAction::SyncConnections(SyncConnections { full_sync }) => {
      automator.sync_connections(*full_sync, app_state).await?;
      automator
        .linked_in
        .spawn_notify(SyncCompleted { full_sync: *full_sync });
      RunActionResult::Success
    }

    LinkedInAction::DownloadInbox(action) => {
      let full_sync = action.full_sync;
      automator.download_inbox(full_sync).await?;
      let team_id = request.team_id;
      let linkedin_id = request.linkedin_id;
      automator.linked_in.spawn_notify(
        async move |actor: &mut LinkedIn, _: &Router, state: &mut LinkedInState| {
          let now = Timestamp::now();
          actor.last_inbox_download = Some(now);
          if full_sync {
            actor.last_full_inbox_download = Some(now);
          }
          state.actor_state.scheduler.spawn_notify(Schedule {
            execute_at: Timestamp::now() + 3.hours(),
            kind: ScheduledTaskKind::DownloadInbox {
              team_id,
              linkedin_id,
              full_sync: false,
            },
            retry_policy: Some(RetryPolicy {
              max_retries: 2,
              retry_delay_ms: 5 * 60 * 1000,
            }),
          });
          match state.actor_state.db.acquire().await {
            Ok(mut conn) => {
              actor
                .clone()
                .save(&mut conn)
                .await
                .inspect_err(|error| tracing::warn!(?error, "Failed to save LinkedIn after inbox download"))
                .ok();
            }
            Err(error) => tracing::warn!(?error, "Failed to acquire DB connection after inbox download"),
          }
        },
      );
      RunActionResult::Success
    }

    LinkedInAction::SendMessage(action) => match automator
      .send_li_message_via_inbox(
        action.contact_id,
        request.linkedin_id,
        &action.contact_name,
        &action.message_content,
        action.skip_response_check,
      )
      .await?
    {
      crate::automator::send_message::SendMessageOutcome::Sent => RunActionResult::Success,
      crate::automator::send_message::SendMessageOutcome::ContactResponded => RunActionResult::ContactResponded,
    },
  };

  Ok(result)
}

pub struct KeepAlive<T> {
  _value: std::marker::PhantomData<fn() -> T>,
}

pub struct UserAccessKeepAlive {
  id: Id<KeepAlive<LinkedIn>>,
  receiver: Option<tokio::sync::mpsc::Receiver<KeepAliveMessage>>,
  keep_alive_until: Instant,
  app_state: AppState,
  // This can never be awaited otherwise it can deadlock the automator runner.
  automator_runner_sender: tokio::sync::mpsc::Sender<AutomatorRunnerMessage>,
}

pub struct KeepAliveMessage {
  pub instant: Instant,
  pub user_id: Id<User>,
}

impl UserAccessKeepAlive {
  async fn stop(&mut self) -> Option<Id<KeepAlive<LinkedIn>>> {
    self.receiver.take()?;
    self.app_state.xpra_browser_state.remove(&self.id).await;
    Some(self.id)
  }
  // This can only be polled from a select! block, so that pending future won't cause everything to stop forever.
  // This should only return if the user access keep alive is stopped.
  // which will trigger a start of the automator
  async fn keep_alive(&mut self, assertion: crate::util::YesIAmInASelectBlock) {
    let _ = assertion;
    // cannot use interval because it always returns an instant even when used with now_or_never or poll_immediate
    // Send NotifyAlive every 60s to reset the 900s shutdown timer while a user is watching
    let now = Instant::now();
    let mut instant_iter = (1..).map(|i| now + std::time::Duration::from_secs(i * 60));
    let mut next_instant = instant_iter.next().unwrap();
    loop {
      if let Some(keep_alive_receiver) = &mut self.receiver {
        match timeout_at(self.keep_alive_until, keep_alive_receiver.recv()).await {
          Ok(Some(msg)) => {
            tracing::trace!("Got keep alive for {}", self.id);
            self.keep_alive_until = msg.instant + std::time::Duration::from_secs(300);
            if next_instant < msg.instant {
              tracing::trace!("interval ticked at {next_instant:?}");
              self
                .automator_runner_sender
                .try_send(AutomatorRunnerMessage::NotifyAlive("User access keep alive"))
                .ok();
              next_instant = instant_iter.next().unwrap();
            }
            // TODO: send the user_id to the janium actor so it can be displayed in the UI.
          }
          Ok(None) | Err(_) => {
            self.stop().await;
            return;
          }
        }
      } else {
        std::future::pending::<()>().await;
      }
    }
  }
  async fn create_user_access(&mut self, handle: &ContainerHandle) -> Id<KeepAlive<LinkedIn>> {
    if self.receiver.is_none() {
      let receiver = self
        .app_state
        .xpra_browser_state
        .insert(
          self.id,
          std::time::Duration::from_secs(10),
          format!("localhost:{}", handle.xpra_http_port),
        )
        .await;
      self.keep_alive_until = Instant::now() + std::time::Duration::from_secs(300);
      self.receiver = Some(receiver);
    }
    self.id
  }
}
