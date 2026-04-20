ALTER TABLE "team_runs"
  ADD COLUMN IF NOT EXISTS "runtimeEngine" varchar(32),
  ADD COLUMN IF NOT EXISTS "runtimeMode" varchar(32),
  ADD COLUMN IF NOT EXISTS "runtimeSdkVersion" varchar(32),
  ADD COLUMN IF NOT EXISTS "runtimeAdapterVersion" varchar(32),
  ADD COLUMN IF NOT EXISTS "runtimeTraceId" varchar(255),
  ADD COLUMN IF NOT EXISTS "runtimeGatewayRouteId" varchar(255),
  ADD COLUMN IF NOT EXISTS "runtimeFrozenAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "runtimeTerminalReason" varchar(120),
  ADD COLUMN IF NOT EXISTS "runtimeCurrentStepKey" varchar(180),
  ADD COLUMN IF NOT EXISTS "runtimeApprovalState" varchar(64),
  ADD COLUMN IF NOT EXISTS "runtimeStateJson" jsonb;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_runtime_traces" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "surface" varchar(32) NOT NULL,
  "roomId" varchar(36),
  "runId" varchar(36),
  "messageId" varchar(36),
  "stepKey" varchar(180),
  "attemptId" varchar(120),
  "traceId" varchar(255) NOT NULL,
  "eventId" varchar(255) NOT NULL,
  "sequence" integer NOT NULL,
  "eventName" varchar(160) NOT NULL,
  "sourceComponent" varchar(120) NOT NULL,
  "severity" varchar(16) NOT NULL DEFAULT 'info',
  "summary" text,
  "redactedMetadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "runtimeSdkVersion" varchar(32),
  "runtimeAdapterVersion" varchar(32),
  "modelId" varchar(180),
  "providerId" varchar(120),
  "gatewayRouteId" varchar(255),
  "idempotencyKey" varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runtime_traces_tenant_idempotency_unique"
  ON "agent_runtime_traces" ("tenantId", "idempotencyKey");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runtime_traces_tenant_run_sequence_unique"
  ON "agent_runtime_traces" ("tenantId", "runId", "sequence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runtime_traces_tenant_trace_idx"
  ON "agent_runtime_traces" ("tenantId", "traceId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runtime_traces_tenant_event_idx"
  ON "agent_runtime_traces" ("tenantId", "eventName", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_runtime_checkpoints" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "surface" varchar(32) NOT NULL,
  "roomId" varchar(36),
  "runId" varchar(36),
  "messageId" varchar(36),
  "stepKey" varchar(180),
  "attemptId" varchar(120),
  "checkpointId" varchar(255) NOT NULL,
  "checkpointStatus" varchar(32) NOT NULL,
  "approvalState" varchar(64),
  "resumeCursor" text,
  "snapshotJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "detailJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "idempotencyKey" varchar(255) NOT NULL,
  "requestedBy" varchar(120),
  "approvedBy" varchar(120),
  "rejectedBy" varchar(120),
  "resumedBy" varchar(120),
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "approvedAt" timestamptz,
  "rejectedAt" timestamptz,
  "resumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runtime_checkpoints_tenant_checkpoint_unique"
  ON "agent_runtime_checkpoints" ("tenantId", "checkpointId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runtime_checkpoints_tenant_idempotency_unique"
  ON "agent_runtime_checkpoints" ("tenantId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runtime_checkpoints_tenant_run_step_idx"
  ON "agent_runtime_checkpoints" ("tenantId", "runId", "stepKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runtime_checkpoints_tenant_status_updated_idx"
  ON "agent_runtime_checkpoints" ("tenantId", "checkpointStatus", "updatedAt");
