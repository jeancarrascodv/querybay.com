use std::collections::{BinaryHeap, HashMap};
use std::hash::{Hash, Hasher};
use std::pin::Pin;

use futures::stream::{FuturesUnordered, StreamExt};

use crate::prelude::*;

struct DispatchOutcome {
  task_id: Id<ScheduledTask>,
  success: bool,
  tracked: bool,
}

type DispatchFuture = Pin<Box<dyn Future<Output = DispatchOutcome> + Send>>;

/// Heap entry with reversed ordering so `BinaryHeap` acts as a min-heap (earliest first).
#[derive(Debug, Clone, Eq, PartialEq)]
struct QueueEntry {
  execute_at: Timestamp,
  task_id: Id<ScheduledTask>,
}

impl Ord for QueueEntry {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    other
      .execute_at
      .cmp(&self.execute_at)
      .then_with(|| other.task_id.cmp(&self.task_id))
  }
}

impl PartialOrd for QueueEntry {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

// --- Data types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
  pub max_retries: i16,
  pub retry_delay_ms: u64,
}

#[derive(Debug, Clone)]

pub struct ScheduledTask {
  pub id: Id<ScheduledTask>,
  pub execute_at: Timestamp,
  pub kind: ScheduledTaskKind,
  pub created_at: Timestamp,
  pub retry_policy: Option<RetryPolicy>,
  pub attempts: i16,
}

#[derive(Debug, Clone, ormlite::Model)]
#[ormlite(table = "scheduled_tasks")]
struct ScheduledTaskDb {
  #[ormlite(primary_key)]
  pub id: Id<ScheduledTask>,
  pub execute_at: Timestamp,
  pub kind: ScheduledTaskKind,
  pub created_at: Timestamp,
  pub attempts: i16,
  // If these are zero then it maps to None for the retry policy
  pub max_retries: i16,
  pub retry_delay_ms: i64,
}

impl From<ScheduledTaskDb> for ScheduledTask {
  fn from(db: ScheduledTaskDb) -> Self {
    Self {
      id: db.id,
      execute_at: db.execute_at,
      kind: db.kind,
      created_at: db.created_at,
      retry_policy: if db.max_retries > 0 {
        Some(RetryPolicy {
          max_retries: db.max_retries,
          retry_delay_ms: db.retry_delay_ms.max(0) as u64,
        })
      } else {
        None
      },
      attempts: db.attempts,
    }
  }
}

impl From<ScheduledTask> for ScheduledTaskDb {
  fn from(task: ScheduledTask) -> Self {
    Self {
      id: task.id,
      execute_at: task.execute_at,
      kind: task.kind,
      created_at: task.created_at,
      attempts: task.attempts,
      max_retries: task.retry_policy.as_ref().map(|r| r.max_retries).unwrap_or(0),
      retry_delay_ms: task
        .retry_policy
        .as_ref()
        .map(|r| (r.retry_delay_ms as i64).max(0))
        .unwrap_or(0),
    }
  }
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for ScheduledTask {
  fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
    let db = ScheduledTaskDb::from_row(row)?;
    Ok(db.into())
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScheduledTaskKind {
  EvaluateCampaign {
    campaign_id: Id<Campaign>,
  },
  EvaluateLinkedIn {
    linkedin_id: Id<LinkedIn>,
  },
  SyncLinkedInConnections {
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    full_sync: bool,
  },
  DownloadInbox {
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    full_sync: bool,
  },
}

impl PartialEq for ScheduledTaskKind {
  fn eq(&self, other: &Self) -> bool {
    match (self, other) {
      (
        Self::EvaluateCampaign { campaign_id },
        Self::EvaluateCampaign {
          campaign_id: other_campaign_id,
        },
      ) => campaign_id == other_campaign_id,
      (
        Self::EvaluateLinkedIn { linkedin_id },
        Self::EvaluateLinkedIn {
          linkedin_id: other_linkedin_id,
        },
      ) => linkedin_id == other_linkedin_id,
      (
        Self::SyncLinkedInConnections {
          team_id,
          linkedin_id,
          full_sync: _,
        },
        Self::SyncLinkedInConnections {
          team_id: other_team_id,
          linkedin_id: other_linkedin_id,
          full_sync: _,
        },
      ) => team_id == other_team_id && linkedin_id == other_linkedin_id,
      (
        Self::DownloadInbox {
          team_id,
          linkedin_id,
          full_sync: _,
        },
        Self::DownloadInbox {
          team_id: other_team_id,
          linkedin_id: other_linkedin_id,
          full_sync: _,
        },
      ) => team_id == other_team_id && linkedin_id == other_linkedin_id,
      _ => false,
    }
  }
}

impl Eq for ScheduledTaskKind {}

impl Hash for ScheduledTaskKind {
  fn hash<H: Hasher>(&self, state: &mut H) {
    match self {
      Self::EvaluateCampaign { campaign_id } => campaign_id.hash(state),
      Self::EvaluateLinkedIn { linkedin_id } => linkedin_id.hash(state),
      Self::SyncLinkedInConnections {
        team_id,
        linkedin_id,
        full_sync: _,
      } => {
        team_id.hash(state);
        linkedin_id.hash(state);
      }
      Self::DownloadInbox {
        team_id,
        linkedin_id,
        full_sync: _,
      } => {
        team_id.hash(state);
        linkedin_id.hash(state);
      }
    }
  }
}

impl sqlx::Type<sqlx::Postgres> for ScheduledTaskKind {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <sqlx::types::Json<Self> as sqlx::Type<sqlx::Postgres>>::type_info()
  }
  fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
    <sqlx::types::Json<Self> as sqlx::Type<sqlx::Postgres>>::compatible(ty)
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for ScheduledTaskKind {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    sqlx::types::Json::encode_by_ref(&sqlx::types::Json(crate::types::IdReverser(self)), buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for ScheduledTaskKind {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    sqlx::types::Json::<crate::types::IdReverser<Self>>::decode(value).map(|i| i.0.0)
  }
}

// --- Scheduler actor ---

pub struct Scheduler {
  id: Id<Scheduler>,
}

impl Scheduler {
  pub fn new() -> Self {
    Self { id: Id::nil() }
  }

  /// Single long-lived task that polls all in-flight dispatch futures.
  async fn watcher_loop(
    mut rx: tokio::sync::mpsc::UnboundedReceiver<DispatchFuture>,
    oneshot_rx: tokio::sync::oneshot::Receiver<Sender<Scheduler>>,
    mut guard: crate::config::ShutdownGuard<SchedulerWatcher>,
  ) {
    let mut in_flight = FuturesUnordered::new();
    let Ok(scheduler_sender) = oneshot_rx.await else {
      tracing::error!("Scheduler watcher loop exited because oneshot channel was closed");
      return;
    };
    let shutdown = async {
      guard.wait_for_shutdown().await;
      guard
    };
    futures::pin_mut!(shutdown);
    loop {
      tokio::select! {
        fut = rx.recv() => {
          let Some(fut) = fut else {
            tracing::warn!("Scheduler watcher loop exited because receiver was closed");
            break;
          };
          in_flight.push(fut);
        }
        Some(outcome) = in_flight.next(), if !in_flight.is_empty() => {
          if outcome.tracked {
            scheduler_sender
              .notify(DispatchResult { task_id: outcome.task_id, success: outcome.success })
              .await
              .inspect_err(|error| tracing::error!(task_id = %outcome.task_id, ?error, "Failed to send DispatchResult to scheduler"))
              .ok();
          }
        }
        _ = &mut shutdown => break,
        else => break,
      }
    }
    tracing::warn!("Scheduler watcher loop exited");
  }
}

pub struct SchedulerState {
  db: sqlx::PgPool,
  _shutdown_guard: crate::config::ShutdownGuard<Scheduler>,
  /// Min-heap ordered by (execute_at, task_id).
  queue: BinaryHeap<QueueEntry>,
  /// Canonical store — a task exists iff it's live (pending or dispatched-and-tracked).
  tasks: HashMap<Id<ScheduledTask>, ScheduledTask>,
  /// Reverse index: kind -> task id, for deduplication.
  kind_index: HashMap<ScheduledTaskKind, Id<ScheduledTask>>,
  /// Channel to feed dispatch futures to the single watcher task.
  watcher_tx: tokio::sync::mpsc::UnboundedSender<DispatchFuture>,
  /// Timestamp of the next task to fire. Used to keep from creating too many timer tasks.
  next_task: Timestamp,
  /// When true, `ExecuteNext` is a no-op — tasks stay queued but don't dispatch.
  #[cfg(test)]
  pub paused: bool,
}

impl SchedulerState {
  pub async fn new(
    db: sqlx::PgPool,
    shutdown_controller: &crate::config::ShutdownController,
  ) -> (Self, tokio::sync::oneshot::Sender<Sender<Scheduler>>) {
    let (watcher_tx, watcher_rx) = tokio::sync::mpsc::unbounded_channel::<DispatchFuture>();
    let (oneshot_tx, oneshot_rx) = tokio::sync::oneshot::channel::<Sender<Scheduler>>();
    let guard = crate::config::ShutdownGuard::<SchedulerWatcher>::new(shutdown_controller, "scheduler_watcher");
    tokio::spawn(Scheduler::watcher_loop(watcher_rx, oneshot_rx, guard));
    let this = Self {
      db,
      _shutdown_guard: crate::config::ShutdownGuard::new(shutdown_controller, "scheduler"),
      queue: BinaryHeap::new(),
      tasks: HashMap::new(),
      kind_index: HashMap::new(),
      watcher_tx,
      next_task: Timestamp::MAX,
      #[cfg(test)]
      paused: true,
    };
    (this, oneshot_tx)
  }

  /// Clean cancelled/dispatched ghost entries from the top of the heap.
  /// If ghost entries exceed 10% of the heap (with 100+ entries), rebuild the entire heap.
  fn drain_cancelled(&mut self) {
    while let Some(entry) = self.queue.peek() {
      if !self.tasks.contains_key(&entry.task_id) {
        self.queue.pop();
      } else {
        break;
      }
    }

    let heap_len = self.queue.len();
    let live_len = self.tasks.len();
    if heap_len > 100 && heap_len - live_len > heap_len / 10 {
      let old_len = heap_len;
      self.queue.retain(|entry| self.tasks.contains_key(&entry.task_id));
      tracing::debug!(before = old_len, after = self.queue.len(), "Compacted scheduler heap");
    }
  }

  /// Insert a task into all in-memory indexes.
  fn insert_task(&mut self, task: ScheduledTask) {
    self.queue.push(QueueEntry {
      execute_at: task.execute_at,
      task_id: task.id,
    });
    self.kind_index.insert(task.kind.clone(), task.id);
    self.tasks.insert(task.id, task);
  }

  /// Remove a task from all in-memory indexes (heap entry is left for lazy deletion).
  fn remove_task(&mut self, id: &Id<ScheduledTask>) -> Option<ScheduledTask> {
    let task = self.tasks.remove(id)?;
    self.kind_index.remove(&task.kind);
    Some(task)
  }

  fn rearm_timer(&mut self, router: &Router) {
    self.drain_cancelled();
    let Some(entry) = self.queue.peek() else {
      return;
    };
    let next_at = entry.execute_at;
    // Don't rearm if the next task is already scheduled to fire
    if next_at == self.next_task {
      return;
    }
    let Ok(scheduler_sender) = router.get_handle::<Scheduler>(&Id::nil()).inspect_err(|error| {
      tracing::error!(?error, "Failed to get scheduler handle, timer will not fire");
    }) else {
      return;
    };
    self
      .watcher_tx
      .send(Box::pin(async move {
        let now = Timestamp::now();
        if now < next_at {
          let duration = next_at.saturating_duration_since(now);
          tokio::time::sleep(duration).await;
        }
        scheduler_sender.notify(ExecuteNext).await.ok();
        DispatchOutcome {
          // these are the wakeup timer futures that are not associated with any task
          task_id: Id::nil(),
          success: true,
          tracked: false,
        }
      }))
      .unwrap();
    self.next_task = next_at;
  }

  async fn delete_from_db(&self, id: Id<ScheduledTask>) {
    sqlx::query::<sqlx::Postgres>("DELETE FROM scheduled_tasks WHERE id = $1")
      .bind(id)
      .execute(&self.db)
      .await
      .inspect_err(|error| tracing::warn!(%id, ?error, "Failed to delete scheduled task from DB"))
      .ok();
  }

  /// Build a future that dispatches the task and returns a `DispatchOutcome`.
  fn build_dispatch_future(
    task_id: Id<ScheduledTask>,
    kind: ScheduledTaskKind,
    tracked: bool,
    router: Router,
  ) -> DispatchFuture {
    Box::pin(async move {
      let success = match &kind {
        ScheduledTaskKind::EvaluateCampaign { campaign_id } => match router.get_handle::<Campaign>(campaign_id) {
          Ok(sender) => match sender.send(super::campaign::EvaluateCampaign).await {
            Ok(Ok(())) => true,
            Ok(Err(error)) => {
              tracing::warn!(%task_id, ?error, "Campaign evaluation returned error");
              false
            }
            Err(error) => {
              tracing::warn!(%task_id, ?error, "Failed to send to campaign actor");
              false
            }
          },
          Err(error) => {
            tracing::warn!(%task_id, ?error, %campaign_id, "Target campaign actor not found");
            false
          }
        },
        ScheduledTaskKind::EvaluateLinkedIn { linkedin_id } => match router.get_handle::<LinkedIn>(linkedin_id) {
          Ok(sender) => match sender.send(super::linkedin::EvaluateLinkedIn).await {
            Ok(Ok(())) => true,
            Ok(Err(error)) => {
              tracing::warn!(%task_id, ?error, "LinkedIn evaluation returned error");
              false
            }
            Err(error) => {
              tracing::warn!(%task_id, ?error, "Failed to send to LinkedIn actor");
              false
            }
          },
          Err(error) => {
            tracing::warn!(%task_id, ?error, %linkedin_id, "Target LinkedIn actor not found");
            false
          }
        },
        ScheduledTaskKind::SyncLinkedInConnections {
          team_id,
          linkedin_id,
          full_sync,
        } => match router.get_handle::<LinkedIn>(linkedin_id) {
          Ok(sender) => match sender
            .send(LinkedInActionRequest::new(
              LinkedInAction::SyncConnections(SyncConnections { full_sync: *full_sync }),
              *team_id,
              *linkedin_id,
              None,
              None,
              None,
              Timestamp::now() + 3.hours(),
              None,
            ))
            .await
          {
            Ok(Ok(())) => true,
            Ok(Err(error)) => {
              tracing::warn!(%task_id, ?error, "LinkedIn connection sync returned error");
              false
            }
            Err(error) => {
              tracing::warn!(%task_id, ?error, "Failed to send to LinkedIn actor");
              false
            }
          },
          Err(error) => {
            tracing::warn!(%task_id, ?error, %linkedin_id, "Target LinkedIn actor not found for sync");
            false
          }
        },
        ScheduledTaskKind::DownloadInbox {
          team_id,
          linkedin_id,
          full_sync,
        } => match router.get_handle::<LinkedIn>(linkedin_id) {
          Ok(sender) => match sender
            .send(LinkedInActionRequest::new(
              LinkedInAction::DownloadInbox(DownloadInbox { full_sync: *full_sync }),
              *team_id,
              *linkedin_id,
              None,
              None,
              None,
              Timestamp::now() + 3.hours(),
              None,
            ))
            .await
          {
            Ok(Ok(())) => true,
            Ok(Err(error)) => {
              tracing::warn!(%task_id, ?error, "LinkedIn inbox download returned error");
              false
            }
            Err(error) => {
              tracing::warn!(%task_id, ?error, "Failed to send to LinkedIn actor");
              false
            }
          },
          Err(error) => {
            tracing::warn!(%task_id, ?error, %linkedin_id, "Target LinkedIn actor not found for inbox download");
            false
          }
        },
      };
      DispatchOutcome {
        task_id,
        success,
        tracked,
      }
    })
  }

  /// Send a task to the watcher loop for execution.
  fn dispatch(&self, task_id: Id<ScheduledTask>, kind: ScheduledTaskKind, tracked: bool, router: &Router) {
    let fut = Self::build_dispatch_future(task_id, kind, tracked, router.clone());
    if self.watcher_tx.send(fut).is_err() {
      tracing::error!(%task_id, "Watcher task is gone, cannot dispatch task");
    }
  }
}

/// Marker type for the watcher task's shutdown guard.
struct SchedulerWatcher;

impl Actor for Scheduler {
  type Id = Id<Scheduler>;
  type IdRef = Id<Scheduler>;
  type State = SchedulerState;
  type StartResult = ();

  fn id_ref(&self) -> &Self::IdRef {
    &self.id
  }

  async fn start(&mut self, router: &Router, state: &mut SchedulerState) -> janium_actors::DynResult {
    let tasks: Vec<ScheduledTask> = sqlx::query_as(
      "SELECT id, execute_at, kind, created_at, max_retries, retry_delay_ms, attempts FROM scheduled_tasks",
    )
    .fetch_all(&state.db)
    .await?;

    let now = Timestamp::now();
    let mut overdue_count = 0u64;
    for mut task in tasks {
      if task.execute_at <= now {
        let stagger = std::time::Duration::from_millis(20 * overdue_count);
        overdue_count += 1;
        task.execute_at = now + stagger;
      }
      state.insert_task(task);
    }
    if overdue_count > 0 {
      tracing::info!(overdue_count, "Staggered overdue tasks on startup");
    }
    state.rearm_timer(router);
    tracing::info!(pending_tasks = state.tasks.len(), "Scheduler started");
    Ok(())
  }
}

// --- Messages ---

pub struct Schedule {
  pub execute_at: Timestamp,
  pub kind: ScheduledTaskKind,
  pub retry_policy: Option<RetryPolicy>,
}

impl Message<Scheduler> for Schedule {
  type Return = Result<Id<ScheduledTask>>;

  async fn handle(self, _scheduler: &mut Scheduler, router: &Router, state: &mut SchedulerState) -> Self::Return {
    // Deduplication: if a task of the same kind already exists, only replace if the new one is earlier
    if let Some(existing_id) = state.kind_index.get(&self.kind).copied() {
      if let Some(existing_task) = state.tasks.get(&existing_id)
        && self.execute_at > existing_task.execute_at
      {
        // New task is later — keep the existing earlier one
        tracing::debug!(old_id = %existing_id, kind = ?self.kind, "Keeping existing earlier task, ignoring later schedule");
        return Ok(existing_id);
      }
      state.remove_task(&existing_id);
      tracing::debug!(old_id = %existing_id, kind = ?self.kind, "Replacing existing task with earlier one");
      state.delete_from_db(existing_id).await;
    }

    let task = ScheduledTask {
      id: Id::new(),
      execute_at: self.execute_at,
      kind: self.kind,
      created_at: Timestamp::now(),
      retry_policy: self.retry_policy,
      attempts: 0,
    };
    ScheduledTaskDb::from(task.clone()).insert(&state.db).await?;
    let id = task.id;
    tracing::info!(
      task_id = %id,
      kind = ?task.kind,
      execute_at = %task.execute_at,
      tracked = task.retry_policy.is_some(),
      "Task scheduled"
    );
    state.insert_task(task);
    state.rearm_timer(router);
    Ok(id)
  }
}

#[allow(unused)]
pub struct CancelTask(pub Id<ScheduledTask>);

impl Message<Scheduler> for CancelTask {
  type Return = Result<bool>;

  async fn handle(self, _scheduler: &mut Scheduler, router: &Router, state: &mut SchedulerState) -> Self::Return {
    let Some(task) = state.remove_task(&self.0) else {
      return Ok(false);
    };
    state.delete_from_db(self.0).await;
    tracing::info!(task_id = %self.0, kind = ?task.kind, "Task cancelled");
    // Only rearm if we might have removed the head of the queue
    let was_head = state
      .queue
      .peek()
      .is_none_or(|entry| task.execute_at <= entry.execute_at);
    if was_head {
      state.rearm_timer(router);
    }
    Ok(true)
  }
}

struct ExecuteNext;

impl Message<Scheduler> for ExecuteNext {
  type Return = ();

  async fn handle(self, _scheduler: &mut Scheduler, router: &Router, state: &mut SchedulerState) {
    #[cfg(test)]
    if state.paused {
      return;
    }

    let now = Timestamp::now();
    let mut fire_and_forget_ids: Vec<Id<ScheduledTask>> = Vec::new();

    while let Some(entry) = state.queue.peek() {
      if entry.execute_at > now {
        break;
      }
      let id = entry.task_id;
      state.queue.pop();

      let Some(task) = state.tasks.get_mut(&id) else {
        continue;
      };

      let tracked = task.retry_policy.is_some();

      if tracked {
        task.attempts += 1;
        tracing::info!(
          task_id = %id,
          kind = ?task.kind,
          attempt = task.attempts,
          max_retries = task.retry_policy.as_ref().unwrap().max_retries,
          "Dispatching tracked task"
        );
        let attempts = task.attempts;
        let kind = task.kind.clone();
        state.dispatch(id, kind, true, router);
        // Update attempts in DB
        sqlx::query::<sqlx::Postgres>("UPDATE scheduled_tasks SET attempts = $1 WHERE id = $2")
          .bind(attempts)
          .bind(id)
          .execute(&state.db)
          .await
          .inspect_err(|error| tracing::warn!(%id, ?error, "Failed to update task attempts in DB"))
          .ok();
      } else {
        let Some(task) = state.remove_task(&id) else {
          continue;
        };
        tracing::debug!(task_id = %id, kind = ?task.kind, "Dispatching fire-and-forget task");
        state.dispatch(id, task.kind, false, router);
        fire_and_forget_ids.push(id);
      }
    }

    if !fire_and_forget_ids.is_empty() {
      sqlx::query::<sqlx::Postgres>("DELETE FROM scheduled_tasks WHERE id = ANY($1)")
        .bind(&fire_and_forget_ids)
        .execute(&state.db)
        .await
        .inspect_err(|error| {
          tracing::warn!(
            ?error,
            count = fire_and_forget_ids.len(),
            "Failed to batch delete fire-and-forget tasks"
          )
        })
        .ok();
    }

    state.rearm_timer(router);
  }
}

struct DispatchResult {
  task_id: Id<ScheduledTask>,
  success: bool,
}

impl Message<Scheduler> for DispatchResult {
  type Return = ();

  async fn handle(self, _scheduler: &mut Scheduler, router: &Router, state: &mut SchedulerState) {
    let Some(task) = state.tasks.get(&self.task_id) else {
      // Task was cancelled while dispatch was in flight
      tracing::debug!(task_id = %self.task_id, "DispatchResult for unknown task (likely cancelled)");
      return;
    };

    if self.success {
      tracing::info!(task_id = %self.task_id, kind = ?task.kind, attempts = task.attempts, "Tracked task completed");
      state.remove_task(&self.task_id);
      state.delete_from_db(self.task_id).await;
    } else {
      let Some(retry_policy) = task.retry_policy.as_ref() else {
        tracing::error!(task_id = %self.task_id, kind = ?task.kind, "DispatchResult failure for task without retry_policy, removing");
        state.remove_task(&self.task_id);
        state.delete_from_db(self.task_id).await;
        return;
      };
      if task.attempts <= retry_policy.max_retries {
        let retry_delay = std::time::Duration::from_millis(retry_policy.retry_delay_ms);
        let retry_at = Timestamp::now() + retry_delay;
        tracing::warn!(
          task_id = %self.task_id,
          kind = ?task.kind,
          attempt = task.attempts,
          max_retries = retry_policy.max_retries,
          ?retry_at,
          "Tracked task failed, scheduling retry"
        );
        state.queue.push(QueueEntry {
          execute_at: retry_at,
          task_id: self.task_id,
        });
        state.rearm_timer(router);
      } else {
        tracing::error!(
          task_id = %self.task_id,
          kind = ?task.kind,
          attempts = task.attempts,
          "Tracked task failed after max retries"
        );
        state.remove_task(&self.task_id);
        state.delete_from_db(self.task_id).await;
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test::app_state_test;
  use rstest::rstest;
  use std::time::Duration;

  // --- Helpers ---

  /// Reset all scheduler state (in-memory + DB) for a clean test, and unpause.
  async fn clean(state: &crate::AppState) {
    let s = sched(state);
    s.send(Mutation::new(
      |_: &mut Scheduler, _: &Router, state: &mut SchedulerState| {
        state.tasks.clear();
        state.kind_index.clear();
        state.queue.clear();
        state.paused = false;
      },
    ))
    .await
    .unwrap();
    sqlx::query("DELETE FROM scheduled_tasks")
      .execute(&state.db)
      .await
      .unwrap();
  }

  fn sched(state: &crate::AppState) -> Sender<Scheduler> {
    state.router.get_handle::<Scheduler>(&Id::nil()).unwrap()
  }

  async fn query_tasks(s: &Sender<Scheduler>) -> usize {
    s.send(Query::new(|_: &Scheduler, _: &Router, st: &SchedulerState| {
      st.tasks.len()
    }))
    .await
    .unwrap()
  }

  async fn query_heap(s: &Sender<Scheduler>) -> usize {
    s.send(Query::new(|_: &Scheduler, _: &Router, st: &SchedulerState| {
      st.queue.len()
    }))
    .await
    .unwrap()
  }

  async fn db_task(db: &sqlx::PgPool, id: Id<ScheduledTask>) -> Option<ScheduledTask> {
    sqlx::query_as("SELECT id, execute_at, kind, created_at, max_retries, retry_delay_ms, attempts FROM scheduled_tasks WHERE id = $1")
      .bind(id)
      .fetch_optional(db)
      .await
      .unwrap()
  }

  async fn db_count(db: &sqlx::PgPool) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM scheduled_tasks")
      .fetch_one(db)
      .await
      .unwrap()
  }

  fn future_at(secs: u64) -> Timestamp {
    Timestamp::now() + Duration::from_secs(secs)
  }

  // --- Unit tests ---

  #[test]
  fn queue_entry_min_heap_ordering() {
    let now = Timestamp::now();
    let later = now + Duration::from_secs(10);

    let early = QueueEntry {
      execute_at: now,
      task_id: Id::new(),
    };
    let late = QueueEntry {
      execute_at: later,
      task_id: Id::new(),
    };

    // Reversed Ord: earlier is "greater" so BinaryHeap pops it first
    assert!(early > late);

    let mut heap = BinaryHeap::new();
    heap.push(late);
    heap.push(early);
    assert_eq!(heap.pop().unwrap().execute_at, now);
    assert_eq!(heap.pop().unwrap().execute_at, later);
  }

  // --- Integration tests ---

  #[rstest]
  #[case::fire_and_forget(None)]
  #[case::tracked(Some(RetryPolicy { max_retries: 3, retry_delay_ms: 100 }))]
  fn schedule_persists_task(#[case] retry_policy: Option<RetryPolicy>) {
    app_state_test(20, async move |state| {
      clean(&state).await;
      let s = sched(&state);

      let execute_at = future_at(3600);
      let id = s
        .send(Schedule {
          execute_at,
          kind: ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() },
          retry_policy: retry_policy.clone(),
        })
        .await
        .unwrap()
        .unwrap();

      let task = db_task(&state.db, id).await.expect("task should be in DB");
      assert_eq!(task.execute_at, execute_at);
      assert_eq!(task.attempts, 0);
      assert_eq!(task.retry_policy.is_some(), retry_policy.is_some());
      assert_eq!(query_tasks(&s).await, 1);
      assert_eq!(query_heap(&s).await, 1);
    });
  }

  #[rstest]
  #[case::existing(true)]
  #[case::nonexistent(false)]
  fn cancel_task_variants(#[case] exists: bool) {
    app_state_test(20, async move |state| {
      clean(&state).await;
      let s = sched(&state);

      let id = if exists {
        s.send(Schedule {
          execute_at: future_at(3600),
          kind: ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() },
          retry_policy: None,
        })
        .await
        .unwrap()
        .unwrap()
      } else {
        Id::new()
      };

      let cancelled = s.send(CancelTask(id)).await.unwrap().unwrap();
      assert_eq!(cancelled, exists);

      if exists {
        assert!(db_task(&state.db, id).await.is_none());
        assert_eq!(query_tasks(&s).await, 0);
      }
    });
  }

  #[test_log::test]
  fn deduplication_replaces_with_earlier() {
    app_state_test(20, async |state| {
      clean(&state).await;
      let s = sched(&state);

      let campaign_id = Id::new();
      let kind = ScheduledTaskKind::EvaluateCampaign { campaign_id };

      // Schedule at 7200, then try to replace with earlier 3600
      let id1 = s
        .send(Schedule {
          execute_at: future_at(7200),
          kind: kind.clone(),
          retry_policy: None,
        })
        .await
        .unwrap()
        .unwrap();

      let id2 = s
        .send(Schedule {
          execute_at: future_at(3600),
          kind: kind.clone(),
          retry_policy: None,
        })
        .await
        .unwrap()
        .unwrap();

      assert_ne!(id1, id2);
      assert!(
        db_task(&state.db, id1).await.is_none(),
        "old later task should be deleted"
      );
      assert!(db_task(&state.db, id2).await.is_some(), "new earlier task should exist");
      assert_eq!(query_tasks(&s).await, 1);
      assert_eq!(db_count(&state.db).await, 1);

      // Now try to schedule a later one — should keep the earlier one
      let id3 = s
        .send(Schedule {
          execute_at: future_at(9999),
          kind,
          retry_policy: None,
        })
        .await
        .unwrap()
        .unwrap();

      assert_eq!(id3, id2, "should return existing task id when later");
      assert!(
        db_task(&state.db, id2).await.is_some(),
        "earlier task should still exist"
      );
      assert_eq!(query_tasks(&s).await, 1);
      assert_eq!(db_count(&state.db).await, 1);
    });
  }

  #[rstest]
  #[case::campaign(ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() })]
  #[case::linkedin(ScheduledTaskKind::EvaluateLinkedIn { linkedin_id: Id::new() })]
  fn fire_and_forget_dispatches_and_deletes(#[case] kind: ScheduledTaskKind) {
    app_state_test(20, async move |state| {
      clean(&state).await;
      let s = sched(&state);

      let id = s
        .send(Schedule {
          execute_at: Timestamp::now(),
          kind,
          retry_policy: None,
        })
        .await
        .unwrap()
        .unwrap();

      tokio::time::sleep(Duration::from_millis(500)).await;

      assert!(
        db_task(&state.db, id).await.is_none(),
        "should be deleted after dispatch"
      );
      assert_eq!(query_tasks(&s).await, 0);
    });
  }

  #[test_log::test]
  fn tracked_success_dispatches_and_deletes() {
    app_state_test(20, async |state| {
      clean(&state).await;
      let s = sched(&state);

      // EvaluateCampaign will fail (no campaign actor registered) but tracked task handles that
      let id = s
        .send(Schedule {
          execute_at: Timestamp::now(),
          kind: ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() },
          retry_policy: Some(RetryPolicy {
            max_retries: 3,
            retry_delay_ms: 100,
          }),
        })
        .await
        .unwrap()
        .unwrap();

      tokio::time::sleep(Duration::from_millis(500)).await;

      assert!(db_task(&state.db, id).await.is_none());
      assert_eq!(query_tasks(&s).await, 0);
    });
  }

  #[rstest]
  #[case::campaign(ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() })]
  #[case::linkedin(ScheduledTaskKind::EvaluateLinkedIn { linkedin_id: Id::new() })]
  fn tracked_failure_retries_then_exhausts(#[case] kind: ScheduledTaskKind) {
    app_state_test(20, async move |state| {
      clean(&state).await;
      let s = sched(&state);

      // No Campaign/LinkedIn actors registered, so dispatch will fail
      let id = s
        .send(Schedule {
          execute_at: Timestamp::now(),
          kind,
          retry_policy: Some(RetryPolicy {
            max_retries: 2,
            retry_delay_ms: 100,
          }),
        })
        .await
        .unwrap()
        .unwrap();

      // Initial attempt + 2 retries (100ms each) + processing overhead
      tokio::time::sleep(Duration::from_millis(1500)).await;

      assert!(
        db_task(&state.db, id).await.is_none(),
        "should be deleted after exhausting retries"
      );
      assert_eq!(query_tasks(&s).await, 0);
    });
  }

  #[test_log::test]
  fn tracked_failure_increments_attempts_in_db() {
    app_state_test(20, async |state| {
      clean(&state).await;
      let s = sched(&state);

      let id = s
        .send(Schedule {
          execute_at: Timestamp::now(),
          kind: ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() },
          // Long retry delay so we can observe intermediate state
          retry_policy: Some(RetryPolicy {
            max_retries: 5,
            retry_delay_ms: 5000,
          }),
        })
        .await
        .unwrap()
        .unwrap();

      // Wait for first attempt + DispatchResult processing
      tokio::time::sleep(Duration::from_millis(500)).await;

      let task = db_task(&state.db, id)
        .await
        .expect("should still exist during retry window");
      assert_eq!(task.attempts, 1);
      assert_eq!(query_tasks(&s).await, 1);
    });
  }

  #[test_log::test]
  fn cancel_during_inflight_dispatch() {
    app_state_test(20, async |state| {
      clean(&state).await;
      let s = sched(&state);

      // Schedule a tracked task that will fail (no campaign actor registered)
      // Use a long retry delay so the task stays in-memory after first attempt
      let id = s
        .send(Schedule {
          execute_at: Timestamp::now(),
          kind: ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() },
          retry_policy: Some(RetryPolicy {
            max_retries: 5,
            retry_delay_ms: 60_000,
          }),
        })
        .await
        .unwrap()
        .unwrap();

      // Wait for dispatch + DispatchResult to be processed (task is now waiting for retry)
      tokio::time::sleep(Duration::from_millis(500)).await;
      assert_eq!(query_tasks(&s).await, 1, "task should still exist during retry window");

      // Cancel while the task is waiting for its next retry
      let cancelled = s.send(CancelTask(id)).await.unwrap().unwrap();
      assert!(cancelled);
      assert_eq!(query_tasks(&s).await, 0);
      assert!(db_task(&state.db, id).await.is_none());
    });
  }

  #[test_log::test]
  fn multiple_coexisting_kinds() {
    app_state_test(20, async |state| {
      clean(&state).await;
      let s = sched(&state);

      let campaign_id = Id::new();
      let linkedin_id = Id::new();
      let team_id = Id::new();

      let id_campaign1 = s
        .send(Schedule {
          execute_at: future_at(3600),
          kind: ScheduledTaskKind::EvaluateCampaign { campaign_id },
          retry_policy: None,
        })
        .await
        .unwrap()
        .unwrap();

      let id_linkedin = s
        .send(Schedule {
          execute_at: future_at(3601),
          kind: ScheduledTaskKind::EvaluateLinkedIn { linkedin_id },
          retry_policy: Some(RetryPolicy {
            max_retries: 2,
            retry_delay_ms: 100,
          }),
        })
        .await
        .unwrap()
        .unwrap();

      let id_sync = s
        .send(Schedule {
          execute_at: future_at(3602),
          kind: ScheduledTaskKind::SyncLinkedInConnections {
            team_id,
            linkedin_id,
            full_sync: false,
          },
          retry_policy: None,
        })
        .await
        .unwrap()
        .unwrap();

      assert_eq!(query_tasks(&s).await, 3);
      assert_eq!(query_heap(&s).await, 3);
      assert_eq!(db_count(&state.db).await, 3);

      // Cancel the middle one — others should be unaffected
      s.send(CancelTask(id_linkedin)).await.unwrap().unwrap();
      assert_eq!(query_tasks(&s).await, 2);
      assert_eq!(db_count(&state.db).await, 2);
      assert!(db_task(&state.db, id_campaign1).await.is_some());
      assert!(db_task(&state.db, id_linkedin).await.is_none());
      assert!(db_task(&state.db, id_sync).await.is_some());

      // Scheduling a new task of the same kind as linkedin should work (no stale kind_index entry)
      let id_linkedin2 = s
        .send(Schedule {
          execute_at: future_at(3603),
          kind: ScheduledTaskKind::EvaluateLinkedIn { linkedin_id },
          retry_policy: None,
        })
        .await
        .unwrap()
        .unwrap();

      assert_eq!(query_tasks(&s).await, 3);
      assert!(db_task(&state.db, id_linkedin2).await.is_some());
    });
  }

  #[test_log::test]
  fn heap_compaction_triggers_above_threshold() {
    app_state_test(20, async |state| {
      clean(&state).await;
      let s = sched(&state);

      // Populate 120 tasks directly in memory (skip DB for speed)
      let task_ids: Vec<Id<ScheduledTask>> = s
        .send(Mutation::new(
          |_: &mut Scheduler, _: &Router, state: &mut SchedulerState| {
            let mut ids = Vec::new();
            for i in 0..120u64 {
              let task = ScheduledTask {
                id: Id::new(),
                execute_at: future_at(3600 + i),
                kind: ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() },
                created_at: Timestamp::now(),
                retry_policy: None,
                attempts: 0,
              };
              ids.push(task.id);
              state.insert_task(task);
            }
            ids
          },
        ))
        .await
        .unwrap();

      assert_eq!(query_tasks(&s).await, 120);
      assert_eq!(query_heap(&s).await, 120);

      // Remove 20 tasks with LATER execute_at so ghosts stay in the heap body (not the top)
      s.send(Mutation::new(
        move |_: &mut Scheduler, _: &Router, state: &mut SchedulerState| {
          for &id in &task_ids[100..] {
            state.remove_task(&id);
          }
        },
      ))
      .await
      .unwrap();

      assert_eq!(query_tasks(&s).await, 100);
      assert_eq!(query_heap(&s).await, 120); // 20 ghosts

      // Scheduling triggers rearm_timer → drain_cancelled → compaction
      s.send(Schedule {
        execute_at: future_at(99999),
        kind: ScheduledTaskKind::EvaluateCampaign { campaign_id: Id::new() },
        retry_policy: None,
      })
      .await
      .unwrap()
      .unwrap();

      // 100 live + 1 new = 101
      assert_eq!(query_tasks(&s).await, 101);
      assert_eq!(query_heap(&s).await, 101);
    });
  }
}
