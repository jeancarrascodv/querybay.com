use crate::models::{LogEntry, LogLevel, SpanContext};
use crate::prelude::*;
use tokio::sync::broadcast;
use tracing::span;
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;

/// Configuration for the database logging layer
#[derive(Debug, Clone, clap::Args)]
pub struct DbLoggingOptions {
  #[arg(long, env = "DB_LOG_BATCH_SIZE", default_value_t = 100)]
  pub batch_size: usize,
  #[arg(long, env = "DB_LOG_FLUSH_INTERVAL_MS", default_value_t = 1000)]
  pub flush_interval_ms: u64,
  #[arg(long, env = "DB_LOG_RETENTION_DAYS", default_value_t = 14)]
  pub retention_days: i64,
}

impl Default for DbLoggingOptions {
  fn default() -> Self {
    Self {
      batch_size: 100,
      flush_interval_ms: 1000,
      retention_days: 14,
    }
  }
}

/// Stored span data containing extracted IDs
#[derive(Debug, Clone, Default)]
struct SpanData {
  context: SpanContext,
}

/// A tracing layer that writes logs to the database
pub struct DbLayer {
  sender: tokio::sync::mpsc::UnboundedSender<Arc<LogEntry>>,
}

impl DbLayer {
  /// Create a new DbLayer and spawn the writer task immediately
  pub fn new(
    db: sqlx::PgPool,
    broadcast_sender: broadcast::Sender<Arc<LogEntry>>,
    config: &DbLoggingOptions,
    shutdown_guard: crate::config::ShutdownGuard<DbLayer>,
  ) -> Self {
    let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();

    // Spawn the writer task
    tokio::spawn(log_writer_task(
      db,
      broadcast_sender,
      receiver,
      config.clone(),
      shutdown_guard,
    ));

    Self { sender }
  }
  #[cfg(test)]
  pub fn new_dummy() -> Self {
    Self {
      sender: tokio::sync::mpsc::unbounded_channel().0,
    }
  }
}

/// Field visitor to extract values from span/event fields
struct FieldVisitor {
  context: SpanContext,
  fields: serde_json::Map<String, serde_json::Value>,
  message: Option<String>,
}

impl FieldVisitor {
  fn new() -> Self {
    Self {
      context: SpanContext::default(),
      fields: serde_json::Map::new(),
      message: None,
    }
  }

  fn try_extract_id(&mut self, field: &tracing::field::Field, value: &str) -> bool {
    let name = field.name();
    match name {
      "team_id" => {
        if self.context.team_id.is_none() {
          self.context.team_id = Id::<Team>::parse_from_str(value);
        }
        self.context.team_id.is_some()
      }
      "campaign_id" => {
        if self.context.campaign_id.is_none() {
          self.context.campaign_id = Id::<Campaign>::parse_from_str(value);
          if self.context.campaign_id == Some(Id::nil()) {
            self.context.campaign_id = None;
          }
        }
        self.context.campaign_id.is_some()
      }
      "campaign_step_id" => {
        if self.context.campaign_step_id.is_none() {
          self.context.campaign_step_id = Id::<CampaignStep>::parse_from_str(value);
          if self.context.campaign_step_id == Some(Id::nil()) {
            self.context.campaign_step_id = None;
          }
        }
        self.context.campaign_step_id.is_some()
      }
      "contact_id" => {
        if self.context.contact_id.is_none() {
          self.context.contact_id = Id::<Contact>::parse_from_str(value);
          if self.context.contact_id == Some(Id::nil()) {
            self.context.contact_id = None;
          }
        }
        self.context.contact_id.is_some()
      }
      "linkedin_id" => {
        if self.context.linkedin_id.is_none() {
          self.context.linkedin_id = Id::<LinkedIn>::parse_from_str(value);
          if self.context.linkedin_id == Some(Id::nil()) {
            self.context.linkedin_id = None;
          }
        }
        self.context.linkedin_id.is_some()
      }
      "action_id" => {
        if self.context.action_id.is_none() {
          self.context.action_id = Id::<LinkedInActionRequest>::parse_from_str(value);
          if self.context.action_id == Some(Id::nil()) {
            self.context.action_id = None;
          }
        }
        self.context.action_id.is_some()
      }
      "request_id" => {
        if self.context.request_id.is_none() {
          self.context.request_id = Id::<http::Request<()>>::parse_from_str(value);
          if self.context.request_id == Some(Id::nil()) {
            self.context.request_id = None;
          }
        }
        self.context.request_id.is_some()
      }
      _ => false,
    }
  }
}

impl tracing::field::Visit for FieldVisitor {
  fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
    let value_str = format!("{:?}", value);
    let value_str = value_str.trim_matches('"');

    // Try to extract as ID first
    if self.try_extract_id(field, value_str) {
      return;
    }

    // Handle message field specially
    if field.name() == "message" {
      self.message = Some(value_str.to_string());
      return;
    }

    // Store as generic field
    self.fields.insert(
      field.name().to_string(),
      serde_json::Value::String(value_str.to_string()),
    );
  }

  fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
    // Try to extract as ID first
    if self.try_extract_id(field, value) {
      return;
    }

    // Handle message field specially
    if field.name() == "message" {
      self.message = Some(value.to_string());
      return;
    }

    // Store as generic field
    self
      .fields
      .insert(field.name().to_string(), serde_json::Value::String(value.to_string()));
  }

  fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
    self
      .fields
      .insert(field.name().to_string(), serde_json::Value::Number(value.into()));
  }

  fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
    self
      .fields
      .insert(field.name().to_string(), serde_json::Value::Number(value.into()));
  }

  fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
    self
      .fields
      .insert(field.name().to_string(), serde_json::Value::Bool(value));
  }

  fn record_f64(&mut self, field: &tracing::field::Field, value: f64) {
    if let Some(n) = serde_json::Number::from_f64(value) {
      self
        .fields
        .insert(field.name().to_string(), serde_json::Value::Number(n));
    }
  }
}

impl<S> Layer<S> for DbLayer
where
  S: tracing::Subscriber + for<'lookup> LookupSpan<'lookup>,
{
  fn on_new_span(&self, attrs: &span::Attributes<'_>, id: &span::Id, ctx: Context<'_, S>) {
    let span = ctx.span(id).expect("span not found");

    // Extract fields from span attributes
    let mut visitor = FieldVisitor::new();
    attrs.record(&mut visitor);

    // Get parent context and merge
    if let Some(parent_span) = span.parent()
      && let Some(parent_data) = parent_span.extensions().get::<SpanData>()
    {
      visitor.context.merge(&parent_data.context);
    }

    // Store the span data
    span.extensions_mut().insert(SpanData {
      context: visitor.context,
    });
  }

  fn on_record(&self, id: &span::Id, values: &span::Record<'_>, ctx: Context<'_, S>) {
    let span = ctx.span(id).expect("span not found");

    let mut visitor = FieldVisitor::new();
    values.record(&mut visitor);

    // Update the span data
    let mut extensions = span.extensions_mut();
    if let Some(data) = extensions.get_mut::<SpanData>() {
      data.context.merge(&visitor.context);
    }
  }

  fn on_event(&self, event: &tracing::Event<'_>, ctx: Context<'_, S>) {
    let metadata = event.metadata();
    let level = LogLevel::from_tracing_level(metadata.level());
    let timestamp = Timestamp::now();

    // Extract fields from event
    let mut visitor = FieldVisitor::new();
    event.record(&mut visitor);

    // Get context from current span hierarchy
    let mut context = SpanContext::default();

    if let Some(scope) = ctx.event_scope(event) {
      for span in scope {
        if let Some(data) = span.extensions().get::<SpanData>() {
          context.merge(&data.context);
        }
      }
    }

    // Merge event-level context
    context.merge(&visitor.context);

    // Build the message
    let message = visitor.message.unwrap_or_else(|| {
      visitor
        .fields
        .get("message")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_default()
    });

    // Create log entry
    let entry = LogEntry::new(
      level,
      message,
      metadata.target().to_string(),
      timestamp,
      context,
      serde_json::Value::Object(visitor.fields),
    );

    // Send to writer (non-blocking)
    let _ = self.sender.send(entry.into());
  }
}

/// Background task that batches and writes logs to the database
async fn log_writer_task(
  db: sqlx::PgPool,
  broadcast_sender: broadcast::Sender<Arc<LogEntry>>,
  mut receiver: tokio::sync::mpsc::UnboundedReceiver<Arc<LogEntry>>,
  config: DbLoggingOptions,
  mut shutdown_guard: crate::config::ShutdownGuard<DbLayer>,
) {
  let mut buffer = Vec::with_capacity(config.batch_size);

  let flush_interval = std::time::Duration::from_millis(config.flush_interval_ms);
  let mut flush_timer = tokio::time::interval(flush_interval);
  flush_timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
  let mut cleanup_interval = tokio::time::interval(std::time::Duration::from_secs(3600)); // Run hourly
  let shutdown = async {
    shutdown_guard.wait_for_shutdown().await;
    shutdown_guard
  };

  futures::pin_mut!(shutdown);

  loop {
    tokio::select! {
      entry = receiver.recv() => {
        match entry {
          Some(entry) => {
            // Broadcast to live subscribers
            let _ = broadcast_sender.send(entry.clone());

            buffer.push(entry);

            // Flush if buffer is full
            if buffer.len() >= config.batch_size {
              flush_buffer(&db, &mut buffer, &mut receiver).await;
            }
          }
          None => {
            // Channel closed, flush remaining and exit
            while let Ok(entry) = receiver.try_recv() {
              buffer.push(entry);
            }
            if !buffer.is_empty() {
              flush_buffer(&db, &mut buffer, &mut receiver).await;
            }
            break;
          }
        }
      }
      _ = flush_timer.tick() => {
        // Periodic flush
        if !buffer.is_empty() {
          flush_buffer(&db, &mut buffer, &mut receiver).await;
        }
      }
      _ = cleanup_interval.tick() => {
        let retention_days = config.retention_days;
        let db = db.clone();
        tokio::spawn(async move {
          match LogEntry::cleanup_old_logs(retention_days, &db).await {
            Ok(deleted) => {
              tracing::info!(deleted, retention_days, "Cleaned up old log entries");
            }
            Err(error) => {
              tracing::error!(?error, retention_days, "Failed to cleanup old log entries");
            }
          }
        });
      }
      guard = &mut shutdown => {
        // Channel closed, flush remaining and exit
        while let Ok(entry) = receiver.try_recv() {
          buffer.push(entry);
        }
        if !buffer.is_empty() {
          flush_buffer(&db, &mut buffer, &mut receiver).await;
        }
        drop(guard);
        break;
      }
    }
  }
}

async fn flush_buffer(
  db: &sqlx::PgPool,
  buffer: &mut Vec<Arc<LogEntry>>,
  receiver: &mut tokio::sync::mpsc::UnboundedReceiver<Arc<LogEntry>>,
) {
  if buffer.is_empty() {
    return;
  }

  let entries = std::mem::take(buffer);

  if let Err(e) = LogEntry::batch_insert(entries.iter(), db).await {
    // Log to stderr since we can't use tracing (would cause recursion)
    eprintln!("ERROR: Failed to write logs to database: {:?}", e);
    // Put entries back in buffer for retry (up to a limit)
    if entries.len() < 1000 {
      *buffer = entries;
    }
  }
  while let Ok(entry) = receiver.try_recv() {
    buffer.push(entry);
  }
}

fn transient_log_entry(message: impl Into<String>, target: impl Into<String>) -> Arc<LogEntry> {
  Arc::new(LogEntry::new(
    LogLevel::Trace,
    message.into(),
    target.into(),
    Timestamp::now(),
    SpanContext::default(),
    serde_json::Value::Object(serde_json::Map::new()),
  ))
}

pub fn query_stream(filter: LogFilter, app_state: AppState) -> impl futures::Stream<Item = Arc<LogEntry>> {
  // subscribe before starting the query. This may lead to duplicate logs, but should (mostly) avoid missing logs.
  // To completely avoid missing logs and duplicates, we need to get a signal from the log writer task when it flushes
  // so that we are running a query after the last commit but have already started the subscription.
  let mut receiver = if filter.live_logs.unwrap_or(true) {
    app_state.log_broadcast.subscribe()
  } else {
    // capacity must be >= 1; sender is dropped immediately so recv() returns Closed
    tokio::sync::broadcast::channel(1).1
  };

  let mut query_receiver = if filter.history_logs.unwrap_or(true) {
    LogEntry::query(&filter, &app_state.db)
  } else {
    // buffer must be >= 1; sender is dropped immediately so recv() returns None
    tokio::sync::mpsc::channel(1).1
  };

  let mut heartbeat = tokio::time::interval(std::time::Duration::from_secs(
    filter.heartbeat_interval_secs.unwrap_or(10).into(),
  ));
  async_stream::stream! {
    if filter.history_logs.unwrap_or(true) {
      yield transient_log_entry(
        "Log history started",
        "janium::logs::history::start",
      );
    }
    loop {
      // Need to yield logs from the query first while also receiving logs from the broadcast
      tokio::select! {
        entry = query_receiver.recv() => {
          match entry {
            Some(Ok(entry)) => {
              if filter.matches(&entry) {
                yield Arc::new(entry);
              }
            }
            Some(Err(e)) => {
              tracing::error!("error receiving log entry: {e}");
            }
            None => {
              break;
            }
          }
        }
        _ = heartbeat.tick() => {
          yield transient_log_entry(
            "Heartbeat",
            "janium::logs::heartbeat",
          );
        }
        entry = receiver.recv() => {
          match entry {
            Ok(entry) => {
              if filter.matches(&entry) {
                yield entry;
              }
            }
            Err(e) => {
              tracing::error!("error receiving log entry: {e}");
              break;
            }
          }
        }
      }
    }
    if filter.history_logs.unwrap_or(true) {
      yield transient_log_entry(
        "Log history ended",
        "janium::logs::history::end",
      );
    }
    loop {
      tokio::select! {
        _ = heartbeat.tick() => {
          yield transient_log_entry(
            "Heartbeat",
            "janium::logs::heartbeat",
          );
        }
        entry = receiver.recv() => {
          match entry {
            Ok(entry) => {
              if filter.matches(&entry) {
                yield entry.clone();
              }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
              tracing::warn!("Log subscription lagged by {} messages", n);
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
              break;
            }
          }
        }
      }
    }
  }
}
