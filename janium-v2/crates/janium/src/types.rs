pub use self::arc_swap::*;
pub use self::id::*;
pub use self::jiff_types::*;
use jiff::ToSpan;
use serde::{Deserialize, Serialize};

mod arc_swap;
mod id;
mod jiff_types;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, gql::OneofObject)]
#[graphql(input_name = "SpanInput")]
pub enum Span {
  BusinessDays(u16),
  Days(u16),
  Seconds(u32),
}

impl Span {
  pub fn after(&self, event: &jiff::Zoned) -> jiff::Zoned {
    match *self {
      Self::Days(d) => event.saturating_add(jiff::Span::new().days(d)).start_of_day().unwrap(),
      Self::Seconds(s) => event.saturating_add(std::time::Duration::from_secs(s.into())),
      Self::BusinessDays(d) => event
        .datetime()
        .series(1.day())
        .filter(|d| d.weekday().to_monday_zero_offset() < 5)
        .take(1 + usize::from(d))
        .last()
        // because we take at least 1 we are guaranteed to have a value here
        .unwrap()
        .to_zoned(event.time_zone().clone())
        .unwrap()
        .start_of_day()
        .unwrap(),
    }
  }
  pub fn default_random_delay() -> Self {
    Self::Seconds(0)
  }
}

#[gql::Object]
impl Span {
  pub async fn business_days(&self) -> Option<u16> {
    match *self {
      Self::BusinessDays(d) => Some(d),
      _ => None,
    }
  }
  pub async fn seconds(&self) -> Option<u32> {
    match *self {
      Self::Seconds(s) => Some(s),
      _ => None,
    }
  }
  pub async fn days(&self) -> Option<u16> {
    match *self {
      Self::Days(d) => Some(d),
      _ => None,
    }
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for Span {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    let days = match self {
      Self::BusinessDays(d) | Self::Days(d) => i32::from(*d),
      Self::Seconds(_) => 0,
    };
    let microseconds = match self {
      Self::BusinessDays(_) => 1,
      Self::Days(_) => 0,
      Self::Seconds(s) => i64::from(*s) * 1_000_000,
    };
    let interval = sqlx::postgres::types::PgInterval {
      months: 0,
      days,
      microseconds,
    };
    interval.encode(buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for Span {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    let interval = sqlx::postgres::types::PgInterval::decode(value)?;
    if interval.months != 0 {
      return Err("Unable to decode months from interval to span".into());
    }
    let days = u16::try_from(interval.days)
      .map_err(|_| format!("Unable to decode days from interval with value {}", interval.days))?;
    let this = if days > 0 && interval.microseconds == 1 {
      Self::BusinessDays(days)
    } else if days > 0 && interval.microseconds == 0 {
      Self::Days(days)
    } else {
      let seconds = interval.microseconds / 1_000_000;
      let seconds =
        u32::try_from(seconds).map_err(|_| format!("Unable to decode seconds from interval with value {seconds}"))?;
      Self::Seconds(seconds)
    };
    Ok(this)
  }
}

impl sqlx::Type<sqlx::Postgres> for Span {
  fn type_info() -> <sqlx::Postgres as sqlx::Database>::TypeInfo {
    <sqlx::postgres::types::PgInterval>::type_info()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use rstest::rstest;

  #[rstest]
  #[case(jiff::civil::date(2026, 3, 15))] // Sunday
  #[case(jiff::civil::date(2026, 3, 16))] // Monday
  #[case(jiff::civil::date(2026, 3, 17))] // Tuesday
  #[case(jiff::civil::date(2026, 3, 18))] // Wednesday
  #[case(jiff::civil::date(2026, 3, 19))] // Thursday
  #[case(jiff::civil::date(2026, 3, 20))] // Friday
  #[case(jiff::civil::date(2026, 3, 21))] // Saturday
  fn test_span_after(#[case] date: jiff::civil::Date) {
    let tz = jiff::tz::TimeZone::get("America/Boise").unwrap();
    let now = date.to_zoned(tz).unwrap();
    let is_weekday = now.weekday().to_monday_zero_offset() < 5;

    // Days(0) and Seconds(0) always return today
    assert_eq!(now.start_of_day().unwrap(), Span::Days(0).after(&now));
    assert_eq!(now, Span::Seconds(0).after(&now));

    // BusinessDays(0) returns today on weekdays, next Monday on weekends
    let zero_business = Span::BusinessDays(0).after(&now);
    if is_weekday {
      assert_eq!(now.start_of_day().unwrap(), zero_business);
    } else {
      // On weekends, should advance to Monday
      assert!(zero_business > now);
      assert_eq!(zero_business.weekday(), jiff::civil::Weekday::Monday);
    }

    // Days(7) and Seconds(7*86400) always match
    let one_week = Span::Days(7).after(&now);
    let one_week_seconds = Span::Seconds(86400 * 7).after(&now);
    let zoned_week = now.saturating_add(std::time::Duration::from_secs(86400 * 7));
    assert_eq!(zoned_week, one_week_seconds);
    assert_eq!(zoned_week.start_of_day().unwrap(), one_week);

    // BusinessDays(5) = 5 weekdays from now (skipping weekends)
    let five_business = Span::BusinessDays(5).after(&now);
    assert!(
      five_business.weekday().to_monday_zero_offset() < 5,
      "5 business days should land on a weekday"
    );
    // On a weekday, 5 business days = 7 calendar days (same day next week)
    if is_weekday {
      assert_eq!(one_week.start_of_day().unwrap(), five_business);
    }
  }
}

#[tokio::test]
async fn test_span_encode_decode_db() {
  use clap::Parser;
  async fn check_db(span: Span, db: &sqlx::PgPool) {
    let result = sqlx::query_as::<_, (Span,)>("select $1")
      .bind(span)
      .fetch_one(db)
      .await
      .unwrap();
    dbg!((span, result.0));
    assert_eq!(span, result.0);
  }
  let db = crate::config::JaniumCli::parse_from(std::iter::empty::<String>())
    .database
    .database_pool()
    .await
    .unwrap();
  for i in 0..16 {
    check_db(Span::BusinessDays(1 << i), &db).await;
  }
  for i in 0..16 {
    check_db(Span::Days(1 << i), &db).await;
  }
  for i in 0..32 {
    check_db(Span::Seconds(1 << i), &db).await;
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
#[repr(transparent)]
pub struct ExtraData {
  pub data: std::collections::BTreeMap<compact_str::CompactString, serde_json::Value>,
}

gql::scalar!(ExtraData);

impl sqlx::Encode<'_, sqlx::Postgres> for ExtraData {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    let json = sqlx::types::Json(crate::types::IdReverser(self));
    json.encode_by_ref(buf)
  }
}
impl sqlx::Decode<'_, sqlx::Postgres> for ExtraData {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    sqlx::types::Json::<crate::types::IdReverser<ExtraData>>::decode(value).map(|j| j.0.0)
  }
}
impl sqlx::Type<sqlx::Postgres> for ExtraData {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    <sqlx::types::Json<crate::types::IdReverser<ExtraData>> as sqlx::Type<sqlx::Postgres>>::type_info()
  }
  fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
    <sqlx::types::Json<crate::types::IdReverser<ExtraData>> as sqlx::Type<sqlx::Postgres>>::compatible(ty)
  }
}

#[test]
fn test_no_ormlite_json_annotations() {
  use std::fs;
  use std::path::PathBuf;

  let crate_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let src_dir = crate_root.join("src");

  let mut violations = Vec::new();

  fn scan_directory(
    dir: &std::path::Path,
    crate_root: &std::path::Path,
    violations: &mut Vec<(PathBuf, usize, String)>,
  ) {
    if let Ok(entries) = fs::read_dir(dir) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
          scan_directory(&path, crate_root, violations);
        } else if path.extension().and_then(|s| s.to_str()) == Some("rs")
          && let Ok(content) = fs::read_to_string(&path)
        {
          for (line_num, line) in content.lines().enumerate() {
            // allow this to match itself
            if line.contains("ormlite") && line.contains("json") {
              let relative_path = path.strip_prefix(crate_root).unwrap_or(&path);
              violations.push((relative_path.to_path_buf(), line_num + 1, line.to_string()));
            }
          }
        }
      }
    }
  }

  scan_directory(&src_dir, &crate_root, &mut violations);

  let this_file = file!();
  dbg!(&this_file);
  dbg!(&violations);
  assert!(!violations.is_empty());
  violations.retain(|(path, _, _)| !this_file.ends_with(path.to_string_lossy().as_ref()));

  if !violations.is_empty() {
    let mut error_msg = String::from(
      "Found #[ormlite(json)] annotations. These should be replaced with custom sqlx trait implementations.\n",
    );
    error_msg.push_str(
      "See CampaignStepData for an example of how to implement sqlx::Type, sqlx::Encode, and sqlx::Decode.\n",
    );
    error_msg.push_str("The sqlx implementations should use IdReverser to ensure IDs are properly reversed.\n\n");
    error_msg.push_str("Violations found:\n");

    for (path, line_num, line_content) in violations {
      error_msg.push_str(&format!("  {}:{}: {}\n", path.display(), line_num, line_content));
    }

    panic!("{}", error_msg);
  }
}
