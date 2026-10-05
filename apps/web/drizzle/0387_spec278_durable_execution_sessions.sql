CREATE TABLE IF NOT EXISTS "runner_execution_sessions" (
  "sessionId" varchar(160) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "workerJobAttempt" integer NOT NULL,
  "leaseFencingVersion" bigint NOT NULL,
  "runnerId" varchar(160) REFERENCES "runner_nodes"("runnerId") ON DELETE SET NULL,
  "generation" bigint NOT NULL,
  "authorityEpoch" bigint NOT NULL DEFAULT 0,
  "placementEpoch" bigint NOT NULL DEFAULT 0,
  "jobControlRevision" bigint NOT NULL DEFAULT 1,
  "state" varchar(32) NOT NULL DEFAULT 'provisioning',
  "desiredState" varchar(32) NOT NULL DEFAULT 'running',
  "continuityClass" varchar(32) NOT NULL,
  "enforcementLevel" varchar(32) NOT NULL,
  "driverId" varchar(128) NOT NULL,
  "driverVersion" varchar(64),
  "observedAt" timestamptz,
  "terminalAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "runner_execution_sessions_generation_positive" CHECK ("generation" > 0),
  CONSTRAINT "runner_execution_sessions_job_attempt_positive" CHECK ("workerJobAttempt" > 0),
  CONSTRAINT "runner_execution_sessions_job_fence_nonnegative" CHECK ("leaseFencingVersion" >= 0),
  CONSTRAINT "runner_execution_sessions_epochs_nonnegative" CHECK ("authorityEpoch" >= 0 AND "placementEpoch" >= 0),
  CONSTRAINT "runner_execution_sessions_revision_positive" CHECK ("jobControlRevision" > 0),
  CONSTRAINT "runner_execution_sessions_state_check" CHECK ("state" IN ('provisioning','starting','running','disconnected','recovering','quiescing','quiesced','checkpointing','completed','failed','cancelled','incompatible','unknown')),
  CONSTRAINT "runner_execution_sessions_continuity_check" CHECK ("continuityClass" IN ('process_persistent','reattachable','checkpointable','reconstructable','ephemeral')),
  CONSTRAINT "runner_execution_sessions_enforcement_check" CHECK ("enforcementLevel" IN ('COMMAND_ONLY','PROCESS_PAUSE','MEDIATED_EFFECTS','SANDBOX_ENFORCED')),
  CONSTRAINT "runner_execution_sessions_ephemeral_enforcement_check" CHECK (NOT ("continuityClass" = 'ephemeral' AND "enforcementLevel" = 'SANDBOX_ENFORCED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runner_execution_sessions_job_generation_unique"
  ON "runner_execution_sessions" ("tenantId", "workerJobId", "generation");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runner_execution_sessions_id_tenant_unique"
  ON "runner_execution_sessions" ("sessionId", "tenantId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runner_execution_sessions_one_active_job_unique"
  ON "runner_execution_sessions" ("tenantId", "workerJobId")
  WHERE "state" NOT IN ('completed','failed','cancelled','incompatible');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runner_execution_sessions_recovery_idx"
  ON "runner_execution_sessions" ("tenantId", "state", "updatedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runner_execution_sessions_runner_idx"
  ON "runner_execution_sessions" ("tenantId", "runnerId", "state");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runner_execution_session_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" varchar(160) NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "sequence" bigint NOT NULL,
  "idempotencyKey" varchar(200) NOT NULL,
  "eventType" varchar(100) NOT NULL,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "runner_execution_session_events_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "runner_execution_session_events_session_tenant_fk"
    FOREIGN KEY ("sessionId", "tenantId")
    REFERENCES "runner_execution_sessions"("sessionId", "tenantId") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runner_execution_session_events_sequence_unique"
  ON "runner_execution_session_events" ("sessionId", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runner_execution_session_events_idempotency_unique"
  ON "runner_execution_session_events" ("sessionId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runner_execution_session_events_tenant_created_idx"
  ON "runner_execution_session_events" ("tenantId", "createdAt");
