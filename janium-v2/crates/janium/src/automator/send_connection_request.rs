use std::time::{Duration, Instant};

use super::Automator;
use super::utils::Delay;
use super::vision::{VisionAnalysis, VisionTask};
use crate::prelude::*;
use thirtyfour::prelude::*;

/// State of the connection modal after clicking Connect.
#[derive(Debug)]
pub enum ConnectionModal {
  /// "Add a note" button visible - click it to reveal textarea.
  AddNoteButtonVisible(WebElement),
  /// Textarea visible - ready to type and send.
  TextareaVisible(WebElement),
  /// Email verification required (out of network).
  EmailVerification,
  /// Modal detected via AI vision (DOM selectors failed).
  /// Contains the vision analysis with element coordinates.
  VisionDetected(VisionAnalysis),
  /// No modal detected.
  None,
}

/// Result of checking connection status on a profile
#[derive(Debug, PartialEq)]
#[allow(unused)]
pub enum ConnectionStatus {
  /// Connect button available - can send request
  CanConnect,
  /// Already connected to this person
  AlreadyConnected,
  /// Connection request already pending
  RequestPending,
  /// Cannot determine status (error condition)
  Unknown,
}

/// Result of the hybrid Connect button search with status check
#[derive(Debug)]
pub enum ConnectionButtonResult {
  /// Connect button found - can proceed with connection request
  /// The bool indicates if it came from the More dropdown (true) or header (false)
  ConnectButton(WebElement, bool),
  /// Connection request already pending (button shows "Pending")
  RequestPending,
  /// Already connected to this person
  AlreadyConnected,
  /// Cannot connect - profile may be restricted or page didn't load correctly
  CannotConnect(String),
}

/// Result of inspecting the "More" dropdown for connection-related options
#[derive(Debug)]
enum MoreDropdownResult {
  /// "Connect" option found in dropdown
  Connect(WebElement),
  /// "Pending" option found - request already sent
  Pending,
  /// "Remove Connection" option found - already connected
  RemoveConnection,
  /// None of the above found
  Nothing,
}

/// LinkedIn connection degree with a profile
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionDegree {
  /// 1st degree - already connected
  First,
  /// 2nd degree - connected through a mutual connection
  Second,
  /// 3rd degree - connected through 2 people
  Third,
  /// 3rd+ or out of network
  OutOfNetwork,
  /// Could not determine degree
  Unknown,
}

/// Basic profile information scraped from the LinkedIn profile header
#[derive(Debug, Clone)]
pub struct ProfileInfo {
  /// Profile name (e.g., "John Smith")
  pub name: Option<String>,
  /// Connection degree (1st, 2nd, 3rd, etc.)
  pub degree: ConnectionDegree,
}

impl Automator {
  /// Find the profile header section using multiple fallback selectors.
  /// This scopes our button searches to the header only, avoiding sidebar recommendations.
  async fn find_profile_header(&self) -> Result<Option<WebElement>> {
    // Ensure we're in the main document context (not stuck in an iframe)
    let _ = self.driver.enter_default_frame().await;

    // Header selectors in priority order (primary first, then fallbacks)
    // LinkedIn has multiple UI variants - the "SDUI" variant uses componentkey and data-view-name
    // instead of data-member-id and semantic class names
    let header_selectors = [
      ("data-member-id", r#"//section[@data-member-id]"#),
      ("pv-top-card class", r#"//section[contains(@class,'pv-top-card')]"#),
      ("profile-card class", r#"//section[contains(@class,'profile-card')]"#),
      // SDUI variant selectors (obfuscated classes, uses componentkey/data-view-name)
      (
        "SDUI componentkey",
        r#"//section[contains(@componentkey,'profile.card')]"#,
      ),
      (
        "SDUI photo marker",
        r#"//section[.//*[@data-view-name='profile-top-card-member-photo']]"#,
      ),
      // Most generic fallback - section with a heading (h1 or h2)
      ("section with heading", r#"//main//section[.//h1 or .//h2]"#),
    ];

    // Retry with longer window - header may need time to re-render after scroll-to-top
    // 10 attempts × 500ms = 5 seconds total
    for attempt in 1..=10 {
      // Try each selector in priority order
      for (name, xpath) in header_selectors {
        if let Ok(header) = self.driver.find(By::XPath(xpath)).await {
          if attempt > 1 || name != "data-member-id" {
            tracing::info!("Found profile header via {} selector on attempt {}", name, attempt);
          } else {
            tracing::debug!("Found profile header section (data-member-id) on attempt {}", attempt);
          }
          return Ok(Some(header));
        }
      }

      if attempt < 10 {
        tracing::trace!("Profile header not found on attempt {}, retrying...", attempt);
        Delay::Ms(500).await;
      }
    }

    // === DIAGNOSTICS: Why can't we find the header? ===
    let url = self
      .driver
      .current_url()
      .await
      .map(|u| u.to_string())
      .unwrap_or_default();
    tracing::error!("[HeaderDebug] Failed to find header. URL: {}", url);

    // Check if ANY sections exist
    if let Ok(sections) = self.driver.find_all(By::XPath("//section")).await {
      tracing::error!("[HeaderDebug] Found {} <section> elements on page", sections.len());
      for (i, sec) in sections.iter().take(5).enumerate() {
        let has_member_id = sec.attr("data-member-id").await.ok().flatten();
        let class = sec.attr("class").await.ok().flatten().unwrap_or_default();
        tracing::error!(
          "[HeaderDebug] section[{}]: data-member-id={:?} class={:.100}",
          i,
          has_member_id,
          class
        );
      }
    } else {
      tracing::error!("[HeaderDebug] No <section> elements found at all!");
    }

    // Check for common blockers
    let blockers = [
      (
        "Login wall",
        "//form[contains(@action,'login') or contains(@class,'login')]",
      ),
      (
        "Auth wall",
        "//*[contains(@class,'auth-wall') or contains(@id,'auth-wall')]",
      ),
      ("CAPTCHA", "//*[contains(@class,'captcha') or contains(@id,'captcha')]"),
      (
        "Error page",
        "//*[contains(@class,'error') and contains(text(),'went wrong')]",
      ),
    ];
    for (name, xp) in blockers {
      if self.driver.find(By::XPath(xp)).await.is_ok() {
        tracing::error!("[HeaderDebug] Detected blocker: {}", name);
      }
    }

    tracing::warn!("Could not find profile header section after 10 attempts (tried all fallback selectors)");
    Ok(None)
  }

  /// Scrape profile name and connection degree from the LinkedIn profile header.
  pub async fn get_profile_info(&self) -> Result<ProfileInfo> {
    tracing::info!("Scraping profile info…");

    let mut name: Option<String> = None;
    let mut degree = ConnectionDegree::Unknown;

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Get profile name from h1/h2 in header
    // ═══════════════════════════════════════════════════════════════
    let name_selectors = [
      // Traditional UI - h1 with specific classes
      "//h1[contains(@class,'inline') and contains(@class,'t-24')]",
      "//h1[contains(@class,'text-heading-xlarge')]",
      "//section[@data-member-id]//h1",
      // SDUI variant - uses h2 instead of h1, inside section with componentkey
      "//section[contains(@componentkey,'profile.card')]//h2",
      // SDUI fallback - any h2 in a section with profile photo marker
      "//section[.//*[@data-view-name='profile-top-card-member-photo']]//h2",
      // Generic fallback - first h2 in main content
      "//main//section//h2",
    ];

    for selector in name_selectors {
      if let Ok(heading) = self.driver.find(By::XPath(selector)).await {
        let text = heading.text().await.unwrap_or_default().trim().to_string();
        if !text.is_empty() {
          name = Some(text);
          break;
        }
      }
    }

    if name.is_none() {
      tracing::warn!("Could not find profile name");
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Get connection degree from distance badge
    // ═══════════════════════════════════════════════════════════════
    let degree_selectors = [
      // Traditional UI - distance badge
      "//span[contains(@class,'distance-badge')]//span[contains(@class,'dist-value')]",
      "//span[contains(@class,'distance-badge')]//span[contains(@class,'visually-hidden')]",
      // SDUI variant - degree shown as "· 3rd" in a <p> element near the name
      // Look for p elements containing degree text in the profile header
      "//section[contains(@componentkey,'profile.card')]//*[contains(text(),'1st') or contains(text(),'2nd') or contains(text(),'3rd')]",
      "//section[.//*[@data-view-name='profile-top-card-member-photo']]//*[contains(text(),'1st') or contains(text(),'2nd') or contains(text(),'3rd')]",
    ];

    for selector in degree_selectors {
      if let Ok(badge) = self.driver.find(By::XPath(selector)).await {
        let text = badge.text().await.unwrap_or_default().trim().to_lowercase();

        if text.contains("1st") {
          degree = ConnectionDegree::First;
          break;
        } else if text.contains("2nd") {
          degree = ConnectionDegree::Second;
          break;
        } else if text.contains("3rd+") {
          degree = ConnectionDegree::OutOfNetwork;
          break;
        } else if text.contains("3rd") {
          degree = ConnectionDegree::Third;
          break;
        }
      }
    }

    // Fallback: check for "Out of network" indicator
    if degree == ConnectionDegree::Unknown {
      if self
        .driver
        .find(By::XPath(
          "//*[contains(text(),'Out of network') or contains(text(),'out of network')]",
        ))
        .await
        .is_ok()
      {
        tracing::info!("Detected 'Out of network' indicator");
        degree = ConnectionDegree::OutOfNetwork;
      } else {
        tracing::warn!("Could not determine connection degree");
      }
    }

    if let Some(ref n) = name {
      tracing::info!("Profile: {}", n);
    }

    Ok(ProfileInfo { name, degree })
  }

  // Detect the "Connect" button within the profile header section only
  #[allow(unused)]
  pub async fn find_connect_button(&self) -> Result<Option<WebElement>> {
    tracing::info!("DEBUG: Using find_connect_button VERSION 4 — HEADER-SCOPED (data-member-id)");

    // Always scroll to top (LinkedIn lazy-loads header actions)
    let _ = self.driver.execute("window.scrollTo(0,0);", vec![]).await;
    Delay::Scroll.await;

    // First, find the profile header to scope our search
    let header = match self.find_profile_header().await? {
      Some(h) => h,
      None => {
        tracing::warn!("No profile header found — cannot search for Connect button");
        return Ok(None);
      }
    };

    // 1) PRIMARY — Newer LinkedIn layout (real <button> Connect) within header
    let xp_button = r#"(.//button[contains(translate(@aria-label,'CONNECT','connect'),'invite') and contains(translate(.,'CONNECT','connect'),'connect')] | .//button[.//span[normalize-space()='Connect']])[1]"#;

    if let Ok(btn) = header.find(By::XPath(xp_button)).await {
      let btn_class = btn.class_name().await.unwrap_or_default();
      let btn_aria = btn.attr("aria-label").await.unwrap_or_default();
      let btn_text = btn.text().await.unwrap_or_default();
      tracing::info!(
        "Match source: BUTTON within header — class={:?} aria-label={:?} text={:?}",
        btn_class,
        btn_aria,
        btn_text
      );
      return Ok(Some(btn));
    }

    // 2) SECONDARY — Older LinkedIn layout (<a> Connect anchor) within header
    let xp_anchor = r#"(.//div[@data-view-name='edge-creation-connect-action']//a)[1]"#;

    if let Ok(a) = header.find(By::XPath(xp_anchor)).await {
      tracing::info!("Match source: ANCHOR within header (edge-creation <a> layout)");
      return Ok(Some(a));
    }

    // 3) FALLBACK — Find Connect span within header, but NOT inside dropdown content
    // The dropdown content is in the DOM but hidden; we don't want to match those spans
    let xp_span = r#"(.//span[normalize-space()='Connect' and not(ancestor::div[contains(@class,'artdeco-dropdown__content')])])[1]"#;

    if let Ok(span) = header.find(By::XPath(xp_span)).await {
      // Log details about what we found
      let outer_html = span.outer_html().await.unwrap_or_default();
      let class = span.class_name().await.unwrap_or_default();
      tracing::info!(
        "Match source: SPAN within header — class={:?} html={:?}",
        class,
        &outer_html[..outer_html.len().min(200)]
      );

      let xp_parent = ".//ancestor::*[self::button or self::a or @role='button'][1]";
      if let Ok(parent) = span.find(By::XPath(xp_parent)).await {
        let parent_tag = parent.tag_name().await.unwrap_or_default();
        let parent_class = parent.class_name().await.unwrap_or_default();
        let parent_aria = parent.attr("aria-label").await.unwrap_or_default();
        tracing::info!(
          "SPAN resolved to clickable parent — tag={} class={:?} aria-label={:?}",
          parent_tag,
          parent_class,
          parent_aria
        );
        return Ok(Some(parent));
      }

      tracing::warn!("SPAN fallback found but no clickable parent — returning span");
      return Ok(Some(span));
    }

    // 4) FINAL ESCAPE — "More" dropdown → Connect (within header)
    if let MoreDropdownResult::Connect(el) = self.check_more_dropdown(&header).await? {
      return Ok(Some(el));
    }

    // ───────────────────────────────────────────────────────────────
    tracing::warn!("No Connect button found within profile header.");
    Ok(None)
  }

  /// Hybrid Connect button search with status check (Option C).
  /// Checks for Pending/Connect in header first, then inspects More dropdown once.
  /// Returns ConnectionButtonResult indicating what was found.
  pub async fn find_connect_button_with_status(&self) -> Result<ConnectionButtonResult> {
    tracing::info!("Checking connection status (hybrid approach)…");

    // Always scroll to top (LinkedIn lazy-loads header actions)
    let _ = self.driver.execute("window.scrollTo(0,0);", vec![]).await;
    Delay::Scroll.await;

    // First, find the profile header to scope our search
    let header = match self.find_profile_header().await? {
      Some(h) => h,
      None => {
        tracing::warn!("No profile header found — cannot determine connection status");
        return Ok(ConnectionButtonResult::CannotConnect(
          "No profile header found".to_string(),
        ));
      }
    };

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Check header for "Pending" button FIRST (early exit)
    // ═══════════════════════════════════════════════════════════════
    let xp_pending_btn = r#".//button[.//span[normalize-space()='Pending']]"#;
    if header.find(By::XPath(xp_pending_btn)).await.is_ok() {
      tracing::info!("Found 'Pending' button in header - request already sent");
      return Ok(ConnectionButtonResult::RequestPending);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Check header for "Connect" button
    // ═══════════════════════════════════════════════════════════════

    // 2a) PRIMARY — Newer LinkedIn layout (real <button> Connect)
    let xp_button = r#"(.//button[contains(translate(@aria-label,'CONNECT','connect'),'invite') and contains(translate(.,'CONNECT','connect'),'connect')] | .//button[.//span[normalize-space()='Connect']])[1]"#;

    if let Ok(btn) = header.find(By::XPath(xp_button)).await {
      let btn_text = btn.text().await.unwrap_or_default();
      tracing::info!("Found Connect button in header: {:?}", btn_text);
      return Ok(ConnectionButtonResult::ConnectButton(btn, false));
    }

    // 2b) SECONDARY — SDUI layout (<a> Connect anchor via data-view-name)
    let xp_anchor = r#"(.//div[@data-view-name='edge-creation-connect-action']//a)[1]"#;

    if let Ok(a) = header.find(By::XPath(xp_anchor)).await {
      tracing::info!("Found Connect anchor in header (edge-creation layout)");
      return Ok(ConnectionButtonResult::ConnectButton(a, false));
    }

    // 2b-alt) SDUI anchor by aria-label pattern (fallback if data-view-name fails)
    let xp_anchor_aria = r#"(.//a[contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'invite') and contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'connect')])[1]"#;

    if let Ok(a) = header.find(By::XPath(xp_anchor_aria)).await {
      tracing::info!("Found Connect anchor in header (aria-label pattern)");
      return Ok(ConnectionButtonResult::ConnectButton(a, false));
    }

    // 2b-alt2) SDUI anchor containing Connect span (most generic anchor fallback)
    let xp_anchor_span =
      r#"(.//a[.//span[normalize-space()='Connect'] and not(ancestor::*[contains(@class,'dropdown')])])[1]"#;

    if let Ok(a) = header.find(By::XPath(xp_anchor_span)).await {
      tracing::info!("Found Connect anchor in header (span text fallback)");
      return Ok(ConnectionButtonResult::ConnectButton(a, false));
    }

    // 2c) FALLBACK — Find Connect span (not in dropdown), resolve to clickable parent
    let xp_span = r#"(.//span[normalize-space()='Connect' and not(ancestor::div[contains(@class,'artdeco-dropdown__content')])])[1]"#;

    if let Ok(span) = header.find(By::XPath(xp_span)).await {
      let xp_parent = ".//ancestor::*[self::button or self::a or @role='button'][1]";
      if let Ok(parent) = span.find(By::XPath(xp_parent)).await {
        tracing::info!("Found Connect span in header, resolved to clickable parent");
        return Ok(ConnectionButtonResult::ConnectButton(parent, false));
      }
      // Return span itself if no clickable parent
      tracing::warn!("Connect span found but no clickable parent — using span directly");
      return Ok(ConnectionButtonResult::ConnectButton(span, false));
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Check More dropdown (single open, checks all statuses)
    // ═══════════════════════════════════════════════════════════════
    tracing::info!("No Connect/Pending in header — checking More dropdown…");

    match self.check_more_dropdown(&header).await? {
      MoreDropdownResult::Connect(el) => {
        tracing::info!("Found Connect in More dropdown");
        return Ok(ConnectionButtonResult::ConnectButton(el, true)); // true = from dropdown
      }
      MoreDropdownResult::Pending => {
        tracing::info!("Found Pending in More dropdown - request already sent");
        return Ok(ConnectionButtonResult::RequestPending);
      }
      MoreDropdownResult::RemoveConnection => {
        tracing::info!("Found 'Remove Connection' in More dropdown - already connected");
        return Ok(ConnectionButtonResult::AlreadyConnected);
      }
      MoreDropdownResult::Nothing => {
        // Continue to additional checks
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Check for "Message" as primary action (indicates 1st degree)
    // ═══════════════════════════════════════════════════════════════
    let message_selectors = [
      ".//button[contains(@aria-label,'Message')]",
      ".//button[.//span[normalize-space()='Message']]",
    ];

    for selector in message_selectors {
      if header.find(By::XPath(selector)).await.is_ok() {
        tracing::info!("Found 'Message' as primary action - already connected");
        return Ok(ConnectionButtonResult::AlreadyConnected);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Cannot determine - profile may be restricted
    // ═══════════════════════════════════════════════════════════════
    tracing::warn!("Could not find Connect button or determine connection status");
    Ok(ConnectionButtonResult::CannotConnect(
      "Profile may be restricted or page failed to load correctly".to_string(),
    ))
  }

  /// Inspect the "More" dropdown in profile header for connection-related options.
  /// Checks for Connect, Pending, and Remove Connection in a single dropdown open.
  /// Returns MoreDropdownResult indicating what was found.
  async fn check_more_dropdown(&self, header: &WebElement) -> Result<MoreDropdownResult> {
    tracing::info!("Checking More dropdown for connection status…");

    // 1. Find the More actions button within the profile header
    // Try multiple selectors to handle both traditional and SDUI variants
    let more_selectors = [
      // Traditional UI
      (
        "traditional",
        r#".//button[@aria-label='More actions' and contains(@class,'artdeco-dropdown__trigger')]"#,
      ),
      // SDUI variant - uses data-view-name instead of semantic classes
      ("SDUI", r#".//button[@data-view-name='profile-overflow-button']"#),
      // Fallback - just aria-label='More' (SDUI uses this)
      ("aria-label fallback", r#".//button[@aria-label='More']"#),
    ];

    let mut more_btn: Option<WebElement> = None;
    for (name, selector) in more_selectors {
      if let Ok(btn) = header.find(By::XPath(selector)).await {
        tracing::debug!("Found More button via {} selector", name);
        more_btn = Some(btn);
        break;
      }
    }

    let more_btn = match more_btn {
      Some(btn) => btn,
      None => {
        tracing::debug!("No More button found in header (tried all selectors)");
        return Ok(MoreDropdownResult::Nothing);
      }
    };

    // 2. Smooth scroll to center of viewport (avoids message overlays at bottom)
    self
      .driver
      .execute(
        "arguments[0].scrollIntoView({block: 'center', behavior: 'smooth'});",
        vec![more_btn.to_json()?],
      )
      .await?;
    Delay::Click.await; // Wait for smooth scroll to complete

    tracing::info!("More actions button found → clicking");
    if let Err(e) = more_btn.click().await {
      // Fallback to JavaScript click if normal click is intercepted (e.g., by message overlays)
      tracing::warn!("Normal click failed ({}), trying JavaScript click", e);
      self
        .driver
        .execute("arguments[0].click();", vec![more_btn.to_json()?])
        .await?;
    }

    // 3. Wait for dropdown to become visible
    // Try multiple selectors for dropdown visibility (traditional and SDUI)
    let dropdown_selectors = [
      // Traditional UI
      r#"//div[contains(@class,'artdeco-dropdown__content') and @aria-hidden='false']"#,
      // SDUI fallback - look for menu role
      r#"//div[@role='menu' and not(@aria-hidden='true')]"#,
      // SDUI fallback - look for listbox role
      r#"//div[@role='listbox' and not(@aria-hidden='true')]"#,
    ];

    let deadline = Instant::now() + Duration::from_millis(1500);
    let dropdown = 'outer: loop {
      for &selector in &dropdown_selectors {
        if let Ok(el) = self.driver.find(By::XPath(selector)).await {
          tracing::info!("More dropdown opened successfully");
          break 'outer el;
        }
      }
      if Instant::now() > deadline {
        tracing::warn!("More dropdown did not open within timeout");
        // Click body to close any partial state
        let _ = self.driver.execute("document.body.click();", vec![]).await;
        return Ok(MoreDropdownResult::Nothing);
      }
      Delay::Ms(100).await;
    };

    // 4. Check for "Remove Connection" first (indicates already connected)
    // Try multiple selectors for traditional and SDUI
    let remove_connection_selectors = [
      // Traditional UI
      r#".//span[contains(translate(normalize-space(),'REMOVE','remove'),'remove') and contains(translate(normalize-space(),'CONNECTION','connection'),'connection')]/ancestor::div[contains(@class,'artdeco-dropdown__item')]"#,
      // SDUI fallback - just find the text, get clickable ancestor
      r#".//*[contains(translate(normalize-space(),'REMOVE','remove'),'remove') and contains(translate(normalize-space(),'CONNECTION','connection'),'connection')]/ancestor::*[@role='menuitem' or self::button or self::div[@tabindex]]"#,
    ];

    for selector in remove_connection_selectors {
      if dropdown.find(By::XPath(selector)).await.is_ok() {
        tracing::info!("Found 'Remove Connection' in More dropdown - already connected");
        // Close dropdown before returning
        let _ = self.driver.execute("document.body.click();", vec![]).await;
        Delay::Ms(150).await;
        return Ok(MoreDropdownResult::RemoveConnection);
      }
    }

    // 5. Check for "Pending" (indicates request already sent)
    let pending_selectors = [
      // Traditional UI
      r#".//span[normalize-space()='Pending']/ancestor::div[contains(@class,'artdeco-dropdown__item')]"#,
      // SDUI fallback
      r#".//*[normalize-space()='Pending']/ancestor::*[@role='menuitem' or self::button or self::div[@tabindex]]"#,
    ];

    for selector in pending_selectors {
      if dropdown.find(By::XPath(selector)).await.is_ok() {
        tracing::info!("Found 'Pending' in More dropdown - request already sent");
        // Close dropdown before returning
        let _ = self.driver.execute("document.body.click();", vec![]).await;
        Delay::Ms(150).await;
        return Ok(MoreDropdownResult::Pending);
      }
    }

    // 6. Check for Connect item
    // IMPORTANT: SDUI Connect items do NOT have role="menuitem" or tabindex (but Follow does!)
    // so we must NOT use ancestor traversal that looks for those attributes.
    let connect_selectors = [
      // Traditional UI - aria-label containing "connect" with artdeco class
      (
        "traditional aria-label",
        r#".//div[contains(translate(@aria-label,'CONNECT','connect'),'connect') and contains(@class,'artdeco-dropdown__item')]"#,
      ),
      // Traditional UI - span text with artdeco-dropdown__item ancestor
      (
        "traditional span",
        r#".//span[normalize-space()='Connect']/ancestor::div[contains(@class,'artdeco-dropdown__item')]"#,
      ),
      // SDUI - use data-view-name which uniquely identifies Connect vs Follow
      // Connect: data-view-name="edge-creation-connect-action" with <a role="menuitem">
      // Follow: data-view-name="edge-creation-follow-action" with <div role="menuitem">
      (
        "SDUI data-view-name connect-action",
        r#".//div[@data-view-name='edge-creation-connect-action']//a[@role='menuitem']"#,
      ),
      // SDUI fallback - Connect may use div instead of a for menuitem
      (
        "SDUI data-view-name connect-action div",
        r#".//div[@data-view-name='edge-creation-connect-action']//div[@role='menuitem']"#,
      ),
      // SDUI fallback - aria-label must contain BOTH "invite" AND "connect" (unique to Connect action)
      // e.g., "Invite John Doe to connect" - Follow would only have "Follow John Doe"
      (
        "SDUI invite+connect aria-label",
        r#".//*[contains(translate(@aria-label,'INVITE','invite'),'invite') and contains(translate(@aria-label,'CONNECT','connect'),'connect')]"#,
      ),
      // SDUI fallback - element with componentkey containing p with exact Connect text
      (
        "SDUI componentkey with Connect",
        r#".//*[@componentkey and .//p[normalize-space()='Connect']]"#,
      ),
    ];

    for (name, selector) in connect_selectors {
      if let Ok(connect_item) = dropdown.find(By::XPath(selector)).await {
        // Log details to help debug if wrong element is clicked
        let aria_label = connect_item.attr("aria-label").await.ok().flatten().unwrap_or_default();
        let text = connect_item.text().await.unwrap_or_default();
        tracing::info!(
          "Found Connect in More dropdown via '{}': aria-label={:?} text={:?}",
          name,
          aria_label.chars().take(60).collect::<String>(),
          text.chars().take(30).collect::<String>()
        );
        // Don't close dropdown - we're returning the element to be clicked
        return Ok(MoreDropdownResult::Connect(connect_item));
      }
    }

    // 8. None of the expected options found - close dropdown
    tracing::warn!("No connection-related options found in More dropdown — closing");
    let _ = self.driver.execute("document.body.click();", vec![]).await;
    Delay::Ms(150).await;

    Ok(MoreDropdownResult::Nothing)
  }

  /// Check the connection status with a profile (already connected, pending, can connect, or unknown)
  #[expect(dead_code)]
  pub async fn check_connection_status(&self) -> Result<ConnectionStatus> {
    // First check if Connect button exists
    if self.find_connect_button().await?.is_some() {
      return Ok(ConnectionStatus::CanConnect);
    }

    // Check for "Pending" button (request already sent)
    if self
      .driver
      .find(By::XPath("//button//span[contains(text(),'Pending')]"))
      .await
      .is_ok()
    {
      tracing::info!("Found 'Pending' button - connection request already sent");
      return Ok(ConnectionStatus::RequestPending);
    }

    // Check for "Message" button (already connected)
    let message_selectors = [
      "//button[contains(@aria-label,'Message')]",
      "//button//span[normalize-space()='Message']",
      "//a[contains(@href,'/messaging/')]//span[normalize-space()='Message']",
    ];

    for selector in message_selectors {
      if self.driver.find(By::XPath(selector)).await.is_ok() {
        tracing::info!("Found 'Message' button - already connected");
        return Ok(ConnectionStatus::AlreadyConnected);
      }
    }

    // Check for "Follow" button without Connect (might indicate restricted profile)
    if self
      .driver
      .find(By::XPath("//button//span[normalize-space()='Follow']"))
      .await
      .is_ok()
    {
      tracing::warn!("Found 'Follow' button but no 'Connect' - profile may be restricted");
      return Ok(ConnectionStatus::Unknown);
    }

    tracing::warn!("Could not determine connection status");
    Ok(ConnectionStatus::Unknown)
  }

  /// Wait until the Connect button and page are "ready" before we try to click.
  /// Returns `true` if an overlay was detected over the button center.
  pub async fn wait_until_connect_button_ready(&self, btn: &WebElement) -> Result<bool> {
    use serde_json::json;

    // Minimal log so we know the helper ran at all
    tracing::info!("[ClickFlow] Checking Connect button readiness (minimal)…");

    // Make sure it's roughly in view (even if .is_displayed() lies)
    let _ = btn.scroll_into_view().await;
    Delay::Ms(150).await;

    // Quick client-side overlay probe on the button center
    let rect = btn.rect().await?;
    let center_x = rect.x + rect.width / 2.0;
    let center_y = rect.y + rect.height / 2.0;

    let script = r#"
      const x = arguments[0];
      const y = arguments[1];
      const el = arguments[2];

      const top = document.elementFromPoint(x, y);
      if (!top || top === el || el.contains(top)) {
        return null; // nothing suspicious on top
      }

      // Return a short description of the overlapping element
      let tag = top.tagName || 'UNKNOWN';
      let cls = top.className || '';
      return tag + (cls ? ('.' + cls.toString().replace(/\s+/g, '.')) : '');
    "#;

    let mut overlay_detected = false;

    if let Ok(res) = self
      .driver
      .execute(script, vec![json!(center_x), json!(center_y), btn.to_json()?])
      .await
    {
      let val = res.json(); // modern thirtyfour method

      if !val.is_null() {
        tracing::warn!("[ClickFlow] Overlay detected over Connect center: {:?}", val);
        overlay_detected = true;
      }
    }

    Ok(overlay_detected)
  }

  /// Wait until the important parts of the public profile page are ready.
  /// Much faster than Delay::BigLoad, usually < 1 second.
  pub async fn wait_for_public_profile_ready(&self) -> Result<()> {
    tracing::info!("[PageReady] Checking public profile readiness…");

    // Try for ~2 seconds max
    let deadline = Instant::now() + Duration::from_millis(2000);

    loop {
      // 1. Basic heuristic: major sections of the LinkedIn profile exist
      let ready = self
        .driver
        .execute(
          r#"
            const header = document.querySelector('section[data-member-id]');
            const actions = document.querySelector('.pv-top-card-v3__container');
            const photo = document.querySelector('.pv-top-card__photo, img.pv-top-card-profile-picture__image');
            const connect = document.querySelector('button[aria-label*="Connect"], span:text("Connect")');
            return Boolean(header && actions && photo);
        "#,
          vec![],
        )
        .await;

      if let Ok(res) = ready
        && res.json().as_bool().unwrap_or(false)
      {
        tracing::info!("[PageReady] Public profile ready.");
        return Ok(());
      }

      if Instant::now() > deadline {
        tracing::warn!("[PageReady] Timeout — proceeding anyway.");
        return Ok(());
      }

      Delay::Ms(120).await;
    }
  }

  // Click connect button (native → JS fallback → forced event dispatch)
  // If `overlay_detected` is true, skip native click and go straight to JS click
  pub async fn click_connect_button(&self, btn: &WebElement, overlay_detected: bool) -> Result<()> {
    tracing::info!("Clicking Connect button…");

    //
    // Scroll into view
    //
    btn.scroll_into_view().await?;

    Delay::Click.await;

    // If overlay was detected, skip native click entirely - it will silently fail
    if !overlay_detected {
      // 1) Native Selenium click (2 tries)
      for attempt in 1..=2 {
        tracing::info!("Native click attempt {}…", attempt);

        match btn.click().await {
          Ok(_) => {
            tracing::info!("✓ Native click succeeded.");
            Delay::Click.await;
            return Ok(());
          }
          Err(e) => match &*e {
            thirtyfour::error::WebDriverErrorInner::ElementNotInteractable(_) => {
              break;
            }
            _ => {
              tracing::warn!("Native click failed: {:?}", e);
              Delay::Click.await;
            }
          },
        }
      }
      tracing::warn!("Native failed → trying JS click…");
    } else {
      tracing::info!("Overlay detected → skipping native click, using JS click directly…");
    }

    // 2) JS click

    if self
    .driver
    .execute("arguments[0].click();", vec![btn.to_json()?])   // FIXED
    .await
    .is_ok()
    {
      tracing::info!("✓ JS click succeeded.");
      Delay::Click.await;
      return Ok(());
    }

    // 3) Synthetic mouse event for React overlays
    tracing::warn!("JS click failed → dispatching synthetic click…");

    self
      .driver
      .execute(
        r#"
    const el = arguments[0];
    el.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
    }));
    "#,
        vec![btn.to_json()?],
      )
      .await?;

    Delay::Click.await;

    // If still nothing triggered → try CDP mouse move + click
    tracing::warn!("Synthetic click failed → trying CDP move+click fallback…");

    if self.cdp_move_and_click(btn).await.is_ok() {
      tracing::info!("✓ CDP move+click succeeded.");
      Delay::Click.await;
      return Ok(());
    }

    // TODO: Check if we can find the Add Note button and click it
    // If still nothing triggered, return a clean error
    Err(JaniumError::msg("All click strategies failed"))
  }

  pub async fn cdp_move_and_click(&self, el: &WebElement) -> Result<()> {
    use serde_json::json;

    // Get element center in page coordinates
    let rect = el.rect().await?;
    let page_x = rect.x + rect.width / 2.0;
    let page_y = rect.y + rect.height / 2.0;

    // Get scroll offset to convert page coords to viewport coords
    // CDP Input.dispatchMouseEvent expects viewport coordinates
    let scroll_offset: (f64, f64) = self
      .driver
      .execute("return [window.scrollX, window.scrollY];", vec![])
      .await
      .ok()
      .and_then(|v| {
        let arr = v.json().as_array()?;
        Some((arr.first()?.as_f64()?, arr.get(1)?.as_f64()?))
      })
      .unwrap_or((0.0, 0.0));

    let x = page_x - scroll_offset.0;
    let y = page_y - scroll_offset.1;

    tracing::debug!(
      "CDP_move_and_click: page coords ({}, {}), scroll offset ({}, {}), viewport coords ({}, {})",
      page_x,
      page_y,
      scroll_offset.0,
      scroll_offset.1,
      x,
      y
    );

    // Move mouse to position
    self
      .driver
      .execute(
        "Input.dispatchMouseEvent",
        vec![json!({
            "type": "mouseMoved",
            "x": x,
            "y": y,
            "buttons": 1
        })],
      )
      .await?;

    Delay::Ms(150).await;

    // Mouse pressed
    self
      .driver
      .execute(
        "Input.dispatchMouseEvent",
        vec![json!({
            "type": "mousePressed",
            "x": x,
            "y": y,
            "button": "left",
            "clickCount": 1
        })],
      )
      .await?;

    Delay::Ms(50).await;

    // Mouse released
    self
      .driver
      .execute(
        "Input.dispatchMouseEvent",
        vec![json!({
            "type": "mouseReleased",
            "x": x,
            "y": y,
            "button": "left",
            "clickCount": 1
        })],
      )
      .await?;

    Ok(())
  }

  // CDP-based click (real Chrome DevTools mouse events)
  #[expect(dead_code)]
  pub async fn cdp_force_click(&self, el: &WebElement) -> Result<()> {
    use serde_json::json;

    // Get element center in page coordinates
    let rect = el.rect().await?;
    let page_x = rect.x + rect.width / 2.0;
    let page_y = rect.y + rect.height / 2.0;

    // Get scroll offset to convert page coords to viewport coords
    // CDP Input.dispatchMouseEvent expects viewport coordinates
    let scroll_offset: (f64, f64) = self
      .driver
      .execute("return [window.scrollX, window.scrollY];", vec![])
      .await
      .ok()
      .and_then(|v| {
        let arr = v.json().as_array()?;
        Some((arr.first()?.as_f64()?, arr.get(1)?.as_f64()?))
      })
      .unwrap_or((0.0, 0.0));

    let x = page_x - scroll_offset.0;
    let y = page_y - scroll_offset.1;

    tracing::debug!(
      "CDP_force_click: page coords ({}, {}), scroll offset ({}, {}), viewport coords ({}, {})",
      page_x,
      page_y,
      scroll_offset.0,
      scroll_offset.1,
      x,
      y
    );

    let press = json!({
        "type": "mousePressed",
        "x": x,
        "y": y,
        "button": "left",
        "clickCount": 1
    });

    let release = json!({
        "type": "mouseReleased",
        "x": x,
        "y": y,
        "button": "left",
        "clickCount": 1
    });

    self.driver.execute("Input.dispatchMouseEvent", vec![press]).await?;

    self.driver.execute("Input.dispatchMouseEvent", vec![release]).await?;

    Ok(())
  }

  // Detect which connection modal is currently shown.
  #[expect(dead_code)]
  pub async fn detect_connection_modal(&self) -> Result<ConnectionModal> {
    // Detect the modal container itself - use broad selector to catch LinkedIn UI changes
    let dialog = self
      .driver
      .find(By::XPath("//*[contains(@class,'artdeco-modal') or contains(@class,'send-invite') or (@role='dialog' and (contains(@class,'modal') or contains(@aria-label,'nvit')))]"))
      .await;

    if let Ok(dialog) = dialog {
      // PRIORITY: Check if "Add a note" button exists - means we need to click it first
      // This takes priority because LinkedIn shows hidden textarea until button is clicked
      if let Ok(span) = dialog
        .find(By::XPath(".//button//span[normalize-space()='Add a note']"))
        .await
      {
        // Get the parent button element to pass along
        if let Ok(btn) = span.find(By::XPath("./ancestor::button")).await {
          tracing::info!("[ModalDetect] Found 'Add a note' button - returning AddNoteButtonVisible");
          return Ok(ConnectionModal::AddNoteButtonVisible(btn));
        }
      }

      // Check for VISIBLE textarea (not just present)
      if let Ok(textarea) = dialog.find(By::XPath(".//textarea")).await
        && textarea.is_displayed().await.unwrap_or(false)
      {
        tracing::info!("[ModalDetect] Found visible textarea - returning TextareaVisible");
        return Ok(ConnectionModal::TextareaVisible(textarea));
      }

      // Send button exists - we're past the "Add a note" step, find textarea
      if let Ok(textarea) = dialog.find(By::XPath(".//textarea")).await {
        tracing::info!("[ModalDetect] Found Send button state - returning TextareaVisible");
        return Ok(ConnectionModal::TextareaVisible(textarea));
      }

      // RETRY classification once (LinkedIn loads modal content late)
      Delay::Ms(150).await;

      // retry: check for "Add a note" button
      if let Ok(span) = dialog
        .find(By::XPath(".//button//span[normalize-space()='Add a note']"))
        .await
        && let Ok(btn) = span.find(By::XPath("./ancestor::button")).await
      {
        tracing::info!("[ModalDetect] Retry: Found 'Add a note' button - returning AddNoteButtonVisible");
        return Ok(ConnectionModal::AddNoteButtonVisible(btn));
      }

      // retry: check for visible textarea
      if let Ok(textarea) = dialog.find(By::XPath(".//textarea")).await
        && textarea.is_displayed().await.unwrap_or(false)
      {
        tracing::info!("[ModalDetect] Retry: Found visible textarea - returning TextareaVisible");
        return Ok(ConnectionModal::TextareaVisible(textarea));
      }

      // retry: Send button state - find textarea
      if let Ok(textarea) = dialog.find(By::XPath(".//textarea")).await {
        tracing::info!("[ModalDetect] Retry: Found Send button state - returning TextareaVisible");
        return Ok(ConnectionModal::TextareaVisible(textarea));
      }

      // Container exists but still no recognizable content
      tracing::warn!("[ModalDetect] Modal found but no recognizable buttons/textarea");
      return Ok(ConnectionModal::None);
    }

    // Fallback text-based checks
    if self
      .driver
      .find(By::XPath(
        "//h2[@id='send-invite-modal' or contains(normalize-space(),'Add a note')]",
      ))
      .await
      .is_ok()
    {
      // Try to find textarea for this fallback
      if let Ok(textarea) = self.driver.find(By::XPath("//*[@role='dialog']//textarea")).await {
        return Ok(ConnectionModal::TextareaVisible(textarea));
      }
    }

    if let Ok(span) = self
      .driver
      .find(By::XPath("//span[normalize-space()='Add a note']"))
      .await
      && let Ok(btn) = span.find(By::XPath("./ancestor::button")).await
    {
      return Ok(ConnectionModal::AddNoteButtonVisible(btn));
    }

    Ok(ConnectionModal::None)
  }

  // Waits for connection modal to appear with exponential backoff.
  // Total timeout: ~10 seconds (100 + 150 + 225 + 337 + 506 + 759 + 1139 + 1708 + 2562 + 2000 = ~9.5s)
  pub async fn wait_for_connection_modal(&self) -> Result<ConnectionModal> {
    tracing::info!("Waiting for LinkedIn connection modal…");

    let mut delay_ms: u64 = 100;
    let max_delay_ms: u64 = 2000;
    let max_total_ms: u64 = 10_000;
    let start = Instant::now();

    while start.elapsed() < Duration::from_millis(max_total_ms) {
      // Use broader selector: artdeco-modal OR role='dialog' OR common modal patterns
      let modal = self
        .driver
        .find(By::XPath("//*[contains(@class,'artdeco-modal') or contains(@class,'send-invite') or (@role='dialog' and (contains(@class,'modal') or contains(@aria-label,'nvit')))]"))
        .await;

      if let Ok(dialog) = modal {
        tracing::info!("✓ Modal detected after {:?}!", start.elapsed());

        // Check for email verification input - LinkedIn requires email for some connections
        // Look for input with type="email" or placeholder containing "email"
        if dialog
          .find(By::XPath(".//input[@type='email' or contains(@placeholder,'email') or contains(@placeholder,'Email') or contains(@id,'email')]"))
          .await
          .is_ok()
        {
          tracing::info!("[WaitModal] Found email verification input - returning EmailVerification");
          return Ok(ConnectionModal::EmailVerification);
        }

        // PRIORITY: Check for "Add a note" button FIRST - means textarea is hidden
        if let Ok(span) = dialog
          .find(By::XPath(".//button//span[normalize-space()='Add a note']"))
          .await
        {
          if let Ok(btn) = span.find(By::XPath("./ancestor::button")).await {
            tracing::info!("[WaitModal] Found 'Add a note' button - returning AddNoteButtonVisible");
            return Ok(ConnectionModal::AddNoteButtonVisible(btn));
          }
        } else {
          tracing::info!("[WaitModal] No 'Add a note' button found");
        }

        // Check for VISIBLE textarea (not just present in DOM)
        if let Ok(textarea) = dialog.find(By::XPath(".//textarea")).await
          && textarea.is_displayed().await.unwrap_or(false)
        {
          tracing::info!("[WaitModal] Found visible textarea - returning TextareaVisible");
          return Ok(ConnectionModal::TextareaVisible(textarea));
        }

        // Check for Send button - we're past the "Add a note" step, find textarea
        if let Ok(textarea) = dialog.find(By::XPath(".//textarea")).await {
          tracing::info!("[WaitModal] Found Send button state - returning TextareaVisible");
          return Ok(ConnectionModal::TextareaVisible(textarea));
        }

        // Modal exists but hasn't loaded contents - use shorter delay for content check
        Delay::Ms(150).await;
        continue;
      }

      // Exponential backoff for modal appearance
      Delay::Ms(delay_ms).await;
      delay_ms = (delay_ms * 3 / 2).min(max_delay_ms);
    }

    tracing::warn!("Modal NOT detected after {:?}.", start.elapsed());

    // Diagnostic logging: what IS on the page?
    if let Ok(dialogs) = self
      .driver
      .find_all(By::XPath(
        "//*[@role='dialog' or contains(@class,'modal') or contains(@class,'overlay')]",
      ))
      .await
    {
      tracing::warn!(
        "[ModalDebug] Found {} elements with role=dialog/modal/overlay classes",
        dialogs.len()
      );
      for (i, el) in dialogs.iter().take(3).enumerate() {
        if let Ok(tag) = el.tag_name().await {
          let class = el.attr("class").await.ok().flatten().unwrap_or_default();
          let role = el.attr("role").await.ok().flatten().unwrap_or_default();
          let aria_label = el.attr("aria-label").await.ok().flatten().unwrap_or_default();
          tracing::warn!(
            "[ModalDebug] Element {}: <{}> class={:?} role={:?} aria-label={:?}",
            i,
            tag,
            class.chars().take(100).collect::<String>(),
            role,
            aria_label.chars().take(50).collect::<String>()
          );
        }
      }
    }

    // Check if there's an error toast or rate limit message
    if let Ok(toasts) = self
      .driver
      .find_all(By::XPath(
        "//*[contains(@class,'artdeco-toast') or contains(@class,'alert') or contains(@class,'error')]",
      ))
      .await
    {
      for toast in toasts.iter().take(2) {
        if let Ok(text) = toast.text().await
          && !text.trim().is_empty()
        {
          tracing::warn!(
            "[ModalDebug] Toast/alert found: {:?}",
            text.chars().take(200).collect::<String>()
          );
        }
      }
    }

    Ok(ConnectionModal::None)
  }

  /// Wait for connection modal with AI vision fallback.
  /// First tries DOM-based detection, then falls back to vision if configured.
  pub async fn wait_for_connection_modal_with_vision(&self) -> Result<ConnectionModal> {
    // First, try standard DOM-based detection
    let modal = self.wait_for_connection_modal().await?;

    // If we found the modal via DOM, return it
    if !matches!(modal, ConnectionModal::None) {
      return Ok(modal);
    }

    // DOM detection failed - try vision fallback if enabled
    if self.vision_config().is_none() {
      tracing::warn!("[Vision] Vision fallback disabled or API key not configured");
      return Ok(ConnectionModal::None);
    }

    tracing::info!("[Vision] DOM detection failed, trying vision fallback for modal detection");

    // First, check for any error states
    let error_analysis = self.detect_errors_visually().await?;
    if error_analysis.element_found
      && let Some(error_type) = &error_analysis.error_detected
    {
      if error_type.contains("email_verification") {
        tracing::info!("[Vision] Detected email verification requirement");
        return Ok(ConnectionModal::EmailVerification);
      }
      // Return error for other detected issues
      return Err(JaniumError::msg(format!(
        "Vision detected error: {} - {}",
        error_type, error_analysis.guidance
      )));
    }

    // Try to find the connection modal
    let analysis = self
      .find_element_visually(
        VisionTask::FindConnectionModal,
        Some("Just clicked Connect button on LinkedIn profile, expecting connection modal to appear"),
      )
      .await?;

    if analysis.element_found && analysis.confidence > 0.6 {
      tracing::info!(
        "[Vision] Modal detected via vision with confidence {:.2}",
        analysis.confidence
      );
      return Ok(ConnectionModal::VisionDetected(analysis));
    }

    tracing::warn!(
      "[Vision] Modal not found via vision either. Guidance: {}",
      analysis.guidance
    );
    Ok(ConnectionModal::None)
  }

  /// Handle a vision-detected modal by clicking elements at coordinates.
  /// Returns the next modal state after interaction.
  pub async fn handle_vision_modal(&self, analysis: &VisionAnalysis) -> Result<ConnectionModal> {
    // If we have coordinates, click them
    if let Some((x, y)) = analysis.coordinates {
      tracing::info!("[Vision] Clicking at vision-detected coordinates ({}, {})", x, y);
      self.click_at_coordinates(x, y).await?;
      Delay::Click.await;

      // Check if textarea is now visible
      let textarea_analysis = self
        .find_element_visually(
          VisionTask::FindMessageTextarea,
          Some("Just clicked Add a note button, expecting textarea to appear"),
        )
        .await?;

      if textarea_analysis.element_found && textarea_analysis.confidence > 0.6 {
        return Ok(ConnectionModal::VisionDetected(textarea_analysis));
      }

      // Check if we still need to click Add a note
      let add_note_analysis = self.find_element_visually(VisionTask::FindAddNoteButton, None).await?;

      if add_note_analysis.element_found && add_note_analysis.confidence > 0.6 {
        return Ok(ConnectionModal::VisionDetected(add_note_analysis));
      }
    }

    Ok(ConnectionModal::None)
  }

  /// Fill note and send using vision-guided clicking.
  /// Used when DOM elements can't be found but vision can locate them.
  pub async fn fill_and_send_note_with_vision(&mut self, message: &str) -> Result<()> {
    tracing::info!("[Vision] Filling note using vision-guided interaction");

    if message.len() > 300 {
      return Err(JaniumError::msg("Message is too long. Max 300 characters."));
    }

    // Find textarea
    let textarea_analysis = self
      .find_element_visually(VisionTask::FindMessageTextarea, None)
      .await?;

    if !textarea_analysis.element_found || textarea_analysis.coordinates.is_none() {
      return Err(JaniumError::msg(format!(
        "[Vision] Could not find textarea: {}",
        textarea_analysis.guidance
      )));
    }

    // Click textarea to focus
    let (x, y) = textarea_analysis.coordinates.unwrap();
    self.click_at_coordinates(x, y).await?;
    Delay::Ms(300).await;

    // Type the message
    tracing::info!("[Vision] Typing message with human-like speed");
    let typing_duration_ms = self.human_like_keyboard_type(message).await?;
    self.thinking_pause_after_typing(typing_duration_ms).await;

    // Find Send button
    let send_analysis = self
      .find_element_visually(
        VisionTask::FindSendButton,
        Some("Just finished typing message, looking for Send button"),
      )
      .await?;

    if !send_analysis.element_found || send_analysis.coordinates.is_none() {
      return Err(JaniumError::msg(format!(
        "[Vision] Could not find Send button: {}",
        send_analysis.guidance
      )));
    }

    // Click Send button
    let (x, y) = send_analysis.coordinates.unwrap();
    tracing::info!("[Vision] Clicking Send button at ({}, {})", x, y);

    if !cfg!(test) || std::env::var("ACTUALLY_SEND").is_ok() {
      self.click_at_coordinates(x, y).await?;
    } else {
      tracing::debug!("TEST MODE: NOT clicking Send. Set ACTUALLY_SEND=1 to send for real.");
    }

    Delay::Click.await;
    Ok(())
  }

  /// Verify connection was sent using vision.
  #[expect(dead_code)]
  pub async fn verify_connection_sent_with_vision(&self) -> Result<()> {
    tracing::info!("[Vision] Verifying connection request status via vision");

    Delay::BigLoad.await;

    let analysis = self.verify_action_visually(VisionTask::VerifyInvitationSent).await?;

    if analysis.element_found {
      tracing::info!("[Vision] Verified: {}", analysis.guidance);
      return Ok(());
    }

    if let Some(error) = analysis.error_detected {
      return Err(JaniumError::msg(format!("[Vision] Error detected: {}", error)));
    }

    // No clear success or failure - check page after refresh
    tracing::warn!(
      "[Vision] Could not definitively verify. Guidance: {}",
      analysis.guidance
    );
    Ok(())
  }

  // Main connection request flow
  #[tracing::instrument(skip_all, fields(
    action_id = %request.id,
    contact_id = %request.contact_id.unwrap_or_default(),
    campaign_id = %request.campaign_id.unwrap_or_default(),
    campaign_step_id = %request.campaign_step_id.unwrap_or_default(),
  ))]
  pub async fn send_connection_request(
    &mut self,
    send_connection_request: &SendConnectionRequest,
    request: &LinkedInActionRequest,
    app_state: &AppState,
  ) -> Result<Option<LinkedInActionResponse>> {
    let start = Timestamp::now();
    tracing::info!("Starting connection request flow…");

    let request_contact_id = request
      .contact_id
      .ok_or_else(|| JaniumError::msg("No contact ID found for send connection request"))?;

    let url = send_connection_request.profile_url.as_url();
    // Navigate to public profile
    let public_url = match &send_connection_request.profile_url {
      LiProfileUrl::ProfileHandle(_) => url,

      // Convert SalesNav → Public URL using your existing automator functions
      LiProfileUrl::SalesNavigatorId(_) => {
        tracing::info!("Navigating to Sales Navigator URL…");
        let real_url = self.view_sales_nav_profile(url).await?;
        tracing::info!("Resolved real public profile URL: {}", real_url);
        let handle = real_url
          .trim_end_matches('/')
          .rsplit_once('/')
          .map(|(_, handle)| handle)
          .unwrap_or(&real_url)
          .trim_matches('/');
        let contact = app_state
          .contact_service
          .get(&request_contact_id)
          .await?
          .ok_or_else(|| {
            JaniumError::msg(format!(
              "Contact not found while trying to convert SalesNav URL to handle: {}",
              request_contact_id
            ))
          })?;
        if contact.inner.li_profile_handle.as_deref() != Some(handle) {
          let mut contact = contact.as_ref().clone();
          let prev_hash = crate::util::hash(&contact);
          contact.inner.li_profile_handle = Some(handle.to_string());
          app_state
            .contact_service
            .save(prev_hash, contact, &mut *app_state.db.acquire().await?)
            .await?;
        }
        real_url
      }
    };

    // Go to LinkedIn public profile
    tracing::info!("Navigating to public profile page: {}", public_url);
    self.view_li_profile(&public_url).await?;

    self.wait_for_public_profile_ready().await?;
    tracing::info!("Public profile loaded (after readiness check).");

    // Check profile info before scrolling - skip if already connected (1st degree)
    let profile = self.get_profile_info().await?;

    self.set_linked_in_last_active();

    if let Some(name) = profile.name {
      let contact = app_state
        .contact_service
        .get(&request_contact_id)
        .await?
        .ok_or_else(|| JaniumError::msg(format!("Contact not found: {}", request_contact_id)))?;
      if contact.inner.full_name.as_ref() != Some(&name) {
        let parsed_name = crate::ai::parse_name(name.clone(), app_state.clone()).await?;
        let mut contact = contact.as_ref().clone();
        let prev_hash = crate::util::hash(&contact);
        contact.inner.full_name = Some(name.clone());
        contact.inner.first_name = parsed_name.first_name;
        contact.inner.middle_name = parsed_name.middle_name;
        contact.inner.last_name = parsed_name.last_name;
        contact.inner.preferred_name = parsed_name.preferred_name;
        app_state
          .contact_service
          .save(prev_hash, contact, &mut *app_state.db.acquire().await?)
          .await?;
        return Ok(Some(LinkedInActionResponse {
          id: request.id,
          team_id: request.team_id,
          linkedin_id: request.linkedin_id,
          campaign_id: request.campaign_id,
          campaign_step_id: request.campaign_step_id,
          contact_id: request.contact_id,
          attempt_started: None,
          attempt_ended: start,
          next_attempt_at: Some(start),
          result: LinkedInActionRequestResult::NotStarted,
        }));
      }
    }

    let already_completed = Some(LinkedInActionResponse {
      id: request.id,
      team_id: request.team_id,
      linkedin_id: request.linkedin_id,
      campaign_id: request.campaign_id,
      campaign_step_id: request.campaign_step_id,
      contact_id: request.contact_id,
      attempt_started: Some(start),
      attempt_ended: Timestamp::now(),
      next_attempt_at: None,
      result: LinkedInActionRequestResult::AlreadyCompleted,
    });

    if profile.degree == ConnectionDegree::First {
      tracing::info!("Already connected (1st degree) - skipping connection request");
      return Ok(already_completed);
    }

    // Slow scroll for 40-60 seconds to mimic human reading behavior before taking action
    tracing::info!("Slow scrolling to mimic human profile reading…");
    self.slow_scroll_for_duration(40, 60).await?;

    // Slowly scroll back to top before looking for Connect button (10-20 seconds)
    tracing::info!("Scrolling back to top…");
    self.slow_scroll_to_top(10, 20).await?;

    // ═══════════════════════════════════════════════════════════════
    // Check connection status using hybrid approach (Option C):
    // - Checks Pending/Connect in header first
    // - Opens More dropdown once to check all statuses
    // - Returns early if already connected or pending
    // ═══════════════════════════════════════════════════════════════
    tracing::info!("Checking connection status (hybrid approach)…");

    let (connect_btn, from_dropdown) = match self.find_connect_button_with_status().await? {
      ConnectionButtonResult::ConnectButton(btn, from_dropdown) => {
        tracing::info!(
          "Connect button found {} - proceeding with connection request",
          if from_dropdown {
            "(from More dropdown)"
          } else {
            "(in header)"
          }
        );
        (btn, from_dropdown)
      }
      ConnectionButtonResult::RequestPending => {
        tracing::info!("Connection request already pending - skipping");
        return Ok(already_completed);
      }
      ConnectionButtonResult::AlreadyConnected => {
        tracing::info!("Already connected to this person - skipping");
        return Ok(already_completed);
      }
      ConnectionButtonResult::CannotConnect(reason) => {
        return Err(JaniumError::msg(format!("Cannot send connection request: {}", reason)));
      }
    };

    tracing::info!("Connect button found. Preparing to click…");

    // Ensure page + button are ready before we fire any click strategy
    // Returns true if an overlay was detected over the button
    let overlay_detected = self.wait_until_connect_button_ready(&connect_btn).await?;

    tracing::info!("Connect readiness checks passed. Clicking Connect button…");

    // USE THE ELEMENT WE ALREADY FOUND
    // If overlay was detected, skip native click and use JS click directly
    self.click_connect_button(&connect_btn, overlay_detected).await?;
    Delay::Click.await;

    // Force-close any open dropdown via JS immediately after clicking Connect
    // The SDUI "More" dropdown uses popover="manual" and floating-ui-portal, and often stays open
    tracing::info!("Force-closing any open dropdowns via JS...");
    let dropdown_closed = self
      .driver
      .execute(
        r#"
        let closed = false;

        // Close popover="manual" elements (SDUI pattern) using the Popover API
        document.querySelectorAll('[popover="manual"]').forEach(el => {
          if (el.hidePopover) {
            try { el.hidePopover(); closed = true; } catch(e) {}
          }
        });

        // Remove or hide floating-ui-portal containers (SDUI dropdown portals)
        document.querySelectorAll('[data-floating-ui-portal]').forEach(el => {
          el.style.display = 'none';
          closed = true;
        });

        // Also handle traditional artdeco dropdowns
        document.querySelectorAll('.artdeco-dropdown__content[aria-hidden="false"]').forEach(el => {
          el.setAttribute('aria-hidden', 'true');
          el.style.display = 'none';
          closed = true;
        });

        return closed;
        "#,
        vec![],
      )
      .await;

    if let Ok(result) = dropdown_closed
      && result.json().as_bool().unwrap_or(false)
    {
      tracing::info!("Successfully closed dropdown(s) via JS");
    }
    Delay::Ms(300).await;

    // Try to click "Add a note" directly first - this works even if dropdown is blocking
    // and will dismiss the dropdown automatically (SDUI variant leaves dropdown open)
    // Wait up to 5 seconds for the button to appear AND modal to finish loading
    let mut add_note_btn = None;
    for _ in 0..25 {
      // Check if modal is still loading (has loader-block elements)
      // First check modal-scoped loading, then fall back to broader check
      let modal_loading = self
        .driver
        .find(By::XPath(
          "//*[@role='dialog']//*[contains(@class,'loader-block') or contains(@class,'artdeco-loader')]",
        ))
        .await
        .is_ok()
        || self
          .driver
          .find(By::XPath(
            "//*[contains(@class,'artdeco-modal')]//*[contains(@class,'loader')]",
          ))
          .await
          .is_ok();

      if modal_loading {
        tracing::debug!("Modal still loading, waiting...");
        Delay::Ms(200).await;
        continue;
      }

      // Try existing selector first (button > span > "Add a note")
      if let Ok(btn) = self
        .driver
        .find(By::XPath(
          "//button//span[normalize-space()='Add a note']/ancestor::button",
        ))
        .await
      {
        add_note_btn = Some(btn);
        break;
      }

      // Fallback: button with direct text or different structure
      if let Ok(btn) = self
        .driver
        .find(By::XPath(
          "//button[normalize-space()='Add a note' or normalize-space(.)='Add a note']",
        ))
        .await
      {
        tracing::info!("Found 'Add a note' via fallback selector");
        add_note_btn = Some(btn);
        break;
      }

      // Fallback: aria-label selector
      if let Ok(btn) = self.driver.find(By::XPath("//button[@aria-label='Add a note']")).await {
        tracing::info!("Found 'Add a note' via aria-label selector");
        add_note_btn = Some(btn);
        break;
      }

      // JS fallback: ChromeDriver DOM might be out of sync with browser state
      // Execute JS directly in browser to check and click "Add a note"
      let js_result = self
        .driver
        .execute(
          r#"
          const modal = document.querySelector('[role="dialog"]') ||
                        document.querySelector('.artdeco-modal') ||
                        document.querySelector('.send-invite');
          if (!modal) return { found: false, clicked: false };

          const btn = modal.querySelector('button[aria-label="Add a note"]') ||
                      Array.from(modal.querySelectorAll('button')).find(b =>
                        b.textContent.trim().includes('Add a note'));
          if (btn) {
            btn.click();
            return { found: true, clicked: true };
          }
          return { found: true, clicked: false };
          "#,
          vec![],
        )
        .await;

      if let Ok(result) = js_result
        && let Some(obj) = result.json().as_object()
      {
        let found = obj.get("found").and_then(|v| v.as_bool()).unwrap_or(false);
        let clicked = obj.get("clicked").and_then(|v| v.as_bool()).unwrap_or(false);
        if clicked {
          tracing::info!("✓ JS fallback: Found modal and clicked 'Add a note' directly in browser");
          // Wait for textarea to appear before filling (3 seconds total)
          let mut textarea_appeared = false;
          for _ in 0..15 {
            if let Ok(ta) = self
              .driver
              .find(By::XPath(
                "//*[contains(@class,'artdeco-modal') or contains(@class,'send-invite') or @role='dialog']//textarea",
              ))
              .await
              && ta.is_displayed().await.unwrap_or(false)
            {
              textarea_appeared = true;
              break;
            }
            Delay::Ms(200).await;
          }
          if textarea_appeared {
            tracing::info!("✓ Textarea appeared after JS fallback click");
            match self.fill_and_send_note(&send_connection_request.message).await {
              Ok(_) => {
                tracing::info!("✓ JS fallback path succeeded");
                let weekly_limit_hit = self.verify_connection_sent().await?;
                if weekly_limit_hit {
                  tracing::warn!("Weekly limit hit - should pause connection requests");
                }
                return Ok(None);
              }
              Err(e) => {
                tracing::warn!("JS fallback: fill_and_send_note failed: {:?}", e);
              }
            }
          } else {
            tracing::warn!("JS fallback: Textarea did not appear after clicking 'Add a note'");
          }
        } else if found {
          tracing::warn!("[JS fallback] Modal found but 'Add a note' button not found");
        }
      }

      Delay::Ms(200).await;
    }

    // Shadow DOM fallback: LinkedIn may render modal inside shadow DOM (interop-shadowdom)
    // Only try this if we haven't found the button yet
    if add_note_btn.is_none() {
      tracing::info!("Trying shadow DOM fallback for 'Add a note' button...");
      let shadow_result = self
        .driver
        .execute(
          r#"
          const shadowHost = document.querySelector('#interop-outlet[data-testid="interop-shadowdom"]') ||
                             document.querySelector('[data-testid="interop-shadowdom"]');
          if (!shadowHost || !shadowHost.shadowRoot) {
            return { found: false, clicked: false, reason: 'no shadow host' };
          }

          const modal = shadowHost.shadowRoot.querySelector('[role="dialog"]') ||
                        shadowHost.shadowRoot.querySelector('.artdeco-modal') ||
                        shadowHost.shadowRoot.querySelector('.send-invite') ||
                        shadowHost.shadowRoot.querySelector('#artdeco-modal-outlet [role="dialog"]');
          if (!modal) {
            return { found: false, clicked: false, reason: 'no modal in shadow DOM' };
          }

          const btn = modal.querySelector('button[aria-label="Add a note"]') ||
                      Array.from(modal.querySelectorAll('button')).find(b =>
                        b.textContent.trim().includes('Add a note'));
          if (btn) {
            btn.click();
            return { found: true, clicked: true, reason: 'shadow DOM' };
          }
          return { found: true, clicked: false, reason: 'modal found but no Add a note button' };
          "#,
          vec![],
        )
        .await;

      if let Ok(result) = shadow_result
        && let Some(obj) = result.json().as_object()
      {
        let clicked = obj.get("clicked").and_then(|v| v.as_bool()).unwrap_or(false);
        let reason = obj.get("reason").and_then(|v| v.as_str()).unwrap_or("unknown");
        if clicked {
          tracing::info!("✓ Shadow DOM fallback: clicked 'Add a note' (reason: {})", reason);
          // Wait for textarea to appear
          let mut textarea_appeared = false;
          for _ in 0..15 {
            // Also check shadow DOM for textarea
            let ta_result = self
              .driver
              .execute(
                r#"
                const shadowHost = document.querySelector('[data-testid="interop-shadowdom"]');
                if (shadowHost && shadowHost.shadowRoot) {
                  const ta = shadowHost.shadowRoot.querySelector('textarea');
                  if (ta && ta.offsetParent !== null) return true;
                }
                const ta = document.querySelector('[role="dialog"] textarea, .artdeco-modal textarea');
                return ta && ta.offsetParent !== null;
                "#,
                vec![],
              )
              .await;
            if let Ok(r) = ta_result
              && r.json().as_bool().unwrap_or(false)
            {
              textarea_appeared = true;
              break;
            }
            Delay::Ms(200).await;
          }
          if textarea_appeared {
            tracing::info!("✓ Textarea appeared after shadow DOM fallback click");
            match self.fill_and_send_note(&send_connection_request.message).await {
              Ok(_) => {
                tracing::info!("✓ Shadow DOM fallback path succeeded");
                let weekly_limit_hit = self.verify_connection_sent().await?;
                if weekly_limit_hit {
                  tracing::warn!("Weekly limit hit - should pause connection requests");
                }
                return Ok(None);
              }
              Err(e) => {
                tracing::warn!("Shadow DOM fallback: fill_and_send_note failed: {:?}", e);
              }
            }
          } else {
            tracing::warn!("Shadow DOM fallback: Textarea did not appear after clicking 'Add a note'");
          }
        } else {
          tracing::info!("Shadow DOM fallback: {}", reason);
        }
      }
    }

    // Diagnostic: if we didn't find "Add a note", check if modal exists at all
    if add_note_btn.is_none() {
      let modal_exists = self
        .driver
        .find(By::XPath(
          "//*[contains(@class,'artdeco-modal') or contains(@class,'send-invite') or @role='dialog']",
        ))
        .await
        .is_ok();
      tracing::warn!(
        "[Diagnostic] 'Add a note' not found after 5s. Modal exists: {}",
        modal_exists
      );
    }

    let mut primary_path_succeeded = false;
    let add_note_was_found = add_note_btn.is_some();

    if let Some(btn) = add_note_btn {
      tracing::info!("Found 'Add a note' button directly - clicking to proceed");

      // Retry click a few times in case of transient "element not interactable" errors
      for attempt in 1..=3 {
        match btn.click().await {
          Ok(_) => {
            tracing::info!("Native click succeeded, waiting for textarea to appear...");
            // Wait for textarea to appear (3 seconds total)
            let mut textarea_appeared = false;
            for _ in 0..15 {
              if let Ok(ta) = self
                .driver
                .find(By::XPath(
                  "//*[contains(@class,'artdeco-modal') or contains(@class,'send-invite') or @role='dialog']//textarea",
                ))
                .await
                && ta.is_displayed().await.unwrap_or(false)
              {
                textarea_appeared = true;
                break;
              }
              Delay::Ms(200).await;
            }
            if textarea_appeared {
              tracing::info!("✓ Textarea appeared after native click");
              self.fill_and_send_note(&send_connection_request.message).await?;
              primary_path_succeeded = true;
              break;
            } else {
              tracing::warn!("Textarea did not appear after native click attempt {}", attempt);
            }
          }
          Err(e) => {
            tracing::warn!("Add a note click attempt {} failed: {:?}", attempt, e);
            Delay::Ms(300).await;
          }
        }
      }
      // If native clicks failed, try clicking inside modal to dismiss any blocking dropdown
      if !primary_path_succeeded {
        tracing::warn!("Native clicks failed or textarea didn't appear - trying JS click");
        // Click on the modal container (not a button) to trigger click-outside on dropdown
        let _ = self
          .driver
          .execute(
            r#"
            const modal = document.querySelector('[role="dialog"]') ||
                          document.querySelector('.artdeco-modal') ||
                          document.querySelector('.send-invite');
            if (modal) modal.click();
            "#,
            vec![],
          )
          .await;
        Delay::Ms(200).await;

        // Now try JS click on "Add a note" (modal should be unobstructed)
        tracing::info!("Trying JS click on 'Add a note' after dismissing dropdown");
        if self
          .driver
          .execute("arguments[0].click();", vec![btn.to_json()?])
          .await
          .is_ok()
        {
          tracing::info!("✓ JS click on 'Add a note' executed");
          // Wait for textarea to appear (3 seconds total)
          let mut textarea_appeared = false;
          for _ in 0..15 {
            if let Ok(ta) = self
              .driver
              .find(By::XPath(
                "//*[contains(@class,'artdeco-modal') or contains(@class,'send-invite') or @role='dialog']//textarea",
              ))
              .await
              && ta.is_displayed().await.unwrap_or(false)
            {
              textarea_appeared = true;
              break;
            }
            Delay::Ms(200).await;
          }
          if textarea_appeared {
            tracing::info!("✓ Textarea appeared after JS click");
            match self.fill_and_send_note(&send_connection_request.message).await {
              Ok(_) => primary_path_succeeded = true,
              Err(e) => tracing::warn!("fill_and_send_note failed after JS click: {:?}", e),
            }
          } else {
            tracing::warn!("Textarea did not appear after JS click");
          }
        } else {
          tracing::warn!("JS click also failed - falling back to modal detection");
        }
      }
    }

    // Fallback path: "Add a note" not found or click failed
    if !primary_path_succeeded {
      // "Add a note" not found or click failed - try Escape then modal detection
      tracing::warn!(
        "[Diagnostic] Primary path failed. 'Add a note' found: {}, from_dropdown: {}",
        add_note_was_found,
        from_dropdown
      );

      // Only check for dropdown if Connect was clicked from the More dropdown
      // If Connect was in the header, there's no dropdown to dismiss
      if from_dropdown {
        tracing::info!("Connect was from dropdown - checking if dropdown is still open");

        // Check for both traditional (artdeco-dropdown) and SDUI (popover="manual" with role="menu") variants
        let dropdown_open = self
          .driver
          .find(By::XPath(
            "//div[contains(@class,'artdeco-dropdown__content') and @aria-hidden='false'] | //div[@popover='manual']//div[@role='menu']",
          ))
          .await
          .is_ok();

        if dropdown_open {
          // Don't use Escape - it closes BOTH dropdown AND modal!
          // Instead, click inside the modal to trigger click-outside on the dropdown
          tracing::info!("Dropdown still open - clicking modal to dismiss dropdown (not Escape)");
          let _ = self
            .driver
            .execute(
              r#"
              const modal = document.querySelector('[role="dialog"]') ||
                            document.querySelector('.artdeco-modal') ||
                            document.querySelector('.send-invite');
              if (modal) {
                // Click on the modal header area (safe, won't trigger buttons)
                const header = modal.querySelector('.artdeco-modal__header');
                if (header) {
                  header.click();
                } else {
                  modal.click();
                }
              }
              "#,
              vec![],
            )
            .await;
          Delay::Ms(200).await;
        }
      } else {
        tracing::info!("Connect was from header - no dropdown to dismiss");
      }

      // Now wait for modal to appear
      let modal = self.wait_for_connection_modal().await?;

      // In test mode, pause to allow manual inspection of the modal
      if cfg!(test) {
        tracing::info!("TEST MODE: Modal detected - pausing 30s for inspection. View at xpra port.");
        Delay::Ms(30_000).await;
      }

      match modal {
        ConnectionModal::TextareaVisible(_textarea) => {
          // Textarea element passed but fill_and_send_note finds it fresh for reliability
          self.fill_and_send_note(&send_connection_request.message).await?;
        }
        ConnectionModal::AddNoteButtonVisible(passed_btn) => {
          tracing::info!("Modal detected but textarea not visible yet — clicking Add a note.");
          // Try the passed element first, fall back to re-finding if it fails
          let add_note = if passed_btn.is_displayed().await.unwrap_or(false) {
            tracing::info!("Using passed 'Add a note' button element");
            passed_btn
          } else if let Ok(btn) = self
            .driver
            .find(By::XPath(
              "//button//span[normalize-space()='Add a note']/ancestor::button",
            ))
            .await
          {
            tracing::info!("Passed element stale, found 'Add a note' via primary selector");
            btn
          } else if let Ok(btn) = self.driver.find(By::XPath("//button[@aria-label='Add a note']")).await {
            tracing::info!("Found 'Add a note' via aria-label fallback");
            btn
          } else if let Ok(btn) = self
            .driver
            .find(By::XPath(
              "//button[normalize-space()='Add a note' or normalize-space(.)='Add a note']",
            ))
            .await
          {
            tracing::info!("Found 'Add a note' via text fallback");
            btn
          } else {
            return Err(JaniumError::msg(
              "Could not find 'Add a note' button in AddNoteButtonVisible fallback",
            ));
          };

          // Use JS click with retry - native clicks can fail if messaging overlays are present
          let mut clicked = false;
          for attempt in 1..=3 {
            // Try native click first
            if add_note.click().await.is_ok() {
              clicked = true;
              break;
            }
            tracing::warn!("Add a note click attempt {} failed, trying JS click", attempt);
            // Fall back to JS click
            if self
              .driver
              .execute("arguments[0].click();", vec![add_note.to_json()?])
              .await
              .is_ok()
            {
              clicked = true;
              break;
            }
            Delay::Ms(200).await;
          }
          if !clicked {
            return Err(JaniumError::msg("Failed to click 'Add a note' button after retries"));
          }

          // Wait for textarea to appear (3 seconds total)
          let mut textarea_appeared = false;
          for _ in 0..15 {
            if let Ok(ta) = self
              .driver
              .find(By::XPath(
                "//*[contains(@class,'artdeco-modal') or contains(@class,'send-invite') or @role='dialog']//textarea",
              ))
              .await
              && ta.is_displayed().await.unwrap_or(false)
            {
              textarea_appeared = true;
              break;
            }

            Delay::Ms(200).await;
          }
          if !textarea_appeared {
            return Err(JaniumError::msg("Textarea did not appear after clicking 'Add a note'"));
          }
          tracing::info!("✓ Textarea appeared after clicking Add a note in fallback path");

          // Now fill the note and send - reuse fill_and_send_note for consistency
          self.fill_and_send_note(&send_connection_request.message).await?;
        }
        ConnectionModal::EmailVerification => {
          // LinkedIn requires email verification for this connection
          // This happens when the person is outside the user's network
          tracing::info!("Email verification required for this connection - returning status");
          return Ok(Some(LinkedInActionResponse {
            id: request.id,
            team_id: request.team_id,
            linkedin_id: request.linkedin_id,
            campaign_id: request.campaign_id,
            campaign_step_id: request.campaign_step_id,
            contact_id: request.contact_id,
            attempt_started: Some(start),
            attempt_ended: Timestamp::now(),
            next_attempt_at: None,
            result: LinkedInActionRequestResult::EmailVerificationRequired,
          }));
        }
        ConnectionModal::VisionDetected(analysis) => {
          // Modal detected via AI vision - use vision-guided interaction
          tracing::info!("[Vision] Using vision-guided modal interaction");

          // If analysis has coordinates for Add Note button, click it first
          if analysis.coordinates.is_some() {
            let next_state = self.handle_vision_modal(&analysis).await?;

            // If we now have a textarea, fill and send
            if let ConnectionModal::VisionDetected(textarea_analysis) = next_state
              && textarea_analysis.coordinates.is_some()
            {
              self
                .fill_and_send_note_with_vision(&send_connection_request.message)
                .await?;
            }
          } else {
            // No coordinates - try to fill and send directly
            self
              .fill_and_send_note_with_vision(&send_connection_request.message)
              .await?;
          }
        }
        ConnectionModal::None => {
          // No modal appeared via DOM - try vision fallback before giving up
          tracing::warn!("No modal detected via DOM after clicking Connect button - trying vision fallback");

          let vision_modal = self.wait_for_connection_modal_with_vision().await?;

          match vision_modal {
            ConnectionModal::VisionDetected(analysis) => {
              tracing::info!("[Vision] Modal found via vision fallback");

              // Handle the vision-detected modal
              if analysis.coordinates.is_some() {
                let next_state = self.handle_vision_modal(&analysis).await?;

                if let ConnectionModal::VisionDetected(textarea_analysis) = next_state
                  && textarea_analysis.coordinates.is_some()
                {
                  self
                    .fill_and_send_note_with_vision(&send_connection_request.message)
                    .await?;
                }
              } else {
                self
                  .fill_and_send_note_with_vision(&send_connection_request.message)
                  .await?;
              }
            }
            ConnectionModal::EmailVerification => {
              tracing::info!("[Vision] Email verification detected via vision");
              return Ok(Some(LinkedInActionResponse {
                id: request.id,
                team_id: request.team_id,
                linkedin_id: request.linkedin_id,
                campaign_id: request.campaign_id,
                campaign_step_id: request.campaign_step_id,
                contact_id: request.contact_id,
                attempt_started: Some(start),
                attempt_ended: Timestamp::now(),
                next_attempt_at: None,
                result: LinkedInActionRequestResult::EmailVerificationRequired,
              }));
            }
            _ => {
              // Vision fallback also failed
              return Err(JaniumError::msg(
                "No modal detected after clicking Connect button (DOM and vision fallback both failed)",
              ));
            }
          }
        }
      }
    }

    let weekly_limit_hit = self.verify_connection_sent().await?;
    if weekly_limit_hit {
      tracing::warn!("Weekly limit hit - should pause connection requests");
    }

    Delay::Ms(30000).await;

    Ok(None)
  }

  // Fill the "Add a note" textarea and click Send
  pub async fn fill_and_send_note(&mut self, message: &str) -> Result<()> {
    tracing::info!("Filling note…");

    if message.len() > 300 {
      return Err(JaniumError::msg("Message is too long. Max 300 characters."));
    }

    // Try multiple selectors - LinkedIn changes these periodically
    let textarea_result = if let Ok(ta) = self
      .driver
      .find(By::XPath("//textarea[contains(@id,'custom-message')]"))
      .await
    {
      Ok(ta)
    } else if let Ok(ta) = self.driver.find(By::XPath("//*[@role='dialog']//textarea")).await {
      tracing::info!("Found textarea via role='dialog' fallback");
      Ok(ta)
    } else {
      // Last resort - any textarea in a modal
      tracing::info!("Trying artdeco-modal/send-invite textarea fallback");
      self
        .driver
        .find(By::XPath(
          "//*[contains(@class,'artdeco-modal') or contains(@class,'send-invite')]//textarea",
        ))
        .await
    };

    // Shadow DOM fallback: If XPath couldn't find textarea, try piercing shadow DOM
    // This handles the case where LinkedIn renders the modal inside interop-shadowdom
    let textarea = match textarea_result {
      Ok(ta) => ta,
      Err(_) => {
        tracing::info!("XPath failed to find textarea - trying shadow DOM fallback...");

        use serde_json::json;

        // FIRST: Try human-like typing approach for shadow DOM
        // Focus textarea via JS, type with WebDriver, click Send via JS
        tracing::info!("Attempting human-like typing for shadow DOM...");
        let focus_result = self
          .driver
          .execute(
            r#"
            // Find shadow host
            const shadowHost = document.querySelector('#interop-outlet[data-testid="interop-shadowdom"]') ||
                               document.querySelector('[data-testid="interop-shadowdom"]');
            if (!shadowHost || !shadowHost.shadowRoot) {
              return { success: false, reason: 'no shadow host' };
            }

            // Find textarea in shadow DOM
            const textarea = shadowHost.shadowRoot.querySelector('textarea#custom-message') ||
                             shadowHost.shadowRoot.querySelector('textarea[name="message"]') ||
                             shadowHost.shadowRoot.querySelector('.send-invite textarea') ||
                             shadowHost.shadowRoot.querySelector('[role="dialog"] textarea');
            if (!textarea) {
              return { success: false, reason: 'no textarea in shadow DOM' };
            }

            // Focus the textarea
            textarea.focus();
            textarea.click();

            // Verify focus
            const activeEl = shadowHost.shadowRoot.activeElement || document.activeElement;
            const hasFocus = activeEl === textarea || shadowHost.shadowRoot.contains(document.activeElement);

            return { success: true, hasFocus: hasFocus, reason: 'textarea focused' };
            "#,
            vec![],
          )
          .await;

        let mut human_typing_succeeded = false;

        if let Ok(result) = &focus_result
          && let Some(obj) = result.json().as_object()
          && obj.get("success").and_then(|v| v.as_bool()).unwrap_or(false)
        {
          tracing::info!("Shadow DOM textarea focused, attempting human-like typing...");

          // Small delay to ensure focus is stable
          Delay::Ms(200).await;

          // Type with human-like behavior (keyboard input goes to focused element)
          match self.human_like_keyboard_type(message).await {
            Ok(typing_duration_ms) => {
              tracing::info!("Human-like typing completed in shadow DOM");

              // Thinking pause after typing
              self.thinking_pause_after_typing(typing_duration_ms).await;

              // Verify the message was typed correctly
              let verify_result = self
                .driver
                .execute(
                  r#"
                  const message = arguments[0];
                  const shadowHost = document.querySelector('[data-testid="interop-shadowdom"]');
                  if (!shadowHost || !shadowHost.shadowRoot) return { match: false, value: '' };

                  const textarea = shadowHost.shadowRoot.querySelector('textarea#custom-message') ||
                                   shadowHost.shadowRoot.querySelector('textarea[name="message"]') ||
                                   shadowHost.shadowRoot.querySelector('[role="dialog"] textarea');
                  if (!textarea) return { match: false, value: '' };

                  return { match: textarea.value === message, value: textarea.value };
                  "#,
                  vec![json!(message)],
                )
                .await;

              let message_matches = verify_result
                .as_ref()
                .ok()
                .and_then(|r| r.json().as_object())
                .and_then(|obj| obj.get("match").and_then(|v| v.as_bool()))
                .unwrap_or(false);

              if message_matches {
                // Click Send button via JS
                let send_result = self
                  .driver
                  .execute(
                    r#"
                    const shadowHost = document.querySelector('[data-testid="interop-shadowdom"]');
                    if (!shadowHost || !shadowHost.shadowRoot) {
                      return { success: false, reason: 'no shadow host for send' };
                    }

                    const modal = shadowHost.shadowRoot.querySelector('[role="dialog"]') ||
                                  shadowHost.shadowRoot.querySelector('.artdeco-modal');
                    if (!modal) {
                      return { success: false, reason: 'no modal for Send button' };
                    }

                    const sendBtn = modal.querySelector('button[aria-label="Send invitation"]') ||
                                    modal.querySelector('button[aria-label*="Send"]') ||
                                    Array.from(modal.querySelectorAll('button')).find(b =>
                                      b.textContent.trim() === 'Send' ||
                                      b.querySelector('span')?.textContent.trim() === 'Send');
                    if (!sendBtn) {
                      return { success: false, reason: 'no Send button' };
                    }

                    if (sendBtn.disabled) {
                      return { success: false, reason: 'Send button disabled' };
                    }

                    sendBtn.click();
                    return { success: true, reason: 'human-like typing path completed' };
                    "#,
                    vec![],
                  )
                  .await;

                if let Ok(result) = send_result
                  && let Some(obj) = result.json().as_object()
                  && obj.get("success").and_then(|v| v.as_bool()).unwrap_or(false)
                {
                  tracing::info!("✓ Shadow DOM human-like typing path succeeded");
                  human_typing_succeeded = true;
                } else {
                  tracing::warn!("Shadow DOM: Send button click failed, falling back to instant JS");
                }
              } else {
                let typed_value = verify_result
                  .ok()
                  .and_then(|r| r.json().as_object().cloned())
                  .and_then(|obj| obj.get("value").and_then(|v| v.as_str().map(String::from)))
                  .unwrap_or_default();
                tracing::warn!(
                  "Shadow DOM: Message mismatch after typing (got '{}'), falling back to instant JS",
                  typed_value.chars().take(50).collect::<String>()
                );
              }
            }
            Err(e) => {
              tracing::warn!(
                "Shadow DOM human-like typing failed: {:?}, falling back to instant JS",
                e
              );
            }
          }
        } else {
          tracing::info!("Shadow DOM textarea focus failed, falling back to instant JS");
        }

        // If human-like typing succeeded, we're done
        if human_typing_succeeded {
          return Ok(());
        }

        // FALLBACK: Instant JS fill (existing behavior)
        tracing::info!("Using instant JS fill fallback for shadow DOM...");
        let shadow_result = self
          .driver
          .execute(
            r#"
            const message = arguments[0];

            // Find shadow host
            const shadowHost = document.querySelector('#interop-outlet[data-testid="interop-shadowdom"]') ||
                               document.querySelector('[data-testid="interop-shadowdom"]');
            if (!shadowHost || !shadowHost.shadowRoot) {
              return { success: false, reason: 'no shadow host' };
            }

            // Find textarea in shadow DOM
            const textarea = shadowHost.shadowRoot.querySelector('textarea#custom-message') ||
                             shadowHost.shadowRoot.querySelector('textarea[name="message"]') ||
                             shadowHost.shadowRoot.querySelector('.send-invite textarea') ||
                             shadowHost.shadowRoot.querySelector('[role="dialog"] textarea');
            if (!textarea) {
              return { success: false, reason: 'no textarea in shadow DOM' };
            }

            // Focus and fill the textarea
            textarea.focus();
            textarea.value = message;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));

            // Verify the value was set
            if (textarea.value !== message) {
              return { success: false, reason: 'textarea value not set correctly' };
            }

            // Find and click Send button
            const modal = shadowHost.shadowRoot.querySelector('[role="dialog"]') ||
                          shadowHost.shadowRoot.querySelector('.artdeco-modal');
            if (!modal) {
              return { success: false, reason: 'no modal for Send button' };
            }

            const sendBtn = modal.querySelector('button[aria-label="Send invitation"]') ||
                            modal.querySelector('button[aria-label*="Send"]') ||
                            Array.from(modal.querySelectorAll('button')).find(b =>
                              b.textContent.trim() === 'Send' ||
                              b.querySelector('span')?.textContent.trim() === 'Send');
            if (!sendBtn) {
              return { success: false, reason: 'no Send button in shadow DOM' };
            }

            // Check if button is disabled
            if (sendBtn.disabled) {
              return { success: false, reason: 'Send button is disabled' };
            }

            sendBtn.click();
            return { success: true, reason: 'shadow DOM instant fill completed' };
            "#,
            vec![json!(message)],
          )
          .await;

        if let Ok(result) = shadow_result
          && let Some(obj) = result.json().as_object()
        {
          let success = obj.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
          let reason = obj.get("reason").and_then(|v| v.as_str()).unwrap_or("unknown");

          if success {
            tracing::info!("✓ Shadow DOM instant fill fallback completed");
            return Ok(());
          } else {
            tracing::warn!("Shadow DOM instant fill fallback failed: {}", reason);
          }
        }

        // If shadow DOM fallback also failed, return error
        return Err(JaniumError::msg(
          "Could not find textarea (XPath and shadow DOM fallbacks both failed)",
        ));
      }
    };

    self.mouse_to_click(&textarea).await?;
    // Focus the textarea first
    textarea.focus().await?;
    Delay::Ms(300).await;

    // Verify textarea has focus, retry if not
    self
      .driver
      .execute(
        "if (document.activeElement !== arguments[0]) { arguments[0].focus(); arguments[0].click(); }",
        vec![textarea.to_json()?],
      )
      .await
      .ok();

    // Type message character-by-character with human-like timing (~50 WPM)
    tracing::info!("Typing message with human-like speed (~50 WPM)…");
    let typing_duration_ms = self.human_like_keyboard_type(message).await?;

    // Thinking pause after typing (40-60% of typing time) - simulates reading/reviewing
    self.thinking_pause_after_typing(typing_duration_ms).await;

    // Verify input succeeded - use prop("value") for textarea, not text()
    let get_textarea_value = async || textarea.prop("value").await.ok().flatten().unwrap_or_default();
    let value = get_textarea_value().await;

    if value != message {
      tracing::info!(
        value,
        expected = message,
        "Textarea did not receive full message. Retrying with send_control_tokens fallback…"
      );
      textarea.click().await?;
      Delay::Ms(200).await;
      textarea.clear().await?;
      Delay::Keyboard.await;
      textarea.focus().await?;
      self
        .container_service_client
        .send_control_tokens(vec![container_service::ControlToken::Enigo(enigo::agent::Token::Text(
          message.to_string(),
        ))])
        .await?;
      Delay::BigLoad.await;
    }

    let value = get_textarea_value().await;

    if value != message {
      tracing::info!(
        value,
        expected = message,
        "Textarea did not receive full message. Retrying with send_keys fallback…"
      );
      self.release_all_modifier_keys().await?;

      self.driver.execute("document.body.click();", vec![]).await.ok();
      Delay::Ms(300).await;

      textarea.click().await?;
      Delay::Ms(200).await;
      textarea.clear().await?;
      Delay::Keyboard.await;

      textarea.send_keys(message).await?;
      Delay::Keyboard.await;
    }

    let value = get_textarea_value().await;

    if value != message {
      tracing::info!(
        value,
        expected = message,
        "Textarea value after retry does not match. Retrying with driver.execute JavaScript fallback…"
      );

      // 4th fallback: Use driver.execute to set value directly via JavaScript

      use serde_json::json;
      self
        .driver
        .execute(
          r#"
            const textarea = arguments[0];
            const message = arguments[1];
            textarea.value = message;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
          "#,
          vec![textarea.to_json()?, json!(message)],
        )
        .await?;

      Delay::BigLoad.await;

      let value = get_textarea_value().await;
      if value != message {
        tracing::warn!(
          value,
          expected = message,
          "Textarea value after driver.execute retry does not match. Failing."
        );
        return Err(JaniumError::msg("Textarea did not receive full message"));
      }
    }

    tracing::info!("Clicking Send…");

    let send_btn = if let Ok(btn) = self.driver.find(By::XPath("//button//span[text()='Send']")).await {
      btn
    } else if let Ok(btn) = self
      .driver
      .find(By::XPath("//button[@aria-label='Send invitation']"))
      .await
    {
      tracing::info!("Found Send via aria-label='Send invitation' fallback");
      btn
    } else if let Ok(btn) = self
      .driver
      .find(By::XPath("//button[contains(@aria-label,'Send')]"))
      .await
    {
      tracing::info!("Found Send via contains aria-label fallback");
      btn
    } else if let Ok(btn) = self
      .driver
      .find(By::XPath(
        "//button[contains(@class,'artdeco-button--primary')]//span[contains(text(),'Send')]",
      ))
      .await
    {
      tracing::info!("Found Send via primary button fallback");
      btn
    } else {
      return Err(JaniumError::msg("Could not find Send button"));
    };
    if !cfg!(test) || std::env::var("ACTUALLY_SEND").is_ok() {
      send_btn.click().await?;
    } else {
      tracing::debug!("TEST MODE: NOT clicking Send. Set ACTUALLY_SEND=1 to send for real.");
    }
    Delay::Click.await;

    Ok(())
  }

  // Click "Send without a note" if "Add a note" is not available
  #[expect(dead_code)]
  pub async fn click_send_without_note(&self) -> Result<()> {
    tracing::info!("Clicking 'Send without a note'…");

    let btn = if let Ok(b) = self
      .driver
      .find(By::XPath("//button//span[contains(text(),'Send')]"))
      .await
    {
      b
    } else if let Ok(b) = self
      .driver
      .find(By::XPath("//button[@aria-label='Send without a note']"))
      .await
    {
      tracing::info!("Found 'Send without a note' via aria-label fallback");
      b
    } else if let Ok(b) = self
      .driver
      .find(By::XPath("//button[contains(@class,'artdeco-button--primary')]"))
      .await
    {
      tracing::info!("Found Send via primary button fallback");
      b
    } else {
      return Err(JaniumError::msg("Could not find 'Send without a note' button"));
    };

    // Ensure clickable
    if !btn.is_displayed().await.unwrap_or(false) {
      tracing::warn!("Send button not displayed.");
    }

    if !cfg!(test) {
      btn.click().await?;
    } else {
      tracing::debug!("TEST MODE: NOT clicking Send without a note.");
    }
    Delay::Click.await;

    Ok(())
  }

  // Handle the Follow modal (2nd/3rd degree profiles) or close it
  #[expect(dead_code)]
  pub async fn click_follow_or_close(&self) -> Result<()> {
    tracing::info!("Handling Follow modal…");

    if let Ok(follow_btn) = self.driver.find(By::XPath("//button//span[text()='Follow']")).await {
      follow_btn.click().await?;
      Delay::Click.await;
      return Ok(());
    }

    if let Ok(close_btn) = self
      .driver
      .find(By::XPath("//button[contains(@aria-label,'dismiss')]"))
      .await
    {
      close_btn.click().await?;
      Delay::Click.await;
    }

    Ok(())
  }

  /// Checks whether the connection request was successfully submitted.
  /// Returns Ok(true) if weekly limit was hit, Ok(false) otherwise.
  ///
  /// This verification is read-only (no clicking) to avoid issues with toasts/popups
  /// covering buttons.
  pub async fn verify_connection_sent(&self) -> Result<bool> {
    tracing::info!("Verifying connection request status (read-only checks only)…");

    // Wait a few seconds before refreshing the page or doing anything
    Delay::BigLoad.await;

    // Check for weekly limit notification
    let weekly_limit_hit = self
      .driver
      .find(By::XPath("//*[contains(text(),'reached the weekly limit')]"))
      .await
      .is_ok();
    if weekly_limit_hit {
      tracing::warn!("Weekly connection request limit reached - LinkedIn may reject future requests");
    }

    // Generic "try again" message (only log if not already identified as weekly limit)
    if !weekly_limit_hit
      && self
        .driver
        .find(By::XPath("//*[contains(text(),'try again')]"))
        .await
        .is_ok()
    {
      tracing::warn!("Generic 'try again' notification detected");
    }

    // Success indicators - must specifically mention "invitation" to avoid false positives
    let success_text_selectors = [
      "//*[contains(text(),'Invitation sent')]",
      "//div[contains(@class,'artdeco-toast')]//*[contains(text(),'invitation')]",
    ];

    // Check for success text in popup/toast
    for selector in success_text_selectors {
      if self.driver.find(By::XPath(selector)).await.is_ok() {
        tracing::info!("Invite confirmed via success indicator: {}", selector);
        return Ok(weekly_limit_hit);
      }
    }

    // Refresh and check button state - this is the authoritative source for success/failure
    self.refresh().await.ok();
    Delay::BigLoad.await;

    match self.find_connect_button_with_status().await? {
      ConnectionButtonResult::ConnectButton(_, _) => {
        // Connect button still visible - request did not go through
        Err(JaniumError::msg(
          "Connect button still visible - connection request failed",
        ))
      }
      ConnectionButtonResult::RequestPending => {
        tracing::info!("Request pending - request was sent.");
        Ok(weekly_limit_hit)
      }
      ConnectionButtonResult::AlreadyConnected => {
        tracing::info!("Already connected - request was sent.");
        Ok(weekly_limit_hit)
      }
      ConnectionButtonResult::CannotConnect(reason) => Err(JaniumError::msg(format!("Cannot connect - {reason}"))),
    }
  }

  /// Wait for overlays, modals, and toasts to dismiss before interacting with buttons.
  /// If overlays persist, click outside to dismiss them.
  #[expect(dead_code)]
  async fn wait_for_overlays_to_dismiss(&self) {
    let overlay_selectors = [
      // Toast notifications
      "//div[contains(@class,'artdeco-toast') and not(contains(@class,'artdeco-toast--hidden'))]",
      // Modal overlays
      "//div[contains(@class,'artdeco-modal-overlay') and contains(@class,'artdeco-modal-overlay--visible')]",
      // Connection request modal
      "//div[@role='dialog' and contains(@class,'send-invite')]",
    ];

    // First, wait up to 5 seconds for overlays to auto-dismiss
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut found_overlay = true;

    while found_overlay && Instant::now() < deadline {
      found_overlay = false;
      for selector in overlay_selectors {
        if self.driver.find(By::XPath(selector)).await.is_ok() {
          found_overlay = true;
          tracing::debug!("Overlay still visible: {}", selector);
          break;
        }
      }
      if found_overlay {
        Delay::Ms(500).await;
      }
    }

    // If overlays still present, try clicking outside to dismiss them
    if found_overlay {
      tracing::info!("Overlays still present after timeout - clicking outside to dismiss");
      let _ = self.driver.execute("document.body.click();", vec![]).await;
      Delay::Ms(500).await;

      // Check one more time and log warning if still present
      for selector in overlay_selectors {
        if self.driver.find(By::XPath(selector)).await.is_ok() {
          tracing::warn!("Overlay still visible after click dismiss attempt: {}", selector);
        }
      }
    } else {
      tracing::info!("Overlays dismissed.");
    }
  }
}

#[test]
#[ignore = "requires dev server DB (JANIUM_DEV_TESTS=1)"]
fn test_send_connection_request() {
  use crate::prelude::*;
  use ormlite::Model;
  crate::test::app_state_test_with_db(300, async |app_state| {
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

    // Sales Navigator profile - has visible Connect button
    let sales_nav_profile_url = "ACwAABUEAlEBN4zgwNKf7Bo7zeKJMaH28gHWdHo";

    handle
      .send(async move |actor: &mut LinkedIn, _router: &Router, state: &mut LinkedInState| {
          let sender = state.start_automated_runner(actor).await?;
          sender
            .send(crate::automator::runner::AutomatorRunnerMessage::Automate(
              LinkedInActionRequest::new(
                LinkedInAction::SendConnectionRequest(SendConnectionRequest {
                  profile_url: LiProfileUrl::SalesNavigatorId(sales_nav_profile_url.to_string()),
                  message: "Hello,\n\nI'd love to connect with you. I'm interested in learning more about your work and seeing if we might be able to collaborate.\n\nThanks.".to_string(),
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
