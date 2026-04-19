use crate::prelude::*;
use futures::{FutureExt, StreamExt};
use std::sync::LazyLock;
use std::time::Instant;
use testcontainers as tm;
use tm::{ContainerAsync, GenericImage, ImageExt, runners::AsyncRunner};
use tracing::Instrument;
use uuid::Uuid;

static TEST_APP_STATE: tokio::sync::Mutex<Option<std::sync::Weak<ContainerHandles>>> =
  tokio::sync::Mutex::const_new(None);
static TEST_APP_STATE_WITH_DB: tokio::sync::OnceCell<std::sync::Arc<ContainerHandles>> =
  tokio::sync::OnceCell::const_new();
// Used to ensure that only one test at a time can access the test app state with db
static TEST_APP_STATE_WITH_DB_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

static TOKIO_HANDLE: LazyLock<tokio::runtime::Handle> = LazyLock::new(|| {
  rustls::crypto::ring::default_provider().install_default().ok();
  let filter = std::env::var("RUST_LOG").ok();
  crate::config::config_tracing(
    Some(filter.as_deref().unwrap_or("off")),
    crate::db_logging::DbLayer::new_dummy(),
  );
  let runtime = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .unwrap();
  let handle = runtime.handle().clone();
  std::thread::spawn(move || {
    runtime.block_on(futures::future::pending::<()>());
  });
  handle
});

pub fn app_state_test<T>(timeout_seconds: u64, f: impl AsyncFnOnce(AppState) -> T) -> T {
  TestAppState::run(timeout_seconds, f, false, false)
}

pub fn app_state_server_test<T>(timeout_seconds: u64, f: impl AsyncFnOnce(AppState) -> T) -> T {
  TestAppState::run(timeout_seconds, f, true, false)
}

pub fn app_state_test_with_db<T>(timeout_seconds: u64, f: impl AsyncFnOnce(AppState) -> T) -> T {
  let guard = TOKIO_HANDLE.block_on(TEST_APP_STATE_WITH_DB_LOCK.lock());
  let f = async move |app_state: AppState| {
    let result = f(app_state.clone()).await;
    app_state.router.shutdown();
    drop(guard);
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    result
  };
  TestAppState::run(timeout_seconds, f, false, true)
}

#[expect(dead_code)]
pub fn app_state_server_test_with_db<T>(timeout_seconds: u64, f: impl AsyncFnOnce(AppState) -> T) -> T {
  let _guard = TOKIO_HANDLE.block_on(TEST_APP_STATE_WITH_DB_LOCK.lock());
  TestAppState::run(timeout_seconds, f, true, true)
}

#[test_log::test]
fn test_app_state_test() {
  app_state_test(10, async |app_state| {
    tracing::info!("inside test_app_state_test");
    let user = app_state.user_service.get_user_by_id(Id::nil()).await.unwrap();
    dbg!(user);
  })
}

struct TestAppState {
  app_state: AppState,
  container_handles: Arc<ContainerHandles>,
  listener: Option<std::net::TcpListener>,
  stop: bool,
}

impl Drop for TestAppState {
  fn drop(&mut self) {
    if self.stop {
      self.stop = false;
      // block on a different thread in case this is called from a tokio thread
      std::thread::scope(|s| {
        s.spawn(|| TOKIO_HANDLE.block_on(self.stop_inner()));
      });
    }
  }
}

impl core::ops::Deref for TestAppState {
  type Target = AppState;
  fn deref(&self) -> &Self::Target {
    &self.app_state
  }
}

impl From<&TestAppState> for AppState {
  fn from(value: &TestAppState) -> Self {
    value.app_state.clone()
  }
}

impl TestAppState {
  pub fn run<T>(timeout_seconds: u64, f: impl AsyncFnOnce(AppState) -> T, bind_listener: bool, from_db: bool) -> T {
    if from_db && std::env::var("JANIUM_DEV_TESTS").is_err() {
      panic!("Skipping dev-server test (set JANIUM_DEV_TESTS=1 to run)");
    }
    // Cargo test sets the thread name to the test name
    let test_name = std::thread::current().name().unwrap_or("unknown").to_string();

    let future = async {
      let test_span = tracing::info_span!("test", name = %test_name);
      async {
        let mut this = if from_db {
          Self::new_with_db(bind_listener).await
        } else {
          Self::new(bind_listener).await
        };
        let listener = this.listener.take();
        let cloned_app_state = this.app_state.clone();
        let handle = listener.map(|listener| {
          tokio::spawn(async move {
            tracing::warn!("Running server on port {}", cloned_app_state.opts.janium_port);
            crate::run_async(cloned_app_state, Some(listener)).await.unwrap();
          })
        });

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let timeout = std::time::Duration::from_secs(timeout_seconds.max(10));
        tracing::info!("Running test fn (timeout: {timeout:?})");
        let fut = tokio::time::timeout(timeout, f(this.app_state.clone()));
        let result = std::panic::AssertUnwindSafe(fut).catch_unwind().await;

        if let Some(handle) = handle {
          handle.abort();
          tracing::info!("Waiting on server to finish");
          handle.await.ok();
          tracing::info!("Server finished");
        }

        match result {
          Ok(Ok(result)) => {
            this.stop().await;
            result
          }
          Ok(Err(_)) => {
            tracing::warn!("Test timed out after {timeout_seconds} seconds");
            panic!("Test timed out after {timeout_seconds} seconds");
          }
          Err(e) => {
            this.dump_state().await;
            this.stop().await;
            std::panic::resume_unwind(e);
          }
        }
      }
      .instrument(test_span)
      .await
    };
    let timeout_seconds = timeout_seconds.max(10) + 20;
    TOKIO_HANDLE.block_on(async {
      tokio::time::timeout(std::time::Duration::from_secs(timeout_seconds), future)
        .await
        .unwrap_or_else(|_| panic!("Entire test and setup timed out after {timeout_seconds} seconds"))
    })
  }
  async fn new(bind_listener: bool) -> Self {
    // Only hold the mutex long enough to get or create the shared container handle.
    // AppState creation (new DB + migrations + actor startup) happens outside the lock
    // so tests can initialize in parallel on the shared Postgres container.
    let container = {
      let mut current = TEST_APP_STATE.lock().await;
      if let Some(s) = current.as_ref().and_then(|s| s.upgrade()) {
        s
      } else {
        let new = Arc::new(ContainerHandles::new_inner().await);
        *current = Some(Arc::downgrade(&new));
        new
      }
    };
    container.test_app_state(bind_listener, true).await.unwrap()
  }
  async fn new_with_db(bind_listener: bool) -> Self {
    TEST_APP_STATE_WITH_DB
      .get_or_init(|| async { Arc::new(ContainerHandles::new_test_db().await) })
      .await
      .clone()
      .test_app_state(bind_listener, false)
      .await
      .unwrap()
  }
  pub async fn stop(mut self) {
    self.stop_inner().await;
  }
  async fn stop_inner(&mut self) {
    self.stop = false;
    self.app_state.router.shutdown();
    self.app_state.db.close().await;
    self.app_state.shutdown_controller.complete_shutdown(5).await;
    tokio::time::timeout(std::time::Duration::from_secs(5), self.container_handles.stop())
      .await
      .ok();
  }
  async fn dump_state(&self) {
    tracing::info!("Dumping state");
    let users = User::select().fetch_all(&self.app_state.db).await.unwrap();
    dbg!(&users);
    let teams = Team::select().fetch_all(&self.app_state.db).await.unwrap();
    dbg!(&teams);
    let user_teams = UserTeamMap::select().fetch_all(&self.app_state.db).await.unwrap();
    dbg!(&user_teams);
    let api_keys = ApiKey::select().fetch_all(&self.app_state.db).await.unwrap();
    dbg!(&api_keys);
    let refresh_tokens = RefreshToken::select().fetch_all(&self.app_state.db).await.unwrap();
    dbg!(&refresh_tokens);
    println!();
  }
}

struct ContainerHandles {
  postgres: Pg,
  #[expect(dead_code)]
  reqwest: reqwest::Client,
  stop: bool,
}

impl ContainerHandles {
  async fn stop(self: &mut Arc<Self>) {
    if let Some(this) = Arc::get_mut(self) {
      this.stop_inner().await;
    }
  }
  async fn stop_inner(&mut self) {
    if !self.stop {
      return;
    }
    tracing::info!("Stopping containers");
    self.stop = false;
    let pg = async {
      if let Some(c) = self.postgres.container.take() {
        c.stop_with_timeout(Some(0)).await.ok();
      }
    };
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
      let (_,) = futures::join!(pg);
    })
    .await
    .inspect_err(|_| tracing::error!("Timed out waiting for containers to stop"))
    .ok();
    tracing::info!("Stopped containers");
  }
  async fn new_inner() -> Self {
    tracing::info!("new_inner");
    let reqwest = reqwest::Client::new();
    let id = Uuid::new_v4();
    let (postgres,) = futures::join!(Pg::new(id));

    ContainerHandles {
      postgres,
      reqwest,
      stop: true,
    }
  }
  async fn new_test_db() -> Self {
    Self {
      // should match the value in the run/copy-db-to-local.sh script
      postgres: Pg::new_test_db("postgresql://janium_dev:Janium12345@localhost:5432/janium_dev").await,
      reqwest: reqwest::Client::new(),
      stop: true,
    }
  }
  async fn test_app_state(self: Arc<Self>, bind_listener: bool, new_pool: bool) -> crate::Result<TestAppState> {
    tracing::info!("creating app state");
    let mut cli = <crate::config::JaniumCli as clap::Parser>::try_parse_from([
      "arg0",
      // Dummy value just to get it to parse
      "--database-url",
      "postgresql://localhost:5432/test",
    ])
    .unwrap();
    let db = if new_pool {
      let id = Uuid::new_v4();
      self.postgres.new_pg_pool(id).await.unwrap()
    } else {
      // set cli parameters to use proper podman socket and mount path
      cli.docker.base_container_dir = "/var/lib/janium/container/mounts/".to_string();
      self.postgres.pool.clone()
    };

    let listener = if bind_listener {
      let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::UNSPECIFIED, 0)).unwrap();
      cli.janium_port = listener.local_addr().unwrap().port();
      Some(listener)
    } else {
      None
    };

    let test_app_state = TestAppState {
      app_state: AppState::new(cli, Some(db), None, crate::config::ShutdownController::new())
        .await
        .unwrap(),
      container_handles: self,
      listener,
      stop: true,
    };
    // TODO: provision user if needed.
    tracing::info!("created app state");
    Ok(test_app_state)
  }
}

impl Drop for ContainerHandles {
  fn drop(&mut self) {
    if self.stop {
      std::thread::scope(|s| {
        s.spawn(|| TOKIO_HANDLE.block_on(self.stop_inner()));
      });
    }
  }
}

struct Pg {
  db_opts: crate::config::DatabaseOptions,
  container: Option<ContainerAsync<GenericImage>>,
  pool: sqlx::PgPool,
}

impl Pg {
  async fn new_test_db(db_connect_url: &str) -> Self {
    let db_opts =
      <crate::config::DatabaseOptions as clap::Parser>::try_parse_from(["arg0", "--database-url", db_connect_url])
        .unwrap();
    let pool = db_opts.database_pool().await.unwrap();
    Self::run_migrations(&pool, false).await;
    tracing::warn!("truncating linkedin_action_requests");
    sqlx::query("truncate table linkedin_action_requests")
      .execute(&pool)
      .await
      .unwrap();
    Self {
      db_opts,
      container: None,
      pool,
    }
  }
  async fn new(id: Uuid) -> Self {
    let start = Instant::now();
    let username = "postgres";
    let password = "pgpw123";
    let db_name = "janium_test";
    let container = tm::GenericImage::new("postgres", "17-alpine")
      .with_wait_for(tm::core::WaitFor::message_on_stderr(
        "database system is ready to accept connections",
      ))
      .with_wait_for(tm::core::WaitFor::message_on_stdout(
        "database system is ready to accept connections",
      ))
      .with_env_var("POSTGRES_DB", db_name)
      .with_env_var("POSTGRES_USER", username)
      .with_env_var("POSTGRES_PASSWORD", password)
      .with_container_name(format!("janium-test-postgres-{id}"))
      .start()
      .await
      .unwrap();
    let host = container.get_host().await.unwrap();
    let port = container.get_host_port_ipv4(5432).await.unwrap();
    let opts = sqlx::postgres::PgConnectOptions::new()
      .database(db_name)
      .username(username)
      .password(password)
      .port(port)
      .host(&host.to_string());

    tracing::info!(?opts, "getting postgres took {:?}", start.elapsed());
    let mut db_opts = <crate::config::DatabaseOptions as clap::Parser>::try_parse_from([
      "arg0",
      "--database-url",
      "postgresql://localhost:5432/test",
    ])
    .unwrap();
    db_opts.url = opts;
    let pool = db_opts.database_pool().await.unwrap();
    sqlx::query("select 1").execute(&pool).await.unwrap();
    Self {
      db_opts,
      container: Some(container),
      pool,
    }
  }
  async fn new_pg_pool(&self, id: uuid::Uuid) -> crate::Result<sqlx::PgPool> {
    tracing::info!("creating pg pool {id}");

    let db_id = format!("{id}").replace("-", "_");
    let db = format!("janium_test_{db_id}");
    sqlx::query(&format!("create database {db}"))
      .execute(&self.pool)
      .await?;
    let mut db_opts = self.db_opts.clone();
    db_opts.url = db_opts.url.database(&db);
    let pool = db_opts.database_pool().await?;
    tracing::info!("created pg pool {id}");
    Self::run_migrations(&pool, true).await;
    Ok(pool)
  }

  async fn run_migrations(pool: &sqlx::PgPool, fresh: bool) {
    static DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../migrations");
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(DIR).unwrap_or_else(|e| panic!("Unable to open {DIR}. {e}")) {
      let entry = entry.unwrap();
      let path = entry.path();
      if path.extension() == Some(std::ffi::OsStr::new("sql")) {
        paths.push(path);
      }
    }
    paths.sort();
    paths.push(concat!(env!("CARGO_MANIFEST_DIR"), "/test_initialization.sql").into());
    for path in paths {
      tracing::trace!("Running sql from {}", path.display());
      let file =
        std::fs::read_to_string(path.as_path()).unwrap_or_else(|e| panic!("Unable to read {}. {e}", path.display()));
      let mut stream = sqlx::raw_sql(&file).execute_many(pool);
      while let Some(result) = stream.next().await {
        // if the database is not fresh, we don't care about errors
        if fresh {
          result.unwrap_or_else(|e| {
            tracing::error!("Error while running sql from {}. {e:#?}", path.display());
            panic!("Error while running sql from {}. {e}", path.display())
          });
        }
      }
    }
  }
}
