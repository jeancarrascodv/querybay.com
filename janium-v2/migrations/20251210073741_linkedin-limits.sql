ALTER TABLE "linked_in" RENAME COLUMN "max_pending_connections" TO "max_pending_connection_requests";
ALTER TABLE "linked_in" RENAME COLUMN "max_connections_per_week" TO "max_connection_requests_per_week";
ALTER TABLE "linked_in" RENAME COLUMN "max_messages_per_week" TO "max_connection_requests_per_week_with_message";
ALTER TABLE "linked_in" ADD COLUMN "max_connection_requests_per_week_without_message" smallint;
ALTER TABLE "linked_in" ADD COLUMN "daily_connection_requests_variation" smallint;
ALTER TABLE "linked_in" ADD COLUMN "minimum_delay_between_connection_requests_ms" integer;
ALTER TABLE "linked_in" ADD COLUMN "weekly_restrictions" jsonb;
ALTER TABLE "linked_in" ADD COLUMN "connection_request_warmup_days" smallint[];
ALTER TABLE "linked_in" ADD COLUMN "connection_request_warmup_counts" smallint[];
ALTER TABLE "linked_in" ADD COLUMN "connections" smallint;

UPDATE "linked_in" SET 
  "max_connection_requests_per_week_with_message" = 100,
  "max_connection_requests_per_week_without_message" = 100,
  "daily_connection_requests_variation" = 7,
  "minimum_delay_between_connection_requests_ms" = 180000,
  "weekly_restrictions" = '{"monday": {"start_time": "09:00:00", "end_time": "17:00:00"}, "tuesday": {"start_time": "09:00:00", "end_time": "17:00:00"}, "wednesday": {"start_time": "09:00:00", "end_time": "17:00:00"}, "thursday": {"start_time": "09:00:00", "end_time": "17:00:00"}, "friday": {"start_time": "09:00:00", "end_time": "17:00:00"}}',
  "connection_request_warmup_days" = '{5, 5, 5, 5}',
  "connection_request_warmup_counts" = '{5, 10, 15, 20}',
  "connections" = 0;

ALTER TABLE "linked_in" ALTER COLUMN "max_connection_requests_per_week_with_message" SET NOT NULL;
ALTER TABLE "linked_in" ALTER COLUMN "max_connection_requests_per_week_without_message" SET NOT NULL;
ALTER TABLE "linked_in" ALTER COLUMN "daily_connection_requests_variation" SET NOT NULL;
ALTER TABLE "linked_in" ALTER COLUMN "minimum_delay_between_connection_requests_ms" SET NOT NULL;
ALTER TABLE "linked_in" ALTER COLUMN "weekly_restrictions" SET NOT NULL;
ALTER TABLE "linked_in" ALTER COLUMN "connection_request_warmup_days" SET NOT NULL;
ALTER TABLE "linked_in" ALTER COLUMN "connection_request_warmup_counts" SET NOT NULL;
ALTER TABLE "linked_in" ALTER COLUMN "connections" SET NOT NULL;
