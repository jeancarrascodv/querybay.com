#![feature(async_fn_traits)]
#![feature(unboxed_closures)]

use dashmap::DashMap as HashMap;
use futures::{FutureExt, StreamExt, future::BoxFuture};
use std::{
  any::{Any, TypeId},
  borrow::Borrow,
  fmt::{Debug, Display},
  future::Future,
  hash::Hash,
  sync::Arc,
};
use tracing::Instrument;
use uuid::Uuid;

pub type DynResult<T = ()> = Result<T, Box<dyn std::error::Error + Send + Sync + 'static>>;

mod impls;

tokio::task_local! {
  /// To disassociate from the current message span, the easiest way to do that is to
  /// send a message inside of a future that is sent to `tokio::spawn`. Somehow starting
  /// a new thread or setting the current message span to nothing is useless.
  pub static MESSAGE_SPAN: tracing::Span;
}

pub fn message_span() -> tracing::Span {
  MESSAGE_SPAN
    .try_with(tracing::Span::clone)
    .unwrap_or(tracing::Span::none())
}

pub type ActorResult<T> = Result<T, ActorError>;

#[derive(Debug, thiserror::Error)]
pub enum ActorError {
  #[error("Duplicate registration {0}")]
  DuplicateRegistration(String),
  #[error("Dead actor {0}")]
  DeadActor(String),
  #[error("No reponse {0}")]
  NoResponse(String),
  #[error("No registration {0}")]
  NoRegistration(String),
}

pub trait Message<A: Actor>: 'static + Send + Sized {
  type Return: 'static + Send;
  fn handle(self, actor: &mut A, router: &Router, state: &mut A::State) -> impl Future<Output = Self::Return> + Send;
}

pub struct SyncMessage<A: Actor, O> {
  f: for<'a, 'b, 'c> fn(&'a mut A, &'b Router, &'c mut <A as Actor>::State) -> O,
}

impl<A: Actor, O: Send + 'static> SyncMessage<A, O> {
  pub fn new(f: fn(&mut A, &Router, &mut <A as Actor>::State) -> O) -> Self {
    Self { f }
  }
}

impl<A: Actor, O> core::fmt::Debug for SyncMessage<A, O> {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "fn ptr: {:?}", self.f)
  }
}

impl<A: Actor, O: Send + 'static> Message<A> for SyncMessage<A, O> {
  type Return = O;

  async fn handle(self, actor: &mut A, router: &Router, extra_state: &mut <A as Actor>::State) -> Self::Return {
    (self.f)(actor, router, extra_state)
  }
}

pub trait Actor: Sized + Send + 'static {
  type Id: Hash + Ord + Debug + Display + Send + Sync + Clone + std::borrow::Borrow<Self::IdRef> + 'static;
  type IdRef: Hash + Ord + Debug + Display + Send + Sync + std::borrow::ToOwned<Owned = Self::Id> + ?Sized;
  type State: Send;
  type StartResult: Send;

  fn id(&self) -> Self::Id {
    self.id_ref().to_owned()
  }
  fn id_ref(&self) -> &Self::IdRef;
  fn queue_size() -> usize {
    16
  }
  /// Runs directly after being registered
  fn start(
    &mut self,
    router: &Router,
    state: &mut Self::State,
  ) -> impl Future<Output = DynResult<Self::StartResult>> + Send;

  /// Runs before being dropped and after being unregistered
  fn stop(&mut self, router: Router, state: Self::State) -> impl Future<Output = DynResult> + Send {
    let _ = router;
    let _ = state;
    futures::future::ready(Ok(()))
  }
}

pub struct Sender<A: Actor> {
  id: Arc<A::Id>,
  inner: tokio::sync::mpsc::Sender<DynMessage<A>>,
}

impl<A: Actor> PartialEq for Sender<A> {
  fn eq(&self, other: &Self) -> bool {
    self.id.as_ref() == other.id.as_ref()
  }
}

impl<A: Actor> Eq for Sender<A> {}

impl<A: Actor> PartialOrd for Sender<A> {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

impl<A: Actor> Ord for Sender<A> {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    self.id.as_ref().cmp(other.id.as_ref())
  }
}

impl<A: Actor> Clone for Sender<A> {
  fn clone(&self) -> Self {
    Self {
      id: self.id.clone(),
      inner: self.inner.clone(),
    }
  }
}

pub enum SendError<A: Actor, M: Message<A>> {
  QueueFull(M),
  Disconnected(String, M),
  // Processing(ActorError, M),
  #[doc(hidden)]
  __Phantom(fn() -> &'static A),
}

impl<A: Actor, M: Message<A>> SendError<A, M> {
  pub fn into_inner(self) -> M {
    match self {
      Self::QueueFull(m) => m,
      Self::Disconnected(_, m) => m,
      // SendError::Processing(_, m) => m,
      Self::__Phantom(_) => unreachable!(),
    }
  }
}

impl<A: Actor> Sender<A> {
  pub fn id(&self) -> &A::Id {
    self.id.as_ref()
  }
  pub fn id_arc(&self) -> &Arc<A::Id> {
    &self.id
  }

  /// Convert this Sender into a SyncSender that only allows non-blocking operations.
  /// Use this when passing a sender to code that should never block waiting on the actor,
  /// such as when the actor might be waiting on that code (avoiding deadlocks).
  pub fn into_sync(self) -> SyncSender<A> {
    SyncSender {
      id: self.id,
      inner: self.inner,
    }
  }

  /// Create a SyncSender from this Sender (clones the underlying channel).
  pub fn to_sync(&self) -> SyncSender<A> {
    SyncSender {
      id: self.id.clone(),
      inner: self.inner.clone(),
    }
  }

  // #[instrument(skip(self), parent = tracing::Span::current(), fields(actor_type = std::any::type_name::<A>(), actor_id = %self.id(), message_type = std::any::type_name::<M>()))]
  pub fn try_send<M: Message<A>>(
    &self,
    msg: M,
  ) -> Result<impl Future<Output = Option<M::Return>> + '_, SendError<A, M>> {
    tracing::trace!("Try sending message");
    let (msg, recv) = DynMessage::<A>::new(msg);
    self.inner.try_send(msg).map_err(|e| match e {
      tokio::sync::mpsc::error::TrySendError::Closed(m) => {
        SendError::Disconnected(self.id.as_ref().to_string(), m.into_inner().unwrap())
      }
      tokio::sync::mpsc::error::TrySendError::Full(m) => SendError::QueueFull(m.into_inner().unwrap()),
    })?;
    tracing::trace!("Sent message");
    Ok(async move { recv.await.ok() })
  }

  // #[instrument(skip(self), parent = tracing::Span::current(), fields(actor_type = std::any::type_name::<A>(), actor_id = %self.id(), message_type = std::any::type_name::<M>()))]
  pub fn try_notify<M: Message<A>>(&self, msg: M) -> Result<(), SendError<A, M>> {
    tracing::trace!("Try notifying message");
    let msg = DynMessage::<A>::new_notify::<_, true>(msg);
    self.inner.try_send(msg).map_err(|e| match e {
      tokio::sync::mpsc::error::TrySendError::Closed(m) => {
        SendError::Disconnected(self.id.as_ref().to_string(), m.into_inner().unwrap())
      }
      tokio::sync::mpsc::error::TrySendError::Full(m) => SendError::QueueFull(m.into_inner().unwrap()),
    })?;
    tracing::trace!("Notified message");
    Ok(())
  }

  pub async fn send<M: Message<A>>(&self, msg: M) -> Result<M::Return, ActorError> {
    self
      .send_and_wait_later(msg)
      .await?
      .await
      .ok_or_else(|| ActorError::NoResponse(self.id().to_string()))
  }

  // #[instrument(skip(self), parent = tracing::Span::current(), fields(actor_type = std::any::type_name::<A>(), actor_id = %self.id(), message_type = std::any::type_name::<M>()))]
  pub async fn send_and_wait_later<M: Message<A>>(
    &self,
    msg: M,
  ) -> Result<impl Future<Output = Option<M::Return>>, ActorError> {
    tracing::trace!("Sending message");
    let (msg, recv) = DynMessage::<A>::new(msg);
    self
      .inner
      .send(msg)
      .await
      .map_err(|_| ActorError::DeadActor(self.id.as_ref().to_string()))?;
    tracing::trace!("Sent message");
    Ok(async move { recv.await.ok() })
  }

  // #[instrument(skip(self), parent = tracing::Span::current(), fields(actor_type = std::any::type_name::<A>(), actor_id = %self.id(), message_type = std::any::type_name::<M>()))]
  pub async fn notify<M: Message<A>>(&self, msg: M) -> Result<(), ActorError> {
    tracing::trace!("Notifying message");
    let msg = DynMessage::<A>::new_notify::<_, true>(msg);
    self
      .inner
      .send(msg)
      .await
      .map_err(|_| ActorError::DeadActor(self.id.as_ref().to_string()))?;
    tracing::trace!("Notified message");
    Ok(())
  }
}

/// A sender that only allows synchronous (non-blocking) operations.
///
/// Use this when passing a sender to code that should never block waiting on the actor,
/// such as when the actor might be waiting on that code. This prevents deadlocks where
/// two pieces of code are waiting on each other.
///
/// If a message absolutely must be sent and the queue is full, use `spawn_notify` to
/// spawn a background task that will wait for space in the queue.
pub struct SyncSender<A: Actor> {
  id: Arc<A::Id>,
  inner: tokio::sync::mpsc::Sender<DynMessage<A>>,
}

impl<A: Actor> PartialEq for SyncSender<A> {
  fn eq(&self, other: &Self) -> bool {
    self.id.as_ref() == other.id.as_ref()
  }
}

impl<A: Actor> Eq for SyncSender<A> {}

impl<A: Actor> Clone for SyncSender<A> {
  fn clone(&self) -> Self {
    Self {
      id: self.id.clone(),
      inner: self.inner.clone(),
    }
  }
}

impl<A: Actor> Debug for SyncSender<A> {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("SyncSender").field("id", &self.id).finish()
  }
}

impl<A: Actor> SyncSender<A> {
  pub fn id(&self) -> &A::Id {
    self.id.as_ref()
  }

  pub fn id_arc(&self) -> &Arc<A::Id> {
    &self.id
  }

  /// Try to send a message without blocking. Returns a future to await the response.
  /// Returns an error if the queue is full or the actor is dead.
  pub fn try_send<M: Message<A>>(
    &self,
    msg: M,
  ) -> Result<impl Future<Output = Option<M::Return>> + '_, SendError<A, M>> {
    tracing::trace!("SyncSender: Try sending message");
    let (msg, recv) = DynMessage::<A>::new(msg);
    self.inner.try_send(msg).map_err(|e| match e {
      tokio::sync::mpsc::error::TrySendError::Closed(m) => {
        SendError::Disconnected(self.id.as_ref().to_string(), m.into_inner().unwrap())
      }
      tokio::sync::mpsc::error::TrySendError::Full(m) => SendError::QueueFull(m.into_inner().unwrap()),
    })?;
    tracing::trace!("SyncSender: Sent message");
    Ok(async move { recv.await.ok() })
  }

  /// Try to notify (fire-and-forget) without blocking.
  /// Returns an error if the queue is full or the actor is dead.
  pub fn try_notify<M: Message<A>>(&self, msg: M) -> Result<(), SendError<A, M>> {
    tracing::trace!("SyncSender: Try notifying message");
    let msg = DynMessage::<A>::new_notify::<_, true>(msg);
    self.inner.try_send(msg).map_err(|e| match e {
      tokio::sync::mpsc::error::TrySendError::Closed(m) => {
        SendError::Disconnected(self.id.as_ref().to_string(), m.into_inner().unwrap())
      }
      tokio::sync::mpsc::error::TrySendError::Full(m) => SendError::QueueFull(m.into_inner().unwrap()),
    })?;
    tracing::trace!("SyncSender: Notified message");
    Ok(())
  }

  /// Spawn a background task to notify the actor. Use this when the message must be delivered
  /// even if the queue is currently full. The spawned task will wait for space in the queue.
  ///
  /// Returns a handle to the spawned task.
  pub fn spawn_notify<M: Message<A>>(&self, msg: M) -> Option<tokio::task::JoinHandle<Result<(), ActorError>>> {
    if let Err(e) = self.try_notify(msg) {
      let inner = self.inner.clone();
      let id = self.id.clone();
      let msg = e.into_inner();
      let handle = tokio::spawn(async move {
        tracing::trace!("SyncSender: Spawned notify sending message");
        let msg = DynMessage::<A>::new_notify::<_, true>(msg);
        inner
          .send(msg)
          .await
          .map_err(|_| ActorError::DeadActor(id.as_ref().to_string()))?;
        tracing::trace!("SyncSender: Spawned notify sent message");
        Ok(())
      });
      Some(handle)
    } else {
      None
    }
  }

  /// Spawn a background task to send a message and get a response.
  /// Use this when you need a response but can't block the current context.
  ///
  /// Returns a handle to the spawned task that will resolve to the message response.
  pub fn spawn_send<M: Message<A>>(&self, msg: M) -> Option<tokio::task::JoinHandle<Result<M::Return, ActorError>>> {
    if let Err(e) = self.try_send(msg) {
      let msg = e.into_inner();
      let inner = self.inner.clone();
      let id = self.id.clone();
      let handle = tokio::spawn(async move {
        tracing::trace!("SyncSender: Spawned send sending message");
        let (msg, recv) = DynMessage::<A>::new(msg);
        inner
          .send(msg)
          .await
          .map_err(|_| ActorError::DeadActor(id.as_ref().to_string()))?;
        tracing::trace!("SyncSender: Spawned send sent message, waiting for response");
        recv.await.map_err(|_| ActorError::NoResponse(id.as_ref().to_string()))
      });
      Some(handle)
    } else {
      None
    }
  }
}

#[allow(clippy::type_complexity)]
struct DynMessage<A: Actor> {
  msg: Box<dyn Any + Send>,
  message_span: tracing::Span,
  returner: Option<Box<dyn Any + Send>>,
  call_fn: for<'a> fn(
    &'a mut A,
    Box<dyn Any + Send>,
    Option<Box<dyn Any + Send>>,
    &'a Router,
    &'a mut A::State,
  ) -> BoxFuture<'a, bool>,
}

impl<A: Actor> DynMessage<A> {
  fn new<M: Message<A>>(msg: M) -> (Self, tokio::sync::oneshot::Receiver<M::Return>) {
    let (returner, receiver) = tokio::sync::oneshot::channel::<M::Return>();

    let mut this = Self::new_notify::<M, true>(msg);
    this.returner = Some(Box::new(returner));
    (this, receiver)
  }
  fn new_notify<M: Message<A>, const B: bool>(msg: M) -> Self {
    let message_span = message_span();
    let id = Uuid::new_v4();
    let msg_ty = std::any::type_name::<M>();
    let actor_ty = std::any::type_name::<A>();

    let new_span = if message_span.is_disabled() {
      tracing::info_span!("message", %id, msg_ty, actor_ty)
    } else {
      message_span
    };

    Self {
      msg: Box::new(msg),
      message_span: new_span,
      returner: None,
      call_fn: Self::execute::<M, B>,
    }
  }
  fn into_inner<M: Message<A>>(self) -> Option<M> {
    self.msg.downcast().ok().map(|x| *x)
  }
  fn execute<'a, M: Message<A>, const B: bool>(
    actor: &'a mut A,
    msg: Box<dyn Any + Send>,
    returner: Option<Box<dyn Any + Send>>,
    router: &'a Router,
    extra_state: &'a mut A::State,
  ) -> BoxFuture<'a, bool> {
    let msg = msg.downcast::<M>().unwrap();
    let returner = returner.map(|s| s.downcast::<tokio::sync::oneshot::Sender<M::Return>>().unwrap());

    let span = tracing::info_span!(parent: message_span(), "execute", actor_id = %actor.id_ref(), actor_type = std::any::type_name::<A>(), message_type = std::any::type_name::<M>());
    async move {
      tracing::trace!("Handling message",);
      let result = (*msg).handle(actor, router, extra_state).await;
      if let Some(returner) = returner {
        returner.send(result).ok();
      }
      tracing::trace!("Handled message",);
      B
    }
    .instrument(span)
    .boxed()
  }
}

#[doc(hidden)]
#[derive(Default)]
pub struct RouterInner {
  actor_handles: HashMap<TypeId, Box<dyn Any + Send + Sync + 'static>>,
}

/// Internally contains a `Router` in an `Arc` so can be cloned and shared
#[derive(Clone, Default)]
pub struct Router {
  inner: Arc<RouterInner>,
}

// Private struct to ensure unique lookups.
struct RouterIter;

type ShutdownMap = HashMap<TypeId, Box<dyn FnOnce() + Send + Sync + 'static>>;
type ActorMap<A> = HashMap<<A as Actor>::Id, Sender<A>>;

impl Router {
  pub fn get_handle<A: Actor>(&self, id: &A::IdRef) -> ActorResult<Sender<A>> {
    self
      .inner
      .actor_handles
      .get(&TypeId::of::<A>())
      .ok_or_else(|| ActorError::NoRegistration(id.to_string()))?
      .downcast_ref::<HashMap<A::Id, Sender<A>>>()
      .unwrap()
      .get(id)
      .as_deref()
      .cloned()
      .ok_or_else(|| ActorError::NoRegistration(id.to_string()))
  }

  /// Broadcasts a message to all Actors of type `A` as generated by f using the ids of `A`
  pub async fn broadcast<A: Actor, M: Message<A>>(
    &self,
    mut f: impl FnMut(&A::IdRef) -> M,
  ) -> std::collections::HashMap<A::Id, ActorResult<M::Return>> {
    let Some(handle) = self.inner.actor_handles.get(&TypeId::of::<A>()) else {
      return Default::default();
    };
    let actor_map = handle.downcast_ref::<ActorMap<A>>().unwrap();
    actor_map
      .iter()
      .map(|r| {
        let id = r.key().clone();
        let msg = f(<A::Id as std::borrow::Borrow<A::IdRef>>::borrow(&id));
        async move {
          let result = r.value().send_and_wait_later(msg).await;
          let result = match result {
            Ok(f) => f.await.ok_or_else(|| ActorError::NoResponse(id.to_string())),
            Err(e) => Err(e),
          };
          (id, result)
        }
      })
      // iter collect
      .collect::<futures::stream::FuturesUnordered<_>>()
      // stream collect
      .collect()
      .await
  }

  pub async fn broadcast_notify<A: Actor, M: Message<A>>(
    &self,
    mut f: impl FnMut(&A::IdRef) -> M,
  ) -> Result<(), ActorError> {
    let Some(handle) = self.inner.actor_handles.get(&TypeId::of::<A>()) else {
      return Ok(());
    };
    let actor_map = handle.downcast_ref::<ActorMap<A>>().unwrap();
    let mut futures = actor_map
      .iter()
      .map(|r| {
        let msg = f(<A::Id as std::borrow::Borrow<A::IdRef>>::borrow(r.key()));
        async move { r.value().notify(msg).await }
      })
      .collect::<futures::stream::FuturesUnordered<_>>();
    while let Some(result) = futures.next().await {
      result?;
    }
    Ok(())
  }

  /// Registers a new actors and starts it running. The returned future returns an error if the startup function fails
  /// and if it is successful returns the sender for sending further messages.
  pub fn register<A: Actor>(&self, actor: A, extra: A::State) -> impl Future<Output = DynResult<Sender<A>>> {
    let (sender, receiver) = tokio::sync::mpsc::channel(A::queue_size());

    // wrap this in ok so that we don't have to return a result of a future of a result
    let mut sender = DynResult::Ok(Sender {
      id: Arc::new(actor.id()),
      inner: sender,
    });
    let (startup_sender, startup_receiver) = tokio::sync::oneshot::channel::<DynResult<<A as Actor>::StartResult>>();

    // Insert into the actor map. The entry/ref_mut hold a DashMap shard lock,
    // so we must drop them before accessing actor_handles again (for the shutdown map)
    // to avoid deadlocking when two TypeIds hash to the same shard.
    {
      let e = self.inner.actor_handles.entry(TypeId::of::<A>());
      let ref_mut = e.or_insert_with(|| Box::new(ActorMap::<A>::new()) as _);
      let entry = ref_mut.downcast_ref::<ActorMap<A>>().unwrap().entry(actor.id());

      match entry {
        dashmap::Entry::Occupied(_) => {
          sender = Err(ActorError::DuplicateRegistration(actor.id_ref().to_string()).into());
        }
        dashmap::Entry::Vacant(vacant_entry) => {
          vacant_entry.insert(sender.as_ref().unwrap().clone());
          tokio::spawn(run_actor(self.clone(), actor, startup_sender, receiver, extra));
        }
      }
    }

    // Register functions for shutdown if needed (separate scope so no shard locks are held)
    {
      let iter_entry = self.inner.actor_handles.entry(TypeId::of::<RouterIter>());
      let ref_mut = iter_entry.or_insert_with(|| Box::<ShutdownMap>::default() as _);
      let entry = ref_mut.downcast_ref::<ShutdownMap>().unwrap().entry(TypeId::of::<A>());
      let router = self.clone();
      entry.or_insert_with(move || {
        tracing::debug!(actor_type = std::any::type_name::<A>(), "creating stop function");
        let router = router;
        Box::new(move || {
          tokio::spawn(async move {
            tracing::debug!(
              actor_type = std::any::type_name::<A>(),
              "sending stop signal to all actors"
            );

            let handle = router.inner.actor_handles.get(&TypeId::of::<A>()).unwrap();
            let actor_map = handle.downcast_ref::<ActorMap<A>>().unwrap();
            actor_map
              .iter()
              .map(async |r| {
                tracing::trace!(
                  actor_type = std::any::type_name::<A>(),
                  actor_id = %r.key(),
                  "sending stop signal to actor"
                );
                let msg = DynMessage::<A>::new_notify::<_, false>(Stop);
                r.value().inner.send(msg).await.ok();
                tracing::trace!(
                  actor_type = std::any::type_name::<A>(),
                  actor_id = %r.key(),
                  "sent stop signal to actor"
                );
              })
              .collect::<futures::stream::FuturesUnordered<_>>()
              .collect::<()>()
              .await;
          });
        }) as _
      });
    }

    async move {
      startup_receiver.await.unwrap()?;
      sender
    }
  }

  pub fn shutdown(&self) {
    let Some((_, v)) = self.inner.actor_handles.remove(&TypeId::of::<RouterIter>()) else {
      return;
    };
    tracing::info!("signaling actors to shutdown",);
    let r = *v.downcast::<ShutdownMap>().unwrap();
    for (_, v) in r {
      (v)()
    }
  }
}

async fn run_actor<A: Actor>(
  router: Router,
  mut actor: A,
  startup_sender: tokio::sync::oneshot::Sender<DynResult<<A as Actor>::StartResult>>,
  mut receiver: tokio::sync::mpsc::Receiver<DynMessage<A>>,
  mut extra_state: A::State,
) {
  let unregister = Unregister::<A> {
    router: &router,
    id: actor.id(),
  };
  match actor.start(&router, &mut extra_state).instrument(message_span()).await {
    Ok(v) => startup_sender.send(Ok(v)).unwrap_or_default(),
    Err(error) => {
      tracing::error!(%error, id = %actor.id_ref(), type = std::any::type_name::<A>(), "Unable to start actor");
      startup_sender.send(Err(error)).ok();
      return;
    }
  }
  while let Some(msg) = receiver.recv().await {
    let mut cont = false;
    MESSAGE_SPAN
      .scope(msg.message_span, async {
        cont = (msg.call_fn)(&mut actor, msg.msg, msg.returner, &router, &mut extra_state)
          .instrument(message_span())
          .await;
      })
      .await;
    if !cont {
      tracing::info!(type = std::any::type_name::<A>(), id = %actor.id_ref(), "Stopping actor after remaining messages are processed");
      receiver.close();
    }
  }
  drop(unregister);
  actor
    .stop(router, extra_state)
    .await
    .inspect_err(|error| tracing::error!(%error, "Error while shutting down actor"))
    .ok();
}

#[derive(Debug)]
struct Stop;
impl<A: Actor> Message<A> for Stop {
  type Return = ();
  async fn handle(self, _actor: &mut A, _router: &Router, _: &mut A::State) -> Self::Return {
    tracing::info!("received stop message");
  }
}

struct Unregister<'a, A: Actor> {
  router: &'a Router,
  id: A::Id,
}

impl<A: Actor> Drop for Unregister<'_, A> {
  fn drop(&mut self) {
    let map = self.router.inner.actor_handles.get(&TypeId::of::<A>()).unwrap();
    let actor_map = map.downcast_ref::<ActorMap<A>>().unwrap();
    actor_map.remove(self.id.borrow()).unwrap();
    tracing::debug!(type = std::any::type_name::<A>(), id = %self.id, "Unregistered");
  }
}
