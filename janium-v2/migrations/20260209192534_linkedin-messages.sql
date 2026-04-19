-- LinkedIn conversations (must exist before messages for FK)
CREATE TABLE "linkedin_conversations" (
  "id" uuid NOT NULL PRIMARY KEY,
  "linkedin_id" uuid NOT NULL REFERENCES "linked_in"("id"),
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "linkedin_conversation_id" text NOT NULL,
  "participant_contact_ids" uuid[] NOT NULL,
  "last_message_at" timestamptz,
  "message_count" bigint NOT NULL,
  "is_read" boolean NOT NULL,
  "last_message_preview" text,
  "created_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX "linkedin_conversations_linkedin_id_conversation_id_idx"
  ON "linkedin_conversations" ("linkedin_id", "linkedin_conversation_id");

-- Stores individual LinkedIn messages scraped from the messaging inbox
CREATE TABLE "linkedin_messages" (
  "id" uuid NOT NULL PRIMARY KEY,
  "conversation_id" uuid NOT NULL REFERENCES "linkedin_conversations"("id"),
  "sender_contact_id" uuid NOT NULL REFERENCES "contact"("id"),
  "content" text NOT NULL,
  "timestamp" timestamptz,
  "message_hash" bytea NOT NULL CHECK (length(message_hash) = 32),
  "created_at" timestamptz NOT NULL
);

-- Deduplicate: same conversation + same message hash = same message
CREATE UNIQUE INDEX "linkedin_messages_conversation_id_message_hash_idx"
  ON "linkedin_messages" ("conversation_id", "message_hash");

-- Query messages by conversation
CREATE INDEX "linkedin_messages_conversation_id_idx"
  ON "linkedin_messages" ("conversation_id");

-- Query messages by sender contact
CREATE INDEX "linkedin_messages_sender_contact_id_idx"
  ON "linkedin_messages" ("sender_contact_id");

-- Insert a sentinel contact for the nil UUID so the FK constraint is preserved.
INSERT INTO "contact" ("id", "full_name") VALUES ('00000000-0000-0000-0000-000000000000', 'Nil Contact') ON CONFLICT DO NOTHING;

-- Link LinkedIn account to its owner's contact record
ALTER TABLE "linked_in" ADD COLUMN "contact_id" uuid REFERENCES "contact"("id");
UPDATE "linked_in" SET "contact_id" = '00000000-0000-0000-0000-000000000000' WHERE "contact_id" IS NULL;
ALTER TABLE "linked_in" ALTER COLUMN "contact_id" SET NOT NULL;

-- Add last inbox download timestamps
ALTER TABLE "linked_in" ADD COLUMN "last_inbox_download" timestamptz;
ALTER TABLE "linked_in" ADD COLUMN "last_full_inbox_download" timestamptz;
