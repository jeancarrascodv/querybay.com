use crate::{prelude::*, service_cache::CacheableBiMap};
use futures::TryStreamExt;

#[derive(Debug, Clone, ormlite::Model, Hash, PartialEq)]
#[ormlite(table = "user_team_map")]
pub struct UserTeamMap {
  #[ormlite(primary_key)]
  pub id: Id<UserTeamMap>,
  pub user_id: Id<User>,
  pub team_id: Id<Team>,
  pub privileges: Privileges,
  pub created_at: Timestamp,
}

impl UserTeamMap {
  pub fn new(user_id: Id<User>, team_id: Id<Team>, privileges: Privileges) -> Self {
    Self {
      id: Id::new(),
      user_id,
      team_id,
      privileges,
      created_at: Timestamp::now(),
    }
  }
}

#[derive(Debug, Clone, PartialEq)]
pub struct UserTeamValue {
  pub privileges: Privileges,
  pub id: Id<UserTeamMap>,
}

impl CacheableBiMap for UserTeamMap {
  type LKey = Id<User>;
  type RKey = Id<Team>;
  type Db = UserTeamMap;
  type CacheValue = UserTeamValue;
  fn lkey(db: &Self::Db) -> Self::LKey {
    db.user_id
  }
  fn rkey(db: &Self::Db) -> Self::RKey {
    db.team_id
  }
  fn cache_value(db: &Self::Db) -> Self::CacheValue {
    UserTeamValue {
      privileges: db.privileges,
      id: db.id,
    }
  }
  fn cache_value_owned(db: Self::Db) -> Self::CacheValue {
    UserTeamValue {
      privileges: db.privileges,
      id: db.id,
    }
  }
  async fn save(value: Self::Db, db: &mut sqlx::PgConnection) -> Result<Self::Db> {
    let value = value.insert(db).await?;
    Ok(value)
  }
  fn load_initial(limit: usize, db: &mut sqlx::PgConnection) -> impl futures::Stream<Item = Result<Self::Db>> + Send {
    sqlx::query_as::<_, UserTeamMap>("SELECT * FROM user_team_map limit $1")
      .bind(i64::try_from(limit).unwrap_or(i64::MAX))
      .fetch(db)
      .map_err(|e| JaniumError::from(e))
  }
  async fn l_load_one(key: &Self::LKey, db: &mut sqlx::PgConnection) -> Result<Vec<Self::Db>> {
    let values = sqlx::query_as::<_, UserTeamMap>("SELECT * FROM user_team_map WHERE user_id = $1")
      .bind(key)
      .fetch_all(db)
      .await?;
    Ok(values)
  }
  async fn r_load_one(key: &Self::RKey, db: &mut sqlx::PgConnection) -> Result<Vec<Self::Db>> {
    let values = sqlx::query_as::<_, UserTeamMap>("SELECT * FROM user_team_map WHERE team_id = $1")
      .bind(key)
      .fetch_all(db)
      .await?;
    Ok(values)
  }
  async fn delete(key: Self::Db, db: &mut sqlx::PgConnection) -> Result<()> {
    <UserTeamMap as ormlite::Model<sqlx::Postgres>>::delete(key, db).await?;
    Ok(())
  }
}
