use crate::prelude::*;

/// A single LinkedIn message scraped from the messaging inbox.
#[derive(Debug, Clone, Model, gql::SimpleObject)]
#[ormlite(table = "linkedin_messages")]
#[graphql(complex)]
pub struct LinkedInMessage {
  #[ormlite(primary_key)]
  pub id: Id<LinkedInMessage>,
  pub conversation_id: Id<LinkedInConversation>,
  pub sender_contact_id: Id<Contact>,
  pub content: String,
  pub timestamp: Option<Timestamp>,
  #[graphql(skip)]
  pub message_hash: Vec<u8>,
  pub created_at: Timestamp,
}

#[gql::ComplexObject]
impl LinkedInMessage {
  pub async fn sender_contact(&self, context: &gql::Context<'_>) -> Result<Option<Arc<Contact>>> {
    let app_state = context.data_unchecked::<AppState>();
    app_state.contact_service.get(&self.sender_contact_id).await
  }
}

/// A LinkedIn conversation thread with participants and aggregate metadata.
#[derive(Debug, Clone, Model, gql::SimpleObject)]
#[ormlite(table = "linkedin_conversations")]
#[graphql(complex)]
pub struct LinkedInConversation {
  #[ormlite(primary_key)]
  pub id: Id<LinkedInConversation>,
  pub linkedin_id: Id<LinkedIn>,
  pub team_id: Id<Team>,
  pub linkedin_conversation_id: String,
  #[graphql(skip)]
  pub participant_contact_ids: IdSet<Contact>,
  pub last_message_at: Option<Timestamp>,
  pub message_count: i64,
  pub is_read: bool,
  pub last_message_preview: Option<String>,
  pub created_at: Timestamp,
  /// Pre-loaded messages, populated when the GraphQL client requests them.
  #[ormlite(skip)]
  pub messages: Vec<LinkedInMessage>,
}

#[gql::ComplexObject]
impl LinkedInConversation {
  /// The other participants in this conversation (excludes the LinkedIn account owner).
  pub async fn contacts(&self, context: &gql::Context<'_>) -> Result<Vec<Arc<Contact>>> {
    let app_state = context.data_unchecked::<AppState>();
    let mut contacts = Vec::with_capacity(self.participant_contact_ids.len());
    for id in &self.participant_contact_ids {
      if let Some(c) = app_state.contact_service.get(id).await? {
        contacts.push(c);
      }
    }
    Ok(contacts)
  }
}

impl LinkedInConversation {
  /// Create a minimal conversation for upserting. Fields like `participant_contact_ids`
  /// and `is_read` can be set on the returned value before calling `upsert()`.
  pub fn for_upsert(linkedin_id: Id<LinkedIn>, team_id: Id<Team>, linkedin_conversation_id: &str) -> Self {
    Self {
      id: Id::new(),
      linkedin_id,
      team_id,
      linkedin_conversation_id: linkedin_conversation_id.to_string(),
      participant_contact_ids: IdSet::default(),
      last_message_at: None,
      message_count: 0,
      is_read: false,
      last_message_preview: None,
      created_at: Timestamp::now(),
      messages: vec![],
    }
  }

  /// Upsert a conversation record. Returns the full conversation row (including
  /// existing `participant_contact_ids`) so callers can merge new participants
  /// with previously known ones.
  ///
  /// Call once before inserting messages (creates the record), and again after
  /// with the merged participant list to refresh aggregates.
  pub async fn upsert(&mut self, db: &sqlx::PgPool) -> Result<Self> {
    // CTE computes aggregates from existing messages (returns zeros for new conversations),
    // then the main INSERT uses those values directly in the upsert.
    let this: Self = sqlx::query_as(
      "WITH conv AS (
         SELECT id FROM linkedin_conversations
         WHERE linkedin_id = $2 AND linkedin_conversation_id = $4
       ),
       agg AS (
         SELECT
           COUNT(m.id) AS message_count,
           MAX(m.timestamp) AS last_message_at,
           (SELECT content FROM linkedin_messages
            WHERE conversation_id = (SELECT id FROM conv)
            ORDER BY timestamp DESC NULLS LAST LIMIT 1
           ) AS last_message_preview
         FROM linkedin_messages m
         WHERE m.conversation_id = (SELECT id FROM conv)
       )
       INSERT INTO linkedin_conversations
         (id, linkedin_id, team_id, linkedin_conversation_id, participant_contact_ids,
          last_message_at, message_count, is_read, last_message_preview, created_at)
       SELECT $1, $2, $3, $4, $5,
              agg.last_message_at, agg.message_count, $7,
              agg.last_message_preview, $6
       FROM agg
       ON CONFLICT (linkedin_id, linkedin_conversation_id) DO UPDATE SET
         participant_contact_ids = EXCLUDED.participant_contact_ids,
         last_message_at = EXCLUDED.last_message_at,
         message_count = EXCLUDED.message_count,
         is_read = EXCLUDED.is_read,
         last_message_preview = EXCLUDED.last_message_preview
       RETURNING *",
    )
    .bind(self.id)
    .bind(self.linkedin_id)
    .bind(self.team_id)
    .bind(&self.linkedin_conversation_id)
    .bind(&self.participant_contact_ids)
    .bind(Timestamp::now())
    .bind(self.is_read)
    .fetch_one(db)
    .await?;

    Ok(this)
  }

  /// Get all known message hashes for this conversation, used for stop-when-known logic.
  pub async fn known_hashes(&self, db: &sqlx::PgPool) -> Result<std::collections::HashSet<[u8; 32]>> {
    let mut hashes = std::collections::HashSet::new();
    let mut rows =
      sqlx::query_scalar::<_, [u8; 32]>("SELECT message_hash FROM linkedin_messages WHERE conversation_id = $1")
        .bind(self.id)
        .fetch(db);
    use futures::StreamExt;
    while let Some(hash) = rows.next().await {
      hashes.insert(hash?);
    }
    Ok(hashes)
  }
}

impl LinkedInMessage {
  /// Create a new message from scraped data.
  pub fn new(
    conversation_id: Id<LinkedInConversation>,
    sender_contact_id: Id<Contact>,
    content: String,
    timestamp: Option<Timestamp>,
    message_hash: [u8; 32],
  ) -> Self {
    Self {
      id: Id::new(),
      conversation_id,
      sender_contact_id,
      content,
      timestamp,
      message_hash: message_hash.to_vec(),
      created_at: Timestamp::now(),
    }
  }

  /// Upsert a message — inserts if new, updates if the hash already exists for this conversation.
  /// Preserves the existing row's `id` on conflict so frontend references remain stable.
  pub async fn save(self, db: &mut sqlx::PgConnection) -> Result<Self> {
    sqlx::query_as(
      "INSERT INTO linkedin_messages (id, conversation_id, sender_contact_id, content, timestamp, message_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (conversation_id, message_hash) DO UPDATE SET
         sender_contact_id = EXCLUDED.sender_contact_id,
         content = EXCLUDED.content,
         timestamp = EXCLUDED.timestamp
       RETURNING *",
    )
    .bind(self.id)
    .bind(self.conversation_id)
    .bind(self.sender_contact_id)
    .bind(&self.content)
    .bind(self.timestamp)
    .bind(&self.message_hash)
    .bind(self.created_at)
    .fetch_one(db)
    .await
    .map_err(|e| e.into())
  }

  /// Check if a message with this hash already exists for this conversation.
  pub async fn exists(
    conversation_id: Id<LinkedInConversation>,
    message_hash: &[u8],
    db: &sqlx::PgPool,
  ) -> Result<bool> {
    let count: i64 =
      sqlx::query_scalar("SELECT COUNT(*) FROM linkedin_messages WHERE conversation_id = $1 AND message_hash = $2")
        .bind(conversation_id)
        .bind(message_hash)
        .fetch_one(db)
        .await?;
    Ok(count > 0)
  }
}

#[cfg(test)]
mod tests {
  use crate::prelude::*;

  /// Helper: get linkedin_id and team_id from test data.
  async fn get_test_linkedin(db: &sqlx::PgPool) -> (Id<LinkedIn>, Id<Team>) {
    let (lid, tid): (Id<LinkedIn>, Id<Team>) = sqlx::query_as("SELECT id, team_id FROM linked_in LIMIT 1")
      .fetch_one(db)
      .await
      .unwrap();
    (lid, tid)
  }

  /// Helper: create a test contact and return its ID.
  async fn create_test_contact(db: &sqlx::PgPool, name: &str) -> Id<Contact> {
    let id = Id::<Contact>::new();
    sqlx::query("INSERT INTO contact (id, full_name) VALUES ($1, $2)")
      .bind(id)
      .bind(name)
      .execute(db)
      .await
      .unwrap();
    id
  }

  /// Helper: create a conversation via for_upsert + upsert and return it.
  async fn upsert_conv(
    linkedin_id: Id<LinkedIn>,
    team_id: Id<Team>,
    conv_id_str: &str,
    participants: impl IntoIterator<Item = Id<Contact>>,
    is_read: bool,
    db: &sqlx::PgPool,
  ) -> LinkedInConversation {
    let mut conv = LinkedInConversation::for_upsert(linkedin_id, team_id, conv_id_str);
    conv.participant_contact_ids = participants.into_iter().collect();
    conv.is_read = is_read;
    conv.upsert(db).await.unwrap()
  }

  #[test]
  fn test_upsert_creates_new_conversation() {
    crate::test::app_state_test(60, async |app_state| {
      let db = &app_state.db;
      let (linkedin_id, team_id) = get_test_linkedin(db).await;
      let contact_id = create_test_contact(db, "Participant").await;

      let conv = upsert_conv(linkedin_id, team_id, "conv-new-1", [contact_id], false, db).await;

      assert_eq!(conv.linkedin_id, linkedin_id);
      assert_eq!(conv.team_id, team_id);
      assert_eq!(conv.linkedin_conversation_id, "conv-new-1");
      assert!(conv.participant_contact_ids.contains(&contact_id));
      assert_eq!(conv.participant_contact_ids.len(), 1);
      assert_eq!(conv.message_count, 0);
      assert!(!conv.is_read);
      assert!(conv.last_message_at.is_none());
      assert!(conv.last_message_preview.is_none());
    });
  }

  #[test]
  fn test_upsert_returns_same_id_and_updates_participants() {
    crate::test::app_state_test(60, async |app_state| {
      let db = &app_state.db;
      let (linkedin_id, team_id) = get_test_linkedin(db).await;
      let contact_a = create_test_contact(db, "A").await;
      let contact_b = create_test_contact(db, "B").await;

      // First upsert — creates conversation
      let conv1 = upsert_conv(linkedin_id, team_id, "conv-dup", [contact_a], false, db).await;

      // Second upsert — same conversation, updated participants
      let conv2 = upsert_conv(linkedin_id, team_id, "conv-dup", [contact_a, contact_b], true, db).await;

      assert_eq!(conv1.id, conv2.id, "Upsert should return the same conversation ID");
      assert!(conv2.participant_contact_ids.contains(&contact_a));
      assert!(conv2.participant_contact_ids.contains(&contact_b));
      assert_eq!(conv2.participant_contact_ids.len(), 2);
    });
  }

  #[test]
  fn test_upsert_refreshes_aggregates_after_messages() {
    crate::test::app_state_test(60, async |app_state| {
      let db = &app_state.db;
      let (linkedin_id, team_id) = get_test_linkedin(db).await;
      let sender = create_test_contact(db, "Sender").await;

      // Create conversation
      let conv = upsert_conv(linkedin_id, team_id, "conv-agg", [], false, db).await;

      // Insert messages
      let ts1 = Timestamp::now() - 2.hours();
      let ts2 = Timestamp::now();
      LinkedInMessage::new(conv.id, sender, "first".to_string(), Some(ts1), [1u8; 32])
        .save(&mut db.acquire().await.unwrap())
        .await
        .unwrap();
      LinkedInMessage::new(conv.id, sender, "second (unread)".to_string(), Some(ts2), [2u8; 32])
        .save(&mut db.acquire().await.unwrap())
        .await
        .unwrap();

      // Re-upsert to refresh aggregates
      let conv = upsert_conv(linkedin_id, team_id, "conv-agg", [sender], true, db).await;

      assert_eq!(conv.message_count, 2);
      assert!(conv.is_read);
      assert_eq!(conv.last_message_preview.as_deref(), Some("second (unread)"));
      assert!(conv.last_message_at.is_some());
    });
  }

  #[test]
  fn test_message_save_inserts_new() {
    crate::test::app_state_test(60, async |app_state| {
      let db = &app_state.db;
      let (linkedin_id, team_id) = get_test_linkedin(db).await;
      let sender = create_test_contact(db, "Sender").await;
      let conv = upsert_conv(linkedin_id, team_id, "conv-save", [], false, db).await;

      let hash = [42u8; 32];
      let msg = LinkedInMessage::new(conv.id, sender, "hello".to_string(), None, hash);
      let saved = msg.save(&mut db.acquire().await.unwrap()).await.unwrap();

      assert_eq!(saved.content, "hello");
      assert_eq!(saved.conversation_id, conv.id);
      assert_eq!(saved.sender_contact_id, sender);
      assert_eq!(saved.message_hash, hash.to_vec());
    });
  }

  #[test]
  fn test_message_save_upserts_on_duplicate_hash() {
    crate::test::app_state_test(60, async |app_state| {
      let db = &app_state.db;
      let (linkedin_id, team_id) = get_test_linkedin(db).await;
      let sender = create_test_contact(db, "Sender").await;
      let conv = upsert_conv(linkedin_id, team_id, "conv-dedup", [], false, db).await;

      let hash = [99u8; 32];
      // Insert original
      LinkedInMessage::new(conv.id, sender, "original".to_string(), None, hash)
        .save(&mut db.acquire().await.unwrap())
        .await
        .unwrap();

      // Upsert with same conversation + hash — should update, not create duplicate
      let updated = LinkedInMessage::new(conv.id, sender, "updated".to_string(), None, hash)
        .save(&mut db.acquire().await.unwrap())
        .await
        .unwrap();

      assert_eq!(updated.content, "updated");

      // Verify only one message exists
      let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM linkedin_messages WHERE conversation_id = $1")
        .bind(conv.id)
        .fetch_one(db)
        .await
        .unwrap();
      assert_eq!(count, 1);
    });
  }

  #[test]
  fn test_message_exists() {
    crate::test::app_state_test(60, async |app_state| {
      let db = &app_state.db;
      let (linkedin_id, team_id) = get_test_linkedin(db).await;
      let sender = create_test_contact(db, "Sender").await;
      let conv = upsert_conv(linkedin_id, team_id, "conv-exists", [], false, db).await;

      let hash = [77u8; 32];

      // Should not exist yet
      assert!(!LinkedInMessage::exists(conv.id, &hash, db).await.unwrap());

      // Insert it
      LinkedInMessage::new(conv.id, sender, "msg".to_string(), None, hash)
        .save(&mut db.acquire().await.unwrap())
        .await
        .unwrap();

      // Should exist now
      assert!(LinkedInMessage::exists(conv.id, &hash, db).await.unwrap());

      // Different hash should not exist
      assert!(!LinkedInMessage::exists(conv.id, &[88u8; 32], db).await.unwrap());
    });
  }

  #[test]
  fn test_known_hashes() {
    crate::test::app_state_test(60, async |app_state| {
      let db = &app_state.db;
      let (linkedin_id, team_id) = get_test_linkedin(db).await;
      let sender = create_test_contact(db, "Sender").await;
      let conv = upsert_conv(linkedin_id, team_id, "conv-hashes", [], false, db).await;

      // Empty conversation — no hashes
      let hashes = conv.known_hashes(db).await.unwrap();
      assert!(hashes.is_empty());

      // Insert two messages
      let hash_a = [10u8; 32];
      let hash_b = [20u8; 32];
      LinkedInMessage::new(conv.id, sender, "a".to_string(), None, hash_a)
        .save(&mut db.acquire().await.unwrap())
        .await
        .unwrap();
      LinkedInMessage::new(conv.id, sender, "b".to_string(), None, hash_b)
        .save(&mut db.acquire().await.unwrap())
        .await
        .unwrap();

      let hashes = conv.known_hashes(db).await.unwrap();
      assert_eq!(hashes.len(), 2);
      assert!(hashes.contains(&hash_a));
      assert!(hashes.contains(&hash_b));

      // Different conversation should have no hashes
      let other_conv = upsert_conv(linkedin_id, team_id, "conv-other", [], false, db).await;
      let other_hashes = other_conv.known_hashes(db).await.unwrap();
      assert!(other_hashes.is_empty());
    });
  }
}
