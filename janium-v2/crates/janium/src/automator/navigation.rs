use crate::automator::utils::Delay;
use crate::{JaniumError, Result};
use thirtyfour::prelude::*;

impl super::Automator {
  #[expect(dead_code)]
  pub async fn nav_messages(&mut self) -> bool {
    // navigates from main feed to messages page
    let messages_link = self.get_messaging_button_from_nav().await;

    if messages_link.is_none() {
      return false;
    }

    self.mouse_to_click(&messages_link.unwrap()).await.unwrap();
    Delay::Load.await;

    if self.is_on_messaging_page().await {
      self.navigation_ping().await.unwrap();
      true
    } else {
      self.failed_navigation_ping().await.unwrap();
      false
    }
  }

  #[allow(unused)]
  pub async fn nav_network(&self) -> bool {
    // navigates from main feed to network page
    let network_link = self.get_my_network_button_from_nav().await;

    if network_link.is_none() {
      self.failed_navigation_ping().await.unwrap();
      return false;
    }

    network_link.unwrap().click().await.unwrap();
    Delay::Load.await;

    if self.is_on_my_network_page().await {
      self.navigation_ping().await.unwrap();
      true
    } else {
      self.failed_navigation_ping().await.unwrap();
      false
    }
  }

  #[expect(dead_code)]
  pub async fn nav_connections(&mut self) -> crate::Result<bool> {
    // navigates from network page to connections page
    self.nav_network().await;
    Delay::Other.await;

    if !self.is_on_my_network_page().await {
      tracing::error!("Failed to load my network page");

      self.failed_navigation_ping().await?;
      return Err(crate::JaniumError::msg("Failed to load my network page"));
    }

    let manage_my_network_link = self
      .driver
      .find_all(By::XPath("//h2[text()='Manage my network']"))
      .await?;

    let manage_my_network_non_clickable = self
      .driver
      .find_all(By::XPath("//p[text()='Manage my network']"))
      .await?;

    if manage_my_network_link.is_empty() && manage_my_network_non_clickable.is_empty() {
      tracing::error!("Failed to find Manage my network link or text");

      self.failed_navigation_ping().await?;

      return Err(crate::JaniumError::msg(
        "Failed to find 'Manage my network' link or text",
      ));
    }

    if !manage_my_network_link.is_empty() {
      self.mouse_to_click(&manage_my_network_link[0]).await.unwrap();
      Delay::Other.await;
    }

    let connections_link = self.driver.find_all(By::XPath("//*[text()='Connections']")).await?;

    if connections_link.is_empty() {
      tracing::error!("Failed to find connections link");

      self.failed_navigation_ping().await?;

      return Err(crate::JaniumError::msg("Failed to find 'Connections' link"));
    }

    self
      .mouse_to_click_with_options(&connections_link[0], Some(-40), Some(-5))
      .await
      .unwrap();
    Delay::Load.await;

    if self.is_on_connections_page().await {
      self.navigation_ping().await?;
      Ok(true)
    } else {
      self.failed_navigation_ping().await?;
      Ok(false)
    }
  }

  #[allow(unused)]
  pub async fn nav_sent_invitations(&mut self) -> crate::Result<bool> {
    // navigates to invitations sent page
    self.nav_network().await;
    Delay::Other.await;

    let invitations_link = if self.is_no_pending_invitations_displayed().await {
      let manage_link = self.driver.find_all(By::PartialLinkText("Manage")).await?;
      if manage_link.is_empty() {
        tracing::error!("Unable to find 'Manage' link");
        return Ok(false);
      }
      Some(manage_link[0].clone())
    } else {
      let show_all_link = self.driver.find_all(By::PartialLinkText("Show all")).await?;
      if !show_all_link.is_empty() {
        Some(show_all_link[0].clone())
      } else {
        let see_all_link = self.driver.find_all(By::PartialLinkText("See all")).await?;
        if !see_all_link.is_empty() {
          Some(see_all_link[0].clone())
        } else {
          tracing::error!("Unable to find 'Show all' or 'See all' link");
          None
        }
      }
    };

    if invitations_link.is_none() {
      return Ok(false);
    }

    self
      .mouse_to_click_with_options(&invitations_link.unwrap(), Some(10), None)
      .await
      .unwrap();
    Delay::Load.await;

    let sent_invitations_link = self.get_sent_invitations_element().await;

    if sent_invitations_link.is_none() {
      return Ok(false);
    }

    self
      .mouse_to_click_with_options(&sent_invitations_link.unwrap(), Some(3), None)
      .await
      .unwrap();
    Delay::Other.await;

    Ok(self.is_on_sent_invitations_page().await)
  }

  #[expect(dead_code)]
  pub async fn nav_feed(&mut self) -> crate::Result<bool> {
    // navigates from anywhere on the site back to the feed page
    let linkedin_logo = self
      .driver
      .find_all(By::XPath("//li-icon[@aria-label='LinkedIn']"))
      .await?;

    if linkedin_logo.is_empty() {
      self.failed_navigation_ping().await?;
      return Ok(false);
    }

    self.mouse_to_click(&linkedin_logo[0]).await.unwrap();
    Delay::Load.await;

    if self.is_on_feed().await {
      self.navigation_ping().await?;
      Ok(true)
    } else {
      self.failed_navigation_ping().await?;
      Ok(false)
    }
  }

  #[allow(unused)]
  pub async fn nav_to_linkedin_page(&self) -> Result<bool> {
    self.driver.goto("https://linkedin.com").await?;
    Delay::BigLoad.await;

    if !self.is_on_feed().await
      || self.get_messaging_button_from_nav().await.is_none()
      || self.get_my_network_button_from_nav().await.is_none()
    {
      tracing::error!("Failed to load linkedin feed");

      self.failed_navigation_ping().await?;

      return Err(JaniumError::msg("Failed to load linkedin feed"));
    }

    Ok(self.is_on_feed().await)
  }

  #[expect(dead_code)]
  pub async fn browse_to_sent_invitations_page(&self) -> Result<bool> {
    self
      .driver
      .goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/")
      .await?;
    Delay::BigLoad.await;

    if !self.is_on_sent_invitations_page().await {
      tracing::error!("Failed to load sent invitations page");

      self.failed_navigation_ping().await?;

      return Err(JaniumError::msg("Failed to load sent invitations page"));
    }

    Ok(self.is_on_sent_invitations_page().await)
  }

  #[expect(dead_code)]
  pub async fn get_account_profile_name(&mut self) -> Result<String> {
    if !self.is_on_feed().await {
      return Err(JaniumError::msg(
        "Failed to load account profile page, not on feed page",
      ));
    }

    let me_button = self.driver.find_all(By::XPath("//span[text()='Me']/..")).await.unwrap();

    if me_button.len() != 1 {
      return Err(JaniumError::msg(
        "Failed to load account profile page, me button not found",
      ));
    }

    self.mouse_to_click(&me_button[0]).await.unwrap();

    let profile_name_element = self.driver
        .find_all(By::XPath(
            "//div[contains(@class, 'global-nav__me-content')]/div/header/a/div/div[contains(@class, 'artdeco-entity-lockup__content')]/div[contains(@class, 'artdeco-entity-lockup__title')]",
        ))
        .await.unwrap();

    if profile_name_element.len() == 1 {
      profile_name_element[0]
        .text()
        .await
        .map_err(|e| JaniumError::msg(format!("Failed to get profile name {}", e)))
    } else {
      Err(JaniumError::msg(
        "Failed to load account profile page, profile name element not found or multiple found",
      ))
    }
  }
}
