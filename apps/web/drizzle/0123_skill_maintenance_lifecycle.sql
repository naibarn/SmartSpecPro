DO $$ BEGIN
  CREATE TYPE "skill_maintenance_recommendation_status" AS ENUM (
    'pending_review',
    'approved',
    'dismissed',
    'applied',
    'blocked',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "skill_maintenance_risk_level" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "skill_maintenance_run_type" AS ENUM (
    'analysis',
    'apply',
    'sweep',
    'verify'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "skill_maintenance_run_status" AS ENUM (
    'queued',
    'running',
    'completed',
    'failed',
    'blocked',
    'canceled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "skill_maintenance_compatibility_status" AS ENUM (
    'unknown',
    'compatible',
    'warning',
    'blocked'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "skill_maintenance_schedule_status" AS ENUM (
    'active',
    'paused',
    'disabled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "skill_maintenance_schedules" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36),
  "name" varchar(255) NOT NULL,
  "description" text,
  "status" "skill_maintenance_schedule_status" DEFAULT 'active' NOT NULL,
  "cronExpression" varchar(128),
  "timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
  "scopeType" varchar(50) DEFAULT 'all_skills' NOT NULL,
  "scopeJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "policyJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdBy" integer,
  "lastRunAt" timestamp with time zone,
  "nextRunAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_maintenance_schedules"
  ADD CONSTRAINT "skill_maintenance_schedules_tenantId_tenants_id_fk"
  FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_maintenance_schedules"
  ADD CONSTRAINT "skill_maintenance_schedules_createdBy_users_id_fk"
  FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_maintenance_schedules_status_next_run_idx"
  ON "skill_maintenance_schedules" USING btree ("status", "nextRunAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_maintenance_schedules_tenant_status_idx"
  ON "skill_maintenance_schedules" USING btree ("tenantId", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "skill_improvement_recommendations" (
  "id" serial PRIMARY KEY NOT NULL,
  "skillId" integer NOT NULL,
  "tenantId" varchar(36),
  "scheduleId" integer,
  "recommendationType" varchar(100) NOT NULL,
  "title" varchar(255) NOT NULL,
  "summary" text,
  "rationale" text,
  "status" "skill_maintenance_recommendation_status" DEFAULT 'pending_review' NOT NULL,
  "riskLevel" "skill_maintenance_risk_level" DEFAULT 'medium' NOT NULL,
  "compatibilityStatus" "skill_maintenance_compatibility_status" DEFAULT 'unknown' NOT NULL,
  "qualityScore" integer,
  "confidenceScore" integer,
  "currentRuntime" varchar(64),
  "proposedRuntime" varchar(64),
  "proposedAction" varchar(100),
  "isAutoApplySafe" boolean DEFAULT false NOT NULL,
  "isGenjsCandidate" boolean DEFAULT false NOT NULL,
  "recommendationJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "contractDeltaJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "analyzedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewedAt" timestamp with time zone,
  "reviewedBy" integer,
  "approvedAt" timestamp with time zone,
  "approvedBy" integer,
  "dismissedAt" timestamp with time zone,
  "dismissedBy" integer,
  "appliedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_improvement_recommendations"
  ADD CONSTRAINT "skill_improvement_recommendations_skillId_skills_id_fk"
  FOREIGN KEY ("skillId") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_recommendations"
  ADD CONSTRAINT "skill_improvement_recommendations_tenantId_tenants_id_fk"
  FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_recommendations"
  ADD CONSTRAINT "skill_improvement_recommendations_scheduleId_skill_maintenance_schedules_id_fk"
  FOREIGN KEY ("scheduleId") REFERENCES "public"."skill_maintenance_schedules"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_recommendations"
  ADD CONSTRAINT "skill_improvement_recommendations_reviewedBy_users_id_fk"
  FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_recommendations"
  ADD CONSTRAINT "skill_improvement_recommendations_approvedBy_users_id_fk"
  FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_recommendations"
  ADD CONSTRAINT "skill_improvement_recommendations_dismissedBy_users_id_fk"
  FOREIGN KEY ("dismissedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_improvement_recommendations_skill_status_idx"
  ON "skill_improvement_recommendations" USING btree ("skillId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_improvement_recommendations_status_risk_idx"
  ON "skill_improvement_recommendations" USING btree ("status", "riskLevel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_improvement_recommendations_schedule_idx"
  ON "skill_improvement_recommendations" USING btree ("scheduleId", "status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "skill_improvement_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "skillId" integer,
  "tenantId" varchar(36),
  "scheduleId" integer,
  "recommendationId" integer,
  "runType" "skill_maintenance_run_type" NOT NULL,
  "status" "skill_maintenance_run_status" DEFAULT 'queued' NOT NULL,
  "triggerSource" varchar(50) DEFAULT 'manual' NOT NULL,
  "requestedBy" integer,
  "summary" text,
  "errorMessage" text,
  "scopeJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "logsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metricsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "verificationJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "diffSummaryJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "startedAt" timestamp with time zone,
  "endedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_improvement_runs"
  ADD CONSTRAINT "skill_improvement_runs_skillId_skills_id_fk"
  FOREIGN KEY ("skillId") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_runs"
  ADD CONSTRAINT "skill_improvement_runs_tenantId_tenants_id_fk"
  FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_runs"
  ADD CONSTRAINT "skill_improvement_runs_scheduleId_skill_maintenance_schedules_id_fk"
  FOREIGN KEY ("scheduleId") REFERENCES "public"."skill_maintenance_schedules"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_runs"
  ADD CONSTRAINT "skill_improvement_runs_recommendationId_skill_improvement_recommendations_id_fk"
  FOREIGN KEY ("recommendationId") REFERENCES "public"."skill_improvement_recommendations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_improvement_runs"
  ADD CONSTRAINT "skill_improvement_runs_requestedBy_users_id_fk"
  FOREIGN KEY ("requestedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_improvement_runs_skill_created_idx"
  ON "skill_improvement_runs" USING btree ("skillId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_improvement_runs_schedule_created_idx"
  ON "skill_improvement_runs" USING btree ("scheduleId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_improvement_runs_recommendation_created_idx"
  ON "skill_improvement_runs" USING btree ("recommendationId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_improvement_runs_status_created_idx"
  ON "skill_improvement_runs" USING btree ("status", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "skill_contract_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "skillId" integer NOT NULL,
  "tenantId" varchar(36),
  "recommendationId" integer,
  "runId" integer,
  "snapshotType" varchar(50) DEFAULT 'baseline' NOT NULL,
  "executionMode" varchar(50),
  "runtimeProfile" varchar(64),
  "manifestPath" varchar(512),
  "manifestHash" varchar(64),
  "inputSchemaHash" varchar(64),
  "outputSchemaHash" varchar(64),
  "fixtureHash" varchar(64),
  "testsHash" varchar(64),
  "contractHash" varchar(64),
  "schemaSummaryJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sampleInputsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sampleOutputsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "compatibilityNotesJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "snapshotJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capturedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_contract_snapshots"
  ADD CONSTRAINT "skill_contract_snapshots_skillId_skills_id_fk"
  FOREIGN KEY ("skillId") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_contract_snapshots"
  ADD CONSTRAINT "skill_contract_snapshots_tenantId_tenants_id_fk"
  FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_contract_snapshots"
  ADD CONSTRAINT "skill_contract_snapshots_recommendationId_skill_improvement_recommendations_id_fk"
  FOREIGN KEY ("recommendationId") REFERENCES "public"."skill_improvement_recommendations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "skill_contract_snapshots"
  ADD CONSTRAINT "skill_contract_snapshots_runId_skill_improvement_runs_id_fk"
  FOREIGN KEY ("runId") REFERENCES "public"."skill_improvement_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_contract_snapshots_skill_captured_idx"
  ON "skill_contract_snapshots" USING btree ("skillId", "capturedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_contract_snapshots_recommendation_idx"
  ON "skill_contract_snapshots" USING btree ("recommendationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_contract_snapshots_run_idx"
  ON "skill_contract_snapshots" USING btree ("runId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_contract_snapshots_contract_hash_idx"
  ON "skill_contract_snapshots" USING btree ("contractHash");
