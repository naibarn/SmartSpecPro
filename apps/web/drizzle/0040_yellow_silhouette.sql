CREATE TYPE "public"."sandbox_artifact_type" AS ENUM('primary', 'log', 'screenshot', 'thumbnail', 'chunk', 'debug');--> statement-breakpoint
CREATE TYPE "public"."sandbox_execution_mode" AS ENUM('code', 'command', 'browser', 'file', 'media');--> statement-breakpoint
CREATE TYPE "public"."sandbox_feature_type" AS ENUM('chat', 'skill', 'workflow', 'library', 'media', 'presentation', 'connector');--> statement-breakpoint
CREATE TYPE "public"."sandbox_job_status" AS ENUM('accepted', 'policy_resolved', 'queued', 'provisioning', 'staging_inputs', 'executing', 'collecting_outputs', 'persisting', 'completed', 'failed', 'timed_out', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."sandbox_network_action" AS ENUM('deny', 'allow');--> statement-breakpoint
CREATE TABLE "sandbox_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"sandboxJobId" varchar(36) NOT NULL,
	"artifactType" "sandbox_artifact_type" NOT NULL,
	"objectKey" varchar(512) NOT NULL,
	"mimeType" varchar(128),
	"sizeBytes" bigint,
	"sha256" varchar(64),
	"isPrimary" boolean DEFAULT false NOT NULL,
	"metadataJson" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"featureType" "sandbox_feature_type" NOT NULL,
	"featureRefId" varchar(128),
	"executionMode" "sandbox_execution_mode" NOT NULL,
	"sandboxProfileId" integer,
	"opensandboxId" varchar(128),
	"status" "sandbox_job_status" DEFAULT 'accepted' NOT NULL,
	"statusReason" text,
	"imageUri" varchar(512),
	"inputManifestJson" jsonb,
	"outputManifestJson" jsonb,
	"stdoutExcerpt" text,
	"stderrExcerpt" text,
	"costEstimate" numeric(12, 4),
	"costActual" numeric(12, 4),
	"idempotencyKey" varchar(128),
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"executionMode" "sandbox_execution_mode" NOT NULL,
	"baseImage" varchar(512) NOT NULL,
	"entrypointTemplate" text,
	"cpuLimit" varchar(16) DEFAULT '1000m' NOT NULL,
	"memoryLimitMb" integer DEFAULT 2048 NOT NULL,
	"ephemeralDiskMb" integer DEFAULT 5120 NOT NULL,
	"timeoutSeconds" integer DEFAULT 300 NOT NULL,
	"networkDefaultAction" "sandbox_network_action" DEFAULT 'deny' NOT NULL,
	"allowBrowser" boolean DEFAULT false NOT NULL,
	"allowCommand" boolean DEFAULT false NOT NULL,
	"allowCodeInterpreter" boolean DEFAULT false NOT NULL,
	"allowFileUpload" boolean DEFAULT true NOT NULL,
	"maxInputMb" integer DEFAULT 50,
	"maxOutputMb" integer DEFAULT 100,
	"isActive" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sandbox_profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tenant_sandbox_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"defaultProfileId" integer,
	"maxConcurrentSandboxes" integer DEFAULT 5 NOT NULL,
	"maxDailyRuntimeSeconds" integer DEFAULT 36000 NOT NULL,
	"maxSingleJobSeconds" integer DEFAULT 1800 NOT NULL,
	"defaultNetworkAction" "sandbox_network_action",
	"egressRulesJson" jsonb,
	"allowedImagesJson" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_sandbox_policies_tenantId_unique" UNIQUE("tenantId")
);
--> statement-breakpoint
ALTER TABLE "api_audit_events" ADD COLUMN "sandboxJobId" varchar(36);--> statement-breakpoint
ALTER TABLE "api_audit_events" ADD COLUMN "opensandboxId" varchar(128);--> statement-breakpoint
ALTER TABLE "media_callback_events" ADD COLUMN "sandbox_job_id" varchar(36);--> statement-breakpoint
ALTER TABLE "presentation_conversion_records" ADD COLUMN "sandbox_job_id" varchar(36);--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "sandboxProfileSlug" varchar(64);--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "requiresNetwork" boolean;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "requiresBrowser" boolean;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "maxRuntimeSeconds" integer;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "maxInputMb" integer;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "sandboxJobIds" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "sandbox_artifacts" ADD CONSTRAINT "sandbox_artifacts_sandboxJobId_sandbox_jobs_id_fk" FOREIGN KEY ("sandboxJobId") REFERENCES "public"."sandbox_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_jobs" ADD CONSTRAINT "sandbox_jobs_sandboxProfileId_sandbox_profiles_id_fk" FOREIGN KEY ("sandboxProfileId") REFERENCES "public"."sandbox_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_sandbox_policies" ADD CONSTRAINT "tenant_sandbox_policies_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_sandbox_policies" ADD CONSTRAINT "tenant_sandbox_policies_defaultProfileId_sandbox_profiles_id_fk" FOREIGN KEY ("defaultProfileId") REFERENCES "public"."sandbox_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sandbox_artifacts_job_idx" ON "sandbox_artifacts" USING btree ("sandboxJobId");--> statement-breakpoint
CREATE INDEX "sandbox_artifacts_type_idx" ON "sandbox_artifacts" USING btree ("artifactType");--> statement-breakpoint
CREATE UNIQUE INDEX "sandbox_jobs_idempotency_idx" ON "sandbox_jobs" USING btree ("tenantId","featureType","idempotencyKey") WHERE "sandbox_jobs"."idempotencyKey" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sandbox_jobs_tenant_status_idx" ON "sandbox_jobs" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "sandbox_jobs_opensandbox_id_idx" ON "sandbox_jobs" USING btree ("opensandboxId");--> statement-breakpoint
CREATE INDEX "sandbox_jobs_user_idx" ON "sandbox_jobs" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "sandbox_jobs_created_idx" ON "sandbox_jobs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "sandbox_jobs_expires_idx" ON "sandbox_jobs" USING btree ("expiresAt");