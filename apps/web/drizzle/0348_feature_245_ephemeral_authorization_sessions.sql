SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ephemeral_authorization_sessions" (
  "device_code_hash" varchar(64) PRIMARY KEY,
  "user_code_hash" varchar(64) UNIQUE,
  "session_json" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ephemeral_authorization_sessions_expiry_idx"
  ON "ephemeral_authorization_sessions" ("expires_at");
