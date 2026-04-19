alter table "campaign" alter column "allowed_messaging_day_times" drop not null;
alter table "contact_list" add column "linkedin_id" uuid references "linked_in"("id");

-- Rename warmup starting value from weekly to daily
ALTER TABLE "linked_in" RENAME COLUMN "warmup_starting_connection_requests_per_week" TO "warmup_starting_connection_requests_per_day";

-- Convert existing weekly values to daily (divide by 7, round up to ensure at least 1)
UPDATE "linked_in"
SET "warmup_starting_connection_requests_per_day" = GREATEST(1, ROUND("warmup_starting_connection_requests_per_day"::numeric / 7))
WHERE "warmup_starting_connection_requests_per_day" IS NOT NULL;
