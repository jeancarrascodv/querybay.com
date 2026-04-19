-- Stores LinkedIn connections scraped from the connections list
CREATE TABLE "linkedin_connections" (
  "id" uuid NOT NULL PRIMARY KEY,
  "linkedin_id" uuid NOT NULL REFERENCES "linked_in"("id"),
  "contact_id" uuid NOT NULL REFERENCES "contact"("id"),
  "connected_on" date,
  "first_seen" timestamptz NOT NULL,
  "last_seen" timestamptz NOT NULL,
  "disconnected" boolean NOT NULL
);

-- Fast lookup by linkedin account + contact (for deduplication and known_profiles set)
CREATE UNIQUE INDEX "linkedin_connections_linkedin_contact_idx"
  ON "linkedin_connections" ("linkedin_id", "contact_id");

CREATE UNIQUE INDEX "contact_linkedin_profile_handle_idx"
  ON "contact" ("li_profile_url");

alter table "contact" add constraint no_li_profile_handle_slash check (li_profile_url !~ '[/]');

CREATE UNIQUE INDEX "contact_linkedin_sales_nav_profile_id_idx"
  ON "contact" ("li_sales_nav_profile_id");
alter table "contact" add constraint no_li_sales_nav_profile_id_slash_comma check (li_sales_nav_profile_id !~ '[/,]');

CREATE UNIQUE INDEX "campaign_contact_campaign_id_contact_id_idx"
  ON "campaign_contact" ("campaign_id", "contact_id");
