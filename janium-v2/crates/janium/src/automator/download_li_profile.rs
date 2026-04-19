// use crate::automator::{Automator, utils::Delay};
// use crate::{JaniumError, Result};

// pub enum DownloadProfileDataAndSendConnRequestOutput {
//   OK,
//   HasEmailVerificationPopUp,
// }

// impl Automator {
//   pub async fn download_profile_data(
//     &mut self,
//     profile_url: &str,
//     store_contact_data_to_db: bool,
//     _message_content: Option<&str>,
//     _campaign_id: &str,
//     _created_from_step_campaign_contact: Option<&str>,
//   ) -> Result<Contact> {
//     if !self.is_correct_url_profile(profile_url) {
//       return Err(JaniumError::msg(format!(
//         "Profile url {} is not a valid LinkedIn profile url",
//         profile_url
//       )));
//     }

//     let driver = &self.driver;

//     driver.get(profile_url).await?;
//     Delay::BigLoad.await;

//     let profile_header_html = if let Some(html) = self.try_get_profile_header().await? {
//       self.navigation_ping().await?;
//       html
//     } else {
//       self.failed_navigation_ping().await?;
//       return Err(JaniumError::msg(format!(
//         "Failed to load profile page header for {}",
//         profile_url
//       )));
//     };

//     tracing::info!(
//       "About to get profile_first_name for {profile_url} from download_profile_data_and_send_conn_request",
//     );

//     // let contacts = self.get_contacts(customer_id, None, Some(profile_url)).await?;

//     // if contacts.is_empty() {
//     //   tracing::error!("Couldnt get Contact on db for profile_url {}", profile_url);

//     //   return Err(anyhow::anyhow!("Couldnt get Contact on db for profile_url {}", profile_url).into());
//     // }

//     let profile_first_name = self.get_profile_first_name(profile_url);

//     if profile_first_name.is_none() {
//       tracing::info!(
//         "Couldnt find Contact on db for profile_url {}, getting the full name, storing it to db and getting it cleaned",
//         profile_url
//       );

//       let profile_full_name = self.get_profile_full_name(profile_url).await?;

//       if profile_full_name.is_none() {
//         return Err(JaniumError::msg(format!(
//           "Couldnt get profile full name for {profile_url}",
//         )));
//       }

//       // let contacts = self.get_contacts(customer_id, None, Some(profile_url)).await?;
//       // if contacts.is_empty() {
//       //   tracing::error!("Couldnt get Contact on db for profile_url {}", profile_url);

//       //   return Err(anyhow::anyhow!("Couldnt get Contact on db for profile_url {}", profile_url).into());
//       // }

//       let profile_first_name = self.get_profile_first_name(profile_url);

//       if profile_first_name.is_none() {
//         return Err(JaniumError::msg(format!(
//           "Couldnt get profile first name for {profile_url}",
//         )));
//       }
//     }

//     let mut contact_status = ContactStatus::Initialized;

//     tracing::info!("Profile name is -{}-", profile_first_name.as_ref().unwrap());
//     tracing::info!("Profile url is {profile_url}");

//     let send_connection_request_in_profile_page_status = SendConnectionRequestStatus::Failed;
//     let has_email_verification_pop_up = false;
//     let profile_unique_url = self.get_profile_last_part(profile_url);

//     let profile_more_element = if let Some(element) = self.get_more_button_from_profile_page_element().await? {
//       element
//     } else {
//       return Err(JaniumError::msg(format!("More button not found for {profile_url}",)));
//     };

//     self.mouse_to_click(&profile_more_element).await?;
//     Delay::Click.await;
//     let connect_from_more_dropdown = self.get_connect_button_from_more_dropdown().await?;
//     Delay::Click.await;
//     self.mouse_to_click(&profile_more_element).await?;

//     tracing::info!("starting to download full profile info from {}", profile_url);

//     // TODO: Implement profile data downloading
//     // This would include:
//     // - Profile header HTML
//     // - Contact info HTML
//     let contact_info_html = self.execute_process_to_get_contact_info_html().await?;

//     // - People also viewed section
//     let people_also_viewed_html = self.try_to_get_section_html("People also viewed", profile_url).await?;

//     // - People you may know section
//     let people_you_may_know_html = self.try_to_get_section_html("People you may know", profile_url).await?;
//     // - Recent activity
//     let recent_activity_html = self.try_to_get_section_html("Activity", profile_url).await?;
//     // - About section
//     let about_html = self.try_to_get_section_html("About", profile_url).await?;

//     // - Work experience
//     let work_experience_html = self.execute_process_to_get_experience_html(profile_url).await?;
//     // - Education

//     let education_html = self.try_to_get_section_html("Education", profile_url).await?;
//     // - Volunteering
//     let volunteering_html = self.try_to_get_section_html("Volunteering", profile_url).await?;

//     // - Projects
//     let projects_html = self.try_to_get_section_html("Projects", profile_url).await?;

//     // - Skills
//     let skills_html = self.try_to_get_section_html("Skills", profile_url).await?;

//     // - Recommendations
//     let recommendations_html = self.try_to_get_section_html("Recommendations", profile_url).await?;

//     // - Honors & awards
//     let honors_and_awards_html = self.try_to_get_section_html("Honors & awards", profile_url).await?;

//     tracing::info!("finished downloading profile data for {}", profile_url);

//     let profile_raw_html = Some(self.concatenate_html_output(vec![
//       ("profile_header_html", Some(profile_header_html)),
//       ("contact_info_html", contact_info_html),
//       ("about_html", about_html),
//       ("recent_activity_html", recent_activity_html),
//       ("work_experience_html", work_experience_html),
//       ("education_html", education_html),
//       ("skills_html", skills_html),
//       ("projects_html", projects_html),
//       ("volunteering_html", volunteering_html),
//       ("recommendations_html", recommendations_html),
//       ("honors_and_awards_html", honors_and_awards_html),
//       ("people_also_viewed_html", people_also_viewed_html),
//       ("people_you_may_know_html", people_you_may_know_html),
//     ]));

//     // Check if person is a connection or not
//     if self.get_connect_from_profile_page_element().await?.is_some() || connect_from_more_dropdown.is_some() {
//       contact_status = ContactStatus::Initialized;
//     } else {
//       tracing::info!("Person is a connection or connection request already sent");

//       let is_pending_conn_req = self.get_pending_indicator_from_profile_page_element().await?;

//       if is_pending_conn_req.is_some() {
//         contact_status = ContactStatus::PendingConnReq;
//       } else {
//         contact_status = ContactStatus::Connection;
//       }
//     }

//     if store_contact_data_to_db {
//       tracing::info!("Create or Update Contact on db from download_profile_data_and_send_conn_request");

//       if let (Some(_), _) = (&profile_first_name, profile_url)
//         && send_connection_request_in_profile_page_status == SendConnectionRequestStatus::Success
//       {
//         // self
//         //   .new_outbound_li_connection_request(
//         //     customer_id,
//         //     Some(first_name),
//         //     profile_url,
//         //     Some(campaign_id),
//         //     Some(request_id),
//         //     message_content,
//         //     created_from_step_campaign_contact,
//         //   )
//         //   .await?;
//       }
//     }

//     if has_email_verification_pop_up {
//       return Err(JaniumError::msg(format!(
//         "Email verification pop-up detected for profile {profile_url}",
//       )));
//     }

//     Ok(Contact {
//       id: None,
//       profile_url: Some(profile_url.to_string()),
//       profile_full_name: self.get_profile_full_name(profile_url).await?,
//       profile_first_name: profile_first_name.clone(),
//       status: contact_status,
//       profile_raw_html,
//     })
//   }
// }
