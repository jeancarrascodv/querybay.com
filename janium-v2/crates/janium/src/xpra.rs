use std::collections::HashMap;
use std::time::Duration;

use crate::automator::runner::KeepAlive;
use crate::prelude::*;
use axum::extract::ws::{Message as AxumMessage, WebSocket};
use axum::extract::{Path, Request as AxumRequest, State, WebSocketUpgrade};
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tracing::Instrument;

pub mod container;

static FAVICON_PNG: &[u8] = include_bytes!("../../../frontend/public/icons/Janiumgreen.min.png");

#[derive(Default)]
pub struct XpraState {
  browser_state: tokio::sync::RwLock<HashMap<Id<KeepAlive<LinkedIn>>, XpraStateInner>>,
}

impl XpraState {
  pub async fn remove(&self, id: &Id<KeepAlive<LinkedIn>>) -> Option<XpraStateInner> {
    tracing::debug!("Removing XpraStateInner for {id}");
    let removed = self.browser_state.write().await.remove(id);
    if removed.is_some() {
      tracing::debug!("Removed XpraStateInner for {id}");
    } else {
      tracing::warn!("Unable to remove XpraStateInner found for {id}");
    }
    removed
  }
  pub async fn get(&self, id: &Id<KeepAlive<LinkedIn>>) -> Option<XpraStateInner> {
    self.browser_state.read().await.get(id).cloned()
  }
  pub async fn insert(
    &self,
    id: Id<KeepAlive<LinkedIn>>,
    every: Duration,
    url: String,
  ) -> tokio::sync::mpsc::Receiver<crate::automator::runner::KeepAliveMessage> {
    let (sender, receiver) = tokio::sync::mpsc::channel(16);
    let inner_state = XpraStateInner {
      url: url.into(),
      keep_alive_sender: crate::util::KeepAliveSender::new(every, sender),
    };
    tracing::debug!("Inserting XpraStateInner for {id}");
    self.browser_state.write().await.insert(id, inner_state);
    receiver
  }
}

#[derive(Clone, Debug)]
pub struct XpraStateInner {
  url: Arc<str>,
  keep_alive_sender: crate::util::KeepAliveSender,
}

pub async fn http(
  state: State<AppState>,
  Path((id, path)): Path<(Id<KeepAlive<LinkedIn>>, String)>,
  request: AxumRequest,
) -> axum::response::Response {
  use futures::TryStreamExt;

  let (parts, body) = request.into_parts();
  tracing::trace!(%parts.uri, ?state.xpra_browser_state.browser_state, "request uri");
  let url = {
    let inner_state = state.xpra_browser_state.get(&id).await;
    let Some(inner_state) = inner_state else {
      tracing::trace!(?state.xpra_browser_state.browser_state, "no inner state found for id {id}");
      return axum::response::Response::builder()
        .status(axum::http::status::StatusCode::NOT_FOUND)
        .body(axum::body::Body::from(""))
        .unwrap();
    };
    if path.ends_with("favicon.png") {
      return axum::response::Response::builder()
        .status(axum::http::status::StatusCode::OK)
        .header(axum::http::header::CONTENT_TYPE, "image/png")
        .body(axum::body::Body::from(FAVICON_PNG))
        .unwrap();
    }
    format!("http://{}/{}", inner_state.url, path)
  };
  let span = tracing::trace_span!("xpra_http", url);

  let data_stream = body.into_data_stream().map_err(|e| e.into_inner());

  tracing::trace!(parent: &span, "requesting from xpra http");
  let response = state
    .reqwest_client
    .request(parts.method, url.clone())
    .headers(parts.headers)
    .body(reqwest::Body::wrap_stream(data_stream))
    .send()
    .instrument(span.clone())
    .await;

  match response {
    Ok(mut response) => {
      tracing::trace!(parent: &span, status = %response.status(), "response from xpra http");
      let mut builder = axum::response::Response::builder().status(response.status());
      if let Some(headers) = builder.headers_mut() {
        let resp_headers = std::mem::take(response.headers_mut());
        headers.remove(axum::http::header::SERVER);
        headers.remove(axum::http::header::PRAGMA);
        headers.insert(
          axum::http::header::CACHE_CONTROL,
          axum::http::HeaderValue::from_static("max-age=28800, public"),
        );
        *headers = resp_headers;
      }
      builder
        .body(axum::body::Body::from_stream(response.bytes_stream().map_err(Box::new)))
        .unwrap()
    }
    Err(e) => {
      tracing::error!(parent: &span, %e, "error from xpra http");
      axum::response::IntoResponse::into_response(JaniumError::from(e))
    }
  }
}

pub async fn ws(
  state: State<AppState>,
  Path(id): Path<Id<KeepAlive<LinkedIn>>>,
  ws: WebSocketUpgrade,
  request: AxumRequest,
) -> axum::response::Response {
  let user_id = crate::auth::CLAIMS.with(|claims| claims.user_id);
  let inner_state = {
    let inner_state = state.xpra_browser_state.get(&id).await;
    let Some(mut inner_state) = inner_state else {
      return axum::response::Response::builder()
        .status(axum::http::status::StatusCode::NOT_FOUND)
        .body(axum::body::Body::from(""))
        .unwrap();
    };
    inner_state.keep_alive_sender.send(user_id);
    inner_state
  };
  let (mut parts, _body) = request.into_parts();

  parts.uri = axum::http::Uri::builder()
    .scheme("ws")
    .authority(inner_state.url.as_ref())
    .path_and_query("")
    .build()
    .unwrap();
  let req = axum::http::Request::from_parts(parts, ());

  let resp = tokio_tungstenite::connect_async(req).await;
  let (mut axum_response, mut server_response) = match resp {
    Ok((stream, resp)) => (
      ws.on_upgrade(move |socket| xpra_browser_websocket_conn(socket, stream, inner_state, id, user_id)),
      resp,
    ),
    Err(e) => return axum::response::IntoResponse::into_response(JaniumError::from(e)),
  };
  *axum_response.headers_mut() = std::mem::take(server_response.headers_mut());
  axum_response
}

#[tracing::instrument(skip(server, client, inner_state))]
async fn xpra_browser_websocket_conn(
  server: WebSocket,
  client: tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
  inner_state: XpraStateInner,
  id: Id<KeepAlive<LinkedIn>>,
  user_id: Id<User>,
) {
  let (mut server_sender, mut server_receiver) = server.split();
  let (mut client_sender, mut client_receiver) = client.split();
  let mut incoming_sender = inner_state.keep_alive_sender;

  let incoming = async {
    while let Some(msg) = server_receiver.next().await {
      if incoming_sender.send(user_id).is_some() {
        break;
      }
      let client_msg = match msg? {
        AxumMessage::Text(text) => WsMessage::Text(unsafe {
          // SAFETY: we know the text is valid UTF-8
          tokio_tungstenite::tungstenite::Utf8Bytes::from_bytes_unchecked(axum::body::Bytes::from(text))
        }),
        AxumMessage::Binary(binary) => WsMessage::Binary(binary),
        AxumMessage::Ping(ping) => WsMessage::Ping(ping),
        AxumMessage::Pong(pong) => WsMessage::Pong(pong),
        AxumMessage::Close(close) => {
          WsMessage::Close(close.map(|close| tokio_tungstenite::tungstenite::protocol::CloseFrame {
            code: close.code.into(),
            reason: close.reason.as_str().into(),
          }))
        }
      };
      client_sender.send(client_msg).await?;
    }
    Ok::<_, Box<dyn std::error::Error + Send + Sync>>(())
  };

  let outgoing = async {
    while let Some(msg) = client_receiver.next().await {
      let server_msg = match msg? {
        // TODO: this is inefficient, but it's our only option until axum has a way to just create Utf8Bytes from Bytes.
        WsMessage::Text(text) => AxumMessage::Text(text.as_str().into()),
        WsMessage::Binary(binary) => AxumMessage::Binary(binary),
        WsMessage::Ping(ping) => AxumMessage::Ping(ping),
        WsMessage::Pong(pong) => AxumMessage::Pong(pong),
        WsMessage::Close(close) => AxumMessage::Close(close.map(|close| axum::extract::ws::CloseFrame {
          code: close.code.into(),
          reason: close.reason.as_str().into(),
        })),
        WsMessage::Frame(_frame) => continue,
      };
      let send_result = server_sender.send(server_msg).await;
      if let Err(error) = send_result {
        tracing::trace!(%error, "Got error from connection. Closing");
        break;
      }
    }
    Ok::<_, Box<dyn std::error::Error + Send + Sync>>(())
  };

  if let Err(error) = futures::try_join!(incoming, outgoing) {
    tracing::debug!(?error, "Error in websocket connection");
  } else {
    tracing::debug!("WebSocket connection ended");
  }
}
