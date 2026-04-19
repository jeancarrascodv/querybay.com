use axum::{
  Router,
  extract::{
    Json, State,
    ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
  },
  http::StatusCode,
  response::{IntoResponse, Response},
  routing::{get, post},
};
use container_service::{
  ControlToken, Message as ContainerMessage, MessageType as ContainerMessageType, Response as ContainerResponse,
  ResponseType as ContainerResponseType,
};
use enigo::{Enigo, Settings, agent::Agent};
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::Arc;
use tracing::{error, info, warn};

#[derive(Clone)]
pub struct AppState {
  active_connections: Arc<parking_lot::Mutex<Enigo>>,
}

impl Default for AppState {
  fn default() -> Self {
    Self {
      active_connections: Arc::new(parking_lot::Mutex::new(
        Enigo::new(&Settings::default()).expect("Failed to create Enigo"),
      )),
    }
  }
}

pub struct ConnectionState {
  connection: parking_lot::ArcMutexGuard<parking_lot::RawMutex, Enigo>,
}

impl ConnectionState {
  async fn handle_message(
    &mut self,
    message: ContainerMessageType,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    match message {
      ContainerMessageType::Enigo(command) => {
        let enigo = &mut *self.connection;
        for token in command.tokens {
          info!(?token, "Enigo execute");
          match token {
            ControlToken::Enigo(ref enigo_token) => {
              // Extra debug for Text tokens to track character-by-character
              if let enigo::agent::Token::Text(text) = enigo_token {
                info!(
                  ">>> TYPING TEXT: {:?} (chars: {:?})",
                  text,
                  text.chars().collect::<Vec<_>>()
                );
              }
              enigo.execute(enigo_token)?;
              info!("<<< TYPED OK");
            }
            ControlToken::SleepMs(ms) => {
              tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
            }
          }
        }
      }
      ContainerMessageType::Command(command) => {
        info!(?command, "Command spawn");
        let mut tokio_cmd = tokio::process::Command::new(command.command);
        tokio_cmd.args(command.args);
        tokio_cmd.envs(command.env);
        tokio_cmd.stdout(std::process::Stdio::null());
        tokio_cmd.stderr(std::process::Stdio::null());
        tokio_cmd.stdin(std::process::Stdio::null());
        let _ = tokio_cmd.spawn()?;
      }
    }

    Ok(())
  }
  pub fn new(app_state: &AppState) -> Option<Self> {
    let connection = app_state.active_connections.try_lock_arc()?;
    Some(Self { connection })
  }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
  config_tracing();

  let app_state = AppState::default();

  let app = Router::new()
    .route("/ws", get(websocket_handler))
    .route("/", post(http_handler))
    .with_state(app_state);

  let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
    .await
    .expect("Failed to bind to address");

  info!("Container service starting on 0.0.0.0:3000");

  axum::serve(listener, app).await.expect("Server failed to start");
}

#[axum::debug_handler]
async fn http_handler(
  State(state): State<AppState>,
  headers: axum::http::HeaderMap,
  Json(body): Json<ContainerMessage>,
) -> axum::response::Response {
  let id = headers
    .get("x-request-id")
    .and_then(|r| r.to_str().ok())
    .and_then(|r| r.parse::<uuid::Uuid>().ok())
    .unwrap_or_else(uuid::Uuid::default);
  let Some(mut connection_state) = ConnectionState::new(&state) else {
    return Response::builder()
      .status(StatusCode::CONFLICT)
      .header(
        axum::http::header::CONTENT_TYPE,
        axum::http::header::HeaderValue::from_static("application/json"),
      )
      .body(
        serde_json::to_string(&ContainerResponse {
          id,
          response: ContainerResponseType::Error("Connection is already established".to_string()),
        })
        .unwrap()
        .into(),
      )
      .unwrap();
  };

  let result = connection_state.handle_message(body.message).await;

  ContainerResponse::from_dyn_error(body.id, result).into_response()
}

async fn websocket_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
  ws.on_upgrade(|socket| websocket_connection(socket, state))
}

async fn websocket_connection(socket: WebSocket, state: AppState) {
  match handle_websocket_connection(socket, state).await {
    Ok(()) => {
      info!("WebSocket connection ended");
    }
    Err(e) => {
      error!("WebSocket ended with error: {}", e);
    }
  }
}

async fn handle_websocket_connection(
  mut socket: WebSocket,
  state: AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  info!("New WebSocket connection established");
  let Some(mut connection_state) = ConnectionState::new(&state) else {
    socket
      .send(WsMessage::Text(
        serde_json::to_string(&ContainerResponse {
          id: uuid::Uuid::default(),
          response: ContainerResponseType::Error("Connection is already established".to_string()),
        })
        .unwrap()
        .into(),
      ))
      .await
      .ok();
    socket.close().await.ok();
    return Err("Connection is already established".into());
  };

  let (mut sender, mut receiver) = socket.split();

  while let Some(msg) = receiver.next().await {
    match msg? {
      WsMessage::Text(text) => {
        info!("Received text message: {}", text);

        match serde_json::from_str::<ContainerMessage>(&text) {
          Ok(ws_msg) => {
            let result = connection_state.handle_message(ws_msg.message).await;
            sender
              .send(ContainerResponse::from_dyn_error(ws_msg.id, result).into())
              .await
              .unwrap();
          }
          Err(e) => {
            let error = format!("Failed to parse message as WsMessage: {e}");
            error!("{error}");
            sender
              .send(ContainerResponse::from_error(uuid::Uuid::default(), e.to_string()).into())
              .await
              .unwrap();
          }
        }
      }
      WsMessage::Close(_) => {
        info!("WebSocket connection closed by client");
        break;
      }
      WsMessage::Ping(data) => {
        if let Err(e) = sender.send(WsMessage::Pong(data)).await {
          error!("Failed to send pong: {}", e);
          break;
        }
      }
      WsMessage::Pong(_) => {
        // Handle pong if needed
      }
      WsMessage::Binary(_) => {
        warn!("Received binary message, ignoring");
      }
    }
  }
  drop(connection_state);
  info!("WebSocket connection ended");
  Ok(())
}

pub fn config_tracing() {
  let filter = std::env::var("RUST_LOG").unwrap_or_else(|_| "container_service=debug,info".to_owned());
  let subscriber = tracing_subscriber::fmt::fmt()
    .with_env_filter(filter)
    .with_file(false)
    .with_line_number(true)
    .with_target(true)
    .with_ansi(true)
    .finish();
  tracing::subscriber::set_global_default(subscriber).expect("config_tracing is only called once");
}
