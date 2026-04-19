use crate::prelude::*;
use axum::extract::WebSocketUpgrade;
use futures::StreamExt;

pub type JaniumSchema = gql::Schema<Query, Mutation, Subscription>;

pub fn get_schema(app_state: AppState) -> JaniumSchema {
  gql::Schema::build(
    Query {
      app_state: app_state.clone(),
    },
    Mutation {
      app_state: app_state.clone(),
    },
    Subscription {
      app_state: app_state.clone(),
    },
  )
  // .extension(MyExtension)
  // This should only be used to help with contact lookups
  .data(app_state)
  .finish()
}

// struct MyExtension;

// #[gql::async_trait::async_trait]
// impl gql::extensions::Extension for MyExtension {
//   async fn request(
//     &self,
//     ctx: &gql::extensions::ExtensionContext<'_>,
//     next: gql::extensions::NextRequest<'_>,
//   ) -> gql::Response {
//     next.run(ctx).await
//   }
// }

// impl gql::extensions::ExtensionFactory for MyExtension {
//   fn create(&self) -> std::sync::Arc<dyn gql::extensions::Extension> {
//     std::sync::Arc::new(Self)
//   }
// }

pub struct Query {
  app_state: AppState,
}

#[gql::Object]
impl Query {
  #[graphql(guard = "Privilege::TeamViewer")]
  pub async fn team(&self) -> Result<Option<GqlQuery<Team>>> {
    let team_id_claims = crate::auth::CLAIMS.with(|claims| claims.team_id);
    let sender = match self.app_state.router.get_handle::<Team>(&team_id_claims).ok() {
      Some(sender) => sender,
      None => return Ok(None),
    };
    Ok(Some(GqlQuery {
      app_state: self.app_state.clone(),
      team: sender.clone(),
      sender,
    }))
  }
  /// Returns all teams that an authenticated user is part of
  pub async fn all_teams(&self, context: &gql::Context<'_>) -> gql::Result<Vec<Team>> {
    let user_id = crate::auth::CLAIMS.with(|claims| claims.user_id);
    let teams = if user_id == Id::nil() {
      return Team::select().fetch_all(&self.app_state.db).await.map_err(Into::into);
    } else {
      self
        .app_state
        .user_service
        .user_team_map
        .get_l(&user_id)
        .await?
        .ok_or_else(|| JaniumError::ext_msg("User is not part of any teams"))?
    };
    let teams = teams.keys().cloned();

    if context.field().selection_set().count() == 1 && context.look_ahead().field("id").exists() {
      let mut vec = teams.map(Team::new_empty).collect::<Vec<_>>();
      vec.sort_by_key(<Team as Actor>::id);
      return Ok(vec);
    }

    let stream = teams.map(|id| async move {
      let team = self.app_state.router.get_handle::<Team>(&id)?;
      let team = team
        .send(crate::models::Query::<Team, _, _>::new(|team, _, _| team.clone()))
        .await?;
      Ok::<_, JaniumError>(team)
    });

    let mut team = futures::stream::iter(stream)
      .buffer_unordered(20)
      .collect::<Vec<_>>()
      .await
      .into_iter()
      .collect::<Result<Vec<_>, _>>()?;
    team.sort_by_key(<Team as Actor>::id);
    Ok(team)
  }

  pub async fn report_data(&self) -> Result<Vec<ReportData>> {
    let user_id = crate::auth::CLAIMS.with(|claims| claims.user_id);
    ReportData::get_all(&self.app_state.db, user_id).await
  }

  pub async fn timezones(&self) -> Vec<TimeZoneInfo> {
    let now = jiff::Timestamp::now();
    let mut tz = jiff::tz::db()
      .available()
      .map(|t| {
        let tz = jiff::tz::TimeZone::get(t.as_str()).unwrap();
        let info = tz.to_offset_info(now);
        info.abbreviation();
        TimeZoneInfo {
          name: t.as_str().to_string(),
          short_name: info.abbreviation().to_string(),
          offset_seconds: info.offset().seconds(),
        }
      })
      .collect::<Vec<_>>();
    tz.sort_by(|a, b| {
      b.offset_seconds
        .cmp(&a.offset_seconds)
        .then_with(|| a.name.cmp(&b.name))
    });
    tz
  }
  pub async fn default_setting(&self) -> DefaultSetting {
    DefaultSetting {
      app_state: self.app_state.clone(),
    }
  }
  pub async fn version(&self) -> &str {
    crate::GIT_VERSION
  }
}

struct DefaultSetting {
  app_state: AppState,
}

#[gql::Object]
impl DefaultSetting {
  pub async fn max_consecutive_linkedin_failures(&self) -> i16 {
    self.app_state.opts.default_max_consecutive_errors
  }
}

#[derive(gql::SimpleObject)]
struct TimeZoneInfo {
  name: String,
  short_name: String,
  offset_seconds: i32,
}

pub struct GqlQuery<A: Actor> {
  pub app_state: AppState,
  pub team: Sender<Team>,
  pub sender: Sender<A>,
}

pub struct GqlMutation<A: Actor> {
  pub app_state: AppState,
  pub team: Sender<Team>,
  pub sender: Sender<A>,
}

pub struct Mutation {
  app_state: AppState,
}

#[gql::Object]
impl Mutation {
  #[graphql(guard = "Privilege::TeamMember")]
  pub async fn team(&self) -> Result<GqlMutation<Team>> {
    let team_id_claims = crate::auth::CLAIMS.with(|claims| claims.team_id);
    let sender = self.app_state.router.get_handle::<Team>(&team_id_claims)?;
    Ok(GqlMutation {
      app_state: self.app_state.clone(),
      team: sender.clone(),
      sender,
    })
  }

  #[graphql(guard = "Privilege::SuperAdmin")]
  pub async fn create_team(&self, name: String, timezone: String) -> gql::Result<Team> {
    Team::create(&self.app_state, name.into(), timezone.into())
      .await
      .map_err(Into::into)
  }
}

pub struct Subscription {
  app_state: AppState,
}

#[gql::Subscription]
impl Subscription {
  /// Subscribe to live log events with optional filtering
  #[graphql(guard = "Privilege::TeamViewer")]
  async fn logs(&self, filter: Option<LogFilter>) -> impl futures::Stream<Item = Arc<LogEntry>> {
    let filter = filter.unwrap_or_default();

    // Enforce team_id filter based on claims if not superadmin
    let (team_id, privileges) = crate::auth::CLAIMS.with(|claims| (claims.team_id, claims.privileges));
    let filter = if team_id == Id::nil() || privileges.allows(Privilege::SuperAdmin) {
      filter
    } else {
      LogFilter {
        team_id: Some(team_id),
        ..filter
      }
    };
    crate::db_logging::query_stream(filter, self.app_state.clone())
  }
}

pub async fn graphql_ws(
  protocol: gql_axum::GraphQLProtocol,
  upgrade: WebSocketUpgrade,
  claims: axum::Extension<Claims>,
  axum::Extension(schema): axum::Extension<JaniumSchema>,
) -> axum::response::Response {
  let claims = claims.0;
  upgrade
    .protocols(gql::http::ALL_WEBSOCKET_PROTOCOLS)
    .on_upgrade(move |stream| {
      let serve = gql_axum::GraphQLWebSocket::new(stream, schema, protocol).serve();
      crate::auth::CLAIMS.scope(claims, serve)
    })
}

#[test]
fn test_gql_sdl() {
  crate::test::app_state_test(10, async |app_state| {
    let schema = get_schema(app_state);
    let sdl = schema.sdl();
    tracing::info!("{}", sdl);
  });
}
