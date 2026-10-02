SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

-- Canonical active-job exclusion replaces Redis active pointers for new work.
-- Existing jobs remain unchanged and terminal jobs release their scope.
ALTER TABLE "worker_jobs"
  ADD COLUMN IF NOT EXISTS "activeDedupeKey" varchar(160);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "worker_jobs_tenant_active_dedupe_key_unique"
  ON "worker_jobs" ("tenantId", "activeDedupeKey")
  WHERE "activeDedupeKey" IS NOT NULL
    AND "status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing');
