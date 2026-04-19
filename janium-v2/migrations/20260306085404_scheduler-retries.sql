ALTER TABLE "scheduled_tasks" DROP COLUMN "retry_policy";
ALTER TABLE "scheduled_tasks" ADD COLUMN "max_retries" smallint;
UPDATE "scheduled_tasks" SET "max_retries" = 0;
ALTER TABLE "scheduled_tasks" ALTER COLUMN "max_retries" SET NOT NULL;
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "max_retries_positive" CHECK ("max_retries" >= 0);
ALTER TABLE "scheduled_tasks" ADD COLUMN "retry_delay_ms" bigint;
UPDATE "scheduled_tasks" SET "retry_delay_ms" = 0;
ALTER TABLE "scheduled_tasks" ALTER COLUMN "retry_delay_ms" SET NOT NULL;
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "retry_delay_ms_positive" CHECK ("retry_delay_ms" >= 0);