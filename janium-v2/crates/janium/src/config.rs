use crate::prelude::*;
use core::time::Duration;
use sqlx::prelude::*;
use std::env::var;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::signal::unix::{Signal, SignalKind, signal};
use tracing::log::LevelFilter;

static CONNECTION_ID: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[derive(Debug)]
pub struct ShutdownSignal(());

impl From<ShutdownSignal> for crate::error::JaniumError {
  #[track_caller]
  fn from(_: ShutdownSignal) -> Self {
    crate::error::JaniumError::shutdown()
  }
}

/// Centralized shutdown coordination. Tracks all active shutdown guards by name
/// and provides the watch channel for signaling shutdown.
#[derive(Clone)]
pub struct ShutdownController {
  inner: Arc<ShutdownControllerInner>,
}

struct GuardRegistry {
  guards: HashMap<u64, std::borrow::Cow<'static, str>>,
  next_id: u64,
}

impl GuardRegistry {
  fn new() -> Self {
    Self {
      guards: HashMap::new(),
      next_id: 0,
    }
  }

  fn register(&mut self, name: std::borrow::Cow<'static, str>) -> u64 {
    let id = self.next_id;
    self.next_id += 1;
    self.guards.insert(id, name);
    id
  }

  fn deregister(&mut self, id: u64) {
    self.guards.remove(&id);
  }

  fn names(&self) -> Vec<std::borrow::Cow<'static, str>> {
    self.guards.values().cloned().collect()
  }

  #[expect(dead_code)]
  fn is_empty(&self) -> bool {
    self.guards.is_empty()
  }
}

struct ShutdownControllerInner {
  sender: tokio::sync::watch::Sender<u64>,
  registry: std::sync::Mutex<GuardRegistry>,
}

impl ShutdownController {
  pub fn new() -> Self {
    Self {
      inner: Arc::new(ShutdownControllerInner {
        sender: tokio::sync::watch::channel(0).0,
        registry: std::sync::Mutex::new(GuardRegistry::new()),
      }),
    }
  }

  fn register(&self, name: std::borrow::Cow<'static, str>) -> (u64, tokio::sync::watch::Receiver<u64>) {
    let id = self.inner.registry.lock().unwrap().register(name);
    (id, self.inner.sender.subscribe())
  }

  fn deregister(&self, id: u64) {
    self.inner.registry.lock().unwrap().deregister(id);
  }

  pub fn signal_shutdown(&self) {
    self.inner.sender.send_modify(|u| {
      if *u == 0 {
        #[cfg(not(test))]
        std::thread::Builder::new()
          .stack_size(64 * 1024)
          .name("Deadlock killer".into())
          .spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(120));
            tracing::error!("Killing process due to potential deadlock");
            eprintln!("Killing process due to potential deadlock");
            std::process::exit(5);
          })
          .map(|_| ())
          .unwrap_or_else(|_| eprintln!("Unable to spawn deadlock killer thread"));
      }
      *u += 1
    });
  }

  pub fn active_guard_names(&self) -> Vec<std::borrow::Cow<'static, str>> {
    self.inner.registry.lock().unwrap().names()
  }

  pub async fn complete_shutdown(&self, seconds: u16) {
    let mut interval = tokio::time::interval(std::time::Duration::from_millis(10));
    let start = interval.tick().await;
    let mut seconds_elapsed = 0;
    for _ in 0..(seconds as u32 * 100) {
      let duration = interval.tick().await - start;
      let names = self.active_guard_names();
      if names.is_empty() {
        tracing::warn!("All shutdown guards closed after {duration:?}. Exiting");
        return;
      }
      if duration.as_secs() > seconds_elapsed {
        seconds_elapsed = duration.as_secs();
        tracing::warn!(
          "Elapsed: {seconds_elapsed}s. Waiting for {} guards: {:?}",
          names.len(),
          names
        );
      }
    }
    #[cfg(not(test))]
    std::process::exit(6);
    #[cfg(test)]
    tracing::warn!(
      "Shutdown timed out after {seconds}s with guards: {:?}",
      self.active_guard_names()
    );
  }
}

pub struct ShutdownGuard<T: 'static = ()> {
  receiver: tokio::sync::watch::Receiver<u64>,
  controller: ShutdownController,
  guard_id: u64,
  name: std::borrow::Cow<'static, str>,
  on_shutdown: Option<Box<dyn FnOnce() + Send + Sync + 'static>>,
  signal_shutdown: bool,
  _phantom: core::marker::PhantomData<fn() -> T>,
}

#[allow(unused)]
impl<T: 'static> ShutdownGuard<T> {
  pub fn new(controller: &ShutdownController, name: impl Into<std::borrow::Cow<'static, str>>) -> Self {
    let name = name.into();
    tracing::trace!(%name, type = ::core::any::type_name::<T>(), "Creating shutdown guard");
    let (guard_id, receiver) = controller.register(name.clone());
    Self {
      receiver,
      controller: controller.clone(),
      guard_id,
      name,
      on_shutdown: None,
      signal_shutdown: true,
      _phantom: core::marker::PhantomData,
    }
  }
  pub fn with_shutdown(mut self, on_shutdown: impl FnOnce() + Send + Sync + 'static) -> Self {
    self.on_shutdown = Some(Box::new(on_shutdown));
    self
  }
  pub fn disable_signal_shutdown(mut self) {
    self.signal_shutdown = false;
  }
  pub async fn wait_for_shutdown(&mut self) {
    tracing::trace!(
      name = %self.name,
      type = ::core::any::type_name::<T>(),
      "Waiting for shutdown signal"
    );
    if let Ok(v) = self.receiver.wait_for(|x| *x > 0).await {
      tracing::debug!(value = *v, name = %self.name, type = ::core::any::type_name::<T>(), "Shutdown signal was received");
    } else {
      tracing::error!(name = %self.name, type = ::core::any::type_name::<T>(), "Shutdown signal was not received before sender was dropped");
    }
  }
  pub async fn wait_for_shutdown_owned(mut self) {
    self.wait_for_shutdown().await
  }
  pub fn has_received_shutdown(&self) -> bool {
    *self.receiver.borrow() > 0
  }
  pub async fn interrupt<U, F: core::future::Future<Output = U>>(&mut self, f: F) -> Result<U, ShutdownSignal> {
    tracing::trace!(
      name = %self.name,
      type = ::core::any::type_name::<T>(),
      "Calling interrupt"
    );
    futures::pin_mut!(f);
    let shutdown = self.wait_for_shutdown();
    futures::pin_mut!(shutdown);
    match futures::future::select(f, shutdown).await {
      futures::future::Either::Left((res, _)) => Ok(res),
      futures::future::Either::Right(((), _)) => Err(ShutdownSignal(())),
    }
  }
  pub async fn interrupt_spawn(mut self, f: impl Future<Output = ()> + Send + 'static) {
    self.interrupt(f).await.ok();
  }
}

impl<T: 'static> Drop for ShutdownGuard<T> {
  fn drop(&mut self) {
    tracing::debug!(name = %self.name, type = ::core::any::type_name::<T>(), "shutdown");
    self.controller.deregister(self.guard_id);
    if self.signal_shutdown {
      self.controller.signal_shutdown();
    }
    if let Some(f) = self.on_shutdown.take() {
      (f)();
    }
  }
}

#[derive(clap::Parser)]
#[clap(propagate_version = true, version = "0.1.0")]
pub struct JaniumCli {
  #[command(subcommand)]
  pub cmd: Option<Cmd>,
  #[command(flatten)]
  pub database: DatabaseOptions,
  #[command(flatten)]
  pub kendo: KendoApiOptions,
  #[command(flatten)]
  pub docker: DockerOptions,
  #[command(flatten)]
  pub auth_config: crate::auth::AuthConfig,
  #[command(flatten)]
  pub integrations: IntegrationOptions,
  #[command(flatten)]
  pub acme: AcmeOptions,
  #[command(flatten)]
  pub db_logging: crate::db_logging::DbLoggingOptions,
  #[arg(long, env = "CONTACT_SERVICE_CACHE_LIMIT", default_value_t = 100_000)]
  pub contact_service_cache_limit: usize,
  #[arg(long, env = "COMPANY_SERVICE_CACHE_LIMIT", default_value_t = 100_000)]
  pub company_service_cache_limit: usize,
  #[arg(long, env = "EMAIL_GROUP_SERVICE_CACHE_LIMIT", default_value_t = 100_000)]
  pub email_group_service_cache_limit: usize,
  #[arg(long, env = "SENT_EMAIL_HISTORY_SERVICE_CACHE_LIMIT", default_value_t = 100_000)]
  pub sent_email_history_service_cache_limit: usize,
  #[arg(long, env = "TEAM_EVALUATION_INTERVAL_MIN_MS", default_value_t = 60_000)]
  pub team_evaluation_interval_min_ms: u64,
  #[arg(long, env = "TEAM_EVALUATION_INTERVAL_MAX_MS", default_value_t = 60_000)]
  pub team_evaluation_interval_max_ms: u64,
  #[arg(long, env = "JANIUM_PORT", default_value_t = default_port())]
  pub janium_port: u16,
  #[arg(long, env = "EXPOSE_INTERNAL_ERRORS", default_value_t = false)]
  pub expose_internal_errors: bool,
  #[arg(long, env = "DEFAULT_MAX_CONSECUTIVE_ERRORS", default_value_t = 1)]
  pub default_max_consecutive_errors: i16,
}

fn default_port() -> u16 {
  #[cfg(debug_assertions)]
  {
    8080
  }
  #[cfg(not(debug_assertions))]
  {
    8443
  }
}

#[derive(clap::Subcommand, Clone, Debug)]
pub enum Cmd {
  ReverseUuid(ReverseUuid),
  PasswordHash(PasswordHash),
}

impl Cmd {
  pub fn run(self) {
    match self {
      Self::ReverseUuid(id) => {
        println!("{}", id.id.reverse());
      }
      Self::PasswordHash(password) => {
        println!("Hashing: `{}`", password.password);
        println!("{}", UserService::hash_password(&password.password).unwrap());
      }
    }
  }
}

#[derive(clap::Args, Clone, Debug)]
pub struct ReverseUuid {
  pub id: Id<()>,
}

#[derive(clap::Args, Clone, Debug)]
pub struct PasswordHash {
  pub password: String,
}

const DEFAULT_DATABASE_SCHEMA: &str = "public";
const DEFAULT_KENDO_API_URL: &str = "https://kendoemailapp.com";
const DEFAULT_KENDO_API_KEY: &str = "not-found";

#[derive(clap::Args, Clone, Debug)]
pub struct IntegrationOptions {
  #[arg(long, env = "OPENAI_API_KEY")]
  pub openai_api_key: Option<Arc<str>>,
  #[arg(long, env = "OPENAI_MODEL", default_value = "gpt-5-mini")]
  pub openai_model: Arc<str>,
  #[command(flatten)]
  pub vision: VisionConfig,
}

/// Configuration for AI vision fallback (Claude vision API)
#[derive(clap::Args, Clone, Debug)]
pub struct VisionConfig {
  /// Anthropic API key for Claude vision
  #[arg(long, env = "ANTHROPIC_API_KEY")]
  pub anthropic_api_key: Option<Arc<str>>,
  /// Claude model to use for vision analysis
  #[arg(long, env = "ANTHROPIC_VISION_MODEL", default_value = "claude-sonnet-4-5")]
  pub anthropic_vision_model: Arc<str>,
  /// Maximum retries for vision API calls
  #[arg(long, env = "VISION_MAX_RETRIES", default_value_t = 2)]
  pub vision_max_retries: u32,
}

#[derive(clap::Args, Clone, Debug)]
pub struct AcmeOptions {
  #[arg(long, env = "ACME_EMAIL")]
  pub acme_email: Option<String>,
  #[arg(long, env = "ACME_DOMAIN")]
  pub acme_server_domain: Option<String>,
  #[arg(long, env = "ACME_CACHE_DIR")]
  pub acme_cache_dir: Option<PathBuf>,
  #[arg(long, env = "ACME_PROD", default_value_t = false)]
  pub acme_prod: bool,
}

impl AcmeOptions {
  pub fn is_enabled(&self) -> bool {
    self.acme_email.is_some() && self.acme_server_domain.is_some() && self.acme_cache_dir.is_some()
  }
  pub fn acme_email(&self) -> &str {
    self.acme_email.as_ref().unwrap()
  }
  pub fn acme_server_domain(&self) -> &str {
    self.acme_server_domain.as_ref().unwrap()
  }
  pub fn acme_cache_dir(&self) -> &PathBuf {
    self.acme_cache_dir.as_ref().unwrap()
  }
}

#[derive(clap::Args, Clone, Debug)]
pub struct DockerOptions {
  #[arg(
    long,
    env = "DOCKER_BASE_CONTAINER_DIR",
    default_value_t = base_container_dir()
  )]
  pub base_container_dir: String,
  #[arg(long, env = "DOCKER_BASE_PORT", default_value_t = 10000)]
  pub base_port: u16,
}

#[cfg(target_os = "macos")]
fn base_container_dir() -> String {
  format!("/Users/{}/dev/janium/container/mounts/", std::env::var("USER").unwrap())
}

#[cfg(target_os = "linux")]
fn base_container_dir() -> String {
  format!("/home/{}/dev/janium/container/mounts/", std::env::var("USER").unwrap())
}

#[derive(clap::Args, Clone, Debug)]
pub struct KendoApiOptions {
  #[arg(long = "kendo-api-key", env = "KENDO_API_KEY", default_value_t = DEFAULT_KENDO_API_KEY.into())]
  pub kendo_api_key: Arc<str>,

  #[arg(long = "kendo-api-url", env = "KENDO_API_URL", default_value_t = DEFAULT_KENDO_API_URL.into())]
  pub kendo_url: Arc<str>,
}

#[derive(clap::Parser, Clone, Debug)]
pub struct DatabaseOptions {
  /// Connection URL to the PostgreSQL database
  #[arg(long = "database-url", env = "DB_CONNECT_URL", value_parser = clap::value_parser!(sqlx::postgres::PgConnectOptions), default_value = "postgresql://localhost:5432/janium")]
  pub url: sqlx::postgres::PgConnectOptions,
  /// Schema to use for the database tables
  #[arg(
    long = "database-schema",
    env = "DB_SCHEMA",
    default_value_t = DEFAULT_DATABASE_SCHEMA.into()
  )]
  schema: Arc<str>,
  #[arg(
    long = "database-connection-timeout",
    env = "DB_CONNECT_TIMEOUT",
    default_value_t = 30
  )]
  connection_timeout: u16,
  #[arg(long = "database-min-connections", env = "DB_MIN_CONNECTIONS", default_value_t = 1)]
  min_connections: u8,
  #[arg(long = "database-max-connections", env = "DB_MAX_CONNECTIONS", default_value_t = 30)]
  max_connections: u8,
  #[arg(long = "database-max-connection-lifetime", env = "DB_MAX_CONNECTION_LIFETIME", default_value_t = 60 * 3)]
  max_connection_lifetime: u32,
  #[arg(
    long = "database-connection-idle-timeout",
    env = "DB_CONNECTION_IDLE_TIMEOUT",
    default_value_t = 60
  )]
  connection_idle_timeout: u32,
  #[arg(long = "log-statements-level", env = "DB_LOG_STATEMENTS_LEVEL", default_value_t = LevelFilter::Trace, value_parser = filter_parser)]
  //, value_parser = clap::value_parser!(LevelFilter))]
  log_statements: LevelFilter,
  #[arg(long = "log-slow-statements-level", env = "DB_LOG_SLOW_STATEMENTS_LEVEL", default_value_t = LevelFilter::Debug, value_parser = filter_parser)]
  //, value_parser = clap::value_parser!(LevelFilter))]
  log_slow_statements_level: LevelFilter,
  #[arg(
    long = "log-slow-statements-ms",
    env = "DB_LOG_SLOW_STATEMENTS_MS",
    default_value_t = 5000
  )]
  log_slow_statements_ms: u32,
}

fn filter_parser(s: &str) -> Result<LevelFilter, JaniumError> {
  s.parse()
    .map_err(|e| JaniumError::any(format!("Unable to parse {s} into LevelFilter. {e}")))
}

impl DatabaseOptions {
  pub async fn database_pool(&self) -> sqlx::Result<sqlx::postgres::PgPool> {
    let schema = self.schema.clone();

    let pool_options = sqlx::postgres::PgPoolOptions::new()
        .acquire_timeout(Duration::from_secs(self.connection_timeout.into()))
        // keep at least 5 connections around
        .min_connections(self.min_connections.into())
        // allow a lot more than the default maximum
        .max_connections(self.max_connections.into())
        // cycle connections every hour
        .max_lifetime(Duration::from_secs(self.max_connection_lifetime.into()))
        // reap connections that are idle for 10 minutes or more
        .idle_timeout(Duration::from_secs(self.connection_idle_timeout.into()))
        .after_connect(move |c, _| {
          tracing::trace!("new db connection");
          let new_schema = schema.clone();
          Box::pin(async move {
            if new_schema.as_ref() != DEFAULT_DATABASE_SCHEMA {
              sqlx::query(&format!("SET search_path TO '{new_schema}'"))
                  .persistent(false)
                  .execute(&mut *c)
                  .await?;
            }
            sqlx::query(&format!(
              "SET application_name TO '{}-{}'",
              env!("CARGO_PKG_NAME"),
              CONNECTION_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ))
            .persistent(false)
            .execute(&mut *c)
            .await?;
            Ok(())
          })
        });
    let mut options = self
      .url
      .clone()
      .log_statements(self.log_statements)
      .log_slow_statements(
        self.log_slow_statements_level,
        Duration::from_millis(self.log_slow_statements_ms.into()),
      );
    if let Ok(password) = var("DATABASE_PASSWORD") {
      options = options.password(&password);
    }
    pool_options.connect_with(options).await
  }

  // pub async fn listener(&self) -> sqlx::Result<sqlx::postgres::PgListener> {
  //   let schema = self.schema.clone();

  //   let pool_options = sqlx::postgres::PgPoolOptions::new()
  //     .acquire_timeout(Duration::from_secs(self.connection_timeout.into()))
  //     .idle_timeout(None)
  //     .max_lifetime(None)
  //     .min_connections(0)
  //     .max_connections(1)
  //     .after_connect(move |c, _| {
  //       tracing::trace!("new db connection");
  //       let new_schema = schema.clone();
  //       Box::pin(async move {
  //         sqlx::query(&format!("SET search_path TO '{}'", new_schema))
  //           .persistent(false)
  //           .execute(&mut *c)
  //           .await?;
  //         sqlx::query(&format!(
  //           "SET application_name TO '{}-{}-listener'",
  //           env!("CARGO_PKG_NAME"),
  //           CONNECTION_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
  //         ))
  //         .persistent(false)
  //         .execute(&mut *c)
  //         .await?;
  //         Ok(())
  //       })
  //     });
  //   let mut options = self
  //     .url
  //     .clone()
  //     .log_statements(self.log_statements)
  //     .log_slow_statements(
  //       self.log_slow_statements_level,
  //       Duration::from_millis(self.log_slow_statements_ms.into()),
  //     );
  //   if let Ok(password) = var("DATABASE_PASSWORD") {
  //     options = options.password(&password);
  //   }

  //   let pool = pool_options.connect_with(options).await?;
  //   let mut listener = sqlx::postgres::PgListener::connect_with(&pool).await?;
  //   listener.ignore_pool_close_event(true);
  //   Ok(listener)
  // }
}

/// Initialize tracing with console output and optional database logging.
/// Returns the broadcast sender for live log streaming if db logging is enabled.
pub fn config_tracing(filter: Option<&str>, db_layer: crate::db_logging::DbLayer) {
  use tracing_subscriber::layer::SubscriberExt;
  use tracing_subscriber::util::SubscriberInitExt;

  let filter = filter.unwrap_or("janium=debug,info");
  let env_filter = tracing_subscriber::EnvFilter::try_new(filter)
    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("janium=debug,info"));

  let fmt_layer = tracing_subscriber::fmt::layer()
    .with_file(false)
    .with_line_number(true)
    .with_target(true)
    .with_ansi(true);

  let result = tracing_subscriber::registry()
    .with(env_filter)
    .with(fmt_layer)
    .with(db_layer)
    .try_init();
  #[cfg(not(test))]
  {
    result.unwrap();
  }
  #[cfg(test)]
  {
    let _ = result;
  }
}

pub struct InterruptListener {
  controller: ShutdownController,
  interrupt: Signal,
  terminate: Signal,
  quit: Signal,
}

impl InterruptListener {
  pub fn create(controller: ShutdownController) -> Result<Self, JaniumError> {
    let interrupt = signal(SignalKind::interrupt()).map_err(JaniumError::any)?;
    let terminate = signal(SignalKind::terminate()).map_err(JaniumError::any)?;
    let quit = signal(SignalKind::quit()).map_err(JaniumError::any)?;
    Ok(Self {
      controller,
      interrupt,
      terminate,
      quit,
    })
  }
  pub async fn run(mut self) -> ! {
    let mut received_shutdown = false;
    loop {
      tokio::select! {
        _ = self.interrupt.recv() => {
          tracing::warn!("Got interrupt signal");
        }
        _ = self.terminate.recv() => {
          tracing::warn!("Got terminate signal");
        }
        _ = self.quit.recv() => {
          tracing::warn!("Got quit signal");
        }
      }
      self.controller.signal_shutdown();
      if received_shutdown {
        tracing::error!("Force exiting");
        std::process::exit(3);
      } else {
        received_shutdown = true;
      }
    }
  }
}
