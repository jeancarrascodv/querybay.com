DO LANGUAGE plpgsql $$

DECLARE
  team_id uuid := gen_random_uuid();
  user_id uuid := gen_random_uuid();
  linkedin_id uuid;
  campaign_id uuid := gen_random_uuid();
  step_id uuid := gen_random_uuid();
  owner_contact_id uuid := gen_random_uuid();
  contact1_id uuid := gen_random_uuid();
  contact2_id uuid := gen_random_uuid();
  contact3_id uuid := gen_random_uuid();
BEGIN

insert into "team" values (
  team_id,
  'Test Team',
  'America/Denver',
  '{"friday": {"end_time": "23:59:59.999999999", "start_time": "00:00:00"}, "monday": {"end_time": "23:59:59.999999999", "start_time": "00:00:00"}, "sunday": {"end_time": "23:59:59.999999999", "start_time": "00:00:00"}, "tuesday": {"end_time": "23:59:59.999999999", "start_time": "00:00:00"}, "saturday": {"end_time": "23:59:59.999999999", "start_time": "00:00:00"}, "thursday": {"end_time": "23:59:59.999999999", "start_time": "00:00:00"}, "wednesday": {"end_time": "23:59:59.999999999", "start_time": "00:00:00"}}'
);

insert into "user" (
  id,
  first_name,
  last_name,
  title,
  company,
  timezone,
  email,
  password_hash,
  is_active,
  email_verified,
  created_at,
  updated_at,
  default_team_id
) values (
  user_id, -- id
  'Test', -- first_name
  'User', -- last_name
  'Test User', -- title
  'Test Company', -- company
  'America/Denver', -- timezone
  'testuser@janium.ai', -- email
  -- password: 'testpass'
  '$argon2id$v=19$m=19456,t=2,p=1$vjrrNjx1ritBgBzFJqNO3w$zlcJh3/qIRu/ZnUgJ7btjGPRCmtUB/nVyJw7tG+9wD0',
  true, -- is_active
  false, -- email_verified
  now(), -- created_at
  now(), -- updated_at
  team_id -- default_team_id
);

insert into "user_team_map" values (
  gen_random_uuid(),
  user_id,
  team_id,
  '1',
  now()
);

-- Contact record for the LinkedIn account owner
insert into "contact" (id, first_name, last_name, full_name, li_profile_url) values
  (owner_contact_id, 'Elaine', 'Schauerhamer', 'Elaine Schauerhamer', 'elaine-schauerhamer');

linkedin_id := gen_random_uuid();

insert into "linked_in" (
  id,
  primary_user_id,
  team_id,
  linkedin_profile_url,
  full_name,
  max_pending_connection_requests,
  max_connection_requests_per_week,
  max_connection_requests_per_day,
  daily_connection_requests_variation_pct,
  minimum_delay_between_connection_requests_ms,
  weekly_restrictions,
  max_consecutive_errors,
  warmup_enabled,
  warmup_period_days,
  warmup_starting_connection_requests_per_day,
  today_options_updated,
  today_executable_window_start,
  today_executable_window_end,
  today_max_connection_requests,
  connections,
  login_active_last_validated,
  sales_navigator_active_last_validated,
  base_port,
  docker_username,
  docker_hostname,
  docker_host_mount,
  proxy_url,
  last_partial_sync,
  last_full_sync,
  contact_id
) values (
  linkedin_id,
  user_id,
  team_id,
  'https://www.linkedin.com/in/elaine-schauerhamer',
  'Elaine Schauerhamer',
  1800, -- max_pending_connection_requests,
  100, -- max_connection_requests_per_week,
  30, -- max_connection_requests_per_day,
  20, -- daily_connection_requests_variation_pct,
  180000, -- minimum_delay_between_connection_requests_ms,
  null, -- weekly_restrictions,
  null, -- max_consecutive_errors,
  false, -- warmup_enabled,
  20, -- warmup_period_days,
  5, -- warmup_starting_connection_requests_per_day,
  now(), -- today_options_updated,
  '00:00:00', -- today_executable_window_start,
  '23:59:59', -- today_executable_window_end,
  5, -- today_max_connection_requests,
  0, -- connections,
  now() - interval '1 month',
  now() - interval '1 month',
  1,
  'elaine.schauerhamer',
  'elaine',
  'test/elaine.schauerhamer',
  null,
  null,
  null,
  owner_contact_id
);

-- Test campaign with a SendLinkedInMessage step (no-op for tests)
insert into "campaign" (id, team_id, name, active, allowed_messaging_day_times, default_email_group, linkedin_ids) values (
  campaign_id,
  team_id,
  'Test Campaign',
  true,
  null,
  null,
  ARRAY[linkedin_id]
);

insert into "campaign_step" (id, campaign_id, enabled, priority, step_data, weekly_restrictions, ui) values (
  step_id,
  campaign_id,
  true,
  1,
  '{"send_linked_in_message": {"linkedin_message": "Hello {{first_name}}"}}',
  null,
  null
);

-- Test contacts
insert into "contact" (id, first_name, last_name, full_name) values
  (contact1_id, 'Alice', 'Test', 'Alice Test'),
  (contact2_id, 'Bob', 'Test', 'Bob Test'),
  (contact3_id, 'Charlie', 'Test', 'Charlie Test');

-- Add contacts to campaign: 2 in PendingStartStep (status=1), 1 in EndStep (status=3)
insert into "campaign_contact" (id, campaign_id, contact_id, step_id, status, last_action, delay_until, linkedin_id, evaluation_attempts) values
  (gen_random_uuid(), campaign_id, contact1_id, '00000000-0000-0000-0000-000000000000', 1, now(), null, null, 0),
  (gen_random_uuid(), campaign_id, contact2_id, '00000000-0000-0000-0000-000000000000', 1, now(), null, null, 0),
  (gen_random_uuid(), campaign_id, contact3_id, step_id, 3, now(), null, null, 0);

END;
$$;