CREATE TYPE "public"."worker_runtime_type" AS ENUM('openclaw_gateway', 'desktop_zeroclaw_managed', 'nemoclaw_sandbox', 'hiclaw_cluster');--> statement-breakpoint
CREATE TYPE "public"."worker_status" AS ENUM('online', 'offline', 'unhealthy', 'disabled', 'draining');--> statement-breakpoint
CREATE TYPE "public"."worker_job_status" AS ENUM('queued', 'claimed', 'preparing', 'running', 'uploading', 'publishing', 'indexing', 'completed', 'failed', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."worker_mode" AS ENUM('per_user', 'shared_department', 'dedicated_gpu', 'external_runtime');--> statement-breakpoint
CREATE TYPE "public"."worker_runtime_mode" AS ENUM('native_constrained', 'wsl2_managed', 'docker_isolated', 'external_managed');--> statement-breakpoint
CREATE TYPE "public"."worker_file_scope_mode" AS ENUM('workspace_scoped', 'team_drive', 'full_machine');--> statement-breakpoint
CREATE TYPE "public"."worker_resource_profile" AS ENUM('cpu_light', 'cpu_heavy', 'gpu_required', 'large_disk_temp', 'network_heavy', 'long_running', 'sandbox_required', 'human_observable');--> statement-breakpoint

CREATE TABLE "worker_policies" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "name" varchar(255) NOT NULL,
  "runtimeType" "worker_runtime_type" NOT NULL,
  "rulesJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "runtime_profiles" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "runtimeType" "worker_runtime_type" NOT NULL,
  "name" varchar(255) NOT NULL,
  "profileJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "workers" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "teamId" varchar(36),
  "runtimeType" "worker_runtime_type" NOT NULL,
  "workerMode" "worker_mode" DEFAULT 'external_runtime' NOT NULL,
  "machineId" varchar(255),
  "machineName" varchar(255),
  "displayName" varchar(255) NOT NULL,
  "status" "worker_status" DEFAULT 'offline' NOT NULL,
  "runtimeVersion" varchar(100) NOT NULL,
  "runtimeMode" "worker_runtime_mode" DEFAULT 'external_managed' NOT NULL,
  "runtimeProfileId" varchar(36),
  "policyProfileId" varchar(36),
  "externalReference" varchar(255) NOT NULL,
  "dashboardUrl" text,
  "capabilitiesJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "hardwareJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "healthSummaryJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "warningFlagsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "fileScopeMode" "worker_file_scope_mode" DEFAULT 'workspace_scoped' NOT NULL,
  "lastSeenAt" timestamp with time zone,
  "registeredByUserId" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "worker_heartbeats" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workerId" varchar(36) NOT NULL,
  "runtimeType" "worker_runtime_type" NOT NULL,
  "status" "worker_status" NOT NULL,
  "metricsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "warningsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "currentJobCount" integer DEFAULT 0 NOT NULL,
  "queueDepth" integer DEFAULT 0 NOT NULL,
  "freeDiskBytes" bigint,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "worker_jobs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "teamId" varchar(36),
  "workerId" varchar(36),
  "runtimeType" "worker_runtime_type" NOT NULL,
  "workflowRunId" varchar(36),
  "requestedByUserId" integer,
  "requestedByPersonaId" varchar(36),
  "requestedBySystemComponent" varchar(100),
  "jobType" varchar(100) NOT NULL,
  "status" "worker_job_status" DEFAULT 'queued' NOT NULL,
  "statusReason" text,
  "priority" integer DEFAULT 0 NOT NULL,
  "resourceProfile" "worker_resource_profile" DEFAULT 'cpu_light' NOT NULL,
  "capabilityRequirementsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "inputJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "instructionsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "outputJson" jsonb,
  "failureReason" text,
  "timeoutSeconds" integer DEFAULT 3600 NOT NULL,
  "retryPolicyJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "idempotencyKey" varchar(128),
  "leaseOwnerToken" varchar(128),
  "leaseExpiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "startedAt" timestamp with time zone,
  "finishedAt" timestamp with time zone
);--> statement-breakpoint

CREATE TABLE "worker_job_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workerJobId" varchar(36) NOT NULL,
  "eventType" varchar(100) NOT NULL,
  "payloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "worker_artifacts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workerJobId" varchar(36) NOT NULL,
  "artifactType" varchar(100) NOT NULL,
  "storageRef" varchar(512) NOT NULL,
  "metadataJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "publishedItemId" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "assistant_profiles" ADD COLUMN "externalWorkerId" varchar(36);--> statement-breakpoint

ALTER TABLE "worker_policies" ADD CONSTRAINT "worker_policies_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_teamId_assistant_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."assistant_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_runtimeProfileId_runtime_profiles_id_fk" FOREIGN KEY ("runtimeProfileId") REFERENCES "public"."runtime_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_policyProfileId_worker_policies_id_fk" FOREIGN KEY ("policyProfileId") REFERENCES "public"."worker_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_registeredByUserId_users_id_fk" FOREIGN KEY ("registeredByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_heartbeats" ADD CONSTRAINT "worker_heartbeats_workerId_workers_id_fk" FOREIGN KEY ("workerId") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD CONSTRAINT "worker_jobs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD CONSTRAINT "worker_jobs_teamId_assistant_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."assistant_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD CONSTRAINT "worker_jobs_workerId_workers_id_fk" FOREIGN KEY ("workerId") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_jobs" ADD CONSTRAINT "worker_jobs_requestedByUserId_users_id_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_job_events" ADD CONSTRAINT "worker_job_events_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_artifacts" ADD CONSTRAINT "worker_artifacts_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_artifacts" ADD CONSTRAINT "worker_artifacts_publishedItemId_library_items_id_fk" FOREIGN KEY ("publishedItemId") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_externalWorkerId_workers_id_fk" FOREIGN KEY ("externalWorkerId") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "worker_policies_tenant_name_unique" ON "worker_policies" USING btree ("tenantId","name");--> statement-breakpoint
CREATE INDEX "worker_policies_runtime_type_idx" ON "worker_policies" USING btree ("tenantId","runtimeType");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_profiles_runtime_type_name_unique" ON "runtime_profiles" USING btree ("runtimeType","name");--> statement-breakpoint
CREATE UNIQUE INDEX "workers_tenant_external_reference_unique" ON "workers" USING btree ("tenantId","externalReference");--> statement-breakpoint
CREATE INDEX "workers_tenant_status_idx" ON "workers" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "workers_runtime_type_status_idx" ON "workers" USING btree ("runtimeType","status");--> statement-breakpoint
CREATE INDEX "workers_team_status_idx" ON "workers" USING btree ("teamId","status");--> statement-breakpoint
CREATE INDEX "worker_heartbeats_worker_created_idx" ON "worker_heartbeats" USING btree ("workerId","createdAt");--> statement-breakpoint
CREATE INDEX "worker_heartbeats_status_created_idx" ON "worker_heartbeats" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_jobs_tenant_idempotency_key_unique" ON "worker_jobs" USING btree ("tenantId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "worker_jobs_tenant_status_priority_idx" ON "worker_jobs" USING btree ("tenantId","status","priority");--> statement-breakpoint
CREATE INDEX "worker_jobs_worker_status_idx" ON "worker_jobs" USING btree ("workerId","status");--> statement-breakpoint
CREATE INDEX "worker_jobs_lease_expires_idx" ON "worker_jobs" USING btree ("leaseExpiresAt");--> statement-breakpoint
CREATE INDEX "worker_job_events_job_created_idx" ON "worker_job_events" USING btree ("workerJobId","createdAt");--> statement-breakpoint
CREATE INDEX "worker_job_events_type_created_idx" ON "worker_job_events" USING btree ("eventType","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_artifacts_job_storage_ref_unique" ON "worker_artifacts" USING btree ("workerJobId","storageRef");--> statement-breakpoint
CREATE INDEX "worker_artifacts_job_type_idx" ON "worker_artifacts" USING btree ("workerJobId","artifactType");--> statement-breakpoint
CREATE INDEX "worker_artifacts_published_item_idx" ON "worker_artifacts" USING btree ("publishedItemId");--> statement-breakpoint
CREATE INDEX "assistant_profiles_external_worker_idx" ON "assistant_profiles" USING btree ("externalWorkerId");--> statement-breakpoint
