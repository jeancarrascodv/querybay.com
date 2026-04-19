use std::borrow::Cow;

use crate::models::user::*;
use crate::prelude::*;
use axum::{
  Json,
  extract::{ConnectInfo, Request, State},
  http::{HeaderMap, StatusCode},
  middleware::Next,
  response::Response,
};
use serde_json::{Value, json};

tokio::task_local! {
  pub static CLAIMS: Claims;
}

pub static AUTH_COOKIE_NAME: &str = "janium_auth_token";
pub static REFRESH_COOKIE_NAME: &str = "janium_refresh_token";

fn create_cookie(app_state: &AppState, token_type: TokenType, value: String) -> tower_cookies::Cookie<'static> {
  let (name, expiry) = match token_type {
    TokenType::Access => (AUTH_COOKIE_NAME, Some(app_state.opts.auth_config.access_token_expiry)),
    TokenType::Refresh => (
      REFRESH_COOKIE_NAME,
      Some(app_state.opts.auth_config.refresh_token_expiry),
    ),
    TokenType::ApiKey => unreachable!(),
  };
  let mut cookie = tower_cookies::Cookie::new(name, value);
  if TokenType::Refresh == token_type {
    cookie.set_path("/auth/refresh");
  } else {
    cookie.set_path("/");
  }
  cookie.set_http_only(true);
  // Only require secure cookies in production
  if !cfg!(debug_assertions) {
    cookie.set_secure(true);
    cookie.set_same_site(tower_cookies::cookie::SameSite::None);
  } else {
    // In development, allow non-secure cookies for localhost
    cookie.set_same_site(tower_cookies::cookie::SameSite::Lax);
  }
  if let Some(expiry) = expiry {
    cookie.set_max_age(tower_cookies::cookie::time::Duration::new(expiry as i64, 0));
  }
  cookie
}

// Authentication middleware
#[axum::debug_middleware]
pub async fn auth_middleware(
  State(state): State<AppState>,
  ConnectInfo(socket_addr): ConnectInfo<std::net::SocketAddr>,
  cookies: tower_cookies::Cookies,
  request: Request,
  next: Next,
) -> Result<Response> {
  // Have to break this into parts so that the body isn't used in the `Send`ness of get_claims_from_headers.
  let (parts, body) = request.into_parts();
  let claims = get_claims_from_headers(&state.user_service, socket_addr, cookies, &parts).await?;
  let mut request = Request::from_parts(parts, body);
  request.extensions_mut().insert(claims.clone());
  Ok(CLAIMS.scope(claims, next.run(request)).await)
}

// Authentication configuration
#[derive(Debug, Clone, clap::Args)]
pub struct AuthConfig {
  #[arg(long, env = "ACCESS_TOKEN_EXPIRY", default_value_t = access_token_expiry())]
  pub access_token_expiry: u64, // seconds
  #[arg(long, env = "REFRESH_TOKEN_EXPIRY", default_value_t = 7 * 86400)]
  pub refresh_token_expiry: u64, // seconds
  #[arg(long, env = "API_KEY_EXPIRY")]
  pub api_key_expiry: Option<u64>, // seconds, None for no expiry
}

fn access_token_expiry() -> u64 {
  if cfg!(debug_assertions) { 7 * 86400 } else { 60 * 60 }
}

#[derive(Debug, Deserialize, gql::InputObject)]
pub struct SignupRequest {
  pub first_name: String,
  pub last_name: String,
  pub title: String,
  pub company: String,
  pub email: String,
  pub password: String,
  pub timezone: ArcSwap<TimeZone>,
}

pub async fn signup(
  State(state): State<AppState>,
  axum::extract::Path(invite_code): axum::extract::Path<String>,
  Json(payload): Json<SignupRequest>,
) -> Result<Json<UserInfo>> {
  let user = state.user_service.create_user(&state, payload, invite_code).await?;
  let team_id = user.default_team_id;
  // TODO: maybe redirect to login page
  let privileges = state.user_service.get_privileges(user.id, team_id).await?;
  Ok(Json(user.into_user_info(team_id, privileges)))
}

// Login endpoint
pub async fn login(State(state): State<AppState>, Json(payload): Json<LoginRequest>) -> Result<Response> {
  // Get user by email
  let user = match state.user_service.get_user_by_email(&payload.email).await {
    Ok(Some(user)) => user,
    Ok(None) => return Err(JaniumError::unauthorized()),
    Err(e) => return Err(e),
  };

  // Verify password
  match state.user_service.verify_password(&user, &payload.password).await {
    Ok(valid) => {
      if !valid {
        return Err(JaniumError::unauthorized());
      }
    }
    Err(e) => return Err(e),
  }

  generate_new_tokens(
    &state,
    user.as_ref(),
    None,
    payload.team_id.unwrap_or(user.default_team_id),
    Timestamp::now(),
  )
  .await
}

// TODO: don't use headers, use an extension instead.
// Refresh token endpoint
// To get to this endpoint, the refresh token has already been verified.
pub async fn refresh_token(
  State(state): State<AppState>,
  headers: HeaderMap,
  cookies: tower_cookies::Cookies,
  Json(payload): Json<RefreshTokenRequest>,
) -> Result<Response> {
  let claims = CLAIMS.with(|claims| claims.clone());
  if claims.token_type != TokenType::Refresh {
    return Err(JaniumError::ext_msg("Invalid token type"));
  }
  if payload.logout.unwrap_or(false) {
    return logout(state, cookies, headers).await;
  }
  // Get user
  let user = match state.user_service.get_user_by_id(claims.user_id).await? {
    Some(user) => user,
    None => return Err(StatusCode::UNAUTHORIZED.into()),
  };

  let refresh_token = if let Some(token) = auth_token(&headers) {
    Cow::Borrowed(token)
  } else if let Some(cookie) = cookies.get(REFRESH_COOKIE_NAME) {
    Cow::Owned(cookie.value_trimmed().to_string())
  } else {
    return Err(StatusCode::UNAUTHORIZED.into());
  };
  let refresh_token = refresh_token.as_ref();

  generate_new_tokens(
    &state,
    user.as_ref(),
    Some(refresh_token),
    payload.team_id.unwrap_or(claims.team_id),
    claims.issued_at,
  )
  .await
}

async fn generate_new_tokens(
  state: &AppState,
  user: &User,
  prev_refresh_token: Option<&str>,
  team_id: Id<Team>,
  issued_at: Timestamp,
) -> Result<Response> {
  // Check if user is active
  if !user.is_active {
    return Err(StatusCode::FORBIDDEN.into());
  }

  let privileges = state.user_service.get_privileges(user.id, team_id).await?;

  // Generate new access token
  let access_token = state.user_service.generate_access_token(user.id, team_id, privileges)?;

  // Generate new refresh token
  let refresh_token = state
    .user_service
    .create_refresh_token(user.id, team_id, issued_at)
    .await?;

  // Revoke old refresh token
  if let Some(prev_refresh_token) = prev_refresh_token {
    state.user_service.revoke_refresh_token(prev_refresh_token).await?;
  }

  let new_tokens = AuthResponse {
    access_token,
    refresh_token,
    token_type: "Bearer".to_string(),
    expires_in: state.opts.auth_config.access_token_expiry,
    user: user.clone().into_user_info(team_id, privileges),
  };

  let auth_cookie = create_cookie(state, TokenType::Access, new_tokens.access_token.clone());
  let refresh_cookie = create_cookie(state, TokenType::Refresh, new_tokens.refresh_token.clone());

  let response = Response::builder()
    .status(StatusCode::OK)
    .header(axum::http::header::SET_COOKIE, auth_cookie.to_string())
    .header(axum::http::header::SET_COOKIE, refresh_cookie.to_string())
    .header(axum::http::header::CONTENT_TYPE, "application/json")
    .body(axum::body::Body::from(serde_json::to_string(&new_tokens).unwrap()))
    .unwrap();

  Ok(response)
}

// TODO: don't use headers, use an extension instead.
// Logout endpoint
async fn logout(state: AppState, cookies: tower_cookies::Cookies, headers: HeaderMap) -> Result<Response> {
  // Revoke refresh token
  let refresh_token = if let Some(token) = auth_token(&headers) {
    Cow::Borrowed(token)
  } else if let Some(cookie) = cookies.get(REFRESH_COOKIE_NAME) {
    Cow::Owned(cookie.value_trimmed().to_string())
  } else {
    return Err(StatusCode::UNAUTHORIZED.into());
  };
  let refresh_token = refresh_token.as_ref();
  state.user_service.revoke_refresh_token(refresh_token).await?;
  let mut auth_cookie = create_cookie(&state, TokenType::Access, "".to_string());
  let mut refresh_cookie = create_cookie(&state, TokenType::Refresh, "".to_string());
  auth_cookie.set_max_age(tower_cookies::cookie::time::Duration::new(0, 0));
  refresh_cookie.set_max_age(tower_cookies::cookie::time::Duration::new(0, 0));
  let response = Response::builder()
    .status(StatusCode::OK)
    .header(axum::http::header::SET_COOKIE, auth_cookie.to_string())
    .header(axum::http::header::SET_COOKIE, refresh_cookie.to_string())
    .header(axum::http::header::CONTENT_TYPE, "application/json")
    .body(axum::body::Body::from(
      serde_json::to_string(&json!({ "message": "Logged out successfully" })).unwrap(),
    ))
    .unwrap();
  Ok(response)
}

pub fn auth_token(headers: &HeaderMap) -> Option<&str> {
  headers
    .get("Authorization")
    .and_then(|header| header.to_str().ok())
    .and_then(|header| header.strip_prefix("Bearer "))
}

// Helper function to extract and verify token from headers
pub async fn get_claims_from_headers(
  user_service: &UserService,
  socket_addr: std::net::SocketAddr,
  cookies: tower_cookies::Cookies,
  request: &axum::http::request::Parts,
) -> Result<Claims> {
  let path = request.uri.path();
  let is_refresh = path.starts_with("/auth/refresh") || path.starts_with("/auth/logout");
  // Try to get token from Authorization header
  if let Some(token) = auth_token(&request.headers) {
    if is_refresh {
      return user_service.verify_refresh_token(token).await;
    }
    return user_service.verify_token(token, TokenType::Access);
  }

  if is_refresh && let Some(cookie) = cookies.get(REFRESH_COOKIE_NAME) {
    return user_service.verify_refresh_token(cookie.value_trimmed()).await;
  }

  if let Some(cookie) = cookies.get(AUTH_COOKIE_NAME) {
    return user_service.verify_token(cookie.value_trimmed(), TokenType::Access);
  }

  let api_key = request.headers.get("X-API-Key").and_then(|header| header.to_str().ok());
  if let Some(api_key) = api_key {
    return user_service.verify_api_key(api_key).await;
  }

  if cfg!(debug_assertions) && socket_addr.ip().is_loopback() {
    let now = Timestamp::now();
    return Ok(Claims {
      user_id: Id::<User>::nil(),
      team_id: Id::<Team>::nil(),
      privileges: Privilege::SuperAdmin.into(),
      token_type: TokenType::Access,
      expires_at: now + std::time::Duration::from_secs(3600),
      issued_at: now,
      created_at: now,
    });
  }

  Err(StatusCode::UNAUTHORIZED.into())
}

// Create API key endpoint
pub async fn create_api_key(
  State(state): State<AppState>,
  Json(payload): Json<CreateApiKeyRequest>,
) -> Result<Json<ApiKeyResponse>> {
  let user_id = CLAIMS.with(|claims| claims.user_id);

  let expires_at = if let Some(expires_at) = payload.expires_at {
    expires_at
  } else {
    let expiry = if let Some(expires_at) = state.opts.auth_config.api_key_expiry {
      std::time::Duration::from_secs(expires_at)
    } else {
      std::time::Duration::from_secs(86400 * 366 * 100) // 100 years
    };
    Timestamp::now() + expiry
  };

  let user_team_map = state
    .user_service
    .user_team_map
    .get_l(&user_id)
    .await?
    .ok_or_else(|| JaniumError::not_found(format_args!("user {user_id}")))?;
  // Ensure user is part of the team they are claiming to be part of right now. This will be checked later when the API key is used as well.
  user_team_map
    .get(&payload.team_id)
    .ok_or_else(|| JaniumError::not_found(format_args!("user {user_id} as part of team {}", payload.team_id)))?;

  state
    .user_service
    .create_api_key(user_id, payload.team_id, payload.name, payload.permissions, expires_at)
    .await
    .map(Json)
}

// List API keys endpoint
pub async fn list_api_keys(State(state): State<AppState>) -> Result<Json<Vec<ApiKeyResponse>>> {
  let user_id = CLAIMS.with(|claims| claims.user_id);

  state.user_service.list_user_api_keys(user_id).await.map(Json)
}

// Revoke API key endpoint
pub async fn revoke_api_key(
  State(state): State<AppState>,
  Json(payload): Json<RevokeApiKeyRequest>,
) -> Result<Json<Value>> {
  let user_id = CLAIMS.with(|claims| claims.user_id);

  match state.user_service.revoke_api_key(user_id, &payload.id).await {
    Ok(()) => Ok(Json(json!({ "message": "API key revoked successfully" }))),
    Err(e) => Err(e),
  }
}

// Get current user info endpoint
pub async fn me(State(state): State<AppState>) -> Result<Json<UserInfo>> {
  let claims = CLAIMS.with(|claims| claims.clone());

  match state.user_service.get_user_by_id(claims.user_id).await {
    Ok(Some(user)) => Ok(Json(
      user.as_ref().clone().into_user_info(claims.team_id, claims.privileges),
    )),
    Ok(None) => Err(JaniumError::not_found(format_args!("user: {}", claims.user_id))),
    Err(e) => Err(e),
  }
}

#[test]
fn test_auth_workflow() {
  crate::test::app_state_server_test(20, async |app_state| {
    let port = app_state.opts.janium_port;
    let client = &app_state.reqwest_client;
    println!("Connecting to server on port {}", app_state.opts.janium_port);
    let response = client
      .post(format!("http://localhost:{port}/auth/login"))
      .json(&LoginRequest {
        email: "testuser@janium.ai".to_string(),
        password: "testpass".to_string(),
        team_id: None,
      })
      .send()
      .await
      .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let login_response = response.json::<AuthResponse>().await.unwrap();
    dbg!(&login_response);
    let authenticated_response = client
      .get(format!("http://localhost:{port}/auth/me"))
      .header("Authorization", format!("Bearer {}", login_response.access_token))
      .send()
      .await
      .unwrap();
    assert_eq!(authenticated_response.status(), StatusCode::OK);
    let authenticated_response = authenticated_response.json::<UserInfo>().await.unwrap();
    dbg!(&authenticated_response);
    // Wait for at least one second to pass to ensure refresh token is unique.
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    let refresh_response = client
      .post(format!("http://localhost:{port}/auth/refresh"))
      .header("Authorization", format!("Bearer {}", login_response.refresh_token))
      .json(&RefreshTokenRequest {
        team_id: None,
        logout: None,
      })
      .send()
      .await
      .unwrap();
    assert_eq!(refresh_response.status(), StatusCode::OK);
    let refresh_response = refresh_response.json::<AuthResponse>().await.unwrap();
    dbg!(&refresh_response);
    let authenticated_response = client
      .get(format!("http://localhost:{port}/auth/me"))
      .header("Authorization", format!("Bearer {}", refresh_response.access_token))
      .send()
      .await
      .unwrap();
    assert_eq!(authenticated_response.status(), StatusCode::OK);
    let authenticated_response = authenticated_response.json::<UserInfo>().await.unwrap();
    dbg!(&authenticated_response);
    let logout_response = client
      .post(format!("http://localhost:{port}/auth/refresh"))
      .header("Authorization", format!("Bearer {}", refresh_response.refresh_token))
      .json(&RefreshTokenRequest {
        team_id: None,
        logout: Some(true),
      })
      .send()
      .await
      .unwrap();
    dbg!(&logout_response);
    assert_eq!(logout_response.status(), StatusCode::OK);
    assert_eq!(
      logout_response.json::<Value>().await.unwrap(),
      json!({ "message": "Logged out successfully" })
    );
    let authenticated_response = client
      .get(format!("http://localhost:{port}/auth/me"))
      .header("Authorization", format!("Bearer {}", refresh_response.access_token))
      .send()
      .await
      .unwrap();
    dbg!(&authenticated_response);
  });
}

#[test]
fn test_api_key_workflow() {
  crate::test::app_state_server_test(20, async |app_state| {
    let port = app_state.opts.janium_port;
    let client = &app_state.reqwest_client;
    println!("Connecting to server on port {}", app_state.opts.janium_port);
    let response = client
      .post(format!("http://localhost:{port}/auth/login"))
      .json(&LoginRequest {
        email: "testuser@janium.ai".to_string(),
        password: "testpass".to_string(),
        team_id: None,
      })
      .send()
      .await
      .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let login_response = response.json::<AuthResponse>().await.unwrap();
    dbg!(&login_response);
    let authenticated_response = client
      .get(format!("http://localhost:{port}/auth/me"))
      .header("Authorization", format!("Bearer {}", login_response.access_token))
      .send()
      .await
      .unwrap();
    assert_eq!(authenticated_response.status(), StatusCode::OK);
    let authenticated_response = authenticated_response.json::<UserInfo>().await.unwrap();
    dbg!(&authenticated_response);
    let user_id = authenticated_response.id;
    let team_id = app_state
      .user_service
      .user_team_map
      .get_l(&user_id)
      .await
      .unwrap()
      .unwrap()
      .keys()
      .next()
      .copied()
      .unwrap();
    let create_api_key_response = client
      .post(format!("http://localhost:{port}/auth/api-keys"))
      .header("Authorization", format!("Bearer {}", login_response.access_token))
      .json(&CreateApiKeyRequest {
        name: "testapikey".to_string(),
        team_id,
        permissions: Privilege::SuperAdmin.into(),
        expires_at: None,
      })
      .send()
      .await
      .unwrap();
    assert_eq!(create_api_key_response.status(), StatusCode::OK);
    let create_api_key_response = create_api_key_response.json::<ApiKeyResponse>().await.unwrap();
    dbg!(&create_api_key_response);
    let api_key = create_api_key_response.key.unwrap();
    let list_api_keys_response = client
      .get(format!("http://localhost:{port}/auth/api-keys"))
      .header("X-API-Key", &api_key)
      .send()
      .await
      .unwrap();
    assert_eq!(list_api_keys_response.status(), StatusCode::OK);
    let list_api_keys_response = list_api_keys_response.json::<Vec<ApiKeyResponse>>().await.unwrap();
    dbg!(&list_api_keys_response);
    let revoke_api_key_response = client
      .post(format!("http://localhost:{port}/auth/api-keys/revoke"))
      .header("X-API-Key", &api_key)
      .json(&RevokeApiKeyRequest {
        id: create_api_key_response.id,
      })
      .send()
      .await
      .unwrap();
    assert_eq!(revoke_api_key_response.status(), StatusCode::OK);
    let revoke_api_key_response = revoke_api_key_response.json::<Value>().await.unwrap();
    dbg!(&revoke_api_key_response);
    let list_api_keys_response = client
      .get(format!("http://localhost:{port}/auth/api-keys"))
      .header("X-API-Key", &api_key)
      .send()
      .await
      .unwrap();
    assert_eq!(list_api_keys_response.status(), StatusCode::UNAUTHORIZED);
    let list_api_keys_response = client
      .get(format!("http://localhost:{port}/auth/api-keys"))
      .header("Authorization", format!("Bearer {}", login_response.access_token))
      .send()
      .await
      .unwrap();
    assert_eq!(list_api_keys_response.status(), StatusCode::OK);
    let list_api_keys_response = list_api_keys_response.json::<Vec<ApiKeyResponse>>().await.unwrap();
    dbg!(&list_api_keys_response);
    assert_eq!(list_api_keys_response.len(), 0);
  });
}
