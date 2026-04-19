CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID PRIMARY KEY,
  execute_at TIMESTAMPTZ NOT NULL,
  kind JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_policy JSONB,
  attempts INT2 NOT NULL DEFAULT 0
);

CREATE INDEX idx_scheduled_tasks_execute_at ON scheduled_tasks (execute_at);

ALTER TABLE campaign_contact ADD COLUMN evaluation_attempts INT2;
UPDATE campaign_contact SET evaluation_attempts = 0;
ALTER TABLE campaign_contact ALTER COLUMN evaluation_attempts SET NOT NULL;
