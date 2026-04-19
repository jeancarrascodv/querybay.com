
alter table "linked_in" drop column if exists "max_connection_requests_per_week_with_message";
alter table "linked_in" drop column if exists "max_connection_requests_per_week_without_message";
alter table "linked_in" drop column "connection_request_warmup_days";
alter table "linked_in" drop column "connection_request_warmup_counts";
alter table "linked_in" drop column "email";

alter table "linked_in" add column "max_consecutive_errors" smallint;
alter table "linked_in" add column "warmup_enabled" boolean;
alter table "linked_in" add column "warmup_period_days" smallint;
alter table "linked_in" add column "warmup_starting_connection_requests_per_week" smallint;
alter table "linked_in" rename column "daily_connection_requests_variation" to "daily_connection_requests_variation_pct";
update "linked_in" set "warmup_enabled" = true, "warmup_period_days" = 20, "daily_connection_requests_variation_pct" = 20;

alter table "linked_in" alter column "warmup_enabled" set not null;

