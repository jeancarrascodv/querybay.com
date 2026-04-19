use thirtyfour::{By, Key};

use crate::automator::{Automator, utils::Delay};
use crate::prelude::*;

pub enum SendMessageOutcome {
  Sent,
  ContactResponded,
}

impl Automator {
  /// Send a message via the LinkedIn inbox.
  ///
  /// Attempts to look up an existing conversation and navigate directly to it.
  /// Falls back to searching by name if no conversation is found or lookup fails.
  ///
  /// When `skip_response_check` is false (campaign-automated messages), aborts if
  /// the contact has already responded to our last message.
  pub async fn send_li_message_via_inbox(
    &mut self,
    contact_id: Id<Contact>,
    linkedin_id: Id<LinkedIn>,
    contact_name: &str,
    message_content: &str,
    skip_response_check: bool,
  ) -> Result<SendMessageOutcome> {
    // Try to find existing conversation for this contact
    let conversation_id = self
      .lookup_conversation_id_for_contact(contact_id, linkedin_id)
      .await
      .inspect_err(|e| tracing::warn!(?e, "Failed to look up conversation ID"))
      .ok()
      .flatten();

    // Navigate to conversation - either directly or via search
    if let Some(ref conv_id) = conversation_id {
      tracing::info!("Found existing conversation {}, navigating directly", conv_id);
      self.navigate_to_conversation_and_verify(conv_id).await?;
    } else {
      tracing::info!("No existing conversation found, searching by name: {}", contact_name);
      self
        .search_and_open_conversation(contact_name, conversation_id.as_deref())
        .await?;
    }

    // Verify we're talking to the right person by checking their profile ID
    self.verify_conversation_participant(contact_id).await?;

    // Scrape and persist the conversation, then check if the contact responded
    if !skip_response_check {
      let owner_id: Id<Contact> = **self.owner_contact_id.get();
      if owner_id == Id::nil() {
        return Err(JaniumError::msg(
          "Cannot send messages: owner contact ID has not been resolved yet. Run a full inbox download first.",
        ));
      }

      let conversation_id = self.scrape_and_persist_current_conversation().await?;
      let last_sender: Option<Id<Contact>> = sqlx::query_scalar(
        "SELECT sender_contact_id FROM linkedin_messages
         WHERE conversation_id = $1
         ORDER BY timestamp DESC NULLS LAST, created_at DESC
         LIMIT 1",
      )
      .bind(conversation_id)
      .fetch_optional(&self.app_state.db)
      .await?;

      if let Some(sender_id) = last_sender
        && sender_id != owner_id
      {
        tracing::info!(
          "Contact {} has responded (last message from {}) — skipping automated message",
          contact_name,
          sender_id
        );
        return Ok(SendMessageOutcome::ContactResponded);
      }
    }

    tracing::info!("Opened conversation with {}, sending message", contact_name);
    Delay::Click.await;

    let message_content_box_elements = self
      .driver
      .find_all(By::XPath("//div[contains(@class,'msg-form__contenteditable')]"))
      .await?;

    if message_content_box_elements.is_empty() {
      return Err(JaniumError::msg(
        "Did not find the input text area to put the message content there. Maybe Linkedin changed its html?",
      ));
    }

    let message_content_box_element = &message_content_box_elements[0];
    self
      .mouse_to_click_safe_inside_bounds(message_content_box_element, 0, 0, true)
      .await?;

    let current_text = message_content_box_element.text().await?;
    if !current_text.is_empty() {
      tracing::warn!(
        messsage_content = current_text,
        "message box already has content. Clearing it"
      );

      // Clear the text area
      message_content_box_element.send_keys(Key::Control + "a").await?;
      Delay::Click.await;
      message_content_box_element.send_keys(Key::Delete).await?;
      Delay::Click.await;
    }

    tracing::info!("message content = {}", message_content);

    let cleaned_message_content = self.delete_extra_double_qoute_message_content(message_content);
    tracing::info!("cleaned message content = {}", cleaned_message_content);

    self
      .multiline_keyboard_type(&cleaned_message_content, message_content_box_element)
      .await?;
    tracing::info!("message content typed");

    Delay::Click.await;

    let send_button_element = self.get_send_button_from_message_editor().await?;
    if send_button_element.is_none() {
      return Err(JaniumError::msg(
        "Did not find Send button element. Maybe Linkedin changed its html?",
      ));
    }

    if let Some(send_button) = &send_button_element {
      send_button.click().await?;
    }

    Delay::Click.await;
    tracing::info!("message sent");

    Ok(SendMessageOutcome::Sent)
  }

  /// Look up the LinkedIn conversation ID for a contact from the database.
  /// Returns the most recent conversation if multiple exist.
  async fn lookup_conversation_id_for_contact(
    &self,
    contact_id: Id<Contact>,
    linkedin_id: Id<LinkedIn>,
  ) -> Result<Option<String>> {
    let conversation_id: Option<String> = sqlx::query_scalar(
      "SELECT linkedin_conversation_id
       FROM linkedin_conversations
       WHERE linkedin_id = $1
         AND participant_contact_ids = ARRAY[$2]::uuid[]
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT 1",
    )
    .bind(linkedin_id)
    .bind(contact_id)
    .fetch_optional(&self.app_state.db)
    .await?;

    if let Some(ref id) = conversation_id {
      tracing::info!("Found conversation {} for contact {}", id, contact_id);
    } else {
      tracing::info!("No existing conversation found for contact {}", contact_id);
    }

    Ok(conversation_id)
  }

  /// Navigate directly to a conversation by ID and verify the URL matches.
  async fn navigate_to_conversation_and_verify(&mut self, conversation_id: &str) -> Result<()> {
    let url = format!("https://www.linkedin.com/messaging/thread/{}/", conversation_id);
    tracing::info!("Navigating directly to conversation: {}", url);

    self.driver.goto(&url).await?;
    Delay::BigLoad.await;

    // Verify we landed on the correct conversation
    self.verify_conversation_url(conversation_id).await?;

    Ok(())
  }

  /// Search for a conversation by contact name and open it.
  /// If `expected_conversation_id` is provided, verifies the URL after opening.
  async fn search_and_open_conversation(
    &mut self,
    contact_name: &str,
    expected_conversation_id: Option<&str>,
  ) -> Result<()> {
    // Navigate to messaging page
    tracing::info!("Navigating to messaging page");
    self.driver.goto("https://www.linkedin.com/messaging/").await?;
    Delay::BigLoad.await;

    if !self.is_on_messaging_page().await {
      return Err(JaniumError::msg("Not on messaging page — may not be logged in"));
    }

    tracing::info!("Successfully on messaging page");
    Delay::Load.await;

    tracing::info!("Searching for conversation with {}", contact_name);

    // Find the search input at top of inbox
    let search_input = self
      .driver
      .find(By::XPath("//input[@id='search-conversations']"))
      .await?;

    // Click and type the contact name
    self.mouse_to_click(&search_input).await?;
    Delay::Click.await;

    search_input.send_keys(contact_name).await?;
    Delay::Click.await;
    search_input.send_keys(Key::Return).await?;
    Delay::Load.await;

    // Find and click on the first conversation result
    let conv_results = self
      .driver
      .find_all(By::XPath("//li[contains(@class, 'msg-conversation-listitem')]"))
      .await?;

    if conv_results.is_empty() {
      return Err(JaniumError::msg(format!("No conversation found for {}", contact_name)));
    }

    // Click on the first result
    self.mouse_to_click(&conv_results[0]).await?;
    Delay::Load.await;

    // Verify conversation if we have an expected ID
    if let Some(expected_id) = expected_conversation_id {
      self.verify_conversation_url(expected_id).await?;
    }

    Ok(())
  }

  /// Verify the current URL matches the expected conversation ID.
  async fn verify_conversation_url(&self, expected_conversation_id: &str) -> Result<()> {
    let current_url = self.driver.current_url().await?;
    let url_str = current_url.as_str();

    let expected_pattern = format!("/messaging/thread/{}", expected_conversation_id);

    if url_str.contains(&expected_pattern) {
      tracing::info!("Conversation URL verified: {}", url_str);
      Ok(())
    } else {
      tracing::error!(
        "Conversation URL mismatch. Expected pattern: {}, Got: {}",
        expected_pattern,
        url_str
      );
      Err(JaniumError::msg(format!(
        "Opened wrong conversation. Expected: {}, URL: {}",
        expected_conversation_id, url_str
      )))
    }
  }

  /// Extract the profile ID from the conversation header link.
  /// This is the ACoAA... ID from the href of the participant's profile link.
  async fn get_conversation_participant_profile_id(&self) -> Result<Option<String>> {
    // Find the profile link in the conversation header
    let link = self
      .driver
      .find(By::XPath("//a[contains(@class, 'msg-thread__link-to-profile')]"))
      .await;

    let link = match link {
      Ok(el) => el,
      Err(_) => {
        tracing::warn!("Could not find conversation header profile link");
        return Ok(None);
      }
    };

    let href = link.attr("href").await?;
    match href {
      Some(url) => {
        let profile_id = self.li_profile_url_to_handle(&url);
        if profile_id.is_empty() {
          tracing::warn!("Could not extract profile ID from href: {}", url);
          Ok(None)
        } else {
          tracing::info!("Extracted profile ID from conversation header: {}", profile_id);
          Ok(Some(profile_id))
        }
      }
      None => {
        tracing::warn!("Conversation header profile link has no href");
        Ok(None)
      }
    }
  }

  /// Look up the expected profile ID for a contact from the database.
  async fn lookup_contact_profile_id(&self, contact_id: Id<Contact>) -> Result<Option<String>> {
    let profile_id: Option<String> = sqlx::query_scalar("SELECT li_sales_nav_profile_id FROM contact WHERE id = $1")
      .bind(contact_id)
      .fetch_optional(&self.app_state.db)
      .await?
      .flatten();

    if let Some(ref id) = profile_id {
      tracing::info!("Found profile ID {} for contact {}", id, contact_id);
    } else {
      tracing::info!("No profile ID stored for contact {}", contact_id);
    }

    Ok(profile_id)
  }

  /// Verify the conversation participant matches the expected contact.
  /// Compares the profile ID from the conversation header to the contact's stored profile ID.
  async fn verify_conversation_participant(&self, contact_id: Id<Contact>) -> Result<()> {
    // Get expected profile ID from database
    let expected_profile_id = self.lookup_contact_profile_id(contact_id).await?;

    let Some(expected_id) = expected_profile_id else {
      return Err(JaniumError::msg(format!(
        "Cannot verify conversation participant: no Sales Navigator profile ID stored for contact {}",
        contact_id
      )));
    };

    // Get actual profile ID from conversation header
    let actual_profile_id = self.get_conversation_participant_profile_id().await?;

    let Some(actual_id) = actual_profile_id else {
      return Err(JaniumError::msg(
        "Cannot verify conversation participant: could not extract profile ID from conversation header",
      ));
    };

    // Compare
    if expected_id == actual_id {
      tracing::info!(
        "Participant verified: profile ID {} matches contact {}",
        actual_id,
        contact_id
      );
      Ok(())
    } else {
      tracing::error!(
        "Participant mismatch! Expected profile ID {} for contact {}, but conversation shows {}",
        expected_id,
        contact_id,
        actual_id
      );
      Err(JaniumError::msg(format!(
        "Wrong recipient: expected profile {}, got {}",
        expected_id, actual_id
      )))
    }
  }
}

#[test]
#[ignore = "requires dev server DB (JANIUM_DEV_TESTS=1)"]
fn test_send_message_via_inbox() {
  use ormlite::Model;
  crate::test::app_state_test_with_db(300, async |app_state| {
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

    // Test contact name - look up contact_id from database for verification
    let contact_name = "Justin Schow";
    let message_content = "Test message from send_message automation.";

    // Look up the contact by name to get their ID
    let contact_id: Id<Contact> =
      sqlx::query_scalar("SELECT id FROM contact WHERE full_name ILIKE '%Justin Schow%' LIMIT 1")
        .fetch_one(&app_state.db)
        .await?;
    tracing::info!("Found contact_id for {}: {:?}", contact_name, contact_id);

    // Create request outside the closure so we can capture the ID for polling
    let request = LinkedInActionRequest::new(
      LinkedInAction::SendMessage(SendMessage {
        contact_id,
        contact_name: contact_name.to_string(),
        message_content: message_content.to_string(),
        skip_response_check: true,
      }),
      elaine.team_id,
      elaine.id,
      None,
      None,
      None,
      Timestamp::now() + std::time::Duration::from_secs(60 * 60),
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
            .map_err(|_| JaniumError::msg("Error sending SendMessage to AutomatorRunner"))?;
          Ok::<_, crate::JaniumError>(())
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

    for _ in 0..10 {
      println!("---------------------------------------------------------------------");
    }

    Ok::<_, crate::JaniumError>(())
  })
  .unwrap();
}
