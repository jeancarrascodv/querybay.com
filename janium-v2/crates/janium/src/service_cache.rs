use crate::{JaniumError, Result};
pub use bi_map::{CacheableBiMap, ServiceCacheBiMap};
use quick_cache::{Equivalent, sync::Cache};
use std::{hash::Hash, sync::Arc};

pub mod bi_map;

pub struct ServiceCache<C: Cacheable> {
  cache: Cache<C::Key, C::Storage>,
  db: sqlx::PgPool,
  router: janium_actors::Router,
}

pub trait Storage: Clone + Send + Sync + AsRef<Self::Value> {
  type Value;
  fn new(value: Self::Value) -> Self;
}

impl<T: Send + Sync> Storage for Arc<T> {
  type Value = T;
  fn new(value: Self::Value) -> Self {
    Arc::new(value)
  }
}

#[derive(Clone, Debug)]
pub struct Naked<T>(pub T);

impl<T: Send + Sync + Clone> Storage for Naked<T> {
  type Value = T;
  fn new(value: Self::Value) -> Self {
    Naked(value)
  }
}

impl<T> AsRef<T> for Naked<T> {
  fn as_ref(&self) -> &T {
    &self.0
  }
}

impl<T> From<T> for Naked<T> {
  fn from(value: T) -> Self {
    Naked(value)
  }
}

impl<T> Naked<T> {
  pub fn into_inner(self) -> T {
    self.0
  }
}

pub trait Cacheable: Clone + core::hash::Hash + Send + Sync + Unpin + 'static {
  type Key: core::hash::Hash + core::cmp::Eq + core::fmt::Display + Clone + Send + Sync;
  type Storage: Storage<Value = Self>;
  fn key(&self) -> Self::Key;
  fn save(
    self,
    transaction: &mut sqlx::PgConnection,
    router: &janium_actors::Router,
  ) -> impl Future<Output = Result<Self>> + Send;
  fn load_many(
    keys: impl IntoIterator<Item = Self::Key> + Send,
    db: &mut sqlx::PgConnection,
  ) -> impl Future<Output = Result<Vec<Self>>> + Send;
  fn load_one(key: Self::Key, db: &mut sqlx::PgConnection) -> impl Future<Output = Result<Option<Self>>> + Send {
    async move { Self::load_many([key], db).await.map(|mut v| v.pop()) }
  }
  fn delete(key: Self::Key, transaction: &mut sqlx::PgConnection) -> impl Future<Output = Result<()>> + Send {
    let _ = (key, transaction);
    async {
      Err(JaniumError::msg(format!(
        "Not able to delete records for type {}",
        std::any::type_name::<Self>(),
      )))
    }
  }
}

impl<C: Cacheable> core::fmt::Debug for ServiceCache<C> {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("ServiceCache")
      .field("size", &self.cache.len())
      .field("type", &std::any::type_name::<C>() as _)
      .finish()
  }
}

impl<C: Cacheable> ServiceCache<C> {
  pub async fn new(limit: usize, db: sqlx::PgPool, router: janium_actors::Router) -> Result<Self> {
    let cache = Cache::new(limit);
    let mut conn = db.acquire().await?;
    let values = C::load_many(std::iter::empty(), &mut conn).await?;
    cache.reserve(values.len());
    for value in values {
      cache.insert(value.key(), C::Storage::new(value));
    }
    Ok(Self { cache, db, router })
  }
  pub fn new_empty(limit: usize, db: sqlx::PgPool, router: janium_actors::Router) -> Self {
    Self {
      cache: Cache::new(limit),
      db,
      router,
    }
  }
  pub async fn get<Q>(&self, key: &Q) -> Result<Option<C::Storage>>
  where
    Q: Hash + Equivalent<C::Key> + ToOwned<Owned = C::Key> + ?Sized,
  {
    // Have to smuggle the optional none through the error type
    let result = self
      .cache
      .get_or_insert_async::<_, _>(key, async {
        let mut conn = self.db.acquire().await.map_err(|e| Some(e.into()))?;
        let v = C::load_one(key.to_owned(), &mut conn).await;
        match v {
          Ok(Some(v)) => Ok(C::Storage::new(v)),
          Ok(None) => Err(None),
          Err(e) => Err(Some(e)),
        }
      })
      .await;
    match result {
      Ok(c) => Ok(Some(c)),
      Err(e) => {
        if let Some(e) = e {
          Err(e)
        } else {
          Ok(None)
        }
      }
    }
  }
  pub fn try_get<Q>(&self, key: &Q) -> Option<C::Storage>
  where
    Q: Hash + Equivalent<C::Key> + ToOwned<Owned = C::Key> + ?Sized,
  {
    self.cache.get(key)
  }
  pub async fn get_all<Q>(&self, keys: impl IntoIterator<Item = Q>) -> Result<Vec<C::Storage>>
  where
    Q: Hash + Equivalent<C::Key> + ToOwned<Owned = C::Key>,
  {
    let mut found = vec![];
    let mut needed = Vec::new();
    for key in keys {
      if let Some(c) = self.try_get(&key) {
        found.push(c);
      } else {
        needed.push(key.to_owned());
      }
    }
    if needed.is_empty() {
      return Ok(found);
    }
    let mut conn = self.db.acquire().await?;
    let from_db = C::load_many(needed, &mut conn).await?;
    for c in from_db {
      let val = C::Storage::new(c);
      self.cache.insert(val.as_ref().key(), val.clone());
      found.push(val);
    }
    Ok(found)
  }
  pub fn iter(&self) -> impl Iterator<Item = C::Storage> {
    self.cache.iter().map(|(_, v)| v)
  }
  pub async fn save(
    &self,
    prev_hash: crate::util::HashValue,
    value: C,
    transaction: &mut sqlx::PgConnection,
  ) -> Result<()> {
    let key = value.key();
    if !prev_hash.is_default()
      && let Some(existing) = self.cache.peek(&key)
    {
      let existing_hash = crate::util::hash(existing.as_ref());
      if existing_hash != prev_hash {
        return Err(JaniumError::hash_mismatch());
      }
    }
    let value = value.save(transaction, &self.router).await?;
    let value = C::Storage::new(value);
    self.cache.insert(key, value);
    Ok(())
  }
  pub async fn save_without_transaction(&self, prev_hash: crate::util::HashValue, value: C) -> Result<()> {
    let mut conn = self.db.acquire().await?;
    self.save(prev_hash, value, &mut conn).await
  }
  pub fn remove_from_cache<Q>(&self, key: &Q) -> Option<C::Storage>
  where
    Q: Hash + Equivalent<C::Key> + ToOwned<Owned = C::Key> + ?Sized,
  {
    self.cache.remove(key).map(|(_, v)| v)
  }

  // Removes from the cache if it is available and queries otherwise
  pub async fn remove_from_cache_or_query<Q>(&self, key: &Q) -> Result<Option<C::Storage>>
  where
    Q: Hash + Equivalent<C::Key> + ToOwned<Owned = C::Key> + ?Sized,
  {
    if let Some(v) = self.remove_from_cache(key) {
      return Ok(Some(v));
    }
    let mut conn = self.db.acquire().await?;
    let v = C::load_one(key.to_owned(), &mut conn).await?;
    Ok(v.map(C::Storage::new))
  }
  pub async fn delete<Q>(&self, key: &Q, transaction: &mut sqlx::PgConnection) -> Result<()>
  where
    Q: Hash + Equivalent<C::Key> + ToOwned<Owned = C::Key> + ?Sized,
  {
    self.remove_from_cache(key);
    C::delete(key.to_owned(), transaction).await?;
    Ok(())
  }
  pub async fn delete_without_transaction<Q>(&self, key: &Q) -> Result<()>
  where
    Q: Hash + Equivalent<C::Key> + ToOwned<Owned = C::Key> + ?Sized,
  {
    let mut conn = self.db.acquire().await?;
    self.delete(key, &mut conn).await
  }
  pub async fn dynamic_load_many(
    &self,
    query: impl AsyncFnOnce(&mut sqlx::PgConnection) -> Result<Vec<C>>,
  ) -> Result<Vec<C::Storage>> {
    let mut conn = self.db.acquire().await?;
    let results = query(&mut conn)
      .await?
      .into_iter()
      .map(C::Storage::new)
      .collect::<Vec<_>>();
    for result in &results {
      self.cache.insert(result.as_ref().key(), result.clone());
    }
    Ok(results)
  }
}
