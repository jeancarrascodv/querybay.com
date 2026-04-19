use axum::extract::{Path, State};
use axum::response::IntoResponse;

use crate::prelude::*;

#[derive(Debug, Clone, PartialEq, Model, gql::SimpleObject, Serialize, Deserialize)]
#[ormlite(table = "linkedin_action_failures")]
#[graphql(complex)]
pub struct LinkedInActionFailure {
  #[ormlite(primary_key)]
  pub id: Id<LinkedInActionRequest>,
  pub action: LinkedInAction,
  pub action_type: LinkedInActionType,
  pub team_id: Id<Team>,
  pub linkedin_id: Id<LinkedIn>,
  pub campaign_id: Option<Id<Campaign>>,
  pub campaign_step_id: Option<Id<CampaignStep>>,
  pub contact_id: Option<Id<Contact>>,
  pub priority: i16,
  pub failed_at: Timestamp,
  pub attempts: i16,
  pub error: String,
  #[graphql(skip)]
  pub html: Option<String>,
  #[graphql(skip)]
  pub screenshot_png: Option<Vec<u8>>,
}

#[gql::ComplexObject]
impl LinkedInActionFailure {
  pub async fn has_html(&self) -> bool {
    self.html.is_some()
  }
  pub async fn has_screenshot(&self) -> bool {
    self.screenshot_png.is_some()
  }
  pub async fn campaign(&self, context: &gql::Context<'_>) -> Result<Option<crate::graphql::GqlQuery<Campaign>>> {
    let Some(campaign_id) = self.campaign_id else {
      return Ok(None);
    };
    let app_state = context.data_unchecked::<AppState>();
    let campaign = app_state.router.get_handle::<Campaign>(&campaign_id)?;
    Ok(Some(GqlQuery {
      app_state: app_state.clone(),
      team: app_state.router.get_handle::<Team>(&self.team_id)?,
      sender: campaign,
    }))
  }
  pub async fn campaign_step(&self, context: &gql::Context<'_>) -> Result<Option<CampaignStep>> {
    let (Some(campaign_id), Some(campaign_step_id)) = (self.campaign_id, self.campaign_step_id) else {
      return Ok(None);
    };
    let app_state = context.data_unchecked::<AppState>();
    let campaign = app_state.router.get_handle::<Campaign>(&campaign_id)?;
    let campaign_step = campaign
      .send(super::Query::new(move |_, _, state: &CampaignState| {
        state.graph.steps().get(&campaign_step_id).cloned()
      }))
      .await?;
    Ok(campaign_step)
  }
  pub async fn contact(&self, context: &gql::Context<'_>) -> Result<Option<Arc<Contact>>> {
    let Some(contact_id) = self.contact_id else {
      return Ok(None);
    };
    let app_state = context.data_unchecked::<AppState>();
    let contact = app_state.contact_service.get(&contact_id).await?;
    Ok(contact)
  }
  pub async fn linked_in(&self, context: &gql::Context<'_>) -> Result<Option<GqlQuery<LinkedIn>>> {
    let app_state = context.data_unchecked::<AppState>();
    let linkedin = app_state.router.get_handle::<LinkedIn>(&self.linkedin_id)?;
    Ok(Some(GqlQuery {
      app_state: app_state.clone(),
      team: app_state.router.get_handle::<Team>(&self.team_id)?,
      sender: linkedin,
    }))
  }
  pub async fn team(&self, context: &gql::Context<'_>) -> Result<Option<GqlQuery<Team>>> {
    let app_state = context.data_unchecked::<AppState>();
    let team = app_state.router.get_handle::<Team>(&self.team_id)?;
    Ok(Some(GqlQuery {
      app_state: app_state.clone(),
      team: team.clone(),
      sender: team,
    }))
  }
  pub async fn description(&self) -> Result<Option<String>> {
    Ok(None)
  }
}

impl LinkedInActionFailure {
  pub fn new(
    request: LinkedInActionRequest,
    failed_at: Timestamp,
    error: String,
    html: Option<String>,
    screenshot_png: Option<Vec<u8>>,
  ) -> Self {
    Self {
      id: request.id,
      action_type: request.action.action_type(),
      action: request.action,
      team_id: request.team_id,
      linkedin_id: request.linkedin_id,
      campaign_id: request.campaign_id,
      campaign_step_id: request.campaign_step_id,
      contact_id: request.contact_id,
      priority: request.priority,
      failed_at,
      attempts: request.attempts,
      error,
      html,
      screenshot_png,
    }
  }
  pub async fn save(self, db: &mut sqlx::PgConnection) -> Result<Self> {
    self
      .insert(db)
      .on_conflict(ormlite::query_builder::OnConflict::Ignore)
      .await
      .map_err(|e| e.into())
  }
  pub async fn query_for_gql(
    db: &sqlx::PgPool,
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    limit: Option<i64>,
  ) -> Result<Vec<Self>> {
    sqlx::query_as::<_, LinkedInActionFailure>(
      "select id
, action
, action_type
, team_id
, linkedin_id
, campaign_id
, campaign_step_id
, contact_id
, priority
, failed_at
, attempts
, error
, substring(html from 1 for 10) as html
, substring(screenshot_png from 1 for 10) as screenshot_png
from linkedin_action_failures
where (($1 = 1) or (team_id = $2 and linkedin_id = $3))
order by failed_at desc
limit $4",
    )
    .bind(crate::auth::CLAIMS.with(|claims| claims.privileges.allows(Privilege::SuperAdmin)) as i32)
    .bind(team_id)
    .bind(linkedin_id)
    .bind(limit.unwrap_or(100))
    .fetch_all(db)
    .await
    .map_err(|e| e.into())
  }
}

pub async fn action_failure_html(
  State(app_state): State<AppState>,
  Path(id): Path<Id<LinkedInActionFailure>>,
) -> Result<impl axum::response::IntoResponse> {
  tracing::trace!("action_failure_html: {id}");
  let super_admin = crate::auth::CLAIMS.with(|claims| claims.privileges.allows(Privilege::SuperAdmin));
  let Some((team_id, html)) = sqlx::query_as::<_, (Id<Team>, Option<String>)>(
    "select team_id, html from linkedin_action_failures where ($1 = 1 or id = $2)",
  )
  .bind(super_admin as i32)
  .bind(id)
  .fetch_optional(&app_state.db)
  .await?
  else {
    return Err(JaniumError::not_found(id));
  };
  if team_id != crate::auth::CLAIMS.with(|claims| claims.team_id) && !super_admin {
    return Err(JaniumError::unauthorized());
  }
  let response = if let Some(html) = html {
    axum::response::Html(html).into_response()
  } else {
    axum::response::Response::builder()
      .status(axum::http::status::StatusCode::NO_CONTENT)
      .body(axum::body::Body::from(""))
      .unwrap()
  };
  Ok(response)
}

pub async fn action_failure_screenshot(
  State(app_state): State<AppState>,
  Path(id): Path<Id<LinkedInActionFailure>>,
) -> Result<impl axum::response::IntoResponse> {
  tracing::trace!("action_failure_screenshot: {id}");
  let super_admin = crate::auth::CLAIMS.with(|claims| claims.privileges.allows(Privilege::SuperAdmin));
  let Some((team_id, screenshot)) = sqlx::query_as::<_, (Id<Team>, Option<Vec<u8>>)>(
    "select team_id, screenshot_png from linkedin_action_failures where ($1 = 1 or id = $2)",
  )
  .bind(super_admin as i32)
  .bind(id)
  .fetch_optional(&app_state.db)
  .await?
  else {
    return Err(JaniumError::not_found(id));
  };
  if team_id != crate::auth::CLAIMS.with(|claims| claims.team_id) && !super_admin {
    return Err(JaniumError::unauthorized());
  }
  let response = if let Some(screenshot) = screenshot {
    axum::response::Response::builder()
      .status(axum::http::status::StatusCode::OK)
      .header(axum::http::header::CONTENT_TYPE, "image/png")
      .body(axum::body::Body::from(screenshot))
      .unwrap()
  } else {
    axum::response::Response::builder()
      .status(axum::http::status::StatusCode::NO_CONTENT)
      .body(axum::body::Body::from(""))
      .unwrap()
  };
  Ok(response)
}

#[test]
fn test_query_for_gql() {
  crate::test::app_state_test(20, async move |app_state| {
    let (linkedin_id, team_id) =
      sqlx::query_as::<_, (Id<LinkedIn>, Id<Team>)>("select id, team_id from linked_in limit 1")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
    let now = Timestamp::now().0.round(jiff::Unit::Microsecond).unwrap().into();
    let f = LinkedInActionFailure::new(
      LinkedInActionRequest::new(
        LinkedInAction::SendConnectionRequest(SendConnectionRequest {
          profile_url: LiProfileUrl::ProfileHandle("dummy profile url".to_string()),
          message: "dummy message".to_string(),
        }),
        team_id,
        linkedin_id,
        None,
        None,
        None,
        // The database truncates timestamps to microseconds
        now,
        Some(0),
      ),
      now + jiff::Span::new().minutes(1).negate(),
      "dummy error".to_string(),
      None,
      None,
    );
    f.clone()
      .save(&mut app_state.db.acquire().await.unwrap())
      .await
      .unwrap();
    let claims = crate::models::user::Claims {
      user_id: Id::nil(),
      team_id,
      privileges: crate::models::Privileges::empty(),
      token_type: crate::models::user::TokenType::Access,
      expires_at: Timestamp::now(),
      issued_at: Timestamp::now(),
      created_at: Timestamp::now(),
    };
    let failures = crate::auth::CLAIMS
      .scope(
        claims,
        LinkedInActionFailure::query_for_gql(&app_state.db, team_id, linkedin_id, Some(10)),
      )
      .await
      .unwrap();
    assert_eq!(failures.len(), 1);
    assert_eq!(failures[0], f);
  });
}
