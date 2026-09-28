-- Feature 188 — additive platform operations and promotion evidence.
-- This migration deliberately creates coordination/evidence records only;
-- worker_jobs remains the sole job lifecycle ledger.
CREATE TABLE IF NOT EXISTS "platform_release_controls" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "environment" varchar(24) NOT NULL,
  "scope" varchar(120) NOT NULL,
  "platform" varchar(32) NOT NULL,
  "lifecycle" varchar(32) NOT NULL DEFAULT 'preparing',
  "sourceIdentity" varchar(255) NOT NULL,
  "targetIdentity" varchar(255) NOT NULL,
  "sourceReleaseSha" varchar(64),
  "targetReleaseDigest" varchar(128),
  "schemaVersion" varchar(80) NOT NULL,
  "adapterContractVersion" varchar(80) NOT NULL,
  "maintenanceWindowAt" timestamptz,
  "activationRequestedAt" timestamptz,
  "activatedAt" timestamptz,
  "rollbackAt" timestamptz,
  "fencingVersion" integer NOT NULL DEFAULT 0,
  "separationState" varchar(32) NOT NULL DEFAULT 'not_separated',
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_release_controls_distinct_identity_check"
    CHECK ("sourceIdentity" <> "targetIdentity"),
  CONSTRAINT "platform_release_controls_metadata_size_check"
    CHECK (pg_column_size("metadataJson") <= 65536)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_release_controls_environment_scope_unique"
  ON "platform_release_controls" ("environment", "scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_release_controls_active_idx"
  ON "platform_release_controls" ("environment", "lifecycle", "updatedAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_gate_results" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "environment" varchar(24) NOT NULL,
  "gateKey" varchar(120) NOT NULL,
  "releaseIdentity" varchar(255),
  "promotionId" varchar(36),
  "targetIdentity" varchar(255),
  "status" varchar(24) NOT NULL,
  "safeReason" varchar(1000),
  "evidenceRef" varchar(512),
  "source" varchar(80) NOT NULL,
  "actorId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "evaluatedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz,
  CONSTRAINT "platform_gate_results_safe_reason_length_check"
    CHECK ("safeReason" IS NULL OR char_length("safeReason") <= 1000)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_gate_results_evaluation_unique"
  ON "platform_gate_results" ("environment", "gateKey", "releaseIdentity", "targetIdentity", "evaluatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_gate_results_unresolved_idx"
  ON "platform_gate_results" ("environment", "status", "evaluatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_gate_results_promotion_idx"
  ON "platform_gate_results" ("promotionId", "evaluatedAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "data_promotions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "controlId" varchar(36) REFERENCES "platform_release_controls"("id") ON DELETE RESTRICT,
  "environment" varchar(24) NOT NULL,
  "sourceIdentity" varchar(255) NOT NULL,
  "targetIdentity" varchar(255) NOT NULL,
  "mode" varchar(32) NOT NULL,
  "phase" varchar(32) NOT NULL DEFAULT 'planned',
  "manifestVersion" varchar(80) NOT NULL,
  "schemaVersion" varchar(80) NOT NULL,
  "sourceWatermark" varchar(255),
  "targetWatermark" varchar(255),
  "lagMs" integer,
  "fencingVersion" integer NOT NULL DEFAULT 0,
  "validationState" varchar(32) NOT NULL DEFAULT 'unknown',
  "credentialState" varchar(32) NOT NULL DEFAULT 'not_copied',
  "safeError" varchar(1000),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "data_promotions_distinct_identity_check"
    CHECK ("sourceIdentity" <> "targetIdentity"),
  CONSTRAINT "data_promotions_lag_nonnegative_check"
    CHECK ("lagMs" IS NULL OR "lagMs" >= 0)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_promotions_environment_phase_idx"
  ON "data_promotions" ("environment", "phase", "updatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_promotions_source_target_idx"
  ON "data_promotions" ("sourceIdentity", "targetIdentity", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "data_promotion_batches" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "promotionId" varchar(36) NOT NULL REFERENCES "data_promotions"("id") ON DELETE RESTRICT,
  "batchKey" varchar(200) NOT NULL,
  "tableName" varchar(160) NOT NULL,
  "partitionKey" varchar(255),
  "operation" varchar(32) NOT NULL,
  "startWatermark" varchar(255),
  "endWatermark" varchar(255),
  "rowCount" integer NOT NULL DEFAULT 0,
  "dispositionCount" integer NOT NULL DEFAULT 0,
  "digest" varchar(128),
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "attempt" integer NOT NULL DEFAULT 0,
  "checkpointJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "safeError" varchar(1000),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "data_promotion_batches_counts_nonnegative_check"
    CHECK ("rowCount" >= 0 AND "dispositionCount" >= 0 AND "attempt" >= 0),
  CONSTRAINT "data_promotion_batches_checkpoint_size_check"
    CHECK (pg_column_size("checkpointJson") <= 65536)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_promotion_batches_promotion_key_unique"
  ON "data_promotion_batches" ("promotionId", "batchKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_promotion_batches_pending_idx"
  ON "data_promotion_batches" ("promotionId", "status", "updatedAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "data_promotion_dispositions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "promotionId" varchar(36) NOT NULL REFERENCES "data_promotions"("id") ON DELETE RESTRICT,
  "batchId" varchar(36) REFERENCES "data_promotion_batches"("id") ON DELETE SET NULL,
  "tableName" varchar(160) NOT NULL,
  "sourceKey" varchar(255) NOT NULL,
  "disposition" varchar(40) NOT NULL,
  "transformationVersion" varchar(80) NOT NULL,
  "ownerActorId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "safeReason" varchar(1000),
  "evidenceRef" varchar(512),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_promotion_dispositions_source_unique"
  ON "data_promotion_dispositions" ("promotionId", "tableName", "sourceKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_promotion_dispositions_evidence_idx"
  ON "data_promotion_dispositions" ("promotionId", "disposition", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_operation_outbox" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "controlId" varchar(36) REFERENCES "platform_release_controls"("id") ON DELETE RESTRICT,
  "environment" varchar(24) NOT NULL,
  "action" varchar(80) NOT NULL,
  "dedupeKey" varchar(200) NOT NULL,
  "envelopeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "providerReference" varchar(255),
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "publishAttempts" integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "publisherLeaseTokenHash" varchar(128),
  "publisherLeaseExpiresAt" timestamptz,
  "fencingVersion" integer NOT NULL DEFAULT 0,
  "acknowledgedAt" timestamptz,
  "safeError" varchar(1000),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_operation_outbox_envelope_size_check"
    CHECK (pg_column_size("envelopeJson") <= 65536),
  CONSTRAINT "platform_operation_outbox_attempts_nonnegative_check"
    CHECK ("publishAttempts" >= 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_operation_outbox_dedupe_unique"
  ON "platform_operation_outbox" ("environment", "dedupeKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_operation_outbox_pending_idx"
  ON "platform_operation_outbox" ("environment", "status", "nextAttemptAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_operation_outbox_control_idx"
  ON "platform_operation_outbox" ("controlId", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_action_keys" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "environment" varchar(24) NOT NULL,
  "actionKey" varchar(128) NOT NULL,
  "actorId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "authorizationScope" varchar(160) NOT NULL,
  "requestedControlVersion" integer NOT NULL,
  "payloadDigest" varchar(128) NOT NULL,
  "outcomeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "evidenceRef" varchar(512),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "effectiveAt" timestamptz,
  CONSTRAINT "platform_action_keys_outcome_size_check"
    CHECK (pg_column_size("outcomeJson") <= 65536)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_action_keys_environment_action_unique"
  ON "platform_action_keys" ("environment", "actionKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_action_keys_environment_created_idx"
  ON "platform_action_keys" ("environment", "createdAt");
