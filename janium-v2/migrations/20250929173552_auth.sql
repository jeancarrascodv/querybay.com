-- User authentication tables
CREATE TABLE "user" (
  "id" uuid NOT NULL PRIMARY KEY,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "title" text NOT NULL,
  "company" text NOT NULL,
  "timezone" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "email_verified" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

insert into "user" values (
  '00000000-0000-0000-0000-000000000000',
  'Super',
  'Admin',
  'Super Admin',
  'Janium',
  'UTC',
  'superadmin@janium.ai',
  'superadmin',
  true,
  true,
  now(),
  now()
);

CREATE TABLE "invite" (
  "code" text NOT NULL PRIMARY KEY,
  "email" text NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "privileges" smallint NOT NULL,
  "created_at" timestamptz NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "user"("id"),
  "expires_at" timestamptz NOT NULL
);

CREATE TABLE "user_team_map" (
  "id" uuid NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user"("id"),
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "privileges" smallint NOT NULL,
  "created_at" timestamptz NOT NULL
);

-- Refresh tokens for long-lived authentication
CREATE TABLE "refresh_token" (
  "token_hash" bytea NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");
CREATE INDEX "refresh_token_expires_at_idx" ON "refresh_token"("expires_at");

-- API keys for long-lived programmatic access
CREATE TABLE "api_key" (
  "key_hash" bytea NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL, -- First 8 characters for identification
  "permissions" smallint NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "last_used_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX "api_key_user_id_idx" ON "api_key"("user_id");
CREATE INDEX "api_key_team_id_idx" ON "api_key"("team_id");
CREATE INDEX "api_key_key_prefix_idx" ON "api_key"("key_prefix");
CREATE INDEX "api_key_expires_at_idx" ON "api_key"("expires_at");
