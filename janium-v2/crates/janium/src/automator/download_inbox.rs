use super::{Automator, Result, utils::Delay};
use crate::JaniumError;
use crate::models::contact::{Contact, ContactDb};
use crate::models::linkedin::messages::LinkedInMessage;
use crate::prelude::*;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use thirtyfour::By;

// ---------------------------------------------------------------------------
// LinkedIn timestamp parsing helpers
// ---------------------------------------------------------------------------

/// Parse a LinkedIn day divider string into a `jiff::civil::Date`.
///
/// Recognized formats (all-caps from LinkedIn DOM):
/// - "TODAY"
/// - "YESTERDAY"
/// - Weekday names: "MONDAY" .. "SUNDAY" (always 1-6 days ago)
/// - Abbreviated month + day + year: "FEB 17, 2024"
/// - Abbreviated month + day: "FEB 17", "JAN 5" (current year)
///
/// Uses the team timezone (matching the container timezone that LinkedIn sees)
/// to determine what "today" is.
fn parse_day_divider(text: &str, tz: &jiff::tz::TimeZone) -> Option<jiff::civil::Date> {
  let today = jiff::Zoned::now().with_time_zone(tz.clone()).date();
  parse_day_divider_with_today(text, today)
}

fn parse_day_divider_with_today(text: &str, today: jiff::civil::Date) -> Option<jiff::civil::Date> {
  let text = text.trim();

  if text.eq_ignore_ascii_case("today") {
    return Some(today);
  }
  if text.eq_ignore_ascii_case("yesterday") {
    return today.checked_sub(1.days()).ok();
  }

  // Weekday name → always within the last 1-6 days (LinkedIn never shows
  // the current weekday; it uses "Today" instead, and 7+ days back switches
  // to "Feb. 17" format).
  let weekday = match text.to_ascii_lowercase().as_str() {
    "monday" => Some(jiff::civil::Weekday::Monday),
    "tuesday" => Some(jiff::civil::Weekday::Tuesday),
    "wednesday" => Some(jiff::civil::Weekday::Wednesday),
    "thursday" => Some(jiff::civil::Weekday::Thursday),
    "friday" => Some(jiff::civil::Weekday::Friday),
    "saturday" => Some(jiff::civil::Weekday::Saturday),
    "sunday" => Some(jiff::civil::Weekday::Sunday),
    _ => None,
  };
  if let Some(wd) = weekday {
    let today_wd = today.weekday();
    // Days back: 1-6 (never 0 — LinkedIn uses "Today" for same-day)
    let mut days_back = (today_wd.to_monday_zero_offset() as i64 - wd.to_monday_zero_offset() as i64 + 7) % 7;
    if days_back == 0 {
      days_back = 7;
    }
    return today.checked_sub(days_back.days()).ok();
  }

  // "FEB 17, 2024" etc. — LinkedIn uses this format for dates in previous years.
  if let Ok(date) = jiff::civil::Date::strptime("%b %d, %Y", text) {
    return Some(date);
  }

  // "FEB 17", "JAN 5" etc. — LinkedIn uses abbreviated month + day for current year.
  // Date::strptime requires a year, so we use BrokenDownTime to extract month+day
  // and supply the current year ourselves.
  if let Ok(bdt) = jiff::fmt::strtime::parse("%b %d", text)
    && let (Some(month), Some(day)) = (bdt.month(), bdt.day())
  {
    return jiff::civil::Date::new(today.year(), month, day).ok();
  }

  tracing::warn!("Unable to parse day divider: {:?}", text);
  None
}

/// Parse a LinkedIn per-message time string like "9:06 PM" or "10:44 AM".
fn parse_message_time(text: &str) -> Option<jiff::civil::Time> {
  let text = text.trim();
  // jiff's strptime: %I = 12-hour (zero-padded), %p = AM/PM
  // LinkedIn may or may not zero-pad, but %I handles both "9" and "09".
  jiff::civil::Time::strptime("%I:%M %p", text).ok().or_else(|| {
    tracing::warn!("Unable to parse message time: {:?}", text);
    None
  })
}

/// Parse a LinkedIn sent indicator title: "Sent at 2/13/2026, 9:06 PM"
/// Returns naive DateTime (no timezone info, matches LinkedIn display).
fn parse_sent_indicator(text: &str) -> Option<jiff::civil::DateTime> {
  let text = text.strip_prefix("Sent at ")?.trim();
  // Format: "M/D/YYYY, H:MM AM/PM"
  let bdt = jiff::fmt::strtime::parse("%m/%d/%Y, %I:%M %p", text).ok()?;
  let date = jiff::civil::Date::new(bdt.year()? as i16, bdt.month()?, bdt.day()?).ok()?;
  let time = jiff::civil::Time::new(bdt.hour()?, bdt.minute()?, 0, 0).ok()?;
  Some(combine_date_time(date, time))
}

/// Try to get text from an element, falling back to textContent property
/// if .text() returns empty (can happen if the element isn't fully rendered).
async fn element_text(el: &thirtyfour::WebElement) -> Option<String> {
  if let Ok(text) = el.text().await {
    let text = text.trim().to_string();
    if !text.is_empty() {
      return Some(text);
    }
  }
  // Fallback: textContent property bypasses rendering
  if let Ok(Some(text)) = el.prop("textContent").await {
    let text = text.trim().to_string();
    if !text.is_empty() {
      return Some(text);
    }
  }
  None
}

/// Combine a civil date and time into a naive DateTime (no timezone info).
/// This preserves exactly what LinkedIn displayed without timezone conversion.
fn combine_date_time(date: jiff::civil::Date, time: jiff::civil::Time) -> jiff::civil::DateTime {
  date.at(time.hour(), time.minute(), time.second(), 0)
}

/// Convert a naive DateTime to Timestamp for database storage.
/// Uses the team timezone (matching the container timezone that LinkedIn displays in).
fn naive_to_timestamp(dt: jiff::civil::DateTime, tz: jiff::tz::TimeZone) -> Timestamp {
  let ts = dt.to_zoned(tz).expect("valid datetime should convert to zoned");
  Timestamp::from(ts)
}

/// A single message scraped from a LinkedIn conversation
#[derive(Debug, Clone)]
pub struct ScrapedMessage {
  /// Hash of conversation_id + sender_profile_id + content + timestamp for deduplication
  pub hash: [u8; 32],
  /// Name of the message sender
  pub sender_name: String,
  /// LinkedIn profile ID of the sender (the ACoAA... handle from /in/{id})
  pub sender_profile_id: String,
  /// Message text content
  pub content: String,
  /// Parsed timestamp as naive DateTime (no timezone, matches LinkedIn display)
  pub timestamp: Option<jiff::civil::DateTime>,
}

impl ScrapedMessage {
  /// Create a new ScrapedMessage and compute its hash
  pub fn new(
    conversation_id: &str,
    sender_name: String,
    sender_profile_id: String,
    content: String,
    timestamp: Option<jiff::civil::DateTime>,
  ) -> Self {
    let mut this = Self {
      hash: [0; 32],
      sender_name,
      sender_profile_id,
      content,
      timestamp,
    };
    this.hash = this.compute_hash(conversation_id);
    this
  }

  /// Compute a SHA256 hash for deduplication. Includes conversation_id,
  /// sender_profile_id, content, and timestamp so that identical messages
  /// (e.g. "sure") from different senders or at different times are distinguished.
  fn compute_hash(&self, conversation_id: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(conversation_id.as_bytes());
    hasher.update(self.sender_profile_id.as_bytes());
    hasher.update(self.content.as_bytes());
    match self.timestamp {
      Some(dt) => hasher.update(dt.to_string().as_bytes()),
      None => hasher.update(b"__none__"),
    }
    hasher.finalize().into()
  }
}

/// A conversation scraped from the LinkedIn inbox
#[derive(Debug, Clone)]
pub struct ScrapedConversation {
  /// Conversation/thread ID extracted from URL (if available)
  pub conversation_id: Option<String>,
  /// Contact name for this conversation
  #[expect(dead_code)]
  pub contact_name: String,
  /// Whether this conversation was read before we clicked it
  pub is_read: bool,
  /// Messages scraped from this conversation (newest first)
  pub messages: Vec<ScrapedMessage>,
}

impl ScrapedConversation {
  pub fn new(contact_name: String, is_read: bool) -> Self {
    Self {
      conversation_id: None,
      contact_name,
      is_read,
      messages: Vec::new(),
    }
  }
}

/// Maximum conversations to process per run
const MAX_CONVERSATIONS: usize = 2500;

/// Persist scraped messages for a conversation, resolving sender contacts via cache.
///
/// Uses two-phase persistence: walks newest-first to find new messages (stopping
/// after `STOP_AFTER_KNOWN_COUNT` consecutive known hashes), then persists in
/// Stop processing a conversation after this many consecutive already-known messages
const STOP_AFTER_KNOWN_COUNT: usize = 4;

/// Stop the entire download after this many consecutive conversations with no new messages
const STOP_AFTER_KNOWN_CONVERSATIONS: usize = 4;

impl Automator {
  /// Main entry point for downloading inbox messages.
  /// Scrapes up to MAX_CONVERSATIONS conversations from the inbox.
  ///
  /// Returns a vector of scraped conversations with their messages.
  pub async fn download_inbox(&mut self, full_sync: bool) -> Result<()> {
    tracing::info!(
      "Starting inbox download (max {} conversations, full_sync={full_sync})",
      MAX_CONVERSATIONS
    );

    let result = self
      .download_inbox_inner(full_sync)
      .await
      .map(|count| tracing::info!("download_inbox completed OK — scraped {count} conversations"))
      .inspect_err(|e| tracing::error!("download_inbox hit error: {e}"));
    self.sn_id_to_contact_cache.clear();
    result
  }

  async fn download_inbox_inner(&mut self, full_sync: bool) -> Result<usize> {
    // Step 1: Navigate directly to messaging
    self.sn_id_to_contact_cache.clear();

    tracing::info!("Navigating directly to messaging page");
    self.driver.goto("https://www.linkedin.com/messaging/").await?;
    Delay::BigLoad.await;

    if !self.is_on_messaging_page().await {
      return Err(JaniumError::msg("Not on messaging page — may not be logged in"));
    }

    tracing::info!("Successfully on messaging page");
    Delay::Load.await;

    // For full sync, pre-load the entire conversation sidebar before processing
    let total_count: Option<usize> = if full_sync {
      let count = self.scroll_to_load_all_conversations(Some(MAX_CONVERSATIONS)).await?;
      Some(count as usize)
    } else {
      None
    };

    // Use account info passed from LinkedIn actor (no DB query needed)
    let linkedin_id = *self.linked_in.id();
    let team_id = self.team_id;
    let tz: jiff::tz::TimeZone = self.timezone.get().as_ref().clone().into();

    // Step 2: Process conversations
    // For full_sync, iterate in reverse (oldest first) so failures are naturally
    // resumable — the next incremental sync covers recent conversations, and the
    // next full sync quickly skips already-synced older ones via hash dedup.
    let mut scraped_conversations: Vec<(ScrapedConversation, LinkedInConversation)> = Vec::new();
    let mut conversation_index: usize = total_count.map_or(0, |c| c.saturating_sub(1));
    let mut consecutive_known_conversations: usize = 0;
    // Track how many distinct conversations each profile_id appears in,
    // so we can identify the account owner (the one appearing in every conversation).
    let mut profile_conversation_count: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    // Advance the conversation index: decrement for full_sync (reverse), increment otherwise.
    // For full_sync the macro breaks out of the loop when the index wraps past 0.
    macro_rules! advance_index {
      () => {
        if full_sync {
          match conversation_index.checked_sub(1) {
            Some(next) => conversation_index = next,
            None => break,
          }
        } else {
          conversation_index += 1;
        }
      };
    }

    while scraped_conversations.len() < MAX_CONVERSATIONS {
      // Get next unprocessed conversation
      let next = self
        .get_next_conversation(conversation_index, Some(MAX_CONVERSATIONS))
        .await;
      let Some((conversation_element, contact_name)) = (match next {
        Ok(v) => v,
        Err(e) => {
          tracing::error!("Error getting next conversation: {e}");
          break;
        }
      }) else {
        tracing::info!("No more conversations to process");
        break;
      };

      // Skip LinkedIn system/promo messages (e.g. "LinkedIn", "LinkedIn Member",
      // "LinkedIn for Sales", "LinkedIn News", "LinkedIn Jobs", etc.)
      if contact_name.starts_with("LinkedIn") {
        tracing::info!("Skipping system message from: {}", contact_name);
        advance_index!();
        continue;
      }

      tracing::info!(
        "Processing conversation {}/{}: {}",
        scraped_conversations.len() + 1,
        total_count.unwrap_or(MAX_CONVERSATIONS),
        contact_name
      );

      // Check unread status BEFORE clicking
      let is_read = !self.is_conversation_unread(&conversation_element).await;
      tracing::info!("Conversation is_read: {}", is_read);

      // Click into the conversation
      if let Err(e) = self.scroll_to_element(&conversation_element).await {
        tracing::error!("Error scrolling to conversation {contact_name}: {e}");
        advance_index!();
        continue;
      }
      if let Err(e) = self.mouse_to_click(&conversation_element).await {
        tracing::error!("Error clicking conversation {contact_name}: {e}");
        advance_index!();
        continue;
      }
      Delay::Load.await;

      // Create conversation record
      let mut conversation = ScrapedConversation::new(contact_name.clone(), is_read);

      // Get conversation ID from URL — skip if unavailable since we can't persist anything without it
      let li_conv_id = match self.get_conversation_id_from_url().await {
        Ok(Some(id)) => id,
        Ok(None) => {
          tracing::warn!("No conversation ID found for {contact_name}, skipping");
          advance_index!();
          continue;
        }
        Err(e) => {
          tracing::error!("Error getting conversation ID for {contact_name}: {e}");
          advance_index!();
          continue;
        }
      };
      conversation.conversation_id = Some(li_conv_id.clone());

      // Ensure the conversation record exists so messages can reference it via FK.
      // Participants and is_read are set properly in the post-scrape upsert below;
      // here we only need the row to exist for the FK constraint.
      let mut db_conversation = match LinkedInConversation::for_upsert(linkedin_id, team_id, &li_conv_id)
        .upsert(&self.app_state.db)
        .await
      {
        Ok(conv) => conv,
        Err(e) => {
          tracing::error!("Failed to create conversation record for {li_conv_id}: {e}");
          advance_index!();
          continue;
        }
      };

      // Get known message hashes for this conversation (for stop-when-known logic)
      let known_hashes: HashSet<[u8; 32]> = db_conversation
        .known_hashes(&self.app_state.db)
        .await
        .unwrap_or_default();
      tracing::info!("Found {} known messages for this conversation", known_hashes.len());

      // Extract all messages from this conversation
      match self.scrape_all_messages(&li_conv_id, &tz).await {
        Ok(msgs) => {
          tracing::info!("Scraped {} messages for {contact_name}", msgs.len());

          let new_count = self
            .persist_scraped_messages(&msgs, &mut db_conversation, &known_hashes)
            .await?;

          tracing::info!("Persisted {} new messages for {}", new_count, contact_name);

          if new_count == 0 {
            consecutive_known_conversations += 1;
            tracing::info!(
              "No new messages for {} (consecutive known conversations: {})",
              contact_name,
              consecutive_known_conversations
            );
          } else {
            consecutive_known_conversations = 0;
          }

          // Track distinct sender profile IDs in this conversation for owner detection.
          // Only count conversations with 2+ distinct senders (skip InMail / connection requests
          // which only show the other person's link).
          let distinct_profiles: HashSet<&str> = msgs.iter().map(|m| m.sender_profile_id.as_str()).collect();
          if distinct_profiles.len() >= 2 {
            for profile_id in distinct_profiles {
              *profile_conversation_count.entry(profile_id.to_string()).or_insert(0) += 1;
            }
          }

          conversation.messages = msgs;
        }
        Err(e) => {
          tracing::error!("Error extracting messages for {contact_name}: {e}");
        }
      }

      // Restore unread status if it was unread before
      if !is_read {
        match self.restore_message_to_unread_status().await {
          Ok(true) => tracing::info!("Restored conversation to unread"),
          Ok(false) => tracing::warn!("Could not restore to unread (button not found)"),
          Err(e) => tracing::warn!("Failed to restore to unread: {}", e),
        }
      }

      // Add to results
      scraped_conversations.push((conversation, db_conversation));
      advance_index!();

      // Stop if we've seen enough consecutive known conversations (incremental only —
      // full sync processes everything since oldest conversations are most likely known)
      if !full_sync && consecutive_known_conversations >= STOP_AFTER_KNOWN_CONVERSATIONS {
        tracing::info!(
          "Stopping: {} consecutive conversations with no new messages",
          consecutive_known_conversations
        );
        break;
      }
    }

    let conversation_count = scraped_conversations.len();
    tracing::info!("Finished processing {} conversations", conversation_count);

    // Owner detection: only run if we don't already know the owner.
    if **self.owner_contact_id.get() == Id::nil() {
      match self.detect_and_save_owner(&profile_conversation_count).await {
        Ok(Some(id)) => self.owner_contact_id.set(id),
        Ok(None) => {}
        Err(e) => tracing::warn!("Owner detection failed: {e}"),
      }
    }

    // Upsert conversation records with non-owner participants.
    let owner_id: Id<Contact> = **self.owner_contact_id.get();
    for (scraped, mut db_conv) in scraped_conversations {
      db_conv.participant_contact_ids.extend(
        scraped
          .messages
          .iter()
          .filter_map(|m| self.sn_id_to_contact_cache.get(&m.sender_profile_id).copied())
          .filter(|id| *id != owner_id),
      );
      db_conv.is_read = scraped.is_read;
      if let Err(e) = db_conv.upsert(&self.app_state.db).await {
        tracing::warn!(
          "Failed to upsert conversation record for {}: {e}",
          db_conv.linkedin_conversation_id
        );
      }
    }

    Ok(conversation_count)
  }

  /// Scrape all messages from the currently open conversation.
  /// Walks through message events top-to-bottom (oldest first), tracking the
  /// current sender via message group headers.
  async fn scrape_all_messages(&self, conversation_id: &str, tz: &jiff::tz::TimeZone) -> Result<Vec<ScrapedMessage>> {
    tracing::info!("Scraping all messages from conversation");

    // Wait for the message list to load (profile link indicates the other person's data is ready)
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
      let has_profile = self
        .driver
        .find(By::XPath(
          "//ul[contains(@class, 'msg-s-message-list-content')]//a[.//span[contains(@class, 'msg-s-message-group__profile-link')]]",
        ))
        .await
        .is_ok();

      if has_profile {
        break;
      }
      if std::time::Instant::now() >= deadline {
        tracing::warn!("Timed out waiting for conversation profile to load");
        break;
      }
      Delay::Ms(500).await;
    }

    // Scroll the message thread to the top to load all messages
    let msg_container = self
      .driver
      .find_all(By::XPath("//div[contains(@class, 'msg-s-message-list-container')]"))
      .await?;
    if let Some(container) = msg_container.first() {
      let mut last_count = 0u64;
      let mut no_change_rounds = 0;
      loop {
        // Check if we're already at the top (headline visible = beginning of conversation)
        let at_top = container
          .find(By::XPath(".//*[contains(@class, 'msg-s-message-list__top-banner')]"))
          .await
          .is_ok();
        if at_top {
          break;
        }

        // Scroll up
        self
          .driver
          .execute("arguments[0].scrollTo(0, 0);", vec![container.to_json()?])
          .await?;
        Delay::Ms(1000).await;

        let count = container
          .find_all(By::XPath(
            ".//ul[contains(@class, 'msg-s-message-list-content')]//li[contains(@class, 'msg-s-message-list__event')]",
          ))
          .await
          .map(|v| v.len() as u64)
          .unwrap_or(0);

        if count > last_count {
          last_count = count;
          no_change_rounds = 0;
        } else {
          no_change_rounds += 1;
          if no_change_rounds >= 3 {
            break;
          }
        }
      }
      tracing::info!("Scrolled message thread to top, {last_count} events loaded");
    }

    // Find all message events in the thread
    let message_events = self
      .driver
      .find_all(By::XPath(
        "//ul[contains(@class, 'msg-s-message-list-content')]//li[contains(@class, 'msg-s-message-list__event')]",
      ))
      .await?;

    if message_events.is_empty() {
      tracing::warn!("No message events found in conversation");
      return Ok(vec![]);
    }

    tracing::info!("Found {} message events", message_events.len());

    let mut messages: Vec<ScrapedMessage> = Vec::new();
    let mut current_sender_name = String::from("<unknown>");
    let mut current_sender_profile_id = String::from("<unknown>");
    let mut current_date: Option<jiff::civil::Date> = None;

    for event in &message_events {
      // Check for a day divider inside this <li>
      if let Ok(day_el) = event
        .find(By::XPath(
          ".//time[contains(@class, 'msg-s-message-list__time-heading')]",
        ))
        .await
        && let Some(day_text) = element_text(&day_el).await
        && let Some(date) = parse_day_divider(&day_text, tz)
      {
        current_date = Some(date);
      }

      // Try to find sender name and profile ID from the profile link.
      // The sender name span is wrapped in an <a> tag with href="/in/{profile_id}?..."
      if let Ok(link_el) = event
        .find(By::XPath(
          ".//a[.//span[contains(@class, 'msg-s-message-group__profile-link')]]",
        ))
        .await
      {
        // Extract profile ID from the <a> href
        if let Ok(Some(href)) = link_el.attr("href").await {
          let profile_id = self.li_profile_url_to_handle(&href);
          if !profile_id.is_empty() {
            current_sender_profile_id = profile_id;
          }
        }
        // Extract sender name from the inner span
        if let Ok(span) = link_el
          .find(By::XPath(
            ".//span[contains(@class, 'msg-s-message-group__profile-link')]",
          ))
          .await
          && let Ok(name) = span.text().await
        {
          let name = name.trim().to_string();
          if !name.is_empty() {
            current_sender_name = name;
          }
        }
      }

      // Fallback: profile picture img title attribute for sender name
      if current_sender_name == "<unknown>"
        && let Ok(img_el) = event
          .find(By::XPath(
            ".//img[contains(@class, 'msg-s-event-listitem__profile-picture')]",
          ))
          .await
        && let Ok(Some(title)) = img_el.attr("title").await
      {
        let title = title.trim().to_string();
        if !title.is_empty() {
          current_sender_name = title;
        }
      }

      // Extract per-message timestamp.
      // Primary: combine day divider date + per-message time.
      // Fallback: sent indicator title ("Sent at 2/13/2026, 9:06 PM") on sent messages.
      let timestamp: Option<jiff::civil::DateTime> = 'ts: {
        // Try the per-message time element
        if let Ok(time_el) = event
          .find(By::XPath(".//time[contains(@class, 'msg-s-message-group__timestamp')]"))
          .await
          && let Some(time_text) = element_text(&time_el).await
          && let (Some(date), Some(time)) = (current_date, parse_message_time(&time_text))
        {
          break 'ts Some(combine_date_time(date, time));
        }

        // Fallback: parse sent indicator title attribute
        if let Ok(sent_el) = event
          .find(By::XPath(
            ".//*[contains(@class, 'msg-s-event-with-indicator__sending-indicator')]",
          ))
          .await
          && let Ok(Some(title)) = sent_el.attr("title").await
          && let Some(ts) = parse_sent_indicator(&title)
        {
          break 'ts Some(ts);
        }

        None
      };

      // Extract message text content
      let content_el = event
        .find_all(By::XPath(".//div[contains(@class, 'msg-s-event__content')]//p/.."))
        .await?;

      if content_el.is_empty() {
        // Try fallback selector
        let fallback = event
          .find_all(By::XPath(".//div[contains(@class, 'msg-s-event__content')]/div/p/.."))
          .await?;

        if fallback.is_empty() {
          continue;
        }

        let text = fallback[0].text().await.unwrap_or_default().trim().to_string();
        if !text.is_empty() {
          let message = ScrapedMessage::new(
            conversation_id,
            current_sender_name.clone(),
            current_sender_profile_id.clone(),
            text,
            timestamp,
          );
          messages.push(message);
        }
        continue;
      }

      let text = content_el[0].text().await.unwrap_or_default().trim().to_string();
      if !text.is_empty() {
        let message = ScrapedMessage::new(
          conversation_id,
          current_sender_name.clone(),
          current_sender_profile_id.clone(),
          text,
          timestamp,
        );
        messages.push(message);
      }
    }

    tracing::info!("Scraped {} messages total", messages.len());
    Ok(messages)
  }

  /// Persist scraped messages for a conversation, resolving sender contacts via
  /// `sn_id_to_contact_cache`.
  ///
  /// Uses two-phase persistence: walks newest-first to find new messages (stopping
  /// after `STOP_AFTER_KNOWN_COUNT` consecutive known hashes), then persists in
  /// oldest-first DOM order so `created_at` timestamps are chronological.
  ///
  /// Updates `db_conversation.participant_contact_ids` with newly discovered non-owner senders.
  /// Returns the number of newly persisted messages.
  async fn persist_scraped_messages(
    &mut self,
    msgs: &[ScrapedMessage],
    db_conversation: &mut LinkedInConversation,
    known_hashes: &HashSet<[u8; 32]>,
  ) -> Result<usize> {
    let owner_id: Id<Contact> = **self.owner_contact_id.get();
    // Phase 1: Walk newest→oldest to collect indices of new messages,
    // stopping at the stop-after-known boundary.
    let mut new_indices: Vec<usize> = Vec::new();
    let mut consecutive_known = 0;

    for (i, msg) in msgs.iter().enumerate().rev() {
      if known_hashes.contains(&msg.hash) {
        consecutive_known += 1;
        if consecutive_known >= STOP_AFTER_KNOWN_COUNT {
          tracing::debug!("Stopping: {consecutive_known} consecutive known messages");
          break;
        }
        continue;
      }
      consecutive_known = 0;
      new_indices.push(i);
    }

    // Phase 2: Persist in DOM order (oldest-first) so created_at
    // timestamps match the chronological order seen in LinkedIn's UI.
    new_indices.sort_unstable();
    let mut new_count = 0;

    for &i in &new_indices {
      let msg = &msgs[i];
      let sender_contact_id = match self.sn_id_to_contact_cache.get(&msg.sender_profile_id) {
        Some(&id) => id,
        None => match self
          .get_or_create_contact_by_sn_id(&msg.sender_profile_id, &msg.sender_name)
          .await
        {
          Ok(id) => {
            self.sn_id_to_contact_cache.insert(msg.sender_profile_id.clone(), id);
            id
          }
          Err(e) => {
            tracing::warn!("Failed to resolve contact for {}: {}", msg.sender_name, e);
            continue;
          }
        },
      };

      if sender_contact_id != owner_id {
        db_conversation.participant_contact_ids.insert(sender_contact_id);
      }

      let db_timestamp = msg
        .timestamp
        .map(|dt| naive_to_timestamp(dt, self.timezone.get().as_ref().clone().into()));
      let db_msg = LinkedInMessage::new(
        db_conversation.id,
        sender_contact_id,
        msg.content.clone(),
        db_timestamp,
        msg.hash,
      );
      match db_msg.save(&mut *self.app_state.db.acquire().await?).await {
        Ok(_) => {
          new_count += 1;
          tracing::debug!("Saved new message from {}", msg.sender_name);
        }
        Err(e) => {
          tracing::warn!("Failed to save message: {}", e);
        }
      }
    }

    Ok(new_count)
  }

  /// Scrape the currently open conversation and persist any new messages to
  /// the database. Returns the conversation's UUID primary key (for querying
  /// messages afterward).
  ///
  /// Used by both `download_inbox` (bulk) and `send_message` (single
  /// conversation before sending).
  pub async fn scrape_and_persist_current_conversation(&mut self) -> Result<Id<LinkedInConversation>> {
    let linkedin_id = *self.linked_in.id();
    let team_id = self.team_id;
    let tz: jiff::tz::TimeZone = self.timezone.get().as_ref().clone().into();

    // Get conversation ID from URL
    let li_conv_id = self
      .get_conversation_id_from_url()
      .await?
      .ok_or_else(|| JaniumError::msg("No conversation ID found in URL"))?;

    // Ensure the conversation record exists and get existing participants
    let mut db_conversation = LinkedInConversation::for_upsert(linkedin_id, team_id, &li_conv_id)
      .upsert(&self.app_state.db)
      .await?;

    // Get known hashes for stop-when-known logic
    let known_hashes: HashSet<[u8; 32]> = db_conversation
      .known_hashes(&self.app_state.db)
      .await
      .unwrap_or_default();

    let msgs = self.scrape_all_messages(&li_conv_id, &tz).await?;
    tracing::info!("Scraped {} messages from conversation {}", msgs.len(), li_conv_id);

    let new_count = self
      .persist_scraped_messages(&msgs, &mut db_conversation, &known_hashes)
      .await?;

    tracing::info!("Persisted {} new messages for conversation {}", new_count, li_conv_id);

    // Update conversation with merged participants
    db_conversation
      .upsert(&self.app_state.db)
      .await
      .inspect_err(|e| tracing::warn!("Failed to update conversation participants: {e}"))
      .ok();

    Ok(db_conversation.id)
  }

  /// Marks the currently open conversation as read via the three-dots menu.
  /// Returns Ok(true) if successfully marked as read, Ok(false) if the button wasn't found
  /// (may already be read), or Err if the menu couldn't be opened.
  #[expect(dead_code)]
  async fn set_message_to_read_status(&mut self) -> Result<bool> {
    tracing::info!("Setting message to read status");

    let three_dots_button = self.get_three_dots_menu_button().await?;
    self.mouse_to_click(&three_dots_button).await?;
    Delay::Click.await;

    tracing::info!("Opened three dots menu");

    let mark_as_read_button = self.get_mark_as_read_button().await;

    match mark_as_read_button {
      Some(button) => {
        self.mouse_to_click(&button).await?;
        Delay::Click.await;
        tracing::info!("Message marked as read");
        Ok(true)
      }
      None => {
        tracing::warn!("Mark as read button not found, closing menu");
        // Close the menu by clicking the three dots button again
        self.mouse_to_click(&three_dots_button).await?;
        Delay::Click.await;
        Ok(false)
      }
    }
  }

  /// Restores the currently open conversation to unread status via the three-dots menu.
  /// Returns Ok(true) if successfully marked as unread, Ok(false) if the button wasn't found,
  /// or Err if the menu couldn't be opened.
  async fn restore_message_to_unread_status(&mut self) -> Result<bool> {
    tracing::info!("Restoring message to unread status");

    let three_dots_button = self.get_three_dots_menu_button().await?;
    self.mouse_to_click(&three_dots_button).await?;
    Delay::Click.await;

    tracing::info!("Opened three dots menu");

    let mark_as_unread_button = self.get_mark_as_unread_button().await;

    match mark_as_unread_button {
      Some(button) => {
        self.mouse_to_click(&button).await?;
        Delay::Click.await;
        tracing::info!("Message restored to unread");
        Ok(true)
      }
      None => {
        tracing::warn!("Mark as unread button not found, closing menu");
        // Close the menu by clicking the three dots button again
        self.mouse_to_click(&three_dots_button).await?;
        Delay::Click.await;
        Ok(false)
      }
    }
  }

  /// Find the "Unread" filter button in the messaging inbox.
  /// Returns None if not found.
  #[allow(unused)]
  async fn get_unread_filter_button(&self) -> Option<thirtyfour::WebElement> {
    // Try multiple selectors for the unread filter button
    let selectors = [
      // Button with text "Unread"
      "//button[contains(text(), 'Unread')]",
      // Button containing span with "Unread"
      "//button[.//span[contains(text(), 'Unread')]]",
      // Filter pill/chip style button
      "//div[contains(@class, 'msg-search-pill')]//button[contains(text(), 'Unread')]",
      // Aria-label based
      "//button[contains(@aria-label, 'Unread')]",
    ];

    for selector in selectors {
      if let Ok(elements) = self.driver.find_all(By::XPath(selector)).await
        && !elements.is_empty()
      {
        tracing::info!("Found unread filter button with selector: {}", selector);
        return Some(elements[0].clone());
      }
    }

    tracing::warn!("Unread filter button not found with any selector");
    None
  }

  /// Check if a filter button is currently selected/active.
  /// Looks for common "selected" class patterns.
  #[allow(unused)]
  async fn is_filter_button_selected(&self, button: &thirtyfour::WebElement) -> bool {
    if let Ok(Some(class)) = button.attr("class").await {
      // Common patterns for selected state
      if class.contains("selected") || class.contains("active") || class.contains("--on") || class.contains("pressed") {
        return true;
      }
    }

    // Also check aria-pressed or aria-selected
    if let Ok(Some(pressed)) = button.attr("aria-pressed").await
      && pressed == "true"
    {
      return true;
    }
    if let Ok(Some(selected)) = button.attr("aria-selected").await
      && selected == "true"
    {
      return true;
    }

    false
  }

  /// Click the "Unread" filter button to only show unread conversations.
  /// Returns Ok(true) if clicked, Ok(false) if already selected or not found.
  #[expect(dead_code)]
  async fn click_unread_filter(&mut self) -> Result<bool> {
    tracing::info!("Looking for Unread filter button");

    let Some(unread_button) = self.get_unread_filter_button().await else {
      tracing::warn!("Unread filter button not found");
      return Ok(false);
    };

    // Check if already selected
    if self.is_filter_button_selected(&unread_button).await {
      tracing::info!("Unread filter already selected");
      return Ok(false);
    }

    // Click to enable the filter
    tracing::info!("Clicking Unread filter button");
    self.mouse_to_click(&unread_button).await?;
    Delay::Load.await;

    tracing::info!("Unread filter enabled");
    Ok(true)
  }

  /// Look up a contact by LinkedIn profile handle, or create one if not found.
  #[expect(dead_code)]
  async fn get_or_create_contact_by_handle(&self, li_profile_handle: &str, full_name: &str) -> Result<Id<Contact>> {
    // Look up existing contact by handle
    let existing: Option<Id<Contact>> = sqlx::query_scalar("SELECT id FROM contact WHERE li_profile_url = $1")
      .bind(li_profile_handle)
      .fetch_optional(&self.app_state.db)
      .await?;

    if let Some(contact_id) = existing {
      tracing::info!("Found existing contact {} for handle {}", contact_id, li_profile_handle);
      return Ok(contact_id);
    }

    // Create new contact
    let contact = Contact {
      inner: ContactDb {
        id: Id::new(),
        full_name: Some(full_name.to_string()),
        li_profile_handle: Some(li_profile_handle.to_string()),
        ..Default::default()
      },
      emails: vec![],
      phones: vec![],
    };
    let contact_id = contact.inner.id;

    let mut conn = self.app_state.db.acquire().await?;
    self
      .app_state
      .contact_service
      .save(Default::default(), contact, &mut conn)
      .await?;

    tracing::info!("Created new contact {} for handle {}", contact_id, li_profile_handle);
    Ok(contact_id)
  }

  /// Look up a contact by Sales Navigator profile ID, or create one if not found.
  /// This is used for messaging links which contain SN IDs (`ACoAA...`), not vanity handles.
  /// Both lookup and create go through the contact service cache.
  async fn get_or_create_contact_by_sn_id(
    &self,
    li_sales_nav_profile_id: &str,
    full_name: &str,
  ) -> Result<Id<Contact>> {
    let sn_id = li_sales_nav_profile_id.to_string();
    let results = self
      .app_state
      .contact_service
      .dynamic_load_many(async |conn| Contact::load_by_sn_id(&sn_id, conn).await)
      .await?;

    if let Some(existing) = results.first() {
      let contact_id = existing.as_ref().inner.id;
      tracing::info!(
        "Found existing contact {} for SN ID {}",
        contact_id,
        li_sales_nav_profile_id
      );
      return Ok(contact_id);
    }

    let contact = Contact {
      inner: ContactDb {
        id: Id::new(),
        full_name: Some(full_name.to_string()),
        li_sales_nav_profile_id: Some(li_sales_nav_profile_id.to_string()),
        ..Default::default()
      },
      emails: vec![],
      phones: vec![],
    };
    let contact_id = contact.inner.id;

    let mut conn = self.app_state.db.acquire().await?;
    self
      .app_state
      .contact_service
      .save(Default::default(), contact, &mut conn)
      .await?;

    tracing::info!(
      "Created new contact {} for SN ID {}",
      contact_id,
      li_sales_nav_profile_id
    );
    Ok(contact_id)
  }

  /// Detect the account owner from conversation sender patterns and save the contact_id
  /// on the LinkedIn actor. Returns the owner's contact_id if successfully detected.
  async fn detect_and_save_owner(
    &mut self,
    profile_conversation_count: &std::collections::HashMap<String, usize>,
  ) -> Result<Option<Id<Contact>>> {
    if profile_conversation_count.is_empty() {
      tracing::info!("No multi-sender conversations found, skipping owner detection");
      return Ok(None);
    }

    // Find the profile ID appearing in the most multi-sender conversations
    let (candidate_sn_id, count) = profile_conversation_count
      .iter()
      .max_by_key(|(_, count)| *count)
      .map(|(id, count)| (id.clone(), *count))
      .expect("profile_conversation_count is non-empty, checked above");

    tracing::info!(
      "Owner candidate SN ID: {} (appeared in {} multi-sender conversations)",
      candidate_sn_id,
      count
    );

    // Need at least 2 conversations to be confident
    if count < 2 {
      tracing::info!("Not enough multi-sender conversations ({count}) to confidently identify owner, skipping");
      return Ok(None);
    }

    let linkedin_id = *self.linked_in.id();
    let (profile_url, full_name): (String, String) =
      sqlx::query_as("SELECT linkedin_profile_url, full_name FROM linked_in WHERE id = $1")
        .bind(linkedin_id)
        .fetch_one(&self.app_state.db)
        .await?;

    let known_handle = self.li_profile_url_to_handle(&profile_url);

    // Verify by navigating to /in/{sn_id} — if it's our profile, the URL after redirect
    // will contain our vanity handle (which matches the LinkedIn record's profile URL).
    self
      .driver
      .goto(&format!("https://www.linkedin.com/in/{candidate_sn_id}"))
      .await?;
    Delay::BigLoad.await;

    let current_url = self.driver.current_url().await?;
    let redirected_handle = self.li_profile_url_to_handle(current_url.as_str());

    if redirected_handle != known_handle {
      tracing::warn!(
        "Owner verification failed: navigated to /in/{} but landed on '{}', expected '{}'",
        candidate_sn_id,
        redirected_handle,
        known_handle
      );
      return Ok(None);
    }

    tracing::info!(
      "Verified owner SN ID: {} (redirected to {})",
      candidate_sn_id,
      known_handle
    );

    // Create/resolve the owner's contact with both handle and SN ID set,
    // so contact merging can unify with any existing record matched by either field.
    let owner_contact_id = {
      let contact = Contact {
        inner: ContactDb {
          id: Id::new(),
          full_name: Some(full_name),
          li_profile_handle: Some(known_handle),
          li_sales_nav_profile_id: Some(candidate_sn_id.clone()),
          ..Default::default()
        },
        emails: vec![],
        phones: vec![],
      };
      let mut conn = self.app_state.db.acquire().await?;
      self
        .app_state
        .contact_service
        .save(Default::default(), contact, &mut conn)
        .await?;

      // Re-fetch to get the actual ID after potential merge
      let results = self
        .app_state
        .contact_service
        .dynamic_load_many(async |conn| Contact::load_by_sn_id(&candidate_sn_id, conn).await)
        .await?;
      let saved = results
        .first()
        .ok_or_else(|| JaniumError::msg("Owner contact not found after save"))?;
      let id = saved.as_ref().inner.id;
      self.sn_id_to_contact_cache.insert(candidate_sn_id.clone(), id);
      id
    };

    // Notify the LinkedIn actor to persist the contact_id to DB.
    // The caller sets the shared ArcSwap; verify it matches inside the actor.
    let contact_id = owner_contact_id;
    self.linked_in.spawn_notify(
      async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
        if **actor.contact_id.get() != contact_id {
          tracing::warn!(
            expected = ?contact_id,
            actual = ?**actor.contact_id.get(),
            "owner_contact_id ArcSwap was not set before spawn_notify — fixing"
          );
          actor.contact_id.set(contact_id);
        }
        if let Err(e) = actor.clone().save(&mut *state.actor_state.db.acquire().await?).await {
          tracing::error!("Failed to save LinkedIn contact_id: {e}");
        } else {
          tracing::info!("Saved owner contact_id {} on LinkedIn {}", contact_id, actor.id);
        }
        Ok::<(), crate::JaniumError>(())
      },
    );

    Ok(Some(owner_contact_id))
  }
}

#[test]
#[ignore = "requires dev server DB (JANIUM_DEV_TESTS=1)"]
fn test_download_inbox() {
  use crate::prelude::*;
  use ormlite::Model;

  crate::test::app_state_test_with_db(3600, async |app_state| {
    // Pause the scheduler so it doesn't dispatch tasks during the test
    app_state
      .scheduler
      .try_send(Mutation::new(
        |_: &mut Scheduler, _: &janium_actors::Router, state: &mut crate::models::scheduler::SchedulerState| {
          state.paused = true;
        },
      ))
      .unwrap_or_else(|_| panic!("Failed to pause scheduler"))
      .await
      .unwrap();

    Delay::Ms(3000).await;

    let elaine = LinkedIn::select()
      .where_bind(
        "linkedin_profile_url = ?",
        "https://www.linkedin.com/in/elaine-schauerhamer/",
      )
      .fetch_one(&app_state.db)
      .await?;

    let handle = app_state.router.get_handle::<LinkedIn>(elaine.id_ref())?;

    let request = LinkedInActionRequest::new(
      LinkedInAction::DownloadInbox(DownloadInbox { full_sync: false }),
      elaine.team_id,
      elaine.id,
      None,
      None,
      None,
      Timestamp::now() + 1.hours(),
      None,
    );

    let request_id = request.id;

    handle
      .send(
        async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
          let sender = state.start_automated_runner(actor).await?;
          sender
            .send(crate::automator::runner::AutomatorRunnerMessage::Automate(request))
            .await
            .map_err(|_| JaniumError::msg("Error sending DownloadInbox to AutomatorRunner"))?;
          Ok::<_, JaniumError>(())
        },
      )
      .await??;

    // Poll action status until it completes (harness timeout is the safety net)
    let mut seen = false;
    loop {
      Delay::Ms(5000).await;
      let req = LinkedInActionRequest::select()
        .where_bind("id = ?", request_id)
        .fetch_optional(&app_state.db)
        .await?;
      match req {
        Some(r) => {
          seen = true;
          match r.last_attempt_status {
            LinkedInActionRequestStatus::Pending | LinkedInActionRequestStatus::InProgress => continue,
            status => {
              println!("Action completed with status: {status:?}");
              break;
            }
          }
        }
        // Not yet saved to DB by the runner
        None if !seen => continue,
        // Was in the table before but now gone — moved to history/failure table
        None => {
          println!("Action completed (moved to history)");
          break;
        }
      }
    }

    Ok::<_, JaniumError>(())
  })
  .unwrap();
}

#[cfg(test)]
mod tests {
  use super::*;
  use jiff::civil::{Date, Time, date, datetime, time};
  use proptest::prelude::*;
  use rstest::rstest;

  // -----------------------------------------------------------------------
  // parse_day_divider_with_today
  // -----------------------------------------------------------------------

  #[rstest]
  #[case("TODAY", date(2026, 3, 14), Some(date(2026, 3, 14)))]
  #[case("today", date(2026, 3, 14), Some(date(2026, 3, 14)))]
  #[case("Today", date(2026, 3, 14), Some(date(2026, 3, 14)))]
  #[case("YESTERDAY", date(2026, 3, 14), Some(date(2026, 3, 13)))]
  #[case("yesterday", date(2026, 3, 14), Some(date(2026, 3, 13)))]
  // Yesterday across month boundary
  #[case("YESTERDAY", date(2026, 3, 1), Some(date(2026, 2, 28)))]
  // Yesterday across year boundary
  #[case("YESTERDAY", date(2026, 1, 1), Some(date(2025, 12, 31)))]
  // Yesterday on leap year (March 1 → Feb 29)
  #[case("YESTERDAY", date(2024, 3, 1), Some(date(2024, 2, 29)))]
  // Yesterday on non-leap year (March 1 → Feb 28)
  #[case("YESTERDAY", date(2025, 3, 1), Some(date(2025, 2, 28)))]
  fn test_today_yesterday(#[case] input: &str, #[case] today: Date, #[case] expected: Option<Date>) {
    assert_eq!(parse_day_divider_with_today(input, today), expected);
  }

  #[rstest]
  // 2026-03-14 is a Saturday
  #[case("FRIDAY", date(2026, 3, 14), Some(date(2026, 3, 13)))] // 1 day ago
  #[case("THURSDAY", date(2026, 3, 14), Some(date(2026, 3, 12)))] // 2 days ago
  #[case("WEDNESDAY", date(2026, 3, 14), Some(date(2026, 3, 11)))]
  #[case("TUESDAY", date(2026, 3, 14), Some(date(2026, 3, 10)))]
  #[case("MONDAY", date(2026, 3, 14), Some(date(2026, 3, 9)))]
  #[case("SUNDAY", date(2026, 3, 14), Some(date(2026, 3, 8)))]
  // Same weekday as today → 7 days ago (LinkedIn uses "Today" for same-day)
  #[case("SATURDAY", date(2026, 3, 14), Some(date(2026, 3, 7)))]
  // Case insensitive
  #[case("friday", date(2026, 3, 14), Some(date(2026, 3, 13)))]
  #[case("Friday", date(2026, 3, 14), Some(date(2026, 3, 13)))]
  // 2026-03-12 is Thursday; Monday from a Thursday (3 days back)
  #[case("MONDAY", date(2026, 3, 12), Some(date(2026, 3, 9)))]
  // Weekday across month boundary: today is Monday March 2, Sunday = 1 day ago
  #[case("SUNDAY", date(2026, 3, 2), Some(date(2026, 3, 1)))]
  // Weekday across month boundary: today is Sunday March 1, Monday = 6 days ago
  #[case("MONDAY", date(2026, 3, 1), Some(date(2026, 2, 23)))]
  fn test_weekday(#[case] input: &str, #[case] today: Date, #[case] expected: Option<Date>) {
    assert_eq!(parse_day_divider_with_today(input, today), expected);
  }

  #[rstest]
  // Abbreviated month + day (current year)
  #[case("FEB 17", date(2026, 3, 14), Some(date(2026, 2, 17)))]
  #[case("JAN 5", date(2026, 3, 14), Some(date(2026, 1, 5)))]
  #[case("DEC 25", date(2026, 3, 14), Some(date(2026, 12, 25)))]
  #[case("MAR 1", date(2026, 3, 14), Some(date(2026, 3, 1)))]
  // With previous year
  #[case("FEB 17, 2024", date(2026, 3, 14), Some(date(2024, 2, 17)))]
  #[case("DEC 31, 2025", date(2026, 3, 14), Some(date(2025, 12, 31)))]
  #[case("JAN 1, 2020", date(2026, 3, 14), Some(date(2020, 1, 1)))]
  // Whitespace
  #[case("  FEB 17  ", date(2026, 3, 14), Some(date(2026, 2, 17)))]
  #[case("  FEB 17, 2024  ", date(2026, 3, 14), Some(date(2024, 2, 17)))]
  fn test_month_day(#[case] input: &str, #[case] today: Date, #[case] expected: Option<Date>) {
    assert_eq!(parse_day_divider_with_today(input, today), expected);
  }

  #[rstest]
  #[case("")]
  #[case("  ")]
  #[case("INVALID")]
  #[case("2026-03-14")]
  #[case("March 14")]
  #[case("14 MAR")]
  fn test_parse_day_divider_invalid(#[case] input: &str) {
    assert_eq!(parse_day_divider_with_today(input, date(2026, 3, 14)), None);
  }

  // -----------------------------------------------------------------------
  // parse_message_time
  // -----------------------------------------------------------------------

  #[rstest]
  #[case("9:06 PM", Some(time(21, 6, 0, 0)))]
  #[case("12:00 AM", Some(time(0, 0, 0, 0)))]
  #[case("12:00 PM", Some(time(12, 0, 0, 0)))]
  #[case("12:59 PM", Some(time(12, 59, 0, 0)))]
  #[case("1:00 AM", Some(time(1, 0, 0, 0)))]
  #[case("11:59 PM", Some(time(23, 59, 0, 0)))]
  #[case("10:44 AM", Some(time(10, 44, 0, 0)))]
  #[case("12:01 AM", Some(time(0, 1, 0, 0)))]
  #[case("1:05 PM", Some(time(13, 5, 0, 0)))]
  // Whitespace
  #[case("  9:06 PM  ", Some(time(21, 6, 0, 0)))]
  fn test_parse_message_time(#[case] input: &str, #[case] expected: Option<Time>) {
    assert_eq!(parse_message_time(input), expected);
  }

  #[rstest]
  #[case("")]
  #[case("INVALID")]
  #[case("25:00 PM")]
  #[case("9:06")]
  fn test_parse_message_time_invalid(#[case] input: &str) {
    assert_eq!(parse_message_time(input), None);
  }

  // -----------------------------------------------------------------------
  // parse_sent_indicator
  // -----------------------------------------------------------------------

  #[rstest]
  #[case(
    "Sent at 2/13/2026, 9:06 PM",
    Some(date(2026, 2, 13).at(21, 6, 0, 0))
  )]
  #[case(
    "Sent at 1/1/2025, 12:00 AM",
    Some(date(2025, 1, 1).at(0, 0, 0, 0))
  )]
  #[case(
    "Sent at 12/31/2025, 11:59 PM",
    Some(date(2025, 12, 31).at(23, 59, 0, 0))
  )]
  #[case(
    "Sent at 3/14/2026, 10:44 AM",
    Some(date(2026, 3, 14).at(10, 44, 0, 0))
  )]
  fn test_parse_sent_indicator(#[case] input: &str, #[case] expected: Option<jiff::civil::DateTime>) {
    assert_eq!(parse_sent_indicator(input), expected);
  }

  #[rstest]
  #[case("")]
  #[case("2/13/2026, 9:06 PM")] // missing "Sent at " prefix
  #[case("Sent at INVALID")]
  #[case("Sent at 2/13/2026")] // missing time
  #[case("Sent at ")] // prefix but nothing after
  fn test_parse_sent_indicator_invalid(#[case] input: &str) {
    assert_eq!(parse_sent_indicator(input), None);
  }

  // -----------------------------------------------------------------------
  // combine_date_time
  // -----------------------------------------------------------------------

  #[rstest]
  #[case(date(2026, 3, 14), time(21, 6, 0, 0), date(2026, 3, 14).at(21, 6, 0, 0))]
  #[case(date(2026, 1, 1), time(0, 0, 0, 0), date(2026, 1, 1).at(0, 0, 0, 0))]
  #[case(date(2025, 12, 31), time(23, 59, 59, 0), date(2025, 12, 31).at(23, 59, 59, 0))]
  fn test_combine_date_time(#[case] d: Date, #[case] t: Time, #[case] expected: jiff::civil::DateTime) {
    let result = combine_date_time(d, t);
    assert_eq!(result, expected);
    assert_eq!(result.date(), d);
    assert_eq!(result.time(), t);
  }

  // -----------------------------------------------------------------------
  // naive_to_timestamp
  // -----------------------------------------------------------------------

  #[rstest]
  #[case(date(2026, 3, 14).at(21, 6, 0, 0), "America/Denver")]
  #[case(date(2026, 1, 1).at(0, 0, 0, 0), "America/Denver")]
  #[case(date(2025, 12, 31).at(23, 59, 59, 0), "America/New_York")]
  #[case(date(2024, 2, 29).at(12, 0, 0, 0), "Europe/London")]
  #[case(date(2026, 3, 14).at(10, 0, 0, 0), "UTC")]
  fn test_naive_to_timestamp_roundtrip(#[case] dt: jiff::civil::DateTime, #[case] tz_name: &str) {
    let tz = jiff::tz::TimeZone::get(tz_name).unwrap();
    let ts = naive_to_timestamp(dt, tz.clone());
    // Convert back via the same timezone to verify the roundtrip
    let zoned = jiff::Timestamp::from(ts).to_zoned(tz);
    assert_eq!(zoned.date(), dt.date());
    assert_eq!(zoned.time(), dt.time());
  }

  // -----------------------------------------------------------------------
  // ScrapedMessage hashing
  // -----------------------------------------------------------------------

  #[test]
  fn test_scraped_message_new_sets_fields() {
    let ts = Some(date(2026, 3, 14).at(12, 0, 0, 0));
    let msg = ScrapedMessage::new("conv1", "Alice".into(), "ACoAAA123".into(), "Hello".into(), ts);
    assert_eq!(msg.sender_name, "Alice");
    assert_eq!(msg.sender_profile_id, "ACoAAA123");
    assert_eq!(msg.content, "Hello");
    assert_eq!(msg.timestamp, ts);
    assert_ne!(msg.hash, [0u8; 32]);
  }

  /// Two messages with these inputs should produce the same hash
  #[rstest]
  // Deterministic: identical inputs
  #[case("conv1", "id1", "Hello", None, "conv1", "id1", "Hello", None)]
  // Empty strings: still deterministic
  #[case("", "", "", None, "", "", "", None)]
  // Different sender_name does not affect hash (profile_id is what matters)
  #[case("conv1", "id1", "Hello", None, "conv1", "id1", "Hello", None)]
  // Same timestamp
  #[case("conv1", "id1", "Hi", Some(date(2026,3,14).at(9,0,0,0)),
         "conv1", "id1", "Hi", Some(date(2026,3,14).at(9,0,0,0)))]
  fn test_hash_equal(
    #[case] conv1: &str,
    #[case] profile_id1: &str,
    #[case] content1: &str,
    #[case] ts1: Option<jiff::civil::DateTime>,
    #[case] conv2: &str,
    #[case] profile_id2: &str,
    #[case] content2: &str,
    #[case] ts2: Option<jiff::civil::DateTime>,
  ) {
    let m1 = ScrapedMessage::new(conv1, "name".into(), profile_id1.into(), content1.into(), ts1);
    let m2 = ScrapedMessage::new(conv2, "name".into(), profile_id2.into(), content2.into(), ts2);
    assert_eq!(m1.hash, m2.hash);
    assert_ne!(m1.hash, [0u8; 32]);
  }

  /// Two messages with these inputs should produce different hashes
  #[rstest]
  // Different conversation
  #[case("conv1", "id1", "Hello", None, "conv2", "id1", "Hello", None)]
  // Different sender profile_id
  #[case("conv1", "id1", "Hello", None, "conv1", "id2", "Hello", None)]
  // Different content
  #[case("conv1", "id1", "Hello", None, "conv1", "id1", "World", None)]
  // None vs Some timestamp
  #[case("conv1", "id1", "Hello", None,
         "conv1", "id1", "Hello", Some(date(2026,3,14).at(12,0,0,0)))]
  // Same content, different timestamps ("sure" bug)
  #[case("conv1", "id1", "sure", Some(date(2026,3,14).at(9,0,0,0)),
         "conv1", "id1", "sure", Some(date(2026,3,14).at(15,30,0,0)))]
  // Empty vs non-empty content
  #[case("", "", "", None, "", "", "x", None)]
  fn test_hash_different(
    #[case] conv1: &str,
    #[case] profile_id1: &str,
    #[case] content1: &str,
    #[case] ts1: Option<jiff::civil::DateTime>,
    #[case] conv2: &str,
    #[case] profile_id2: &str,
    #[case] content2: &str,
    #[case] ts2: Option<jiff::civil::DateTime>,
  ) {
    let m1 = ScrapedMessage::new(conv1, "name".into(), profile_id1.into(), content1.into(), ts1);
    let m2 = ScrapedMessage::new(conv2, "name".into(), profile_id2.into(), content2.into(), ts2);
    assert_ne!(m1.hash, m2.hash);
  }

  // -----------------------------------------------------------------------
  // Property tests
  // -----------------------------------------------------------------------

  proptest! {
    /// Realistic day divider inputs: valid formats with random whitespace padding.
    #[test]
    fn prop_parse_day_divider_with_padding(
      month in 1usize..=12,
      day in 1u8..=28,
      leading in " {0,5}",
      trailing in " {0,5}",
    ) {
      let today = date(2026, 6, 15);
      let month_name = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][month - 1];
      let input = format!("{leading}{month_name} {day}{trailing}");
      let result = parse_day_divider_with_today(&input, today);
      prop_assert!(result.is_some(), "Failed to parse: {:?}", input);
      let result = result.unwrap();
      prop_assert_eq!(result.month(), month as i8);
      prop_assert_eq!(result.day(), day as i8);
    }

    /// Message time inputs: valid 12-hour times with random whitespace.
    #[test]
    fn prop_parse_message_time_valid(
      hour in 1u8..=12,
      minute in 0u8..=59,
      am_pm in 0u8..=1,
      leading in " {0,3}",
      trailing in " {0,3}",
    ) {
      let suffix = if am_pm == 0 { "AM" } else { "PM" };
      let input = format!("{leading}{hour}:{minute:02} {suffix}{trailing}");
      let result = parse_message_time(&input);
      prop_assert!(result.is_some(), "Failed to parse: {:?}", input);
    }

    /// Sent indicator inputs: valid "Sent at M/D/YYYY, H:MM AM/PM" with variations.
    #[test]
    fn prop_parse_sent_indicator_valid(
      month in 1u8..=12,
      day in 1u8..=28,
      year in 2024u16..=2027,
      hour in 1u8..=12,
      minute in 0u8..=59,
      am_pm in 0u8..=1,
    ) {
      let suffix = if am_pm == 0 { "AM" } else { "PM" };
      let input = format!("Sent at {month}/{day}/{year}, {hour}:{minute:02} {suffix}");
      let result = parse_sent_indicator(&input);
      prop_assert!(result.is_some(), "Failed to parse: {:?}", input);
    }

    #[test]
    fn prop_weekday_always_in_past_week(
      weekday in 0u8..7,
      // Vary "today" across a wide range of dates
      day_offset in 0u16..1000,
    ) {
      let today = date(2024, 1, 1).checked_add(jiff::Span::new().days(day_offset as i64)).unwrap();
      let weekdays = [
        jiff::civil::Weekday::Monday,
        jiff::civil::Weekday::Tuesday,
        jiff::civil::Weekday::Wednesday,
        jiff::civil::Weekday::Thursday,
        jiff::civil::Weekday::Friday,
        jiff::civil::Weekday::Saturday,
        jiff::civil::Weekday::Sunday,
      ];
      let names = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
      let result = parse_day_divider_with_today(names[weekday as usize], today);
      prop_assert!(result.is_some());
      let result = result.unwrap();
      // Must be 1-7 days in the past
      let diff = today.since(result).unwrap().get_days();
      prop_assert!((1..=7).contains(&diff), "Expected 1-7 days back, got {diff}");
      // Result must fall on the correct weekday
      prop_assert_eq!(result.weekday(), weekdays[weekday as usize]);
    }

    #[test]
    fn prop_month_day_current_year(month in 1u8..=12, day in 1u8..=28) {
      let today = date(2026, 6, 15);
      let input = format!("{} {day}", ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][(month - 1) as usize]);
      let result = parse_day_divider_with_today(&input, today);
      prop_assert!(result.is_some());
      let result = result.unwrap();
      prop_assert_eq!(result.year(), 2026);
      prop_assert_eq!(result.month(), month as i8);
      prop_assert_eq!(result.day(), day as i8);
    }

    #[test]
    fn prop_month_day_year_preserves_all_fields(year in 2000i16..2030, month in 1u8..=12, day in 1u8..=28) {
      let today = date(2026, 6, 15);
      let input = format!("{} {day}, {year}", ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][(month - 1) as usize]);
      let result = parse_day_divider_with_today(&input, today);
      prop_assert!(result.is_some());
      let result = result.unwrap();
      prop_assert_eq!(result.year(), year);
      prop_assert_eq!(result.month(), month as i8);
      prop_assert_eq!(result.day(), day as i8);
    }

    #[test]
    fn prop_scraped_message_hash_deterministic(
      conv_id in "[a-z]{5,10}",
      profile_id in "[A-Za-z0-9]{5,20}",
      content in "\\PC{1,100}",
    ) {
      let m1 = ScrapedMessage::new(&conv_id, "name".into(), profile_id.clone(), content.clone(), None);
      let m2 = ScrapedMessage::new(&conv_id, "name".into(), profile_id, content, None);
      prop_assert_eq!(m1.hash, m2.hash);
    }

    #[test]
    fn prop_scraped_message_hash_changes_with_any_input(
      conv_id in "[a-z]{5,10}",
      profile_id in "[A-Za-z0-9]{5,20}",
      content in "[a-z]{1,50}",
    ) {
      let base = ScrapedMessage::new(&conv_id, "name".into(), profile_id.clone(), content.clone(), None);
      // Changing conv_id changes hash
      let diff_conv = ScrapedMessage::new(&format!("{conv_id}x"), "name".into(), profile_id.clone(), content.clone(), None);
      prop_assert_ne!(base.hash, diff_conv.hash);
      // Changing profile_id changes hash
      let diff_profile = ScrapedMessage::new(&conv_id, "name".into(), format!("{profile_id}x"), content.clone(), None);
      prop_assert_ne!(base.hash, diff_profile.hash);
      // Changing content changes hash
      let diff_content = ScrapedMessage::new(&conv_id, "name".into(), profile_id.clone(), format!("{content}x"), None);
      prop_assert_ne!(base.hash, diff_content.hash);
      // Changing timestamp changes hash
      let diff_ts = ScrapedMessage::new(&conv_id, "name".into(), profile_id, content, Some(datetime(2026, 1, 1, 12, 0, 0, 0)));
      prop_assert_ne!(base.hash, diff_ts.hash);
    }
  }
}
