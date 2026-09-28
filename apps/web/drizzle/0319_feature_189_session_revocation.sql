-- Feature 189 — invalidate all browser/device sessions after a tenant move.
-- Additive only; existing tokens remain valid until explicitly fenced by this
-- timestamp, and old rows are not rewritten.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "sessionRevokedAt" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_session_revoked_idx"
  ON "users" ("sessionRevokedAt");
