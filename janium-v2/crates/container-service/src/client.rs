use super::{Command, ControlToken, EnigoCommand, Message, MessageType, Response, ResponseType};
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

pub struct Client {
  url: String,
  connection: tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
}

impl Client {
  pub async fn new(host: &str, port: u16) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
    let url = format!("ws://{host}:{port}/ws");
    let request = url.clone().into_client_request().unwrap();
    let (stream, response) = tokio_tungstenite::connect_async(request).await.unwrap();
    if !response.status().is_informational() {
      return Err(format!("Failed to connect to enigo: {}", response.status()).into());
    }
    let connection: tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>> =
      stream;
    Ok(Self { url, connection })
  }
  pub async fn close(mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    self.connection.close(None).await?;
    Ok(())
  }
  pub async fn send_message(&mut self, message: MessageType) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let id = uuid::Uuid::new_v4();
    self.connection.send(Message { id, message }.into()).await?;
    loop {
      let response = self
        .connection
        .next()
        .await
        .ok_or_else(|| format!("No response received from {}", self.url))??;
      match response {
        WsMessage::Text(text) => {
          let response: Response = serde_json::from_str(&text)?;
          if response.id != id {
            return Err(format!("Response ID mismatch: {} != {id}", response.id).into());
          }
          match response.response {
            ResponseType::Success => {
              return Ok(());
            }
            ResponseType::Error(error) => {
              return Err(format!("Response error: {error}").into());
            }
          }
        }
        WsMessage::Binary(_) => {
          return Err(format!("Received binary message from {}", self.url).into());
        }
        WsMessage::Ping(ping) => {
          self.connection.send(WsMessage::Pong(ping)).await?;
        }
        WsMessage::Pong(_) | WsMessage::Frame(_) => {
          // do nothing
        }
        WsMessage::Close(_) => {
          return Err(format!("Received close message from {}", self.url).into());
        }
      }
    }
  }
  pub async fn send_command(&mut self, command: Command) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    self.send_message(MessageType::Command(command)).await
  }
  pub async fn send_control_tokens(
    &mut self,
    tokens: Vec<ControlToken>,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    self.send_message(MessageType::Enigo(EnigoCommand { tokens })).await
  }
}
