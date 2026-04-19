use crate::prelude::*;
use crate::types::Time;
use jiff::ToSpan;
use jiff::civil::Weekday;
use rand::{RngExt, rng};

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "DailyRestrictionInput")]
pub struct DailyRestriction {
  start_time: Time,
  end_time: Time,
}

impl Default for DailyRestriction {
  fn default() -> Self {
    Self {
      start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
      end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
    }
  }
}

impl DailyRestriction {
  /// Creates a new DailyRestriction with the given start and end times
  pub fn new(start_time: Time, end_time: Time) -> Self {
    Self { start_time, end_time }
  }

  pub fn active_seconds(&self) -> i64 {
    self.end().duration_since(jiff::civil::Time::midnight()).as_secs()
      - self.start().duration_since(jiff::civil::Time::midnight()).as_secs()
  }

  /// Returns true if the given time-of-day falls within this restriction window
  pub fn contains_time(&self, time: jiff::civil::Time) -> bool {
    time >= self.start() && time <= self.end()
  }

  /// Returns the start time of this restriction
  pub fn start(&self) -> jiff::civil::Time {
    self.start_time.0
  }

  /// Returns the end time of this restriction
  pub fn end(&self) -> jiff::civil::Time {
    if self.end_time.0 == jiff::civil::Time::MIN {
      jiff::civil::Time::MAX
    } else {
      self.end_time.0
    }
  }

  /// Returns the intersection of two restrictions, or None if they don't overlap
  pub fn intersect(&self, other: &DailyRestriction) -> Option<DailyRestriction> {
    let start = self.start().max(other.start());
    let end = self.end().min(other.end());
    if start < end {
      Some(DailyRestriction::new(start.into(), end.into()))
    } else {
      None
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "WeeklyRestrictionsInput")]
pub struct WeeklyRestrictions {
  sunday: Option<DailyRestriction>,
  monday: Option<DailyRestriction>,
  tuesday: Option<DailyRestriction>,
  wednesday: Option<DailyRestriction>,
  thursday: Option<DailyRestriction>,
  friday: Option<DailyRestriction>,
  saturday: Option<DailyRestriction>,
}

impl Default for WeeklyRestrictions {
  fn default() -> Self {
    Self {
      sunday: None,
      monday: Some(DailyRestriction::default()),
      tuesday: Some(DailyRestriction::default()),
      wednesday: Some(DailyRestriction::default()),
      thursday: Some(DailyRestriction::default()),
      friday: Some(DailyRestriction::default()),
      saturday: None,
    }
  }
}

impl sqlx::Encode<'_, sqlx::Postgres> for WeeklyRestrictions {
  fn encode_by_ref(
    &self,
    buf: &mut <sqlx::Postgres as sqlx::Database>::ArgumentBuffer<'_>,
  ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
    let json = sqlx::types::Json(self);
    json.encode_by_ref(buf)
  }
}

impl sqlx::Decode<'_, sqlx::Postgres> for WeeklyRestrictions {
  fn decode(value: <sqlx::Postgres as sqlx::Database>::ValueRef<'_>) -> Result<Self, sqlx::error::BoxDynError> {
    sqlx::types::Json::<WeeklyRestrictions>::decode(value).map(|j| j.0)
  }
}

impl sqlx::Type<sqlx::Postgres> for WeeklyRestrictions {
  fn type_info() -> sqlx::postgres::PgTypeInfo {
    sqlx::types::Json::<WeeklyRestrictions>::type_info()
  }
}

impl WeeklyRestrictions {
  pub fn validate(&self) -> Result<()> {
    let mut weekday = Weekday::Sunday;
    for _ in 0..7 {
      let restriction = self.restriction(weekday);
      if let Some(restriction) = restriction
        && restriction.active_seconds() <= 0
      {
        return Err(JaniumError::ext_msg(format!(
          "Restriction for {weekday:?} has no active time. start: {}, end: {}",
          restriction.start(),
          restriction.end()
        )));
      }
      weekday = weekday.next();
    }
    Ok(())
  }
  /// Returns the intersection of two WeeklyRestrictions.
  /// For each day, if both have a restriction, returns their intersection.
  /// If either has None for a day, that day is None in the result.
  pub fn intersect(&self, other: &WeeklyRestrictions) -> WeeklyRestrictions {
    fn intersect_day(a: &Option<DailyRestriction>, b: &Option<DailyRestriction>) -> Option<DailyRestriction> {
      match (a, b) {
        (Some(a), Some(b)) => a.intersect(b),
        _ => None,
      }
    }

    WeeklyRestrictions {
      sunday: intersect_day(&self.sunday, &other.sunday),
      monday: intersect_day(&self.monday, &other.monday),
      tuesday: intersect_day(&self.tuesday, &other.tuesday),
      wednesday: intersect_day(&self.wednesday, &other.wednesday),
      thursday: intersect_day(&self.thursday, &other.thursday),
      friday: intersect_day(&self.friday, &other.friday),
      saturday: intersect_day(&self.saturday, &other.saturday),
    }
  }

  /// Creates a WeeklyRestrictions with only the specified weekday set
  pub fn from_daily(weekday: Weekday, restriction: DailyRestriction) -> Self {
    let mut weekly = Self {
      sunday: None,
      monday: None,
      tuesday: None,
      wednesday: None,
      thursday: None,
      friday: None,
      saturday: None,
    };
    match weekday {
      Weekday::Sunday => weekly.sunday = Some(restriction),
      Weekday::Monday => weekly.monday = Some(restriction),
      Weekday::Tuesday => weekly.tuesday = Some(restriction),
      Weekday::Wednesday => weekly.wednesday = Some(restriction),
      Weekday::Thursday => weekly.thursday = Some(restriction),
      Weekday::Friday => weekly.friday = Some(restriction),
      Weekday::Saturday => weekly.saturday = Some(restriction),
    }
    weekly
  }

  pub fn choose_window_with_span_in_restriction(&self, zoned: &jiff::Zoned, span: jiff::Span) -> Option<(Time, Time)> {
    let weekday = zoned.weekday();
    let restriction = self.restriction(weekday)?;
    let start = restriction
      .start()
      .duration_since(jiff::civil::Time::midnight())
      .as_secs();
    let end = restriction
      .end()
      .duration_since(jiff::civil::Time::midnight())
      .round(
        jiff::SignedDurationRound::new()
          .smallest(jiff::Unit::Minute)
          .mode(jiff::RoundMode::HalfExpand),
      )
      .unwrap()
      .as_secs();
    let span_seconds = span.total(jiff::Unit::Second).unwrap().round() as i64;
    if span_seconds < 0 {
      return None;
    }
    assert!(start >= 0);
    assert!(end >= 0);
    if start > end {
      return None;
    }
    // span_seconds is positive and end - start is also positive
    let span_seconds = span_seconds.min(end - start);
    let start_random = rng().random_range(start..=(end - span_seconds));
    let start_time = jiff::civil::Time::midnight() + start_random.seconds();
    let end_time = start_time + span_seconds.seconds();
    Some((start_time.into(), end_time.into()))
  }
  pub fn restriction(&self, weekday: Weekday) -> Option<&DailyRestriction> {
    let restriction = match weekday {
      Weekday::Monday => &self.monday,
      Weekday::Tuesday => &self.tuesday,
      Weekday::Wednesday => &self.wednesday,
      Weekday::Thursday => &self.thursday,
      Weekday::Friday => &self.friday,
      Weekday::Saturday => &self.saturday,
      Weekday::Sunday => &self.sunday,
    };
    restriction.as_ref()
  }
  pub fn active_seconds(&self) -> i64 {
    let mut active_seconds = 0;
    let mut add_seconds = |restriction: &Option<DailyRestriction>| {
      active_seconds += restriction.as_ref().map_or(0, |r| r.active_seconds());
    };
    add_seconds(&self.sunday);
    add_seconds(&self.monday);
    add_seconds(&self.tuesday);
    add_seconds(&self.wednesday);
    add_seconds(&self.thursday);
    add_seconds(&self.friday);
    add_seconds(&self.saturday);
    active_seconds
  }
  pub fn active_days(&self) -> u8 {
    let mut active_days = 0;
    let mut add_day = |restriction: &Option<DailyRestriction>| {
      active_days += restriction.is_some() as u8;
    };
    add_day(&self.sunday);
    add_day(&self.monday);
    add_day(&self.tuesday);
    add_day(&self.wednesday);
    add_day(&self.thursday);
    add_day(&self.friday);
    add_day(&self.saturday);
    active_days
  }
  const WEEK_DAYS: [Weekday; 7] = {
    use Weekday::*;
    [Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday]
  };

  /// Active seconds from the given weekday through Saturday (end of week).
  pub fn remaining_active_seconds(&self, weekday: Weekday) -> i64 {
    Self::WEEK_DAYS
      .iter()
      .skip_while(|d| **d != weekday)
      .filter_map(|d| self.restriction(*d))
      .map(|r| r.active_seconds())
      .sum()
  }

  pub fn restriction_for(&self, zoned: &jiff::Zoned) -> Option<&DailyRestriction> {
    let weekday = zoned.weekday();
    self.restriction(weekday)
  }

  /// Returns true if messaging is allowed at the given zoned datetime.
  /// Returns false if there is no restriction for that day (day is blocked).
  pub fn is_allowed(&self, zoned: &jiff::Zoned) -> bool {
    self
      .restriction_for(zoned)
      .map(|r| r.contains_time(zoned.time()))
      .unwrap_or(false)
  }

  /// Returns the next timestamp when messaging will be allowed.
  /// Searches up to 7 days ahead. Returns None if no time is available.
  pub fn next_allowed_time(&self, zoned: &jiff::Zoned) -> Option<jiff::Zoned> {
    let tz = zoned.time_zone().clone();

    // Check current day first
    if let Some(restriction) = self.restriction_for(zoned) {
      if zoned.time() < restriction.start() {
        // Before today's window - return start of today's window
        let datetime = zoned.datetime().date().at(
          restriction.start().hour(),
          restriction.start().minute(),
          restriction.start().second(),
          restriction.start().subsec_nanosecond(),
        );
        return datetime.to_zoned(tz).ok();
      } else if zoned.time() <= restriction.end() {
        // Within today's window - already allowed
        return Some(zoned.clone());
      }
      // After today's window - fall through to check future days
    }

    // Search next 7 days
    for days_ahead in 1..=7 {
      let future = zoned.checked_add(days_ahead.days()).ok()?;
      if let Some(restriction) = self.restriction_for(&future) {
        let datetime = future.datetime().date().at(
          restriction.start().hour(),
          restriction.start().minute(),
          restriction.start().second(),
          restriction.start().subsec_nanosecond(),
        );
        return datetime.to_zoned(tz.clone()).ok();
      }
    }

    None // No available time in next 7 days
  }
  pub fn always_allowed() -> Self {
    let restriction = DailyRestriction::new(
      jiff::civil::Time::midnight().into(),
      jiff::civil::Time::midnight().into(),
    );
    Self {
      sunday: Some(restriction.clone()),
      monday: Some(restriction.clone()),
      tuesday: Some(restriction.clone()),
      wednesday: Some(restriction.clone()),
      thursday: Some(restriction.clone()),
      friday: Some(restriction.clone()),
      saturday: Some(restriction),
    }
  }
}

// #[derive(Clone)]
// pub struct RestrictionSender {
//   sender: tokio::sync::mpsc::UnboundedSender<TimestampPermissionLease>,
// }

// impl std::fmt::Debug for RestrictionSender {
//   fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
//     write!(f, "RestrictionSender")
//   }
// }

// pub fn get_new_restriction_sender() -> RestrictionSender {
//   let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
//   tracing::trace!("Spawning run restriction timer");
//   tokio::spawn(run_restriction_timer(receiver));
//   RestrictionSender { sender }
// }

// async fn run_restriction_timer(mut receiver: tokio::sync::mpsc::UnboundedReceiver<TimestampPermissionLease>) {
//   tracing::trace!("Starting run restriction timer");
//   let mut shutdown_guard = crate::config::ShutdownGuard::<TimestampRestrictionEnforcer>::new();
//   let mut waiters = futures::stream::FuturesUnordered::new();
//   let wait_for_shutdown = shutdown_guard.wait_for_shutdown();
//   tokio::pin!(wait_for_shutdown);

//   loop {
//     tracing::trace!("Running another iteration of restriction timer");
//     tokio::time::sleep(std::time::Duration::from_millis(10)).await;
//     let x = tokio::select! {
//       _ = &mut wait_for_shutdown => {
//         tracing::debug!("Shutting down restriction timer");
//         break;
//       }
//       lease = receiver.recv() => {
//         let Some(lease) = lease else {
//           break;
//         };
//         waiters.push(lease.wait_for_timeout());
//         "receiver.recv"
//       }
//       n = waiters.next(), if !waiters.is_empty() => {
//         n.unwrap();
//         "waiters.next"
//       }
//     };
//     tracing::trace!(x, "Finished running another iteration of restriction timer");
//   }
// }

// pub struct TimestampRestrictionEnforcer {
//   recent_events: lease::Pool<Timestamp>,
//   limit: usize,
//   lookback_seconds: u32,
//   restriction_sender: RestrictionSender,
// }

// impl TimestampRestrictionEnforcer {
//   pub fn new(limit: usize, lookback_seconds: u32, restriction_sender: RestrictionSender) -> Self {
//     Self {
//       recent_events: lease::Pool::new(),
//       limit,
//       lookback_seconds,
//       restriction_sender,
//     }
//   }
//   pub fn set_limit(&mut self, limit: usize) {
//     self.limit = limit;
//   }
//   pub fn set_lookback_seconds(&mut self, lookback_seconds: u32) {
//     self.lookback_seconds = lookback_seconds;
//   }
//   pub fn permission_lease(&self) -> Option<TimestampPermissionLease> {
//     let lease = self
//       .recent_events
//       .try_get_or_new_with_cap(self.limit, || Timestamp::MIN)?;
//     Some(TimestampPermissionLease {
//       lease: std::mem::ManuallyDrop::new(lease),
//       drop_lease_on_drop: false,
//       lookback_seconds: self.lookback_seconds,
//       restriction_sender: self.restriction_sender.clone(),
//     })
//   }
//   pub async fn async_permission_lease(&self) -> TimestampPermissionLease {
//     let lease = self
//       .recent_events
//       .get_or_new_with_cap(self.limit, || async { Timestamp::MIN })
//       .await;
//     TimestampPermissionLease {
//       lease: std::mem::ManuallyDrop::new(lease),
//       drop_lease_on_drop: false,
//       lookback_seconds: self.lookback_seconds,
//       restriction_sender: self.restriction_sender.clone(),
//     }
//   }
// }

// /// Waits for lookback seconds after being dropped before returning the lease
// #[derive(Debug)]
// pub struct TimestampPermissionLease {
//   lease: std::mem::ManuallyDrop<lease::Lease<Timestamp>>,
//   drop_lease_on_drop: bool,
//   lookback_seconds: u32,
//   restriction_sender: RestrictionSender,
// }

// impl TimestampPermissionLease {
//   /// Consumes this permission lease and waits until the proper amount of time has elapsed
//   /// before release it's lease so that another event can happen.
//   pub fn consume(mut self, timestamp: Timestamp) {
//     **self.lease = timestamp;
//     self.drop_lease_on_drop = true;
//     self.restriction_sender.clone().sender.send(self).ok();
//   }
//   /// Drops this permission lease as unused so that another event can happen immediately
//   pub fn consume_unused(mut self) {
//     self.drop_lease_on_drop = true;
//   }
//   async fn wait_for_timeout(self) {
//     let start_time = **self.lease;
//     let end_time = start_time + jiff::Span::new().seconds(self.lookback_seconds);
//     let span = end_time - Timestamp::now();
//     tracing::trace!("waiting for lease {start_time} to end at {end_time}");

//     let seconds = span.total(jiff::Unit::Second).unwrap();
//     if seconds.is_sign_negative() || !seconds.is_finite() {
//       return;
//     }
//     tokio::time::sleep(std::time::Duration::from_secs_f64(seconds)).await;
//     tracing::trace!("finished waiting for lease {start_time} to end at {end_time}");
//     // ensure self lives until the end of the function
//     drop(self);
//   }
// }

// impl Drop for TimestampPermissionLease {
//   fn drop(&mut self) {
//     let now = Timestamp::now();
//     tracing::trace!("In drop {self:?}");
//     if self.drop_lease_on_drop {
//       tracing::trace!("Dropping lease");
//       **self.lease = Timestamp::MIN;
//       // # Safety: this is safe because we're in the drop function and it will never be read again
//       unsafe { std::mem::ManuallyDrop::drop(&mut self.lease) }
//     } else {
//       **self.lease = now;
//       tracing::trace!("Setting self.lease to now");
//       let new = Self {
//         // Safety: because this is manually dropped and we don't drop it in this branch the lease is safe to move
//         lease: unsafe { std::ptr::read(&self.lease) },
//         // This needs to be set to true otherwise drop will be called on this again and it will blow the stack
//         drop_lease_on_drop: true,
//         lookback_seconds: self.lookback_seconds,
//         restriction_sender: self.restriction_sender.clone(),
//       };
//       self
//         .restriction_sender
//         .clone()
//         .sender
//         .send(new)
//         .inspect_err(|e| tracing::error!("Unable to send lease to timer: {:?}", e.0))
//         .ok();
//     }
//   }
// }

// #[test]
// fn test_limiter() {
//   let runtime = tokio::runtime::Builder::new_multi_thread()
//     .enable_all()
//     .worker_threads(2)
//     .build()
//     .unwrap();
//   runtime.block_on(test_limiter_async());
//   println!("Finished outer");
//   runtime.shutdown_timeout(std::time::Duration::from_secs(1));
// }

// #[cfg(test)]
// async fn test_limiter_async() {
//   let restriction_sender = get_new_restriction_sender();
//   assert!(!restriction_sender.sender.is_closed());
//   let mut limiter = TimestampRestrictionEnforcer::new(1, 3, restriction_sender);
//   println!("----------------------- lease 1 ----------------------------");
//   let lease1 = limiter.permission_lease().unwrap();
//   assert!(limiter.permission_lease().is_none());
//   lease1.consume(Timestamp::now());
//   println!("----------------------- lease 2 ----------------------------");
//   let lease2 = limiter.async_permission_lease().await;
//   lease2.consume_unused();
//   println!("----------------------- lease 3 ----------------------------");
//   let lease3 = limiter.permission_lease().unwrap();
//   assert!(limiter.permission_lease().is_none());
//   lease3.consume(Timestamp::now());
//   limiter.set_limit(2);
//   println!("----------------------- lease 4 ----------------------------");
//   let lease4 = limiter.permission_lease().unwrap();
//   lease4.consume(Timestamp::now());
//   // let lease5 = limiter.async_permission_lease().await;
//   // lease5.consume_unused();
//   limiter.set_limit(1);
//   limiter.set_lookback_seconds(0);
//   for i in 0..100 {
//     println!("loop {i}");
//     let lease = limiter.async_permission_lease().await;
//     if i % 2 == 0 {
//       lease.consume_unused();
//     } else {
//       lease.consume(Timestamp::now());
//     }
//   }
// }

#[cfg(test)]
mod choose_window_tests {
  use super::*;

  fn create_monday_zoned() -> jiff::Zoned {
    // Create a Monday at noon UTC
    let tz = jiff::tz::TimeZone::get("UTC").unwrap();
    let datetime = jiff::civil::DateTime::new(2024, 1, 1, 12, 0, 0, 0).unwrap(); // This is a Monday
    datetime.to_zoned(tz).unwrap()
  }

  fn create_tuesday_zoned() -> jiff::Zoned {
    // Create a Tuesday at noon UTC
    let tz = jiff::tz::TimeZone::get("UTC").unwrap();
    let datetime = jiff::civil::DateTime::new(2024, 1, 2, 12, 0, 0, 0).unwrap(); // This is a Tuesday
    datetime.to_zoned(tz).unwrap()
  }

  fn create_sunday_zoned() -> jiff::Zoned {
    // Create a Sunday at noon UTC
    let tz = jiff::tz::TimeZone::get("UTC").unwrap();
    let datetime = jiff::civil::DateTime::new(2023, 12, 31, 12, 0, 0, 0).unwrap(); // This is a Sunday
    datetime.to_zoned(tz).unwrap()
  }

  #[test]
  fn test_basic_functionality() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().seconds(3600); // 1 hour

      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
      assert!(result.is_some());

      let (start_time, end_time) = result.unwrap();
      let start_seconds = start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let end_seconds = end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();

      // Start time should be between 9:00 and 16:00 (17:00 - 1 hour)
      assert!(start_seconds >= 9 * 3600);
      assert!(start_seconds <= 16 * 3600);

      // End time should be exactly 1 hour after start
      assert_eq!(end_seconds - start_seconds, 3600);

      // End time should not exceed 17:00
      assert!(end_seconds <= 17 * 3600);
    }
  }

  #[test]
  fn test_span_equals_restriction_window() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().seconds(8 * 3600); // 8 hours (exactly the window)

      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
      assert!(result.is_some());

      let (start_time, end_time) = result.unwrap();
      let start_seconds = start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let end_seconds = end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();

      // Start time should be exactly 9:00
      assert_eq!(start_seconds, 9 * 3600);
      // End time should be exactly 17:00
      assert_eq!(end_seconds, 17 * 3600);
    }
  }

  #[test]
  fn test_span_larger_than_restriction_window() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().seconds(10 * 3600); // 10 hours (larger than 8 hour window)

      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
      assert!(result.is_some());

      let (start_time, end_time) = result.unwrap();
      let start_seconds = start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let end_seconds = end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();

      // Span should be clamped to 8 hours (17:00 - 9:00)
      assert_eq!(end_seconds - start_seconds, 8 * 3600);
      // Start should be 9:00
      assert_eq!(start_seconds, 9 * 3600);
      // End should be 17:00
      assert_eq!(end_seconds, 17 * 3600);
    }
  }

  #[test]
  fn test_no_restriction_for_weekday() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction::default()),
        sunday: None, // No restriction for Sunday
        ..Default::default()
      };

      let zoned = create_sunday_zoned();
      let span = jiff::Span::new().seconds(3600);

      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
      assert!(result.is_none());
    }
  }

  #[test]
  fn test_negative_span() {
    for i in 1..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().seconds(-i); // Negative span

      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
      assert!(result.is_none());
    }
  }

  #[test]
  fn test_zero_span() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().seconds(0); // Zero span

      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
      assert!(result.is_some());

      let (start_time, end_time) = result.unwrap();
      let start_seconds = start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let end_seconds = end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();

      // Start and end should be the same
      assert_eq!(start_seconds, end_seconds);
      // Should be within the restriction window
      assert!(start_seconds >= 9 * 3600);
      assert!(start_seconds <= 17 * 3600);
    }
  }

  #[test]
  fn test_small_span() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().seconds(60); // 1 minute

      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
      assert!(result.is_some());

      let (start_time, end_time) = result.unwrap();
      let start_seconds = start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let end_seconds = end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();

      // Span should be exactly 60 seconds
      assert_eq!(end_seconds - start_seconds, 60);
      // Both should be within the restriction window
      assert!(start_seconds >= 9 * 3600);
      assert!(end_seconds <= 17 * 3600);
    }
  }

  #[test]
  fn test_multiple_calls_return_different_times() {
    for _ in 0..1000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().seconds(3600); // 1 hour

      let mut results = Vec::new();
      for _ in 0..100 {
        let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
        assert!(result.is_some());
        results.push(result.unwrap().0);
      }

      // Check that we got some variation (not all the same)
      let first = results[0];
      let all_same = results.iter().all(|&time| time == first);
      // It's theoretically possible but extremely unlikely all 100 calls return the same time
      // given the random selection, so we assert they're not all the same
      assert!(
        !all_same,
        "All 100 calls returned the same time, which is extremely unlikely"
      );
    }
  }

  #[test]
  fn test_different_weekdays() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(12, 0, 0, 0).unwrap().into(),
        }),
        tuesday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(13, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(18, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let monday_zoned = create_monday_zoned();
      let tuesday_zoned = create_tuesday_zoned();
      let span = jiff::Span::new().seconds(3600); // 1 hour

      let monday_result = restrictions.choose_window_with_span_in_restriction(&monday_zoned, span);
      let tuesday_result = restrictions.choose_window_with_span_in_restriction(&tuesday_zoned, span);

      assert!(monday_result.is_some());
      assert!(tuesday_result.is_some());

      let (monday_start, monday_end) = monday_result.unwrap();
      let (tuesday_start, tuesday_end) = tuesday_result.unwrap();

      let monday_start_secs = monday_start.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let monday_end_secs = monday_end.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let tuesday_start_secs = tuesday_start.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let tuesday_end_secs = tuesday_end.0.duration_since(jiff::civil::Time::midnight()).as_secs();

      // Monday should be in 9:00-12:00 range
      assert!(monday_start_secs >= 9 * 3600);
      assert!(monday_end_secs <= 12 * 3600);

      // Tuesday should be in 13:00-18:00 range
      assert!(tuesday_start_secs >= 13 * 3600);
      assert!(tuesday_end_secs <= 18 * 3600);
    }
  }

  #[test]
  fn test_window_always_within_restriction() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().seconds(3600); // 1 hour

      // Run many times to ensure consistency
      for _ in 0..1000 {
        let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
        assert!(result.is_some());

        let (start_time, end_time) = result.unwrap();
        let start_seconds = start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
        let end_seconds = end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();

        // Start must be >= restriction start
        assert!(start_seconds >= 9 * 3600, "Start time {} is before 9:00", start_seconds);
        // End must be <= restriction end
        assert!(end_seconds <= 17 * 3600, "End time {} is after 17:00", end_seconds);
        // End must be exactly span after start
        assert_eq!(end_seconds - start_seconds, 3600, "Span is not exactly 1 hour");
      }
    }
  }

  #[test]
  fn test_narrow_restriction_window() {
    for _ in 0..10000 {
      let restrictions = WeeklyRestrictions {
        monday: Some(DailyRestriction {
          start_time: jiff::civil::Time::new(10, 0, 0, 0).unwrap().into(),
          end_time: jiff::civil::Time::new(10, 30, 0, 0).unwrap().into(), // Only 30 minutes
        }),
        ..Default::default()
      };

      let zoned = create_monday_zoned();
      let span = jiff::Span::new().minutes(15);

      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);
      assert!(result.is_some());

      let (start_time, end_time) = result.unwrap();
      let start_seconds = start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
      let end_seconds = end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();

      // Start should be between 10:00 and 10:15 (10:30 - 15 minutes)
      assert!(start_seconds >= 10 * 3600);
      assert!(start_seconds <= 10 * 3600 + 15 * 60);
      // End should be exactly 15 minutes after start
      assert_eq!(end_seconds - start_seconds, 15 * 60);
      // End should not exceed 10:30
      assert!(end_seconds <= 10 * 3600 + 30 * 60);
    }
  }

  #[test]
  fn proptest_choose_window_with_span_in_restriction() {
    use proptest::prelude::*;

    // Strategy to generate a valid time (0-23 hours, 0-59 minutes)
    let time_strategy =
      (0i8..=23, 0i8..=59).prop_map(|(hour, minute)| jiff::civil::Time::new(hour, minute, 0, 0).unwrap());

    // Strategy to generate a DailyRestriction where start_time < end_time
    let daily_restriction_strategy =
      (time_strategy.clone(), time_strategy).prop_filter_map("start_time must be before end_time", |(start, end)| {
        let start_secs = start.duration_since(jiff::civil::Time::midnight()).as_secs();
        let end_secs = end.duration_since(jiff::civil::Time::midnight()).as_secs();
        if start_secs < end_secs && start_secs > 0 && end_secs > 0 {
          Some(DailyRestriction {
            start_time: start.into(),
            end_time: end.into(),
          })
        } else {
          None
        }
      });

    // Strategy to generate WeeklyRestrictions with random restrictions for each day
    let weekly_restrictions_strategy = prop::collection::vec((0u8..=6, daily_restriction_strategy.clone()), 0..=7)
      .prop_map(|restrictions| {
        let mut weekly = WeeklyRestrictions::default();
        for (day, restriction) in restrictions {
          match day % 7 {
            0 => weekly.sunday = Some(restriction),
            1 => weekly.monday = Some(restriction),
            2 => weekly.tuesday = Some(restriction),
            3 => weekly.wednesday = Some(restriction),
            4 => weekly.thursday = Some(restriction),
            5 => weekly.friday = Some(restriction),
            6 => weekly.saturday = Some(restriction),
            _ => unreachable!(),
          }
        }
        weekly
      });

    // Strategy to generate a valid date and time for jiff::Zoned
    let zoned_strategy =
      (2020i16..=2100, 1i8..=12, 1i8..=28, 0i8..=23, 0i8..=59).prop_map(|(year, month, day, hour, minute)| {
        let tz = jiff::tz::TimeZone::get("UTC").unwrap();
        jiff::civil::DateTime::new(year, month, day, hour, minute, 0, 0)
          .unwrap()
          .to_zoned(tz)
          .unwrap()
      });

    // Strategy to generate a span (can be positive, zero, or negative)
    let span_strategy = (-86400i64..=86400).prop_map(|seconds| jiff::Span::new().seconds(seconds));

    proptest!(|(
      restrictions in weekly_restrictions_strategy,
      zoned in zoned_strategy,
      span in span_strategy,
    )| {
      let result = restrictions.choose_window_with_span_in_restriction(&zoned, span);

      let weekday = zoned.weekday();
      let restriction_opt = restrictions.restriction(weekday);

      match (result, restriction_opt) {
        (None, None) => {
          // Expected: no restriction for this weekday
        }
        (None, Some(_)) => {
          // Should only happen if span is negative or invalid
          let span_seconds = span.total(jiff::Unit::Second).unwrap().round() as i64;
          prop_assert!(span_seconds < 0, "Should return None only for negative spans");
        }
        (Some((start_time, end_time)), Some(restriction)) => {
          // Verify the result is valid
          let start_seconds = start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
          let end_seconds = end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
          let restriction_start = restriction.start_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();
          let restriction_end = restriction.end_time.0.duration_since(jiff::civil::Time::midnight()).as_secs();

          let span_seconds = span.total(jiff::Unit::Second).unwrap().round() as i64;
          let expected_span = if span_seconds < 0 {
            return Ok(());
          } else {
            span_seconds.min(restriction_end - restriction_start)
          };

          // Property 1: Start time must be >= restriction start
          prop_assert!(
            start_seconds >= restriction_start,
            "Start time {} must be >= restriction start {}",
            start_seconds,
            restriction_start
          );

          // Property 2: End time must be <= restriction end
          prop_assert!(
            end_seconds <= restriction_end,
            "End time {} must be <= restriction end {}",
            end_seconds,
            restriction_end
          );

          // Property 3: The span between start and end must match the expected span
          prop_assert_eq!(
            end_seconds - start_seconds,
            expected_span,
            "Span {} must match expected span {}",
            end_seconds - start_seconds,
            expected_span
          );

          // Property 4: Start time must allow the span to fit
          prop_assert!(
            start_seconds <= restriction_end - expected_span,
            "Start time {} must allow span {} to fit within restriction end {}",
            start_seconds,
            expected_span,
            restriction_end
          );
        }
        (Some(_), None) => {
          // This should never happen - if there's no restriction, result should be None
          prop_assert!(false, "Got Some result but no restriction for weekday {:?}", weekday);
        }
      }
    });
  }
}

#[cfg(test)]
mod is_allowed_tests {
  use super::*;
  use rstest::rstest;

  fn create_zoned(year: i16, month: i8, day: i8, hour: i8, minute: i8) -> jiff::Zoned {
    let tz = jiff::tz::TimeZone::get("UTC").unwrap();
    let datetime = jiff::civil::DateTime::new(year, month, day, hour, minute, 0, 0).unwrap();
    datetime.to_zoned(tz).unwrap()
  }

  fn monday_restriction() -> WeeklyRestrictions {
    WeeklyRestrictions {
      monday: Some(DailyRestriction {
        start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
        end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
      }),
      ..Default::default()
    }
  }

  #[rstest]
  #[case::within_window(2024, 1, 1, 12, 0, true)] // Monday 12:00 - in window
  #[case::at_start_boundary(2024, 1, 1, 9, 0, true)] // Monday 09:00 - at start
  #[case::at_end_boundary(2024, 1, 1, 17, 0, true)] // Monday 17:00 - at end
  #[case::before_window(2024, 1, 1, 8, 0, false)] // Monday 08:00 - before
  #[case::after_window(2024, 1, 1, 18, 0, false)] // Monday 18:00 - after
  #[case::sunday_no_restriction(2023, 12, 31, 12, 0, false)] // Sunday - no restriction
  fn test_is_allowed(
    #[case] year: i16,
    #[case] month: i8,
    #[case] day: i8,
    #[case] hour: i8,
    #[case] minute: i8,
    #[case] expected: bool,
  ) {
    let restrictions = monday_restriction();
    let zoned = create_zoned(year, month, day, hour, minute);
    assert_eq!(restrictions.is_allowed(&zoned), expected);
  }

  #[test]
  fn test_is_allowed_all_days_none() {
    let restrictions = WeeklyRestrictions {
      sunday: None,
      monday: None,
      tuesday: None,
      wednesday: None,
      thursday: None,
      friday: None,
      saturday: None,
    };

    let zoned = create_zoned(2024, 1, 1, 12, 0);
    assert!(!restrictions.is_allowed(&zoned));
  }

  #[rstest]
  #[case::overlap(9, 17, 10, 16, Some((10, 16)))] // 9-17 ∩ 10-16 = 10-16
  #[case::exact_same(9, 17, 9, 17, Some((9, 17)))] // Same windows
  #[case::first_contains_second(8, 18, 10, 16, Some((10, 16)))] // First contains second
  #[case::second_contains_first(10, 16, 8, 18, Some((10, 16)))] // Second contains first
  #[case::partial_overlap_start(9, 14, 12, 17, Some((12, 14)))] // Partial overlap
  #[case::partial_overlap_end(12, 17, 9, 14, Some((12, 14)))] // Partial overlap
  #[case::no_overlap(9, 12, 14, 17, None)] // No overlap
  #[case::adjacent(9, 12, 12, 17, None)] // Adjacent (end == start, no overlap)
  fn test_daily_restriction_intersect(
    #[case] start1: i8,
    #[case] end1: i8,
    #[case] start2: i8,
    #[case] end2: i8,
    #[case] expected: Option<(i8, i8)>,
  ) {
    let r1 = DailyRestriction::new(
      jiff::civil::Time::new(start1, 0, 0, 0).unwrap().into(),
      jiff::civil::Time::new(end1, 0, 0, 0).unwrap().into(),
    );
    let r2 = DailyRestriction::new(
      jiff::civil::Time::new(start2, 0, 0, 0).unwrap().into(),
      jiff::civil::Time::new(end2, 0, 0, 0).unwrap().into(),
    );

    let result = r1.intersect(&r2);

    match expected {
      Some((exp_start, exp_end)) => {
        let intersection = result.expect("Expected Some");
        assert_eq!(intersection.start().hour(), exp_start);
        assert_eq!(intersection.end().hour(), exp_end);
      }
      None => assert!(result.is_none()),
    }
  }

  #[test]
  fn proptest_is_allowed() {
    use proptest::prelude::*;

    // Strategy to generate a valid time (0-23 hours, 0-59 minutes)
    let time_strategy =
      (0i8..=23, 0i8..=59).prop_map(|(hour, minute)| jiff::civil::Time::new(hour, minute, 0, 0).unwrap());

    // Strategy to generate a DailyRestriction where start_time < end_time
    let daily_restriction_strategy =
      (time_strategy.clone(), time_strategy).prop_filter_map("start_time must be before end_time", |(start, end)| {
        let start_secs = start.duration_since(jiff::civil::Time::midnight()).as_secs();
        let end_secs = end.duration_since(jiff::civil::Time::midnight()).as_secs();
        if start_secs < end_secs && start_secs > 0 && end_secs > 0 {
          Some(DailyRestriction {
            start_time: start.into(),
            end_time: end.into(),
          })
        } else {
          None
        }
      });

    // Strategy to generate WeeklyRestrictions with random restrictions for each day
    let weekly_restrictions_strategy = prop::collection::vec((0u8..=6, daily_restriction_strategy.clone()), 0..=7)
      .prop_map(|restrictions| {
        let mut weekly = WeeklyRestrictions {
          sunday: None,
          monday: None,
          tuesday: None,
          wednesday: None,
          thursday: None,
          friday: None,
          saturday: None,
        };
        for (day, restriction) in restrictions {
          match day % 7 {
            0 => weekly.sunday = Some(restriction),
            1 => weekly.monday = Some(restriction),
            2 => weekly.tuesday = Some(restriction),
            3 => weekly.wednesday = Some(restriction),
            4 => weekly.thursday = Some(restriction),
            5 => weekly.friday = Some(restriction),
            6 => weekly.saturday = Some(restriction),
            _ => unreachable!(),
          }
        }
        weekly
      });

    // Strategy to generate a valid date and time for jiff::Zoned
    let zoned_strategy =
      (2020i16..=2100, 1i8..=12, 1i8..=28, 0i8..=23, 0i8..=59).prop_map(|(year, month, day, hour, minute)| {
        let tz = jiff::tz::TimeZone::get("UTC").unwrap();
        jiff::civil::DateTime::new(year, month, day, hour, minute, 0, 0)
          .unwrap()
          .to_zoned(tz)
          .unwrap()
      });

    proptest!(|(
      restrictions in weekly_restrictions_strategy,
      zoned in zoned_strategy,
    )| {
      let result = restrictions.is_allowed(&zoned);
      let weekday = zoned.weekday();
      let restriction_opt = restrictions.restriction(weekday);

      match restriction_opt {
        None => {
          // No restriction for this day means not allowed
          prop_assert!(!result, "Expected false when no restriction for weekday {:?}", weekday);
        }
        Some(restriction) => {
          let time = zoned.time();
          let in_window = time >= restriction.start() && time <= restriction.end();
          prop_assert_eq!(
            result, in_window,
            "is_allowed mismatch: time={:?}, start={:?}, end={:?}",
            time, restriction.start(), restriction.end()
          );
        }
      }
    });
  }
}

#[cfg(test)]
mod next_allowed_time_tests {
  use super::*;
  use rstest::rstest;

  fn create_zoned(year: i16, month: i8, day: i8, hour: i8, minute: i8) -> jiff::Zoned {
    let tz = jiff::tz::TimeZone::get("UTC").unwrap();
    let datetime = jiff::civil::DateTime::new(year, month, day, hour, minute, 0, 0).unwrap();
    datetime.to_zoned(tz).unwrap()
  }

  #[rstest]
  #[case::already_in_window(2024, 1, 1, 12, 0, Some((12, 0, Weekday::Monday)))] // Mon 12:00 -> same
  #[case::before_todays_window(2024, 1, 1, 7, 0, Some((9, 0, Weekday::Monday)))] // Mon 07:00 -> Mon 09:00
  fn test_next_allowed_same_day(
    #[case] year: i16,
    #[case] month: i8,
    #[case] day: i8,
    #[case] hour: i8,
    #[case] minute: i8,
    #[case] expected: Option<(i8, i8, Weekday)>,
  ) {
    let restrictions = WeeklyRestrictions {
      monday: Some(DailyRestriction {
        start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
        end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
      }),
      ..Default::default()
    };

    let zoned = create_zoned(year, month, day, hour, minute);
    let result = restrictions.next_allowed_time(&zoned);

    match expected {
      Some((exp_hour, exp_minute, exp_weekday)) => {
        let next = result.expect("Expected Some");
        assert_eq!(next.hour(), exp_hour);
        assert_eq!(next.minute(), exp_minute);
        assert_eq!(next.weekday(), exp_weekday);
      }
      None => assert!(result.is_none()),
    }
  }

  #[test]
  fn test_next_allowed_after_todays_window() {
    let restrictions = WeeklyRestrictions {
      monday: Some(DailyRestriction {
        start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
        end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
      }),
      tuesday: Some(DailyRestriction {
        start_time: jiff::civil::Time::new(10, 0, 0, 0).unwrap().into(),
        end_time: jiff::civil::Time::new(16, 0, 0, 0).unwrap().into(),
      }),
      ..Default::default()
    };

    // Monday at 18:00 - should return Tuesday 10:00
    let zoned = create_zoned(2024, 1, 1, 18, 0);
    let next = restrictions.next_allowed_time(&zoned).expect("Expected Some");
    assert_eq!(next.hour(), 10);
    assert_eq!(next.weekday(), Weekday::Tuesday);
  }

  #[test]
  fn test_next_allowed_no_restriction_today_finds_next_day() {
    let restrictions = WeeklyRestrictions {
      sunday: None,
      monday: Some(DailyRestriction {
        start_time: jiff::civil::Time::new(9, 0, 0, 0).unwrap().into(),
        end_time: jiff::civil::Time::new(17, 0, 0, 0).unwrap().into(),
      }),
      ..Default::default()
    };

    // Sunday at 12:00 - should return Monday 9:00
    let zoned = create_zoned(2023, 12, 31, 12, 0);
    let next = restrictions.next_allowed_time(&zoned).expect("Expected Some");
    assert_eq!(next.hour(), 9);
    assert_eq!(next.weekday(), Weekday::Monday);
  }

  #[rstest]
  #[case::skip_to_wednesday(
    WeeklyRestrictions {
      sunday: None, monday: None, tuesday: None,
      wednesday: Some(DailyRestriction {
        start_time: jiff::civil::Time::new(14, 0, 0, 0).unwrap().into(),
        end_time: jiff::civil::Time::new(18, 0, 0, 0).unwrap().into(),
      }),
      thursday: None, friday: None, saturday: None,
    },
    2023, 12, 31, 12, 0, // Sunday
    14, Weekday::Wednesday
  )]
  #[case::wrap_around_to_sunday(
    WeeklyRestrictions {
      sunday: Some(DailyRestriction {
        start_time: jiff::civil::Time::new(10, 0, 0, 0).unwrap().into(),
        end_time: jiff::civil::Time::new(14, 0, 0, 0).unwrap().into(),
      }),
      monday: None, tuesday: None, wednesday: None,
      thursday: None, friday: None, saturday: None,
    },
    2024, 1, 1, 12, 0, // Monday
    10, Weekday::Sunday
  )]
  fn test_next_allowed_skips_days(
    #[case] restrictions: WeeklyRestrictions,
    #[case] year: i16,
    #[case] month: i8,
    #[case] day: i8,
    #[case] hour: i8,
    #[case] minute: i8,
    #[case] expected_hour: i8,
    #[case] expected_weekday: Weekday,
  ) {
    let zoned = create_zoned(year, month, day, hour, minute);
    let next = restrictions.next_allowed_time(&zoned).expect("Expected Some");
    assert_eq!(next.hour(), expected_hour);
    assert_eq!(next.weekday(), expected_weekday);
  }

  #[test]
  fn test_next_allowed_all_days_none_returns_none() {
    let restrictions = WeeklyRestrictions {
      sunday: None,
      monday: None,
      tuesday: None,
      wednesday: None,
      thursday: None,
      friday: None,
      saturday: None,
    };

    let zoned = create_zoned(2024, 1, 1, 12, 0);
    assert!(restrictions.next_allowed_time(&zoned).is_none());
  }

  #[test]
  fn proptest_next_allowed_time() {
    use proptest::prelude::*;

    // Strategy to generate a valid time (0-23 hours, 0-59 minutes)
    let time_strategy =
      (0i8..=23, 0i8..=59).prop_map(|(hour, minute)| jiff::civil::Time::new(hour, minute, 0, 0).unwrap());

    // Strategy to generate a DailyRestriction where start_time < end_time
    let daily_restriction_strategy =
      (time_strategy.clone(), time_strategy).prop_filter_map("start_time must be before end_time", |(start, end)| {
        let start_secs = start.duration_since(jiff::civil::Time::midnight()).as_secs();
        let end_secs = end.duration_since(jiff::civil::Time::midnight()).as_secs();
        if start_secs < end_secs && start_secs > 0 && end_secs > 0 {
          Some(DailyRestriction {
            start_time: start.into(),
            end_time: end.into(),
          })
        } else {
          None
        }
      });

    // Strategy to generate WeeklyRestrictions with random restrictions for each day
    let weekly_restrictions_strategy = prop::collection::vec((0u8..=6, daily_restriction_strategy.clone()), 0..=7)
      .prop_map(|restrictions| {
        let mut weekly = WeeklyRestrictions {
          sunday: None,
          monday: None,
          tuesday: None,
          wednesday: None,
          thursday: None,
          friday: None,
          saturday: None,
        };
        for (day, restriction) in restrictions {
          match day % 7 {
            0 => weekly.sunday = Some(restriction),
            1 => weekly.monday = Some(restriction),
            2 => weekly.tuesday = Some(restriction),
            3 => weekly.wednesday = Some(restriction),
            4 => weekly.thursday = Some(restriction),
            5 => weekly.friday = Some(restriction),
            6 => weekly.saturday = Some(restriction),
            _ => unreachable!(),
          }
        }
        weekly
      });

    // Strategy to generate a valid date and time for jiff::Zoned
    let zoned_strategy =
      (2020i16..=2100, 1i8..=12, 1i8..=28, 0i8..=23, 0i8..=59).prop_map(|(year, month, day, hour, minute)| {
        let tz = jiff::tz::TimeZone::get("UTC").unwrap();
        jiff::civil::DateTime::new(year, month, day, hour, minute, 0, 0)
          .unwrap()
          .to_zoned(tz)
          .unwrap()
      });

    proptest!(|(
      restrictions in weekly_restrictions_strategy,
      zoned in zoned_strategy,
    )| {
      let result = restrictions.next_allowed_time(&zoned);
      let is_currently_allowed = restrictions.is_allowed(&zoned);
      let has_any_restriction = restrictions.active_days() > 0;

      // Property 1: If currently allowed, next_allowed_time should return the same time
      if is_currently_allowed {
        prop_assert!(result.is_some(), "Expected Some when currently allowed");
        prop_assert_eq!(
          result.as_ref().unwrap().timestamp(),
          zoned.timestamp(),
          "When allowed, should return same timestamp"
        );
      }

      // Property 2: If no restrictions at all, should return None
      if !has_any_restriction {
        prop_assert!(result.is_none(), "Expected None when no restrictions defined");
      }

      // Property 3: If result is Some, it should be allowed at that time
      if let Some(ref next) = result {
        prop_assert!(
          restrictions.is_allowed(next),
          "next_allowed_time result should be allowed: {:?}",
          next
        );
      }

      // Property 4: Result timestamp should be >= input timestamp
      if let Some(ref next) = result {
        prop_assert!(
          next.timestamp() >= zoned.timestamp(),
          "next_allowed_time should not go backwards: next={:?}, input={:?}",
          next.timestamp(),
          zoned.timestamp()
        );
      }

      // Property 5: Result should be within 7 days (our search limit)
      if let Some(ref next) = result {
        let days_diff = (next.timestamp().as_second() - zoned.timestamp().as_second()) / 86400;
        prop_assert!(
          days_diff <= 7,
          "next_allowed_time should be within 7 days: {} days ahead",
          days_diff
        );
      }
    });
  }
}
