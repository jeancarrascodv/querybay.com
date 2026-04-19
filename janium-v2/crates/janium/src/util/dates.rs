use jiff::ToSpan;

pub fn start_of_week_at_sunday(now: &jiff::Zoned) -> jiff::Zoned {
  let days_from_sunday = now.weekday().since(jiff::civil::Weekday::Sunday);
  now.saturating_sub(days_from_sunday.days()).start_of_day().unwrap()
}

#[expect(dead_code)]
pub fn start_of_tomorrow(now: &jiff::Zoned) -> jiff::Zoned {
  now.saturating_add(1.day()).start_of_day().unwrap()
}
