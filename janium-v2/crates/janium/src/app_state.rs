use super::*;

#[derive(Clone)]
pub struct AppState {
  inner: std::sync::Arc<AppStateInner>,
}

impl core::ops::Deref for AppState {
  type Target = AppStateInner;
  fn deref(&self) -> &Self::Target {
    &self.inner
  }
}

pub struct AppStateInner {
  pub db: sqlx::postgres::PgPool,
  pub router: janium_actors::Router,
  pub scheduler: janium_actors::SyncSender<Scheduler>,
  pub contact_service: ContactService,
  pub company_service: CompanyService,
  pub user_service: UserService,
  pub invite_service: InviteService,
  pub reqwest_client: reqwest::Client,
  pub xpra_browser_state: xpra::XpraState,
  pub docker: Arc<bollard::Docker>,
  pub opts: config::JaniumCli,
  pub log_broadcast: tokio::sync::broadcast::Sender<Arc<LogEntry>>,
  pub shutdown_controller: config::ShutdownController,
}

impl AppState {
  pub async fn new(
    cli: config::JaniumCli,
    db: Option<sqlx::PgPool>,
    log_broadcast: Option<tokio::sync::broadcast::Sender<Arc<LogEntry>>>,
    shutdown_controller: config::ShutdownController,
  ) -> Result<Self, JaniumError> {
    let docker = Arc::new(bollard::Docker::connect_with_unix_defaults()?);
    tracing::info!("docker client version: {:?}", docker.client_version());

    let db = if let Some(db) = db {
      db
    } else {
      cli.database.database_pool().await?
    };
    let jwt_secret = {
      if cfg!(debug_assertions) {
        std::env::var("JWT_SECRET").unwrap_or_else(|_| "janium_jwt_secret_12345!".to_string())
      } else {
        std::env::var("JWT_SECRET").expect("JWT_SECRET must be set")
      }
    };
    // Unset the JWT_SECRET for everything except tests.
    #[cfg(not(test))]
    unsafe {
      std::env::set_var("JWT_SECRET", "")
    };

    let router = janium_actors::Router::default();

    let (scheduler_state, scheduler_oneshot_tx) =
      scheduler::SchedulerState::new(db.clone(), &shutdown_controller).await;
    let scheduler_sender = router
      .register(Scheduler::new(), scheduler_state)
      .await
      .map_err(|e| JaniumError::msg(e.to_string()))?;
    scheduler_oneshot_tx
      .send(scheduler_sender.clone())
      .unwrap_or_else(|_| panic!("Scheduler sender sends or app dies"));

    let (contact_service, company_service, user_service, invite_service) = futures::try_join!(
      ContactService::new(cli.contact_service_cache_limit, db.clone(), router.clone()),
      CompanyService::new(cli.company_service_cache_limit, db.clone()),
      UserService::new(db.clone(), cli.auth_config.clone(), jwt_secret, router.clone()),
      InviteService::new(10_240, db.clone(), router.clone()),
    )?;

    let inner = AppStateInner {
      contact_service,
      company_service,
      user_service,
      invite_service,
      db,
      router,
      scheduler: scheduler_sender.into_sync(),
      reqwest_client: reqwest::Client::new(),
      xpra_browser_state: xpra::XpraState::default(),
      docker,
      opts: cli,
      log_broadcast: log_broadcast.unwrap_or_else(|| tokio::sync::broadcast::channel(1024).0),
      shutdown_controller,
    };

    let state = AppState { inner: Arc::new(inner) };

    Team::load_and_register_all(
      &state,
      std::time::Duration::from_millis(state.opts.team_evaluation_interval_min_ms),
      std::time::Duration::from_millis(state.opts.team_evaluation_interval_max_ms),
    )
    .await?;

    Ok(state)
  }
}
