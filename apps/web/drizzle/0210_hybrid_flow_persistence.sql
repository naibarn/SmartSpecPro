CREATE TABLE IF NOT EXISTS "hybrid_executions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conversationId" varchar(36) REFERENCES "conversations"("id") ON DELETE SET NULL,
  "legacyAgencyId" varchar(128),
  "originSurface" varchar(32) NOT NULL,
  "status" varchar(32) NOT NULL,
  "objective" text NOT NULL,
  "routingDecisionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "planJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "resultJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "currentStageId" varchar(128),
  "totalCreditsUsed" numeric(12, 4) NOT NULL DEFAULT '0',
  "runtimeContractVersion" varchar(64) NOT NULL,
  "planSchemaVersion" varchar(64) NOT NULL,
  "resultSchemaVersion" varchar(64) NOT NULL,
  "runtimeSdkVersion" varchar(128),
  "runtimeAdapterVersion" varchar(128),
  "previewId" varchar(128),
  "previewIdempotencyKey" varchar(255),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hybrid_executions_tenant_preview_unique"
  ON "hybrid_executions" ("tenantId", "previewIdempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hybrid_executions_tenant_user_status_idx"
  ON "hybrid_executions" ("tenantId", "userId", "status", "updatedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hybrid_executions_tenant_conversation_idx"
  ON "hybrid_executions" ("tenantId", "conversationId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hybrid_executions_legacy_agency_idx"
  ON "hybrid_executions" ("tenantId", "legacyAgencyId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hybrid_execution_stages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "executionId" varchar(36) NOT NULL REFERENCES "hybrid_executions"("id") ON DELETE CASCADE,
  "stageIndex" integer NOT NULL,
  "stageType" varchar(32) NOT NULL,
  "owner" varchar(32) NOT NULL,
  "executorId" varchar(128),
  "status" varchar(32) NOT NULL,
  "inputEnvelopeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "resultEnvelopeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "errorCode" varchar(128),
  "idempotencyKey" varchar(255) NOT NULL,
  "traceRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hybrid_execution_stages_execution_index_unique"
  ON "hybrid_execution_stages" ("executionId", "stageIndex");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hybrid_execution_stages_tenant_idempotency_unique"
  ON "hybrid_execution_stages" ("tenantId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hybrid_execution_stages_execution_status_idx"
  ON "hybrid_execution_stages" ("executionId", "status", "stageIndex");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hybrid_execution_stages_tenant_updated_idx"
  ON "hybrid_execution_stages" ("tenantId", "updatedAt");
