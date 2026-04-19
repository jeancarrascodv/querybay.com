use crate::{
  prelude::*,
  service_cache::{Cacheable, ServiceCache},
};
use compact_str::{CompactString as String, ToCompactString};
use std::collections::BTreeMap;

#[derive(Debug, Clone, ormlite::Model, Serialize)]
pub struct EmailGroupRelation {
  pub id: Id<EmailGroupRelation>,
  pub email_group_id: Id<EmailGroup>,
  pub email: String,
}

#[derive(Debug, Clone, Hash, ormlite::Model, Serialize)]
pub struct EmailGroup {
  #[ormlite(primary_key)]
  pub id: Id<EmailGroup>,
  pub team_id: Id<Team>,
  pub name: String,
  #[ormlite(skip)]
  pub emails: BTreeMap<String, Id<EmailGroupRelation>>,
}

impl EmailGroup {
  pub fn remove_email(&mut self, email: &str) {
    let email = email.to_compact_string();
    self.emails.remove(&email);
  }
  #[allow(clippy::unwrap_or_default)]
  pub fn add_email(&mut self, email: String) {
    self.emails.entry(email).or_insert_with(Id::new);
  }
}

#[gql::Object]
impl EmailGroup {
  pub async fn id(&self) -> Id<EmailGroup> {
    self.id
  }
  pub async fn name(&self) -> &str {
    &self.name
  }
  pub async fn emails(&self) -> Vec<&str> {
    self.emails.keys().map(|s| s.as_str()).collect()
  }
}

pub type EmailGroupService = ServiceCache<EmailGroup>;

impl Cacheable for EmailGroup {
  type Key = Id<EmailGroup>;
  type Storage = Arc<EmailGroup>;

  fn key(&self) -> Self::Key {
    self.id
  }

  async fn save(mut self, transaction: &mut sqlx::PgConnection, _router: &janium_actors::Router) -> Result<Self> {
    // let this = Self::load_one(self.id, &mut *transaction).await?;

    let mut existing_relations = EmailGroupRelation::select()
      .where_bind("email_group_id = ?", &self.id)
      .fetch_all(&mut *transaction)
      .await?;
    existing_relations.retain(|r| !self.emails.contains_key(&r.email));
    let relations = std::mem::take(&mut self.emails)
      .into_iter()
      .map(|(email, id)| EmailGroupRelation {
        id,
        email_group_id: self.id,
        email,
      })
      .collect::<Vec<_>>();
    for e in existing_relations {
      e.delete(&mut *transaction).await?;
    }
    EmailGroupRelation::insert_many(relations, &mut *transaction).await?;

    let this = self.insert(transaction).await?;
    Ok(this)
  }
  async fn load_many(
    keys: impl IntoIterator<Item = Id<EmailGroup>> + Send,
    db: &mut sqlx::PgConnection,
  ) -> Result<Vec<Self>> {
    let mut groups = Self::select();
    let mut relations = EmailGroupRelation::select();
    let keys = keys.into_iter().collect::<Vec<_>>();
    if !keys.is_empty() {
      groups = groups.where_bind("id IN (select * from unnest(?))", &keys);
      relations = relations.where_bind("email_group_id IN (select * from unnest(?))", &keys);
    }
    let mut groups = groups.fetch_all(&mut *db).await?;
    let mut relations = relations.fetch_all(&mut *db).await?;
    groups.sort_by_key(|g| g.id);
    relations.sort_by(|l, r| {
      l.email_group_id
        .cmp(&r.email_group_id)
        .then_with(|| l.email.cmp(&r.email))
    });
    let mut r = relations.into_iter().peekable();
    for group in &mut groups {
      while let Some(relation) = r.peek() {
        if relation.email_group_id != group.id {
          break;
        }
        let relation = r.next().unwrap();
        group.emails.insert(relation.email, relation.id);
      }
    }
    Ok(groups)
  }

  async fn delete(key: Self::Key, transaction: &mut sqlx::PgConnection) -> Result<()> {
    sqlx::query("DELETE FROM email_group_relation WHERE email_group_id = $1")
      .bind(key)
      .execute(&mut *transaction)
      .await?;
    sqlx::query("DELETE FROM email_group WHERE id = $1")
      .bind(key)
      .execute(&mut *transaction)
      .await?;
    Ok(())
  }
}
