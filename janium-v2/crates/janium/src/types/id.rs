use crate::JaniumError;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use uuid::Uuid;

thread_local! {
  static REVERSE_IDS: RefCell<bool> = const { RefCell::new(false) };
}

fn should_reverse_ids() -> bool {
  REVERSE_IDS.try_with(|cell| *cell.borrow()).unwrap_or(false)
}

pub fn set_reverse_ids(reverse: bool) {
  REVERSE_IDS.with(|cell| *cell.borrow_mut() = reverse);
}

#[repr(transparent)]
pub struct Id<T> {
  id: Uuid,
  _marker: std::marker::PhantomData<fn() -> T>,
}

impl<T> Id<T> {
  const fn new_inner(id: Uuid) -> Self {
    Self {
      id,
      _marker: std::marker::PhantomData,
    }
  }
  pub fn new() -> Self {
    Self::new_inner(Uuid::now_v7()).reverse()
  }
  pub fn nil() -> Self {
    Self::new_inner(Uuid::nil())
  }
  // Used on creation, then reversed for db
  #[inline(always)]
  pub fn reverse(self) -> Self {
    Self::new_inner(uuid_shuffler::shuffle(self.id))
  }
  fn maybe_reverse(self) -> Self {
    if should_reverse_ids() { self.reverse() } else { self }
  }
  pub fn convert<U>(self) -> Id<U> {
    Id::<U>::new_inner(self.id)
  }
  // Don't reverse here as it's already in display format
  pub fn parse_from_str(s: &str) -> Option<Self> {
    s.parse::<Uuid>().ok().map(Self::new_inner)
  }
}

impl<T> Copy for Id<T> {}

impl<T> Clone for Id<T> {
  fn clone(&self) -> Self {
    *self
  }
}

impl<T> PartialEq for Id<T> {
  fn eq(&self, other: &Self) -> bool {
    self.id == other.id
  }
}

impl<T> Eq for Id<T> {}

impl<T> PartialOrd for Id<T> {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

impl<T> Ord for Id<T> {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    self.id.cmp(&other.id)
  }
}

impl<T> core::hash::Hash for Id<T> {
  fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
    self.id.hash(state);
  }
}

impl<T> core::fmt::Debug for Id<T> {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    self.id.fmt(f)
  }
}

impl<T> core::fmt::Display for Id<T> {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    self.id.fmt(f)
  }
}

impl<T> Default for Id<T> {
  fn default() -> Self {
    Self::new_inner(Uuid::default())
  }
}

impl<T> core::str::FromStr for Id<T> {
  type Err = JaniumError;
  #[track_caller]
  fn from_str(s: &str) -> Result<Self, Self::Err> {
    Uuid::from_str(s)
      .map(Self::new_inner)
      .map_err(|e| JaniumError::ext_msg(e.to_string()))
  }
}

impl<T> sqlx::Type<sqlx::Postgres> for Id<T> {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    Uuid::type_info()
  }
}

impl<T> sqlx::Encode<'_, sqlx::Postgres> for Id<T> {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    self.reverse().id.encode_by_ref(buf)
  }
}

impl<T> sqlx::Decode<'_, sqlx::Postgres> for Id<T> {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    Uuid::decode(value).map(Self::new_inner).map(Self::reverse)
  }
}

impl<T> sqlx::postgres::PgHasArrayType for Id<T> {
  fn array_type_info() -> sqlx::postgres::PgTypeInfo {
    Uuid::array_type_info()
  }
}

/// A sorted, deduplicated set of `Id<T>` that serializes as a Postgres UUID array.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdSet<T>(pub std::collections::BTreeSet<Id<T>>);

impl<T> Default for IdSet<T> {
  fn default() -> Self {
    Self(std::collections::BTreeSet::new())
  }
}

impl<T> std::ops::Deref for IdSet<T> {
  type Target = std::collections::BTreeSet<Id<T>>;
  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

impl<T> std::ops::DerefMut for IdSet<T> {
  fn deref_mut(&mut self) -> &mut Self::Target {
    &mut self.0
  }
}

impl<T> From<Vec<Id<T>>> for IdSet<T> {
  fn from(vec: Vec<Id<T>>) -> Self {
    Self(vec.into_iter().collect())
  }
}

impl<T> FromIterator<Id<T>> for IdSet<T> {
  fn from_iter<I: IntoIterator<Item = Id<T>>>(iter: I) -> Self {
    Self(iter.into_iter().collect())
  }
}

impl<'a, T> IntoIterator for &'a IdSet<T> {
  type Item = &'a Id<T>;
  type IntoIter = std::collections::btree_set::Iter<'a, Id<T>>;
  fn into_iter(self) -> Self::IntoIter {
    self.0.iter()
  }
}

impl<T> Serialize for IdSet<T> {
  fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
    let vec: Vec<Id<T>> = self.0.iter().copied().collect();
    vec.serialize(serializer)
  }
}

impl<'de, T> Deserialize<'de> for IdSet<T> {
  fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
    let vec = Vec::<Id<T>>::deserialize(deserializer)?;
    Ok(Self(vec.into_iter().collect()))
  }
}

impl<T: 'static> sqlx::Type<sqlx::Postgres> for IdSet<T> {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <Vec<Id<T>> as sqlx::Type<sqlx::Postgres>>::type_info()
  }
  fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
    <Vec<Id<T>> as sqlx::Type<sqlx::Postgres>>::compatible(ty)
  }
}

impl<T: 'static> sqlx::Encode<'_, sqlx::Postgres> for IdSet<T> {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    let vec: Vec<Id<T>> = self.0.iter().copied().collect();
    vec.encode_by_ref(buf)
  }
}

impl<T: 'static> sqlx::Decode<'_, sqlx::Postgres> for IdSet<T> {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    let vec = <Vec<Id<T>> as sqlx::Decode<'_, sqlx::Postgres>>::decode(value)?;
    Ok(Self(vec.into_iter().collect()))
  }
}

impl<T> gql::InputType for Id<T> {
  type RawValueType = Uuid;
  fn type_name() -> std::borrow::Cow<'static, str> {
    Uuid::type_name()
  }
  fn create_type_info(registry: &mut gql::registry::Registry) -> String {
    Uuid::create_type_info(registry)
  }
  fn parse(value: Option<gql::Value>) -> gql::InputValueResult<Self> {
    Uuid::parse(value)
      .map(Self::new_inner)
      .map_err(gql::InputValueError::propagate)
  }
  fn to_value(&self) -> gql::Value {
    self.id.to_value()
  }
  fn as_raw_value(&self) -> Option<&Self::RawValueType> {
    Some(&self.id)
  }
  fn qualified_type_name() -> String {
    Uuid::qualified_type_name()
  }
}

impl<T> gql::ScalarType for Id<T> {
  fn parse(value: gql::Value) -> gql::InputValueResult<Self> {
    Uuid::parse(value)
      .map(Self::new_inner)
      .map_err(gql::InputValueError::propagate)
  }
  fn to_value(&self) -> gql::Value {
    self.id.to_value()
  }
}

impl<T> gql::OutputType for Id<T> {
  fn type_name() -> std::borrow::Cow<'static, str> {
    Uuid::type_name()
  }
  fn create_type_info(registry: &mut gql::registry::Registry) -> String {
    Uuid::create_type_info(registry)
  }
  async fn resolve(
    &self,
    ctx: &gql::context::ContextSelectionSet<'_>,
    field: &gql::Positioned<gql::parser::types::Field>,
  ) -> gql::ServerResult<gql::Value> {
    self.id.resolve(ctx, field).await
  }
  fn introspection_type_name(&self) -> std::borrow::Cow<'static, str> {
    self.id.introspection_type_name()
  }
  fn qualified_type_name() -> String {
    Uuid::qualified_type_name()
  }
}

// Cannot have sqlx in the name of the function otherwise it will match the tests below
fn assert_not_called_from_s_q_l_x_if_not_reversed() {
  #[cfg(debug_assertions)]
  {
    if should_reverse_ids() {
      return;
    }
    let mut called_from_sqlx = false;
    backtrace::trace(|frame| {
      backtrace::resolve_frame(frame, |symbol| {
        if let Some(filename) = symbol.filename() {
          let path_str = filename.to_string_lossy();
          if path_str.contains("sqlx") {
            called_from_sqlx = true;
          }
        }
        if let Some(name) = symbol.name() {
          let name_str = name.to_string();
          if name_str.contains("sqlx") {
            called_from_sqlx = true;
          }
        }
      });
      !called_from_sqlx // Continue tracing if we haven't found sqlx yet
    });

    if called_from_sqlx && !should_reverse_ids() {
      panic!(
        "Id::serialize was called from sqlx code but the reverse flag is not set. \
           This will cause incorrect ID values in the database. \
           Ensure IdReverser is used or set_reverse_ids(true) is called before serialization."
      );
    }
  }
}

impl<T> Serialize for Id<T> {
  #[inline(never)]
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    assert_not_called_from_s_q_l_x_if_not_reversed();
    self.maybe_reverse().id.serialize(serializer)
  }
}

impl<'de, T> Deserialize<'de> for Id<T> {
  #[inline(never)]
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    assert_not_called_from_s_q_l_x_if_not_reversed();
    Uuid::deserialize(deserializer)
      .map(Self::new_inner)
      .map(Self::maybe_reverse)
  }
}

pub struct ShortId<T> {
  id: Id<T>,
}

impl<T> ShortId<T> {
  pub fn new(id: Id<T>) -> Self {
    Self { id }
  }
}

impl<T> core::fmt::Display for ShortId<T> {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    for u in &self.id.id.as_bytes()[..4] {
      f.write_fmt(format_args!("{:02x}", u))?;
    }
    Ok(())
  }
}

pub struct IdReverser<T>(pub T);

impl<T: Serialize> Serialize for IdReverser<T> {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    let is_reverse = should_reverse_ids();
    set_reverse_ids(true);
    let result = self.0.serialize(serializer);
    set_reverse_ids(is_reverse);
    result
  }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for IdReverser<T> {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    let is_reverse = should_reverse_ids();
    set_reverse_ids(true);
    let result = T::deserialize(deserializer).map(Self);
    set_reverse_ids(is_reverse);
    result
  }
}

#[test]
fn test_id_swap() {
  for _ in 0..1000000 {
    let id = Id::<()>::new();
    let reversed = id.reverse();
    assert_eq!(reversed.reverse(), id);
  }
}

#[test]
fn test_short_id() {
  for _ in 0..10000 {
    let id = Id::<()>::new();
    let short_id = ShortId::new(id);
    assert_eq!(&short_id.to_string(), &id.to_string()[..8]);
  }
}
