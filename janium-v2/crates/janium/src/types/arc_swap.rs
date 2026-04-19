use serde::{Deserialize, Serialize};
use std::{ops::Deref, sync::Arc};

pub struct ArcSwap<T>(pub Arc<arc_swap::ArcSwap<T>>);

impl<T> ArcSwap<T> {
  pub fn new(value: T) -> Self {
    Self(Arc::new(arc_swap::ArcSwap::from_pointee(value)))
  }
  pub fn get(&self) -> impl Deref<Target = Arc<T>> {
    self.0.load()
  }
  pub fn set(&self, value: T) {
    self.0.store(Arc::new(value));
  }
  pub fn inner(&self) -> &Arc<arc_swap::ArcSwap<T>> {
    &self.0
  }
}

impl<T> Clone for ArcSwap<T> {
  fn clone(&self) -> Self {
    Self(self.0.clone())
  }
}

impl<T: core::hash::Hash> core::hash::Hash for ArcSwap<T> {
  fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
    self.get().as_ref().hash(state);
  }
}

impl<T: core::fmt::Debug> core::fmt::Debug for ArcSwap<T> {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    self.get().as_ref().fmt(f)
  }
}

impl<T: sqlx::Type<sqlx::Postgres>> sqlx::Type<sqlx::Postgres> for ArcSwap<T> {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    T::type_info()
  }
}

impl<'r, T: sqlx::Encode<'r, sqlx::Postgres>> sqlx::Encode<'r, sqlx::Postgres> for ArcSwap<T> {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'r>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    self.get().as_ref().encode_by_ref(buf)
  }
}

impl<'r, T: sqlx::Decode<'r, sqlx::Postgres>> sqlx::Decode<'r, sqlx::Postgres> for ArcSwap<T> {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
    T::decode(value).map(Self::new)
  }
}

// impl<T: gql::resolver_utils::ScalarType> gql::resolver_utils::ScalarType for ArcSwap<T> {
//   fn parse(value: gql::Value) -> gql::InputValueResult<Self> {
//     T::parse(value).map(Self::new).map_err(gql::InputValueError::propagate)
//   }
//   fn to_value(&self) -> gql::Value {
//     T::to_value(self.get().as_ref())
//   }
//   fn is_valid(value: &gql::Value) -> bool {
//     T::is_valid(value)
//   }
// }

impl<T: gql::OutputType> gql::OutputType for ArcSwap<T> {
  fn type_name() -> std::borrow::Cow<'static, str> {
    T::type_name()
  }
  fn create_type_info(registry: &mut gql::registry::Registry) -> String {
    T::create_type_info(registry)
  }
  async fn resolve(
    &self,
    ctx: &gql::context::ContextSelectionSet<'_>,
    field: &gql::Positioned<gql::parser::types::Field>,
  ) -> gql::ServerResult<gql::Value> {
    T::resolve(self.get().as_ref(), ctx, field).await
  }
  fn qualified_type_name() -> String {
    T::qualified_type_name()
  }
  fn introspection_type_name(&self) -> std::borrow::Cow<'static, str> {
    T::introspection_type_name(self.get().as_ref())
  }
}

impl<T: gql::InputType> gql::InputType for ArcSwap<T> {
  type RawValueType = T::RawValueType;
  fn type_name() -> std::borrow::Cow<'static, str> {
    T::type_name()
  }
  fn create_type_info(registry: &mut gql::registry::Registry) -> String {
    T::create_type_info(registry)
  }
  fn parse(value: Option<gql::Value>) -> gql::InputValueResult<Self> {
    T::parse(value).map(Self::new).map_err(gql::InputValueError::propagate)
  }
  fn to_value(&self) -> gql::Value {
    T::to_value(self.get().as_ref())
  }
  fn as_raw_value(&self) -> Option<&Self::RawValueType> {
    None
  }
  fn qualified_type_name() -> String {
    T::qualified_type_name()
  }
}

impl<T: Serialize> Serialize for ArcSwap<T> {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    self.get().as_ref().serialize(serializer)
  }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for ArcSwap<T> {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    T::deserialize(deserializer).map(Self::new)
  }
}
