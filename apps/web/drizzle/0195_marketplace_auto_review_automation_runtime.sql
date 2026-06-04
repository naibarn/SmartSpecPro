CREATE TABLE IF NOT EXISTS "marketplace_auto_review_run_leases" (
  "id" varchar(128) PRIMARY KEY,
  "runId" varchar(64) NOT NULL REFERENCES "marketplace_auto_review_runs"("id") ON DELETE cascade,
  "tenantId" varchar(36),
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "stageKey" varchar(64) NOT NULL,
  "ownerToken" varchar(256) NOT NULL,
  "schedulerSource" varchar(128),
  "status" varchar(32) NOT NULL DEFAULT 'claimed',
  "claimedAt" timestamptz NOT NULL,
  "heartbeatAt" timestamptz,
  "expiresAt" timestamptz NOT NULL,
  "releasedAt" timestamptz,
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_run_leases_run_idx"
  ON "marketplace_auto_review_run_leases" ("runId", "expiresAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_run_leases_owner_idx"
  ON "marketplace_auto_review_run_leases" ("ownerToken");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_run_leases_status_idx"
  ON "marketplace_auto_review_run_leases" ("status", "expiresAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "marketplace_auto_review_stage_attempts" (
  "id" bigserial PRIMARY KEY,
  "runId" varchar(64) NOT NULL REFERENCES "marketplace_auto_review_runs"("id") ON DELETE cascade,
  "stageKey" varchar(64) NOT NULL,
  "attemptKey" varchar(192) NOT NULL,
  "attemptNumber" integer NOT NULL DEFAULT 1,
  "status" varchar(40) NOT NULL DEFAULT 'running',
  "reasonCode" varchar(160),
  "providerTaskRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "creditRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "repairDecisionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "artifactRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "evidenceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_auto_review_stage_attempts_key_unique"
  ON "marketplace_auto_review_stage_attempts" ("runId", "attemptKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_stage_attempts_stage_idx"
  ON "marketplace_auto_review_stage_attempts" ("runId", "stageKey", "updatedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_stage_attempts_status_idx"
  ON "marketplace_auto_review_stage_attempts" ("status", "updatedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "marketplace_auto_review_provider_events" (
  "id" varchar(128) PRIMARY KEY,
  "runId" varchar(64) NOT NULL REFERENCES "marketplace_auto_review_runs"("id") ON DELETE cascade,
  "stageKey" varchar(64) NOT NULL,
  "providerName" varchar(128),
  "providerTaskId" varchar(256) NOT NULL,
  "mediaTaskId" varchar(128),
  "eventType" varchar(80) NOT NULL,
  "status" varchar(40) NOT NULL,
  "signatureStatus" varchar(40) NOT NULL DEFAULT 'internal_snapshot',
  "replayKey" varchar(256) NOT NULL,
  "resultUrl" text,
  "creditRef" varchar(256),
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_auto_review_provider_events_replay_unique"
  ON "marketplace_auto_review_provider_events" ("replayKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_provider_events_run_idx"
  ON "marketplace_auto_review_provider_events" ("runId", "stageKey", "receivedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_provider_events_task_idx"
  ON "marketplace_auto_review_provider_events" ("providerTaskId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_provider_events_status_idx"
  ON "marketplace_auto_review_provider_events" ("status", "receivedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "marketplace_auto_review_outbox_jobs" (
  "id" varchar(128) PRIMARY KEY,
  "runId" varchar(64) NOT NULL REFERENCES "marketplace_auto_review_runs"("id") ON DELETE cascade,
  "tenantId" varchar(36),
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "jobType" varchar(80) NOT NULL,
  "idempotencyKey" varchar(256) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'queued',
  "priority" integer NOT NULL DEFAULT 100,
  "attempts" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 3,
  "lockedBy" varchar(160),
  "lockedUntil" timestamptz,
  "scheduledAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastError" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_auto_review_outbox_jobs_idempotency_unique"
  ON "marketplace_auto_review_outbox_jobs" ("idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_outbox_jobs_ready_idx"
  ON "marketplace_auto_review_outbox_jobs" ("status", "scheduledAt", "priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_outbox_jobs_run_idx"
  ON "marketplace_auto_review_outbox_jobs" ("runId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_outbox_jobs_lock_idx"
  ON "marketplace_auto_review_outbox_jobs" ("lockedUntil");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "marketplace_auto_review_artifacts" (
  "id" varchar(128) PRIMARY KEY,
  "runId" varchar(64) NOT NULL REFERENCES "marketplace_auto_review_runs"("id") ON DELETE cascade,
  "stageKey" varchar(64) NOT NULL,
  "artifactKind" varchar(100) NOT NULL,
  "storageKey" text NOT NULL,
  "storageUrl" text,
  "contentHash" varchar(128) NOT NULL,
  "mimeType" varchar(160) NOT NULL,
  "sizeBytes" integer,
  "status" varchar(40) NOT NULL DEFAULT 'ready',
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_auto_review_artifacts_hash_unique"
  ON "marketplace_auto_review_artifacts" ("runId", "artifactKind", "contentHash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_artifacts_run_idx"
  ON "marketplace_auto_review_artifacts" ("runId", "stageKey", "artifactKind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_artifacts_status_idx"
  ON "marketplace_auto_review_artifacts" ("status", "createdAt");
