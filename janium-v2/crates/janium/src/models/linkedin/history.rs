use crate::prelude::*;

#[derive(Debug, Clone, Model, gql::SimpleObject)]
#[ormlite(table = "linkedin_action_history")]
#[graphql(complex)]
pub struct LinkedInActionHistory {
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
  pub started_at: Timestamp,
  pub completed_at: Timestamp,
  pub attempts: i16,
}

impl LinkedInActionHistory {
  pub fn new(request: LinkedInActionRequest, started_at: Timestamp, completed_at: Timestamp) -> Self {
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
      started_at,
      completed_at,
      attempts: request.attempts,
    }
  }
  pub async fn save(self, db: &mut sqlx::PgConnection) -> Result<Self> {
    self
      .insert(db)
      .on_conflict(ormlite::query_builder::OnConflict::Ignore)
      .await
      .map_err(|e| e.into())
  }
  pub async fn total_sending_days(
    db: &sqlx::PgPool,
    team_id: Id<Team>,
    linkedin_id: Id<LinkedIn>,
    action_type: LinkedInActionType,
    since: Timestamp,
  ) -> Result<i64> {
    sqlx::query_scalar::<_, i64>(
      "select count(distinct date(completed_at))::int8
      from linkedin_action_history
      where team_id = $1
        and linkedin_id = $2
        and action_type = $3
        and completed_at >= $4",
    )
    .bind(team_id)
    .bind(linkedin_id)
    .bind(action_type)
    .bind(since)
    .fetch_one(db)
    .await
    .map_err(|e| e.into())
  }
}

#[gql::ComplexObject]
impl LinkedInActionHistory {
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
