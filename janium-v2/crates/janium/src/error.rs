use std::borrow::Cow;

use axum::response::{IntoResponse, Response};

pub(super) static EXPOSE_INTERNAL_ERRORS: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
tokio::task_local! {
  pub static SUPPRESS_AUTO_LOGGING: bool;
}

pub struct JaniumError(Box<JaniumErrorInner>);

impl std::fmt::Display for JaniumError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    if EXPOSE_INTERNAL_ERRORS.get().copied().unwrap_or_default() {
      <Self as std::fmt::Debug>::fmt(self, f)
    } else {
      self.0.fmt(f)
    }
  }
}

impl std::fmt::Debug for JaniumError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    self.0.fmt(f)
  }
}

impl std::error::Error for JaniumError {
  fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
    self.0.source()
  }
}

impl From<JaniumErrorInner> for JaniumError {
  #[track_caller]
  fn from(error: JaniumErrorInner) -> Self {
    if !SUPPRESS_AUTO_LOGGING.try_with(|suppress| *suppress).unwrap_or_default() {
      let location = std::panic::Location::caller();
      let location = format_args!("{}:{}:{}", location.file(), location.line(), location.column());
      tracing::error!(?error, location);
    }
    Self(Box::new(error))
  }
}

#[derive(Debug, thiserror::Error)]
enum JaniumErrorInner {
  #[error("Internal error")]
  Shutdown,
  #[error("Internal error")]
  SqlxError(sqlx::Error),
  #[error("Internal error")]
  OrmliteError(ormlite::Error),
  #[error("Internal error")]
  Actor(janium_actors::ActorError),
  #[error("Internal error")]
  Io(std::io::Error),
  #[error("{0} not found")]
  NotFound(String),
  #[error("Internal error")]
  HashMismatch,
  #[error("Internal error")]
  Json(serde_json::Error),
  #[error("Internal error")]
  LiquidError(liquid::Error),
  #[error("Internal error")]
  WebdriverError(thirtyfour::error::WebDriverError),
  #[error("Internal error")]
  DockerError(bollard::errors::Error),
  #[error("Internal error")]
  ReqwestError(reqwest::Error),
  #[error("Internal error")]
  TungsteniteError(tokio_tungstenite::tungstenite::Error),
  #[error("Internal error")]
  AxumError(axum::Error),
  #[error("Internal error")]
  Any(Box<dyn std::error::Error + Send + Sync + 'static>),
  #[error("Internal error")]
  Message(String),
  #[error("{0}")]
  ExtMessage(Cow<'static, str>),
  #[error("")]
  StatusCode(axum::http::StatusCode),
}

impl JaniumError {
  #[track_caller]
  pub fn any(e: impl Into<Box<dyn std::error::Error + Send + Sync + 'static>>) -> Self {
    JaniumErrorInner::Any(e.into()).into()
  }

  #[track_caller]
  pub fn ext_msg(arg: impl Into<Cow<'static, str>>) -> Self {
    Self(Box::new(JaniumErrorInner::ExtMessage(arg.into())))
  }

  #[track_caller]
  pub fn msg(arg: impl Into<String>) -> Self {
    JaniumErrorInner::Message(arg.into()).into()
  }

  #[track_caller]
  pub fn shutdown() -> Self {
    JaniumErrorInner::Shutdown.into()
  }

  #[track_caller]
  pub fn not_found(id: impl core::fmt::Display) -> Self {
    JaniumErrorInner::NotFound(id.to_string()).into()
  }

  #[track_caller]
  pub fn unauthorized() -> Self {
    axum::http::StatusCode::UNAUTHORIZED.into()
  }

  pub fn is_not_found(&self) -> bool {
    matches!(*self.0, JaniumErrorInner::NotFound(_))
  }

  /// Returns true if this error indicates an infrastructure problem (container/WebDriver connectivity)
  /// rather than an action-level failure (e.g., element not found on a page).
  pub fn is_infrastructure_error(&self) -> bool {
    match &*self.0 {
      JaniumErrorInner::DockerError(_) => true,
      JaniumErrorInner::WebdriverError(e) => {
        const INFRA_ERROR_MSGS: &[&str] = &[
          "RequestFailed",
          "Timeout",
          "IoError",
          "HttpError",
          "InvalidSessionId",
          "SessionNotCreated",
          "WebDriverTimeout",
          "UnknownError",
          "FatalError",
          "CommandRecvError",
          "CommandSendError",
          "SessionCreateError",
        ];
        let message = format!("{e:?}");
        INFRA_ERROR_MSGS.iter().any(|msg| message.contains(msg))
      }
      JaniumErrorInner::ReqwestError(e) => e.is_connect(),
      JaniumErrorInner::Message(msg) => {
        msg.contains("Container did not start") || msg.contains("Failed to lock automator")
      }
      _ => false,
    }
  }

  #[track_caller]
  pub fn hash_mismatch() -> Self {
    JaniumErrorInner::HashMismatch.into()
  }
}

impl From<sqlx::Error> for JaniumError {
  #[track_caller]
  fn from(error: sqlx::Error) -> Self {
    JaniumErrorInner::SqlxError(error).into()
  }
}

impl From<ormlite::Error> for JaniumError {
  #[track_caller]
  fn from(error: ormlite::Error) -> Self {
    JaniumErrorInner::OrmliteError(error).into()
  }
}

impl From<janium_actors::ActorError> for JaniumError {
  #[track_caller]
  fn from(error: janium_actors::ActorError) -> Self {
    JaniumErrorInner::Actor(error).into()
  }
}

impl From<std::io::Error> for JaniumError {
  #[track_caller]
  fn from(error: std::io::Error) -> Self {
    JaniumErrorInner::Io(error).into()
  }
}

impl From<Box<dyn std::error::Error + Send + Sync + 'static>> for JaniumError {
  #[track_caller]
  fn from(error: Box<dyn std::error::Error + Send + Sync + 'static>) -> Self {
    JaniumErrorInner::Any(error).into()
  }
}

impl From<serde_json::Error> for JaniumError {
  #[track_caller]
  fn from(error: serde_json::Error) -> Self {
    JaniumErrorInner::Json(error).into()
  }
}

impl From<liquid::Error> for JaniumError {
  #[track_caller]
  fn from(error: liquid::Error) -> Self {
    JaniumErrorInner::LiquidError(error).into()
  }
}

impl From<thirtyfour::error::WebDriverError> for JaniumError {
  #[track_caller]
  fn from(error: thirtyfour::error::WebDriverError) -> Self {
    JaniumErrorInner::WebdriverError(error).into()
  }
}

impl From<bollard::errors::Error> for JaniumError {
  #[track_caller]
  fn from(error: bollard::errors::Error) -> Self {
    JaniumErrorInner::DockerError(error).into()
  }
}

impl From<reqwest::Error> for JaniumError {
  #[track_caller]
  fn from(error: reqwest::Error) -> Self {
    JaniumErrorInner::ReqwestError(error).into()
  }
}

impl From<tokio_tungstenite::tungstenite::Error> for JaniumError {
  #[track_caller]
  fn from(error: tokio_tungstenite::tungstenite::Error) -> Self {
    JaniumErrorInner::TungsteniteError(error).into()
  }
}

impl From<axum::Error> for JaniumError {
  #[track_caller]
  fn from(error: axum::Error) -> Self {
    JaniumErrorInner::AxumError(error).into()
  }
}

impl From<axum::http::StatusCode> for JaniumError {
  fn from(status_code: axum::http::StatusCode) -> Self {
    // Don't log errors with status codes
    JaniumError(Box::new(JaniumErrorInner::StatusCode(status_code)))
  }
}

// impl From<String> for JaniumError {
//   #[track_caller]
//   fn from(error: String) -> Self {
//     JaniumErrorInner::Message(error).into()
//   }
// }

impl IntoResponse for JaniumError {
  fn into_response(self) -> Response {
    let expose_internal_errors = EXPOSE_INTERNAL_ERRORS.get().copied().unwrap_or_default();
    let body = if expose_internal_errors
      || crate::auth::CLAIMS
        .try_with(|claims| {
          claims
            .privileges
            .allows(crate::models::privileges::Privilege::SuperAdmin)
        })
        .unwrap_or_default()
    {
      format!("{self:#?}")
    } else {
      self.to_string()
    };
    let status_code = match &*self.0 {
      JaniumErrorInner::ExtMessage(_) => 400,
      JaniumErrorInner::NotFound(_) => 404,
      JaniumErrorInner::StatusCode(status_code) => status_code.as_u16(),
      _ => 500,
    };

    if status_code == 500 {
      tracing::error!(error = ?self, "Returning error response");
    }

    axum::response::Response::builder()
      .status(status_code)
      .body(axum::body::Body::from(body))
      .unwrap()
  }
}
