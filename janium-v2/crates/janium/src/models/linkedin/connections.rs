use crate::models::campaign::{Campaign, ConnectionEstablished};
use crate::prelude::*;
use crate::types::Date;
use futures::StreamExt;

/// A LinkedIn connection scraped from the connections list.
/// Represents a 1st-degree connection for a LinkedIn account.
#[derive(Debug, Clone, Model, gql::SimpleObject)]
#[ormlite(table = "linkedin_connections")]
pub struct LinkedInConnection {
  #[ormlite(primary_key)]
  pub id: Id<LinkedInConnection>,
  pub linkedin_id: Id<LinkedIn>,
  pub contact_id: Id<Contact>,
  pub connected_on: Option<Date>,
  pub first_seen: Timestamp,
  pub last_seen: Timestamp,
  // This is set to true when we do a full sync and the connection is no longer present.
  pub disconnected: bool,
}

impl LinkedInConnection {
  /// Create a new connection from scraped data.
  pub fn new(linkedin_id: Id<LinkedIn>, contact_id: Id<Contact>, connected_on: Option<Date>) -> Self {
    let now = Timestamp::now();
    Self {
      id: Id::new(),
      linkedin_id,
      contact_id,
      connected_on,
      first_seen: now,
      last_seen: now,
      disconnected: false,
    }
  }

  /// Upsert a connection — inserts if new, updates last_seen and connected_on if exists.
  pub async fn save(self, db: &mut sqlx::PgConnection) -> Result<Self> {
    sqlx::query_as::<_, LinkedInConnection>(
      "INSERT INTO linkedin_connections (id, linkedin_id, contact_id, connected_on, first_seen, last_seen, disconnected)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (linkedin_id, contact_id) DO UPDATE SET
         last_seen = EXCLUDED.last_seen,
         connected_on = COALESCE(EXCLUDED.connected_on, linkedin_connections.connected_on),
         disconnected = false
       RETURNING *",
    )
    .bind(self.id)
    .bind(self.linkedin_id)
    .bind(self.contact_id)
    .bind(self.connected_on)
    .bind(self.first_seen)
    .bind(self.last_seen)
    .bind(self.disconnected)
    .fetch_one(&mut *db)
    .await
    .map_err(|e| e.into())
  }

  pub async fn save_many(this: Vec<Self>, db: &mut sqlx::PgConnection) -> Result<Vec<Self>> {
    match this.len() {
      0 => return Ok(Vec::new()),
      1 => return this.into_iter().next().unwrap().save(db).await.map(|c| vec![c]),
      _ => {}
    }
    sqlx::query_as::<_, LinkedInConnection>(
      "INSERT INTO linkedin_connections (id, linkedin_id, contact_id, connected_on, first_seen, last_seen, disconnected)
       SELECT * FROM UNNEST ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (linkedin_id, contact_id) DO UPDATE SET
         last_seen = EXCLUDED.last_seen,
         connected_on = COALESCE(EXCLUDED.connected_on, linkedin_connections.connected_on),
         disconnected = EXCLUDED.disconnected
       RETURNING *",
    )
    .bind(this.iter().map(|c| c.id).collect::<Vec<_>>())
    .bind(this.iter().map(|c| c.linkedin_id).collect::<Vec<_>>())
    .bind(this.iter().map(|c| c.contact_id).collect::<Vec<_>>())
    .bind(this.iter().map(|c| c.connected_on).collect::<Vec<_>>())
    .bind(this.iter().map(|c| c.first_seen).collect::<Vec<_>>())
    .bind(this.iter().map(|c| c.last_seen).collect::<Vec<_>>())
    .bind(this.iter().map(|c| c.disconnected).collect::<Vec<_>>())
    .fetch_all(&mut *db)
    .await
    .map_err(|e| e.into())
  }

  pub async fn get_all_for_linkedin(linkedin_id: Id<LinkedIn>, db: &sqlx::PgPool) -> Result<Vec<LinkedInConnection>> {
    sqlx::query_as::<_, LinkedInConnection>("SELECT * FROM linkedin_connections WHERE linkedin_id = $1")
      .bind(linkedin_id)
      .fetch_all(db)
      .await
      .map_err(|e| e.into())
  }

  /// Count total connections for a LinkedIn account.
  pub async fn count(linkedin_id: Id<LinkedIn>, db: &sqlx::PgPool) -> Result<i64> {
    sqlx::query_scalar("SELECT COUNT(*) FROM linkedin_connections WHERE linkedin_id = $1")
      .bind(linkedin_id)
      .fetch_one(db)
      .await
      .map_err(Into::into)
  }

  /// Get all known profile URLs for a LinkedIn account.
  /// Used for Recent sync to detect when we've hit already-scraped connections.
  #[expect(dead_code)]
  pub async fn connection_contact_ids(
    linkedin_id: Id<LinkedIn>,
    db: &sqlx::PgPool,
  ) -> Result<std::collections::HashSet<Id<Contact>>> {
    let mut contacts = std::collections::HashSet::new();
    let mut rows = sqlx::query_scalar("SELECT contact_id FROM linkedin_connections WHERE linkedin_id = $1")
      .bind(linkedin_id)
      .fetch(db);
    while let Some(contact_id) = rows.next().await {
      contacts.insert(contact_id?);
    }
    Ok(contacts)
  }

  pub async fn connection_contact_li_profile_handle(
    linkedin_id: Id<LinkedIn>,
    db: &sqlx::PgPool,
  ) -> Result<Vec<(Id<Contact>, String)>> {
    sqlx::query_as::<_, (Id<Contact>, String)>(
      "SELECT lc.contact_id, c.li_profile_url
    FROM linkedin_connections lc
      INNER JOIN contact c
        ON lc.contact_id = c.id
    WHERE lc.linkedin_id = $1
      AND c.li_profile_url IS NOT NULL",
    )
    .bind(linkedin_id)
    .fetch_all(db)
    .await
    .map_err(|e| e.into())
  }

  /// Notify campaigns that a connection has been established.
  /// This queries for campaigns with this contact in WaitingForContact status
  /// and sends ConnectionEstablished messages to transition them forward.
  pub async fn notify_campaigns_of_connections(
    linkedin_id: Id<LinkedIn>,
    contact_ids: &[Id<Contact>],
    db: &sqlx::PgPool,
    router: &Router,
  ) -> Result<()> {
    // Query for campaigns with this contact in WaitingForContact status
    let affected_campaign_ids = sqlx::query_as::<_, (Id<Campaign>, Id<Contact>)>(
      "SELECT campaign_id, contact_id
      FROM campaign_contact
      WHERE contact_id = ANY($1)
        AND linkedin_id = $2",
    )
    .bind(contact_ids)
    .bind(linkedin_id)
    .fetch_all(db)
    .await?;

    let mut campaign_map = HashMap::new();

    for (campaign_id, contact_id) in affected_campaign_ids {
      campaign_map
        .entry(campaign_id)
        .or_insert_with(Vec::new)
        .push(contact_id);
    }

    for (campaign_id, contact_ids) in campaign_map {
      if let Ok(handle) = router.get_handle::<Campaign>(&campaign_id) {
        handle
          .notify(ConnectionEstablished {
            linkedin_id,
            contact_ids,
          })
          .await
          .ok();
      }
    }
    Ok(())
  }
}
