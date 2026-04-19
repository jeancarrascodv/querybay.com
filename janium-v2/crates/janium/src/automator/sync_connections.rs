use super::{Automator, utils::Delay};
use crate::prelude::*;
use std::collections::{HashMap, HashSet};
use thirtyfour::prelude::*;

#[expect(dead_code)]
const LINKEDIN_FEED_URL: &str = "https://www.linkedin.com/feed/";
const MY_NETWORK_GROW_URL: &str = "https://www.linkedin.com/mynetwork/grow/";
const MY_NETWORK_CONNECTIONS_URL: &str = "https://www.linkedin.com/mynetwork/invite-connect/connections";

/// Parse "Connected on Month day, year" into a Date.
fn parse_connected_on(s: &str) -> Option<Date> {
  let date_str = s.strip_prefix("Connected on ")?;
  jiff::civil::Date::strptime("%B %d, %Y", date_str).ok().map(Date::from)
}

#[derive(Debug, Clone)]
pub struct ScrapedConnection {
  pub li_profile_handle: String,
  pub name: String,
  #[expect(dead_code)]
  pub headline: Option<String>,
  pub connected_on: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncMode {
  Full,
  Recent,
}

impl SyncMode {
  pub fn max_profiles(&self) -> usize {
    match self {
      SyncMode::Full => 25000,
      SyncMode::Recent => 300,
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StopReason {
  HardCap,
  NoChange,
  HitKnownProfile,
}

/// Returns the number of new connections added
async fn handle_scraped_connections(
  linkedin_id: Id<LinkedIn>,
  app_state: &AppState,
  connections: Vec<ScrapedConnection>,
  mode: SyncMode,
) -> Result<usize> {
  // Pre-load existing connection contact_ids for this linkedin account
  let existing_contact_ids: HashSet<Id<Contact>> = LinkedInConnection::get_all_for_linkedin(linkedin_id, &app_state.db)
    .await?
    .into_iter()
    .map(|c| c.contact_id)
    .collect();

  let mut conn = app_state.db.begin().await?;

  // Resolve scraped profile handles to known contact_ids
  let known_contacts = sqlx::query_as::<_, (Id<Contact>, String)>(
    "SELECT id, li_profile_url FROM contact WHERE li_profile_url IN (SELECT unnest($1))",
  )
  .bind(
    connections
      .iter()
      .map(|c| c.li_profile_handle.as_str())
      .collect::<Vec<_>>(),
  )
  .fetch_all(&mut *conn)
  .await?
  .into_iter()
  .map(|(id, handle)| (handle, id))
  .collect::<HashMap<_, _>>();

  let connection_len = connections.len();
  let mut new_connections_batch: Vec<LinkedInConnection> = Vec::new();
  let mut existing_connections_batch: Vec<LinkedInConnection> = Vec::new();
  let mut all_contact_ids: Vec<Id<Contact>> = Vec::new();

  for connection in connections {
    let connected_on = connection.connected_on.as_deref().and_then(parse_connected_on);

    let contact_id = if let Some(contact_id) = known_contacts.get(&connection.li_profile_handle) {
      *contact_id
    } else {
      let contact = Contact {
        inner: ContactDb {
          id: Id::new(),
          full_name: Some(connection.name),
          li_profile_handle: Some(connection.li_profile_handle),
          ..Default::default()
        },
        emails: vec![],
        phones: vec![],
      };
      let contact_id = contact.inner.id;
      app_state
        .contact_service
        .save(Default::default(), contact, &mut conn)
        .await?;
      contact_id
    };

    all_contact_ids.push(contact_id);

    if existing_contact_ids.contains(&contact_id) {
      // Existing connection: only update on Full sync
      if mode == SyncMode::Full {
        existing_connections_batch.push(LinkedInConnection::new(linkedin_id, contact_id, connected_on));
      }
    } else {
      // New connection: always insert
      new_connections_batch.push(LinkedInConnection::new(linkedin_id, contact_id, connected_on));
    }
  }

  // Batch save new connections
  let new_contact_ids: Vec<Id<Contact>> = new_connections_batch.iter().map(|c| c.contact_id).collect();
  if !new_connections_batch.is_empty() {
    LinkedInConnection::save_many(new_connections_batch, &mut conn).await?;
  }

  // Full mode: batch update existing connections and mark removed as disconnected
  if mode == SyncMode::Full {
    if !existing_connections_batch.is_empty() {
      LinkedInConnection::save_many(existing_connections_batch, &mut conn).await?;
    }

    // Mark connections not in this sync as disconnected
    sqlx::query(
      "UPDATE linkedin_connections SET disconnected = true
       WHERE linkedin_id = $1 AND contact_id != ALL($2) AND disconnected = false",
    )
    .bind(linkedin_id)
    .bind(&all_contact_ids)
    .execute(&mut *conn)
    .await?;
  }

  conn.commit().await?;
  tracing::info!(
    "Persisted {connection_len} connections for {linkedin_id} ({} new)",
    new_contact_ids.len()
  );

  // Notify campaigns AFTER commit (so data is visible)
  if !new_contact_ids.is_empty() {
    LinkedInConnection::notify_campaigns_of_connections(
      linkedin_id,
      &new_contact_ids,
      &app_state.db,
      &app_state.router,
    )
    .await?;
    tracing::info!(
      "Notified campaigns about {} new connections for {linkedin_id}",
      new_contact_ids.len()
    );
  }

  Ok(new_contact_ids.len())
}

impl Automator {
  /// Sync connections from LinkedIn.
  /// - If `force_full_sync` is true, always does a full sync.
  /// - Otherwise, auto-detects: Full sync if no existing connections, Recent sync if some exist.
  #[tracing::instrument(skip_all, fields(linkedin_id = %self.linked_in.id()))]
  pub async fn sync_connections(&mut self, force_full_sync: bool, app_state: &AppState) -> Result<()> {
    // Auto-determine mode based on existing data, unless forced
    // Also capture existing_count for later verification
    let existing_count = LinkedInConnection::count(*self.linked_in.id(), &app_state.db).await?;
    let mode = if force_full_sync {
      tracing::info!("Forced full sync requested");
      SyncMode::Full
    } else if existing_count == 0 {
      tracing::info!("No existing connections - using Full sync");
      SyncMode::Full
    } else {
      tracing::info!("Found {} existing connections - using Recent sync", existing_count);
      SyncMode::Recent
    };

    tracing::info!("START mode={:?}", mode);

    // 1. Go to LinkedIn feed
    self.driver.goto(MY_NETWORK_GROW_URL).await?;
    Delay::BigLoad.await;

    if self.assert_on_url(MY_NETWORK_GROW_URL).await.is_err() {
      self.set_linked_in_inactive();
      return Err(JaniumError::msg("Not on My Network Grow page — not logged in"));
    }

    // // Fallback: navbar click if URL redirect fails
    // let current_url = self.driver.current_url().await?;
    // if !current_url.as_str().contains("/mynetwork") {
    //   tracing::warn!("Direct URL failed — trying navbar click fallback");

    //   // Best selector: data-view-name
    //   if let Ok(link) = self
    //     .driver
    //     .find(By::Css("a[data-view-name='global-nav-mynetwork']"))
    //     .await
    //   {
    //     link.click().await?;
    //     Delay::BigLoad.await;
    //   } else {
    //     // Last-resort fallback
    //     let link = self.driver.find(By::XPath("//a[contains(@href,'/mynetwork')]")).await?;
    //     link.click().await?;
    //     Delay::BigLoad.await;
    //   }
    // }

    self.set_linked_in_last_active();

    tracing::info!("On My Network page");

    // 3. Navigate to Connections list inside My Network
    tracing::info!("Navigating to Connections list");

    let mut on_connections = false;

    let paths = [
      "//button[contains(@aria-label,'connections') or contains(@aria-label,'Connections')]",
      "//button[.//text()[contains(.,'Connections')]]",
    ];

    for path in paths {
      if let Ok(btn) = self.driver.find(By::XPath(path)).await {
        self.mouse_to_click(&btn).await?;
        if let Ok(()) = self.assert_on_url(MY_NETWORK_CONNECTIONS_URL).await {
          on_connections = true;
          break;
        }
      }
    }

    // TERTIARY: URL-based fallback (LinkedIn still supports this)
    if !on_connections {
      tracing::warn!("Connections button not found — falling back to direct URL");
      self.driver.goto(MY_NETWORK_CONNECTIONS_URL).await?;
    }

    // Load known profiles while waiting for the page to load
    let ((), known_profiles) = futures::join!(
      Delay::BigLoad.into_future(),
      LinkedInConnection::connection_contact_li_profile_handle(*self.linked_in.id(), &app_state.db)
    );

    self.assert_on_url(MY_NETWORK_CONNECTIONS_URL).await?;

    tracing::info!("Connections view loaded");

    // Parse the displayed connection count from the header (e.g. "1,439 connections")
    let displayed_count: Option<usize> = match self
      .driver
      .find(By::XPath(
        "//div[@componentkey='ConnectionsPage_ConnectionsListHeader']//p[contains(.,'connections')]",
      ))
      .await
    {
      Ok(el) => {
        let text = el.text().await.ok();
        tracing::debug!("Connection count header text: {:?}", text);
        text.and_then(|t| {
          t.replace(',', "")
            .split_whitespace()
            .next()
            .and_then(|n| n.parse().ok())
        })
      }
      Err(e) => {
        tracing::warn!("Could not find connection count header: {}", e);
        None
      }
    };
    tracing::info!("Displayed connection count from header: {:?}", displayed_count);

    // 4. Scroll + scrape (Connections list) — LazyColumn aware

    let mut seen_profiles: HashSet<String> = HashSet::new();
    let mut scraped_connections: Vec<ScrapedConnection> = Vec::new();
    let mut no_change_rounds = 0;
    let mut stop_reason: Option<StopReason> = None;
    let mut known_hits = 0; // Count consecutive known profiles before stopping
    let mut duplicate_count: usize = 0;
    const KNOWN_HIT_BUFFER: usize = 3; // Check a few more profiles to be sure

    let max_profiles = mode.max_profiles();

    // Locate the LazyColumn
    let lazy_column = self
      .driver
      .find(By::XPath(
        "//div[@data-testid='lazy-column' and @data-component-type='LazyColumn']",
      ))
      .await?;

    let known_profiles = known_profiles?
      .into_iter()
      .map(|(id, handle)| (handle, id))
      .collect::<HashMap<_, _>>();

    let mut process_profiles = false;
    let mut in_view_count = 0;
    let mut in_view_no_change_rounds = 0;

    'scroll: loop {
      if process_profiles {
        // Find cards directly (1 per profile) instead of anchors (2 per profile)
        let cards = lazy_column
          .find_all(By::XPath(".//div[starts-with(@componentkey, 'auto-component-')]"))
          .await?;

        let mut new_this_round = 0;

        'elements: for card in cards {
          // Find the profile anchor inside the card
          let anchor = match card
            .find(By::XPath(".//a[@data-view-name='connections-profile']"))
            .await
          {
            Ok(a) => a,
            Err(e) => {
              tracing::warn!("Skipping card with no profile anchor: {}", e);
              continue 'elements;
            }
          };

          let profile_url = match anchor.attr("href").await {
            Ok(Some(href)) => href,
            _ => {
              tracing::warn!("Skipping anchor with no href attribute");
              continue 'elements;
            }
          };

          let profile_url = self.li_profile_url_to_handle(&profile_url);

          // Skip duplicates within this scrape session
          if !seen_profiles.insert(profile_url.to_string()) {
            duplicate_count += 1;
            tracing::debug!("Skipping duplicate profile: {}", profile_url);
            continue 'elements;
          }

          // Recent-mode early stop: if we hit several known profiles in a row, stop scraping.
          if mode == SyncMode::Recent {
            if known_profiles.contains_key(&profile_url) {
              known_hits += 1;
              tracing::info!(
                "Hit known profile_url ({}/{}) in Recent mode: {}",
                known_hits,
                KNOWN_HIT_BUFFER,
                profile_url
              );
              if known_hits >= KNOWN_HIT_BUFFER {
                tracing::info!("Hit {} consecutive known profiles — stopping", KNOWN_HIT_BUFFER);
                stop_reason = Some(StopReason::HitKnownProfile);
                break 'scroll;
              }
              continue 'elements; // Skip this one, already known
            } else {
              known_hits = 0; // Reset counter when we see a new profile
            }
          }

          new_this_round += 1;

          // HARD CAP
          if seen_profiles.len() >= max_profiles {
            tracing::info!("Reached hard cap of {} profiles — stopping scrape", max_profiles);
            stop_reason = Some(StopReason::HardCap);
            break 'scroll;
          }

          // Name: the <a> inside <p> that links to the profile
          let name = match card.find(By::XPath(".//p/a[contains(@href, '/in/')]")).await {
            Ok(el) => el.text().await.unwrap_or_else(|_| "<unknown>".into()),
            Err(_) => "<unknown>".into(),
          };

          // Headline: <p> inside nested div, not the name (which has <a>) or connected_on
          let headline = match card
            .find(By::XPath(".//div/p[not(contains(text(),'Connected on')) and not(a)]"))
            .await
          {
            Ok(el) => el.text().await.unwrap_or_default(),
            Err(_) => String::new(),
          };

          // Connected on date
          let connected_on = match card.find(By::XPath(".//p[contains(text(),'Connected on')]")).await {
            Ok(el) => el.text().await.unwrap_or_default(),
            Err(_) => String::new(),
          };

          let connection = ScrapedConnection {
            li_profile_handle: profile_url.to_string(),
            name,
            headline: (!headline.is_empty()).then_some(headline),
            connected_on: (!connected_on.is_empty()).then_some(connected_on),
          };

          tracing::info!(?connection, "[connection]");

          scraped_connections.push(connection);
        }

        if new_this_round == 0 {
          no_change_rounds += 1;
          tracing::info!("No new profiles this round ({})", no_change_rounds);
        } else {
          no_change_rounds = 0;
        }

        if no_change_rounds >= 2 {
          tracing::info!("No new profiles after multiple scrolls — stopping");
          stop_reason = Some(StopReason::NoChange);
          break;
        }
      }

      // Trigger LinkedIn lazy-load
      let scroll_result = self
        .driver
        .execute(
          r#"
        const root = arguments[0];
        const items = root.querySelectorAll("div[componentkey^='auto-component-']");
        if (!items.length) return { ok: false };
        items[items.length - 1].scrollIntoView({ block: "end" });
        return { ok: true, count: items.length };
      "#,
          vec![lazy_column.to_json()?],
        )
        .await?;

      tracing::info!("ScrollIntoView debug: {:?}", scroll_result);

      let val = scroll_result.json().as_object().unwrap();
      if val.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        let current_count = val.get("count").and_then(|v| v.as_u64()).unwrap_or(0);
        tracing::info!("Visible profile cards: {}", current_count);
        if current_count == in_view_count && process_profiles {
          // we've hit the bottom of the page and we've already processed the profiles
          break 'scroll;
        } else if current_count == in_view_count && in_view_no_change_rounds > 3 {
          // set this to true so profiles are processed when we hit the bottom of the page
          process_profiles = true;
        } else if current_count == in_view_count {
          // wait a bit to ensure that the page has loaded the new profiles if there are any
          Delay::Ms(5000).await;
          in_view_no_change_rounds += 1;
        } else {
          in_view_no_change_rounds = 0;
          // For Recent mode, start processing after the first scroll loads real cards
          // Wait for inner card content (anchors) to render before processing
          if mode == SyncMode::Recent {
            Delay::BigLoad.await;
            process_profiles = true;
          }
        }
        in_view_count = current_count;
      } else {
        tracing::error!("ScrollIntoView failed: {}", scroll_result.json());
        return Err(JaniumError::msg("ScrollIntoView failed"));
      }

      Delay::RangeMs(500, 1000).await;
    }

    tracing::info!(
      "DONE mode={:?} — displayed={:?} visible_cards={} duplicates={} unique_scraped={} — stop_reason={:?}",
      mode,
      displayed_count,
      in_view_count,
      duplicate_count,
      seen_profiles.len(),
      stop_reason.unwrap_or(StopReason::NoChange)
    );

    // Persist to database
    let new_connections_added =
      handle_scraped_connections(*self.linked_in.id(), app_state, scraped_connections, mode).await?;

    // Query DB for actual total and verify counts
    let db_count = LinkedInConnection::count(*self.linked_in.id(), &app_state.db).await? as usize;

    match mode {
      SyncMode::Full => {
        if db_count != seen_profiles.len() {
          tracing::warn!(
            "Full sync count mismatch: scraped={}, db={}",
            seen_profiles.len(),
            db_count
          );
        }
      }
      SyncMode::Recent => {
        let expected = existing_count as usize + new_connections_added;
        if db_count != expected {
          tracing::warn!(
            "Recent sync count mismatch: expected={} (existing={} + new={}), db={}",
            expected,
            existing_count,
            new_connections_added,
            db_count
          );
        }
      }
    }

    // Update LinkedIn actor with the DB count
    self.set_connections_count(db_count);

    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_handle_scraped_connections() {
    crate::test::app_state_test(20, async |app_state| {
      let mut conn = app_state.db.acquire().await.unwrap();

      // Fetch the pre-seeded linkedin account
      let linkedin_id = sqlx::query_scalar::<_, Id<LinkedIn>>(
        "select id from linked_in where id != '00000000-0000-0000-0000-000000000000' limit 1",
      )
      .fetch_one(&mut *conn)
      .await
      .unwrap();

      // Pre-insert a contact WITH an existing connection row (simulates already-synced connection)
      let existing_contact_id: Id<Contact> = Id::new();
      sqlx::query("insert into contact (id, li_profile_url) values ($1, $2)")
        .bind(existing_contact_id)
        .bind("existing-profile")
        .execute(&mut *conn)
        .await
        .unwrap();
      LinkedInConnection::new(linkedin_id, existing_contact_id, None)
        .save(&mut conn)
        .await
        .unwrap();

      // Pre-insert a contact WITHOUT a connection row (known contact, new connection)
      let known_contact_id: Id<Contact> = Id::new();
      sqlx::query("insert into contact (id, li_profile_url) values ($1, $2)")
        .bind(known_contact_id)
        .bind("known-profile")
        .execute(&mut *conn)
        .await
        .unwrap();

      drop(conn);

      // === Test Recent mode ===
      let connections = vec![
        ScrapedConnection {
          li_profile_handle: "existing-profile".to_string(),
          name: "Existing Person".to_string(),
          headline: None,
          connected_on: Some("Connected on January 15, 2025".to_string()),
        },
        ScrapedConnection {
          li_profile_handle: "known-profile".to_string(),
          name: "Known Person".to_string(),
          headline: Some("Engineer".to_string()),
          connected_on: None,
        },
        ScrapedConnection {
          li_profile_handle: "new-profile-1".to_string(),
          name: "New Person One".to_string(),
          headline: None,
          connected_on: None,
        },
      ];

      handle_scraped_connections(linkedin_id, &app_state, connections.clone(), SyncMode::Recent)
        .await
        .unwrap();

      // Recent mode: existing-profile was skipped, known-profile and new-profile-1 are new
      let count = LinkedInConnection::count(linkedin_id, &app_state.db).await.unwrap();
      assert_eq!(count, 3, "should have 3 connections (1 pre-existing + 2 new)");

      // Verify existing-profile's connected_on was NOT updated (Recent skips it)
      let existing_conn = sqlx::query_as::<_, LinkedInConnection>(
        "select * from linkedin_connections where linkedin_id = $1 and contact_id = $2",
      )
      .bind(linkedin_id)
      .bind(existing_contact_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();
      assert_eq!(
        existing_conn.connected_on, None,
        "Recent mode should not update existing connection"
      );

      // Verify known-profile got a connection row
      let known_conn = sqlx::query_as::<_, LinkedInConnection>(
        "select * from linkedin_connections where linkedin_id = $1 and contact_id = $2",
      )
      .bind(linkedin_id)
      .bind(known_contact_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();
      assert!(!known_conn.disconnected);

      // Verify new-profile-1 got a new contact and connection row
      let new_profile_1_contact_id =
        sqlx::query_scalar::<_, Id<Contact>>("select id from contact where li_profile_url = 'new-profile-1'")
          .fetch_one(&app_state.db)
          .await
          .unwrap();
      let new_conn = sqlx::query_as::<_, LinkedInConnection>(
        "select * from linkedin_connections where linkedin_id = $1 and contact_id = $2",
      )
      .bind(linkedin_id)
      .bind(new_profile_1_contact_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();
      assert!(!new_conn.disconnected);

      // === Test Full mode with a subset (drops new-profile-1) ===
      let full_connections = vec![
        ScrapedConnection {
          li_profile_handle: "existing-profile".to_string(),
          name: "Existing Person".to_string(),
          headline: None,
          connected_on: Some("Connected on January 15, 2025".to_string()),
        },
        ScrapedConnection {
          li_profile_handle: "known-profile".to_string(),
          name: "Known Person".to_string(),
          headline: Some("Engineer".to_string()),
          connected_on: None,
        },
      ];

      handle_scraped_connections(linkedin_id, &app_state, full_connections, SyncMode::Full)
        .await
        .unwrap();

      // Full mode: existing-profile should now have connected_on updated
      let existing_conn = sqlx::query_as::<_, LinkedInConnection>(
        "select * from linkedin_connections where linkedin_id = $1 and contact_id = $2",
      )
      .bind(linkedin_id)
      .bind(existing_contact_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();
      assert_eq!(
        existing_conn.connected_on,
        Some(Date::from(jiff::civil::date(2025, 1, 15))),
        "Full mode should update connected_on"
      );
      assert!(!existing_conn.disconnected);

      // new-profile-1 should be marked as disconnected (not in full sync subset)
      let disconnected_conn = sqlx::query_as::<_, LinkedInConnection>(
        "select * from linkedin_connections where linkedin_id = $1 and contact_id = $2",
      )
      .bind(linkedin_id)
      .bind(new_profile_1_contact_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();
      assert!(
        disconnected_conn.disconnected,
        "Full sync should mark missing connections as disconnected"
      );

      // known-profile should NOT be disconnected (was in full sync subset)
      let known_conn = sqlx::query_as::<_, LinkedInConnection>(
        "select * from linkedin_connections where linkedin_id = $1 and contact_id = $2",
      )
      .bind(linkedin_id)
      .bind(known_contact_id)
      .fetch_one(&app_state.db)
      .await
      .unwrap();
      assert!(
        !known_conn.disconnected,
        "connections in the sync should not be disconnected"
      );
    });
  }
}

#[test]
#[ignore = "requires dev server DB (JANIUM_DEV_TESTS=1)"]
fn test_sync_connections_dev() {
  use crate::prelude::*;

  crate::test::app_state_test_with_db(900, async |app_state| {
    let elaine = LinkedIn::select()
      .where_bind(
        "linkedin_profile_url = ?",
        "https://www.linkedin.com/in/elaine-schauerhamer/",
      )
      .fetch_one(&app_state.db)
      .await?;

    let handle = app_state.router.get_handle::<LinkedIn>(elaine.id_ref())?;

    handle
      .send(
        async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
          let sender = state.start_automated_runner(actor).await?;
          sender
            .send(crate::automator::runner::AutomatorRunnerMessage::Automate(
              LinkedInActionRequest::new(
                LinkedInAction::SyncConnections(SyncConnections { full_sync: false }),
                actor.team_id,
                actor.id,
                None,
                None,
                None,
                Timestamp::now() + 5.minutes(),
                None,
              ),
            ))
            .await
            .map_err(|_e| JaniumError::msg("Error sending LinkedInActionRequest to AutomatorRunner"))?;
          Ok::<_, JaniumError>(())
        },
      )
      .await??;

    Delay::Ms(1_200_000).await;
    Ok::<_, JaniumError>(())
  })
  .unwrap();
}
