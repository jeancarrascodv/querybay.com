
CREATE TABLE "linked_in" (
  "id" uuid NOT NULL PRIMARY KEY,
  "primary_user_id" uuid NOT NULL REFERENCES "user"("id"),
  "team_id" uuid NOT NULL REFERENCES "team"("id"),
  "email" text NOT NULL UNIQUE,
  "profile_url_handle" text NOT NULL UNIQUE,
  "full_name" text NOT NULL,
  "max_pending_connections" smallint NOT NULL CHECK ("max_pending_connections" > 0),
  "max_connections_per_week" smallint NOT NULL CHECK ("max_connections_per_week" > 0),
  "max_messages_per_week" smallint NOT NULL CHECK ("max_messages_per_week" > 0),
  "login_active_last_validated" timestamptz,
  "sales_navigator_active_last_validated" timestamptz,
  "base_port" smallint NOT NULL UNIQUE CHECK ("base_port" >= 0),
  "docker_username" text NOT NULL CHECK ("docker_username" <> ''),
  "docker_hostname" text NOT NULL CHECK ("docker_hostname" <> ''),
  "docker_host_mount" text NOT NULL CHECK ("docker_host_mount" <> ''),
  "proxy_url" text CHECK ("proxy_url" <> '')
);
