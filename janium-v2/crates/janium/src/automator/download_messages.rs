use super::Automator;

impl Automator {
  // pub async fn download_messages(&mut self) -> Result<Vec<NewMessage>> {
  //   if !self.is_on_feed().await {
  //     tracing::info!("is not on feed page. Navigating to it");
  //     self.nav_to_linkedin_page().await?;

  //     if !self.is_on_feed().await {
  //       return Err(JaniumError::msg("Couldn't navigate to feed page"));
  //     }
  //   }

  //   let in_unix_epoch = SystemTime::now()
  //     .duration_since(SystemTime::UNIX_EPOCH)
  //     .map_err(|e| JaniumError::msg(format!("Failed to get current time: {e}")))?
  //     .as_secs()
  //     .to_string();

  //   let count = 1;

  //   let account_profile_name = self.get_account_profile_name().await;
  //   if let Err(e) = account_profile_name {
  //     return Err(JaniumError::msg("Account profile name not found"));
  //   }

  //   self.close_all_opened_conversations().await?;
  //   Delay::Load.await;

  //   self.nav_messages().await;
  //   Delay::BigLoad.await;

  //   tracing::info!("starting download_unread_messages_from_messaging_tab");

  //   let output = self
  //     .download_unread_messages_from_messaging_tab(&in_unix_epoch, count, &account_profile_name.unwrap(), 0)
  //     .await?;

  //   tracing::info!("finished download_unread_messages_from_messaging_tab");

  //   self.nav_feed().await?;

  //   Ok(output)
  // }

  // pub async fn download_unread_messages_from_messaging_tab(
  //   &mut self,
  //   in_unix_epoch: &str,
  //   count: i32,
  //   account_profile_name: &str,
  //   execution_number: i32,
  // ) -> Result<Vec<NewMessage>> {
  //   let mut count = count;
  //   let mut new_messages_found = vec![];

  //   tracing::info!("getting all box messages with blue badge count in it");

  //   let mut processed_messages_count = 0;
  //   let mut already_processed_contact_names = Vec::new();
  //   let mut number_of_non_new_messages_in_a_row = 0;

  //   tracing::info!("processing first unread message");

  //   let contact_header_name = self.driver.find_all(By::XPath("//div[contains(@class, 'msg-title-bar global-title-container')]//div[contains(@class, 'shared-title-bar__title')]//div[contains(@class, 'msg-entity-lockup')]//h2")).await?;

  //   if contact_header_name.is_empty() {
  //     return Err(JaniumError::msg("contact header name not found - empty array"));
  //   }

  //   let contact_header_name = contact_header_name[0].text().await;

  //   if contact_header_name.is_err() {
  //     return Err(JaniumError::msg(
  //       "contact header name not found - html innerText not found",
  //     ));
  //   }

  //   let contact_header_name = contact_header_name.unwrap().trim().to_string();
  //   tracing::info!("contact_header_name={}", contact_header_name);

  //   if contact_header_name == "LinkedIn Member" || contact_header_name == "LinkedIn" {
  //     return Err(JaniumError::msg(format!(
  //       "contact header name is {}. Not a valid contact name",
  //       contact_header_name
  //     )));
  //   }

  //   let first_message = self
  //     .driver
  //     .find_all(By::XPath("//div[contains(@class, 'msg__list')]//ul/li/div"))
  //     .await?[0]
  //     .clone();
  //   let mut first_message_contact_name = String::new();

  //   if let Some(values) = self
  //     .process_new_message(
  //       &first_message,
  //       count,
  //       in_unix_epoch,
  //       account_profile_name,
  //       &first_message_contact_name,
  //       Some(0),
  //       None,
  //     )
  //     .await?
  //   {
  //     let (message_text_content, message_contact_name, is_new_message) = values;
  //     first_message_contact_name = message_contact_name.clone();

  //     if !is_new_message {
  //       number_of_non_new_messages_in_a_row += 1;
  //     } else {
  //       new_messages_found.push(NewMessage {
  //         message_contact_name: message_contact_name.clone(),
  //         message_content: message_text_content,
  //       });
  //     }

  //     already_processed_contact_names.push(message_contact_name);
  //   }

  //   processed_messages_count += 1;

  //   tracing::info!("finished processing first unread message");

  //   let unread_button = self.get_unread_messages_button().await?;

  //   let unread_button_class = unread_button.class_name().await?;

  //   tracing::info!("unread button class={}", unread_button_class.as_deref().unwrap_or(""));

  //   if let Some(class) = unread_button_class
  //     && !self.is_button_selected(&class)
  //   {
  //     tracing::info!("clicking on unread button to only see unread messages");

  //     self
  //       .mouse_to_click(&unread_button)
  //       .await
  //       .map_err(|e| JaniumError::msg(format!("Failed to click on unread messages button: {e}")))?;
  //   }

  //   let unread_conversations_contact_names = self.get_unread_conversation_contact_names().await?;

  //   tracing::info!(
  //     "unread_conversations_contact_names={:?}",
  //     unread_conversations_contact_names
  //   );

  //   if unread_conversations_contact_names.is_empty() {
  //     tracing::info!("new messages list is empty");
  //     return Ok(new_messages_found);
  //   }

  //   tracing::info!(
  //     "found {} new messages that shows the badge count",
  //     unread_conversations_contact_names.len()
  //   );

  //   while number_of_non_new_messages_in_a_row < 4 {
  //     tracing::info!("processed_messages_count={}", processed_messages_count);

  //     if already_processed_contact_names.len() >= unread_conversations_contact_names.len() {
  //       tracing::info!(
  //         "while processing the list of unread messages probably a new one appeared. Will be processed in the next iteration"
  //       );
  //       break;
  //     }

  //     let output_values = self
  //       .get_next_unread_conversation(&already_processed_contact_names)
  //       .await?;

  //     let (next_message_to_process, contact_name) = if let Some(values) = output_values {
  //       values
  //     } else {
  //       tracing::info!("no more unread messages to process");
  //       break;
  //     };

  //     tracing::info!("next_message_to_process contact_name={}", contact_name);

  //     tracing::info!("scrolling to element");
  //     self.scroll_to_element(&next_message_to_process).await?;

  //     tracing::info!("about to click on new_message element");

  //     self.mouse_to_click(&next_message_to_process).await?;

  //     tracing::info!("badge notification clicked on before process_new_message");

  //     Delay::Click.await;

  //     if !self.is_on_messaging_page().await {
  //       tracing::warn!("not on messaging page. it clicked on a wrong element");

  //       if self.is_on_notifications_page().await {
  //         tracing::warn!("is on notifications page");
  //       }

  //       if self.is_on_sales_nav_home().await {
  //         tracing::warn!("is on sales nav home page");
  //       }

  //       Delay::BigLoad.await;

  //       tracing::warn!("starting download_unread_messages again");

  //       if execution_number == 1 {
  //         return Err(JaniumError::msg(
  //           "Tried 2 times to download unread messages and failed. HTML changed?",
  //         ));
  //       }

  //       self.nav_messages().await;
  //       Delay::BigLoad.await;

  //       unreachable!(
  //         "This is not currently supported, if we are not on messaging page, we should what happened. There are some limitations on recursion here."
  //       );
  //       // download_unread_messages_from_messaging_tab(
  //       //     in_unix_epoch,
  //       //     count,
  //       //     customer_id,
  //       //     account_profile_name,
  //       //     action_id,
  //       //     driver,
  //       //     execution_number + 1,
  //       // ).await?;
  //     }

  //     let current_message_contact_name = &unread_conversations_contact_names[already_processed_contact_names.len()];

  //     tracing::info!("current_message_contact_name={}", current_message_contact_name);

  //     let contact_header_name = self.driver.find_all(By::XPath("//div[contains(@class, 'msg-title-bar global-title-container')]//div[contains(@class, 'shared-title-bar__title')]//div[contains(@class, 'msg-entity-lockup')]//h2")).await?;

  //     if contact_header_name.is_empty() {
  //       return Err(JaniumError::msg("contact header name not found - empty array"));
  //     }

  //     let contact_header_name = contact_header_name[0].text().await;

  //     if contact_header_name.is_err() {
  //       return Err(JaniumError::msg(
  //         "contact header name not found - html innerText not found",
  //       ));
  //     }

  //     let contact_header_name = contact_header_name.unwrap().trim().to_string();
  //     tracing::info!("contact_header_name={}", contact_header_name);

  //     if contact_header_name == "LinkedIn Member" || contact_header_name == "LinkedIn" {
  //       return Err(JaniumError::msg(format!(
  //         "contact header name is {contact_header_name}. Not a valid contact name",
  //       )));
  //     }

  //     tracing::info!("executing process new message");

  //     if let Some(values) = self
  //       .process_new_message(
  //         &next_message_to_process,
  //         count,
  //         in_unix_epoch,
  //         account_profile_name,
  //         &first_message_contact_name,
  //         Some(processed_messages_count),
  //         Some(current_message_contact_name),
  //       )
  //       .await?
  //     {
  //       let (message_text_content, message_contact_name, is_new_message) = values;

  //       if is_new_message {
  //         number_of_non_new_messages_in_a_row = 0;
  //         new_messages_found.push(NewMessage {
  //           message_contact_name,
  //           message_content: message_text_content,
  //         });
  //       } else {
  //         number_of_non_new_messages_in_a_row += 1;
  //       }

  //       count += 1;
  //     }

  //     processed_messages_count += 1;
  //     already_processed_contact_names.push(contact_name);

  //     tracing::info!(
  //       "finished processing {} non new messages in a row",
  //       number_of_non_new_messages_in_a_row
  //     );
  //   }

  //   Delay::Click.await;

  //   tracing::info!("exiting the loop after getting 4 non new messages in a row");
  //   tracing::info!("finished processing all new unread messages");

  //   Ok(new_messages_found)
  // }

  // pub async fn process_new_message(
  //   &mut self,
  //   new_message: &WebElement,
  //   count: i32,
  //   in_unix_epoch: &str,
  //   account_profile_name: &str,
  //   first_message_contact_name: &str,
  //   processed_messages_count: Option<i32>,
  //   current_message_contact_name: Option<&str>,
  // ) -> Result<Option<(String, String, bool)>> {
  //   let mut is_new_message = false;

  //   tracing::info!("setting message as read");
  //   let result = self.set_message_to_read_status().await?;
  //   if result.is_none() {
  //     return Ok(None);
  //   }
  //   if !result.unwrap() {
  //     tracing::warn!("Mark as read button not found. Maybe it was already marked as read");
  //   }

  //   tracing::info!("message marked as read");

  //   let values = self.get_message_content(current_message_contact_name).await?;

  //   let (message_text_content, message_contact_name, masked_contact_url) = if let Some(values) = values {
  //     values
  //   } else {
  //     tracing::info!("unable to get message content full info. There might be an issue with the HTML structure");
  //     let result = self.restore_message_to_unread_status().await?;
  //     return Ok(None);
  //     // return Err(
  //     //   anyhow!("Unable to get message content full info. There might be an issue with the HTML structure").into(),
  //     // );
  //   };

  //   tracing::info!("inbound message content: {}", message_text_content);
  //   tracing::info!("inbound message contact name: {}", message_contact_name);

  //   if (processed_messages_count.is_none() || processed_messages_count.unwrap() == 0)
  //     && first_message_contact_name == message_contact_name
  //   {
  //     tracing::info!("first message already processed and marked as unread. Skipping");
  //     return Ok(None);
  //   }

  //   let message_contact_name = if let Some(name) = current_message_contact_name {
  //     name.to_string()
  //   } else {
  //     tracing::info!("current_message_contact_name is None");
  //     message_contact_name
  //   };

  //   if message_contact_name == account_profile_name {
  //     tracing::info!("message is from the same profile. Skipping");
  //     tracing::info!("restoring message as unread");
  //     let result = self.restore_message_to_unread_status().await?;

  //     if result.unwrap_or(false) {
  //       tracing::info!("successfully restored message as unread");
  //     }

  //     return Ok(None);
  //   }

  //   tracing::info!("inbound message contact url: {}", masked_contact_url);

  //   let masked_message_page_profile_url_hash = self.get_masked_hash_url(&masked_contact_url).await;

  //   let masked_message_page_profile_url_hash = match masked_message_page_profile_url_hash {
  //     Ok(hash) => hash,
  //     Err(e) => {
  //       tracing::info!("restoring message as unread");
  //       self.restore_message_to_unread_status().await?;
  //       return Err(JaniumError::msg(format!(
  //         "Error getting masked_message_page_profile_url_hash: {}",
  //         e
  //       )));
  //     }
  //   };

  //   tracing::info!(
  //     "inbound message masked_message_page_profile_url_hash: {}",
  //     masked_message_page_profile_url_hash
  //   );

  //   if self
  //     .check_if_new_message(
  //       todo!(),
  //       &message_contact_name,
  //       &masked_message_page_profile_url_hash,
  //       &message_text_content,
  //     )
  //     .await?
  //   {
  //     tracing::info!(
  //       "registering new message for {} in db and local cache",
  //       message_contact_name
  //     );
  //     tracing::info!(
  //       "masked_message_page_profile_url_hash: {}",
  //       masked_message_page_profile_url_hash
  //     );
  //     tracing::info!("registering new inbound li message from {}", message_contact_name);

  //     // new_inbound_li_message(
  //     //   customer_id,
  //     //   &message_contact_name,
  //     //   &masked_message_page_profile_url_hash,
  //     //   &masked_contact_url,
  //     //   &message_text_content,
  //     //   action_id,
  //     // )
  //     // .await?;

  //     is_new_message = true;
  //   }

  //   tracing::info!("restoring message as unread");
  //   tracing::info!(
  //     "inbound processed_messages_count={}",
  //     processed_messages_count.unwrap_or(0)
  //   );

  //   Delay::Scroll.await;

  //   let result = if processed_messages_count.is_none() {
  //     self.restore_message_to_unread_status().await?
  //   } else {
  //     tracing::info!("restoring as unread with processed_messages_count defined");
  //     tracing::info!("restoring message as unread from chat conversation");

  //     let result = self.restore_message_to_unread_status().await?;

  //     if result.unwrap_or(false) {
  //       tracing::info!("successfully restored message as unread from chat conversation");
  //       Some(true)
  //     } else {
  //       tracing::warn!("failed to restore message as unread from chat conversation. Trying again");
  //       tracing::info!("refreshing page");
  //       Delay::Scroll.await;
  //       self.driver.refresh().await?;

  //       tracing::info!("restoring message as unread from chats list");
  //       Some(
  //         self
  //           .restore_message_to_unread_status_from_chat_conversation(processed_messages_count.unwrap())
  //           .await?,
  //       )
  //     }
  //   };

  //   if !result.unwrap_or(false) {
  //     return Ok(None);
  //   }

  //   tracing::info!("restored message as unread");
  //   tracing::info!("finished processing new message");

  //   Delay::Ms(1000).await;

  //   Ok(Some((message_text_content, message_contact_name, is_new_message)))
  // }

  // pub async fn set_message_to_read_status(&mut self) -> Result<Option<bool>> {
  //   let three_dots_menu_button = self
  //     .driver
  //     .find_all(By::Css("div.msg-title-bar div.msg-thread-actions__dropdown button"))
  //     .await?;

  //   if three_dots_menu_button.is_empty() {
  //     return Err(JaniumError::msg(
  //       "Three dots menu button not found. Couldnt mark message as read",
  //     ));
  //   }

  //   self.mouse_to_click(&three_dots_menu_button[0]).await?;
  //   Delay::Click.await;

  //   tracing::info!("opened the three dots menu");

  //   let mark_as_read_button = self
  //     .driver
  //     .find_all(By::XPath(
  //       "//div[contains(@class, 'artdeco-dropdown__content-inner')]//div[text()='Mark as read']",
  //     ))
  //     .await?;

  //   if mark_as_read_button.is_empty() {
  //     tracing::warn!("Mark as read button not found. Couldnt mark message as read");
  //     self.mouse_to_click(&three_dots_menu_button[0]).await?;
  //   } else {
  //     self.mouse_to_click(&mark_as_read_button[0]).await?;
  //   }
  //   Delay::Click.await;

  //   Ok(Some(true))
  // }

  // pub async fn restore_message_to_unread_status(&mut self) -> Result<Option<bool>> {
  //   let three_dots_menu_button = self
  //     .driver
  //     .find_all(By::Css("div.msg-title-bar div.msg-thread-actions__dropdown button"))
  //     .await?;

  //   if three_dots_menu_button.is_empty() {
  //     return Err(JaniumError::msg(
  //       "Three dots menu button not found. Couldnt mark message as unread",
  //     ));
  //   }

  //   self.mouse_to_click(&three_dots_menu_button[0]).await?;

  //   tracing::info!("opened the three dots menu");

  //   let mark_as_unread_button = self.driver.find_all(By::XPath("//div[contains(@class, 'artdeco-dropdown msg-thread-actions__dropdown')]//div[contains(@class, 'artdeco-dropdown__content-inner')]//div[text()='Mark as unread']")).await?;

  //   if mark_as_unread_button.is_empty() {
  //     self.mouse_to_click(&three_dots_menu_button[0]).await?;
  //     return Err(JaniumError::msg(
  //       "Mark as unread button not found. Couldnt mark message as unread",
  //     ));
  //   }

  //   self.mouse_to_click(&mark_as_unread_button[0]).await?;

  //   Ok(Some(true))
  // }

  // pub async fn check_if_new_message(
  //   &mut self,
  //   customer_id: &str,
  //   contact_name: &str,
  //   masked_message_page_profile_url_hash: &str,
  //   message_content: &str,
  // ) -> Result<bool> {
  //   // TODO: add local cache?

  //   if !self.check_if_message_exists_on_db(customer_id, message_content).await? {
  //     tracing::info!("message not found in db. Adding new message");
  //     return Ok(true);
  //   } else {
  //     // message already processed but was not included in local cache
  //     // local cache was not updated
  //     // this is the scenario after restarting the automator
  //     tracing::info!("local cache miss - message already processed from the db. Updating local cache");
  //   }

  //   tracing::info!("-- message already processed -- from is_new_message ++ local cache");

  //   Ok(false)
  // }

  // pub async fn restore_message_to_unread_status_from_chat_conversation(
  //   &mut self,
  //   processed_messages_count: i32,
  // ) -> Result<bool> {
  //   tracing::info!("getting three dots menu button - from restore_message_to_unread_status_from_chat_conversation");

  //   let three_dots_menu_button = self
  //     .driver
  //     .find_all(By::XPath(
  //       "//div[contains(@class, 'artdeco-dropdown msg-thread-actions__dropdown')]/button",
  //     ))
  //     .await?;

  //   if three_dots_menu_button.is_empty() {
  //     return Err(JaniumError::msg(
  //       "Three dots menu button not found. Couldnt mark message as unread - from restore_message_to_unread_status_from_chat_conversation",
  //     ));
  //   } else if processed_messages_count as usize >= three_dots_menu_button.len() {
  //     return Err(JaniumError::msg(
  //       "Processed messages count exceeds the number of three dots menu buttons. This is a weird situation on the HTML. Maybe they changed the structure?",
  //     ));
  //   }

  //   let three_dots_menu_button = &three_dots_menu_button[processed_messages_count as usize];

  //   self.mouse_to_click(three_dots_menu_button).await?;

  //   tracing::info!("opened the three dots menu - from restore_message_to_unread_status_from_chat_conversation");

  //   let mark_as_unread_button = self.driver.find_all(By::XPath("//div[contains(@class, 'artdeco-dropdown msg-thread-actions__dropdown')]//div[contains(@class, 'artdeco-dropdown__content-inner')]//div[text()='Mark as unread']")).await?;

  //   if mark_as_unread_button.is_empty() {
  //     self.mouse_to_click(three_dots_menu_button).await?;
  //     return Err(JaniumError::msg(
  //       "Mark as unread button not found. Couldnt mark message as unread - from restore_message_to_unread_status_from_chat_conversation",
  //     ));
  //   }

  //   let mark_as_unread_button = &mark_as_unread_button[processed_messages_count as usize];
  //   self.mouse_to_click(mark_as_unread_button).await?;
  //   Ok(true)
  // }
}
