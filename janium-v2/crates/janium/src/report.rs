use crate::prelude::*;

#[derive(Debug, Clone, gql::SimpleObject, sqlx::FromRow)]
#[graphql(complex)]
pub struct ReportData {
  pub linkedin_id: Id<LinkedIn>,
  pub team_id: Id<Team>,
  pub login_active_last_validated: Option<Timestamp>,
  pub sales_navigator_active_last_validated: Option<Timestamp>,
  pub active_campaigns_count: i64,
  pub linkedin_errors_daily_count: i64,
  pub linkedin_errors_weekly_count: i64,
  pub linkedin_errors_monthly_count: i64,
  pub linkedin_errors_total_count: i64,
  pub connection_request_queue_size: i64,
  pub connection_request_daily_count: i64,
  pub connection_request_weekly_count: i64,
  pub connection_request_monthly_count: i64,
  pub connection_request_total_count: i64,
  pub new_connections_daily_count: i64,
  pub new_connections_weekly_count: i64,
  pub new_connections_monthly_count: i64,
  pub new_connections_total_count: i64,
  pub linkedin_messages_sent_daily_count: i64,
  pub linkedin_messages_sent_weekly_count: i64,
  pub linkedin_messages_sent_monthly_count: i64,
  pub linkedin_messages_sent_total_count: i64,
  pub linkedin_responses_received_daily_count: i64,
  pub linkedin_responses_received_weekly_count: i64,
  pub linkedin_responses_received_monthly_count: i64,
  pub linkedin_responses_received_total_count: i64,
  pub emails_sent_daily_count: i64,
  pub emails_sent_weekly_count: i64,
  pub emails_sent_monthly_count: i64,
  pub emails_sent_total_count: i64,
  pub emails_responses_daily_count: i64,
  pub emails_responses_weekly_count: i64,
  pub emails_responses_monthly_count: i64,
  pub emails_responses_total_count: i64,
}

#[gql::ComplexObject]
impl ReportData {
  pub async fn linkedin(&self, context: &gql::Context<'_>) -> Result<GqlQuery<LinkedIn>> {
    let app_state = context.data_unchecked::<AppState>();
    Ok(GqlQuery {
      app_state: app_state.clone(),
      team: app_state.router.get_handle::<Team>(&self.team_id)?,
      sender: app_state.router.get_handle::<LinkedIn>(&self.linkedin_id)?,
    })
  }
  pub async fn team(&self, context: &gql::Context<'_>) -> Result<GqlQuery<Team>> {
    let app_state = context.data_unchecked::<AppState>();
    let team_sender = app_state.router.get_handle::<Team>(&self.team_id)?;
    Ok(GqlQuery {
      app_state: app_state.clone(),
      team: team_sender.clone(),
      sender: team_sender,
    })
  }
}

impl ReportData {
  pub async fn get_all(db: &sqlx::PgPool, user_id: Id<User>) -> Result<Vec<ReportData>> {
    let now = Timestamp::now();
    let one_day_ago = now - 24.hours();
    let one_week_ago = now - (7 * 24).hours();
    let one_month_ago = now - (30 * 24).hours();
    sqlx::query_as::<_, ReportData>(include_str!("../sql/report_data.sql"))
      .bind(user_id)
      .bind(one_day_ago)
      .bind(one_week_ago)
      .bind(one_month_ago)
      .bind(LinkedInActionType::SendConnectionRequest)
      .bind(CampaignContactStatus::PendingStartStep)
      .fetch_all(db)
      .await
      .map_err(|e| e.into())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_report_data_get_all() {
    crate::test::app_state_test(20, async |app_state| {
      let db = &app_state.db;
      let mut conn = db.acquire().await.unwrap();

      // Fetch the pre-seeded user, team, and linkedin account (skip nil placeholder rows)
      let (user_id, team_id) = sqlx::query_as::<_, (Id<User>, Id<Team>)>(
        "select id, default_team_id from \"user\" where id != '00000000-0000-0000-0000-000000000000' limit 1",
      )
      .fetch_one(&mut *conn)
      .await
      .unwrap();
      let linkedin_id = sqlx::query_scalar::<_, Id<LinkedIn>>("select id from linked_in where team_id = $1 limit 1")
        .bind(team_id)
        .fetch_one(&mut *conn)
        .await
        .unwrap();

      // Clean up pre-existing campaigns from test_initialization.sql so counts are deterministic
      sqlx::query("DELETE FROM campaign_contact WHERE campaign_id IN (SELECT id FROM campaign WHERE team_id = $1)")
        .bind(team_id)
        .execute(&mut *conn)
        .await
        .unwrap();
      sqlx::query("UPDATE campaign SET active = false WHERE team_id = $1")
        .bind(team_id)
        .execute(&mut *conn)
        .await
        .unwrap();

      let now = Timestamp::now();
      let now_ts = now.0.round(jiff::Unit::Microsecond).unwrap();

      // --- Insert linkedin_action_failures ---
      // 1 failure "now" (counts in daily/weekly/monthly/total)
      // 1 failure 3 days ago (counts in weekly/monthly/total)
      // 1 failure 10 days ago (counts in monthly/total)
      // 1 failure 60 days ago (counts in total only)
      let failure_times = [
        now_ts,
        now_ts - (3 * 24).hours(),
        now_ts - (10 * 24).hours(),
        now_ts - (60 * 24).hours(),
      ];
      for failed_at in failure_times {
        let request = LinkedInActionRequest::new(
          LinkedInAction::SendConnectionRequest(SendConnectionRequest {
            profile_url: LiProfileUrl::ProfileHandle("dummy".to_string()),
            message: "dummy".to_string(),
          }),
          team_id,
          linkedin_id,
          None,
          None,
          None,
          Timestamp::from(failed_at + 1.hour()),
          Some(0),
        );
        LinkedInActionFailure::new(
          request,
          Timestamp::from(failed_at),
          "test error".to_string(),
          None,
          None,
        )
        .save(&mut conn)
        .await
        .unwrap();
      }

      // --- Insert linkedin_action_history (connection requests) ---
      // 1 completed "now" (daily/weekly/monthly/total)
      // 1 completed 5 days ago (weekly/monthly/total)
      // 1 completed 15 days ago (monthly/total)
      // 1 completed 45 days ago (total only)
      let history_times = [
        now_ts,
        now_ts - (5 * 24).hours(),
        now_ts - (15 * 24).hours(),
        now_ts - (45 * 24).hours(),
      ];
      for completed_at in history_times {
        let request = LinkedInActionRequest::new(
          LinkedInAction::SendConnectionRequest(SendConnectionRequest {
            profile_url: LiProfileUrl::ProfileHandle("dummy".to_string()),
            message: "dummy".to_string(),
          }),
          team_id,
          linkedin_id,
          None,
          None,
          None,
          Timestamp::from(completed_at + 1.hour()),
          Some(0),
        );
        LinkedInActionHistory::new(
          request,
          Timestamp::from(completed_at - 1.minute()),
          Timestamp::from(completed_at),
        )
        .save(&mut conn)
        .await
        .unwrap();
      }

      // --- Insert campaign + step + contacts for queue size ---
      let campaign_id: Id<Campaign> = Id::new();
      let step_id: Id<CampaignStep> = Id::new();

      // Insert active campaign with the linkedin account
      sqlx::query("insert into campaign (id, team_id, name, active, linkedin_ids) values ($1, $2, $3, true, $4)")
        .bind(campaign_id)
        .bind(team_id)
        .bind("Test Campaign")
        .bind(&[linkedin_id][..])
        .execute(&mut *conn)
        .await
        .unwrap();

      // Insert an enabled step with send_linked_in_connection_request action
      sqlx::query(
        "insert into campaign_step (id, campaign_id, enabled, priority, step_data) values ($1, $2, true, 0, $3)",
      )
      .bind(step_id)
      .bind(campaign_id)
      .bind(sqlx::types::Json(serde_json::json!({
        "send_linked_in_connection_request": { "connection_request_message": "Hi" }
      })))
      .execute(&mut *conn)
      .await
      .unwrap();

      // Insert 3 contacts in PendingStartStep status (should count in queue)
      for _ in 0..3 {
        let contact_id: Id<Contact> = Id::new();
        sqlx::query("insert into contact (id) values ($1)")
          .bind(contact_id)
          .execute(&mut *conn)
          .await
          .unwrap();

        CampaignContact {
          id: Id::new(),
          campaign_id,
          contact_id,
          step_id,
          status: CampaignContactStatus::PendingStartStep,
          extra_data: None,
          last_action: now,
          delay_until: None,
          linkedin_id: Some(linkedin_id),
          evaluation_attempts: 0,
        }
        .save(&mut conn)
        .await
        .unwrap();
      }

      // Insert 1 contact in InProgress status (should NOT count in queue)
      let contact_not_queued: Id<Contact> = Id::new();
      sqlx::query("insert into contact (id) values ($1)")
        .bind(contact_not_queued)
        .execute(&mut *conn)
        .await
        .unwrap();
      CampaignContact {
        id: Id::new(),
        campaign_id,
        contact_id: contact_not_queued,
        step_id,
        status: CampaignContactStatus::InProgress,
        extra_data: None,
        last_action: now,
        delay_until: None,
        linkedin_id: Some(linkedin_id),
        evaluation_attempts: 0,
      }
      .save(&mut conn)
      .await
      .unwrap();

      drop(conn);

      // --- Run the query ---
      let results = ReportData::get_all(db, user_id).await.unwrap();
      assert_eq!(results.len(), 1, "should return one row per linkedin account");

      let r = &results[0];
      assert_eq!(r.linkedin_id, linkedin_id);
      assert_eq!(r.team_id, team_id);

      // Failures: 1 daily, 2 weekly, 3 monthly, 4 total
      assert_eq!(r.linkedin_errors_daily_count, 1);
      assert_eq!(r.linkedin_errors_weekly_count, 2);
      assert_eq!(r.linkedin_errors_monthly_count, 3);
      assert_eq!(r.linkedin_errors_total_count, 4);

      // Connection requests: 1 daily, 2 weekly, 3 monthly, 4 total
      assert_eq!(r.connection_request_daily_count, 1);
      assert_eq!(r.connection_request_weekly_count, 2);
      assert_eq!(r.connection_request_monthly_count, 3);
      assert_eq!(r.connection_request_total_count, 4);

      // Queue size: 3 contacts in PendingStartStep
      assert_eq!(r.connection_request_queue_size, 3);

      // Active campaigns: 1
      assert_eq!(r.active_campaigns_count, 1);

      // Zeroed-out fields (not yet implemented in query)
      assert_eq!(r.new_connections_daily_count, 0);
      assert_eq!(r.linkedin_messages_sent_daily_count, 0);
      assert_eq!(r.linkedin_responses_received_daily_count, 0);
      assert_eq!(r.emails_sent_daily_count, 0);
      assert_eq!(r.emails_responses_daily_count, 0);
    });
  }
}
