CREATE TABLE "team" (
  "id" uuid NOT NULL PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  "time_zone" text NOT NULL,
  "allowed_messaging_day_times" jsonb NOT NULL
);

CREATE TABLE "campaign" (
  "id" uuid NOT NULL PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "active" bool NOT NULL,
  "allowed_messaging_day_times" jsonb NOT NULL
);

CREATE TABLE "campaign_step" (
  "id" uuid NOT NULL PRIMARY KEY,
  "campaign_id" uuid NOT NULL REFERENCES "campaign"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL,
  "priority" smallint NOT NULL,
  "step_data" jsonb NOT NULL,
  "weekly_restrictions" jsonb NOT NULL,
  "ui" jsonb
);

CREATE TABLE "campaign_step_link" (
  "id" uuid NOT NULL PRIMARY KEY,
  "campaign_id" uuid NOT NULL REFERENCES "campaign"("id") ON DELETE CASCADE,
  "prev" uuid NOT NULL REFERENCES "campaign_step"("id") ON DELETE CASCADE,
  "next" uuid NOT NULL REFERENCES "campaign_step"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL,
  "delay" interval NOT NULL,
  "random_delay" interval NOT NULL,
  "priority" smallint NOT NULL,
  "filter" jsonb not null
);

CREATE TABLE "company" (
  "id" uuid NOT NULL PRIMARY KEY,
  "li_profile_url" text NOT NULL,
  "name" text,
  "website" text,
  "city" text,
  "state" text,
  "state_abbr" text,
  "country_full" text,
  "country_2" text,
  "country_3" text,
  "location" text,
  "phone_1" text,
  "phone_2" text,
  "phone_3" text,
  "annual_revenue" bigint,
  "website_domain" text,
  "founded_year" smallint,
  "industry" text,
  "revenue_range" text,
  "staff_count" integer,
  "staff_count_range" text
);

CREATE TABLE "contact" (
  "id" uuid NOT NULL PRIMARY KEY,
  "company_id" uuid REFERENCES "company"("id") ON DELETE CASCADE,
  "first_name" text NOT NULL,
  "middle_name" text,
  "last_name" text,
  "li_profile_url" text,
  "li_sales_nav_profile_url" text,
  "title" text,
  "company" text,
  "location" text,
  "website" text,
  "full_name" text,
  "preferred_name" text,
  "department" text,
  "seniority" text,
  "city" text,
  "state" text,
  "state_abbr" text,
  "country_full" text,
  "country_2" text,
  "country_3" text
);

CREATE TABLE "contact_email" (
  "id" uuid NOT NULL PRIMARY KEY,
  "contact_id" uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "emails_sent" smallint NOT NULL,
  "emails_opened" smallint NOT NULL,
  "email_type" smallint NOT NULL,
  "priority" smallint NOT NULL,
  "email_source" smallint NOT NULL,
  "confidence_score" smallint NOT NULL,
  "validation_type" smallint NOT NULL,
  "inactive_reason" text
);

CREATE TABLE "contact_phone" (
  "id" uuid NOT NULL PRIMARY KEY,
  "contact_id" uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "phone" text NOT NULL,
  "phone_type" smallint NOT NULL,
  "priority" smallint NOT NULL,
  "confidence_score" smallint NOT NULL
);

CREATE TABLE "contact_list" (
  "id" uuid NOT NULL PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "sales_nav_query" text,
  "compressed_csv" bytea,
  "created_date" timestamptz NOT NULL
);

CREATE TABLE "contact_list_contact" (
  "id" uuid NOT NULL PRIMARY KEY,
  "contact_list_id" uuid NOT NULL REFERENCES "contact_list"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE
);

CREATE TABLE "campaign_contact" (
  "id" uuid NOT NULL PRIMARY KEY,
  "campaign_id" uuid NOT NULL REFERENCES "campaign"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "step_id" uuid NOT NULL,
  "status" smallint NOT NULL,
  "extra_data" jsonb,
  "last_action" timestamptz NOT NULL,
  "delay_until" timestamptz
);

CREATE TABLE "email_action" (
  "id" uuid NOT NULL PRIMARY KEY,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "campaign"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contact"("id") ON DELETE CASCADE,
  "timestamp" timestamptz NOT NULL,
  "action_type" smallint NOT NULL,
  "to_address" text,
  "from_address" text,
  "email_body_html" text,
  "message_id" text
);
