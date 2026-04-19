-- bind variables: $1: user_id, $2 one day ago, $3 one week ago, $4 one month ago, $5: action_type, $6: campaign_contact_status
with teams as (
  select team_id
  from user_team_map
  where user_id = $1
)
, linkedin_accounts as (
  select li.id
  , li.team_id
  , li.full_name
  , li.login_active_last_validated
  , li.sales_navigator_active_last_validated
  , t.name as team_name
  from linked_in li
    inner join team t
      on t.id = li.team_id
  where li.team_id in (select team_id from teams)
)
, linkedin_failures as (
  select linkedin_id
  , sum(case when failed_at >= $2 then 1 end) as linkedin_errors_daily_count
  , sum(case when failed_at >= $3 then 1 end) as linkedin_errors_weekly_count
  , sum(case when failed_at >= $4 then 1 end) as linkedin_errors_monthly_count
  , count(*) as linkedin_errors_total_count
  from linkedin_action_failures
  where linkedin_id in (select id from linkedin_accounts)
  group by linkedin_id
)
, linkedin_connection_requests as (
  select linkedin_id
  , sum(case when completed_at >= $2 then 1 end) as connection_request_daily_count
  , sum(case when completed_at >= $3 then 1 end) as connection_request_weekly_count
  , sum(case when completed_at >= $4 then 1 end) as connection_request_monthly_count
  , count(*) as connection_request_total_count
  from linkedin_action_history
  where linkedin_id in (select id from linkedin_accounts)
    and action_type = $5 -- 2
  group by linkedin_id
)
, in_queue as (
  select li.id as linkedin_id
  , count(cc.id) as connection_request_queue_size
  , count(distinct case when c.active then c.id end) as active_campaigns_count
  from campaign c
    inner join linkedin_accounts li
      on li.id = any(c.linkedin_ids)
      and c.active = true
    -- left join on campaign_step so that active campaigns get counted even if no steps are enabled or there are no connection request steps
    left join campaign_step cs
      on cs.campaign_id = c.id
      and cs.enabled = true
      and cs.step_data->> 'send_linked_in_connection_request' is not null
    -- left join on campaign_contact so that active campaigns get counted even if no contacts are in the queue
    left join campaign_contact cc
      on cc.campaign_id = c.id
      and (cc.step_id = cs.id or cc.step_id = '00000000-0000-0000-0000-000000000000')
      -- TODO: this filter needs to be handled when we can do multi-linkedin campaigns
      -- and cc.linkedin_id = li.id
      and cc.status = $6 -- 1
  group by li.id
)
select li.id as linkedin_id
, li.team_id
, li.login_active_last_validated
, li.sales_navigator_active_last_validated
, coalesce(lf.linkedin_errors_daily_count, 0)::int8 as linkedin_errors_daily_count
, coalesce(lf.linkedin_errors_weekly_count, 0)::int8 as linkedin_errors_weekly_count
, coalesce(lf.linkedin_errors_monthly_count, 0)::int8 as linkedin_errors_monthly_count
, coalesce(lf.linkedin_errors_total_count, 0)::int8 as linkedin_errors_total_count
, coalesce(lcr.connection_request_daily_count, 0)::int8 as connection_request_daily_count
, coalesce(lcr.connection_request_weekly_count, 0)::int8 as connection_request_weekly_count
, coalesce(lcr.connection_request_monthly_count, 0)::int8 as connection_request_monthly_count
, coalesce(lcr.connection_request_total_count, 0)::int8 as connection_request_total_count
, coalesce(iq.connection_request_queue_size, 0)::int8 as connection_request_queue_size
, coalesce(iq.active_campaigns_count, 0)::int8 as active_campaigns_count
, 0::int8 as new_connections_daily_count
, 0::int8 as new_connections_weekly_count
, 0::int8 as new_connections_monthly_count
, 0::int8 as new_connections_total_count
, 0::int8 as linkedin_messages_sent_daily_count
, 0::int8 as linkedin_messages_sent_weekly_count
, 0::int8 as linkedin_messages_sent_monthly_count
, 0::int8 as linkedin_messages_sent_total_count
, 0::int8 as linkedin_responses_received_daily_count
, 0::int8 as linkedin_responses_received_weekly_count
, 0::int8 as linkedin_responses_received_monthly_count
, 0::int8 as linkedin_responses_received_total_count
, 0::int8 as emails_sent_daily_count
, 0::int8 as emails_sent_weekly_count
, 0::int8 as emails_sent_monthly_count
, 0::int8 as emails_sent_total_count
, 0::int8 as emails_responses_daily_count
, 0::int8 as emails_responses_weekly_count
, 0::int8 as emails_responses_monthly_count
, 0::int8 as emails_responses_total_count
from linkedin_accounts li
  left join linkedin_failures lf
    on lf.linkedin_id = li.id
  left join linkedin_connection_requests lcr
    on lcr.linkedin_id = li.id
  left join in_queue iq
    on iq.linkedin_id = li.id
order by
  case when iq.active_campaigns_count > 0 then 0 else 1 end
, iq.connection_request_queue_size
, lower(li.team_name)
, lower(li.full_name)
