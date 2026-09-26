CREATE TABLE IF NOT EXISTS "oauth_device_authorizations" (
  "device_code_hash" varchar(64) PRIMARY KEY,
  "user_code_hash" varchar(64) NOT NULL UNIQUE,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "scopes_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "interval_seconds" integer NOT NULL DEFAULT 5,
  "expires_at" timestamptz NOT NULL,
  "authorized_user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "authorized_open_id" varchar(64),
  "authorized_at" timestamptz,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "oauth_device_authorizations_status_check"
    CHECK ("status" IN ('pending', 'authorized', 'consumed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_device_authorizations_expiry_idx"
  ON "oauth_device_authorizations" ("expires_at");
