ALTER TABLE "linked_in" ADD COLUMN "max_connection_requests_per_day" smallint;
UPDATE "linked_in" SET "max_connection_requests_per_day" = 30;
ALTER TABLE "linked_in" ALTER COLUMN "max_connection_requests_per_day" SET NOT NULL;
