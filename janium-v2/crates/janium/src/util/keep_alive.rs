use crate::automator::runner::KeepAliveMessage;
use crate::prelude::*;
use std::time::Duration;

#[derive(Clone)]
pub struct KeepAliveSender {
  inner: tokio::sync::mpsc::Sender<KeepAliveMessage>,
  every: Duration,
  next_send: tokio::time::Instant,
}

impl std::fmt::Debug for KeepAliveSender {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let next_send = self.next_send.saturating_duration_since(tokio::time::Instant::now());
    f.debug_struct("KeepAliveSender")
      .field("every", &self.every)
      .field("next_send", &next_send)
      .finish()
  }
}

impl KeepAliveSender {
  pub fn new(every: Duration, sender: tokio::sync::mpsc::Sender<KeepAliveMessage>) -> Self {
    Self {
      inner: sender,
      every,
      next_send: tokio::time::Instant::now() + every,
    }
  }
  pub fn send(&mut self, user_id: Id<User>) -> Option<ClosedChannel> {
    let instant = tokio::time::Instant::now();
    let should_send = instant >= self.next_send;
    let channel_open = if should_send {
      self.next_send = instant + self.every;
      self.inner.try_send(KeepAliveMessage { instant, user_id }).is_ok()
    } else {
      !self.inner.is_closed()
    };
    (!channel_open).then_some(ClosedChannel)
  }
}

pub struct ClosedChannel;
