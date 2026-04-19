#![allow(clippy::too_many_arguments)]
#![allow(clippy::redundant_closure)]

pub use app_state::AppState;
use axum::routing::any;
use axum::routing::get;
use axum::routing::post;
use clap::Parser;
pub use error::JaniumError;
use futures::StreamExt;
use prelude::*;
use tracing::Instrument;

pub type Result<T = (), E = JaniumError> = std::result::Result<T, E>;
use axum::http::{HeaderName, HeaderValue, Method};
use tower_http::cors::CorsLayer;

mod ai;
mod app_state;
mod auth;
mod automator;
mod config;
mod db_logging;
mod error;
mod graphql;
mod models;
mod report;
mod restrictions;
mod service_cache;
mod templates;
#[cfg(test)]
mod test;
mod types;
mod ui;
mod util;
mod xpra;

mod prelude {
  pub use crate::graphql::{GqlMutation, GqlQuery};
  pub use crate::models::*;
  pub use crate::report::*;
  pub use crate::restrictions::*;
  pub use crate::types::*;
  pub use crate::xpra::container::ContainerHandle;
  pub use crate::{AppState, JaniumError, Result};
  pub use janium_actors::{Actor, Message, Router, Sender, SyncSender};
  pub use jiff::ToSpan;
  pub use ormlite::{Model, TableMeta, model::ModelBuilder};
  pub use serde::{Deserialize, Serialize};
  pub use std::collections::HashMap;
  pub use std::sync::Arc;
  pub use tap::prelude::*;
}

static GIT_VERSION: &str = env!("GIT_VERSION");

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
  rustls::crypto::ring::default_provider().install_default().ok();
  let args = config::JaniumCli::parse();
  if let Some(cmd) = args.cmd {
    cmd.run();
    return Ok(());
  }

  let runtime = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .unwrap();

  let shutdown_controller = config::ShutdownController::new();

  // Create database pool first
  let db = runtime.block_on(args.database.database_pool())?;

  // Initialize tracing with DbLayer support
  let log_broadcast = tokio::sync::broadcast::channel(1024).0;
  let _handle = runtime.enter();
  let shutdown_guard = config::ShutdownGuard::<db_logging::DbLayer>::new(&shutdown_controller, "log_writer_task");
  let db_layer = crate::db_logging::DbLayer::new(db.clone(), log_broadcast.clone(), &args.db_logging, shutdown_guard);
  config::config_tracing(std::env::var("RUST_LOG").ok().as_deref(), db_layer);
  tracing::info!("git version: {GIT_VERSION}");
  drop(_handle);

  let state = runtime.block_on(app_state::AppState::new(
    args,
    Some(db),
    Some(log_broadcast),
    shutdown_controller.clone(),
  ))?;
  error::EXPOSE_INTERNAL_ERRORS
    .set(state.opts.expose_internal_errors)
    .expect("EXPOSE_INTERNAL_ERRORS can only be set once");

  let listener = runtime.block_on(async { config::InterruptListener::create(shutdown_controller) })?;
  runtime.spawn(listener.run());
  runtime.block_on(run_async(state, None))?;
  runtime.shutdown_timeout(std::time::Duration::from_secs(10));
  Ok(())
}

async fn request_id_setter(request: axum::extract::Request, next: axum::middleware::Next) -> axum::response::Response {
  // do something with `request`...
  let request_id = request
    .headers()
    .get("x-request-id")
    .and_then(|r| r.to_str().ok())
    .and_then(|r| r.parse::<uuid::Uuid>().ok())
    .unwrap_or_else(uuid::Uuid::new_v4);

  let path = request.uri().path_and_query().map(|p| p.as_str()).unwrap_or("");
  let span = tracing::error_span!("http.request", id = %request_id, %path);

  let start = std::time::Instant::now();

  tracing::trace!(parent: &span, "request started");

  let mut response = next.run(request).instrument(span.clone()).await;

  let elapsed = start.elapsed();
  tracing::trace!(parent: &span, ?elapsed, "request finished");

  response.headers_mut().insert(
    "x-janium-request-id",
    axum::http::HeaderValue::from_str(&request_id.to_string()).unwrap(),
  );
  response.headers_mut().insert(
    "x-janium-elapsed",
    axum::http::HeaderValue::from_str(&elapsed.as_nanos().to_string()).unwrap(),
  );

  response
}

pub async fn run_async(
  state: app_state::AppState,
  listener: Option<std::net::TcpListener>,
) -> Result<(), Box<dyn std::error::Error>> {
  let guard = config::ShutdownGuard::<()>::new(&state.shutdown_controller, "axum service");

  let schema = graphql::get_schema(state.clone());

  // Public routes (no authentication required)
  let public_routes = axum::Router::new()
    .route("/auth/login", post(auth::login))
    .route("/signup/{invite_code}", post(auth::signup));

  // Protected routes (require authentication)
  let protected_routes = axum::Router::new()
    // TODO: break these out so auth can be handled for these differently
    .route("/auth/refresh", post(auth::refresh_token))
    .route("/auth/me", get(auth::me))
    .route(
      "/auth/api-keys",
      get(auth::list_api_keys).post(auth::create_api_key),
    )
    .route("/auth/api-keys/revoke", post(auth::revoke_api_key))
    .route("/browser/{id}/", any(xpra::ws))
    .route("/browser/{id}/{*path}", any(xpra::http))
    .route("/api/v1/linkedin/action/failure/{id}/html", get(linkedin::action_failure_html))
    .route("/api/v1/linkedin/action/failure/{id}/screenshot", get(linkedin::action_failure_screenshot))
    .route("/", any(async || { axum::response::Redirect::permanent("/gql") }))
    .route(
      "/gql",
      get(graphiql).post_service(gql_axum::GraphQL::new(schema.clone())),
    )
    .route("/ws", any(async || { axum::response::Redirect::permanent("/gql/ws") }))
    .route("/gql/ws", get(graphql::graphql_ws))
    .layer(axum::Extension(schema))
    .layer(axum::middleware::from_fn_with_state(
      state.clone(),
      auth::auth_middleware,
    ));

  let cors = CorsLayer::new()
    .allow_origin([
      HeaderValue::from_static("http://localhost:3000"),
      HeaderValue::from_static("https://localhost:3000"),
      HeaderValue::from_static("https://app.dev.janium.ai"),
      HeaderValue::from_static("https://app.janium.ai"),
    ])
    .allow_methods([
      Method::GET,
      Method::POST,
      Method::OPTIONS,
      Method::PUT,
      Method::DELETE,
      Method::PATCH,
    ])
    .allow_headers([
      axum::http::header::CONTENT_TYPE,
      axum::http::header::AUTHORIZATION,
      HeaderName::from_static("apollo-require-preflight"),
      HeaderName::from_static("x-apollo-operation-name"),
      HeaderName::from_static("x-apollo-tracing"),
      axum::http::header::ACCEPT,
      axum::http::header::ORIGIN,
      axum::http::header::ACCEPT_LANGUAGE,
      axum::http::header::CONTENT_LANGUAGE,
    ])
    .expose_headers([
      HeaderName::from_static("x-janium-request-id"),
      HeaderName::from_static("x-janium-elapsed"),
    ])
    .allow_credentials(true);

  let app = axum::Router::new()
    .without_v07_checks()
    .merge(protected_routes)
    .merge(public_routes)
    .layer(axum::middleware::from_fn(request_id_setter))
    .layer(tower_cookies::CookieManagerLayer::new())
    .layer(cors)
    .with_state(state.clone());

  let listener = if let Some(listener) = listener {
    assert_eq!(listener.local_addr().unwrap().port(), state.opts.janium_port);
    listener
  } else {
    std::net::TcpListener::bind(std::net::SocketAddr::from((
      std::net::Ipv4Addr::UNSPECIFIED,
      state.opts.janium_port,
    )))
    .map_err(|e| JaniumError::msg(format!("Failed to bind to port {}: {}", state.opts.janium_port, e)))?
  };
  listener.set_nonblocking(true).unwrap();
  tracing::info!("Listening on {}", listener.local_addr().unwrap());

  let result = if state.opts.acme.is_enabled() {
    let acme = &state.opts.acme;
    if state.opts.janium_port != 443 {
      tracing::warn!(
        "ACME without running on port 443. Ensure that iptables is configured to forward port 443 to port {}",
        state.opts.janium_port
      );
    }
    let mut state = rustls_acme::AcmeConfig::new([acme.acme_server_domain()])
      .cache(rustls_acme::caches::DirCache::new(acme.acme_cache_dir().clone()))
      .contact_push(format!("mailto:{}", acme.acme_email()))
      .directory_lets_encrypt(acme.acme_prod)
      .challenge_type(rustls_acme::UseChallenge::TlsAlpn01)
      .state();
    let acceptor = state.axum_acceptor(state.default_rustls_config());

    tokio::spawn(async move {
      loop {
        match state.next().await.unwrap() {
          Ok(ok) => tracing::info!("acme event: {:?}", ok),
          Err(err) => tracing::error!("acme error: {:?}", err),
        }
      }
    });
    let handle = axum_server::Handle::new();

    let handle_shutdown = handle.clone();
    tokio::spawn(async move {
      guard.wait_for_shutdown_owned().await;
      handle_shutdown.graceful_shutdown(std::time::Duration::from_secs(10).into());
    });

    axum_server::from_tcp(listener)?
      .acceptor(acceptor)
      .handle(handle.clone())
      .serve(app.into_make_service_with_connect_info::<std::net::SocketAddr>())
      .await
  } else {
    axum::serve(
      tokio::net::TcpListener::from_std(listener).unwrap(),
      app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(guard.wait_for_shutdown_owned())
    .await
  };

  if let Err(e) = result {
    tracing::error!("stopped serving requests due to {e}");
  }
  state.router.shutdown();
  state.shutdown_controller.complete_shutdown(120).await;

  Ok(())
}

pub async fn graphiql() -> impl axum::response::IntoResponse {
  axum::response::Html(
    gql::http::GraphiQLSource::build()
      .endpoint("/")
      .subscription_endpoint("/ws")
      .title("Janium")
      .finish(),
  )
}
