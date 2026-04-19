use crate::automator::{Automator, utils::Delay};
use crate::prelude::*;
use rand::{RngExt, rng};
use std::time::Duration;
use thirtyfour::prelude::*;

impl Automator {
  pub async fn process_sales_navigator_url(
    &mut self,
    scrape: &ScrapeSalesNavQuery,
    app_state: &AppState,
  ) -> Result<()> {
    let ScrapeSalesNavQuery {
      ref sales_navigator_url,
      max_pages_to_scrape,
      max_profiles_per_page,
      download_full_profile_info: _,
      contact_list_id,
    } = *scrape;

    let sales_nav_url = url::Url::parse(sales_navigator_url)
      .map_err(|e| JaniumError::msg(format!("Failed to parse sales navigator url: {}", e)))?;

    let starting_page_number = self.get_page_count_from_sales_navigator_url(&sales_nav_url);

    tracing::info!(
      starting_page_number,
      max_pages_to_scrape = scrape.max_pages_to_scrape,
      max_profiles_per_page = scrape.max_profiles_per_page,
      "starting processing sales navigator url {}",
      scrape.sales_navigator_url
    );

    // Navigate to the initial sales navigator URL
    self.driver.get(sales_navigator_url).await?;

    Delay::BigLoad.await;

    if !self.is_on_sales_nav_home().await {
      tracing::warn!(
        "Not on expected Sales Navigator page after navigating to {}",
        sales_navigator_url,
      );
    }

    self.set_sales_navigator_last_active();

    tracing::debug!("on sales navigator page {}", sales_navigator_url);

    let mut current_page = starting_page_number;

    // Internal loop to process all pages
    loop {
      Delay::Load.await;

      let profile_count = self
        .try_get_all_profiles(max_profiles_per_page, contact_list_id, app_state)
        .await?;

      tracing::info!(
        profile_count,
        current_page,
        max_pages_to_scrape,
        "finished processing sales navigator page",
      );

      // Batch pause every 10 pages to avoid rate limiting
      if current_page % 10 == 0 && current_page > 0 {
        tracing::info!(
          "Batch pause at page {} - waiting 1-2 minutes to avoid rate limiting",
          current_page
        );
        Delay::RangeMs(60000, 120000).await;
      }

      // Check if we've hit max pages
      if max_pages_to_scrape.is_some_and(|max_pages| current_page >= max_pages) {
        tracing::info!("Reached max pages to scrape ({}), stopping", current_page);
        break;
      }

      // Try clicking the "Next" button first
      if self.click_next_page_button().await? {
        current_page += 1;
        tracing::info!("Clicked next page button, now on page {}", current_page);
        continue;
      }

      // Fallback: try URL manipulation if clicking failed
      tracing::debug!("Next button click failed or not available, trying URL fallback");
      let next_url = self
        .get_sales_navigator_url_to_visit_per_page(sales_nav_url.clone(), current_page + 1)
        .to_string();

      // Check if we can navigate to the next page via URL
      if self.is_next_page_button_enabled().await? {
        tracing::info!("Using URL fallback to navigate to page {}", current_page + 1);
        self.driver.get(&next_url).await?;
        Delay::BigLoad.await;
        current_page += 1;
        continue;
      }

      // No more pages available
      tracing::info!("No more pages available, stopping at page {}", current_page);
      break;
    }

    Ok(())
  }

  #[expect(dead_code)]
  pub async fn slow_scroll_through_page(&mut self) -> Result<()> {
    tracing::trace!("slow_scroll_through_page: starting slow scroll");

    for _ in 0..20 {
      self
        .driver
        .execute("window.scrollBy(0, window.innerHeight / 2);", vec![])
        .await?;

      Delay::RangeMs(1500, 2500).await;
    }

    tracing::trace!("slow_scroll_through_page: finished slow scroll");
    Ok(())
  }

  /// This function goes through the rows of the sales navigator page and gets the profile data available there
  pub async fn try_get_all_profiles(
    &mut self,
    max_profiles_per_page: Option<i32>,
    contact_list_id: Id<ContactList>,
    app_state: &AppState,
  ) -> Result<usize> {
    // Wait for actual profile content to load (not just skeleton placeholders)
    // Skeleton state has list items but no profile links with /sales/lead hrefs
    let mut content_loaded = false;
    for attempt in 1..=15 {
      // Check for rate limiting first (main content area shows "Too Many Requests" h3)
      if self
        .driver
        .find(By::XPath("//h3[text()='Too Many Requests']"))
        .await
        .is_ok()
      {
        tracing::warn!("LinkedIn rate limit detected - Too Many Requests page shown");
        return Err(JaniumError::msg(
          "LinkedIn rate limit: Too many requests. Please try again later.",
        ));
      }

      let profile_links = self
        .driver
        .find_all(By::Css("ol.artdeco-list a[href*='/sales/lead']"))
        .await?;
      if !profile_links.is_empty() {
        tracing::debug!(
          "Profile content loaded after {} attempts ({} profile links found)",
          attempt,
          profile_links.len()
        );
        content_loaded = true;
        break;
      }
      tracing::trace!("Waiting for profile content to load (attempt {})", attempt);
      tokio::time::sleep(Duration::from_secs(1)).await;
    }
    if !content_loaded {
      return Err(JaniumError::msg(
        "Timed out waiting for profile content to load (still showing skeleton placeholders after 15s)",
      ));
    }

    let profiles = self
      .driver
      .find_all(By::XPath(
        "//ol[contains(@class, 'artdeco-list')]/li[contains(@class, 'artdeco-list__item')]",
      ))
      .await?;
    let mut profile_count = 0;

    tracing::debug!(
      "starting to process all profiles from sales nav search page, profiles_from_sales_nav_len = {}",
      profiles.len()
    );

    let page_start = std::time::Instant::now();

    // Scroll to end of page
    if let Some(last) = profiles.last() {
      self.scroll_to_element(last).await?;
      Delay::Load.await;
    }

    let mut task_handles = Vec::new();

    for (index, profile) in profiles.into_iter().enumerate() {
      tracing::trace!("processing profile {}", index);
      if let Some(max_profiles) = max_profiles_per_page
        && index > max_profiles as usize
      {
        break;
      }

      let profile_html = profile.outer_html().await?;
      if profile_html.is_empty() {
        continue;
      }

      profile.scroll_into_view().await?;

      let profile_start = std::time::Instant::now();

      let profile_url = match profile.find(By::Css("div.artdeco-entity-lockup__title > a")).await {
        Ok(element) => {
          // self.mouse_to_click(&element).await?;
          element.attr("href").await?
        }
        _ => {
          return Err(JaniumError::msg(
            "failed to get profile url. Maybe html structure changed?",
          ));
        }
      };

      let Some(li_sales_nav_profile_url) = profile_url else {
        tracing::error!("failed to get profile url. Maybe html structure changed?");
        continue;
      };

      // Get rid of trailing commas like linkedin does in some of their own code.
      let li_sales_nav_profile_id = self.li_sales_url_to_profile_id(&li_sales_nav_profile_url);

      let profile_full_name = match profile
        .find(By::Css("div.artdeco-entity-lockup__title > a > span"))
        .await
      {
        Ok(element) => element.text().await?,
        _ => {
          return Err(JaniumError::msg(
            "Fullname of the profile not found. Maybe html structure changed?",
          ));
        }
      };

      let location = match profile.find(By::Css("div.artdeco-entity-lockup__caption > span")).await {
        Ok(element) => Some(element.text().await?.trim().to_string()),
        _ => {
          tracing::error!(
            "Location of the profile not found. Maybe html structure changed? {}",
            profile_full_name
          );
          None
        }
      };

      // Updated position selector
      let profile_current_position = match profile.find(By::Css(r#"span[data-anonymize="title"]"#)).await {
        Ok(element) => {
          let text = element.text().await?.trim().to_string();
          if text.is_empty() { None } else { Some(text) }
        }
        Err(e) => {
          tracing::error!("Error finding current position: {:?}", e);
          None
        }
      };

      let (_company_url, _company_name) = match profile.find(By::Css(r#"a[data-anonymize="company-name"]"#)).await {
        Ok(el) => {
          let url = el.attr("href").await?;
          let name = el.text().await?.trim().to_string();
          tracing::trace!("hovering over company {}", name);
          self.mouse_hover(&el).await?;

          (url, (!name.is_empty()).then_some(name))
        }
        Err(_) => {
          tracing::trace!("Unable to find current company");
          (None, None)
        }
      };

      // Move the mouse to a random position between 100 and 300 pixels right and 300 pixels up or down
      let (x, y) = (rng().random_range(100..300), rng().random_range(-300..300));
      self
        .container_service_client
        .send_control_tokens(vec![container_service::ControlToken::Enigo(
          enigo::agent::Token::MoveMouse(x, y, enigo::Coordinate::Rel),
        )])
        .await?;
      // Try to get the public LinkedIn URL by opening the profile row
      // let li_profile_url = self
      //   .get_public_profile_url_from_profile_row(&profile)
      //   .await
      //   .ok()
      //   .flatten();

      let existing_contact = ContactDb::select()
        .where_bind("li_sales_nav_profile_id = ?", li_sales_nav_profile_id)
        .fetch_optional(&app_state.db)
        .await?;

      let (prev_hash, contact) = if let Some(existing_contact) = existing_contact {
        let mut contact = app_state
          .contact_service
          .get(&existing_contact.id)
          .await?
          .ok_or_else(|| JaniumError::msg(format!("Contact not found: {}", existing_contact.id)))?
          .as_ref()
          .clone();
        let prev_hash = crate::util::hash(&contact);
        let inner = &mut contact.inner;
        inner.full_name = Some(profile_full_name.clone());
        inner.title = profile_current_position;
        inner.location = location;
        (prev_hash, contact)
      } else {
        let contact = Contact {
          inner: ContactDb {
            id: Id::new(),
            first_name: None,
            middle_name: None,
            last_name: None,
            preferred_name: None,
            full_name: Some(profile_full_name.clone()),
            title: profile_current_position,
            department: None,
            seniority: None,
            li_profile_handle: None,
            li_sales_nav_profile_id: Some(li_sales_nav_profile_id.to_string()),
            city: None,
            state: None,
            state_abbr: None,
            country_full: None,
            country_2: None,
            country_3: None,
            location,
            company_id: None,
          },
          emails: vec![],
          phones: vec![],
        };
        let prev_hash = crate::util::HashValue::default();
        (prev_hash, contact)
      };
      {
        let mut conn = app_state.db.acquire().await?;
        let contact_id = contact.inner.id;
        let should_parse_name = contact.inner.first_name.is_none();
        app_state.contact_service.save(prev_hash, contact, &mut conn).await?;
        ContactForList::create(contact_list_id, contact_id, &mut conn).await?;
        drop(conn);
        let app_state_clone = app_state.clone();
        if should_parse_name {
          let task_handle = tokio::spawn(async move {
            let parsed_name = crate::ai::parse_name(profile_full_name, app_state_clone.clone()).await?;
            let contact = app_state_clone.contact_service.get(&contact_id).await?.ok_or_else(|| {
              JaniumError::msg(format!("Contact not found (even though just created): {}", contact_id))
            })?;

            let mut contact = contact.as_ref().clone();
            let prev_hash = crate::util::hash(&contact);
            contact.inner.first_name = parsed_name.first_name;
            contact.inner.middle_name = parsed_name.middle_name;
            contact.inner.last_name = parsed_name.last_name;
            contact.inner.preferred_name = parsed_name.preferred_name;
            let mut conn = app_state_clone.db.acquire().await?;
            app_state_clone
              .contact_service
              .save(prev_hash, contact, &mut conn)
              .await?;
            Ok::<_, crate::JaniumError>(())
          });
          task_handles.push(task_handle);
        }
        profile_count += 1;
      }

      let profile_time = profile_start.elapsed().as_millis() as u64;
      Delay::RangeMs(
        4000_u64.saturating_sub(profile_time),
        6000_u64.saturating_sub(profile_time),
      )
      .await;
    }

    for task_handle in task_handles {
      task_handle.await.ok();
    }

    tracing::debug!("processed {profile_count} profiles");
    let page_time = page_start.elapsed().as_millis() as u64;
    Delay::RangeMs(45000_u64.saturating_sub(page_time), 90000_u64.saturating_sub(page_time)).await;
    Ok(profile_count)
  }

  pub async fn is_on_sales_nav_home(&self) -> bool {
    match self.driver.title().await {
      Ok(title) => {
        title.contains("Sales Navigator")
          && self
            .driver
            .current_url()
            .await
            .map(|url| url.to_string().contains("linkedin.com/sales"))
            .unwrap_or(false)
      }
      Err(e) => {
        tracing::error!("error in is_on_sales_nav_home: {}", e);
        false
      }
    }
  }

  /// Opens the Sales Navigator profile in a new tab by right-clicking the name link,
  /// extracts the public linkedin.com/in/... URL, then closes the tab and returns.
  #[expect(dead_code)]
  pub async fn get_public_profile_url_from_profile_row(&mut self, row: &WebElement) -> Result<Option<String>> {
    use std::time::Duration;
    use thirtyfour::common::keys::Key;

    tracing::info!("🟢 Attempting to open profile in new tab...");

    // Step 1: Locate the profile name link
    let link_el = match row.find(By::Css("div.artdeco-entity-lockup__title > a")).await {
      Ok(el) => el,
      Err(e) => {
        tracing::warn!("⚠️ Could not find profile name link: {:?}", e);
        return Ok(None);
      }
    };

    // Step 2: Get href for logging
    let href = link_el.attr("href").await?.unwrap_or_default();
    tracing::debug!("Found profile href: {}", href);

    // Step 3: Store main window + handles before opening new tab
    let main_handle = self.driver.window().await?;
    let before_handles = self.driver.windows().await?;

    // Step 4: Simulate Ctrl/Cmd + Click to open new tab
    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;

    self
      .driver
      .action_chain()
      .key_down(modifier.clone())
      .click_element(&link_el)
      .key_up(modifier)
      .perform()
      .await?;

    tokio::time::sleep(Duration::from_secs(2)).await;

    // Step 5: Detect new tab
    let mut new_handle: Option<thirtyfour::WindowHandle> = None;
    for _ in 0..20 {
      let after_handles = self.driver.windows().await?;
      if after_handles.len() > before_handles.len() {
        new_handle = after_handles.iter().find(|h| !before_handles.contains(h)).cloned();
        break;
      }
      tokio::time::sleep(Duration::from_millis(300)).await;
    }

    if new_handle.is_none() {
      tracing::warn!("⚠️ No new tab detected after trying to open link");
      return Ok(None);
    }

    // Step 6: Detect and switch to the new tab
    let mut new_handle: Option<thirtyfour::WindowHandle> = None;
    for _ in 0..20 {
      let after_handles = self.driver.windows().await?;
      if after_handles.len() > before_handles.len() {
        new_handle = after_handles.iter().find(|h| !before_handles.contains(h)).cloned();
        break;
      }
      tokio::time::sleep(Duration::from_millis(300)).await;
    }

    let Some(new_handle) = new_handle else {
      tracing::warn!("No new tab detected after trying to open link");
      return Ok(None);
    };

    // 🔁 Make sure the driver actually attaches to the new tab
    self.driver.switch_to_window(new_handle.clone()).await?;
    tokio::time::sleep(Duration::from_secs(1)).await;

    // ✅ Confirm Chrome has registered the new active tab
    let current_title = self.driver.title().await.unwrap_or_default();
    tracing::info!("Switched to new Sales Nav tab, title: {}", current_title);

    // 🕓 Wait for the profile to load (up to ~10s)
    let mut loaded = false;
    for _ in 0..10 {
      if self
        .driver
        .query(By::Css(".profile-topcard-person-entity__name"))
        .first()
        .await
        .is_ok()
      {
        loaded = true;
        break;
      }
      tokio::time::sleep(Duration::from_secs(1)).await;
    }

    if loaded {
      tracing::info!("Profile tab finished loading");
    } else {
      tracing::warn!("Timeout waiting for Sales Nav profile tab to load");
    }

    // 🧹 Close the profile tab *safely*
    tracing::info!("Attempting to close the profile tab...");
    self.driver.switch_to_window(main_handle.clone()).await?;
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Ensure Chrome has time to register the switch before close
    let all_handles = self.driver.windows().await?;
    for handle in all_handles {
      if handle != main_handle {
        tracing::debug!("Closing tab handle {:?}", handle);
        if let Err(e) = self.driver.switch_to_window(handle.clone()).await {
          tracing::warn!("Failed to switch to tab {:?} before close: {:?}", handle, e);
          continue;
        }
        if let Err(e) = self.driver.close_window().await {
          tracing::warn!("Failed to close tab {:?}: {:?}", handle, e);
        } else {
          tracing::info!("Closed tab handle {:?}", handle);
        }
      }
    }

    // ✅ Return to main tab
    if let Err(e) = self.driver.switch_to_window(main_handle.clone()).await {
      tracing::error!("Failed to return focus to main tab: {:?}", e);
    } else {
      tracing::info!("Returned to main list view tab");
    }

    tokio::time::sleep(Duration::from_secs(2)).await;

    // 🕓 Step 7: Wait for Sales Navigator profile page to load
    use thirtyfour::By;

    let mut loaded = false;
    for _ in 0..10 {
      if self
        .driver
        .query(By::Css(".profile-topcard-person-entity__name"))
        .first()
        .await
        .is_ok()
      {
        loaded = true;
        break;
      }
      tokio::time::sleep(Duration::from_secs(1)).await;
    }

    if loaded {
      tracing::info!("Sales Navigator profile loaded successfully");
    } else {
      tracing::warn!("Timed out waiting for Sales Navigator profile to load");
    }

    tokio::time::sleep(Duration::from_secs(1)).await;

    // Step 8: Close new tab and go back
    if let Err(e) = self.driver.close_window().await {
      tracing::warn!("Could not close new tab: {:?}", e);
    }

    // Ensure we’re back to the main tab
    if let Err(e) = self.driver.switch_to_window(main_handle.clone()).await {
      tracing::error!("Failed to return to main tab: {:?}", e);
    } else {
      tracing::info!("↩Returned to list view tab successfully");
    }

    tokio::time::sleep(Duration::from_secs(2)).await;

    Ok(None)
  }

  /// Extracts the public LinkedIn.com/in/... URL from an open profile tab
  #[expect(dead_code)]
  pub async fn get_public_profile_url_from_profile_page(&mut self) -> Result<Option<String>> {
    tracing::debug!("Extracting public LinkedIn URL from open profile tab...");

    // Wait briefly to ensure the new tab has loaded
    tokio::time::sleep(Duration::from_secs(2)).await;

    // Try to read the current URL directly
    let current_url = match self.driver.current_url().await {
      Ok(u) => u.as_str().to_string(),
      Err(e) => {
        tracing::error!("Failed to read URL from current tab: {:?}", e);
        return Ok(None);
      }
    };

    tracing::debug!("Current tab URL detected: {}", current_url);

    // Case 1: Already a public LinkedIn URL
    if current_url.contains("linkedin.com/in/") {
      return Ok(Some(current_url));
    }

    // Case 2: Attempt to extract from visible links in DOM (e.g. redirect pages)
    let js_extract = r#"
          const anchors = Array.from(document.querySelectorAll('a[href*="linkedin.com/in/"]'));
          if (anchors.length > 0) return anchors[0].href;
          return '';
      "#;

    let result = self.driver.execute(js_extract, vec![]).await?;
    let url_str = result.json().as_str().unwrap_or("").to_string();

    if !url_str.is_empty() {
      tracing::info!("Extracted linkedin.com/in URL from page content: {}", url_str);
      return Ok(Some(url_str));
    }

    tracing::warn!("No linkedin.com/in URL found in open tab.");
    Ok(None)
  }
}

#[test]
#[ignore = "requires dev server DB (JANIUM_DEV_TESTS=1)"]
fn test_scrape_profiles_from_sales_nav_url() {
  use crate::prelude::*;
  use ormlite::Model;
  crate::test::app_state_test_with_db(600, async |app_state| {
    Delay::Ms(3000).await;
    for _ in 0..10 {
      println!("---------------------------------------------------------------------");
    }
    let elaine = LinkedIn::select()
      .where_bind(
        "linkedin_profile_url = ?",
        "https://www.linkedin.com/in/elaine-schauerhamer/",
      )
      .fetch_one(&app_state.db)
      .await?;

    let handle = app_state.router.get_handle::<LinkedIn>(elaine.id_ref())?;

    let sales_nav_url = "https://www.linkedin.com/sales/search/people?query=(spellCorrectionEnabled%3Atrue%2CrecentSearchParam%3A(id%3A5005828682%2CdoLogHistory%3Atrue)%2Cfilters%3AList((type%3ACOMPANY_HEADCOUNT%2Cvalues%3AList((id%3AD%2Ctext%3A51-200%2CselectionType%3AINCLUDED)))%2C(type%3AREGION%2Cvalues%3AList((id%3A103644278%2Ctext%3AUnited%2520States%2CselectionType%3AINCLUDED)))%2C(type%3APOSTED_ON_LINKEDIN%2Cvalues%3AList((id%3ARPOL%2Ctext%3APosted%2520on%2520LinkedIn%2CselectionType%3AINCLUDED)))%2C(type%3AYEARS_AT_CURRENT_COMPANY%2Cvalues%3AList((id%3A5%2Ctext%3AMore%2520than%252010%2520years%2CselectionType%3AINCLUDED)))%2C(type%3ARELATIONSHIP%2Cvalues%3AList((id%3AS%2Ctext%3A2nd%2520degree%2520connections%2CselectionType%3AINCLUDED)))%2C(type%3ACURRENT_TITLE%2Cvalues%3AList((text%3ACEO%2CselectionType%3AINCLUDED)%2C(text%3AChief%2520Executive%2520Officer%2CselectionType%3AINCLUDED))))%2Ckeywords%3Ainvestor%2520NOT%2520consultant)&sessionId=dYRy2%2BqhTZ641KiYtsB%2BHw%3D%3D";
    let contact_list = ContactList::new(elaine.team_id, "test".to_string(), Some(elaine.id), Some(sales_nav_url.to_string()), None);
    let contact_list = {
      let mut conn = app_state.db.acquire().await?;
      contact_list.save(&mut conn).await?
    };
    let contact_list_id = contact_list.id;
    handle
      .send(
        async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
          let sender = state.start_automated_runner(actor).await?;
          sender
            .send(crate::automator::runner::AutomatorRunnerMessage::Automate(
              LinkedInActionRequest::new(
                LinkedInAction::ScrapeSalesNavQuery(ScrapeSalesNavQuery {
                  sales_navigator_url: sales_nav_url.to_string(),
                  max_pages_to_scrape: Some(2),
                  download_full_profile_info: false,
                  max_profiles_per_page: None,
                  contact_list_id,
                }),
                actor.team_id,
                actor.id,
                None,
                None,
                None,
                Timestamp::now() + Duration::from_secs(60 * 60 * 24),
                None,
              ),
            ))
            .await
            .unwrap();
          Delay::Ms(300000).await;
          Ok::<_, crate::JaniumError>(())
        },
      )
      .await??;
    for _ in 0..10 {
      println!("---------------------------------------------------------------------");
    }
    Ok::<_, crate::JaniumError>(())
  })
  .unwrap();
}

#[test]
#[ignore = "requires dev server DB (JANIUM_DEV_TESTS=1)"]
fn test_concurrent() {
  crate::test::app_state_test_with_db(20, async |_app_state| {
    println!("inside test_concurrent");
    Delay::Ms(10000).await;
    println!("finished test_concurrent");
  });
}
