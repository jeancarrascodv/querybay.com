use crate::Result;
use crate::automator::{Automator, utils::Delay};
use thirtyfour::By;

impl Automator {
  #[expect(dead_code)]
  pub async fn withdraw_oldest_cr(&mut self, amount: i32) -> Result<()> {
    tracing::info!("Withdrawing {amount} oldest connection request");

    // navigate to connections
    self.nav_to_linkedin_page().await?;
    // nav to sent conn req
    if !self.nav_sent_invitations().await? {
      tracing::error!("Failed to navigate to sent invitations page");
      Delay::Ms(400000).await;

      // if !nav_sent_invitations(driver).await? {
      //     logger.log("Failed to navigate to sent invitations page", "ERROR").await;
      //     inform_error_on_decision_maker(
      //         &action.id,
      //         "Failed to navigate to sent invitations page",
      //         customer_id,
      //         None,
      //         None,
      //         None,
      //         logger,
      //     ).await;
      //     return Err(anyhow!("Failed to navigate to sent invitations page"));
      // }
    }

    Delay::BigLoad.await;

    self.load_all_sent_invitations().await?;

    for i in 0..amount {
      println!("withdrawing profile: {}", i + 1);

      let list_of_profiles_in_page_to_withdraw = self.get_withdraw_buttons_from_sent_invitations().await?;

      if list_of_profiles_in_page_to_withdraw.is_empty() {
        println!("No profiles found to withdraw");
        break;
      }

      self
        .mouse_to_click(list_of_profiles_in_page_to_withdraw.last().unwrap())
        .await?;
      Delay::Load.await;

      let confirm_button = self
        .driver
        .find_all(By::XPath(
          "//h2[text()='Withdraw invitation']/../..//span[text()='Withdraw']/../..",
        ))
        .await?
        .pop();

      if confirm_button.is_none() {
        println!("No confirmation button found");
        return Err(crate::JaniumError::msg("No confirmation button found"));
      }

      self.mouse_to_click(&confirm_button.unwrap()).await?;
      Delay::BigLoad.await;

      tracing::info!("Withdrew connection request for profile {}", i + 1);
    }

    tracing::info!("Finished withdrawing {amount} oldest connection requests");

    Ok(())
  }

  #[expect(dead_code)]
  async fn go_to_latest_page(&mut self) -> Result<()> {
    let manage_invitations_title = self.get_manage_invitations_title().await?;
    if manage_invitations_title.is_none() {
      println!("No manage invitations title found");
      return Err(crate::JaniumError::msg("No manage invitations title found"));
    }

    // Simulate page down (replace with JS scroll if needed)
    self
      .driver
      .execute("window.scrollBy(0, window.innerHeight);", vec![])
      .await?;

    Delay::BigLoad.await;

    while self.is_next_page_button_enabled().await? {
      while self.is_not_at_the_bottom_of_page().await? {
        self
          .driver
          .execute("window.scrollTo(0, document.body.scrollHeight);", vec![])
          .await?;
        Delay::Load.await;
      }

      let Some(next_button) = self.get_next_button_from_sent_invitations().await? else {
        println!("No next button found");
        return Err(crate::JaniumError::msg("No next button found"));
      };
      self.mouse_to_click(&next_button).await?;
      Delay::BigLoad.await;
    }

    println!("Is on the last page");
    Ok(())
  }
}
