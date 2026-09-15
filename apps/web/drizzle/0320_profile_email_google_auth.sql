-- Account profile security: verified email replacement and Google-only login.
-- Additive migration. Existing users, IDs, tenant bindings, sessions, and
-- oauth_connections rows are preserved.
CREATE TABLE IF NOT EXISTS "account_email_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenantId" varchar(36),
  "pendingEmail" varchar(320) NOT NULL,
  "pendingNormalizedEmail" varchar(320) NOT NULL,
  "tokenHash" varchar(64) NOT NULL UNIQUE,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "requestIp" varchar(45),
  "userAgent" varchar(255)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_email_change_user_pending_idx"
  ON "account_email_change_requests" ("userId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_email_change_expiry_idx"
  ON "account_email_change_requests" ("expiresAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_email_change_one_pending_idx"
  ON "account_email_change_requests" ("userId")
  WHERE "status" = 'pending';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_google_link_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "stateHash" varchar(64) NOT NULL UNIQUE,
  "sessionHash" varchar(64) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "provider" varchar(32) NOT NULL DEFAULT 'google',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "requestIp" varchar(45),
  "userAgent" varchar(255)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_google_link_user_pending_idx"
  ON "account_google_link_transactions" ("userId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_google_link_expiry_idx"
  ON "account_google_link_transactions" ("expiresAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_google_link_one_pending_idx"
  ON "account_google_link_transactions" ("userId")
  WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_connections_provider_subject_idx"
  ON "oauth_connections" ("provider", "provider_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_connections_user_provider_idx"
  ON "oauth_connections" ("user_id", "provider");
