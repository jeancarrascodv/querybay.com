use crate::{
  prelude::*,
  service_cache::{Cacheable, ServiceCache},
};

pub type InviteService = ServiceCache<Invite>;

#[derive(Debug, Clone, ormlite::Model, gql::SimpleObject)]
#[graphql(complex)]
#[ormlite(table = "invite")]
pub struct Invite {
  #[ormlite(primary_key)]
  pub code: String,
  pub email: String,
  pub team_id: Id<Team>,
  pub privileges: Privileges,
  pub created_at: Timestamp,
  #[graphql(name = "createdById")]
  pub created_by: Id<User>,
  // TODO: clean up expired invites
  pub expires_at: Timestamp,
}

#[gql::ComplexObject]
impl Invite {
  #[graphql(name = "createdBy")]
  pub async fn created_by_user(&self, ctx: &gql::Context<'_>) -> Result<Option<Arc<User>>> {
    ctx
      .data_unchecked::<AppState>()
      .user_service
      .get_user_by_id(self.created_by)
      .await
  }
  #[graphql(name = "team")]
  pub async fn team(&self, ctx: &gql::Context<'_>) -> Result<Team> {
    let app_state = ctx.data_unchecked::<AppState>();
    app_state
      .router
      .get_handle::<Team>(&self.team_id)?
      .send(super::Query::new(|team: &Team, _, _| team.clone()))
      .await
      .map_err(Into::into)
  }
}

impl core::hash::Hash for Invite {
  fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
    self.code.hash(state);
  }
}

impl PartialEq for Invite {
  fn eq(&self, other: &Self) -> bool {
    self.code == other.code
  }
}

impl Cacheable for Invite {
  type Key = String;
  type Storage = crate::service_cache::Naked<Invite>;
  fn key(&self) -> Self::Key {
    self.code.clone()
  }

  async fn save(self, transaction: &mut sqlx::PgConnection, _router: &janium_actors::Router) -> Result<Self> {
    let this = self.insert(transaction).await?;
    Ok(this)
  }

  async fn load_many(
    keys: impl IntoIterator<Item = Self::Key> + Send,
    db: &mut sqlx::PgConnection,
  ) -> Result<Vec<Self>> {
    let keys: Vec<String> = keys.into_iter().collect();
    let query = if keys.is_empty() {
      sqlx::query_as::<_, Invite>("SELECT * FROM invite")
    } else {
      sqlx::query_as::<_, Invite>("SELECT * FROM invite WHERE code = ANY($1)").bind(keys)
    };
    let invites = query.fetch_all(db).await?;
    Ok(invites)
  }

  async fn delete(key: Self::Key, transaction: &mut sqlx::PgConnection) -> Result<()> {
    sqlx::query("DELETE FROM invite WHERE code = $1")
      .bind(key)
      .execute(transaction)
      .await?;
    Ok(())
  }
}

#[derive(Debug, gql::InputObject)]
pub struct CreateInvite {
  pub email: String,
  pub privileges: Privileges,
}
