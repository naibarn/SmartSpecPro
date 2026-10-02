SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
-- 0340 was also omitted from the journal. Restore its additive Feature 207
-- baseline for databases whose migration ledger already advanced past it.
-- Feature 207: additive economic authority. This migration is intentionally
-- forward-only; legacy Credits/payment tables remain authoritative for their
-- existing flows until an explicitly gated adapter is enabled.

CREATE TABLE IF NOT EXISTS "economic_intents" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actorId" varchar(160) NOT NULL,
  "actorType" varchar(24) NOT NULL,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) NOT NULL REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "idempotencyKey" varchar(128) NOT NULL,
  "effectType" varchar(48) NOT NULL,
  "resourceRef" varchar(255) NOT NULL,
  "amountMinorUnits" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "policyVersion" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'admitted',
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_intents_amount_nonnegative_check" CHECK ("amountMinorUnits" >= 0),
  CONSTRAINT "economic_intents_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "economic_intents_actor_type_check" CHECK ("actorType" IN ('user', 'agent', 'system')),
  CONSTRAINT "economic_intents_idempotency_length_check" CHECK (length("idempotencyKey") BETWEEN 8 AND 128)
);
CREATE UNIQUE INDEX IF NOT EXISTS "economic_intents_tenant_idempotency_unique"
  ON "economic_intents" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "economic_intents_job_attempt_idx"
  ON "economic_intents" ("tenantId", "workerJobId", "attemptId", "createdAt");

CREATE TABLE IF NOT EXISTS "economic_budgets" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scopeType" varchar(32) NOT NULL,
  "scopeRef" varchar(160) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "limitMinorUnits" bigint NOT NULL,
  "heldMinorUnits" bigint NOT NULL DEFAULT 0,
  "capturedMinorUnits" bigint NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "version" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_budgets_amounts_nonnegative_check" CHECK ("limitMinorUnits" >= 0 AND "heldMinorUnits" >= 0 AND "capturedMinorUnits" >= 0),
  CONSTRAINT "economic_budgets_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "economic_budgets_scope_unique"
  ON "economic_budgets" ("tenantId", "scopeType", "scopeRef", "currency");

CREATE TABLE IF NOT EXISTS "economic_holds" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "intentId" varchar(36) NOT NULL REFERENCES "economic_intents"("id") ON DELETE RESTRICT,
  "budgetId" varchar(36) NOT NULL REFERENCES "economic_budgets"("id") ON DELETE RESTRICT,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) NOT NULL REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "currency" varchar(3) NOT NULL,
  "amountMinorUnits" bigint NOT NULL,
  "capturedMinorUnits" bigint NOT NULL DEFAULT 0,
  "releasedMinorUnits" bigint NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL DEFAULT 'held',
  "idempotencyKey" varchar(128) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_holds_amounts_check" CHECK ("amountMinorUnits" >= 0 AND "capturedMinorUnits" >= 0 AND "releasedMinorUnits" >= 0 AND "capturedMinorUnits" + "releasedMinorUnits" <= "amountMinorUnits"),
  CONSTRAINT "economic_holds_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "economic_holds_intent_unique" ON "economic_holds" ("tenantId", "intentId");
CREATE UNIQUE INDEX IF NOT EXISTS "economic_holds_idempotency_unique" ON "economic_holds" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "economic_holds_active_idx" ON "economic_holds" ("tenantId", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "economic_ledger_accounts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "accountType" varchar(32) NOT NULL,
  "ownerRef" varchar(160) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "balanceMinorUnits" bigint NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL DEFAULT 'open',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_ledger_accounts_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "economic_ledger_accounts_identity_unique"
  ON "economic_ledger_accounts" ("tenantId", "accountType", "ownerRef", "currency");

CREATE TABLE IF NOT EXISTS "economic_journal_entries" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "idempotencyKey" varchar(200) NOT NULL,
  "description" varchar(512) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'posted',
  "reversalOfEntryId" varchar(36),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "economic_journal_entries_tenant_idempotency_unique"
  ON "economic_journal_entries" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "economic_journal_entries_correlation_idx"
  ON "economic_journal_entries" ("tenantId", "workerJobId", "attemptId", "createdAt");

CREATE TABLE IF NOT EXISTS "economic_journal_lines" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entryId" varchar(36) NOT NULL REFERENCES "economic_journal_entries"("id") ON DELETE RESTRICT,
  "accountId" varchar(36) NOT NULL REFERENCES "economic_ledger_accounts"("id") ON DELETE RESTRICT,
  "currency" varchar(3) NOT NULL,
  "debitMinorUnits" bigint NOT NULL DEFAULT 0,
  "creditMinorUnits" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_journal_lines_nonnegative_check" CHECK ("debitMinorUnits" >= 0 AND "creditMinorUnits" >= 0),
  CONSTRAINT "economic_journal_lines_one_side_check" CHECK (("debitMinorUnits" > 0 AND "creditMinorUnits" = 0) OR ("creditMinorUnits" > 0 AND "debitMinorUnits" = 0)),
  CONSTRAINT "economic_journal_lines_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX IF NOT EXISTS "economic_journal_lines_entry_idx" ON "economic_journal_lines" ("tenantId", "entryId");

CREATE TABLE IF NOT EXISTS "economic_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eventType" varchar(64) NOT NULL,
  "idempotencyKey" varchar(200) NOT NULL,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "actorId" varchar(160) NOT NULL,
  "policyVersion" varchar(64) NOT NULL,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "economic_events_tenant_idempotency_unique" ON "economic_events" ("tenantId", "idempotencyKey");

CREATE TABLE IF NOT EXISTS "economic_reconciliations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "holdId" varchar(36) REFERENCES "economic_holds"("id") ON DELETE RESTRICT,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "reasonCode" varchar(100) NOT NULL,
  "externalReference" varchar(255),
  "detailsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "resolvedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "economic_reconciliations_pending_idx" ON "economic_reconciliations" ("tenantId", "status", "createdAt");

-- 0341 was omitted from the migration journal. Replay its additive, idempotent
-- baseline before Spec 215 alters workflow_studio_runs. This also repairs
-- databases whose migration ledger already advanced past the historical entry.
-- Feature 209: additive semantic Workflow Studio persistence. This does not
-- restore or call the retired legacy engine.
CREATE TABLE IF NOT EXISTS "workflow_studio_definitions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" varchar(200) NOT NULL,
  "description" varchar(1000),
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "semanticDefinitionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "miniAppSchemaJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "accessMode" varchar(24) NOT NULL DEFAULT 'private',
  "currentVersionNumber" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_definitions_tenant_name_unique" ON "workflow_studio_definitions" ("tenantId", "name");
CREATE INDEX IF NOT EXISTS "workflow_studio_definitions_tenant_status_idx" ON "workflow_studio_definitions" ("tenantId", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "workflow_studio_versions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "versionNumber" integer NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "semanticDefinitionJson" jsonb NOT NULL,
  "inputSchemaJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "outputSchemaJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "publishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workflow_studio_versions_number_positive" CHECK ("versionNumber" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_versions_definition_number_unique" ON "workflow_studio_versions" ("definitionId", "versionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_versions_published_hash_unique" ON "workflow_studio_versions" ("definitionId", "contentHash");

CREATE TABLE IF NOT EXISTS "workflow_studio_views" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "viewJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_views_user_definition_unique" ON "workflow_studio_views" ("definitionId", "userId");

CREATE TABLE IF NOT EXISTS "workflow_studio_apps" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE RESTRICT,
  "versionId" varchar(36) NOT NULL REFERENCES "workflow_studio_versions"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "slug" varchar(160) NOT NULL,
  "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "accessMode" varchar(24) NOT NULL DEFAULT 'private',
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "publishedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_apps_tenant_slug_unique" ON "workflow_studio_apps" ("tenantId", "slug");

ALTER TABLE "workflow_studio_apps"
  ADD COLUMN IF NOT EXISTS "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "workflow_studio_definitions"
  ADD COLUMN IF NOT EXISTS "draftRevision" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "workflow_studio_runs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actorUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE RESTRICT,
  "versionId" varchar(36) NOT NULL REFERENCES "workflow_studio_versions"("id") ON DELETE RESTRICT,
  "contentHash" varchar(64) NOT NULL,
  "inputFingerprint" varchar(64) NOT NULL,
  "inputJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "mode" varchar(24) NOT NULL,
  "targetNodeId" varchar(128),
  "checkpointId" varchar(36),
  "idempotencyKey" varchar(160) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'admitted',
  "runRevision" integer NOT NULL DEFAULT 0,
  "canonicalJobRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outputJson" jsonb,
  "errorJson" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "startedAt" timestamptz,
  "finishedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_runs_tenant_idempotency_unique" ON "workflow_studio_runs" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "workflow_studio_runs_tenant_status_idx" ON "workflow_studio_runs" ("tenantId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "workflow_studio_runs_version_created_idx" ON "workflow_studio_runs" ("versionId", "createdAt");

CREATE TABLE IF NOT EXISTS "workflow_studio_run_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "runId" varchar(36) NOT NULL REFERENCES "workflow_studio_runs"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "eventType" varchar(80) NOT NULL,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "eventIdempotencyKey" varchar(200) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_run_events_sequence_unique" ON "workflow_studio_run_events" ("runId", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_run_events_idempotency_unique" ON "workflow_studio_run_events" ("runId", "eventIdempotencyKey");
CREATE INDEX IF NOT EXISTS "workflow_studio_run_events_tenant_created_idx" ON "workflow_studio_run_events" ("tenantId", "createdAt");

CREATE TABLE IF NOT EXISTS "workflow_studio_checkpoints" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL REFERENCES "workflow_studio_runs"("id") ON DELETE CASCADE,
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE RESTRICT,
  "versionId" varchar(36) NOT NULL REFERENCES "workflow_studio_versions"("id") ON DELETE RESTRICT,
  "contentHash" varchar(64) NOT NULL,
  "inputFingerprint" varchar(64) NOT NULL,
  "completedNodeIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outputJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "artifactRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "digest" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'ready',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workflow_studio_checkpoints_run_created_idx" ON "workflow_studio_checkpoints" ("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "workflow_studio_checkpoints_tenant_version_idx" ON "workflow_studio_checkpoints" ("tenantId", "versionId", "createdAt");
--> statement-breakpoint
ALTER TABLE "workflow_studio_runs"
  ADD COLUMN "executionPlanJson" jsonb,
  ADD COLUMN "planHash" varchar(64),
  ADD COLUMN "selectedNodeIdsJson" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_studio_runs_id_tenant_unique"
  ON "workflow_studio_runs" ("id", "tenantId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_studio_node_runs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL,
  "nodeId" varchar(128) NOT NULL,
  "nodeType" varchar(128) NOT NULL,
  "adapterVersion" varchar(64),
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "inputArtifactRefsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "outputArtifactRefsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "outputDigest" varchar(64),
  "selectedPort" varchar(128),
  "errorJson" jsonb,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_studio_node_runs_run_tenant_fk"
    FOREIGN KEY ("runId", "tenantId") REFERENCES "workflow_studio_runs"("id", "tenantId") ON DELETE CASCADE,
  CONSTRAINT "workflow_studio_node_runs_status_check"
    CHECK ("status" IN ('pending', 'ready', 'dispatching', 'admitted', 'running', 'waiting', 'suspended', 'completed', 'failed', 'cancelled', 'skipped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_studio_node_runs_run_node_unique"
  ON "workflow_studio_node_runs" ("runId", "nodeId");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_studio_node_runs_id_tenant_run_unique"
  ON "workflow_studio_node_runs" ("id", "tenantId", "runId");
--> statement-breakpoint
CREATE INDEX "workflow_studio_node_runs_tenant_status_idx"
  ON "workflow_studio_node_runs" ("tenantId", "status", "updatedAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_studio_node_attempts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL,
  "nodeRunId" varchar(36) NOT NULL,
  "attemptNumber" integer NOT NULL,
  "idempotencyKey" varchar(200) NOT NULL,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "workerAttemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE SET NULL,
  "leaseGeneration" integer,
  "status" varchar(32) DEFAULT 'admitted' NOT NULL,
  "resultRef" text,
  "resultDigest" varchar(64),
  "errorJson" jsonb,
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_studio_node_attempts_run_tenant_fk"
    FOREIGN KEY ("runId", "tenantId") REFERENCES "workflow_studio_runs"("id", "tenantId") ON DELETE CASCADE,
  CONSTRAINT "workflow_studio_node_attempts_node_run_fk"
    FOREIGN KEY ("nodeRunId", "tenantId", "runId") REFERENCES "workflow_studio_node_runs"("id", "tenantId", "runId") ON DELETE CASCADE,
  CONSTRAINT "workflow_studio_node_attempts_number_check" CHECK ("attemptNumber" > 0),
  CONSTRAINT "workflow_studio_node_attempts_generation_check" CHECK ("leaseGeneration" IS NULL OR "leaseGeneration" >= 0),
  CONSTRAINT "workflow_studio_node_attempts_status_check"
    CHECK ("status" IN ('admitted', 'queued', 'leased', 'running', 'retry_scheduled', 'succeeded', 'failed', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_studio_node_attempts_node_attempt_unique"
  ON "workflow_studio_node_attempts" ("nodeRunId", "attemptNumber");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_studio_node_attempts_idempotency_unique"
  ON "workflow_studio_node_attempts" ("tenantId", "idempotencyKey");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_studio_node_attempts_job_unique"
  ON "workflow_studio_node_attempts" ("workerJobId");
--> statement-breakpoint
CREATE INDEX "workflow_studio_node_attempts_run_status_idx"
  ON "workflow_studio_node_attempts" ("runId", "status");
