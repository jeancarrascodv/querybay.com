use super::Automator;
use super::utils::Delay;
use crate::prelude::*;
use regex::Regex;
use thirtyfour::prelude::*;

impl Automator {
  #[allow(unused)]
  pub async fn get_messaging_button_from_nav(&self) -> Option<WebElement> {
    let messages_link = self
      .driver
      .find_all(By::XPath("//span[text()='Messaging']/.."))
      .await
      .ok()?;

    for element in messages_link {
      if let Ok(element_class_list) = element.class_name().await {
        if let Some(class_name) = element_class_list {
          tracing::info!("element_class_list: {}", class_name);

          if class_name.contains("global-nav__primary-link") {
            return Some(element);
          }
        } else {
          tracing::error!("element_class_list is empty");
        }
      }
    }

    tracing::error!("messaging button from nav not found");
    None
  }

  #[allow(unused)]
  pub async fn get_my_network_button_from_nav(&self) -> Option<WebElement> {
    let network_link = self
      .driver
      .find_all(By::XPath("//span[text()='My Network']/.."))
      .await
      .ok()?;

    for element in network_link {
      if let Ok(element_class_list) = element.class_name().await {
        if let Some(class_name) = element_class_list {
          tracing::info!("element_class_list: {}", class_name);

          if class_name.contains("global-nav__primary-link") {
            return Some(element);
          }
        } else {
          tracing::error!("element_class_list is empty");
        }
      }
    }

    tracing::error!("my network button from nav not found");
    None
  }

  #[allow(unused)]
  pub async fn get_sent_invitations_element(&self) -> Option<WebElement> {
    let sent_invitations_link = self
      .driver
      .find_all(By::XPath("//span[text()='Sent']/../.."))
      .await
      .ok()?;

    if sent_invitations_link.is_empty() {
      tracing::error!("sent invitations link not found");
      return None;
    }

    Some(sent_invitations_link[0].clone())
  }

  #[allow(unused)]
  pub async fn is_no_pending_invitations_displayed(&self) -> bool {
    let no_invitations_text = self
      .driver
      .find_all(By::XPath("//h2[text()='No pending invitations']"))
      .await;

    match no_invitations_text {
      Ok(elements) => !elements.is_empty(),
      Err(_) => false,
    }
  }

  // pub async fn get_list_of_profiles_in_connections_page(&self) -> Vec<Contact> {
  //   let mut profile_list_for_service = Vec::new();

  //   let elements = match self
  //     .driver
  //     .find_all(By::XPath("//li[contains(@class, 'mn-connection-card')]"))
  //     .await
  //   {
  //     Ok(elements) => elements,
  //     Err(e) => {
  //       tracing::error!("Failed to find connection cards: {}", e);
  //       return profile_list_for_service;
  //     }
  //   };

  //   tracing::info!("len elements = {}", elements.len());

  //   if elements.is_empty() {
  //     tracing::error!("No connection cards found");
  //     return profile_list_for_service;
  //   }

  //   for profile in elements {
  //     let profile_name = match self.get_profile_name_from_connection_profile_element(&profile).await {
  //       Some(name) => name,
  //       None => {
  //         tracing::error!("profile_name is None");
  //         continue;
  //       }
  //     };

  //     let profile_name = self.clean_username(&profile_name);
  //     let profile_url = match self.get_profile_url_from_connection_profile_element(&profile).await {
  //       Some(url) => url,
  //       None => {
  //         tracing::error!("profile_url is None for profile_name: {}", profile_name);
  //         continue;
  //       }
  //     };

  //     profile_list_for_service.push(Contact {
  //       status: ContactStatus::Connection,
  //       profile_url: Some(self.delete_extra_end_slash_from_profile_url(&profile_url).to_string()),
  //       profile_full_name: Some(self.clean_username(&profile_name)),
  //       profile_first_name: None,
  //       id: None,
  //       profile_raw_html: None,
  //     });
  //   }

  //   tracing::info!("profile_list_for_service = {:?}", profile_list_for_service);
  //   tracing::info!("len(profile_list_for_service): {}", profile_list_for_service.len());

  //   profile_list_for_service
  // }

  #[expect(dead_code)]
  async fn get_profile_name_from_connection_profile_element(&self, profile: &WebElement) -> Option<String> {
    let profile_name = match profile
      .find_all(By::XPath(".//span[contains(@class, 'mn-connection-card__name')]"))
      .await
    {
      Ok(elements) => {
        if elements.is_empty() {
          tracing::error!("profile name not found in connection profile element. HTML Structure changed?");
          return None;
        } else {
          match elements[0].text().await {
            Ok(name) => name,
            Err(e) => {
              tracing::error!("Failed to get profile name text: {}", e);
              return None;
            }
          }
        }
      }
      Err(e) => {
        tracing::error!("Failed to find profile name element: {}", e);
        return None;
      }
    };

    Some(profile_name.trim().to_string())
  }

  #[expect(dead_code)]
  async fn get_profile_url_from_connection_profile_element(&self, profile: &WebElement) -> Option<String> {
    let profile_url = match profile.find_all(By::XPath(".//a")).await {
      Ok(elements) => {
        if elements.is_empty() {
          tracing::error!("profile url not found in connection profile element. HTML Structure changed?");
          return None;
        }
        match elements[0].attr("href").await {
          Ok(Some(url)) => url,
          Ok(None) => {
            tracing::error!("profile url attribute not found in connection profile element");
            return None;
          }
          Err(e) => {
            tracing::error!("Failed to get profile url attribute: {}", e);
            return None;
          }
        }
      }
      Err(e) => {
        tracing::error!("Failed to find profile url elements: {}", e);
        return None;
      }
    };

    let profile_url = format!("https://www.linkedin.com{}", profile_url);

    Some(profile_url.trim().to_string())
  }

  #[expect(dead_code)]
  pub async fn get_unread_messages_button(&self) -> Result<WebElement> {
    let unread_button = self
      .driver
      .find_all(By::XPath(
        "//button[text()='Unread'][contains(@class, 'artdeco-pill--choice')]",
      ))
      .await?;

    if unread_button.is_empty() {
      return Err(JaniumError::msg("Unread messages button not found"));
    }

    Ok(unread_button[0].clone())
  }

  /// Gets the three-dots menu button in the message title bar.
  /// This button opens the dropdown with "Mark as read" / "Mark as unread" options.
  pub async fn get_three_dots_menu_button(&self) -> Result<WebElement> {
    let button = self
      .driver
      .find_all(By::Css("div.msg-title-bar div.msg-thread-actions__dropdown button"))
      .await?;

    if button.is_empty() {
      return Err(JaniumError::msg("Three dots menu button not found"));
    }

    Ok(button[0].clone())
  }

  /// Gets the "Mark as read" button from the three-dots dropdown menu.
  /// The dropdown must be open before calling this.
  #[allow(unused)]
  pub async fn get_mark_as_read_button(&self) -> Option<WebElement> {
    let button = self
      .driver
      .find_all(By::XPath(
        "//div[contains(@class, 'artdeco-dropdown__content-inner')]//div[text()='Mark as read']",
      ))
      .await
      .ok()?;

    if button.is_empty() {
      return None;
    }

    Some(button[0].clone())
  }

  /// Gets the "Mark as unread" button from the three-dots dropdown menu.
  /// The dropdown must be open before calling this.
  pub async fn get_mark_as_unread_button(&self) -> Option<WebElement> {
    let button = self
      .driver
      .find_all(By::XPath(
        "//div[contains(@class, 'artdeco-dropdown__content-inner')]//div[text()='Mark as unread']",
      ))
      .await
      .ok()?;

    if button.is_empty() {
      return None;
    }

    Some(button[0].clone())
  }

  #[expect(dead_code)]
  pub async fn get_unread_conversation_contact_names(&self) -> Result<Vec<String>, WebDriverError> {
    let messages_list_to_scroll = self
      .driver
      .find_all(By::XPath("//div[contains(@class, 'msg__list')]//ul"))
      .await?;

    let mut last_scroll_height = 0;

    Delay::Load.await;

    loop {
      let this_scroll_height = self
        .driver
        .execute(
          "
            var elem = arguments[0];
            elem.scrollTo(0, elem.scrollHeight);

            return elem.scrollHeight;
            ",
          vec![messages_list_to_scroll[0].to_json()?],
        )
        .await
        .unwrap()
        .json()
        .as_i64()
        .unwrap();

      Delay::Load.await;

      self
        .driver
        .execute(
          "
            var elem = arguments[0];
            elem.scrollTo(0, 0);
            ",
          vec![messages_list_to_scroll[0].to_json()?],
        )
        .await?;

      Delay::Load.await;

      if this_scroll_height == last_scroll_height {
        tracing::info!("Reached the end of the scrollable area.");
        break;
      } else {
        tracing::info!("Scrolling... Current scroll height: {}", this_scroll_height);
        last_scroll_height = this_scroll_height;
      }
    }

    Delay::Scroll.await;

    let unread_chats_contact_name = self.driver.find_all(
        By::XPath(
        "//div[contains(@class, 'msg__list')]//ul//li//div[contains(@class, 'msg-conversation-card__rows')]//span[contains(@class, 'notification-badge notification-badge--show')]/../../../../..//h3//span")
    ).await?;

    let mut output = vec![];

    for element in unread_chats_contact_name {
      let contact_name = element.text().await;

      if let Ok(contact_name) = contact_name {
        output.push(contact_name)
      } else {
        tracing::error!("Contact name is None for element: {:?}", element);
      }
    }

    Ok(output)
  }

  #[expect(dead_code)]
  pub async fn get_next_unread_conversation(&self, ignore_list: &[String]) -> Result<Option<(WebElement, String)>> {
    let messages_list_to_scroll = self
      .driver
      .find_all(By::XPath("//div[contains(@class, 'msg__list')]//ul"))
      .await?;

    if messages_list_to_scroll.is_empty() {
      return Ok(None);
    }

    let mut last_scroll_height = 0;
    let mut this_scroll_height;

    Delay::Load.await;

    loop {
      let unread_conversations = self.driver.find_all(By::XPath("//div[contains(@class, 'msg__list')]//ul//li//div[contains(@class, 'msg-conversation-card__rows')]//span[contains(@class, 'notification-badge notification-badge--show')]/../../../../../..")).await?;

      let unread_conversations_contact_names = self.driver.find_all(By::XPath("//div[contains(@class, 'msg__list')]//ul//li//div[contains(@class, 'msg-conversation-card__rows')]//span[contains(@class, 'notification-badge notification-badge--show')]/../../../../../..//h3//span")).await?;

      for i in 0..unread_conversations.len() {
        let unread_conversation = &unread_conversations[i];
        let contact_name = &unread_conversations_contact_names[i];

        if let Ok(name) = contact_name.text().await
          && !ignore_list.contains(&name)
        {
          // this_scroll_height = driver.execute(
          //     r#"
          //     var elem = arguments[0];
          //     elem.scrollTo(0, elem.scrollHeight);
          //     return elem.scrollHeight;
          //     "#,
          //     vec![unread_conversation.clone().to_json()?],
          // ).await?
          // .json()
          // .as_i64().unwrap();

          return Ok(Some((unread_conversation.clone(), name)));
        }
      }

      this_scroll_height = self
        .driver
        .execute(
          r#"
            var elem = arguments[0];
            elem.scrollTo(0, elem.scrollHeight);
            return elem.scrollHeight;
            "#,
          vec![messages_list_to_scroll[0].clone().to_json()?],
        )
        .await?
        .json()
        .as_i64()
        .unwrap();

      self
        .driver
        .execute(
          "
            var elem = arguments[0];
            elem.scrollTo(0, 0);
            ",
          vec![messages_list_to_scroll[0].to_json()?],
        )
        .await?;

      Delay::Scroll.await;

      if this_scroll_height == last_scroll_height {
        break;
      } else {
        last_scroll_height = this_scroll_height;
      }
    }

    tracing::info!("last_scroll_height: {}", last_scroll_height);

    Ok(None)
  }

  /// Checks if a conversation element has an unread indicator (notification badge).
  /// This should be called BEFORE clicking the conversation.
  pub async fn is_conversation_unread(&self, conversation_element: &WebElement) -> bool {
    // Look for the notification badge within this conversation element
    let badge = conversation_element
      .find_all(By::XPath(
        ".//span[contains(@class, 'notification-badge notification-badge--show')]",
      ))
      .await;

    match badge {
      Ok(elements) => !elements.is_empty(),
      Err(_) => false,
    }
  }

  /// Gets all conversation elements from the messaging inbox (not just unread).
  /// Returns a vector of (conversation_element, contact_name) tuples.
  #[expect(dead_code)]
  pub async fn get_all_conversation_elements(&self) -> Result<Vec<(WebElement, String)>> {
    tracing::info!("Getting all conversation elements from inbox");

    let messages_list = self
      .driver
      .find_all(By::XPath("//div[contains(@class, 'msg__list')]//ul"))
      .await?;

    if messages_list.is_empty() {
      tracing::warn!("No message list found in inbox");
      return Ok(vec![]);
    }

    // Scroll through the list to load all conversations
    let mut last_scroll_height = 0i64;

    Delay::Load.await;

    loop {
      let this_scroll_height = self
        .driver
        .execute(
          r#"
            var elem = arguments[0];
            elem.scrollTo(0, elem.scrollHeight);
            return elem.scrollHeight;
          "#,
          vec![messages_list[0].to_json()?],
        )
        .await?
        .json()
        .as_i64()
        .unwrap_or(0);

      Delay::Scroll.await;

      // Scroll back to top
      self
        .driver
        .execute(
          "var elem = arguments[0]; elem.scrollTo(0, 0);",
          vec![messages_list[0].to_json()?],
        )
        .await?;

      Delay::Scroll.await;

      if this_scroll_height == last_scroll_height {
        tracing::info!("Reached the end of conversation list");
        break;
      }

      tracing::info!("Scrolling conversation list... height: {}", this_scroll_height);
      last_scroll_height = this_scroll_height;
    }

    // Now find all conversation elements (li items in the list)
    // XPath: Find all li elements that contain a conversation card
    let conversations = self
      .driver
      .find_all(By::XPath(
        "//div[contains(@class, 'msg__list')]//ul/li[.//div[contains(@class, 'msg-conversation-card')]]",
      ))
      .await?;

    let mut results = Vec::new();

    for conv in conversations {
      // Extract contact name from within this conversation element
      // The name is typically in an h3 > span structure
      let name_element = conv
        .find_all(By::XPath(".//h3//span[not(contains(@class, 'visually-hidden'))]"))
        .await;

      let contact_name = match name_element {
        Ok(elements) if !elements.is_empty() => elements[0].text().await.unwrap_or_else(|_| "Unknown".to_string()),
        _ => "Unknown".to_string(),
      };

      if !contact_name.is_empty() && contact_name != "Unknown" {
        results.push((conv, contact_name));
      }
    }

    tracing::info!("Found {} conversations in inbox", results.len());
    Ok(results)
  }

  /// Fire-and-forget JS that starts a `setInterval` to auto-scroll the sidebar.
  /// Stores state on `window.__zxqScroll` so Rust can poll the count cheaply.
  /// The interval self-terminates after `noChangeTimeoutMs` with no new items.
  const START_SCROLL_JS: &'static str = r#"
    var ul = arguments[0];
    var noChangeTimeoutMs = arguments[1];
    var scrollIntervalMs = arguments[2];
    var maxCount = arguments[3] || 0;
    var selector = 'li div.msg-conversation-card';
    var state = {
      count: ul.querySelectorAll(selector).length,
      done: false,
      noChangeSince: Date.now()
    };
    window.__zxqScroll = state;
    var interval = setInterval(function() {
      // Check for LinkedIn "Oops" load failure and click "Try again" after a brief delay
      var tryAgain = document.querySelector('button.msg-conversations-container__try-again-button');
      if (tryAgain) {
        if (!state.retryAt) {
          state.retryAt = Date.now() + 1500 + Math.random() * 2000;
        } else if (Date.now() >= state.retryAt) {
          tryAgain.click();
          state.retryAt = null;
        }
        state.noChangeSince = Date.now();
        return;
      }
      state.retryAt = null;
      ul.scrollBy(0, ul.clientHeight);
      var count = ul.querySelectorAll(selector).length;
      if (count > state.count) {
        state.count = count;
        state.noChangeSince = Date.now();
      }
      if ((maxCount > 0 && state.count >= maxCount) || Date.now() - state.noChangeSince >= noChangeTimeoutMs) {
        clearInterval(interval);
        state.done = true;
      }
    }, scrollIntervalMs);
  "#;

  /// Cheap JS to read the current scroll state without touching the DOM element list.
  const POLL_SCROLL_JS: &'static str = r#"
    var s = window.__zxqScroll;
    if (!s) return {count: 0, done: true};
    return {count: s.count, done: s.done};
  "#;

  /// Starts background JS scrolling and polls until done or the count stabilizes.
  /// Returns the final conversation count loaded in the DOM.
  async fn scroll_conversation_sidebar(&self, scroll_to_top: bool, max_count: Option<usize>) -> Result<u64> {
    let messages_list = self
      .driver
      .find_all(By::XPath("//div[contains(@class, 'msg__list')]//ul"))
      .await?;

    if messages_list.is_empty() {
      return Ok(0);
    }

    // Kick off the background scroll interval
    self
      .driver
      .execute(
        Self::START_SCROLL_JS,
        vec![
          messages_list[0].to_json()?,
          30000.into(),                  // noChangeTimeoutMs
          2000.into(),                   // scrollIntervalMs
          max_count.unwrap_or(0).into(), // maxCount (0 = unlimited)
        ],
      )
      .await?;

    // Poll until the JS interval marks itself done
    let count = loop {
      Delay::Ms(3000).await;

      let result = self.driver.execute(Self::POLL_SCROLL_JS, vec![]).await?.json().clone();
      let count = result.get("count").and_then(|v| v.as_u64()).unwrap_or(0);
      let done = result.get("done").and_then(|v| v.as_bool()).unwrap_or(true);

      tracing::debug!(
        "Sidebar scroll: {count} conversations loaded{}",
        if done { " (done)" } else { "" }
      );

      if done || max_count.is_some_and(|max| count as usize >= max) {
        break count;
      }
    };

    if scroll_to_top {
      self
        .driver
        .execute(
          "var elem = arguments[0]; elem.scrollTo(0, 0);",
          vec![messages_list[0].to_json()?],
        )
        .await?;
      Delay::Scroll.await;
    }

    Ok(count)
  }

  /// Scrolls the messaging sidebar to load all conversations into the DOM.
  ///
  /// LinkedIn keeps all `<li>` elements in the DOM (no virtualization), so we
  /// scroll incrementally until no new items appear for ~30 seconds.
  pub async fn scroll_to_load_all_conversations(&self, max_count: Option<usize>) -> Result<u64> {
    let count = self.scroll_conversation_sidebar(false, max_count).await?;
    tracing::info!("Loaded all {count} conversations");
    Ok(count)
  }

  /// Gets the next conversation from the inbox starting at `start_index`.
  ///
  /// Fetches elements in batches (by XPath position range) so we never re-query
  /// already-processed conversations. If we run out of loaded items, scrolls to
  /// load more unless a previous scroll already exhausted the list.
  ///
  /// Returns `(element, contact_name)` and the caller should increment `start_index`
  /// for the next call regardless of whether the conversation was skipped.
  ///
  /// # Arguments
  /// * `start_index` - 0-based index into the conversation list to start from
  pub async fn get_next_conversation(
    &self,
    start_index: usize,
    max_count: Option<usize>,
  ) -> Result<Option<(WebElement, String)>> {
    let conv_xpath = "//div[contains(@class, 'msg__list')]//ul/li[.//div[contains(@class, 'msg-conversation-card')]]";

    // Try to fetch the element at start_index (1-based XPath position)
    let xpath = format!("({conv_xpath})[{}]", start_index + 1);
    match self.driver.find(By::XPath(&xpath)).await {
      Ok(element) => {
        let name_element = element
          .find_all(By::XPath(".//h3//span[not(contains(@class, 'visually-hidden'))]"))
          .await;

        let contact_name = match name_element {
          Ok(elements) if !elements.is_empty() => elements[0].text().await.unwrap_or_else(|_| "Unknown".to_string()),
          _ => "Unknown".to_string(),
        };

        return Ok(Some((element, contact_name)));
      }
      Err(_) => {
        // Element doesn't exist yet — try scrolling to load more
      }
    }

    // Check if a previous scroll already loaded everything (e.g. full_sync)
    let already_scrolled = self
      .driver
      .execute(Self::POLL_SCROLL_JS, vec![])
      .await
      .map(|v| v.json().get("done").and_then(|v| v.as_bool()).unwrap_or(false))
      .unwrap_or(false);

    if already_scrolled {
      tracing::info!("Sidebar already fully scrolled, no conversation at index {start_index}");
      return Ok(None);
    }

    // Scroll to load more conversations
    let final_count = self.scroll_conversation_sidebar(false, max_count).await?;

    // Try again after scrolling
    let xpath = format!("({conv_xpath})[{}]", start_index + 1);
    match self.driver.find(By::XPath(&xpath)).await {
      Ok(element) => {
        let name_element = element
          .find_all(By::XPath(".//h3//span[not(contains(@class, 'visually-hidden'))]"))
          .await;

        let contact_name = match name_element {
          Ok(elements) if !elements.is_empty() => elements[0].text().await.unwrap_or_else(|_| "Unknown".to_string()),
          _ => "Unknown".to_string(),
        };

        Ok(Some((element, contact_name)))
      }
      Err(_) => {
        tracing::info!("No conversation at index {start_index} after scrolling (total loaded: {final_count})");
        Ok(None)
      }
    }
  }

  /// Extracts the conversation/thread ID from the current URL.
  /// LinkedIn messaging URLs look like: /messaging/thread/{threadId}/
  pub async fn get_conversation_id_from_url(&self) -> Result<Option<String>> {
    let url = self.driver.current_url().await?;
    let path = url.path();

    // Expected format: /messaging/thread/{threadId}/
    if path.starts_with("/messaging/thread/") {
      let parts: Vec<&str> = path.split('/').collect();
      // parts should be ["", "messaging", "thread", "{threadId}", ""]
      if parts.len() >= 4 {
        let thread_id = parts[3].to_string();
        if !thread_id.is_empty() {
          tracing::info!("Extracted conversation ID: {}", thread_id);
          return Ok(Some(thread_id));
        }
      }
    }

    tracing::debug!("No conversation ID found in URL: {}", url);
    Ok(None)
  }

  #[expect(dead_code)]
  pub async fn get_message_content(
    &self,
    current_message_contact_name: Option<&str>,
  ) -> Result<Option<(String, String, String)>> {
    tracing::info!("getting message content");

    let message_contact_name = self.driver.find_all(
        By::XPath(
        "//ul[contains(@class, 'msg-s-message-list-content')]//span[contains(@class, 'msg-s-message-group__profile-link msg-s-message-group__name')]"),
    ).await?;

    if message_contact_name.is_empty() {
      tracing::error!("message_contact_name not found");
      return Ok(None);
    }

    for (i, contact_name) in message_contact_name.iter().enumerate() {
      let message_contact_name_text = contact_name.text().await?;

      tracing::info!("all messages outerText {i} => {message_contact_name_text}");
    }

    let index_of_last_message = message_contact_name.len() - 1;

    tracing::info!("index of last message = {index_of_last_message}");

    let mut message_contact_name = if let Ok(value) = message_contact_name[index_of_last_message].text().await {
      value
    } else {
      tracing::error!("message_contact_name is not present");
      return Ok(None);
    };

    let masked_contact_url = self.driver.find_all(
        By::XPath(
        "//ul[contains(@class, 'msg-s-message-list-content')]//span[contains(@class, 'msg-s-message-group__profile-link msg-s-message-group__name')]/..")
    ).await?;

    let mut index_of_masked_contact_url = masked_contact_url.len() - 1;

    for (i, masked_contact_url) in masked_contact_url.iter().enumerate() {
      let mut current_masked_url_contact_name = masked_contact_url.text().await?;

      tracing::info!(
        "all masked_contact_url outerText {i} => {}",
        current_masked_url_contact_name
      );

      if let Some(current_message_contact_name) = current_message_contact_name {
        current_masked_url_contact_name = masked_contact_url
          .find_all(By::Css("span"))
          .await?
          .first()
          .unwrap()
          .text()
          .await?;

        if current_masked_url_contact_name == current_message_contact_name {
          index_of_masked_contact_url = i;
          break;
        }
      }
    }

    tracing::info!("previous message_contact_name = {}", message_contact_name);

    message_contact_name = masked_contact_url.last().unwrap().text().await?;

    tracing::info!("updated message_contact_name = {}", message_contact_name);

    tracing::info!("len of masked_contact_url = {}", masked_contact_url.len());

    tracing::info!("index_of_masked_contact_url = {}", index_of_masked_contact_url);

    let masked_contact_url = masked_contact_url[index_of_masked_contact_url].attr("href").await?;

    let mut list_of_message_texts = self
      .driver
      .find_all(By::XPath(
        "//li[contains(@class, 'msg-s-message-list__event clearfix')]",
      ))
      .await?;

    if list_of_message_texts.is_empty() {
      return Err(JaniumError::msg("list_of_message_texts not found"));
    };

    let mut new_messages = vec![];

    tracing::info!("list_of_message_texts len {}", list_of_message_texts.len());
    tracing::info!("list_of_message_texts {:?}", list_of_message_texts);

    list_of_message_texts.reverse();

    for (i, message_row) in list_of_message_texts.iter().enumerate() {
      tracing::info!("i = {}", i);

      let mut message_row_content = message_row
        .find_all(By::XPath(".//div[contains(@class, 'msg-s-event__content')]//p/.."))
        .await?;

      if message_row_content.is_empty() {
        tracing::warn!("message_row_content not found for contact {}", message_contact_name);

        message_row_content = message_row
          .find_all(By::XPath(".//div[contains(@class, 'msg-s-event__content')]/div/p/.."))
          .await?;
      }

      if message_row_content.is_empty() {
        tracing::error!("message_row_content not found for contact {}", message_contact_name);

        continue;
      }

      let message_row_content = message_row_content[0].text().await;

      let mut message_row_content = if let Ok(msg) = message_row_content {
        msg
      } else {
        return Err(JaniumError::msg(format!(
          "message_row_content is None for contact {message_contact_name}",
        )));
      };

      message_row_content = message_row_content.trim().to_string();

      tracing::info!("message_row_content: {}", message_row_content);

      new_messages.push(message_row_content);

      let message_row_has_profile_title = message_row
        .find_all(By::XPath(
          ".//a/span[contains(@class, 'msg-s-message-group__profile-link')]",
        ))
        .await?;

      if !message_row_has_profile_title.is_empty() {
        break;
      }
    }

    new_messages.reverse();

    tracing::info!("new_messages: {}", new_messages.join(", "));

    let mut message_text_content = new_messages.join(" \n");

    tracing::info!("message_text_content: {}", message_text_content);

    let mut masked_contact_url = if let Some(value) = masked_contact_url {
      value
    } else {
      return Err(JaniumError::msg(format!(
        "masked_contact_url is None for contact {message_contact_name}",
      )));
    };

    message_contact_name = message_contact_name.trim().to_string();
    message_text_content = message_text_content.trim().to_string();
    masked_contact_url = masked_contact_url.trim().to_string();

    Ok(Some((message_text_content, message_contact_name, masked_contact_url)))
  }

  pub fn get_sales_navigator_url_to_visit_per_page(&self, mut sales_navigator_url: url::Url, page: i32) -> url::Url {
    let mut query_params = sales_navigator_url
      .query_pairs()
      .map(|(key, value)| (key.to_string(), value.to_string()))
      // Use BTree so that "page" is always before "query"
      .collect::<std::collections::BTreeMap<_, _>>();
    query_params.remove("page");
    if page >= 2 {
      query_params.insert("page".into(), page.to_string());
    }

    sales_navigator_url
      .query_pairs_mut()
      .clear()
      .extend_pairs(query_params)
      .finish();

    sales_navigator_url
  }

  #[expect(dead_code)]
  pub fn get_sales_navigator_url_without_page_number(&self, sales_navigator_url: &str) -> String {
    let re = Regex::new(r"page=\d+&").unwrap();

    if let Some(found_page_string) = re.find(sales_navigator_url) {
      return sales_navigator_url.replace(found_page_string.as_str(), "");
    }

    sales_navigator_url.to_string()
  }

  /// Gets the Sales Navigator icon button element if it exists
  #[allow(unused)]
  pub async fn get_sales_navigator_icon_button(&self) -> Result<Option<WebElement>> {
    let home_button = self
      .driver
      .find_all(By::XPath("//div/div//span[text()='Sales Navigator']"))
      .await?;

    if home_button.len() == 1 {
      Ok(Some(home_button[0].clone()))
    } else {
      Ok(None)
    }
  }

  /// Gets the Sales Navigator home button element if it exists
  #[allow(unused)]
  pub async fn get_sales_navigator_home_button(&self) -> Result<Option<WebElement>> {
    let home_button = self
      .driver
      .find_all(By::XPath("//ul/li//a/span[text()='Home']"))
      .await?;

    if home_button.len() == 1 {
      Ok(Some(home_button[0].clone()))
    } else {
      Ok(None)
    }
  }

  /// Gets the Sales Navigator accounts button element if it exists
  #[allow(unused)]
  pub async fn get_sales_navigator_accounts_button(&self) -> Result<Option<WebElement>> {
    let accounts_button = self.driver.find_all(By::XPath("//ul/li//a[text()='Accounts']")).await?;

    if accounts_button.len() == 1 {
      Ok(Some(accounts_button[0].clone()))
    } else {
      Ok(None)
    }
  }

  /// Gets the Sales Navigator leads button element if it exists
  #[allow(unused)]
  pub async fn get_sales_navigator_leads_button(&self) -> Result<Option<WebElement>> {
    let leads_button = self.driver.find_all(By::XPath("//ul/li//a[text()='Leads']")).await?;

    if leads_button.len() == 1 {
      Ok(Some(leads_button[0].clone()))
    } else {
      Ok(None)
    }
  }

  /// Gets the Sales Navigator messaging button element if it exists
  #[allow(unused)]
  pub async fn get_sales_navigator_messaging_button(&self) -> Result<Option<WebElement>> {
    let messaging_button = self
      .driver
      .find_all(By::XPath("//ul/li//a/div/span[text()='Messaging']"))
      .await?;

    if messaging_button.len() == 1 {
      Ok(Some(messaging_button[0].clone()))
    } else {
      Ok(None)
    }
  }

  /// Checks if the current page is a Sales Navigator page by verifying the presence of key UI elements
  #[expect(dead_code)]
  pub async fn is_on_sales_navigator_page(&self) -> Result<bool> {
    tracing::trace!("ensuring on sales navigator page");
    let icon_button = self.get_sales_navigator_icon_button().await?;
    tracing::trace!("icon_button: {:?}", icon_button);
    let home_button = self.get_sales_navigator_home_button().await?;
    tracing::trace!("home_button: {:?}", home_button);
    let accounts_button = self.get_sales_navigator_accounts_button().await?;
    tracing::trace!("accounts_button: {:?}", accounts_button);
    let leads_button = self.get_sales_navigator_leads_button().await?;
    tracing::trace!("leads_button: {:?}", leads_button);
    let messaging_button = self.get_sales_navigator_messaging_button().await?;
    tracing::trace!("messaging_button: {:?}", messaging_button);

    Ok(
      icon_button.is_some()
        && home_button.is_some()
        && accounts_button.is_some()
        && leads_button.is_some()
        && messaging_button.is_some(),
    )
  }

  pub async fn is_next_page_button_enabled(&self) -> Result<bool> {
    // Scroll to end of page
    self
      .driver
      .execute("window.scrollTo(0, document.body.scrollHeight);", vec![])
      .await?;

    // Wait for 5 seconds
    Delay::Load.await;

    // Find the next page button (using find_all to handle missing button gracefully)
    // Try exact text match first
    let mut next_page_buttons = self
      .driver
      .find_all(By::XPath(
        "//button[contains(@class, 'artdeco-pagination__button--next')]/span[text()='Next']/..",
      ))
      .await?;

    // Fallback: try with normalize-space to handle whitespace variations
    if next_page_buttons.is_empty() {
      tracing::debug!("Next button not found with exact text match, trying normalize-space fallback");
      next_page_buttons = self
        .driver
        .find_all(By::XPath(
          "//button[contains(@class, 'artdeco-pagination__button--next')]/span[normalize-space(text())='Next']/..",
        ))
        .await?;
    }

    // Final fallback: just find the button by class (no span text check)
    if next_page_buttons.is_empty() {
      tracing::debug!("Next button not found with normalize-space, trying class-only fallback");
      next_page_buttons = self
        .driver
        .find_all(By::XPath(
          "//button[contains(@class, 'artdeco-pagination__button--next')]",
        ))
        .await?;
    }

    // If no next page button found, we're on the last page
    let Some(next_page_button) = next_page_buttons.first() else {
      tracing::debug!("No next page button found after all fallbacks - assuming last page");
      return Ok(false);
    };

    // Check if button is disabled
    let is_disabled = next_page_button.attr("disabled").await?;

    Ok(is_disabled.is_none_or(|s| s != "true"))
  }

  /// Clicks the "Next" page button if it exists and is enabled.
  /// Returns Ok(true) if successfully clicked, Ok(false) if no next page.
  pub async fn click_next_page_button(&mut self) -> Result<bool> {
    // Scroll to end of page
    self
      .driver
      .execute("window.scrollTo(0, document.body.scrollHeight);", vec![])
      .await?;

    Delay::Load.await;

    // Find the next button - try exact text match first
    let mut next_page_buttons = self
      .driver
      .find_all(By::XPath(
        "//button[contains(@class, 'artdeco-pagination__button--next')]/span[text()='Next']/..",
      ))
      .await?;

    // Fallback: try with normalize-space
    if next_page_buttons.is_empty() {
      tracing::debug!("Next button not found with exact text match, trying normalize-space fallback");
      next_page_buttons = self
        .driver
        .find_all(By::XPath(
          "//button[contains(@class, 'artdeco-pagination__button--next')]/span[normalize-space(text())='Next']/..",
        ))
        .await?;
    }

    // Final fallback: just find the button by class
    if next_page_buttons.is_empty() {
      tracing::debug!("Next button not found with normalize-space, trying class-only fallback");
      next_page_buttons = self
        .driver
        .find_all(By::XPath(
          "//button[contains(@class, 'artdeco-pagination__button--next')]",
        ))
        .await?;
    }

    let Some(next_page_button) = next_page_buttons.first() else {
      tracing::debug!("No next page button found");
      return Ok(false);
    };

    // Check if disabled
    let is_disabled = next_page_button.attr("disabled").await?;
    if is_disabled.is_some_and(|s| s == "true") {
      tracing::debug!("Next page button is disabled");
      return Ok(false);
    }

    // Click the button
    tracing::info!("Clicking next page button");
    self.mouse_to_click(next_page_button).await?;

    // Wait for new page to load
    Delay::BigLoad.await;

    Ok(true)
  }

  pub async fn is_on_sales_navigator_profile(&self) -> Result<bool> {
    let url = self.driver.current_url().await?;
    tracing::trace!(%url, domain= url.domain(), path= url.path(), "is_on_sales_navigator_profile");
    if let Some(domain) = url.domain()
      && domain.ends_with("linkedin.com")
      && url.path().starts_with("/sales/lead/")
    {
      return Ok(true);
    }
    Ok(false)
    // let icon_button = self.get_sales_navigator_icon_button().await?;
    // let home_button = self.get_sales_navigator_home_button().await?;
    // let accounts_button = self.get_sales_navigator_accounts_button().await?;
    // let leads_button = self.get_sales_navigator_leads_button().await?;
    // let messaging_button = self.get_sales_navigator_messaging_button().await?;
    // let about_profile_section = self.get_sales_nav_about_profile_section_header().await?;
    // let contact_information = self.get_sales_nav_contact_information_header().await?;
    // tracing::info!(
    //   icon_button = icon_button.is_some(),
    //   home_button = home_button.is_some(),
    //   accounts_button = accounts_button.is_some(),
    //   leads_button = leads_button.is_some(),
    //   messaging_button = messaging_button.is_some(),
    //   about_profile_section = about_profile_section.is_some(),
    //   contact_information = contact_information.is_some(),
    //   "is_on_sales_navigator_profile"
    // );
    // Ok(
    //   icon_button.is_some()
    //     && home_button.is_some()
    //     && accounts_button.is_some()
    //     && leads_button.is_some()
    //     && messaging_button.is_some()
    //     && about_profile_section.is_some()
    //     && contact_information.is_some(),
    // )
  }

  #[expect(dead_code)]
  pub async fn get_sales_nav_about_profile_section_header(&self) -> Result<Option<WebElement>> {
    let about_profile_section = self.driver.find_all(By::XPath("//section/h1[text()='About']")).await?;

    if about_profile_section.len() == 1 {
      Ok(Some(about_profile_section[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[expect(dead_code)]
  pub async fn get_sales_nav_contact_information_header(&self) -> Result<Option<WebElement>> {
    let about_profile_section = self
      .driver
      .find_all(By::XPath("//section/h2[text()='Contact information']"))
      .await?;

    if about_profile_section.len() == 1 {
      Ok(Some(about_profile_section[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[expect(dead_code)]
  pub async fn try_get_profile_header(&self) -> Result<Option<String>> {
    // Try first XPath pattern
    let profile_header = self
      .driver
      .find_all(By::XPath(
        "//section[contains(@class, 'artdeco-card')]/div/ul//span[contains(., 'connections')]/../../../..",
      ))
      .await?;

    if !profile_header.is_empty() {
      let profile_header_html = profile_header[0].outer_html().await?;
      return Ok(Some(profile_header_html));
    }

    // Try second XPath pattern
    let profile_header = self.driver.find_all(By::XPath(
        "//main[contains(@class, 'scaffold-layout__main')]//section[contains(@class, 'artdeco-card')]/div/ul/li[contains(., 'followers')]/../../.."
    )).await?;

    if !profile_header.is_empty() {
      let profile_header_html = profile_header[0].outer_html().await?;
      return Ok(Some(profile_header_html));
    }

    // Try third XPath pattern
    let profile_header = self
      .driver
      .find_all(By::XPath(
        "//section[contains(@class, 'artdeco-card')]/div//span/a[text()='Contact info']/../../../../..",
      ))
      .await?;

    if !profile_header.is_empty() {
      let profile_header_html = profile_header[0].outer_html().await?;
      return Ok(Some(profile_header_html));
    }

    Ok(None)
  }

  #[allow(unused)]
  pub async fn get_more_button_from_profile_page_element(&self) -> Result<Option<WebElement>> {
    let profile_more_element = self
      .driver
      .find_all(By::XPath(
        "//section[contains(@class, 'artdeco-card')]/div/div/div/div/button/span[text()='More']",
      ))
      .await?;

    if !profile_more_element.is_empty() {
      return Ok(Some(profile_more_element[0].clone()));
    }

    Ok(None)
  }

  #[allow(unused)]
  pub async fn get_connect_button_from_more_dropdown(&self) -> Result<Option<WebElement>> {
    let in_dropdown_menu_connect_element = self.driver.find_all(By::XPath(
        "//section[contains(@class, 'artdeco-card')]/div/div/div/div/div/div[contains(@class, 'artdeco-dropdown__content-inner')]/ul/li/div[contains(@class, 'artdeco-dropdown__item')]/span[text()='Connect']"
    )).await?;

    if !in_dropdown_menu_connect_element.is_empty() {
      return Ok(Some(in_dropdown_menu_connect_element[0].clone()));
    }

    Ok(None)
  }

  #[allow(unused)]
  pub async fn get_connect_from_profile_page_element(&self) -> Result<Option<WebElement>> {
    let connect_element = self
      .driver
      .find_all(By::XPath(
        "//section[contains(@class, 'artdeco-card')]/div/div/div/button/span[text()='Connect']",
      ))
      .await?;

    if !connect_element.is_empty() {
      return Ok(Some(connect_element[0].clone()));
    }

    Ok(None)
  }

  #[allow(unused)]
  pub async fn get_pending_indicator_from_profile_page_element(&self) -> Result<Option<WebElement>> {
    let connect_element = self
      .driver
      .find_all(By::XPath(
        "//section[contains(@class, 'artdeco-card')]/div/div/div/button/span[text()='Pending']",
      ))
      .await?;

    if !connect_element.is_empty() {
      return Ok(Some(connect_element[0].clone()));
    }

    Ok(None)
  }

  #[expect(dead_code)]
  pub async fn get_follow_from_profile_page_element(&self) -> Result<Option<WebElement>> {
    let follow_elements = self
      .driver
      .find_all(By::XPath(
        "//section[contains(@class, 'artdeco-card')]/div/div/div/button/span[text()='Follow']",
      ))
      .await?;

    if follow_elements.len() == 1 {
      Ok(Some(follow_elements[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[expect(dead_code)]
  pub async fn get_pending_button_from_more_dropdown(&self) -> Result<Option<WebElement>> {
    let pending_elements = self.driver
        .find_all(By::XPath(
            "//section[contains(@class, 'artdeco-card')]/div/div/div/div/div/div[contains(@class, 'artdeco-dropdown__content-inner')]/ul/li/div[contains(@class, 'artdeco-dropdown__item')]/span[text()='Pending']"
        ))
        .await?;

    if pending_elements.len() == 1 {
      Ok(Some(pending_elements[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[expect(dead_code)]
  pub async fn get_add_a_note_element(&self) -> Result<Option<WebElement>> {
    let add_a_note_elements = self
      .driver
      .find_all(By::XPath(
        "//button[not(contains(@class, 'artdeco-button--disabled'))]//span[text()='Add a note']",
      ))
      .await?;

    if add_a_note_elements.len() == 1 {
      Ok(Some(add_a_note_elements[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[expect(dead_code)]
  pub async fn get_add_a_note_text_area(&self) -> Result<Option<WebElement>> {
    let text_elements = self
      .driver
      .find_all(By::XPath("//textarea[@id = 'custom-message']"))
      .await?;

    if text_elements.len() == 1 {
      Ok(Some(text_elements[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[expect(dead_code)]
  pub async fn get_send_button(&self, with_note: bool) -> Result<Option<WebElement>> {
    let send_without_a_note_elements = self.driver
        .find_all(By::XPath(
            "//div[contains(@class, 'artdeco-modal')]//div[contains(@class, 'artdeco-modal__actionbar')]//button[not(contains(@class, 'artdeco-button--disabled'))]/span[text()='Send without a note']"
        ))
        .await?;

    let send_elements = self.driver
        .find_all(By::XPath(
            "//div[contains(@class, 'artdeco-modal')]//div[contains(@class, 'artdeco-modal__actionbar')]//span[text()='Send']"
        ))
        .await?;

    // If not adding a note, try to find "Send without a note" button first
    if !with_note && send_without_a_note_elements.len() == 1 {
      return Ok(Some(send_without_a_note_elements[0].clone()));
    }

    // Otherwise, or if "Send without a note" not found, try the regular "Send" button
    if send_elements.len() == 1 {
      return Ok(Some(send_elements[0].clone()));
    }

    Ok(None)
  }

  #[allow(unused)]
  pub async fn get_send_message_button_from_profile(&self) -> Result<Option<WebElement>> {
    let send_message_button_elements = self.driver.find_all(By::XPath("//span[text()='Message']")).await?;

    for element in &send_message_button_elements {
      let inner_text = element.text().await?;
      if inner_text == "Message" {
        return Ok(Some(element.clone()));
      }
    }

    Ok(None)
  }

  #[allow(unused)]
  pub async fn get_send_button_from_message_editor(&self) -> Result<Option<WebElement>> {
    let send_button_elements = self.driver.find_all(By::XPath("//button[text()='Send']")).await?;

    if send_button_elements.len() == 1 {
      Ok(Some(send_button_elements.into_iter().next().unwrap()))
    } else {
      Ok(None)
    }
  }

  #[allow(unused)]
  pub async fn get_manage_invitations_title(&self) -> Result<Option<WebElement>> {
    let elements = self
      .driver
      .find_all(By::XPath("//h1[text()='Manage invitations']"))
      .await?
      .pop();

    let other_elements = self
      .driver
      .find_all(By::XPath("//p[text()='Manage invitations']"))
      .await?
      .pop();

    if let Some(found_element) = elements.or(other_elements) {
      Ok(Some(found_element))
    } else {
      Ok(None)
    }
  }

  #[allow(unused)]
  pub async fn get_next_button_from_sent_invitations(&self) -> Result<Option<WebElement>> {
    let elements = self.driver.find_all(By::XPath("//button/span[text()='Next']")).await?;

    if elements.len() == 1 {
      Ok(Some(elements.into_iter().next().unwrap()))
    } else {
      Ok(None)
    }
  }

  #[allow(unused)]
  pub async fn get_withdraw_buttons_from_sent_invitations(&self) -> Result<Vec<WebElement>> {
    let withdraw_buttons = self
      .driver
      .find_all(By::XPath("//span[text()='Withdraw']/../.."))
      .await?;
    Ok(withdraw_buttons)
  }

  #[expect(dead_code)]
  pub async fn get_popup_withdraw_button_confirmation(&self) -> Result<Option<WebElement>> {
    let withdraw_buttons = self
      .driver
      .find_all(By::XPath("//span[text()='Withdraw']/../.."))
      .await?;

    Ok(withdraw_buttons.last().cloned())
  }
}
