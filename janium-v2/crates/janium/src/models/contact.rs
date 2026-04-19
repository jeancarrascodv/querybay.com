pub use self::csv::*;
pub use self::list::*;
use crate::prelude::*;
use crate::service_cache::{Cacheable, ServiceCache};
use crate::templates::scalar;
use serde::{Deserialize, Serialize};

pub mod csv;
pub mod list;

pub type ContactService = ServiceCache<Contact>;

impl Cacheable for Contact {
  type Key = Id<Self>;
  type Storage = Arc<Contact>;

  fn key(&self) -> Self::Key {
    self.inner.id
  }
  async fn save(self, transaction: &mut sqlx::PgConnection, router: &janium_actors::Router) -> Result<Self> {
    self.save(transaction, router).await
  }
  async fn load_many(
    keys: impl IntoIterator<Item = Id<Self>> + Send,
    db: &mut sqlx::PgConnection,
  ) -> Result<Vec<Self>> {
    Self::load(keys, db).await
  }
}

#[derive(Debug, Clone, Hash, gql::SimpleObject, gql::InputObject)]
pub struct Contact {
  #[graphql(flatten)]
  pub inner: ContactDb,
  pub emails: Vec<ContactEmail>,
  pub phones: Vec<ContactPhone>,
}

impl Contact {
  // private to ensure that this goes through the service cache
  async fn save(self, transaction: &mut sqlx::PgConnection, router: &janium_actors::Router) -> Result<Self> {
    // Try to save the contact, handling unique constraint violations on li_profile_url or li_sales_nav_profile_id
    let save_result = self
      .inner
      .clone()
      .insert(&mut *transaction)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        ContactDb::primary_key().unwrap(),
      ))
      .await;

    let inner = match save_result {
      Ok(inner) => inner,
      Err(ormlite::Error::SqlxError(sqlx::Error::Database(db_err))) if db_err.code().as_deref() == Some("23505") => {
        // Unique constraint violation - need to merge with existing contact
        let constraint = db_err.constraint().unwrap_or("");
        tracing::info!(
          ?constraint,
          new_contact_id = ?self.inner.id,
          li_profile_handle = ?self.inner.li_profile_handle,
          li_sales_nav_profile_id = ?self.inner.li_sales_nav_profile_id,
          "Unique constraint violation on contact - attempting merge"
        );

        let existing = sqlx::query_as::<_, ContactDb>(
          "select * from contact where (li_profile_url = $1 or li_sales_nav_profile_id = $2) and id != $3",
        )
        .bind(&self.inner.li_profile_handle)
        .bind(&self.inner.li_sales_nav_profile_id)
        .bind(self.inner.id)
        .fetch_optional(&mut *transaction)
        .await?;

        let Some(existing) = existing else {
          return Err(JaniumError::msg(format!(
            "Unique constraint violation but could not find existing contact: {}",
            constraint
          )));
        };

        if existing.id == self.inner.id {
          unreachable!("Select query excludes same id");
        }

        tracing::info!(
          existing_contact_id = ?existing.id,
          new_contact_id = ?self.inner.id,
          "Merging contacts - updating references and deleting duplicate"
        );

        // Update all foreign key references from new contact to existing contact
        let (affected_campaigns, affected_linkedins) =
          Self::update_contact_references(self.inner.id, existing.id, &mut *transaction).await?;

        // After merge is complete, notify only the affected campaigns
        for campaign_id in affected_campaigns {
          if let Ok(handle) = router.get_handle::<Campaign>(&campaign_id) {
            handle.to_sync().spawn_notify(ContactMerged {
              old_contact_id: self.inner.id,
              new_contact_id: existing.id,
            });
          }
        }

        // Notify LinkedIn actors so their in-memory ArcSwap stays in sync
        for linkedin_id in affected_linkedins {
          let to_contact_id = existing.id;
          if let Ok(handle) = router.get_handle::<LinkedIn>(&linkedin_id) {
            handle
              .to_sync()
              .spawn_notify(super::Query::new(move |actor: &LinkedIn, _, _: &LinkedInState| {
                actor.contact_id.set(to_contact_id);
              }));
          }
        }

        // Merge the data: prefer non-null values from the new contact
        let merged = ContactDb {
          id: existing.id,
          first_name: existing.first_name.or(self.inner.first_name),
          middle_name: existing.middle_name.or(self.inner.middle_name),
          last_name: existing.last_name.or(self.inner.last_name),
          full_name: existing.full_name.or(self.inner.full_name),
          preferred_name: existing.preferred_name.or(self.inner.preferred_name),
          title: existing.title.or(self.inner.title),
          department: existing.department.or(self.inner.department),
          seniority: existing.seniority.or(self.inner.seniority),
          li_profile_handle: existing.li_profile_handle.or(self.inner.li_profile_handle),
          li_sales_nav_profile_id: existing.li_sales_nav_profile_id.or(self.inner.li_sales_nav_profile_id),
          city: existing.city.or(self.inner.city),
          state: existing.state.or(self.inner.state),
          state_abbr: existing.state_abbr.or(self.inner.state_abbr),
          country_full: existing.country_full.or(self.inner.country_full),
          country_2: existing.country_2.or(self.inner.country_2),
          country_3: existing.country_3.or(self.inner.country_3),
          location: existing.location.or(self.inner.location),
          company_id: existing.company_id.or(self.inner.company_id),
        };

        // Delete the new contact if it exists in the database (it might not if this was a new insert)
        sqlx::query("DELETE FROM contact WHERE id = $1")
          .bind(self.inner.id)
          .execute(&mut *transaction)
          .await
          .ok();

        // Update the existing contact with merged data
        merged
          .update_all_fields(&mut *transaction)
          .await
          .inspect_err(|error| tracing::error!(?error, "Unable to update merged contact"))?
      }
      Err(e) => return Err(e.into()),
    };

    let mut emails = Vec::with_capacity(self.emails.len());
    for mut email in self.emails {
      // Ensure email points to the correct contact (in case of merge)
      email.contact_id = inner.id;
      let email = email
        .insert(&mut *transaction)
        .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
          ContactEmail::primary_key().unwrap(),
        ))
        .await
        .inspect_err(|error| tracing::error!(?error, "Unable to update email"))?;
      emails.push(email);
    }
    let mut phones = Vec::with_capacity(self.phones.len());
    for mut phone in self.phones {
      // Ensure phone points to the correct contact (in case of merge)
      phone.contact_id = inner.id;
      let phone = phone
        .insert(&mut *transaction)
        .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
          ContactPhone::primary_key().unwrap(),
        ))
        .await
        .inspect_err(|error| tracing::error!(?error, "Unable to update phone"))?;
      phones.push(phone);
    }
    Ok(Self { inner, emails, phones })
  }

  /// Updates all foreign key references from one contact to another.
  /// This is used when merging duplicate contacts.
  async fn update_contact_references(
    from_contact_id: Id<Contact>,
    to_contact_id: Id<Contact>,
    transaction: &mut sqlx::PgConnection,
  ) -> Result<(Vec<Id<Campaign>>, Vec<Id<LinkedIn>>)> {
    // Delete contact_list_contact rows that would conflict, then reassign the rest
    sqlx::query(
      "DELETE FROM contact_list_contact WHERE contact_id = $2
       AND contact_list_id IN (SELECT contact_list_id FROM contact_list_contact WHERE contact_id = $1)",
    )
    .bind(to_contact_id)
    .bind(from_contact_id)
    .execute(&mut *transaction)
    .await?;

    sqlx::query("UPDATE contact_list_contact SET contact_id = $1 WHERE contact_id = $2")
      .bind(to_contact_id)
      .bind(from_contact_id)
      .execute(&mut *transaction)
      .await?;

    // Delete campaign_contact rows that would conflict, then reassign the rest
    sqlx::query(
      "DELETE FROM campaign_contact WHERE contact_id = $2
       AND campaign_id IN (SELECT campaign_id FROM campaign_contact WHERE contact_id = $1)",
    )
    .bind(to_contact_id)
    .bind(from_contact_id)
    .execute(&mut *transaction)
    .await?;

    let campaign_ids = sqlx::query_scalar::<_, Id<Campaign>>(
      "UPDATE campaign_contact SET contact_id = $1 WHERE contact_id = $2
       RETURNING campaign_id",
    )
    .bind(to_contact_id)
    .bind(from_contact_id)
    .fetch_all(&mut *transaction)
    .await?;

    // Update linkedin_action_requests
    sqlx::query("UPDATE linkedin_action_requests SET contact_id = $1 WHERE contact_id = $2")
      .bind(to_contact_id)
      .bind(from_contact_id)
      .execute(&mut *transaction)
      .await?;

    // Update linkedin_action_history
    sqlx::query("UPDATE linkedin_action_history SET contact_id = $1 WHERE contact_id = $2")
      .bind(to_contact_id)
      .bind(from_contact_id)
      .execute(&mut *transaction)
      .await?;

    // Update linkedin_action_failures
    sqlx::query("UPDATE linkedin_action_failures SET contact_id = $1 WHERE contact_id = $2")
      .bind(to_contact_id)
      .bind(from_contact_id)
      .execute(&mut *transaction)
      .await?;

    // Delete linkedin_connections rows that would conflict, then reassign the rest
    sqlx::query(
      "DELETE FROM linkedin_connections WHERE contact_id = $2
       AND linkedin_id IN (SELECT linkedin_id FROM linkedin_connections WHERE contact_id = $1)",
    )
    .bind(to_contact_id)
    .bind(from_contact_id)
    .execute(&mut *transaction)
    .await?;

    sqlx::query("UPDATE linkedin_connections SET contact_id = $1 WHERE contact_id = $2")
      .bind(to_contact_id)
      .bind(from_contact_id)
      .execute(&mut *transaction)
      .await?;

    // Update linkedin_messages
    sqlx::query("UPDATE linkedin_messages SET sender_contact_id = $1 WHERE sender_contact_id = $2")
      .bind(to_contact_id)
      .bind(from_contact_id)
      .execute(&mut *transaction)
      .await?;

    // Update linkedin_conversations participant arrays (replace + dedup)
    sqlx::query(
      "UPDATE linkedin_conversations
       SET participant_contact_ids = (
         SELECT array_agg(DISTINCT x) FROM unnest(array_replace(participant_contact_ids, $2, $1)) x
       )
       WHERE $2 = ANY(participant_contact_ids)",
    )
    .bind(to_contact_id)
    .bind(from_contact_id)
    .execute(&mut *transaction)
    .await?;

    // Update linked_in (account owner contact)
    let affected_linkedin_ids =
      sqlx::query_scalar::<_, Id<LinkedIn>>("UPDATE linked_in SET contact_id = $1 WHERE contact_id = $2 RETURNING id")
        .bind(to_contact_id)
        .bind(from_contact_id)
        .fetch_all(&mut *transaction)
        .await?;

    // Update email_action
    sqlx::query("UPDATE email_action SET contact_id = $1 WHERE contact_id = $2")
      .bind(to_contact_id)
      .bind(from_contact_id)
      .execute(&mut *transaction)
      .await?;

    sqlx::query("UPDATE sent_email_history SET contact_id = $1 WHERE contact_id = $2")
      .bind(to_contact_id)
      .bind(from_contact_id)
      .execute(&mut *transaction)
      .await?;

    tracing::info!(
      from = ?from_contact_id,
      to = ?to_contact_id,
      "Updated all contact references"
    );

    Ok((campaign_ids, affected_linkedin_ids))
  }
  // private to ensure that this goes through the service cache
  async fn load(ids: impl IntoIterator<Item = Id<Self>>, db: &mut sqlx::PgConnection) -> Result<Vec<Self>> {
    let ids = ids.into_iter().collect::<Vec<_>>();
    let mut inners = ContactDb::select();
    let mut emails = ContactEmail::select();
    let mut phones = ContactPhone::select();
    if !ids.is_empty() {
      inners = inners.where_bind("id in (select id from unnest(?) as x(id))", &ids);
      emails = emails.where_bind("contact_id in (select id from unnest(?) as x(id))", &ids);
      phones = phones.where_bind("contact_id in (select id from unnest(?) as x(id))", &ids);
    }
    let mut inners = inners.fetch_all(&mut *db).await?;
    let mut emails = emails.fetch_all(&mut *db).await?;
    let mut phones = phones.fetch_all(&mut *db).await?;
    inners.sort_by_key(|c| c.id);
    emails.sort_by_key(|c| c.contact_id);
    phones.sort_by_key(|c| c.contact_id);

    let mut emails = emails.into_iter().peekable();
    let mut phones = phones.into_iter().peekable();

    let mut contacts = Vec::with_capacity(inners.len());
    for inner in inners.into_iter() {
      let mut contact = Contact {
        inner,
        emails: vec![],
        phones: vec![],
      };
      while let Some(peek) = emails.peek() {
        if peek.contact_id == contact.inner.id {
          contact.emails.push(emails.next().unwrap());
        } else {
          break;
        }
      }
      while let Some(peek) = phones.peek() {
        if peek.contact_id == contact.inner.id {
          contact.phones.push(phones.next().unwrap());
        } else {
          break;
        }
      }
      contacts.push(contact);
    }
    Ok(contacts)
  }

  /// Load a contact by Sales Navigator profile ID.
  pub async fn load_by_sn_id(sn_id: &str, db: &mut sqlx::PgConnection) -> Result<Vec<Self>> {
    let inner = ContactDb::select()
      .where_bind("li_sales_nav_profile_id = ?", sn_id)
      .fetch_optional(&mut *db)
      .await?;
    let Some(inner) = inner else {
      return Ok(vec![]);
    };
    let emails = ContactEmail::select()
      .where_bind("contact_id = ?", inner.id)
      .fetch_all(&mut *db)
      .await?;
    let phones = ContactPhone::select()
      .where_bind("contact_id = ?", inner.id)
      .fetch_all(&mut *db)
      .await?;
    Ok(vec![Contact { inner, emails, phones }])
  }

  pub async fn template_data(
    &self,
    app_state: &AppState,
    map: &mut impl FnMut(&'static str, liquid::model::Value),
  ) -> Result<()> {
    if let Some(company_id) = self.inner.company_id
      && let Some(company) = app_state.company_service.get(company_id).await?
    {
      company.template_data(&mut *map).await?;
    }
    // TODO: add emails and phones
    // TODO: figure out if this is is needed or we can optionally set values
    // map("first_name", scalar_or_nil(self.inner.first_name.clone()));
    if let Some(first_name) = self.inner.first_name.clone() {
      map("first_name", scalar(first_name));
    }
    if let Some(middle_name) = self.inner.middle_name.clone() {
      map("middle_name", scalar(middle_name));
    }
    if let Some(last_name) = self.inner.last_name.clone() {
      map("last_name", scalar(last_name));
    }
    if let Some(full_name) = self.inner.full_name.clone() {
      map("full_name", scalar(full_name));
    }
    if let Some(preferred_name) = self.inner.preferred_name.clone() {
      map("preferred_name", scalar(preferred_name));
    }
    if let Some(title) = self.inner.title.clone() {
      map("title", scalar(title));
    }
    if let Some(department) = self.inner.department.clone() {
      map("department", scalar(department));
    }
    if let Some(seniority) = self.inner.seniority.clone() {
      map("seniority", scalar(seniority));
    }
    if let Some(li_profile_handle) = self.inner.li_profile_handle.clone() {
      map("li_profile_handle", scalar(li_profile_handle));
    }
    // if let Some(li_sales_nav_profile_url) = self.inner.li_sales_nav_profile_id.clone() {
    //   map("li_sales_nav_profile_id", scalar(li_sales_nav_profile_id));
    // }
    if let Some(city) = self.inner.city.clone() {
      map("city", scalar(city));
    }
    if let Some(state) = self.inner.state.clone() {
      map("state", scalar(state));
    }
    if let Some(state_abbr) = self.inner.state_abbr.clone() {
      map("state_abbr", scalar(state_abbr));
    }
    if let Some(country_full) = self.inner.country_full.clone() {
      map("country_full", scalar(country_full));
    }
    if let Some(country_2) = self.inner.country_2.clone() {
      map("country_2", scalar(country_2));
    }
    if let Some(country_3) = self.inner.country_3.clone() {
      map("country_3", scalar(country_3));
    }
    if let Some(location) = self.inner.location.clone() {
      map("location", scalar(location));
    }
    Ok(())
  }
}

#[derive(Debug, Clone, Default, Hash, ormlite::Model, gql::SimpleObject, gql::InputObject)]
#[graphql(complex)]
#[ormlite(table = "contact")]
pub struct ContactDb {
  pub id: Id<Contact>,
  pub first_name: Option<String>,
  pub middle_name: Option<String>,
  pub last_name: Option<String>,
  pub full_name: Option<String>,
  pub preferred_name: Option<String>,
  pub title: Option<String>,
  pub department: Option<String>,
  pub seniority: Option<String>,
  #[ormlite(column = "li_profile_url")]
  pub li_profile_handle: Option<String>,
  pub li_sales_nav_profile_id: Option<String>,
  pub city: Option<String>,
  pub state: Option<String>,
  pub state_abbr: Option<String>,
  pub country_full: Option<String>,
  pub country_2: Option<String>,
  pub country_3: Option<String>,
  pub location: Option<String>,
  pub company_id: Option<Id<Company>>,
}

#[gql::ComplexObject]
impl ContactDb {
  pub async fn company(&self, ctx: &gql::Context<'_>) -> gql::Result<Option<Company>> {
    if let Some(id) = self.company_id {
      let app_state = ctx.data_unchecked::<AppState>();
      app_state.company_service.get(id).await.map_err(Into::into)
    } else {
      Ok(None)
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, gql::Enum, Deserialize, Serialize, sqlx::Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[repr(i16)]
pub enum EmailSource {
  // From the automator
  LinkedIn = 1,
  // From kendo i.e. linkedin_email
  Janium = 2,
  // From csv
  External = 3,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, gql::Enum, Deserialize, Serialize, sqlx::Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[repr(i16)]
pub enum EmailType {
  Work = 1,
  Personal = 2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, gql::Enum, Deserialize, Serialize, sqlx::Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[repr(i16)]
pub enum EmailValidation {
  Unknown = 0,
  AcceptAll = 1,
  Valid = 2,
}

impl EmailValidation {
  pub fn from_str(s: &str) -> Self {
    match s.to_lowercase().replace(" ", "").as_str() {
      "acceptall" => Self::AcceptAll,
      "valid" => Self::Valid,
      _ => Self::Unknown,
    }
  }
  pub fn best(self, other: Self) -> Self {
    if self == Self::Valid || other == Self::Valid {
      Self::Valid
    } else if self == Self::AcceptAll || other == Self::AcceptAll {
      Self::AcceptAll
    } else {
      Self::Unknown
    }
  }
}

#[derive(Debug, Clone, Hash, ormlite::Model, gql::SimpleObject, gql::InputObject)]
pub struct ContactEmail {
  #[ormlite(primary_key)]
  pub id: Id<ContactEmail>,
  #[graphql(skip)]
  pub contact_id: Id<Contact>,
  pub email: String,
  pub emails_sent: i16,
  pub emails_opened: i16,
  pub priority: i16,
  pub email_type: EmailType,
  pub email_source: EmailSource,
  // out of 100
  pub confidence_score: i16,
  pub validation_type: EmailValidation,
  pub inactive_reason: Option<String>,
}

impl ContactEmail {
  pub fn is_active(&self) -> bool {
    self.inactive_reason.is_none()
  }
}

#[derive(Debug, Clone, Hash, ormlite::Model, gql::SimpleObject, gql::InputObject)]
pub struct ContactPhone {
  #[ormlite(primary_key)]
  pub id: Id<ContactPhone>,
  #[graphql(skip)]
  pub contact_id: Id<Contact>,
  pub phone: String,
  pub phone_type: PhoneType,
  pub priority: i16,
  // out of 100
  pub confidence_score: i16,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, sqlx::Type, gql::Enum)]
#[repr(i16)]
pub enum PhoneType {
  Unknown = 0,
  Work = 1,
  Personal = 2,
  Mobile = 3,
}

#[cfg(test)]
mod tests {
  use crate::prelude::*;

  /// Test that contact merging correctly updates all foreign key references:
  /// - contact_list_contact (composite PK dedup)
  /// - campaign_contact (unique index dedup)
  /// - linkedin_action_requests
  /// - linkedin_action_history
  /// - linkedin_action_failures
  /// - linkedin_connections (unique index dedup)
  /// - linkedin_messages.sender_contact_id
  /// - linkedin_conversations.participant_contact_ids (array replace + dedup)
  /// - linked_in.contact_id (DB + actor ArcSwap)
  #[test]
  fn test_contact_merge_updates_all_references() {
    crate::test::app_state_test(60, async |app_state| {
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

      let db = &app_state.db;

      // Get the test LinkedIn and campaign (created by test_initialization.sql)
      let linkedin: LinkedIn = sqlx::query_as("SELECT * FROM linked_in LIMIT 1")
        .fetch_one(db)
        .await
        .unwrap();
      let campaign_id: Id<Campaign> = sqlx::query_scalar("SELECT id FROM campaign LIMIT 1")
        .fetch_one(db)
        .await
        .unwrap();

      // Create contact_a (the merge survivor) with a unique SN ID
      let contact_a = Contact {
        inner: ContactDb {
          id: Id::new(),
          full_name: Some("Contact A".to_string()),
          li_sales_nav_profile_id: Some("ACoAAA_merge_test".to_string()),
          ..Default::default()
        },
        emails: vec![],
        phones: vec![],
      };
      let contact_a_id = contact_a.inner.id;
      app_state
        .contact_service
        .save(Default::default(), contact_a, &mut db.acquire().await.unwrap())
        .await
        .unwrap();

      // Create contact_b (will be merged away) — save it first with a DIFFERENT SN ID so it doesn't merge yet
      let contact_b_id = Id::<Contact>::new();
      sqlx::query("INSERT INTO contact (id, full_name) VALUES ($1, 'Contact B')")
        .bind(contact_b_id)
        .execute(db)
        .await
        .unwrap();

      // --- Set up references pointing to contact_b across all tables ---

      // 1. linked_in.contact_id
      sqlx::query("UPDATE linked_in SET contact_id = $1 WHERE id = $2")
        .bind(contact_b_id)
        .bind(linkedin.id)
        .execute(db)
        .await
        .unwrap();

      let linkedin_handle = app_state.router.get_handle::<LinkedIn>(&linkedin.id).unwrap();
      linkedin_handle
        .send(super::Query::new(move |actor: &LinkedIn, _, _: &LinkedInState| {
          actor.contact_id.set(contact_b_id);
        }))
        .await
        .unwrap();

      // 2. contact_list_contact — create a contact_list, add both contacts to it (tests dedup)
      let contact_list_id = Id::<ContactList>::new();
      sqlx::query("INSERT INTO contact_list (id, team_id, name, created_date) VALUES ($1, $2, 'Test List', now())")
        .bind(contact_list_id)
        .bind(linkedin.team_id)
        .execute(db)
        .await
        .unwrap();

      // Add contact_a to the list (pre-existing)
      sqlx::query("INSERT INTO contact_list_contact (contact_list_id, contact_id) VALUES ($1, $2)")
        .bind(contact_list_id)
        .bind(contact_a_id)
        .execute(db)
        .await
        .unwrap();

      // Add contact_b to the same list (should be deduped on merge)
      sqlx::query("INSERT INTO contact_list_contact (contact_list_id, contact_id) VALUES ($1, $2)")
        .bind(contact_list_id)
        .bind(contact_b_id)
        .execute(db)
        .await
        .unwrap();

      // Also add contact_b to a second list where contact_a is NOT present (should be reassigned)
      let contact_list_2_id = Id::<ContactList>::new();
      sqlx::query("INSERT INTO contact_list (id, team_id, name, created_date) VALUES ($1, $2, 'Test List 2', now())")
        .bind(contact_list_2_id)
        .bind(linkedin.team_id)
        .execute(db)
        .await
        .unwrap();

      sqlx::query("INSERT INTO contact_list_contact (contact_list_id, contact_id) VALUES ($1, $2)")
        .bind(contact_list_2_id)
        .bind(contact_b_id)
        .execute(db)
        .await
        .unwrap();

      // 3. campaign_contact — add contact_b to the campaign (contact_a is NOT in it, so should reassign)
      sqlx::query(
        "INSERT INTO campaign_contact (id, campaign_id, contact_id, step_id, status, last_action, evaluation_attempts)
         VALUES ($1, $2, $3, '00000000-0000-0000-0000-000000000000', 1, now(), 0)",
      )
      .bind(Id::<CampaignContact>::new())
      .bind(campaign_id)
      .bind(contact_b_id)
      .execute(db)
      .await
      .unwrap();

      // 4. linkedin_connections — add contact_b as a connection, and contact_a too (tests dedup)
      sqlx::query(
        "INSERT INTO linkedin_connections (id, linkedin_id, contact_id, first_seen, last_seen, disconnected)
         VALUES ($1, $2, $3, now(), now(), false)",
      )
      .bind(Id::<LinkedInConnection>::new())
      .bind(linkedin.id)
      .bind(contact_a_id)
      .execute(db)
      .await
      .unwrap();

      sqlx::query(
        "INSERT INTO linkedin_connections (id, linkedin_id, contact_id, first_seen, last_seen, disconnected)
         VALUES ($1, $2, $3, now(), now(), false)",
      )
      .bind(Id::<LinkedInConnection>::new())
      .bind(linkedin.id)
      .bind(contact_b_id)
      .execute(db)
      .await
      .unwrap();

      // 5. linkedin_action_requests — create a request referencing contact_b
      sqlx::query(
        "INSERT INTO linkedin_action_requests
         (id, action, team_id, linkedin_id, contact_id, expires_at, priority, next_attempt_at, last_attempt_status, attempts, action_type)
         VALUES ($1, '{}'::jsonb, $2, $3, $4, now() + interval '1 hour', 0, now(), 0, 0, 0)",
      )
      .bind(Id::<LinkedInActionRequest>::new())
      .bind(linkedin.team_id)
      .bind(linkedin.id)
      .bind(contact_b_id)
      .execute(db)
      .await
      .unwrap();

      // 6. linkedin_action_history — create a history record referencing contact_b
      sqlx::query(
        "INSERT INTO linkedin_action_history
         (id, action, action_type, team_id, linkedin_id, contact_id, priority, started_at, completed_at, attempts)
         VALUES ($1, '{}'::jsonb, 0, $2, $3, $4, 0, now(), now(), 1)",
      )
      .bind(Id::<LinkedInActionHistory>::new())
      .bind(linkedin.team_id)
      .bind(linkedin.id)
      .bind(contact_b_id)
      .execute(db)
      .await
      .unwrap();

      // 7. linkedin_action_failures — create a failure record referencing contact_b
      sqlx::query(
        "INSERT INTO linkedin_action_failures
         (id, action, action_type, team_id, linkedin_id, contact_id, priority, failed_at, attempts, error)
         VALUES ($1, '{}'::jsonb, 0, $2, $3, $4, 0, now(), 1, 'test error')",
      )
      .bind(Id::<LinkedInActionFailure>::new())
      .bind(linkedin.team_id)
      .bind(linkedin.id)
      .bind(contact_b_id)
      .execute(db)
      .await
      .unwrap();

      // 8. linkedin_conversations + linkedin_messages
      let mut conv = LinkedInConversation::for_upsert(linkedin.id, linkedin.team_id, "merge-test-conv");
      conv.participant_contact_ids.insert(contact_a_id);
      conv.participant_contact_ids.insert(contact_b_id);
      let conv = conv.upsert(db).await.unwrap();

      // Insert a message from contact_b
      let msg = LinkedInMessage::new(conv.id, contact_b_id, "hello from b".to_string(), None, [0u8; 32]);
      msg.save(&mut db.acquire().await.unwrap()).await.unwrap();

      // --- Trigger the merge: save contact_b again with the SAME SN ID as contact_a ---
      let contact_b_merge = Contact {
        inner: ContactDb {
          id: contact_b_id,
          full_name: Some("Contact B".to_string()),
          li_sales_nav_profile_id: Some("ACoAAA_merge_test".to_string()),
          title: Some("Engineer".to_string()),
          ..Default::default()
        },
        emails: vec![],
        phones: vec![],
      };
      app_state
        .contact_service
        .save(Default::default(), contact_b_merge, &mut db.acquire().await.unwrap())
        .await
        .unwrap();

      // --- Verify all references now point to contact_a ---

      // linked_in.contact_id in DB
      let db_contact_id: Id<Contact> = sqlx::query_scalar("SELECT contact_id FROM linked_in WHERE id = $1")
        .bind(linkedin.id)
        .fetch_one(db)
        .await
        .unwrap();
      assert_eq!(
        db_contact_id, contact_a_id,
        "linked_in.contact_id should point to contact_a"
      );

      // LinkedIn actor ArcSwap
      let actor_contact_id: Id<Contact> = linkedin_handle
        .send(super::Query::new(|actor: &LinkedIn, _, _: &LinkedInState| {
          **actor.contact_id.get()
        }))
        .await
        .unwrap();
      assert_eq!(
        actor_contact_id, contact_a_id,
        "Actor ArcSwap should point to contact_a"
      );

      // contact_list_contact: list 1 should have only contact_a (deduped), list 2 should have contact_a (reassigned)
      let list1_contacts: Vec<Id<Contact>> =
        sqlx::query_scalar("SELECT contact_id FROM contact_list_contact WHERE contact_list_id = $1")
          .bind(contact_list_id)
          .fetch_all(db)
          .await
          .unwrap();
      assert_eq!(
        list1_contacts,
        vec![contact_a_id],
        "List 1 should have only contact_a (deduped)"
      );

      let list2_contacts: Vec<Id<Contact>> =
        sqlx::query_scalar("SELECT contact_id FROM contact_list_contact WHERE contact_list_id = $1")
          .bind(contact_list_2_id)
          .fetch_all(db)
          .await
          .unwrap();
      assert_eq!(
        list2_contacts,
        vec![contact_a_id],
        "List 2 should have contact_a (reassigned)"
      );

      // campaign_contact: should reference contact_a
      let cc_contact: Id<Contact> =
        sqlx::query_scalar("SELECT contact_id FROM campaign_contact WHERE campaign_id = $1 AND contact_id = $2")
          .bind(campaign_id)
          .bind(contact_a_id)
          .fetch_one(db)
          .await
          .unwrap();
      assert_eq!(cc_contact, contact_a_id, "campaign_contact should reference contact_a");

      // linkedin_connections: should have only contact_a for this linkedin (deduped)
      let conn_contacts: Vec<Id<Contact>> =
        sqlx::query_scalar("SELECT contact_id FROM linkedin_connections WHERE linkedin_id = $1 AND contact_id = $2")
          .bind(linkedin.id)
          .bind(contact_a_id)
          .fetch_all(db)
          .await
          .unwrap();
      assert_eq!(
        conn_contacts.len(),
        1,
        "linkedin_connections should have one contact_a row"
      );

      let conn_b_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM linkedin_connections WHERE linkedin_id = $1 AND contact_id = $2")
          .bind(linkedin.id)
          .bind(contact_b_id)
          .fetch_one(db)
          .await
          .unwrap();
      assert_eq!(conn_b_count, 0, "linkedin_connections should have no contact_b rows");

      // linkedin_action_requests: should reference contact_a
      let req_contact: Id<Contact> = sqlx::query_scalar(
        "SELECT contact_id FROM linkedin_action_requests WHERE linkedin_id = $1 AND contact_id = $2",
      )
      .bind(linkedin.id)
      .bind(contact_a_id)
      .fetch_one(db)
      .await
      .unwrap();
      assert_eq!(
        req_contact, contact_a_id,
        "linkedin_action_requests should reference contact_a"
      );

      // linkedin_action_history: should reference contact_a
      let hist_contact: Id<Contact> =
        sqlx::query_scalar("SELECT contact_id FROM linkedin_action_history WHERE linkedin_id = $1 AND contact_id = $2")
          .bind(linkedin.id)
          .bind(contact_a_id)
          .fetch_one(db)
          .await
          .unwrap();
      assert_eq!(
        hist_contact, contact_a_id,
        "linkedin_action_history should reference contact_a"
      );

      // linkedin_action_failures: should reference contact_a
      let fail_contact: Id<Contact> = sqlx::query_scalar(
        "SELECT contact_id FROM linkedin_action_failures WHERE linkedin_id = $1 AND contact_id = $2",
      )
      .bind(linkedin.id)
      .bind(contact_a_id)
      .fetch_one(db)
      .await
      .unwrap();
      assert_eq!(
        fail_contact, contact_a_id,
        "linkedin_action_failures should reference contact_a"
      );

      // linkedin_messages: sender should be contact_a
      let msg_sender: Id<Contact> =
        sqlx::query_scalar("SELECT sender_contact_id FROM linkedin_messages WHERE conversation_id = $1")
          .bind(conv.id)
          .fetch_one(db)
          .await
          .unwrap();
      assert_eq!(msg_sender, contact_a_id, "linkedin_messages sender should be contact_a");

      // linkedin_conversations: participant array should have only contact_a (deduped)
      let participants: Vec<Id<Contact>> =
        sqlx::query_scalar("SELECT unnest(participant_contact_ids) FROM linkedin_conversations WHERE id = $1")
          .bind(conv.id)
          .fetch_all(db)
          .await
          .unwrap();
      assert_eq!(
        participants,
        vec![contact_a_id],
        "Conversation participants should have only contact_a"
      );

      // Merged contact should have contact_b's title
      let title: Option<String> = sqlx::query_scalar("SELECT title FROM contact WHERE id = $1")
        .bind(contact_a_id)
        .fetch_one(db)
        .await
        .unwrap();
      assert_eq!(
        title.as_deref(),
        Some("Engineer"),
        "Merged contact should have contact_b's title"
      );

      // contact_b should be deleted
      let b_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM contact WHERE id = $1")
        .bind(contact_b_id)
        .fetch_one(db)
        .await
        .unwrap();
      assert_eq!(b_count, 0, "contact_b should be deleted after merge");
    });
  }
}
