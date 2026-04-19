use std::collections::{BTreeMap, HashMap};

use futures::{Stream, StreamExt};
use quick_cache::sync::Cache;

use crate::prelude::*;

pub trait CacheableBiMap {
  type LKey: core::hash::Hash + core::fmt::Display + Clone + Send + Ord;
  type RKey: core::hash::Hash + core::fmt::Display + Clone + Send + Ord;
  type Db;
  type CacheValue: PartialEq;
  fn lkey(db: &Self::Db) -> Self::LKey;
  fn rkey(db: &Self::Db) -> Self::RKey;
  fn cache_value(db: &Self::Db) -> Self::CacheValue;
  fn cache_value_owned(db: Self::Db) -> Self::CacheValue;
  fn save(db: Self::Db, db: &mut sqlx::PgConnection) -> impl Future<Output = Result<Self::Db>> + Send;
  fn load_initial(limit: usize, db: &mut sqlx::PgConnection) -> impl Stream<Item = Result<Self::Db>> + Send;
  fn l_load_one(key: &Self::LKey, db: &mut sqlx::PgConnection) -> impl Future<Output = Result<Vec<Self::Db>>> + Send;
  fn r_load_one(key: &Self::RKey, db: &mut sqlx::PgConnection) -> impl Future<Output = Result<Vec<Self::Db>>> + Send;
  fn delete(key: Self::Db, db: &mut sqlx::PgConnection) -> impl Future<Output = Result<()>> + Send;
}

// type LCacheValue<C: CacheableBiMap> = Arc<BTreeMap<C::RKey, ArcSwap<C::CacheValue>>>;
type LCacheValue<C> = Arc<BTreeMap<<C as CacheableBiMap>::RKey, ArcSwap<<C as CacheableBiMap>::CacheValue>>>;
// type RCacheValue<C: CacheableBiMap> = Arc<BTreeMap<C::LKey, ArcSwap<C::CacheValue>>>;
type RCacheValue<C> = Arc<BTreeMap<<C as CacheableBiMap>::LKey, ArcSwap<<C as CacheableBiMap>::CacheValue>>>;

pub struct ServiceCacheBiMap<C: CacheableBiMap> {
  l_cache: Cache<C::LKey, LCacheValue<C>>,
  r_cache: Cache<C::RKey, RCacheValue<C>>,
  db: sqlx::PgPool,
}

impl<C: CacheableBiMap> core::fmt::Debug for ServiceCacheBiMap<C> {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    f.debug_struct("ServiceCacheBiMap")
      .field("l_cache", &self.l_cache)
      .field("r_cache", &self.r_cache)
      .finish()
  }
}

impl<C: CacheableBiMap> ServiceCacheBiMap<C> {
  pub async fn new(limit: usize, db: sqlx::PgPool) -> Result<Self> {
    let l_cache = Cache::new(limit);
    let r_cache = Cache::new(limit);
    let mut conn = db.acquire().await?;
    let initial = C::load_initial(limit, &mut conn);
    tokio::pin!(initial);
    let mut l_values = HashMap::new();
    let mut r_values = HashMap::new();
    while let Some(db) = initial.next().await {
      let db = db?;
      let l_key = C::lkey(&db);
      let r_key = C::rkey(&db);
      let cache_value = ArcSwap::new(C::cache_value_owned(db));
      l_values
        .entry(l_key.clone())
        .or_insert_with(BTreeMap::new)
        .insert(r_key.clone(), cache_value.clone());
      r_values
        .entry(r_key)
        .or_insert_with(BTreeMap::new)
        .insert(l_key, cache_value);
    }
    for (l_key, r_values) in l_values {
      l_cache.insert(l_key, Arc::new(r_values));
    }
    for (r_key, l_values) in r_values {
      r_cache.insert(r_key, Arc::new(l_values));
    }
    Ok(Self { l_cache, r_cache, db })
  }
  // TODO: maybe return an error instead of an option if we are always calling ?.ok_or...
  pub async fn get_l(&self, l_key: &C::LKey) -> Result<Option<LCacheValue<C>>> {
    if let Some(l_value) = self.try_get_l(l_key) {
      return Ok(Some(l_value));
    }
    let mut conn = self.db.acquire().await?;
    let db_values = C::l_load_one(l_key, &mut conn).await?;
    if db_values.is_empty() {
      return Ok(None);
    }
    let mut l_value = BTreeMap::new();
    for db in db_values {
      let r_key = C::rkey(&db);
      let r_entry = self.r_cache.get(&r_key);
      let r_value = if let Some(r_value) = r_entry.as_ref().and_then(|r| r.get(l_key)) {
        let owned = C::cache_value_owned(db);
        if r_value.get().as_ref() != &owned {
          r_value.set(owned);
        }
        r_value.clone()
      } else {
        ArcSwap::new(C::cache_value_owned(db))
      };
      l_value.insert(r_key, r_value);
    }
    let value = Arc::new(l_value);
    self.l_cache.insert(l_key.clone(), value.clone());
    Ok(Some(value))
  }
  pub async fn get_r(&self, r_key: &C::RKey) -> Result<Option<RCacheValue<C>>> {
    if let Some(r_value) = self.try_get_r(r_key) {
      return Ok(Some(r_value));
    }
    let mut conn = self.db.acquire().await?;
    let db_values = C::r_load_one(r_key, &mut conn).await?;
    let mut r_value = BTreeMap::new();
    for db in db_values {
      let l_key = C::lkey(&db);
      let l_entry = self.l_cache.get(&l_key);
      let l_value = if let Some(l_value) = l_entry.as_ref().and_then(|l| l.get(r_key)) {
        let owned = C::cache_value_owned(db);
        if l_value.get().as_ref() != &owned {
          l_value.set(owned);
        }
        l_value.clone()
      } else {
        ArcSwap::new(C::cache_value_owned(db))
      };
      r_value.insert(l_key, l_value);
    }
    let value = Arc::new(r_value);
    self.r_cache.insert(r_key.clone(), value.clone());
    Ok(Some(value))
  }
  pub fn try_get_l(&self, l_key: &C::LKey) -> Option<LCacheValue<C>> {
    self.l_cache.get(l_key)
  }
  pub fn try_get_r(&self, r_key: &C::RKey) -> Option<RCacheValue<C>> {
    self.r_cache.get(r_key)
  }
  // TODO: get_all_l and get_all_r
  // TODO: iter
  // TODO: dynamic_load_many
  pub async fn save(&self, value: C::Db, db: &mut sqlx::PgConnection) -> Result<C::Db> {
    // Save to db first as there are no errors after that
    let value = C::save(value, db).await?;
    let l_key = C::lkey(&value);
    let r_key = C::rkey(&value);
    let cache_value = C::cache_value(&value);
    let l_entry = self.get_l(&l_key).await?;
    let r_entry = self.get_r(&r_key).await?;
    let l_value = l_entry.as_ref().and_then(|l| l.get(&r_key));
    let r_value = r_entry.as_ref().and_then(|r| r.get(&l_key));
    // both exist, so just update their values and there is no need to update the cache
    if let (Some(l_value), Some(r_value)) = (l_value, r_value) {
      debug_assert!(Arc::ptr_eq(l_value.inner(), r_value.inner()));
      l_value.set(cache_value);
      return Ok(value);
    }
    let map_value = match l_value.or(r_value) {
      Some(lr_value) => {
        lr_value.set(cache_value);
        lr_value.clone()
      }
      None => ArcSwap::new(cache_value),
    };
    let l_entry = if let Some(l_entry) = l_entry.as_ref() {
      if l_value.is_none() {
        // map exists, but entry is missing
        let mut map = l_entry.as_ref().clone();
        map.insert(r_key.clone(), map_value.clone());
        Some(Arc::new(map))
      } else {
        // map exists, and entry exists so it's already been updated with set call above
        None
      }
    } else {
      // map doesn't exist, so create it
      Some(Arc::new(BTreeMap::from([(r_key.clone(), map_value.clone())])))
    };
    let r_entry = if let Some(r_entry) = r_entry.as_ref() {
      if r_value.is_none() {
        // map exists, but entry is missing
        let mut map = r_entry.as_ref().clone();
        map.insert(l_key.clone(), map_value.clone());
        Some(Arc::new(map))
      } else {
        // map exists, and entry exists so it's already been updated with set call above
        None
      }
    } else {
      // map doesn't exist, so create it
      Some(Arc::new(BTreeMap::from([(l_key.clone(), map_value)])))
    };
    if let Some(l_entry) = l_entry {
      self.l_cache.insert(l_key, l_entry);
    }
    if let Some(r_entry) = r_entry {
      self.r_cache.insert(r_key, r_entry);
    }
    Ok(value)
  }
  pub async fn delete(&self, value: C::Db, db: &mut sqlx::PgConnection) -> Result<()> {
    let l_key = C::lkey(&value);
    let r_key = C::rkey(&value);
    C::delete(value, db).await?;
    let l_entry = self.l_cache.get(&l_key);
    let r_entry = self.r_cache.get(&r_key);
    if let Some(l_entry) = l_entry
      && l_entry.contains_key(&r_key)
    {
      let mut l_value = l_entry.as_ref().clone();
      l_value.remove(&r_key);
      self.l_cache.insert(l_key.clone(), Arc::new(l_value));
    }
    if let Some(r_entry) = r_entry
      && r_entry.contains_key(&l_key)
    {
      let mut r_value = r_entry.as_ref().clone();
      r_value.remove(&l_key);
      self.r_cache.insert(r_key, Arc::new(r_value));
    }
    Ok(())
  }
}
