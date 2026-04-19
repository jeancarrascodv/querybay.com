use janium_actors::{Actor, Message, Router};

use crate::config::ShutdownGuard;

pub mod campaign;
pub mod company;
pub mod contact;
pub mod email;
pub mod linkedin;
pub mod log_entry;
pub mod privileges;
pub mod scheduler;
pub mod team;
pub mod user;

pub use campaign::*;
pub use company::*;
pub use contact::*;
pub use email::*;
pub use linkedin::*;
pub use log_entry::*;
pub use privileges::*;
pub use scheduler::*;
pub use team::*;
pub use user::*;

pub struct ActorState<T: 'static> {
  inner: std::sync::Arc<ActorStateInner<T>>,
}

impl<T: 'static> core::fmt::Debug for ActorState<T> {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("ActorState").finish()
  }
}

struct ActorStateInner<T: 'static> {
  app_state: crate::AppState,
  _shutdown_guard: ShutdownGuard<T>,
}

impl<T: 'static> core::ops::Deref for ActorState<T> {
  type Target = crate::AppState;
  fn deref(&self) -> &Self::Target {
    &self.inner.app_state
  }
}

impl<T: 'static> ActorState<T> {
  pub fn new(app_state: crate::AppState, name: String) -> Self {
    let guard = crate::config::ShutdownGuard::<T>::new(&app_state.shutdown_controller, name);
    Self {
      inner: std::sync::Arc::new(ActorStateInner {
        app_state,
        _shutdown_guard: guard,
      }),
    }
  }
  pub fn as_type<U: 'static>(&self, name: String) -> ActorState<U> {
    let guard = crate::config::ShutdownGuard::<U>::new(&self.inner.app_state.shutdown_controller, name);
    ActorState {
      inner: std::sync::Arc::new(ActorStateInner {
        app_state: self.inner.app_state.clone(),
        _shutdown_guard: guard,
      }),
    }
  }
}

pub struct Query<A: Actor, R: Send + 'static, F: FnOnce(&A, &Router, &<A as Actor>::State) -> R + Send + 'static> {
  f: F,
  _marker: std::marker::PhantomData<fn() -> (A, R)>,
}

impl<A: Actor, R: Send + 'static, F: FnOnce(&A, &Router, &<A as Actor>::State) -> R + Send + 'static> Query<A, R, F> {
  pub fn new(f: F) -> Self {
    Self {
      f,
      _marker: std::marker::PhantomData,
    }
  }
}

impl<A: Actor, R: Send + 'static, F: FnOnce(&A, &Router, &<A as Actor>::State) -> R + Send + 'static> core::fmt::Debug
  for Query<A, R, F>
{
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("Query").finish()
  }
}

impl<A: Actor, R: Send + 'static, F: FnOnce(&A, &Router, &<A as Actor>::State) -> R + Send + 'static> Message<A>
  for Query<A, R, F>
{
  type Return = R;

  async fn handle(self, actor: &mut A, router: &Router, extra_state: &mut <A as Actor>::State) -> Self::Return {
    (self.f)(actor, router, extra_state)
  }
}

pub struct Mutation<
  A: Actor,
  R: Send + 'static,
  F: FnOnce(&mut A, &Router, &mut <A as Actor>::State) -> R + Send + 'static,
> {
  f: F,
  _marker: std::marker::PhantomData<fn() -> (A, R)>,
}

impl<A: Actor, R: Send + 'static, F: FnOnce(&mut A, &Router, &mut <A as Actor>::State) -> R + Send + 'static>
  Mutation<A, R, F>
{
  pub fn new(f: F) -> Self {
    Self {
      f,
      _marker: std::marker::PhantomData,
    }
  }
}

impl<A: Actor, R: Send + 'static, F: FnOnce(&mut A, &Router, &mut <A as Actor>::State) -> R + Send + 'static>
  core::fmt::Debug for Mutation<A, R, F>
{
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("Mutation").finish()
  }
}

impl<A: Actor, R: Send + 'static, F: FnOnce(&mut A, &Router, &mut <A as Actor>::State) -> R + Send + 'static> Message<A>
  for Mutation<A, R, F>
{
  type Return = R;

  async fn handle(self, actor: &mut A, router: &Router, extra_state: &mut <A as Actor>::State) -> Self::Return {
    (self.f)(actor, router, extra_state)
  }
}
