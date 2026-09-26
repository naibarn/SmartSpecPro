SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_login_failure_counters" (
  "email_hash" varchar(64) PRIMARY KEY,
  "failure_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_login_failure_counters_expiry_idx"
  ON "auth_login_failure_counters" ("expires_at");
