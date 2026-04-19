alter index if exists "linkedin_action_requests_team_linkedin_expires_at_priority_idx" rename to "linkedin_action_requests_team_linkedin_idx";

CREATE TABLE "linkedin_action_history" (
  "id" uuid NOT NULL PRIMARY KEY,
  "action" jsonb NOT NULL,
  "action_type" smallint NOT NULL check (action_type >= 0),
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "linkedin_id" uuid NOT NULL REFERENCES "linked_in"("id"),
  "campaign_id" uuid REFERENCES "campaign"("id"),
  "campaign_step_id" uuid REFERENCES "campaign_step"("id"),
  "contact_id" uuid REFERENCES "contact"("id"),
  "priority" smallint NOT NULL check (priority >= 0),
  "started_at" timestamptz NOT NULL,
  "completed_at" timestamptz NOT NULL,
  "attempts" smallint NOT NULL check (attempts >= 0)
);

create index "linkedin_action_history_restrictions_idx" on "linkedin_action_history" ("team_id", "linkedin_id", "action_type", "completed_at");

CREATE TABLE "linkedin_action_failures" (
  "id" uuid NOT NULL PRIMARY KEY,
  "action" jsonb NOT NULL,
  "action_type" smallint NOT NULL check (action_type >= 0),
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "linkedin_id" uuid NOT NULL REFERENCES "linked_in"("id"),
  "campaign_id" uuid REFERENCES "campaign"("id"),
  "campaign_step_id" uuid REFERENCES "campaign_step"("id"),
  "contact_id" uuid REFERENCES "contact"("id"),
  "priority" smallint NOT NULL check (priority >= 0),
  "failed_at" timestamptz NOT NULL,
  "attempts" smallint NOT NULL check (attempts >= 0),
  "error" text NOT NULL,
  "html" text,
  "screenshot_png" bytea
);

create index "linkedin_action_failures_recent_idx" on "linkedin_action_failures" ("team_id", "linkedin_id", "failed_at");

alter table "linked_in" add column "today_max_connection_requests" smallint check ("today_max_connection_requests" > 0);
alter table "linked_in" add column "today_executable_window_start" time;
alter table "linked_in" add column "today_executable_window_end" time;
alter table "linked_in" add column "today_options_updated" timestamptz;

update "linked_in" set
  "today_max_connection_requests" = 5,
  "today_executable_window_start" = '00:00:00',
  "today_executable_window_end" = '00:00:00',
  "today_options_updated" = now() - interval '2 days';

alter table "linked_in" alter column "today_max_connection_requests" set NOT NULL;
alter table "linked_in" alter column "today_executable_window_start" set NOT NULL;
alter table "linked_in" alter column "today_executable_window_end" set NOT NULL;
alter table "linked_in" alter column "today_options_updated" set NOT NULL;

alter table "linkedin_action_requests" add column "action_type" smallint check ("action_type" >= 0);
update "linkedin_action_requests" set "action_type" = 2;
alter table "linkedin_action_requests" alter column "action_type" set NOT NULL;
