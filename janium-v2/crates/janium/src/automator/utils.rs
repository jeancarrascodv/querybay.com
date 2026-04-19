use super::Automator;
use crate::prelude::*;
use rand::{RngExt, rng};
use regex::Regex;
use std::time::Duration;
use thirtyfour::{ElementRect, prelude::*};

#[derive(Debug, Clone, Copy)]
#[must_use]
pub enum Delay {
  Keyboard,
  Load,
  Click,
  BigLoad,
  Scroll,
  #[allow(unused)]
  Other,
  RangeMs(u64, u64),
  Ms(u64),
}
impl Delay {
  pub fn delay_amount(self) -> Duration {
    let range = match self {
      Delay::Keyboard => 0.15..0.5,
      Delay::Load => 2.0..5.0,
      Delay::Click => 1.0..3.0,
      Delay::BigLoad => 7.0..12.0,
      Delay::Scroll => 1.5..3.0,
      Delay::Other => 3.0..9.0,
      Delay::Ms(ms) => {
        let ms = ms.max(10);
        let range = ms / 5;
        let delay = rng().random_range(ms - range..ms + range.max(1));
        return Duration::from_millis(delay);
      }
      Delay::RangeMs(min, max) => {
        let delay = rng().random_range(min..max.max(min + 1));
        return Duration::from_millis(delay);
      }
    };
    Duration::from_secs_f64(rng().random_range(range))
  }
}

impl std::future::IntoFuture for Delay {
  type Output = ();
  type IntoFuture = tokio::time::Sleep;
  fn into_future(self) -> Self::IntoFuture {
    tokio::time::sleep(self.delay_amount())
  }
}

impl Automator {
  pub fn li_profile_url_to_handle(&self, profile_url: &str) -> String {
    li_profile_url_to_handle(profile_url)
  }
  pub fn li_sales_url_to_profile_id<'a>(&self, sales_url: &'a str) -> &'a str {
    let no_commas = sales_url
      .split_once(',')
      .map(|(url, _)| url.trim())
      .unwrap_or(sales_url);
    no_commas
      .trim_end_matches('/')
      .rsplit_once('/')
      .map_or(no_commas, |(_, id)| id)
      .trim_matches('/')
  }
  pub fn set_linked_in_last_active(&self) {
    self
      .linked_in
      .try_notify(SetLinkedInLastActive {
        logged_in: Timestamp::now(),
        sales_navigator_active: None,
      })
      .inspect_err(|_| tracing::warn!("Unable to set linked in last active"))
      .ok();
  }
  pub fn set_sales_navigator_last_active(&self) {
    let now = Timestamp::now();
    self
      .linked_in
      .try_notify(SetLinkedInLastActive {
        logged_in: now,
        sales_navigator_active: Some(now),
      })
      .inspect_err(|_| tracing::warn!("Unable to set sales navigator last active"))
      .ok();
  }
  pub fn set_linked_in_inactive(&self) {
    self.linked_in.spawn_notify(SetLinkedInInactive);
  }
  pub fn set_connections_count(&self, count: usize) {
    self
      .linked_in
      .try_notify(SetLinkedInConnectionsCount { count: count as i16 })
      .inspect_err(|_| tracing::warn!("Unable to set connections count"))
      .ok();
  }
  /// Calculate the pixel offset from page coordinates to absolute screen coordinates.
  /// Returns (x_offset, y_offset) to add to page coords to get screen coords.
  async fn page_to_screen_offset(&self) -> (i32, i32) {
    self
      .driver
      .execute(
        "return [
            window.screenX + (window.outerWidth - window.innerWidth) / 2 - window.scrollX,
            window.screenY + (window.outerHeight - window.innerHeight) - window.scrollY
        ];",
        vec![],
      )
      .await
      .ok()
      .and_then(|v| {
        let arr = v.json().as_array()?;
        Some((arr[0].as_f64()? as i32, arr[1].as_f64()? as i32))
      })
      // default to some offset if the call fails
      .unwrap_or((0, 100))
  }

  pub async fn get_x_y(&self, element: &WebElement) -> Result<(i32, i32)> {
    let rect = element.rect().await?;
    let trim_width = rect.width / 5.0;
    let trim_height = rect.height / 5.0;
    let x = rng().random_range(rect.x + trim_width..rect.x + rect.width - trim_width);
    let y = rng().random_range(rect.y + trim_height..rect.y + rect.height - trim_height);
    Ok((x.round() as i32, y.round() as i32))
  }
  pub fn mouse_hover(&mut self, element: &WebElement) -> impl Future<Output = Result<(i32, i32)>> {
    self.mouse_hover_with_options(element, None, None)
  }
  pub async fn mouse_hover_with_options(
    &mut self,
    element: &WebElement,
    x_offset: Option<i32>,
    y_offset: Option<i32>,
  ) -> Result<(i32, i32)> {
    let is_in_view: bool = self
      .driver
      .execute(
        r#"
            var elem = arguments[0];
            var rect = elem.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
            "#,
        vec![element.to_json()?],
      )
      .await?
      .json()
      .as_bool()
      .unwrap_or(false);

    if !is_in_view {
      element.scroll_into_view().await?;
      Delay::Scroll.await;
    }
    let (x, y) = self.get_x_y(element).await?;
    let (screen_offset_x, screen_offset_y) = self.page_to_screen_offset().await;
    let x = x + x_offset.unwrap_or(0) + screen_offset_x;
    let y = y + y_offset.unwrap_or(0) + screen_offset_y;
    self
      .container_service_client
      .send_control_tokens(vec![container_service::ControlToken::Enigo(
        enigo::agent::Token::MoveMouse(x, y, enigo::Coordinate::Abs),
      )])
      .await?;
    thirtyfour::action_chain::ActionChain::new(self.driver.handle.clone())
      .move_to_element_center(element)
      .perform()
      .await?;
    Delay::RangeMs(2000, 3000).await;
    Ok((x, y))
  }
  pub async fn mouse_to_click(&mut self, element: &WebElement) -> Result<()> {
    self.mouse_to_click_with_options(element, None, None).await
  }

  pub async fn mouse_to_click_with_options(
    &mut self,
    element: &WebElement,
    x_offset: Option<i32>,
    y_offset: Option<i32>,
  ) -> Result<()> {
    self.mouse_hover_with_options(element, x_offset, y_offset).await?;

    Delay::Keyboard.await;

    // self
    //   .container_service_client
    //   .send_control_tokens(vec![container_service::ControlToken::Enigo(
    //     enigo::agent::Token::Button(enigo::Button::Left, enigo::Direction::Click),
    //   )])
    //   .await?;
    element.click().await?;
    Delay::Click.await;
    Ok(())
  }

  #[allow(unused)]
  pub async fn mouse_to_click_safe_inside_bounds(
    &mut self,
    element: &WebElement,
    x_offset: i32,
    y_offset: i32,
    should_click: bool,
  ) -> Result<()> {
    // Similar to mouse_to_click but with smaller offsets
    let is_in_view: bool = self
      .driver
      .execute(
        r#"
            var elem = arguments[0];
            var rect = elem.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
            "#,
        vec![element.to_json()?],
      )
      .await?
      .json()
      .as_bool()
      .unwrap_or(false);

    if !is_in_view {
      self.scroll_to_element(element).await?;
    }

    let element_location = self.get_location(element).await?;

    let x_scaling_factor = 10 + x_offset;
    let y_scaling_factor = 10 + y_offset;

    self
      .container_service_client
      .send_control_tokens(vec![container_service::ControlToken::Enigo(
        enigo::agent::Token::MoveMouse(
          element_location.x as i32 + x_scaling_factor,
          element_location.y as i32 + y_scaling_factor,
          enigo::Coordinate::Abs,
        ),
      )])
      .await?;

    Delay::Click.await;

    if should_click {
      element.click().await?;
    }

    Ok(())
  }

  #[expect(dead_code)]
  pub async fn click_single_key(&mut self, key: enigo::Key) -> Result<()> {
    self
      .container_service_client
      .send_control_tokens(vec![container_service::ControlToken::Enigo(enigo::agent::Token::Key(
        key,
        enigo::Direction::Click,
      ))])
      .await
      .map_err(|e| e.into())
  }

  #[expect(dead_code)]
  pub async fn scroll_to_end_of_page(&mut self) -> Result<()> {
    self
      .driver
      .execute("window.scrollTo(0, document.body.scrollHeight);", vec![])
      .await?;
    Delay::Scroll.await;
    Ok(())
  }

  #[allow(unused)]
  pub async fn get_location(&self, element: &WebElement) -> WebDriverResult<ElementRect> {
    element.rect().await
  }

  /// Type text character-by-character at human-like speed (~50 WPM average).
  /// Returns the total time spent typing in milliseconds (for use with thinking pause).
  ///
  /// 50 WPM = ~250 characters/minute = ~240ms per character average.
  /// Adds natural variation: some characters faster, some slower, occasional longer pauses.
  pub async fn human_like_keyboard_type(&mut self, text: &str) -> Result<u64> {
    tracing::debug!("human_like_keyboard_type: `{:?}`", text);
    // Pre-generate all tokens and delays synchronously to avoid holding rng across await
    let (tokens, total_delay_ms) = Self::build_human_typing_tokens(text);
    self.container_service_client.send_control_tokens(tokens).await?;
    Ok(total_delay_ms)
  }

  /// Build typing tokens with human-like delays (synchronous helper to avoid Send issues)
  fn build_human_typing_tokens(text: &str) -> (Vec<container_service::ControlToken>, u64) {
    let mut tokens = vec![];
    let mut total_delay_ms: u64 = 0;

    // Pre-generate a "hesitation index" to decide where to add longer pauses
    let hesitation_interval = rng().random_range(4..8);

    // Replace tabs with 4 spaces (tabs move focus out of textarea)
    let text = text.replace('\t', "    ");
    let chars = text.chars().collect::<Vec<char>>();

    let mut word_length = 0;
    for (i, c) in chars.iter().copied().enumerate() {
      // Check if next char exists and is NOT a newline (i.e., actual content follows this newline)
      let next_is_content = i + 1 < chars.len() && chars[i + 1] != '\n';

      // Handle newlines with plain Enter (no Shift needed)
      if c == '\n' {
        tokens.push(container_service::ControlToken::Enigo(enigo::agent::Token::Key(
          enigo::Key::Return,
          enigo::Direction::Click,
        )));

        // Only add pause after newline if followed by actual content (not another newline)
        let range = if next_is_content { 1000..3000 } else { 10..50 };
        let delay_ms = rng().random_range(range);
        tokens.push(container_service::ControlToken::SleepMs(delay_ms));
        total_delay_ms += delay_ms;
        word_length = 0;
      } else {
        word_length += 1;
        // Use Token::Text for all characters - handles Unicode (curly apostrophes, em-dashes, etc.)
        // and lets enigo figure out the correct key presses for the keyboard layout
        tokens.push(container_service::ControlToken::Enigo(enigo::agent::Token::Text(
          c.to_string(),
        )));

        // Base delay ~240ms for 50 WPM, with human-like variation
        let range = if c == ' ' || c == '.' || c == ',' || c == '!' || c == '?' {
          word_length = 0;
          // Longer pause at word boundaries and punctuation (thinking/reading)
          300..500
        } else if word_length % hesitation_interval == 0 {
          // Occasional longer pause mid-word (simulating hesitation/thinking)
          300..600
        } else {
          // Normal typing speed with variation
          100..270
        };
        let delay_ms = rng().random_range(range);
        tokens.push(container_service::ControlToken::SleepMs(delay_ms));
        total_delay_ms += delay_ms;
      }
    }

    // Add delay after last character to ensure it's fully processed
    let final_delay_ms = rng().random_range(3000..5000);
    tokens.push(container_service::ControlToken::SleepMs(final_delay_ms));
    total_delay_ms += final_delay_ms;

    (tokens, total_delay_ms)
  }

  /// Release all modifier keys to ensure clean keyboard state
  pub async fn release_all_modifier_keys(&mut self) -> Result<()> {
    let modifier_keys = [
      enigo::Key::Shift,
      enigo::Key::Control,
      enigo::Key::Alt,
      enigo::Key::Meta,
    ];
    self
      .container_service_client
      .send_control_tokens(
        modifier_keys
          .into_iter()
          .map(|key| container_service::ControlToken::Enigo(enigo::agent::Token::Key(key, enigo::Direction::Release)))
          .collect(),
      )
      .await?;
    Ok(())
  }

  /// Wait for a "thinking" pause after typing - simulates reading/reviewing the message.
  /// Waits for 40-60% of the time it took to type the message.
  pub async fn thinking_pause_after_typing(&self, typing_duration_ms: u64) {
    let pause_ratio = rng().random_range(0.40..0.60);
    let pause_ms = (typing_duration_ms as f64 * pause_ratio) as u64;

    tracing::info!(
      "Thinking pause: {}ms ({:.0}% of typing time)",
      pause_ms,
      pause_ratio * 100.0
    );

    Delay::Ms(pause_ms).await;
  }

  /// Slowly scroll DOWN the page for a random duration between min_seconds and max_seconds.
  /// Only scrolls down (no bouncing back up). Mimics human behavior of reading/scanning the profile.
  pub async fn slow_scroll_for_duration(&self, min_seconds: u64, max_seconds: u64) -> Result<()> {
    let total_duration_ms = rng().random_range(min_seconds * 1000..max_seconds * 1000);
    let start = std::time::Instant::now();

    tracing::info!(
      "Starting slow scroll DOWN for ~{:.1}s",
      total_duration_ms as f64 / 1000.0
    );

    // Detect scrollable container: some LinkedIn layouts use main#workspace instead of body
    // This handles shadow DOM profiles where body.scrollHeight equals viewport height
    let scroll_info: serde_json::Value = self
      .driver
      .execute(
        r#"
        const workspace = document.querySelector('main#workspace');
        const bodyScrollable = document.body.scrollHeight > window.innerHeight + 100;
        const workspaceScrollable = workspace && workspace.scrollHeight > workspace.clientHeight + 100;

        if (workspaceScrollable && !bodyScrollable) {
          // Shadow DOM layout: workspace is the scroll container
          return {
            useWorkspace: true,
            scrollHeight: workspace.scrollHeight,
            clientHeight: workspace.clientHeight
          };
        } else {
          // Standard layout: use window/body scrolling
          return {
            useWorkspace: false,
            scrollHeight: document.body.scrollHeight,
            clientHeight: window.innerHeight
          };
        }
        "#,
        vec![],
      )
      .await?
      .json()
      .clone();

    let use_workspace = scroll_info
      .get("useWorkspace")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);
    let page_height = scroll_info
      .get("scrollHeight")
      .and_then(|v| v.as_f64())
      .unwrap_or(3000.0);
    let viewport_height = scroll_info
      .get("clientHeight")
      .and_then(|v| v.as_f64())
      .unwrap_or(800.0);

    if use_workspace {
      tracing::info!("Using main#workspace as scroll container (shadow DOM layout)");
    }

    let max_scroll = page_height - viewport_height - 100.0;
    let mut current_scroll: f64 = 0.0;

    // Skip if nothing to scroll
    if max_scroll <= 0.0 {
      tracing::info!(
        "No scrollable content detected (max_scroll={:.0}), skipping scroll down",
        max_scroll
      );
      return Ok(());
    }

    while start.elapsed().as_millis() < total_duration_ms as u128 {
      // Random scroll amount (small increments for natural feel) - only down
      let scroll_amount = rng().random_range(50.0..180.0);
      current_scroll = (current_scroll + scroll_amount).min(max_scroll);

      // Execute smooth scroll on the appropriate container
      let script = if use_workspace {
        format!(
          "document.querySelector('main#workspace')?.scrollTo({{ top: {}, behavior: 'smooth' }});",
          current_scroll
        )
      } else {
        format!("window.scrollTo({{ top: {}, behavior: 'smooth' }});", current_scroll)
      };
      self.driver.execute(&script, vec![]).await.ok();

      // Variable pause between scrolls (simulates reading)
      let pause_ms = rng().random_range(200..600);
      Delay::Ms(pause_ms).await;

      // If we've reached the bottom, exit immediately so scroll back up can start
      if current_scroll >= max_scroll {
        tracing::info!("Reached bottom, ready to scroll back up");
        break;
      }
    }

    tracing::info!("Slow scroll down completed after {:.1}s", start.elapsed().as_secs_f64());

    Ok(())
  }

  /// Scroll back to the top of the page over a random duration.
  /// Slightly faster than scroll down, with consistent speed (no slowdown at end).
  pub async fn slow_scroll_to_top(&self, min_seconds: u64, max_seconds: u64) -> Result<()> {
    let total_duration_ms = rng().random_range(min_seconds * 1000..max_seconds * 1000);
    let start = std::time::Instant::now();

    // Detect scrollable container and get current scroll position
    // This handles shadow DOM profiles where main#workspace is the scroll container
    let scroll_info: serde_json::Value = self
      .driver
      .execute(
        r#"
        const workspace = document.querySelector('main#workspace');
        const bodyScrollable = document.body.scrollHeight > window.innerHeight + 100;
        const workspaceScrollable = workspace && workspace.scrollHeight > workspace.clientHeight + 100;

        if (workspaceScrollable && !bodyScrollable) {
          // Shadow DOM layout: workspace is the scroll container
          return {
            useWorkspace: true,
            scrollTop: workspace.scrollTop
          };
        } else {
          // Standard layout: use window scrolling
          return {
            useWorkspace: false,
            scrollTop: window.pageYOffset
          };
        }
        "#,
        vec![],
      )
      .await?
      .json()
      .clone();

    let use_workspace = scroll_info
      .get("useWorkspace")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);
    let initial_scroll = scroll_info.get("scrollTop").and_then(|v| v.as_f64()).unwrap_or(0.0);

    if initial_scroll <= 0.0 {
      tracing::info!("Already at top, no scroll needed");
      return Ok(());
    }

    if use_workspace {
      tracing::info!("Using main#workspace as scroll container (shadow DOM layout)");
    }

    tracing::info!(
      "Starting scroll to top from {:.0}px over ~{:.1}s",
      initial_scroll,
      total_duration_ms as f64 / 1000.0
    );

    // Use shorter pauses (100-250ms) to make scroll up faster than scroll down
    let avg_pause_ms = 175.0;
    let scroll_iterations = (total_duration_ms as f64 / avg_pause_ms) as u64;
    let scroll_per_step = initial_scroll / scroll_iterations.max(1) as f64;

    let mut current_scroll = initial_scroll;

    while current_scroll > 0.0 {
      // Consistent scroll amount with slight variance (±20% instead of ±50%)
      let scroll_amount = rng().random_range(scroll_per_step * 0.8..scroll_per_step * 1.2);
      current_scroll = (current_scroll - scroll_amount).max(0.0);

      // Use 'auto' behavior for more predictable scrolling (no browser easing)
      let script = if use_workspace {
        format!(
          "document.querySelector('main#workspace')?.scrollTo({{ top: {}, behavior: 'auto' }});",
          current_scroll
        )
      } else {
        format!("window.scrollTo({{ top: {}, behavior: 'auto' }});", current_scroll)
      };
      let _ = self.driver.execute(&script, vec![]).await;

      // Shorter pauses for faster scroll up
      let pause_ms = rng().random_range(100..250);
      Delay::Ms(pause_ms).await;
    }

    // Ensure we're at the top
    let final_script = if use_workspace {
      "document.querySelector('main#workspace')?.scrollTo({ top: 0, behavior: 'auto' });"
    } else {
      "window.scrollTo({ top: 0, behavior: 'auto' });"
    };
    let _ = self.driver.execute(final_script, vec![]).await;

    tracing::info!("Scroll to top completed after {:.1}s", start.elapsed().as_secs_f64());

    Ok(())
  }

  #[allow(unused)]
  pub async fn multiline_keyboard_type(&self, text: &str, element: &WebElement) -> WebDriverResult<()> {
    for line in text.split("[new_line]") {
      for c in line.chars() {
        element.send_keys(&c.to_string()).await?;
        Delay::Keyboard.await;
      }
      element.send_keys("\n").await?;
      Delay::Click.await;
    }
    Ok(())
  }

  pub async fn scroll_to_element(&self, element: &WebElement) -> WebDriverResult<()> {
    let is_in_view: bool = self
      .driver
      .execute(
        r#"
            var elem = arguments[0];
            var rect = elem.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
            "#,
        vec![element.to_json()?],
      )
      .await?
      .json()
      .as_bool()
      .unwrap_or(false);

    if !is_in_view {
      element.scroll_into_view().await?;
    }

    Delay::Scroll.await;

    Ok(())
  }

  #[allow(unused)]
  pub async fn is_not_at_the_bottom_of_page(&self) -> WebDriverResult<bool> {
    let js_to_execute = "return (window.innerHeight + window.scrollY + 0 >= document.body.offsetHeight);";

    let debug_js_to_execute = "return window.innerHeight.toString() + '+' + window.scrollY.toString() + ' + 0 ' + '>=' + document.body.offsetHeight.toString();";

    let is_at_bottom = self
      .driver
      .execute(js_to_execute, vec![])
      .await?
      .json()
      .as_bool()
      .unwrap_or(false);

    let debug_values = self
      .driver
      .execute(debug_js_to_execute, vec![])
      .await?
      .json()
      .as_str()
      .unwrap_or("")
      .to_string();

    tracing::info!("debug_values: {}", debug_values);

    Ok(!is_at_bottom)
  }

  #[expect(dead_code)]
  pub async fn is_at_the_bottom_of_page(&self) -> WebDriverResult<bool> {
    Ok(!self.is_not_at_the_bottom_of_page().await?)
  }

  // URL validation functions
  #[expect(dead_code)]
  pub fn is_correct_url_profile(&self, profile_url: &str) -> bool {
    if !profile_url.contains("linkedin.com") {
      return false;
    }
    true
  }

  #[expect(dead_code)]
  pub fn is_correct_url_sales_navigator(&self, _sales_navigator_url: &str) -> bool {
    true // TODO: implement proper validation
  }

  #[expect(dead_code)]
  pub fn is_sales_navigator_profile_url(&self, url: &str) -> bool {
    url.contains("linkedin.com/sales/lead/")
  }

  #[expect(dead_code)]
  pub fn is_profile_url(&self, url: &str) -> bool {
    url.contains("linkedin.com/in/")
  }

  pub async fn assert_on_url(&self, url_part: &str) -> Result<()> {
    let current_url = self.driver.current_url().await?;
    if !current_url.as_str().contains(url_part) {
      return Err(JaniumError::msg(format!(
        "Not on expected page. Current: {current_url}, Expected: {url_part}",
      )));
    }
    Ok(())
  }

  // Page state check functions
  #[allow(unused)]
  pub async fn is_on_sent_invitations_page(&self) -> bool {
    tracing::info!("current url {}", self.driver.current_url().await.unwrap());
    self
      .driver
      .current_url()
      .await
      .map(|url| {
        url
          .to_string()
          .contains("linkedin.com/mynetwork/invitation-manager/sent/")
      })
      .unwrap_or(false)
  }

  #[expect(dead_code)]
  pub async fn is_on_received_invitations_page(&self) -> bool {
    tracing::info!("current url {}", self.driver.current_url().await.unwrap());
    let re = Regex::new(r"linkedin\.com/mynetwork/invitation-manager/$").unwrap();
    self
      .driver
      .current_url()
      .await
      .map(|url| re.is_match(url.as_str()))
      .unwrap_or(false)
  }

  pub async fn is_on_messaging_page(&self) -> bool {
    let messaging_header = self
      .driver
      .find_all(By::XPath("//div//h1[text()='Messaging']"))
      .await
      .unwrap_or_default();

    self
      .driver
      .title()
      .await
      .map(|title| title.contains("Messaging"))
      .unwrap_or(false)
      && !messaging_header.is_empty()
  }

  #[allow(unused)]
  pub async fn is_on_feed(&self) -> bool {
    match self.driver.title().await {
      Ok(title) => title.contains("Feed"),
      Err(e) => {
        tracing::error!("error in is_on_feed: {}", e);
        false
      }
    }
  }

  #[expect(dead_code)]
  pub async fn is_on_login_screen(&self) -> bool {
    self
      .driver
      .title()
      .await
      .map(|title| title.contains("Login"))
      .unwrap_or(false)
  }

  #[allow(unused)]
  pub async fn is_on_my_network_page(&self) -> bool {
    tracing::info!("current url {}", self.driver.current_url().await.unwrap());
    let re = Regex::new(r"linkedin\.com/mynetwork/.*").unwrap();
    self
      .driver
      .current_url()
      .await
      .map(|url| re.is_match(url.as_str()))
      .unwrap_or(false)
  }

  #[allow(unused)]
  pub async fn is_on_connections_page(&self) -> bool {
    tracing::info!("current url {}", self.driver.current_url().await.unwrap());
    self
      .driver
      .current_url()
      .await
      .map(|url| {
        url
          .to_string()
          .contains("linkedin.com/mynetwork/invite-connect/connections/")
      })
      .unwrap_or(false)
  }

  #[expect(dead_code)]
  pub async fn is_on_notifications_page(&self) -> bool {
    match self.driver.title().await {
      Ok(title) => {
        title.contains("Notifications")
          && self
            .driver
            .current_url()
            .await
            .map(|url| url.to_string().contains("linkedin.com/notifications/"))
            .unwrap_or(false)
      }
      Err(e) => {
        tracing::error!("error in is_on_notifications_page: {}", e);
        false
      }
    }
  }

  #[expect(dead_code)]
  pub fn is_button_selected(&self, button_class: &str) -> bool {
    button_class.contains("artdeco-pill--selected")
  }

  #[expect(dead_code)]
  pub fn get_profile_last_part(&self, profile_url: &str) -> String {
    let index = profile_url
      .find("linkedin.com/in/")
      .map(|i| i + "linkedin.com/in/".len());
    match index {
      Some(i) => profile_url[i..].replace("/", ""),
      None => String::new(),
    }
  }

  pub fn get_page_count_from_sales_navigator_url(&self, url: &url::Url) -> i32 {
    let query_params = url.query_pairs().collect::<std::collections::HashMap<_, _>>();
    query_params
      .get("page")
      .and_then(|p| p.parse::<i32>().ok())
      .unwrap_or(1)
  }

  #[expect(dead_code)]
  pub fn delete_extra_end_slash_from_profile_url<'a>(&self, profile_url: &'a str) -> &'a str {
    profile_url.trim_end_matches('/')
  }

  #[expect(dead_code)]
  pub async fn click_on_collapse_button(&mut self) -> Result<()> {
    let collapse_button = self
      .driver
      .find_all(By::XPath(
        "//button[contains(@class, 'artdeco-card__action')]/span[text()='Collapse']",
      ))
      .await?;

    if !collapse_button.is_empty() {
      self.mouse_to_click(&collapse_button[0]).await?;
    }

    Ok(())
  }

  #[expect(dead_code)]
  pub fn clean_username(&self, username: &str) -> String {
    // First trim whitespace
    let trimmed = username.trim();

    self.replace_emoji_with_text(trimmed).to_string()
  }

  #[allow(unused)]
  pub fn replace_emoji_with_text(&self, text: &str) -> String {
    let mut result = text.to_string();

    let mut s = String::with_capacity(4);
    // Get all emojis in the text
    for c in text.chars() {
      s.clear();
      s.push(c);
      if emojis::get(s.as_str()).is_some() {
        result = result.replace(c, "emoji");
      }
    }

    result
  }

  #[allow(unused)]
  pub async fn close_all_opened_conversations(&mut self) -> Result<()> {
    let close_button = self.driver.find_all(By::XPath("//button[contains(@class, 'msg-overlay-bubble-header__control artdeco-button artdeco-button--circle artdeco-button--muted artdeco-button--1 artdeco-button--tertiary ember-view')]")).await?;

    if !close_button.is_empty() {
      tracing::info!("found close button. Clicking on it");

      self.mouse_to_click(&close_button[0]).await?;
    }

    let close_button = self.driver.find_all(By::XPath("//button[contains(@class, 'msg-overlay-bubble-header__control artdeco-button artdeco-button--circle artdeco-button--muted artdeco-button--1 artdeco-button--tertiary ember-view')]")).await?;

    if !close_button.is_empty() {
      tracing::info!("found another close button. Clicking on it");
      self.mouse_to_click(&close_button[0]).await?;
    }

    let close_button = self.driver.find_all(By::XPath("//button[contains(@class, 'msg-overlay-bubble-header__control artdeco-button artdeco-button--circle artdeco-button--muted artdeco-button--1 artdeco-button--tertiary ember-view')]")).await?;

    if !close_button.is_empty() {
      tracing::info!("found another close button. Clicking on it");
      self.mouse_to_click(&close_button[0]).await?;
    }

    Ok(())
  }

  #[expect(dead_code)]
  pub async fn get_masked_hash_url(&self, url: &str) -> Result<String> {
    if !url.contains("linkedin.com/in/ACo") {
      return Err(crate::JaniumError::msg("Invalid masked LinkedIn URL"));
    }

    let masked_hash = url
      .split("linkedin.com/in/ACo")
      .nth(1)
      .ok_or_else(|| crate::JaniumError::msg("Failed to extract masked hash from URL"))?;
    let masked_hash = masked_hash
      .get(0..9)
      .ok_or(crate::JaniumError::msg("Failed to extract masked hash from URL"))?;

    let output_masked_hash = format!("ACw{masked_hash}");

    Ok(output_masked_hash)
  }

  #[allow(unused)]
  pub async fn navigation_ping(&self) -> Result<()> {
    Ok(())
  }

  #[allow(unused)]
  pub async fn failed_navigation_ping(&self) -> Result<()> {
    Err(crate::JaniumError::msg("Failed to navigate to page"))
  }

  pub async fn get_real_url_from_sales_navigator_url(&mut self) -> Result<String> {
    // Retry logic for slow Sales Nav page loads - wait up to ~12 seconds for the 3-dot menu
    let mut open_menu = Vec::new();
    for attempt in 1..=12 {
      open_menu = self
        .driver
        .find_all(By::XPath(
          "//main//section/div/section//button[contains(@aria-label, 'Open actions overflow menu')]/span[1]",
        ))
        .await?;

      if !open_menu.is_empty() {
        tracing::info!("Found 3-dot menu on attempt {}", attempt);
        break;
      }

      tracing::info!("3-dot menu not found on attempt {}, waiting 1s...", attempt);
      Delay::Ms(1000).await;
    }

    if open_menu.is_empty() {
      tracing::error!(
        "didnt find open menu three dots button to get LinkedIn profile url. Maybe html structure changed?"
      );

      return Err(crate::JaniumError::msg(
        "didnt find open menu three dots button to get LinkedIn profile url. Maybe html structure changed?",
      ));
    }

    // Dismiss "Personalize your message" AI teaching bubble if present
    // This popup can intercept clicks on the 3-dot menu button
    if let Ok(dismiss_btn) = self
      .driver
      .find(By::XPath("//button[@data-test-enterprise-teaching-bubble-dismiss-btn]"))
      .await
    {
      tracing::info!("Found Sales Navigator AI teaching bubble - dismissing");
      let _ = dismiss_btn.click().await;
      Delay::Ms(300).await;
    }

    self.mouse_to_click(&open_menu[0]).await?;

    let linkedin_profile_url_element = self
      .driver
      .find_all(By::XPath("//div[text()='View LinkedIn profile']/../.."))
      .await?;

    if linkedin_profile_url_element.is_empty() {
      tracing::error!("didnt find linkedin profile url. Maybe html structure changed?");

      return Err(crate::JaniumError::msg(
        "didnt find linkedin profile url. Maybe html structure changed?",
      ));
    }

    let linkedin_profile_url = if let Some(url) = linkedin_profile_url_element[0].attr("href").await? {
      tracing::info!("found linkedin profile url {}", url);
      url
    } else {
      tracing::error!("href linkedin profile url not found. Maybe html structure changed?");

      return Err(crate::JaniumError::msg(
        "href linkedin profile url not found. Maybe html structure changed?",
      ));
    };

    Ok(linkedin_profile_url)
  }

  pub async fn is_unlock_profile_present(&self) -> Result<bool> {
    let unlock_full_profile = self
      .driver
      .find_all(By::XPath("//button/span[text()='Unlock full profile']"))
      .await?;

    if unlock_full_profile.is_empty() {
      return Ok(false);
    }

    Ok(true)
  }

  pub async fn is_2fa_pop_up_shown(&self) -> Result<bool> {
    let two_fa_pop_up_title = self
      .driver
      .find_all(By::XPath("//p[text()='Protect your account today']"))
      .await?;

    let two_fa_pop_up_text = self
      .driver
      .find_all(By::XPath(
        "//p[text()='Turn on two-step verification for unrecognized devices. Act now as this will soon be mandatory.']",
      ))
      .await?;

    if two_fa_pop_up_title.len() == 1 {
      tracing::info!("2FA pop up TITLE is present");
    }

    if two_fa_pop_up_text.len() == 1 {
      tracing::info!("2FA pop up TEXT is present");
    }

    if !two_fa_pop_up_title.is_empty() && !two_fa_pop_up_text.is_empty() {
      tracing::info!("2FA pop up is present");

      return Ok(true);
    }

    Ok(false)
  }

  pub async fn dismiss_2fa_pop_up_if_present(&self) -> Result<()> {
    tracing::info!("checking if 2FA pop up is shown");

    if self.is_2fa_pop_up_shown().await? {
      tracing::info!("clicking skip until tomorrow button");

      let skip_until_tomorrow_button = self
        .driver
        .find_all(By::XPath("//button/span[text()='Skip until tomorrow']/.."))
        .await?;

      if skip_until_tomorrow_button.is_empty() {
        tracing::error!("Skip until tomorrow button not found");
        return Err(crate::JaniumError::msg(
          "Skip until tomorrow button not found, maybe html changed?",
        ));
      }

      skip_until_tomorrow_button[0].click().await?;

      Delay::Ms(5000).await;

      tracing::info!("clicked skip until tomorrow button");
    } else {
      tracing::info!("2FA pop up is not shown");
    }

    Ok(())
  }

  #[expect(dead_code)]
  pub fn get_profile_first_name(&self, _profile_url: &str) -> Option<String> {
    None
  }

  #[expect(dead_code)]
  pub async fn get_profile_full_name(&self, profile_url: &str) -> Result<Option<String>> {
    self.driver.get(profile_url).await?;
    Delay::Load.await;

    let full_name_element = self.driver.find_all(By::XPath("//section//div/span/a/h1")).await?;

    if full_name_element.len() == 1 {
      let full_name = full_name_element[0].attr("innerText").await?;
      return Ok(full_name);
    }

    Ok(None)
  }

  #[expect(dead_code)]
  pub async fn execute_process_to_get_contact_info_html(&mut self) -> Result<Option<String>> {
    let open_contact_info_button = self.try_get_open_contact_info_button().await?;
    if open_contact_info_button.is_none() {
      tracing::info!("Open contact info button not found");
      return Ok(None);
    }

    self.mouse_to_click(&open_contact_info_button.unwrap()).await?;

    Delay::Ms(3000).await;

    let contact_info_html = self.try_get_contact_info_html().await?;

    let close_contact_info_button = self.try_get_close_contact_info_popup().await?;
    if close_contact_info_button.is_none() {
      tracing::info!("Close contact info button not found");
      return Ok(None);
    }

    self.mouse_to_click(&close_contact_info_button.unwrap()).await?;

    Delay::Ms(3000).await;

    Ok(contact_info_html)
  }

  #[allow(unused)]
  pub async fn try_get_open_contact_info_button(&self) -> Result<Option<WebElement>> {
    let open_contact_info_button = self
      .driver
      .find_all(By::XPath("//main/section[1]/div/div/div/span/a[text()='Contact info']"))
      .await?;

    if open_contact_info_button.len() == 1 {
      Ok(Some(open_contact_info_button[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[allow(unused)]
  pub async fn try_get_contact_info_html(&self) -> Result<Option<String>> {
    let contact_info = self.driver
        .find_all(By::XPath(
            "//div[contains(@class, 'artdeco-modal-overlay')]/div[contains(@class, 'artdeco-modal')]/div[contains(@class, 'artdeco-modal__content')]"
        ))
        .await?;

    if contact_info.len() == 1 {
      let html = contact_info[0].outer_html().await?;
      Ok(Some(html))
    } else {
      Ok(None)
    }
  }

  #[allow(unused)]
  pub async fn try_get_close_contact_info_popup(&self) -> Result<Option<WebElement>> {
    let close_contact_info_button = self
      .driver
      .find_all(By::XPath(
        "//div[contains(@class, 'artdeco-modal-overlay')]/div[contains(@class, 'artdeco-modal')]/button",
      ))
      .await?;

    if close_contact_info_button.len() == 1 {
      Ok(Some(close_contact_info_button[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[allow(unused)]
  pub async fn find_section_element(&self, title: &str) -> Result<Vec<WebElement>> {
    let elements = self
      .driver
      .find_all(By::XPath(format!(
        "//section/div/div/div/div/h2/span[text()='{title}']/../../../../../.."
      )))
      .await?;
    Ok(elements)
  }

  #[allow(unused)]
  pub async fn try_to_get_section(&self, title: &str) -> Result<Option<WebElement>> {
    let mut section = self.find_section_element(title).await?;

    while section.len() != 1 {
      // Simulate Page Down key press
      self
        .driver
        .execute("window.scrollBy(0, window.innerHeight);", vec![])
        .await?;
      Delay::Load.await;

      section = self.find_section_element(title).await?;

      // Check if we're at the bottom of the page
      let is_at_bottom = self
        .driver
        .execute(
          "return (window.innerHeight + window.scrollY) >= document.body.offsetHeight;",
          vec![],
        )
        .await?
        .json()
        .as_bool()
        .ok_or_else(|| crate::JaniumError::msg("Failed to get if is scrolled at bottom of page"))?;

      if is_at_bottom {
        // Simulate Home key press
        self.driver.execute("window.scrollTo(0, 0);", vec![]).await?;
        return Ok(None);
      }
    }

    Ok(Some(section[0].clone()))
  }

  #[allow(unused)]
  pub async fn try_to_get_section_html(&self, title: &str, profile_unique_url: &str) -> Result<Option<String>> {
    let section = self.try_to_get_section(title).await?;

    if let Some(section) = section {
      let section_html = section.outer_html().await?;
      tracing::info!("section {} found for {}", title, profile_unique_url);
      Ok(Some(section_html))
    } else {
      tracing::warn!("section {} not found for {}", title, profile_unique_url);
      Ok(None)
    }
  }

  #[expect(dead_code)]
  pub async fn execute_process_to_get_experience_html(&mut self, profile_unique_url: &str) -> Result<Option<String>> {
    let open_more_work_experience_button = self.try_get_open_more_work_experience_button().await?;
    let work_experience_html;

    if let Some(open_more_work_experience_button) = open_more_work_experience_button {
      tracing::info!("The contact has more experience button, navigating to full experience");
      work_experience_html = self
        .get_full_work_experience_with_navigation_html(open_more_work_experience_button)
        .await?;
      self.driver.back().await?;
      Delay::Load.await;
    } else {
      tracing::info!("The contact doesn't have more experience button, just getting the section from the profile page");
      work_experience_html = self.try_to_get_section_html("Experience", profile_unique_url).await?;
    }

    if work_experience_html.is_none() {
      tracing::error!(
        "Houston we have a problem. No experience found for this profile {}. Maybe html structure changed? -- Error - interrupting execution",
        profile_unique_url
      );

      return Err(crate::JaniumError::msg(format!(
        "No experience found for this profile {}. Maybe html structure changed? - interrupting execution",
        profile_unique_url
      )));
    }

    tracing::info!("work Experience found for profile {}", profile_unique_url);

    Ok(work_experience_html)
  }

  #[allow(unused)]
  pub async fn try_get_open_more_work_experience_button(&self) -> Result<Option<WebElement>> {
    let see_all_experience_button = self.driver
        .find_all(By::XPath(
            "//section/div//h2/span[text()='Experience']/../../../../../..//text()[contains(., 'Show all') and contains(., 'experiences')]/.."
        ))
        .await?;

    if see_all_experience_button.len() == 1 {
      Ok(Some(see_all_experience_button[0].clone()))
    } else {
      Ok(None)
    }
  }

  #[allow(unused)]
  pub async fn get_full_work_experience_with_navigation_html(
    &mut self,
    see_all_experience_button: WebElement,
  ) -> Result<Option<String>> {
    self.scroll_to_element(&see_all_experience_button).await?;

    self.mouse_to_click(&see_all_experience_button).await?;

    // Scroll to top of page
    self.driver.execute("window.scrollTo(0, 0);", vec![]).await?;
    Delay::Scroll.await;

    self.try_get_full_experience().await
  }

  pub async fn try_get_full_experience(&self) -> Result<Option<String>> {
    let full_experience = self
      .driver
      .find_all(By::XPath("//main/section/div//div/h1[text()='Experience']/../../.."))
      .await?;

    if full_experience.len() == 1 {
      let html = full_experience[0].outer_html().await?;
      Delay::BigLoad.await;
      Ok(Some(html))
    } else {
      Ok(None)
    }
  }

  #[expect(dead_code)]
  pub fn concatenate_html_output(&self, html_to_concatenate: Vec<(&str, Option<String>)>) -> String {
    let mut profile_html = String::new();

    for (title, html) in html_to_concatenate {
      if let Some(html) = html {
        profile_html.push_str(&format!("<{}>{}</{}>", title, html, title));
      }
    }

    profile_html
  }

  #[expect(dead_code)]
  pub async fn is_email_verification_popup(&self) -> Result<bool> {
    let verification_elements = self.driver
        .find_all(By::XPath(
            "//label[text()='To verify this member knows you, please enter their email to connect. You can also include a personal note. ']"
        ))
        .await?;

    Ok(verification_elements.len() == 1)
  }

  #[expect(dead_code)]
  pub async fn get_dismiss_button_from_email_verification_pop_up(&self) -> Result<Option<WebElement>> {
    let dismiss_button_elements = self
      .driver
      .find_all(By::XPath("//button[contains(@class, 'artdeco-modal__dismiss')]"))
      .await?;

    if dismiss_button_elements.len() == 1 {
      Ok(Some(dismiss_button_elements[0].clone()))
    } else {
      Ok(None)
    }
  }

  pub fn delete_extra_double_qoute_message_content(&self, message_content: &str) -> String {
    let mut cleaned_content = message_content.to_string();

    // Remove leading double quote if present
    if cleaned_content.starts_with('"') {
      cleaned_content = cleaned_content[1..].to_string();
    }

    // Remove trailing double quote if present
    if cleaned_content.ends_with('"') {
      cleaned_content = cleaned_content[..cleaned_content.len() - 1].to_string();
    }

    cleaned_content
  }

  #[expect(dead_code)]
  pub async fn page_not_found(&self) -> Result<bool> {
    let current_url = self.driver.current_url().await?;
    let title = self.driver.title().await?;

    // Check if URL contains "linkedin.com/404" and title contains "Page Not Found"
    if current_url.to_string().contains("linkedin.com/404") || title.contains("Page Not Found") {
      return Ok(true);
    }

    Ok(false)
  }

  pub async fn load_all_sent_invitations(&mut self) -> Result<()> {
    tracing::info!("Loading all sent invitations");

    let _is_load_more_button = true;
    let mut reached_bottom_of_page = false;
    let mut count = 0;

    while !reached_bottom_of_page {
      tracing::info!("Running iteration {count} to get to the bottom of the page, to load all sent invitations");
      count += 1;
      //driver.execute("window.scrollTo(0, document.body.scrollHeight);", vec![]).await?;

      let div_height_scroll_prev_to_scrolls = self.get_main_height_scroll().await.unwrap();

      self
        .container_service_client
        .send_control_tokens(vec![
          container_service::ControlToken::Enigo(enigo::agent::Token::Key(enigo::Key::Home, enigo::Direction::Click)),
          container_service::ControlToken::SleepMs(2000),
          container_service::ControlToken::Enigo(enigo::agent::Token::Key(enigo::Key::End, enigo::Direction::Click)),
        ])
        .await?;
      Delay::Load.await;

      let div_height_scroll_after_scrolls = self.get_main_height_scroll().await?;

      reached_bottom_of_page = div_height_scroll_prev_to_scrolls == div_height_scroll_after_scrolls;

      tracing::info!(
        "div_height_scroll_prev_to_scrolls: {}",
        div_height_scroll_prev_to_scrolls
      );
      tracing::info!("div_height_scroll_after_scrolls: {}", div_height_scroll_after_scrolls);
      tracing::info!("is_at_bottom_of_page: {}", reached_bottom_of_page);

      if !reached_bottom_of_page {
        continue;
      }

      // Check if we are at the bottom of the page
      let load_more_button = self
        .driver
        .find_all(By::XPath("//button/span/span[text()='Load more']/../.."))
        .await?
        .pop();

      if let Some(button) = load_more_button {
        tracing::info!("Load more button found, clicking on it");
        self.mouse_to_click(&button).await?;
        let div_height_scroll_after_load_more_click = self.get_main_height_scroll().await?;
        tracing::info!(
          "div_height_scroll_after_load_more_click: {}",
          div_height_scroll_after_load_more_click
        );
        reached_bottom_of_page = false; // Reset the flag to continue loading more invitations
      } else {
        tracing::info!("No more Load more button found and reached the bottom of the page, should break the loop?");
      }

      Delay::Load.await;
    }

    tracing::info!("Reached the bottom of the page, stopping the loop");
    tracing::info!("All sent invitations loaded");

    Ok(())
  }

  pub async fn get_main_height_scroll(&self) -> Result<f64> {
    let output = if let Some(workspace) = self.driver.find_all(By::XPath("//main[@id='workspace']")).await?.pop() {
      // The scrollHeight returns a number but the lib breaks because of that, that's why I
      // had to catch the error and get the number from the error string
      // example of error string: WebDriverError(Json("Unexpected value for property: Number(2179)"))
      let scroll_height = if let Err(e) = workspace.prop("scrollHeight").await {
        // Extract the number from the error string
        let error_str = e.to_string();
        //tracing::info!("Error string: {}", error_str);
        let start_index = error_str.find("Number(").unwrap() + "Number(".len();
        let end_index = error_str.find(')').unwrap();

        error_str[start_index..end_index].to_string()
      } else {
        return Err(crate::JaniumError::msg("Failed to get scroll height from workspace"));
      };

      scroll_height
        .parse::<i32>()
        .map_err(|e| crate::JaniumError::msg(format!("Failed to convert scroll height to i32: {e}")))? as f64
    } else {
      tracing::error!("No workspace found, unable to get scroll height");
      return Err(crate::JaniumError::msg(
        "No workspace found, unable to get scroll height",
      ));
    };

    Ok(output)
  }
}

/// Extract the LinkedIn profile handle from a URL.
///
/// Handles URLs like:
/// - `https://www.linkedin.com/in/john-doe/`
/// - `https://www.linkedin.com/in/john-doe/en/` (locale suffix)
/// - `https://www.linkedin.com/in/ACoAAAHbGOc...?lipi=urn%3A...` (messaging links with query params)
///
/// Parses as a proper URL to ignore query strings, then extracts the first
/// path segment after `/in/`.
pub fn li_profile_url_to_handle(profile_url: &str) -> String {
  if let Ok(url) = url::Url::parse(profile_url) {
    let segments: Vec<&str> = url.path_segments().map(|s| s.collect()).unwrap_or_default();
    if let Some(pos) = segments.iter().position(|&s| s == "in")
      && let Some(&handle) = segments.get(pos + 1)
      && !handle.is_empty()
    {
      return handle.to_string();
    }
  }
  // Fallback: treat as a bare handle or unparseable URL
  profile_url
    .trim_end_matches('/')
    .rsplit_once('/')
    .map_or(profile_url, |(_, handle)| handle)
    .trim_matches('/')
    .to_string()
}

#[cfg(test)]
mod tests {
  use super::*;
  use rstest::rstest;

  #[rstest]
  // Messaging link for another person (with query params)
  #[case(
    "https://www.linkedin.com/in/ACoAAAHbGOcBlBRrdxF7GVKsuD_Q8xUg7YmXK0o?lipi=urn%3Ali%3Apage%3Ad_flagship3_messaging_conversation_detail%3BRJR37T%2ByTxG2Mo1pxjhegQ%3D%3D",
    "ACoAAAHbGOcBlBRrdxF7GVKsuD_Q8xUg7YmXK0o"
  )]
  // Messaging link for the logged-in user (with query params)
  #[case(
    "https://www.linkedin.com/in/ACoAADjg58YBv18CqnF7eX52zPhym1KgVhP0qGc?lipi=urn%3Ali%3Apage%3Ad_flagship3_messaging_conversation_detail%3BRJR37T%2ByTxG2Mo1pxjhegQ%3D%3D",
    "ACoAADjg58YBv18CqnF7eX52zPhym1KgVhP0qGc"
  )]
  // Standard profile URL
  #[case("https://www.linkedin.com/in/john-doe/", "john-doe")]
  // Profile URL with locale suffix
  #[case("https://www.linkedin.com/in/john-doe/en/", "john-doe")]
  // Profile URL without trailing slash
  #[case("https://www.linkedin.com/in/john-doe", "john-doe")]
  fn test_li_profile_url_to_handle(#[case] url: &str, #[case] expected: &str) {
    assert_eq!(li_profile_url_to_handle(url), expected);
  }
}
