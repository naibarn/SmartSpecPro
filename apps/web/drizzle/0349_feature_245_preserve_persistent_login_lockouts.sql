SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "auth_login_failure_counters"
  ALTER COLUMN "expires_at" DROP NOT NULL;
