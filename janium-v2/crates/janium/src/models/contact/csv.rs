use super::{Contact, ContactDb, ContactEmail, ContactPhone, EmailType, EmailValidation, RejectedContact};
use crate::prelude::*;
use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize, janium_derive::Aliases, gql::SimpleObject)]
#[graphql(name = "ContactRow")]
pub struct ContactCsv {
  pub best_email: String,
  pub first_name: String,
  pub middle_name: Option<String>,
  pub last_name: Option<String>,
  #[aliases(["contact full name"])]
  pub full_name: Option<String>,
  pub preferred_name: Option<String>,
  pub title: Option<String>,
  pub department: Option<String>,
  pub seniority: Option<String>,
  #[aliases(["contact li profile url", "contact li profile handle"])]
  pub li_profile_handle: Option<String>,
  // pub li_sales_nav_profile_url: Option<String>,
  #[aliases(["contact city"])]
  pub city: Option<String>,
  #[aliases(["contact state"])]
  pub state: Option<String>,
  #[aliases(["contact state abbr"])]
  pub state_abbr: Option<String>,
  #[aliases(["contact country"])]
  pub country: Option<String>,
  #[aliases(["contact country (alpha 2)", "contact country(2)", "country (alpha 2)", "country(2)"])]
  pub country_2: Option<String>,
  #[aliases(["contact country (alpha 3)", "contact country(3)", "country (alpha 3)", "country(3)"])]
  pub country_3: Option<String>,
  #[aliases(["contact location"])]
  pub location: Option<String>,
  #[aliases(["linked in email"])]
  pub linkedin_email: Option<String>,
  pub email_1: Option<String>,
  pub email_1_validation: Option<String>,
  #[aliases(["email 1 total ai"])]
  pub email_1_confidence: Option<String>,
  pub email_2: Option<String>,
  pub email_2_validation: Option<String>,
  #[aliases(["email 2 total ai"])]
  pub email_2_confidence: Option<String>,
  pub personal_email: Option<String>,
  pub personal_email_validation: Option<String>,
  #[aliases(["personal email total ai"])]
  pub personal_email_confidence: Option<String>,
  #[aliases(["contact phone 1"])]
  pub phone_1: Option<String>,
  #[aliases(["contact phone 2"])]
  pub phone_2: Option<String>,
  #[aliases(["contact phone 3"])]
  pub phone_3: Option<String>,
  pub mobile_phone_1: Option<String>,
  #[aliases(["mobile phone 1 total ai"])]
  pub mobile_phone_1_confidence: Option<String>,
  pub mobile_phone_2: Option<String>,
  #[aliases(["mobile phone 2 total ai"])]
  pub mobile_phone_2_confidence: Option<String>,
  pub mobile_phone_3: Option<String>,
  #[aliases(["mobile phone 3 total ai"])]
  pub mobile_phone_3_confidence: Option<String>,
  pub company_li_profile_url: Option<String>,
  #[aliases(["company name - cleaned", "company name cleaned"])]
  pub company_name: Option<String>,
  pub company_website: Option<String>,
  pub company_city: Option<String>,
  pub company_state: Option<String>,
  pub company_state_abbr: Option<String>,
  pub company_country: Option<String>,
  #[aliases(["company country (alpha 2)", "company country(2)"])]
  pub company_country_2: Option<String>,
  #[aliases(["company country (alpha 3)", "company country(3)"])]
  pub company_country_3: Option<String>,
  pub company_location: Option<String>,
  pub company_phone_1: Option<String>,
  pub company_phone_2: Option<String>,
  pub company_phone_3: Option<String>,
  pub company_annual_revenue: Option<i64>,
  pub company_website_domain: Option<String>,
  pub company_founded_year: Option<i16>,
  pub company_industry: Option<String>,
  pub company_revenue_range: Option<String>,
  pub company_staff_count: Option<i32>,
  pub company_staff_count_range: Option<String>,
}

#[test]
fn test_empty_strings() {
  let csv = "first_name,best_email,linkedin_email,last_name\nJason,,,";
  let mut rdr = ::csv::Reader::from_reader(std::io::Cursor::new(csv));
  for result in rdr.deserialize::<super::ContactCsv>() {
    let first_row = result.unwrap();
    assert!(!first_row.first_name.is_empty());
    assert!(first_row.best_email.is_empty());
    assert!(first_row.linkedin_email.is_none());
    assert!(first_row.last_name.is_none());
  }
}

impl ContactCsv {
  pub fn validate(&self) -> Result<()> {
    if self.first_name.is_empty() {
      return Err(crate::JaniumError::ext_msg("First Name cannot be empty"));
    } else if self.best_email.is_empty() {
      return Err(crate::JaniumError::ext_msg("Best Email cannot be empty"));
    }
    Ok(())
  }
  /// Tries to match to existing company based on li_profile_url otherwise it creates a new one
  async fn as_company(&mut self, app_state: &AppState) -> Result<Option<Company>> {
    if let Some(li_url) = self.company_li_profile_url.take() {
      let e = app_state
        .company_service
        .get_by_li_url(&li_url)
        .await?
        .unwrap_or_else(|| Company {
          id: Id::new(),
          li_profile_url: li_url,
          ..Default::default()
        });
      let company = Company {
        id: e.id,
        li_profile_url: e.li_profile_url,
        name: self.company_name.take().or(e.name),
        website: self.company_website.take().or(e.website),
        city: self.company_city.take().or(e.city),
        state: self.company_state.take().or(e.state),
        state_abbr: self.company_state_abbr.take().or(e.state_abbr),
        country_full: self.company_country.take().or(e.country_full),
        country_2: self.company_country_2.take().or(e.country_2),
        country_3: self.company_country_3.take().or(e.country_3),
        location: self.company_location.take().or(e.location),
        phone_1: self.company_phone_1.take().or(e.phone_1),
        phone_2: self.company_phone_2.take().or(e.phone_2),
        phone_3: self.company_phone_3.take().or(e.phone_3),
        annual_revenue: self.company_annual_revenue.take().or(e.annual_revenue),
        website_domain: self.company_website_domain.take().or(e.website_domain),
        founded_year: self.company_founded_year.take().or(e.founded_year),
        industry: self.company_industry.take().or(e.industry),
        revenue_range: self.company_revenue_range.take().or(e.revenue_range),
        staff_count: self.company_staff_count.take().or(e.staff_count),
        staff_count_range: self.company_staff_count_range.take().or(e.staff_count_range),
      };
      Ok(Some(company))
    } else {
      Ok(None)
    }
  }
  pub fn emails(&self) -> [Option<&str>; 4] {
    [
      self.linkedin_email.as_deref(),
      self.email_1.as_deref(),
      self.email_2.as_deref(),
      self.personal_email.as_deref(),
    ]
  }
  #[expect(dead_code)]
  pub fn phones(&self) -> [Option<&str>; 6] {
    [
      self.phone_1.as_deref(),
      self.phone_2.as_deref(),
      self.phone_3.as_deref(),
      self.mobile_phone_1.as_deref(),
      self.mobile_phone_2.as_deref(),
      self.mobile_phone_3.as_deref(),
    ]
  }
  pub async fn into_contact(
    mut self,
    app_state: &AppState,
  ) -> Result<Result<(Contact, Option<Company>), RejectedContact>> {
    let clone = self.clone();
    let company = self.as_company(app_state).await?;
    let email_filter = self.emails();
    if !email_filter.iter().any(|e| e.is_some_and(|e| e == self.best_email)) {
      return Ok(Err(RejectedContact {
        contact_row: clone,
        message: "best_email does not match any of the other other emails".into(),
        matched_ids: Vec::new(),
      }));
    }
    let existing = sqlx::query_as::<_, (Id<Contact>,)>(
      "select id from contact \
      where li_profile_url = $1 \
      or id in ( \
        select id from contact_email \
        where email in (select email from unnest($2) as x(email))\
      )",
    )
    .bind(&self.li_profile_handle)
    .bind(email_filter)
    .fetch_all(&app_state.db)
    .await?;
    if existing.len() > 1 {
      return Ok(Err(RejectedContact {
        contact_row: clone,
        message: format!(
          "contact with best_email `{}` and li_profile_url `{}` matched multiple existing contacts in the database",
          self.best_email,
          self.li_profile_handle.as_deref().unwrap_or("<empty>"),
        ),
        matched_ids: existing.into_iter().map(|id| id.0).collect::<Vec<_>>(),
      }));
    }
    let id = existing.into_iter().next().map(|i| i.0).unwrap_or_else(Id::new);

    let e = app_state
      .contact_service
      .get(&id)
      .await?
      .map(|c| c.as_ref().clone())
      .unwrap_or_else(|| Contact {
        inner: ContactDb {
          id,
          ..Default::default()
        },
        emails: vec![],
        phones: vec![],
      });

    let inner = e.inner;
    let mut existing_emails = e
      .emails
      .into_iter()
      .map(|e| (e.email.clone(), e))
      .collect::<BTreeMap<_, _>>();

    let mut existing_phones = e
      .phones
      .into_iter()
      .map(|p| (p.phone.clone(), p))
      .collect::<BTreeMap<_, _>>();

    let mut emails = vec![];

    let mut add_emails =
      |email, email_type, email_source, priority, confidence: Option<String>, validation: Option<String>| {
        if emails.iter().any(|e: &ContactEmail| e.email == email) {
          return;
        }
        let confidence_score = confidence
          .and_then(|s| s.replace("%", "").parse::<i16>().ok())
          .unwrap_or(-1);
        let validation_type = validation
          .as_deref()
          .map(EmailValidation::from_str)
          .unwrap_or(EmailValidation::Unknown);
        let email = existing_emails
          .remove(&email)
          .map(|mut e| {
            e.priority = if self.best_email == email { 1 } else { e.priority };
            e.confidence_score = e.confidence_score.max(confidence_score);
            e.validation_type = e.validation_type.best(validation_type);
            e
          })
          .unwrap_or_else(|| ContactEmail {
            id: Id::new(),
            priority: if self.best_email == email { 1 } else { priority },
            email,
            emails_sent: 0,
            emails_opened: 0,
            email_type,
            email_source,
            confidence_score,
            validation_type,
            contact_id: inner.id,
            inactive_reason: None,
          });
        emails.push(email);
      };
    if let Some(email) = self.email_1 {
      add_emails(
        email,
        EmailType::Work,
        super::EmailSource::External,
        3,
        self.email_1_confidence,
        self.email_1_validation,
      );
    }
    if let Some(email) = self.email_2 {
      add_emails(
        email,
        EmailType::Work,
        super::EmailSource::External,
        4,
        self.email_2_confidence,
        self.email_2_validation,
      );
    }
    if let Some(email) = self.personal_email {
      add_emails(
        email,
        EmailType::Personal,
        super::EmailSource::External,
        5,
        self.personal_email_confidence,
        self.personal_email_validation,
      );
    }
    if let Some(email) = self.linkedin_email {
      add_emails(email, EmailType::Work, super::EmailSource::Janium, 2, None, None);
    }
    emails.extend(existing_emails.into_values());

    let mut phones = vec![];

    let mut add_phone = |phone: Option<String>, phone_type, priority, confidence: Option<String>| {
      if let Some(phone) = phone {
        if phones.iter().any(|p: &ContactPhone| p.phone == phone) {
          return;
        }
        let confidence_score = confidence
          .and_then(|s| s.replace("%", "").parse::<i16>().ok())
          .unwrap_or(-1);
        let phone = existing_phones
          .remove(&phone)
          .map(|mut p| {
            p.confidence_score = confidence_score;
            p.phone_type = phone_type;
            p.priority = priority;
            p
          })
          .unwrap_or_else(|| ContactPhone {
            id: Id::new(),
            contact_id: inner.id,
            phone,
            phone_type,
            priority,
            confidence_score,
          });
        phones.push(phone);
      }
    };

    add_phone(self.phone_1, super::PhoneType::Work, 1, None);
    add_phone(self.phone_2, super::PhoneType::Work, 2, None);
    add_phone(self.phone_3, super::PhoneType::Work, 3, None);
    add_phone(
      self.mobile_phone_1,
      super::PhoneType::Mobile,
      4,
      self.mobile_phone_1_confidence,
    );
    add_phone(
      self.mobile_phone_2,
      super::PhoneType::Mobile,
      5,
      self.mobile_phone_2_confidence,
    );
    add_phone(
      self.mobile_phone_3,
      super::PhoneType::Mobile,
      6,
      self.mobile_phone_3_confidence,
    );
    phones.extend(existing_phones.into_values());

    let contact = Contact {
      inner: ContactDb {
        id: inner.id,
        first_name: Some(self.first_name),
        middle_name: self.middle_name.or(inner.middle_name),
        last_name: self.last_name.or(inner.last_name),
        full_name: self.full_name.or(inner.full_name),
        preferred_name: self.preferred_name.or(inner.preferred_name),
        title: self.title.or(inner.title),
        department: self.department.or(inner.department),
        seniority: self.seniority.or(inner.seniority),
        li_profile_handle: self
          .li_profile_handle
          .map(|url| {
            if let Some((_, handle)) = url.rsplit_once('/') {
              handle.to_string()
            } else {
              url
            }
          })
          .or(inner.li_profile_handle),
        li_sales_nav_profile_id: None,
        city: self.city.or(inner.city),
        state: self.state.or(inner.state),
        state_abbr: self.state_abbr.or(inner.state_abbr),
        country_full: self.country.or(inner.country_full),
        country_2: self.country_2.or(inner.country_2),
        country_3: self.country_3.or(inner.country_3),
        location: self.location.or(inner.location),
        company_id: company.as_ref().map(|c| c.id),
      },
      emails,
      phones,
    };
    Ok(Ok((contact, company)))
  }
}
