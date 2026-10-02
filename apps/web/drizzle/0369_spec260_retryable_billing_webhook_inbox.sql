SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
--> statement-breakpoint

ALTER TABLE "webhook_events"
  ADD COLUMN IF NOT EXISTS "processingStartedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "processingAttempts" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_events_pending_retry_idx"
  ON "webhook_events" ("createdAt")
  WHERE "processingStatus" = 'pending';
--> statement-breakpoint
