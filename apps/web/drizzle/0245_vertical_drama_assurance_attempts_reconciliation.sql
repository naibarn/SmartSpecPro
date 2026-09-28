-- Feature 157 Section 02. 0238 remains the immutable Feature 152 parent.
-- This migration is additive and deliberately retains all old readers/writers.

ALTER TABLE "vertical_drama_story_generation_runs"
  ALTER COLUMN "seriesId" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "vertical_drama_story_generation_runs"
  ADD COLUMN IF NOT EXISTS "surface" varchar(64),
  ADD COLUMN IF NOT EXISTS "domainOwnerType" varchar(64),
  ADD COLUMN IF NOT EXISTS "domainOwnerId" varchar(128),
  ADD COLUMN IF NOT EXISTS "contextSnapshotId" varchar(128),
  ADD COLUMN IF NOT EXISTS "contextSnapshotRevision" integer,
  ADD COLUMN IF NOT EXISTS "contextFingerprint" varchar(64),
  ADD COLUMN IF NOT EXISTS "assuranceState" varchar(32),
  ADD COLUMN IF NOT EXISTS "disposition" varchar(40),
  ADD COLUMN IF NOT EXISTS "readiness" varchar(32),
  ADD COLUMN IF NOT EXISTS "nextAction" varchar(96),
  ADD COLUMN IF NOT EXISTS "stateVersion" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "heartbeatAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "acceptedAttemptId" varchar(64),
  ADD COLUMN IF NOT EXISTS "reconciliationState" varchar(40),
  ADD COLUMN IF NOT EXISTS "projectionSchemaVersion" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vd_assurance_domain_owner_pair_check'
  ) THEN
    ALTER TABLE "vertical_drama_story_generation_runs"
      ADD CONSTRAINT "vd_assurance_domain_owner_pair_check"
      CHECK (
        ("domainOwnerType" IS NULL AND "domainOwnerId" IS NULL)
        OR ("domainOwnerType" IS NOT NULL AND "domainOwnerId" IS NOT NULL)
      ) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_assurance_attempts" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "executionRowId" bigint NOT NULL REFERENCES "vertical_drama_story_generation_runs"("id") ON DELETE CASCADE,
  "executionId" varchar(64) NOT NULL,
  "attemptId" varchar(64) NOT NULL,
  "ordinal" integer NOT NULL,
  "parentAttemptId" varchar(64),
  "domainTaskKind" varchar(64) NOT NULL,
  "runtimeTaskKind" varchar(64),
  "sourceRevision" varchar(256),
  "sourceFingerprint" varchar(64) NOT NULL,
  "contextSnapshotId" varchar(128),
  "contextSnapshotRevision" integer,
  "contextFingerprint" varchar(64),
  "contractVersion" varchar(64),
  "contractHash" varchar(64) NOT NULL,
  "outputContractVersion" varchar(64),
  "rulePackIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "modelHash" varchar(64),
  "policyHash" varchar(64) NOT NULL,
  "compatibilityMode" varchar(32),
  "assuranceMode" varchar(32),
  "budgetJson" jsonb,
  "sideEffectPolicy" varchar(32) NOT NULL DEFAULT 'none',
  "state" varchar(32) NOT NULL DEFAULT 'queued',
  "disposition" varchar(40) NOT NULL DEFAULT 'retryable',
  "readiness" varchar(32) NOT NULL DEFAULT 'draft',
  "nextAction" varchar(96),
  "errorCode" varchar(96),
  "heartbeatAt" timestamptz,
  "leaseGenerationObserved" integer NOT NULL DEFAULT 0,
  "acceptedDomainRef" varchar(256),
  "recoveredDomainRef" varchar(256),
  "finalOutputHash" varchar(64),
  "traceRef" varchar(128),
  "reconciliationState" varchar(40),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_attempt_identity_unique"
  ON "vertical_drama_assurance_attempts" ("tenantId", "executionRowId", "attemptId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_attempt_ordinal_unique"
  ON "vertical_drama_assurance_attempts" ("tenantId", "executionRowId", "ordinal");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_one_active_attempt_unique"
  ON "vertical_drama_assurance_attempts" ("tenantId", "executionRowId")
  WHERE "state" IN ('queued', 'running', 'awaiting_action', 'reconciliation_required');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_one_accepted_attempt_unique"
  ON "vertical_drama_assurance_attempts" ("tenantId", "executionRowId")
  WHERE "acceptedDomainRef" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_assurance_attempt_reconcile_idx"
  ON "vertical_drama_assurance_attempts" ("tenantId", "state", "heartbeatAt", "updatedAt")
  WHERE "state" NOT IN ('succeeded', 'recovered', 'fatal_failed', 'cancelled', 'stale');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_assurance_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "executionRowId" bigint NOT NULL REFERENCES "vertical_drama_story_generation_runs"("id") ON DELETE CASCADE,
  "executionId" varchar(64) NOT NULL,
  "attemptId" varchar(64) NOT NULL,
  "sequence" integer NOT NULL,
  "eventIdempotencyKey" varchar(256) NOT NULL,
  "previousState" varchar(32),
  "nextState" varchar(32) NOT NULL,
  "actorClass" varchar(32) NOT NULL,
  "reasonCode" varchar(96) NOT NULL,
  "contractHash" varchar(64),
  "outputHash" varchar(64),
  "traceRef" varchar(128),
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_event_sequence_unique"
  ON "vertical_drama_assurance_events" ("tenantId", "executionRowId", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_event_idempotency_unique"
  ON "vertical_drama_assurance_events" ("tenantId", "executionRowId", "eventIdempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_assurance_event_replay_idx"
  ON "vertical_drama_assurance_events" ("tenantId", "executionRowId", "sequence");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_assurance_calls" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "executionRowId" bigint NOT NULL REFERENCES "vertical_drama_story_generation_runs"("id") ON DELETE CASCADE,
  "executionId" varchar(64) NOT NULL,
  "attemptId" varchar(64) NOT NULL,
  "providerCallId" varchar(96) NOT NULL,
  "callKey" varchar(256) NOT NULL,
  "ordinal" integer NOT NULL,
  "purpose" varchar(64) NOT NULL,
  "payer" varchar(24) NOT NULL,
  "billingOwner" varchar(96) NOT NULL,
  "provider" varchar(96),
  "model" varchar(160),
  "inputHash" varchar(64) NOT NULL,
  "reservationId" varchar(128),
  "settlementKey" varchar(256),
  "estimatedCredits" integer NOT NULL DEFAULT 0,
  "actualCredits" integer,
  "status" varchar(32) NOT NULL DEFAULT 'registered',
  "usageKnown" boolean NOT NULL DEFAULT false,
  "providerRequestId" varchar(256),
  "providerTaskId" varchar(256),
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "startedAt" timestamptz,
  "finishedAt" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_call_provider_id_unique"
  ON "vertical_drama_assurance_calls" ("tenantId", "providerCallId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_call_key_unique"
  ON "vertical_drama_assurance_calls" ("tenantId", "callKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_assurance_call_reconcile_idx"
  ON "vertical_drama_assurance_calls" ("tenantId", "status", "createdAt");
--> statement-breakpoint

-- This new identity is used only by Feature 157 dual-writers. Existing
-- Feature 152 idempotency/read paths remain available without rewrite.
CREATE UNIQUE INDEX IF NOT EXISTS "vd_assurance_admission_unique"
  ON "vertical_drama_story_generation_runs" ("tenantId", "surface", "taskKind", "sourceFingerprint", "idempotencyKey")
  WHERE "surface" IS NOT NULL AND "domainOwnerType" IS NOT NULL AND "domainOwnerId" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_assurance_owner_lookup_idx"
  ON "vertical_drama_story_generation_runs" ("tenantId", "domainOwnerType", "domainOwnerId", "updatedAt")
  WHERE "domainOwnerType" IS NOT NULL AND "domainOwnerId" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vd_assurance_reconciliation_lookup_idx"
  ON "vertical_drama_story_generation_runs" ("tenantId", "reconciliationState", "heartbeatAt", "updatedAt")
  WHERE "assuranceState" NOT IN ('succeeded', 'recovered', 'fatal_failed', 'cancelled', 'stale');
