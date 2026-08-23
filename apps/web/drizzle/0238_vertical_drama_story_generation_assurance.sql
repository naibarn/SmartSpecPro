CREATE TABLE IF NOT EXISTS "vertical_drama_story_generation_runs" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "runId" varchar(64) NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "runKey" varchar(256) NOT NULL,
  "idempotencyKey" varchar(256) NOT NULL,
  "taskKind" varchar(32) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "stage" varchar(32) NOT NULL DEFAULT 'admission',
  "contractVersion" varchar(64) NOT NULL,
  "contractHash" varchar(64) NOT NULL,
  "sourceRevision" varchar(256) NOT NULL,
  "sourceFingerprint" varchar(64) NOT NULL,
  "sourceSnapshotJson" jsonb NOT NULL,
  "contractJson" jsonb NOT NULL,
  "checkpointJson" jsonb,
  "validationReportJson" jsonb,
  "eventCursor" integer NOT NULL DEFAULT 0,
  "activeAttemptId" varchar(64),
  "leaseOwner" varchar(128),
  "leaseExpiresAt" timestamptz,
  "fenceToken" integer NOT NULL DEFAULT 0,
  "finalArtifactId" bigint,
  "finalizationKey" varchar(256),
  "acceptedPlanVersionId" varchar(128),
  "sourcePlanCandidateArtifactId" bigint,
  "reservedCredits" integer NOT NULL DEFAULT 0,
  "drawnCredits" integer NOT NULL DEFAULT 0,
  "cancellationRequestedAt" timestamptz,
  "errorCode" varchar(96),
  "errorJson" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_story_generation_run_key_unique"
  ON "vertical_drama_story_generation_runs" ("tenantId", "runKey");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_story_generation_idempotency_unique"
  ON "vertical_drama_story_generation_runs" ("tenantId", "idempotencyKey");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_story_generation_active_unique"
  ON "vertical_drama_story_generation_runs" ("tenantId", "seriesId")
  WHERE "status" IN ('queued','running','validating','repairing','awaiting_reconciliation','awaiting_approval','needs_repair','partial');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_story_generation_lookup_idx"
  ON "vertical_drama_story_generation_runs" ("tenantId", "seriesId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_story_generation_status_idx"
  ON "vertical_drama_story_generation_runs" ("tenantId", "status", "updatedAt");
