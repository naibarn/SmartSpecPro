DO $$
BEGIN
  CREATE TYPE "public"."work_automation_mode" AS ENUM (
    'manual_assist',
    'semi_auto',
    'fully_auto'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_automation_run_status" AS ENUM (
    'pending',
    'running',
    'waiting_for_input',
    'waiting_for_approval',
    'paused',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_automation_step_status" AS ENUM (
    'planned',
    'running',
    'needs_input',
    'awaiting_approval',
    'blocked',
    'succeeded',
    'failed',
    'skipped',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_automation_checkpoint_approval_state" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'not_required'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_automation_checkpoint_status" AS ENUM (
    'open',
    'approved',
    'rejected',
    'resumed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_automation_surface" AS ENUM (
    'manual',
    'work_os',
    'skill',
    'agency',
    'browser',
    'document_management',
    'media_studio',
    'video_editor'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_automation_risk_tier" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "work_cases"
  ADD COLUMN IF NOT EXISTS "automationRunId" varchar(36),
  ADD COLUMN IF NOT EXISTS "automationMode" "public"."work_automation_mode" NOT NULL DEFAULT 'manual_assist',
  ADD COLUMN IF NOT EXISTS "automationStepId" varchar(36),
  ADD COLUMN IF NOT EXISTS "automationCheckpointId" varchar(36),
  ADD COLUMN IF NOT EXISTS "automationDisposition" varchar(120),
  ADD COLUMN IF NOT EXISTS "automationSummary" text,
  ADD COLUMN IF NOT EXISTS "automationUpdatedAt" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "work_cases_automation_idx"
  ON "work_cases" USING btree ("tenantId", "automationMode", "automationUpdatedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_automation_runs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "taskId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE set null,
  "templateKey" varchar(120) NOT NULL,
  "templateVersion" varchar(50),
  "title" varchar(500) NOT NULL,
  "objective" text,
  "currentMode" "public"."work_automation_mode" NOT NULL DEFAULT 'manual_assist',
  "status" "public"."work_automation_run_status" NOT NULL DEFAULT 'pending',
  "currentStepId" varchar(36),
  "currentCheckpointId" varchar(36),
  "finalDisposition" varchar(120),
  "finalDispositionReason" text,
  "resumeCursor" text,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "createdByAssistantId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE set null,
  "startedAt" timestamp with time zone,
  "completedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_runs_case_idx"
  ON "work_automation_runs" USING btree ("caseId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_runs_tenant_idx"
  ON "work_automation_runs" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_runs_status_idx"
  ON "work_automation_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_runs_mode_idx"
  ON "work_automation_runs" USING btree ("currentMode", "updatedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_automation_run_steps" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "runId" varchar(36) NOT NULL REFERENCES "work_automation_runs"("id") ON DELETE cascade,
  "stepKey" varchar(120) NOT NULL,
  "stepIndex" integer NOT NULL DEFAULT 0,
  "title" varchar(500) NOT NULL,
  "status" "public"."work_automation_step_status" NOT NULL DEFAULT 'planned',
  "riskTier" "public"."work_automation_risk_tier" NOT NULL DEFAULT 'medium',
  "surface" "public"."work_automation_surface" NOT NULL DEFAULT 'manual',
  "inputRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outputRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "retryCount" integer NOT NULL DEFAULT 0,
  "idempotencyKey" varchar(180),
  "summary" text,
  "detailJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "actorAssistantId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE set null,
  "startedAt" timestamp with time zone,
  "completedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_steps_run_idx"
  ON "work_automation_run_steps" USING btree ("runId", "stepIndex", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_steps_case_idx"
  ON "work_automation_run_steps" USING btree ("caseId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_steps_tenant_idx"
  ON "work_automation_run_steps" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_steps_step_key_idx"
  ON "work_automation_run_steps" USING btree ("runId", "stepKey");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_automation_run_checkpoints" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "runId" varchar(36) NOT NULL REFERENCES "work_automation_runs"("id") ON DELETE cascade,
  "stepId" varchar(36) REFERENCES "work_automation_run_steps"("id") ON DELETE set null,
  "stepKey" varchar(120),
  "checkpointKey" varchar(120) NOT NULL,
  "resumeCursor" text NOT NULL,
  "approvalState" "public"."work_automation_checkpoint_approval_state" NOT NULL DEFAULT 'pending',
  "checkpointStatus" "public"."work_automation_checkpoint_status" NOT NULL DEFAULT 'open',
  "editSnapshotRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "snapshotJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "detailJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "requestedByUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "approvedByUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "actorAssistantId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE set null,
  "requestedAt" timestamp with time zone,
  "approvedAt" timestamp with time zone,
  "resumedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_checkpoints_run_idx"
  ON "work_automation_run_checkpoints" USING btree ("runId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_checkpoints_case_idx"
  ON "work_automation_run_checkpoints" USING btree ("caseId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_checkpoints_tenant_idx"
  ON "work_automation_run_checkpoints" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_checkpoints_status_idx"
  ON "work_automation_run_checkpoints" USING btree ("checkpointStatus", "approvalState");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_automation_run_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "runId" varchar(36) NOT NULL REFERENCES "work_automation_runs"("id") ON DELETE cascade,
  "stepId" varchar(36) REFERENCES "work_automation_run_steps"("id") ON DELETE set null,
  "checkpointId" varchar(36) REFERENCES "work_automation_run_checkpoints"("id") ON DELETE set null,
  "eventType" varchar(120) NOT NULL,
  "fromMode" "public"."work_automation_mode",
  "toMode" "public"."work_automation_mode",
  "status" "public"."work_automation_run_status",
  "detailJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "actorAssistantId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE set null,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_events_run_idx"
  ON "work_automation_run_events" USING btree ("runId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_events_case_idx"
  ON "work_automation_run_events" USING btree ("caseId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_events_tenant_idx"
  ON "work_automation_run_events" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_automation_run_events_event_idx"
  ON "work_automation_run_events" USING btree ("eventType", "createdAt");
