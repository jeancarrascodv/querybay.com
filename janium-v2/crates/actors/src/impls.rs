use super::{Actor, Message, Router};

impl<T, F, A: Actor> Message<A> for F
where
  T: Send + 'static,
  F: Send
    + 'static
    + for<'a, 'b, 'c> AsyncFnOnce<(&'a mut A, &'b Router, &'c mut <A as Actor>::State), Output = T, CallOnceFuture: Send>,
{
  type Return = T;
  fn handle(self, actor: &mut A, router: &Router, state: &mut <A as Actor>::State) -> impl Future<Output = T> + Send {
    (self)(actor, router, state)
  }
}
