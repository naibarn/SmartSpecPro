CREATE TABLE IF NOT EXISTS "auto_team_route_decisions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "teamId" varchar(36) REFERENCES "assistant_teams"("id") ON DELETE CASCADE,
  "roomId" varchar(36) REFERENCES "team_rooms"("id") ON DELETE CASCADE,
  "runId" varchar(36) REFERENCES "team_runs"("id") ON DELETE CASCADE,
  "workRequestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE SET NULL,
  "workCaseId" varchar(36) REFERENCES "work_cases"("id") ON DELETE SET NULL,
  "routeClass" varchar(64) NOT NULL,
  "routeConfidence" real,
  "allowedCapabilityFamiliesJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "selectedPolicyJson" jsonb,
  "selectedOrchestratorPersonaId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE SET NULL,
  "language" varchar(8) NOT NULL DEFAULT 'en',
  "decisionReason" text,
  "source" varchar(64) NOT NULL DEFAULT 'auto_team_route_policy',
  "blockedReason" text,
  "idempotencyKey" varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_route_decisions_tenant_run_idempotency_unique"
  ON "auto_team_route_decisions" ("tenantId", "runId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_route_decisions_tenant_room_idx"
  ON "auto_team_route_decisions" ("tenantId", "roomId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_route_decisions_tenant_request_idx"
  ON "auto_team_route_decisions" ("tenantId", "workRequestId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_route_decisions_tenant_route_idx"
  ON "auto_team_route_decisions" ("tenantId", "routeClass", "createdAt");

CREATE TABLE IF NOT EXISTS "auto_team_execution_stages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "teamId" varchar(36) REFERENCES "assistant_teams"("id") ON DELETE CASCADE,
  "roomId" varchar(36) REFERENCES "team_rooms"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL REFERENCES "team_runs"("id") ON DELETE CASCADE,
  "routeDecisionId" varchar(36) REFERENCES "auto_team_route_decisions"("id") ON DELETE CASCADE,
  "workItemId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE SET NULL,
  "planStepKey" varchar(120) NOT NULL,
  "stageType" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "assignedPersonaId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE SET NULL,
  "expectedCapabilityFamily" varchar(64),
  "selectedSkillId" varchar(180),
  "selectedProvider" varchar(120),
  "inputArtifactRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outputArtifactRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "jobRefIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "attempt" integer NOT NULL DEFAULT 1,
  "maxAttempts" integer NOT NULL DEFAULT 3,
  "claimToken" varchar(128),
  "claimExpiresAt" timestamptz,
  "claimedBy" varchar(180),
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "deadlineAt" timestamptz,
  "blockedReason" text,
  "errorCode" varchar(120),
  "errorMessage" text,
  "idempotencyKey" varchar(255) NOT NULL,
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_execution_stages_tenant_run_step_attempt_unique"
  ON "auto_team_execution_stages" ("tenantId", "runId", "planStepKey", "attempt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_execution_stages_tenant_run_idempotency_unique"
  ON "auto_team_execution_stages" ("tenantId", "runId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_execution_stages_tenant_run_status_idx"
  ON "auto_team_execution_stages" ("tenantId", "runId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_execution_stages_tenant_room_idx"
  ON "auto_team_execution_stages" ("tenantId", "roomId", "updatedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_execution_stages_tenant_work_item_idx"
  ON "auto_team_execution_stages" ("tenantId", "workItemId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_execution_stages_tenant_route_decision_idx"
  ON "auto_team_execution_stages" ("tenantId", "routeDecisionId");

CREATE TABLE IF NOT EXISTS "auto_team_media_job_refs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "teamId" varchar(36) REFERENCES "assistant_teams"("id") ON DELETE CASCADE,
  "roomId" varchar(36) REFERENCES "team_rooms"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL REFERENCES "team_runs"("id") ON DELETE CASCADE,
  "stageId" varchar(36) REFERENCES "auto_team_execution_stages"("id") ON DELETE CASCADE,
  "workItemId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE SET NULL,
  "mediaType" varchar(16) NOT NULL,
  "provider" varchar(120) NOT NULL,
  "model" varchar(180) NOT NULL,
  "providerTaskId" varchar(255),
  "providerStatus" varchar(64) NOT NULL DEFAULT 'queued',
  "submittedPromptArtifactRef" varchar(255),
  "resultArtifactRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "providerRequestHash" varchar(128),
  "idempotencyKey" varchar(255) NOT NULL,
  "lastPolledAt" timestamptz,
  "completedAt" timestamptz,
  "failedAt" timestamptz,
  "errorCode" varchar(120),
  "errorMessage" text,
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_media_job_refs_tenant_idempotency_unique"
  ON "auto_team_media_job_refs" ("tenantId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_media_job_refs_provider_task_idx"
  ON "auto_team_media_job_refs" ("tenantId", "provider", "providerTaskId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_media_job_refs_run_status_idx"
  ON "auto_team_media_job_refs" ("tenantId", "runId", "providerStatus");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_media_job_refs_stage_idx"
  ON "auto_team_media_job_refs" ("tenantId", "stageId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_media_job_refs_work_item_idx"
  ON "auto_team_media_job_refs" ("tenantId", "workItemId");

CREATE TABLE IF NOT EXISTS "auto_team_review_records" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "teamId" varchar(36) REFERENCES "assistant_teams"("id") ON DELETE CASCADE,
  "roomId" varchar(36) REFERENCES "team_rooms"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL REFERENCES "team_runs"("id") ON DELETE CASCADE,
  "stageId" varchar(36) REFERENCES "auto_team_execution_stages"("id") ON DELETE CASCADE,
  "workItemId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE SET NULL,
  "reviewerPersonaId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE SET NULL,
  "reviewType" varchar(120) NOT NULL,
  "score" double precision NOT NULL DEFAULT 0,
  "passThreshold" double precision NOT NULL DEFAULT 0,
  "passed" boolean NOT NULL DEFAULT false,
  "reviewedArtifactRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reviewedJobRefIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "comments" text,
  "repairInstructions" text,
  "idempotencyKey" varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_review_records_tenant_run_review_idempotency_unique"
  ON "auto_team_review_records" ("tenantId", "runId", "reviewType", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_review_records_tenant_run_passed_idx"
  ON "auto_team_review_records" ("tenantId", "runId", "passed");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_review_records_tenant_stage_idx"
  ON "auto_team_review_records" ("tenantId", "stageId");

CREATE TABLE IF NOT EXISTS "auto_team_final_results" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "teamId" varchar(36) REFERENCES "assistant_teams"("id") ON DELETE CASCADE,
  "roomId" varchar(36) REFERENCES "team_rooms"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL REFERENCES "team_runs"("id") ON DELETE CASCADE,
  "routeDecisionId" varchar(36) REFERENCES "auto_team_route_decisions"("id") ON DELETE CASCADE,
  "status" varchar(64) NOT NULL DEFAULT 'legacy_unverified',
  "finalArtifactRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "mediaJobRefIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reviewRecordRefIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "humanApprovalStatus" varchar(32) NOT NULL DEFAULT 'not_required',
  "summary" text,
  "failureReason" text,
  "blockedReason" text,
  "idempotencyKey" varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_final_results_tenant_run_idempotency_unique"
  ON "auto_team_final_results" ("tenantId", "runId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_final_results_tenant_route_decision_idx"
  ON "auto_team_final_results" ("tenantId", "routeDecisionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_final_results_tenant_run_status_idx"
  ON "auto_team_final_results" ("tenantId", "runId", "status");

CREATE TABLE IF NOT EXISTS "auto_team_trace_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "teamId" varchar(36) REFERENCES "assistant_teams"("id") ON DELETE CASCADE,
  "roomId" varchar(36) REFERENCES "team_rooms"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL REFERENCES "team_runs"("id") ON DELETE CASCADE,
  "stageId" varchar(36) REFERENCES "auto_team_execution_stages"("id") ON DELETE CASCADE,
  "workItemId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE SET NULL,
  "traceEventId" varchar(120) NOT NULL,
  "sequence" integer NOT NULL,
  "eventName" varchar(160) NOT NULL,
  "sourceComponent" varchar(120) NOT NULL,
  "severity" varchar(16) NOT NULL DEFAULT 'info',
  "summary" text,
  "redactedMetadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "idempotencyKey" varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_trace_events_tenant_run_sequence_unique"
  ON "auto_team_trace_events" ("tenantId", "runId", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_trace_events_tenant_run_idempotency_unique"
  ON "auto_team_trace_events" ("tenantId", "runId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_trace_events_tenant_event_idx"
  ON "auto_team_trace_events" ("tenantId", "eventName", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_trace_events_tenant_trace_idx"
  ON "auto_team_trace_events" ("tenantId", "traceEventId");

CREATE TABLE IF NOT EXISTS "auto_team_artifact_refs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "teamId" varchar(36) REFERENCES "assistant_teams"("id") ON DELETE CASCADE,
  "roomId" varchar(36) REFERENCES "team_rooms"("id") ON DELETE CASCADE,
  "runId" varchar(36) REFERENCES "team_runs"("id") ON DELETE CASCADE,
  "stageId" varchar(36) REFERENCES "auto_team_execution_stages"("id") ON DELETE CASCADE,
  "workItemId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE SET NULL,
  "artifactType" varchar(120) NOT NULL,
  "artifactRole" varchar(64) NOT NULL,
  "storageRef" text,
  "externalRef" text,
  "contentHash" varchar(128),
  "visibility" varchar(32) NOT NULL DEFAULT 'tenant',
  "retentionPolicyJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "safetyStatus" varchar(32) NOT NULL DEFAULT 'unknown',
  "source" varchar(120),
  "idempotencyKey" varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_team_artifact_refs_tenant_run_idempotency_unique"
  ON "auto_team_artifact_refs" ("tenantId", "runId", "idempotencyKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_artifact_refs_tenant_type_idx"
  ON "auto_team_artifact_refs" ("tenantId", "artifactType", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_artifact_refs_tenant_stage_idx"
  ON "auto_team_artifact_refs" ("tenantId", "stageId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_team_artifact_refs_tenant_visibility_idx"
  ON "auto_team_artifact_refs" ("tenantId", "visibility");

-- End of canonical Auto-Team execution records.
