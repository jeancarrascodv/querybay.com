use std::time::Duration;

use jiff_sqlx::ToSqlx;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(transparent)]
pub struct TimeZone(#[serde(with = "jiff::fmt::serde::tz::required")] jiff::tz::TimeZone);

impl TimeZone {
  pub fn new(timezone: &str) -> Option<Self> {
    let tz = jiff::tz::TimeZone::get(timezone).ok()?;
    Self::new_jiff(tz)
  }
  pub fn new_jiff(tz: jiff::tz::TimeZone) -> Option<Self> {
    tz.iana_name()?;
    Some(Self(tz))
  }
  pub fn as_str(&self) -> &str {
    // iana_name should never fail, but this is a safe fallback.
    self.0.iana_name().unwrap_or("UTC")
  }
}

impl From<TimeZone> for jiff::tz::TimeZone {
  fn from(tz: TimeZone) -> Self {
    tz.0
  }
}

impl core::fmt::Display for TimeZone {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    write!(f, "{}", self.as_str())
  }
}

impl core::hash::Hash for TimeZone {
  fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
    self.0.to_datetime(jiff::Timestamp::UNIX_EPOCH).hash(state);
    self.0.iana_name().unwrap_or("unknown").hash(state);
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for TimeZone {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    <&str as sqlx::Encode<'_, sqlx::Postgres>>::encode(self.0.iana_name().unwrap(), buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for TimeZone {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    let s = <&str as sqlx::Decode<sqlx::Postgres>>::decode(value)?;
    let tz = jiff::tz::TimeZone::get(s)?;
    Ok(Self(tz))
  }
}

impl sqlx::Type<sqlx::Postgres> for TimeZone {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <String as sqlx::Type<sqlx::Postgres>>::type_info()
  }
}

gql::scalar!(TimeZone);

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
#[repr(transparent)]
pub struct Timestamp(pub(crate) jiff::Timestamp);

impl Timestamp {
  pub const MAX: Self = Self(jiff::Timestamp::MAX);
  pub fn now() -> Self {
    Self(jiff::Timestamp::now())
  }
  pub fn to_jiff(self) -> jiff::Timestamp {
    self.0
  }
  pub fn saturating_duration_since(self, other: Self) -> std::time::Duration {
    if self < other {
      std::time::Duration::ZERO
    } else {
      // Jiff docs say total can never panic when using Unit::Second
      let seconds = (self.0 - other.0).total(jiff::Unit::Second).unwrap();
      Duration::from_secs_f64(seconds)
    }
  }
}

impl From<jiff::Timestamp> for Timestamp {
  fn from(t: jiff::Timestamp) -> Self {
    Self(t)
  }
}

impl From<jiff::Zoned> for Timestamp {
  fn from(z: jiff::Zoned) -> Self {
    Self(z.timestamp())
  }
}

impl From<Timestamp> for jiff::Timestamp {
  fn from(t: Timestamp) -> Self {
    t.to_jiff()
  }
}

impl std::ops::Add<chrono::Duration> for Timestamp {
  type Output = Self;

  fn add(self, rhs: chrono::Duration) -> Self::Output {
    let seconds = rhs.num_seconds();
    let nanos = rhs.subsec_nanos();
    let span = jiff::Span::new().seconds(seconds).nanoseconds(nanos);
    Self(self.0 + span)
  }
}

impl std::ops::Add<std::time::Duration> for Timestamp {
  type Output = Self;

  fn add(self, rhs: std::time::Duration) -> Self::Output {
    let seconds = i64::try_from(rhs.as_secs()).unwrap();
    let nanos = rhs.subsec_nanos();
    let span = jiff::Span::new().seconds(seconds).nanoseconds(nanos);
    Self(self.0 + span)
  }
}

impl std::ops::Add<jiff::Span> for Timestamp {
  type Output = Self;

  fn add(self, rhs: jiff::Span) -> Self::Output {
    Self(self.0 + rhs)
  }
}

impl std::ops::Add<jiff::SignedDuration> for Timestamp {
  type Output = Self;

  fn add(self, rhs: jiff::SignedDuration) -> Self::Output {
    Self(self.0 + rhs)
  }
}

impl std::ops::Sub<jiff::Span> for Timestamp {
  type Output = Self;

  fn sub(self, rhs: jiff::Span) -> Self::Output {
    Self(self.0 - rhs)
  }
}

impl sqlx::encode::Encode<'_, sqlx::Postgres> for Timestamp {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    self.0.to_sqlx().encode(buf)
  }
}

impl sqlx::Type<sqlx::Postgres> for Timestamp {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    jiff_sqlx::Timestamp::type_info()
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for Timestamp {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    jiff_sqlx::Timestamp::decode(value).map(|j| Self(j.to_jiff()))
  }
}

impl sqlx::postgres::PgHasArrayType for Timestamp {
  fn array_type_info() -> sqlx::postgres::PgTypeInfo {
    jiff_sqlx::Timestamp::array_type_info()
  }
}

gql::scalar!(Timestamp);

impl core::fmt::Display for Timestamp {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    self.0.fmt(f)
  }
}

impl core::fmt::Debug for Timestamp {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    self.0.fmt(f)
  }
}

pub mod timestamp_second {
  use super::*;
  pub fn serialize<S>(value: &Timestamp, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    jiff::fmt::serde::timestamp::second::required::serialize(&value.0, serializer)
  }

  pub fn deserialize<'de, D>(deserializer: D) -> Result<Timestamp, D::Error>
  where
    D: serde::Deserializer<'de>,
  {
    let seconds = jiff::fmt::serde::timestamp::second::required::deserialize(deserializer)?;
    Ok(Timestamp(seconds))
  }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
#[serde(transparent)]
#[repr(transparent)]
pub struct Time(#[serde(deserialize_with = "deserialize_time")] pub(crate) jiff::civil::Time);

impl Time {
  pub fn end(&self) -> jiff::civil::Time {
    if self.0 == jiff::civil::Time::MIN {
      jiff::civil::Time::MAX
    } else {
      self.0
    }
  }
  pub fn start(&self) -> jiff::civil::Time {
    self.0
  }
}

fn deserialize_time<'de, D>(deserializer: D) -> Result<jiff::civil::Time, D::Error>
where
  D: serde::Deserializer<'de>,
{
  let s = <String>::deserialize(deserializer)?;
  let round = jiff::civil::TimeRound::new()
    .smallest(jiff::Unit::Minute)
    .mode(jiff::RoundMode::HalfExpand);
  s.parse::<jiff::civil::Time>()
    .map_err(serde::de::Error::custom)
    .map(|t| t.round(round).expect("rounding to a minute never fails"))
}

impl From<jiff::civil::Time> for Time {
  fn from(t: jiff::civil::Time) -> Self {
    Self(t)
  }
}
impl From<Time> for jiff::civil::Time {
  fn from(t: Time) -> Self {
    t.0
  }
}

gql::scalar!(Time);

impl sqlx::Type<sqlx::Postgres> for Time {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    jiff_sqlx::Time::type_info()
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for Time {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    jiff_sqlx::Time::decode(value).map(|j| Self(j.to_jiff()))
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for Time {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    self.0.to_sqlx().encode(buf)
  }
}

impl core::fmt::Display for Time {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    self.0.fmt(f)
  }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
#[repr(transparent)]
pub struct Date(pub(crate) jiff::civil::Date);

impl Date {
  pub fn to_jiff(self) -> jiff::civil::Date {
    self.0
  }
}

impl From<jiff::civil::Date> for Date {
  fn from(d: jiff::civil::Date) -> Self {
    Self(d)
  }
}

impl From<Date> for jiff::civil::Date {
  fn from(d: Date) -> Self {
    d.0
  }
}

gql::scalar!(Date);

impl sqlx::Type<sqlx::Postgres> for Date {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    jiff_sqlx::Date::type_info()
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for Date {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    jiff_sqlx::Date::decode(value).map(|j| Self(j.to_jiff()))
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for Date {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    self.0.to_sqlx().encode(buf)
  }
}

impl sqlx::postgres::PgHasArrayType for Date {
  fn array_type_info() -> sqlx::postgres::PgTypeInfo {
    <jiff_sqlx::Date as sqlx::postgres::PgHasArrayType>::array_type_info()
  }
}

impl core::fmt::Display for Date {
  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    self.0.fmt(f)
  }
}

#[test]
fn test_time_deserialization() {
  let time = serde_json::from_reader::<_, Time>(std::io::Cursor::new(r#""12:00:00""#)).unwrap();
  assert_eq!(time, Time(jiff::civil::Time::new(12, 0, 0, 0).unwrap()));

  let time = serde_json::from_reader::<_, Time>(std::io::Cursor::new(r#""12:34:56.789""#)).unwrap();
  assert_eq!(time, Time(jiff::civil::Time::new(12, 35, 0, 0).unwrap()));
}
