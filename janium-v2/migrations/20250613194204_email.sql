CREATE TABLE "email_domain" (
  "domain" text NOT NULL PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "hourly_limit" integer NOT NULL,
  "daily_limit" integer NOT NULL,
  "weekly_limit" integer NOT NULL,
  "sender" jsonb NOT NULL
);

CREATE TABLE "email" (
  "email" text NOT NULL PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "domain" text NOT NULL REFERENCES "email_domain"("domain"),
  "hourly_limit" integer NOT NULL,
  "daily_limit" integer NOT NULL,
  "weekly_limit" integer NOT NULL,
  "forwarding_key" text NOT NULL,
  "forwarding_rule_last_verified" timestamp with time zone,
  "active" boolean NOT NULL
);

CREATE TABLE "email_group" (
  "id" uuid NOT NULL PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "name" text NOT NULL
);

ALTER TABLE "campaign" ADD COLUMN "default_email_group" uuid REFERENCES "email_group"("id") ON DELETE CASCADE;
CREATE TABLE "email_group_relation" (
  "id" uuid NOT NULL PRIMARY KEY,
  "email_group_id" uuid NOT NULL REFERENCES "email_group"("id") ON DELETE CASCADE,
  "email" text NOT NULL REFERENCES "email"("email") ON DELETE CASCADE
);

CREATE TABLE "email_response" (
  "id" uuid NOT NULL PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "to_address" text NOT NULL,
  "from_address" text NOT NULL,
  "email_subject" text NOT NULL,
  "email_body_html" text NOT NULL,
  "sent_timestamp" timestamp with time zone NOT NULL
);

CREATE TABLE "sent_email_history" (
  "message_id" text NOT NULL PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "contact_id" uuid NOT NULL REFERENCES "contact"("id"),
  "campaign_id" uuid NOT NULL REFERENCES "campaign"("id"),
  "campaign_step_id" uuid NOT NULL REFERENCES "campaign_step"("id"),
  "to_address" text NOT NULL,
  "from_address" text NOT NULL REFERENCES "email"("email"),
  "email_subject" text NOT NULL,
  "email_body_html" text NOT NULL,
  "sent_timestamp" timestamp with time zone NOT NULL,
  "delivered_timestamp" timestamp with time zone,
  "opened_timestamp" timestamp with time zone,
  "clicked_link_timestamp" timestamp with time zone,
  "bounced_timestamp" timestamp with time zone,
  "complaint_timestamp" timestamp with time zone,
  "response_received_timestamp" timestamp with time zone,
  "response_id" uuid REFERENCES "email_response"("id")
);
