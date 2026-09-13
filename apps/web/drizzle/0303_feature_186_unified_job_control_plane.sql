-- Feature 186: additive Unified Job Control Plane foundation.
-- Existing worker_jobs/worker_job_events rows and legacy enum values are preserved.
-- Do not backfill external/provider identity from queue position.

ALTER TYPE "worker_job_status" ADD VALUE IF NOT EXISTS 'pending';--> statement-breakpoint
ALTER TYPE "worker_job_status" ADD VALUE IF NOT EXISTS 'leased';--> statement-breakpoint
ALTER TYPE "worker_job_status" ADD VALUE IF NOT EXISTS 'waiting_external';--> statement-breakpoint
ALTER TYPE "worker_job_status" ADD VALUE IF NOT EXISTS 'retry_scheduled';--> statement-breakpoint
ALTER TYPE "worker_job_status" ADD VALUE IF NOT EXISTS 'succeeded';--> statement-breakpoint
ALTER TYPE "worker_job_status" ADD VALUE IF NOT EXISTS 'cancelled';--> statement-breakpoint

ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "executionClass" varchar(32) NOT NULL DEFAULT 'short';--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "definitionHash" varchar(64);--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "attempt" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "maxAttempts" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "nextRetryAt" timestamptz;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "heartbeatAt" timestamptz;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "fencingVersion" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "progressJson" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "resultRef" text;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "scheduledAt" timestamptz;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "operatorReviewRequired" boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_jobs_due_retry_idx" ON "worker_jobs" ("status", "nextRetryAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_jobs_definition_hash_idx" ON "worker_jobs" ("tenantId", "definitionHash");--> statement-breakpoint

ALTER TABLE "worker_job_events" ADD COLUMN IF NOT EXISTS "eventSequence" integer;--> statement-breakpoint
ALTER TABLE "worker_job_events" ADD COLUMN IF NOT EXISTS "eventIdempotencyKey" varchar(200);--> statement-breakpoint
ALTER TABLE "worker_job_events" ADD COLUMN IF NOT EXISTS "attemptId" varchar(36);--> statement-breakpoint
WITH ranked_events AS (
  SELECT "id", row_number() OVER (PARTITION BY "workerJobId" ORDER BY "createdAt", "id") AS "rank"
  FROM "worker_job_events"
  WHERE "eventSequence" IS NULL
)
UPDATE "worker_job_events" AS events
SET "eventSequence" = ranked_events."rank"
FROM ranked_events
WHERE events."id" = ranked_events."id";--> statement-breakpoint
UPDATE "worker_job_events"
SET "eventIdempotencyKey" = 'legacy:' || "id"
WHERE "eventIdempotencyKey" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_events_job_event_sequence_unique" ON "worker_job_events" ("workerJobId", "eventSequence") WHERE "eventSequence" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_events_idempotency_unique" ON "worker_job_events" ("workerJobId", "eventIdempotencyKey") WHERE "eventIdempotencyKey" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "worker_job_attempts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE CASCADE,
  "attempt" integer NOT NULL,
  "leaseGeneration" integer NOT NULL DEFAULT 0,
  "runnerId" varchar(160),
  "leaseTokenHash" varchar(128),
  "leaseExpiresAt" timestamptz,
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  "terminalClass" varchar(32),
  "recoveryReason" varchar(500),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_attempts_job_attempt_unique" ON "worker_job_attempts" ("workerJobId", "attempt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_attempts_job_created_idx" ON "worker_job_attempts" ("workerJobId", "createdAt");--> statement-breakpoint
INSERT INTO "worker_job_attempts" ("workerJobId", "attempt", "leaseGeneration", "runnerId", "leaseExpiresAt", "createdAt")
SELECT "id", GREATEST("attempt", 1), "fencingVersion", "workerId", "leaseExpiresAt", "createdAt"
FROM "worker_jobs"
ON CONFLICT ("workerJobId", "attempt") DO NOTHING;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "worker_job_dispatches" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE CASCADE,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE SET NULL,
  "adapter" varchar(80) NOT NULL,
  "referenceNamespace" varchar(120) NOT NULL,
  "dispatchKind" varchar(40) NOT NULL DEFAULT 'publish',
  "dedupeKey" varchar(200) NOT NULL,
  "providerJobId" varchar(255),
  "queueJobId" varchar(255),
  "celeryTaskId" varchar(255),
  "workflowInstanceId" varchar(255),
  "containerInstanceId" varchar(255),
  "publicationStatus" varchar(32) NOT NULL DEFAULT 'published',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "publishedAt" timestamptz,
  "consumedAt" timestamptz,
  "failedAt" timestamptz
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_dispatches_dedupe_unique" ON "worker_job_dispatches" ("adapter", "dedupeKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_dispatches_job_created_idx" ON "worker_job_dispatches" ("workerJobId", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_dispatches_external_ref_idx" ON "worker_job_dispatches" ("referenceNamespace", "providerJobId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_dispatches_provider_ref_unique" ON "worker_job_dispatches" ("referenceNamespace", "providerJobId") WHERE "providerJobId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_dispatches_queue_ref_unique" ON "worker_job_dispatches" ("referenceNamespace", "queueJobId") WHERE "queueJobId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_dispatches_celery_ref_unique" ON "worker_job_dispatches" ("referenceNamespace", "celeryTaskId") WHERE "celeryTaskId" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "worker_job_outbox" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE CASCADE,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE SET NULL,
  "envelopeVersion" varchar(40) NOT NULL,
  "envelopeJson" jsonb NOT NULL,
  "dedupeKey" varchar(200) NOT NULL,
  "publishAttempts" integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "publisherLeaseTokenHash" varchar(128),
  "publisherLeaseExpiresAt" timestamptz,
  "publisherFencingVersion" integer NOT NULL DEFAULT 0,
  "publishedAt" timestamptz,
  "failedReason" text,
  "quarantinedAt" timestamptz,
  "operatorReviewReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_outbox_dedupe_unique" ON "worker_job_outbox" ("dedupeKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_outbox_due_idx" ON "worker_job_outbox" ("publishedAt", "quarantinedAt", "nextAttemptAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_outbox_job_idx" ON "worker_job_outbox" ("workerJobId", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "worker_job_schedule_occurrences" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scheduleId" varchar(160) NOT NULL,
  "occurrenceKey" varchar(200) NOT NULL,
  "scheduleVersion" varchar(80) NOT NULL,
  "timezone" varchar(80) NOT NULL,
  "definitionHash" varchar(64) NOT NULL,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_schedule_occurrence_unique" ON "worker_job_schedule_occurrences" ("tenantId", "scheduleId", "occurrenceKey");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_schedule_occurrence_job_unique" ON "worker_job_schedule_occurrences" ("workerJobId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_schedule_occurrence_job_idx" ON "worker_job_schedule_occurrences" ("workerJobId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_job_settlements" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE CASCADE,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE SET NULL,
  "settlementKey" varchar(200) NOT NULL,
  "settlementType" varchar(64) NOT NULL,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "committedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_settlements_key_unique" ON "worker_job_settlements" ("settlementKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_settlements_job_idx" ON "worker_job_settlements" ("workerJobId", "committedAt");
