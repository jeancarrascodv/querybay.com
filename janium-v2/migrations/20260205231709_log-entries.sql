CREATE TABLE "log_entries" (
  "level" smallint NOT NULL CHECK (level >= 0 AND level <= 4),
  "message" text NOT NULL,
  "target" text NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT NOW(),

  -- Association IDs (all nullable)
  "team_id" uuid REFERENCES "team"("id") ON DELETE SET NULL,
  "campaign_id" uuid REFERENCES "campaign"("id") ON DELETE SET NULL,
  "campaign_step_id" uuid REFERENCES "campaign_step"("id") ON DELETE SET NULL,
  "contact_id" uuid REFERENCES "contact"("id") ON DELETE SET NULL,
  "linkedin_id" uuid REFERENCES "linked_in"("id") ON DELETE SET NULL,
  "action_id" uuid,
  "request_id" uuid,

  -- Structured fields
  "fields" jsonb DEFAULT '{}'::jsonb
);

-- Indexes for query patterns
CREATE INDEX "log_entries_timestamp_idx" ON "log_entries" ("timestamp");
CREATE INDEX "log_entries_team_id_idx" ON "log_entries" ("team_id", "timestamp") WHERE team_id IS NOT NULL;
CREATE INDEX "log_entries_campaign_id_idx" ON "log_entries" ("campaign_id", "timestamp") WHERE campaign_id IS NOT NULL;
CREATE INDEX "log_entries_linkedin_id_idx" ON "log_entries" ("linkedin_id", "action_id") WHERE linkedin_id IS NOT NULL;
CREATE INDEX "log_entries_runner_id_idx" ON "log_entries" ("request_id") WHERE request_id IS NOT NULL;
CREATE INDEX "log_entries_errors_idx" ON "log_entries" ("timestamp") WHERE level >= 3;

