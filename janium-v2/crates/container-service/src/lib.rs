pub use client::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

mod client;

#[derive(Debug, Deserialize, Serialize)]
pub struct Message {
  pub id: uuid::Uuid,
  pub message: MessageType,
}

#[derive(Debug, Deserialize, Serialize)]
pub enum MessageType {
  Enigo(EnigoCommand),
  Command(Command),
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EnigoCommand {
  pub tokens: Vec<ControlToken>,
  // TODO: add delay options
}

#[derive(Debug, Deserialize, Serialize)]
pub enum ControlToken {
  #[serde(rename = "e")]
  Enigo(enigo::agent::Token),
  #[serde(rename = "s")]
  SleepMs(u64),
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Command {
  pub command: String,
  pub args: Vec<String>,
  pub env: HashMap<String, String>,
}

impl From<Message> for tokio_tungstenite::tungstenite::Message {
  fn from(message: Message) -> Self {
    tokio_tungstenite::tungstenite::Message::Text(serde_json::to_string(&message).unwrap().into())
  }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Response {
  pub id: uuid::Uuid,
  pub response: ResponseType,
}

#[derive(Debug, Deserialize, Serialize)]
pub enum ResponseType {
  Success,
  Error(String),
}

impl From<ResponseType> for Result<(), Box<dyn std::error::Error + Send + Sync>> {
  fn from(response: ResponseType) -> Self {
    match response {
      ResponseType::Success => Ok(()),
      ResponseType::Error(e) => Err(e.into()),
    }
  }
}

impl axum::response::IntoResponse for Response {
  fn into_response(self) -> axum::response::Response {
    let body = serde_json::to_string(&self).unwrap().into();
    let mut builder = axum::response::Response::builder();
    if let ResponseType::Error(_) = self.response {
      builder = builder.status(axum::http::status::StatusCode::INTERNAL_SERVER_ERROR)
    };
    builder
      .header(
        axum::http::header::CONTENT_TYPE,
        axum::http::header::HeaderValue::from_static("application/json"),
      )
      .header(
        axum::http::header::HeaderName::from_static("x-request-id"),
        self.id.to_string(),
      )
      .body(body)
      .unwrap()
  }
}

impl From<Response> for axum::extract::ws::Message {
  fn from(response: Response) -> Self {
    axum::extract::ws::Message::Text(serde_json::to_string(&response).unwrap().into())
  }
}

impl From<Response> for tokio_tungstenite::tungstenite::Message {
  fn from(response: Response) -> Self {
    tokio_tungstenite::tungstenite::Message::Text(serde_json::to_string(&response).unwrap().into())
  }
}

impl Response {
  pub fn from_error(id: uuid::Uuid, error: String) -> Self {
    Self {
      id,
      response: ResponseType::Error(error),
    }
  }

  pub fn from_dyn_error(id: uuid::Uuid, result: Result<(), Box<dyn std::error::Error + Send + Sync>>) -> Self {
    match result {
      Ok(()) => Self {
        id,
        response: ResponseType::Success,
      },
      Err(e) => Self {
        id,
        response: ResponseType::Error(e.to_string()),
      },
    }
  }
}
