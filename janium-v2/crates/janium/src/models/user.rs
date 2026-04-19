use crate::models::Privileges;
use crate::prelude::*;
use crate::service_cache::{Cacheable, ServiceCache, ServiceCacheBiMap};
use argon2::password_hash::{SaltString, rand_core::OsRng};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use base64ct::Encoding;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub use invite::*;
pub use user_team_map::*;

mod invite;
mod user_team_map;

#[derive(Debug, Clone, Serialize, Deserialize, ormlite::Model, gql::SimpleObject, gql::InputObject, Hash)]
#[ormlite(table = "user")]
pub struct User {
  #[ormlite(primary_key)]
  pub id: Id<User>,
  pub default_team_id: Id<Team>,
  pub first_name: String,
  pub last_name: String,
  pub title: String,
  pub company: String,
  pub email: String,
  #[graphql(skip)]
  #[serde(skip_serializing)]
  pub password_hash: String,
  // TODO: when allowing mutations here, make sure to not just overwrite it, but to set it.
  pub timezone: ArcSwap<TimeZone>,
  pub is_active: bool,
  pub email_verified: bool,
  pub created_at: Timestamp,
  pub updated_at: Timestamp,
}

type TokenHash = [u8; 32];

#[derive(Debug, Clone, Serialize, Deserialize, ormlite::Model)]
#[ormlite(table = "refresh_token")]
pub struct RefreshToken {
  #[ormlite(primary_key)]
  #[serde(skip_serializing)]
  pub token_hash: TokenHash,
  pub user_id: Id<User>,
  pub expires_at: Timestamp,
  pub created_at: Timestamp,
}

#[derive(Debug, Clone, Serialize, Deserialize, ormlite::Model, gql::SimpleObject, gql::InputObject)]
#[ormlite(table = "api_key")]
pub struct ApiKey {
  #[ormlite(primary_key)]
  #[serde(skip_serializing)]
  pub key_hash: TokenHash,
  pub user_id: Id<User>,
  pub team_id: Id<Team>,
  pub name: String,
  pub key_prefix: String,
  pub permissions: Privileges,
  pub expires_at: Timestamp,
  pub last_used_at: Timestamp,
  pub created_at: Timestamp,
}

// JWT Claims
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
  #[serde(rename = "sub")]
  pub user_id: Id<User>,
  #[serde(rename = "tid")]
  pub team_id: Id<Team>,
  #[serde(
    with = "privileges::serde_bits",
    rename = "p",
    skip_serializing_if = "Privileges::is_empty",
    default = "Privileges::empty"
  )]
  pub privileges: Privileges,
  #[serde(rename = "tt")]
  pub token_type: TokenType,
  #[serde(rename = "exp", with = "crate::types::timestamp_second")]
  pub expires_at: Timestamp,
  #[serde(rename = "iat", with = "crate::types::timestamp_second")]
  pub issued_at: Timestamp,
  // Acts like a nonce
  #[serde(rename = "cat", with = "crate::types::timestamp_second")]
  pub created_at: Timestamp,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum TokenType {
  Access,
  Refresh,
  ApiKey,
}

// Authentication request/response types
#[derive(Debug, Serialize, Deserialize, gql::InputObject)]
pub struct LoginRequest {
  pub email: String,
  pub password: String,
  pub team_id: Option<Id<Team>>,
}

#[derive(Debug, Serialize, Deserialize, gql::SimpleObject)]
pub struct AuthResponse {
  pub access_token: String,
  pub refresh_token: String,
  pub token_type: String,
  pub expires_in: u64,
  pub user: UserInfo,
}

#[derive(Debug, Serialize, Deserialize, gql::SimpleObject)]
pub struct UserInfo {
  pub id: Id<User>,
  pub team_id: Id<Team>,
  pub privileges: Vec<Privilege>,
  pub email: String,
  pub first_name: String,
  pub last_name: String,
  pub title: String,
  pub company: String,
  pub timezone: ArcSwap<TimeZone>,
}

#[derive(Debug, Serialize, Deserialize, gql::InputObject)]
pub struct RefreshTokenRequest {
  pub team_id: Option<Id<Team>>,
  pub logout: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, gql::InputObject)]
pub struct CreateApiKeyRequest {
  pub name: String,
  pub team_id: Id<Team>,
  pub permissions: Privileges,
  pub expires_at: Option<Timestamp>,
}

#[derive(Debug, Serialize, Deserialize, gql::InputObject)]
pub struct RevokeApiKeyRequest {
  pub id: String,
}

#[derive(Debug, Serialize, Deserialize, gql::SimpleObject)]
pub struct ApiKeyResponse {
  pub id: String,
  pub name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub key: Option<String>, // Only returned on creation
  pub key_prefix: String,
  pub permissions: Privileges,
  pub expires_at: Timestamp,
  pub last_used_at: Timestamp,
  pub created_at: Timestamp,
}

impl From<ApiKey> for ApiKeyResponse {
  fn from(api_key: ApiKey) -> Self {
    use base64ct::{Base64Unpadded, Encoding};
    Self {
      id: Base64Unpadded::encode_string(&api_key.key_hash),
      name: api_key.name,
      key: None,
      key_prefix: api_key.key_prefix,
      permissions: api_key.permissions,
      expires_at: api_key.expires_at,
      last_used_at: api_key.last_used_at,
      created_at: api_key.created_at,
    }
  }
}

// User service for database operations
pub struct UserService {
  cache: ServiceCache<User>,
  pub user_team_map: ServiceCacheBiMap<UserTeamMap>,
  db: sqlx::postgres::PgPool,
  auth_config: crate::auth::AuthConfig,
  encoding_key: EncodingKey,
  decoding_key: DecodingKey,
}

impl UserService {
  pub async fn new(
    db: sqlx::postgres::PgPool,
    auth_config: crate::auth::AuthConfig,
    jwt_secret: String,
    router: janium_actors::Router,
  ) -> Result<Self> {
    let encoding_key = EncodingKey::from_secret(jwt_secret.as_ref());
    let decoding_key = DecodingKey::from_secret(jwt_secret.as_ref());
    drop(jwt_secret);
    let cache = ServiceCache::<User>::new(usize::MAX, db.clone(), router).await?;
    let user_team_map = ServiceCacheBiMap::<UserTeamMap>::new(usize::MAX, db.clone()).await?;
    Ok(Self {
      cache,
      user_team_map,
      db,
      auth_config,
      encoding_key,
      decoding_key,
    })
  }

  pub async fn create_user(
    &self,
    app_state: &AppState,
    params: crate::auth::SignupRequest,
    invite_code: String,
  ) -> Result<User> {
    let invite = app_state
      .invite_service
      .remove_from_cache_or_query(&invite_code)
      .await?
      .ok_or_else(|| JaniumError::not_found("invite code"))?
      .into_inner();
    if invite.email != params.email {
      return Err(JaniumError::ext_msg("Invite email does not match signup email"));
    }
    if invite.expires_at < Timestamp::now() {
      return Err(JaniumError::ext_msg("Invite has expired"));
    }
    let password_hash = Self::hash_password(&params.password)?;
    let user = User {
      id: Id::new(),
      default_team_id: invite.team_id,
      first_name: params.first_name,
      last_name: params.last_name,
      title: params.title,
      company: params.company,
      email: params.email,
      password_hash,
      timezone: params.timezone,
      is_active: true,
      email_verified: false,
      created_at: Timestamp::now(),
      updated_at: Timestamp::now(),
    };

    let team_map = UserTeamMap::new(user.id, invite.team_id, invite.privileges);
    let mut conn = self.db.begin().await?;
    invite.delete(&mut *conn).await?;
    let user = user.insert(&mut conn).await?;
    self.user_team_map.save(team_map, &mut conn).await?;
    app_state.invite_service.delete(&invite_code, &mut conn).await?;
    conn.commit().await?;
    Ok(user)
  }

  pub async fn get_user_by_email(&self, email: &str) -> Result<Option<Arc<User>>> {
    let users = self
      .cache
      .dynamic_load_many(async |db| {
        User::select()
          .where_bind("email = ?", email)
          .fetch_all(db)
          .await
          .map_err(Into::into)
      })
      .await?;
    Ok(users.into_iter().next())
  }

  pub async fn get_user_by_id(&self, id: Id<User>) -> Result<Option<Arc<User>>> {
    self.cache.get(&id).await
  }

  pub async fn expect_user_by_id(&self, id: Id<User>) -> Result<Arc<User>> {
    let user = self
      .get_user_by_id(id)
      .await?
      .ok_or_else(|| JaniumError::not_found(format_args!("User {id}")))?;
    Ok(user)
  }

  pub async fn verify_password(&self, user: &User, password: &str) -> Result<bool> {
    // Allow easy password setting / verification in debug mode
    #[cfg(debug_assertions)]
    if user.password_hash == password {
      return Ok(true);
    }
    let parsed_hash = PasswordHash::new(&user.password_hash).map_err(|e| {
      JaniumError::msg(format!(
        "Invalid password hash for user {} ({}): {}",
        user.email, user.id, e
      ))
    })?;

    Ok(
      Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok(),
    )
  }

  pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    let password_hash = argon2
      .hash_password(password.as_bytes(), &salt)
      .map_err(|e| JaniumError::msg(format!("Failed to hash password: {}", e)))?;

    Ok(password_hash.to_string())
  }

  pub async fn get_privileges(&self, user_id: Id<User>, team_id: Id<Team>) -> Result<Privileges> {
    let team_map = self
      .user_team_map
      .get_l(&user_id)
      .await?
      .ok_or_else(|| JaniumError::msg(format!("User {} not found", user_id)))?;
    let privileges = team_map
      .get(&team_id)
      .ok_or_else(|| JaniumError::msg(format!("Team {} not found", team_id)))?
      .get()
      .privileges;
    Ok(privileges)
  }

  pub fn hash_token(&self, token: &str) -> Result<TokenHash> {
    use tiny_keccak::Hasher;
    let mut sha3 = tiny_keccak::Sha3::v256();
    sha3.update(token.as_bytes());
    sha3.update(
      b"janium.ai-XLaBJ*3$tOAp*swd5%9*xfB62d1sOtn4D2WvPMbn*2WHAniqk@A&xrlCQNc%1XurY#PV0v^BrZ&onb%pyJZRe5x6GfNMFuyEwVu",
    );
    let mut token_hash = [0u8; 32];
    sha3.finalize(&mut token_hash);
    Ok(token_hash)
  }

  pub fn generate_access_token(&self, user_id: Id<User>, team_id: Id<Team>, privileges: Privileges) -> Result<String> {
    let now = Timestamp::now();
    let expires_at = now + std::time::Duration::from_secs(self.auth_config.access_token_expiry);

    let claims = Claims {
      user_id,
      team_id,
      privileges,
      token_type: TokenType::Access,
      expires_at,
      issued_at: now,
      created_at: now,
    };

    encode(&Header::default(), &claims, &self.encoding_key)
      .map_err(|e| JaniumError::msg(format!("Failed to encode JWT: {}", e)))
  }

  pub fn generate_refresh_token(&self, user: &User, team_id: Id<Team>, issued_at: Timestamp) -> Result<String> {
    let expires_at = issued_at + std::time::Duration::from_secs(self.auth_config.refresh_token_expiry);

    let claims = Claims {
      user_id: user.id,
      team_id,
      // These have to be looked up because they can be used across teams
      privileges: Privileges::empty(),
      token_type: TokenType::Refresh,
      expires_at,
      issued_at,
      created_at: Timestamp::now(),
    };

    encode(&Header::default(), &claims, &self.encoding_key)
      .map_err(|e| JaniumError::msg(format!("Failed to encode JWT: {}", e)))
  }

  pub fn verify_token(&self, token: &str, token_type: TokenType) -> Result<Claims> {
    let validation = Validation::new(Algorithm::default());

    let claims = decode::<Claims>(token, &self.decoding_key, &validation)
      .map_err(|_| JaniumError::ext_msg("Invalid token"))?
      .claims;

    if !(claims.token_type == token_type) {
      return Err(JaniumError::ext_msg(format!(
        "Invalid token type: {:?}, expected: {token_type:?}",
        claims.token_type
      )));
    }

    Ok(claims)
  }

  pub async fn create_refresh_token(
    &self,
    user_id: Id<User>,
    team_id: Id<Team>,
    issued_at: Timestamp,
  ) -> Result<String> {
    let user = self
      .get_user_by_id(user_id)
      .await?
      .ok_or_else(|| JaniumError::not_found(format_args!("User {user_id}")))?;
    let token = self.generate_refresh_token(&user, team_id, issued_at)?;

    let token_hash = self.hash_token(&token)?;
    let expires_at = issued_at + std::time::Duration::from_secs(self.auth_config.refresh_token_expiry);

    let refresh_token = RefreshToken {
      token_hash,
      user_id,
      expires_at,
      created_at: issued_at,
    };

    refresh_token.insert(&self.db).await?;
    Ok(token)
  }

  pub async fn verify_refresh_token(&self, token: &str) -> Result<Claims> {
    let claims = self.verify_token(token, TokenType::Refresh)?;
    let token_hash = self.hash_token(token)?;

    let refresh_token = RefreshToken::query("SELECT * FROM refresh_token WHERE token_hash = $1 AND expires_at > now()")
      .bind(token_hash)
      .fetch_optional(&self.db)
      .await?;

    let Some(refresh_token) = refresh_token else {
      return Err(JaniumError::ext_msg("Refresh token not found"));
    };

    // If verification works, this should be impossible to hit.
    if claims.user_id != refresh_token.user_id {
      return Err(JaniumError::ext_msg("Invalid refresh token user"));
    }

    Ok(claims)
  }

  pub async fn revoke_refresh_token(&self, token: &str) -> Result<()> {
    let token_hash = self.hash_token(token)?;
    let mut conn = self.db.acquire().await?;

    let deleted_token_hashes = sqlx::query_scalar::<_, Vec<u8>>(
      "DELETE FROM refresh_token WHERE token_hash = $1 or expires_at < now() returning token_hash",
    )
    .bind(token_hash)
    .fetch_all(&mut *conn)
    .await?;

    if !deleted_token_hashes.iter().any(|h| h == &token_hash) {
      return Err(JaniumError::msg("Invalid refresh token"));
    }

    Ok(())
  }

  pub async fn create_api_key(
    &self,
    user_id: Id<User>,
    team_id: Id<Team>,
    name: String,
    permissions: Privileges,
    expires_at: Timestamp,
  ) -> Result<ApiKeyResponse> {
    let key = format!("janium_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let key_hash = self.hash_token(&key)?;
    let key_prefix = key[7..15].to_string();

    let api_key = ApiKey {
      key_hash,
      user_id,
      team_id,
      name,
      key_prefix: key_prefix.clone(),
      permissions,
      expires_at,
      last_used_at: Timestamp::now(),
      created_at: Timestamp::now(),
    };

    let api_key = api_key.insert(&self.db).await?;

    let mut api_key_response = ApiKeyResponse::from(api_key);
    api_key_response.key = Some(key);
    Ok(api_key_response)
  }

  pub async fn verify_api_key(&self, key: &str) -> Result<Claims> {
    if !key.starts_with("janium_") {
      return Err(JaniumError::ext_msg("Invalid API key format"));
    }

    let key_hash = self.hash_token(key)?;
    let mut conn = self.db.acquire().await?;

    let api_key = sqlx::query_as::<_, ApiKey>("SELECT * FROM api_key WHERE key_hash = $1 AND expires_at > now()")
      .bind(key_hash)
      .fetch_optional(&mut *conn)
      .await?
      .ok_or_else(|| JaniumError::unauthorized())?;

    // Update last used timestamp
    sqlx::query("UPDATE api_key SET last_used_at = now() WHERE key_hash = $1")
      .bind(api_key.key_hash)
      .execute(&mut *conn)
      .await?;

    let user_privileges = self
      .user_team_map
      .get_l(&api_key.user_id)
      .await?
      .ok_or_else(|| JaniumError::not_found(format_args!("user privileges: {}", api_key.user_id)))?
      .get(&api_key.team_id)
      .ok_or_else(|| JaniumError::not_found(format_args!("user team privileges: {}", api_key.user_id)))?
      .get()
      .privileges;

    Ok(Claims {
      user_id: api_key.user_id,
      team_id: api_key.team_id,
      privileges: api_key.permissions.and(user_privileges),
      token_type: TokenType::ApiKey,
      expires_at: api_key.expires_at,
      issued_at: api_key.created_at,
      created_at: api_key.created_at,
    })
  }

  pub async fn list_user_api_keys(&self, user_id: Id<User>) -> Result<Vec<ApiKeyResponse>> {
    let mut conn = self.db.acquire().await?;
    let api_keys = sqlx::query_as::<_, ApiKey>("SELECT * FROM api_key WHERE user_id = $1 ORDER BY created_at DESC")
      .bind(user_id)
      .fetch_all(&mut *conn)
      .await?;

    Ok(api_keys.into_iter().map(Into::into).collect())
  }

  pub async fn revoke_api_key(&self, user_id: Id<User>, key_hash: &str) -> Result<()> {
    let mut conn = self.db.acquire().await?;
    let key_hash_bytes =
      base64ct::Base64Unpadded::decode_vec(key_hash).map_err(|_| JaniumError::not_found("Invalid API key hash"))?;
    let rows_affected = sqlx::query("DELETE FROM api_key WHERE key_hash = $1 AND user_id = $2")
      .bind(key_hash_bytes)
      .bind(user_id)
      .execute(&mut *conn)
      .await?
      .rows_affected();

    if rows_affected != 1 {
      return Err(JaniumError::ext_msg("Invalid API key"));
    }

    Ok(())
  }
}

impl Cacheable for User {
  type Key = Id<User>;
  type Storage = Arc<User>;

  fn key(&self) -> Self::Key {
    self.id
  }

  async fn save(self, transaction: &mut sqlx::PgConnection, _router: &janium_actors::Router) -> Result<Self> {
    self.insert(transaction).await.map_err(Into::into)
  }

  async fn load_many(
    keys: impl IntoIterator<Item = Self::Key> + Send,
    db: &mut sqlx::PgConnection,
  ) -> Result<Vec<Self>> {
    let keys = keys.into_iter().collect::<Vec<_>>();
    if keys.is_empty() {
      return Ok(vec![]);
    }

    let users = sqlx::query_as::<_, User>(r#"SELECT * FROM "user" WHERE id = ANY($1)"#)
      .bind(keys)
      .fetch_all(db)
      .await?;

    Ok(users)
  }
}

impl User {
  pub fn into_user_info(self, team_id: Id<Team>, privileges: Privileges) -> UserInfo {
    UserInfo {
      id: self.id,
      team_id,
      privileges: privileges.implied_privileges().collect(),
      email: self.email,
      first_name: self.first_name,
      last_name: self.last_name,
      title: self.title,
      company: self.company,
      timezone: self.timezone.clone(),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_hash_password() {
    let password_hash =
      "$argon2id$v=19$m=19456,t=2,p=1$vjrrNjx1ritBgBzFJqNO3w$zlcJh3/qIRu/ZnUgJ7btjGPRCmtUB/nVyJw7tG+9wD0";
    let password = "testpass";
    let password_hash = argon2::password_hash::PasswordHash::new(password_hash).unwrap();
    Argon2::default()
      .verify_password(password.as_bytes(), &password_hash)
      .unwrap();
  }
}
