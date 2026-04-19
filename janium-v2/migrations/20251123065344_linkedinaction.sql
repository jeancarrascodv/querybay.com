CREATE TABLE "linkedin_action_requests" (
  "id" uuid NOT NULL PRIMARY KEY,
  "action" jsonb NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "linkedin_id" uuid NOT NULL REFERENCES "linked_in"("id"),
  "campaign_id" uuid REFERENCES "campaign"("id"),
  "campaign_step_id" uuid REFERENCES "campaign_step"("id"),
  "contact_id" uuid REFERENCES "contact"("id"),
  "expires_at" timestamptz NOT NULL,
  "priority" smallint NOT NULL check (priority >= 0),
  "next_attempt_at" timestamptz not null,
  "last_attempt_status" smallint not null check (last_attempt_status >= 0),
  "attempts" smallint NOT NULL check (attempts >= 0)
);

create index "linkedin_action_requests_team_linkedin_expires_at_priority_idx"
  on "linkedin_action_requests" (
    "team_id",
    "linkedin_id"
  );

alter table "contact_list_contact" drop column "id";
alter table "contact_list_contact" add primary key ("contact_list_id", "contact_id");
