use super::Automator;
use super::utils::Delay;
use crate::{JaniumError, Result};
use thirtyfour::prelude::*;

/// Top-level scraped public profile data
#[derive(Debug)]
#[expect(dead_code)]
pub struct PublicProfile {
  pub name: Option<String>,
  pub headline: Option<String>,
  pub location: Option<String>,
  pub contact_info: Option<String>,
  pub about: Option<String>,
  pub experience: Vec<ExperienceItem>,
  pub education: Vec<EducationItem>,
}

/// Experience section items
#[derive(Debug)]
#[expect(dead_code)]
pub struct ExperienceItem {
  pub title: Option<String>,
  pub company: Option<String>,
  pub date_range: Option<String>,
  pub location: Option<String>,
  pub description: Option<String>,
}

/// Education section items
#[derive(Debug)]
#[expect(dead_code)]
pub struct EducationItem {
  pub school: Option<String>,
  pub degree: Option<String>,
  pub field_of_study: Option<String>,
  pub date_range: Option<String>,
  pub description: Option<String>,
}

impl Automator {
  pub async fn view_sales_nav_profile(&mut self, profile_url: String) -> Result<String> {
    tracing::info!("Executing view_sales_nav_profile and visiting {profile_url}");

    // Navigate to the Sales Navigator profile URL
    self.goto(&profile_url).await?;

    // Wait for the page to load completely
    Delay::BigLoad.await;

    self.dismiss_2fa_pop_up_if_present().await?;

    if self.is_unlock_profile_present().await? {
      return Err(JaniumError::msg("Unlock profile button is present"));
    }

    // Check if the profile is loaded correctly
    if !self.is_on_sales_navigator_profile().await? {
      return Err(JaniumError::msg(format!(
        "Failed to load Sales Navigator profile: {}",
        profile_url
      )));
    }

    let profile_url = self.get_real_url_from_sales_navigator_url().await?;

    Ok(profile_url)
  }

  pub async fn view_li_profile(&self, profile_url: &str) -> Result<()> {
    tracing::info!("Executing view_li_profile");

    // Navigate to the LinkedIn profile URL
    self.goto(profile_url).await?;

    // Wait for the page to load completely
    Delay::BigLoad.await;

    Ok(())
  }

  // Scrape and return structured public profile data
  #[expect(dead_code)]
  pub async fn scrape_public_profile(&mut self, public_url: &str) -> Result<PublicProfile> {
    tracing::info!("Scraping public profile at {}", public_url);

    self.goto(public_url).await?;
    Delay::BigLoad.await;

    // Top card
    let name = self.try_get_text(By::Css("h1.t-24")).await?;
    let headline = self.try_get_text(By::Css(".text-body-medium.break-words")).await?;
    let location = self
      .try_get_text(By::Css("span.text-body-small.inline.t-black--light"))
      .await?;

    // About
    let about = self.scrape_about_section().await?;

    // Contact Info
    let contact_info = self.scrape_contact_info().await?;

    // Experience
    let experience = self.scrape_experience().await?;

    // Education
    let education = self.scrape_education().await?;

    Ok(PublicProfile {
      name,
      headline,
      location,
      about,
      experience,
      education,
      contact_info,
    })
  }

  // Scrape the Contact Info modal
  #[allow(unused)]
  pub async fn scrape_contact_info(&mut self) -> Result<Option<String>> {
    // Try clicking the "Contact info" link (if present)
    if let Ok(contact_btn) = self.find(By::Css("a[href*='contact-info']")).await {
      let _ = contact_btn.click().await;
      Delay::Load.await;

      // Try finding the modal container
      if let Ok(modal) = self.find(By::Css("div.pv-contact-info__contact-type")).await {
        // Minimal: return raw text for now
        let text = modal.text().await.unwrap_or_default();

        // Try closing modal
        if let Ok(close_btn) = self.find(By::Css("button[aria-label='Dismiss']")).await {
          let _ = close_btn.click().await;
        }

        return Ok(Some(text));
      }
    }

    Ok(None)
  }

  // Scrape the About section
  #[allow(unused)]
  pub async fn scrape_about_section(&self) -> Result<Option<String>> {
    // Look for collapsed OR expanded About text block
    let selector = By::Css(
      "div.inline-show-more-text--is-collapsed, \
         div.inline-show-more-text--is-expanded",
    );

    let elem = match self.find(selector).await {
      Ok(e) => e,
      Err(_) => return Ok(None),
    };

    // Extract visible text
    let raw = elem.text().await.unwrap_or_default();

    // Clean text (LinkedIn inserts invisible whitespace)
    let cleaned = raw.trim().to_string();

    if cleaned.is_empty() {
      return Ok(None);
    }

    Ok(Some(cleaned))
  }

  /// Scrape the Experience section
  #[allow(unused)]
  pub async fn scrape_experience(&self) -> Result<Vec<ExperienceItem>> {
    let mut items = Vec::new();

    let rows = match self
      .driver
      .find_all(By::Css("section[id='experience'] li.pvs-list__item"))
      .await
    {
      Ok(r) => r,
      Err(_) => return Ok(items),
    };

    for row in rows {
      // Title
      let title = self
        .try_child_text(&row, By::Css(".t-14.t-normal.t-black span[aria-hidden='true']"))
        .await?;

      // Company
      let company = self
        .try_child_text(&row, By::Css(".t-14.t-normal span[aria-hidden='true']"))
        .await?;

      // Date Range
      let date_range = self
        .try_child_text(&row, By::Css(".pvs-entity__caption-wrapper span[aria-hidden='true']"))
        .await?;

      // Location
      let location = self
        .try_child_text(&row, By::Css(".t-14.t-normal.t-black--light span[aria-hidden='true']"))
        .await?;

      // Description
      if let Ok(btn) = row.find(By::Css(".inline-show-more-text__button")).await {
        let _ = btn.click().await;
      }

      let description = self
        .try_child_text(&row, By::Css(".inline-show-more-text span[aria-hidden='true']"))
        .await?;

      items.push(ExperienceItem {
        title,
        company,
        date_range,
        location,
        description,
      });
    }

    Ok(items)
  }

  /// Scrape the Education section
  #[allow(unused)]
  pub async fn scrape_education(&self) -> Result<Vec<EducationItem>> {
    tracing::info!("Scraping education");

    // Modern LinkedIn education list selector
    let rows = match self
      .driver
      .find_all(By::Css("section[id='education'] li.pvs-list__item"))
      .await
    {
      Ok(r) => r,
      Err(_) => return Ok(vec![]), // no section
    };

    let mut output = vec![];

    for row in rows {
      // Usually inside div.pvs-entity
      let wrapper = match row.find(By::Css("div.pvs-entity")).await {
        Ok(w) => w,
        Err(_) => continue,
      };

      let school = self.try_child_text(&wrapper, By::Css(".t-bold span")).await?;
      let degree = self
        .try_child_text(&wrapper, By::Css(".t-normal span:nth-child(1)"))
        .await?;
      let field_of_study = self
        .try_child_text(&wrapper, By::Css(".t-normal span:nth-child(2)"))
        .await?;
      let date_range = self
        .try_child_text(&wrapper, By::Css(".pvs-entity__caption span"))
        .await?;
      let description = self
        .try_child_text(&wrapper, By::Css(".pvs-entity__description p"))
        .await?;

      // skip empty rows
      if school.is_none() {
        continue;
      }

      output.push(EducationItem {
        school,
        degree,
        field_of_study,
        date_range,
        description,
      });
    }

    Ok(output)
  }

  // Helper function to safely get text from an element
  #[allow(unused)]
  async fn try_get_text(&self, by: By) -> Result<Option<String>> {
    if let Ok(elem) = self.find(by).await {
      Ok(Some(elem.text().await?))
    } else {
      Ok(None)
    }
  }

  // Helper get text from within a specific parent element
  #[allow(unused)]
  async fn try_child_text(&self, parent: &WebElement, by: By) -> Result<Option<String>> {
    if let Ok(elem) = parent.find(by).await {
      Ok(Some(elem.text().await?))
    } else {
      Ok(None)
    }
  }
}
