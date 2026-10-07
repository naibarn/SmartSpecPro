CREATE TYPE "public"."invite_code_type" AS ENUM('admin', 'user');--> statement-breakpoint

CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro', 'enterprise');--> statement-breakpoint

CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'domain_admin', 'system_agent');--> statement-breakpoint

CREATE TYPE "public"."worker_job_status" AS ENUM('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing', 'completed', 'succeeded', 'failed', 'canceled', 'cancelled', 'expired');--> statement-breakpoint

CREATE TYPE "public"."worker_resource_profile" AS ENUM('cpu_light', 'cpu_heavy', 'gpu_required', 'large_disk_temp', 'network_heavy', 'long_running', 'sandbox_required', 'human_observable');--> statement-breakpoint

CREATE TYPE "public"."worker_runtime_type" AS ENUM('openclaw_gateway', 'desktop_zeroclaw_managed', 'nemoclaw_sandbox', 'hiclaw_cluster', 'hermes_agent_gateway', 'remotion_executor', 'local_llm_worker', 'node_job_worker', 'python_job_worker');--> statement-breakpoint

CREATE TABLE "app_identities" (
	"app_id" varchar(128) PRIMARY KEY NOT NULL,
	"public_app_id" varchar(128) NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"publisher_ref" varchar(128) NOT NULL,
	"canonical_product_id" varchar(128) NOT NULL,
	"lifecycle" varchar(16) DEFAULT 'draft' NOT NULL,
	"policy_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parent_app_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_identities_lifecycle_check" CHECK ("app_identities"."lifecycle" IN ('draft', 'active', 'suspended', 'archived')),
	CONSTRAINT "app_identities_parent_not_self_check" CHECK ("app_identities"."parent_app_id" IS NULL OR "app_identities"."parent_app_id" <> "app_identities"."app_id")
);
--> statement-breakpoint

CREATE TABLE "canonical_project_app_bindings" (
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"app_id" varchar(128) NOT NULL,
	"relation" varchar(32) DEFAULT 'USES' NOT NULL,
	"lifecycle" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_project_app_bindings_pk" PRIMARY KEY("tenant_id","project_id","app_id"),
	CONSTRAINT "canonical_project_app_bindings_relation_check" CHECK (length(btrim("canonical_project_app_bindings"."relation")) > 0),
	CONSTRAINT "canonical_project_app_bindings_lifecycle_check" CHECK ("canonical_project_app_bindings"."lifecycle" IN ('ACTIVE', 'REVOKED'))
);
--> statement-breakpoint

CREATE TABLE "canonical_project_memberships" (
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"principal_id" varchar(160) NOT NULL,
	"role" varchar(16) NOT NULL,
	"lifecycle" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "canonical_project_memberships_pk" PRIMARY KEY("tenant_id","project_id","principal_id"),
	CONSTRAINT "canonical_project_memberships_role_check" CHECK ("canonical_project_memberships"."role" IN ('owner', 'editor', 'viewer')),
	CONSTRAINT "canonical_project_memberships_lifecycle_check" CHECK ("canonical_project_memberships"."lifecycle" IN ('ACTIVE', 'REVOKED')),
	CONSTRAINT "canonical_project_memberships_revocation_check" CHECK (("canonical_project_memberships"."lifecycle" = 'ACTIVE' AND "canonical_project_memberships"."revoked_at" IS NULL) OR ("canonical_project_memberships"."lifecycle" = 'REVOKED' AND "canonical_project_memberships"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint

CREATE TABLE "canonical_projects" (
	"project_id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_type" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"owner_principal_id" varchar(160) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lifecycle" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
	"identity_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_projects_lifecycle_check" CHECK ("canonical_projects"."lifecycle" IN ('ACTIVE', 'ARCHIVED', 'DELETED_PENDING_RETENTION', 'RETIRED')),
	CONSTRAINT "canonical_projects_title_nonempty_check" CHECK (length(btrim("canonical_projects"."title")) > 0),
	CONSTRAINT "canonical_projects_owner_nonempty_check" CHECK (length(btrim("canonical_projects"."owner_principal_id")) > 0),
	CONSTRAINT "canonical_projects_type_nonempty_check" CHECK (length(btrim("canonical_projects"."project_type")) > 0)
);
--> statement-breakpoint

CREATE TABLE "invite_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"label" varchar(128),
	"type" "invite_code_type" NOT NULL,
	"tenantId" varchar(36),
	"ownerId" integer NOT NULL,
	"bonusCreditsForNewUser" integer DEFAULT 0 NOT NULL,
	"bonusCreditsForOwner" integer DEFAULT 0 NOT NULL,
	"maxUses" integer,
	"currentUses" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp with time zone,
	"isActive" boolean DEFAULT true NOT NULL,
	"description" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint

CREATE TABLE "mini_app_project_wiki_pages" (
	"page_id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_id" varchar(36) DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"app_id" varchar(128) NOT NULL,
	"owner_principal_id" varchar(160) NOT NULL,
	"path" varchar(512) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"lifecycle" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mini_app_project_wiki_pages_lifecycle_check" CHECK ("mini_app_project_wiki_pages"."lifecycle" IN ('ACTIVE', 'ARCHIVED')),
	CONSTRAINT "mini_app_project_wiki_pages_path_nonempty_check" CHECK (length(btrim("mini_app_project_wiki_pages"."path")) > 0),
	CONSTRAINT "mini_app_project_wiki_pages_path_lowercase_check" CHECK ("mini_app_project_wiki_pages"."path" = lower("mini_app_project_wiki_pages"."path")),
	CONSTRAINT "mini_app_project_wiki_pages_title_nonempty_check" CHECK (length(btrim("mini_app_project_wiki_pages"."title")) > 0),
	CONSTRAINT "mini_app_project_wiki_pages_owner_nonempty_check" CHECK (length(btrim("mini_app_project_wiki_pages"."owner_principal_id")) > 0),
	CONSTRAINT "mini_app_project_wiki_pages_content_hash_check" CHECK ("mini_app_project_wiki_pages"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mini_app_project_wiki_pages_content_size_check" CHECK (octet_length("mini_app_project_wiki_pages"."content") <= 262144)
);
--> statement-breakpoint

CREATE TABLE "mini_app_research_notes" (
	"note_id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"app_id" varchar(128) NOT NULL,
	"owner_principal_id" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"ai_summary" text,
	"lifecycle" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mini_app_research_notes_lifecycle_check" CHECK ("mini_app_research_notes"."lifecycle" IN ('ACTIVE', 'ARCHIVED')),
	CONSTRAINT "mini_app_research_notes_title_nonempty_check" CHECK (length(btrim("mini_app_research_notes"."title")) > 0),
	CONSTRAINT "mini_app_research_notes_owner_nonempty_check" CHECK (length(btrim("mini_app_research_notes"."owner_principal_id")) > 0),
	CONSTRAINT "mini_app_research_notes_content_size_check" CHECK (octet_length("mini_app_research_notes"."content") <= 262144)
);
--> statement-breakpoint

CREATE TABLE "persona_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36),
	"userId" integer,
	"name" text NOT NULL,
	"description" text,
	"assistantNickname" text,
	"assistantGender" text DEFAULT 'neutral',
	"workingHours" jsonb,
	"sourceTemplateIds" text[] DEFAULT '{}' NOT NULL,
	"sourceTemplateLabels" text[] DEFAULT '{}' NOT NULL,
	"sourceTemplateCategories" text[] DEFAULT '{}' NOT NULL,
	"systemPromptPrefix" text NOT NULL,
	"tone" text,
	"language" text DEFAULT 'auto',
	"responseStyle" jsonb DEFAULT '{}'::jsonb,
	"restrictions" text[] DEFAULT '{}',
	"scope" text NOT NULL,
	"isDefault" boolean DEFAULT false,
	"provisionedByBlueprintId" varchar(120),
	"provisionedByBlueprintMemberId" varchar(120),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persona_templates_assistant_gender_check" CHECK ("assistantGender" IN ('female','male','neutral') OR "assistantGender" IS NULL),
	CONSTRAINT "persona_templates_tone_check" CHECK ("tone" IN ('formal','casual','friendly','technical','creative') OR "tone" IS NULL),
	CONSTRAINT "persona_templates_scope_check" CHECK ("scope" IN ('platform','tenant','user'))
);
--> statement-breakpoint

CREATE TABLE "revoked_token_jtis" (
	"jti_hash" varchar(64) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "runner_capability_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runnerId" varchar(160) NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"revision" varchar(128) NOT NULL,
	"idempotencyKey" varchar(200) NOT NULL,
	"observedAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"snapshotJson" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "runner_nodes" (
	"runnerId" varchar(160) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"ownerUserId" integer,
	"nodeKind" varchar(32) NOT NULL,
	"profile" varchar(32) NOT NULL,
	"deviceId" varchar(160),
	"displayName" varchar(255) NOT NULL,
	"trustState" varchar(32) DEFAULT 'pending' NOT NULL,
	"status" varchar(32) DEFAULT 'offline' NOT NULL,
	"currentSnapshotRevision" varchar(128),
	"currentSnapshotJson" jsonb,
	"snapshotObservedAt" timestamp with time zone,
	"snapshotExpiresAt" timestamp with time zone,
	"activeSessionId" varchar(160),
	"lastSeenAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "tenant_data_transfer_previews" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"sourceUserId" integer NOT NULL,
	"targetUserId" integer NOT NULL,
	"selectionHash" varchar(64) NOT NULL,
	"snapshotFingerprint" varchar(64) NOT NULL,
	"handlerRegistryVersion" varchar(80) NOT NULL,
	"policyVersion" varchar(80) NOT NULL,
	"schemaVersion" varchar(80) NOT NULL,
	"createdByUserId" integer,
	"selectionJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"handlerSnapshotJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"countsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requestIdempotencyKey" varchar(128) NOT NULL,
	"generatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint

CREATE TABLE "tenants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"primaryDomain" varchar(255),
	"domains" json,
	"logoUrl" varchar(512),
	"websiteLogoUrl" varchar(512),
	"faviconUrl" varchar(512),
	"isActive" boolean DEFAULT true NOT NULL,
	"seoConfig" json,
	"themeConfig" json,
	"contactInfo" json,
	"settings" json,
	"ownerId" integer,
	"defaultPersonaId" varchar(36),
	"featureFlags" json,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"plan" varchar(20) DEFAULT 'FREE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_primaryDomain_unique" UNIQUE("primaryDomain")
);
--> statement-breakpoint

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"firstName" varchar(120),
	"lastName" varchar(120),
	"contactEmail" varchar(320),
	"contactPhone" varchar(16),
	"contactAddressLine1" varchar(255),
	"contactAddressLine2" varchar(255),
	"contactCity" varchar(120),
	"contactStateOrProvince" varchar(120),
	"contactPostalCode" varchar(32),
	"contactCountryCode" varchar(2),
	"password" text,
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"registeredDomain" varchar(255),
	"currentTenantId" varchar(36),
	"tenantIdentityMigrationReason" varchar(120),
	"tenantIdentityMigratedAt" timestamp with time zone,
	"credits" integer DEFAULT 0 NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"isDisabled" boolean DEFAULT false NOT NULL,
	"normalizedEmail" varchar(320),
	"trustScore" integer DEFAULT 100,
	"registrationIp" varchar(45),
	"userPreferences" json DEFAULT '{}'::json,
	"backupEmail" varchar(320),
	"backupEmailVerified" boolean DEFAULT false NOT NULL,
	"phone" varchar(20),
	"phoneVerified" boolean DEFAULT false NOT NULL,
	"telegramChatId" varchar(64),
	"telegramUsername" varchar(64),
	"telegramVerified" boolean DEFAULT false NOT NULL,
	"telegramVerifiedAt" timestamp with time zone,
	"twoFactorEnabled" boolean DEFAULT false NOT NULL,
	"twoFactorSecret" text,
	"recoveryCodes" json DEFAULT '[]'::json,
	"defaultPersonaId" varchar(36),
	"isSystemUser" boolean DEFAULT false,
	"voiceConsentGrantedAt" timestamp with time zone,
	"referredByInviteCodeId" integer,
	"disabledReason" varchar(64),
	"lastCreditUsedAt" timestamp with time zone,
	"freeCreditGrantedAt" timestamp with time zone,
	"freeCreditPolicyCancelledAt" timestamp with time zone,
	"freeCreditNoticeSentAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	"passwordChangedAt" timestamp with time zone,
	"sessionRevokedAt" timestamp with time zone,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint

CREATE TABLE "worker_job_attempts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workerJobId" varchar(36) NOT NULL,
	"attempt" integer NOT NULL,
	"leaseGeneration" integer DEFAULT 0 NOT NULL,
	"runnerId" varchar(160),
	"leaseTokenHash" varchar(128),
	"leaseExpiresAt" timestamp with time zone,
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone,
	"terminalClass" varchar(32),
	"recoveryReason" varchar(500),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "worker_job_dispatches" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workerJobId" varchar(36) NOT NULL,
	"attemptId" varchar(36),
	"adapter" varchar(80) NOT NULL,
	"referenceNamespace" varchar(120) NOT NULL,
	"dispatchKind" varchar(40) DEFAULT 'publish' NOT NULL,
	"dedupeKey" varchar(200) NOT NULL,
	"providerJobId" varchar(255),
	"queueJobId" varchar(255),
	"celeryTaskId" varchar(255),
	"workflowInstanceId" varchar(255),
	"containerInstanceId" varchar(255),
	"publicationStatus" varchar(32) DEFAULT 'published' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"publishedAt" timestamp with time zone,
	"consumedAt" timestamp with time zone,
	"failedAt" timestamp with time zone
);
--> statement-breakpoint

CREATE TABLE "worker_job_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workerJobId" varchar(36) NOT NULL,
	"workerJobAttempt" integer,
	"leaseFencingVersion" bigint,
	"eventType" varchar(100) NOT NULL,
	"assignmentId" varchar(160),
	"sequence" integer,
	"eventSequence" integer,
	"eventIdempotencyKey" varchar(200),
	"attemptId" varchar(36),
	"payloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "worker_job_outbox" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workerJobId" varchar(36) NOT NULL,
	"attemptId" varchar(36),
	"envelopeVersion" varchar(40) NOT NULL,
	"envelopeJson" jsonb NOT NULL,
	"dedupeKey" varchar(200) NOT NULL,
	"publishAttempts" integer DEFAULT 0 NOT NULL,
	"nextAttemptAt" timestamp with time zone DEFAULT now() NOT NULL,
	"publisherLeaseTokenHash" varchar(128),
	"publisherLeaseExpiresAt" timestamp with time zone,
	"publisherFencingVersion" integer DEFAULT 0 NOT NULL,
	"publishedAt" timestamp with time zone,
	"cancelledAt" timestamp with time zone,
	"failedReason" text,
	"quarantinedAt" timestamp with time zone,
	"operatorReviewReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "worker_job_settlements" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workerJobId" varchar(36) NOT NULL,
	"attemptId" varchar(36),
	"settlementKey" varchar(200) NOT NULL,
	"settlementType" varchar(64) NOT NULL,
	"payloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"committedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "worker_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"teamId" varchar(36),
	"workerId" varchar(36),
	"workerSeriesBindingId" varchar(36),
	"workerSeriesBindingRevision" integer,
	"runtimeType" "worker_runtime_type" NOT NULL,
	"workflowRunId" varchar(36),
	"requestedByUserId" integer,
	"requestedByPersonaId" varchar(36),
	"requestedBySystemComponent" varchar(100),
	"jobType" varchar(100) NOT NULL,
	"status" "worker_job_status" DEFAULT 'queued' NOT NULL,
	"executionClass" varchar(32) DEFAULT 'short' NOT NULL,
	"contractVersion" varchar(40) DEFAULT 'feature-186-v1' NOT NULL,
	"definitionHash" varchar(64),
	"statusReason" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"resourceProfile" "worker_resource_profile" DEFAULT 'cpu_light' NOT NULL,
	"capabilityRequirementsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inputJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"instructionsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outputJson" jsonb,
	"failureReason" text,
	"errorCode" varchar(100),
	"errorMessage" text,
	"timeoutSeconds" integer DEFAULT 3600 NOT NULL,
	"retryPolicyJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timeoutPolicyJson" jsonb DEFAULT '{"softTimeoutMs":0,"hardTimeoutMs":3600000}'::jsonb NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"maxAttempts" integer DEFAULT 1 NOT NULL,
	"nextRetryAt" timestamp with time zone,
	"idempotencyKey" varchar(128),
	"leaseOwnerToken" varchar(128),
	"leaseExpiresAt" timestamp with time zone,
	"heartbeatAt" timestamp with time zone,
	"fencingVersion" integer DEFAULT 0 NOT NULL,
	"progressJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resultRef" text,
	"scheduledAt" timestamp with time zone,
	"operatorReviewRequired" boolean DEFAULT false NOT NULL,
	"operatorReviewReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone
);
--> statement-breakpoint

CREATE UNIQUE INDEX "app_identities_public_app_id_unique" ON "app_identities" USING btree ("public_app_id");--> statement-breakpoint

CREATE UNIQUE INDEX "app_identities_tenant_app_id_unique" ON "app_identities" USING btree ("tenant_id","app_id");--> statement-breakpoint

CREATE INDEX "canonical_project_memberships_principal_idx" ON "canonical_project_memberships" USING btree ("tenant_id","principal_id","lifecycle");--> statement-breakpoint

CREATE UNIQUE INDEX "canonical_projects_tenant_project_unique" ON "canonical_projects" USING btree ("tenant_id","project_id");--> statement-breakpoint

CREATE INDEX "canonical_projects_owner_idx" ON "canonical_projects" USING btree ("tenant_id","owner_principal_id","lifecycle","updated_at" DESC NULLS LAST);--> statement-breakpoint

CREATE INDEX "invite_codes_owner_idx" ON "invite_codes" USING btree ("ownerId");--> statement-breakpoint

CREATE INDEX "invite_codes_type_active_idx" ON "invite_codes" USING btree ("type","isActive");--> statement-breakpoint

CREATE INDEX "invite_codes_tenant_idx" ON "invite_codes" USING btree ("tenantId");--> statement-breakpoint

CREATE UNIQUE INDEX "mini_app_project_wiki_pages_tenant_page_unique" ON "mini_app_project_wiki_pages" USING btree ("tenant_id","page_id");--> statement-breakpoint

CREATE UNIQUE INDEX "mini_app_project_wiki_pages_stable_id_unique" ON "mini_app_project_wiki_pages" USING btree ("tenant_id","project_id","stable_id");--> statement-breakpoint

CREATE UNIQUE INDEX "mini_app_project_wiki_pages_active_path_unique" ON "mini_app_project_wiki_pages" USING btree ("tenant_id","project_id","path") WHERE "mini_app_project_wiki_pages"."lifecycle" = 'ACTIVE';--> statement-breakpoint

CREATE INDEX "mini_app_project_wiki_pages_updated_idx" ON "mini_app_project_wiki_pages" USING btree ("tenant_id","project_id","updated_at" DESC NULLS LAST,"page_id");--> statement-breakpoint

CREATE UNIQUE INDEX "mini_app_research_notes_tenant_note_unique" ON "mini_app_research_notes" USING btree ("tenant_id","note_id");--> statement-breakpoint

CREATE INDEX "mini_app_research_notes_project_updated_idx" ON "mini_app_research_notes" USING btree ("tenant_id","project_id","updated_at" DESC NULLS LAST,"note_id");--> statement-breakpoint

CREATE INDEX "persona_templates_tenant_scope_idx" ON "persona_templates" USING btree ("tenantId","scope");--> statement-breakpoint

CREATE INDEX "persona_templates_user_idx" ON "persona_templates" USING btree ("userId");--> statement-breakpoint

CREATE INDEX "persona_templates_source_template_ids_idx" ON "persona_templates" USING gin ("sourceTemplateIds");--> statement-breakpoint

CREATE INDEX "persona_templates_blueprint_origin_idx" ON "persona_templates" USING btree ("provisionedByBlueprintId","provisionedByBlueprintMemberId");--> statement-breakpoint

CREATE INDEX "revoked_token_jtis_expires_at_idx" ON "revoked_token_jtis" USING btree ("expires_at");--> statement-breakpoint

CREATE UNIQUE INDEX "runner_snapshots_runner_revision_unique" ON "runner_capability_snapshots" USING btree ("runnerId","revision");--> statement-breakpoint

CREATE UNIQUE INDEX "runner_snapshots_runner_idempotency_unique" ON "runner_capability_snapshots" USING btree ("runnerId","idempotencyKey");--> statement-breakpoint

CREATE INDEX "runner_snapshots_tenant_created_idx" ON "runner_capability_snapshots" USING btree ("tenantId","createdAt");--> statement-breakpoint

CREATE INDEX "runner_nodes_tenant_status_idx" ON "runner_nodes" USING btree ("tenantId","status");--> statement-breakpoint

CREATE UNIQUE INDEX "runner_nodes_tenant_device_unique" ON "runner_nodes" USING btree ("tenantId","deviceId");--> statement-breakpoint

CREATE UNIQUE INDEX "tenant_data_transfer_previews_request_unique" ON "tenant_data_transfer_previews" USING btree ("tenantId","requestIdempotencyKey");--> statement-breakpoint

CREATE UNIQUE INDEX "tenant_data_transfer_previews_fingerprint_unique" ON "tenant_data_transfer_previews" USING btree ("tenantId","snapshotFingerprint");--> statement-breakpoint

CREATE INDEX "tenant_data_transfer_previews_tenant_expiry_idx" ON "tenant_data_transfer_previews" USING btree ("tenantId","expiresAt");--> statement-breakpoint

CREATE INDEX "tenant_data_transfer_previews_source_idx" ON "tenant_data_transfer_previews" USING btree ("tenantId","sourceUserId","generatedAt");--> statement-breakpoint

CREATE UNIQUE INDEX "users_email_lower_trim_unique" ON "users" USING btree (lower(btrim("email"))) WHERE "users"."email" IS NOT NULL;--> statement-breakpoint

CREATE INDEX "users_free_credit_policy_idx" ON "users" USING btree ("freeCreditGrantedAt","freeCreditPolicyCancelledAt","isDisabled");--> statement-breakpoint

CREATE INDEX "users_current_tenant_idx" ON "users" USING btree ("currentTenantId","id");--> statement-breakpoint

CREATE INDEX "users_session_revoked_idx" ON "users" USING btree ("sessionRevokedAt");--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_attempts_job_attempt_unique" ON "worker_job_attempts" USING btree ("workerJobId","attempt");--> statement-breakpoint

CREATE INDEX "worker_job_attempts_job_created_idx" ON "worker_job_attempts" USING btree ("workerJobId","createdAt");--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_dispatches_dedupe_unique" ON "worker_job_dispatches" USING btree ("adapter","dedupeKey");--> statement-breakpoint

CREATE INDEX "worker_job_dispatches_job_created_idx" ON "worker_job_dispatches" USING btree ("workerJobId","createdAt");--> statement-breakpoint

CREATE INDEX "worker_job_dispatches_external_ref_idx" ON "worker_job_dispatches" USING btree ("referenceNamespace","providerJobId");--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_dispatches_provider_ref_unique" ON "worker_job_dispatches" USING btree ("referenceNamespace","providerJobId") WHERE "providerJobId" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_dispatches_queue_ref_unique" ON "worker_job_dispatches" USING btree ("referenceNamespace","queueJobId") WHERE "queueJobId" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_dispatches_celery_ref_unique" ON "worker_job_dispatches" USING btree ("referenceNamespace","celeryTaskId") WHERE "celeryTaskId" IS NOT NULL;--> statement-breakpoint

CREATE INDEX "worker_job_events_job_created_idx" ON "worker_job_events" USING btree ("workerJobId","createdAt");--> statement-breakpoint

CREATE INDEX "worker_job_events_type_created_idx" ON "worker_job_events" USING btree ("eventType","createdAt");--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_events_assignment_sequence_unique" ON "worker_job_events" USING btree ("workerJobId","assignmentId","sequence") WHERE "assignmentId" IS NOT NULL AND "sequence" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_events_job_event_sequence_unique" ON "worker_job_events" USING btree ("workerJobId","eventSequence") WHERE "eventSequence" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_events_idempotency_unique" ON "worker_job_events" USING btree ("workerJobId","eventIdempotencyKey") WHERE "eventIdempotencyKey" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_outbox_dedupe_unique" ON "worker_job_outbox" USING btree ("dedupeKey");--> statement-breakpoint

CREATE INDEX "worker_job_outbox_due_idx" ON "worker_job_outbox" USING btree ("publishedAt","cancelledAt","quarantinedAt","nextAttemptAt");--> statement-breakpoint

CREATE INDEX "worker_job_outbox_job_idx" ON "worker_job_outbox" USING btree ("workerJobId","createdAt");--> statement-breakpoint

CREATE UNIQUE INDEX "worker_job_settlements_key_unique" ON "worker_job_settlements" USING btree ("settlementKey");--> statement-breakpoint

CREATE INDEX "worker_job_settlements_job_idx" ON "worker_job_settlements" USING btree ("workerJobId","committedAt");--> statement-breakpoint

CREATE UNIQUE INDEX "worker_jobs_tenant_idempotency_key_unique" ON "worker_jobs" USING btree ("tenantId","idempotencyKey");--> statement-breakpoint

CREATE INDEX "worker_jobs_tenant_status_priority_idx" ON "worker_jobs" USING btree ("tenantId","status","priority");--> statement-breakpoint

CREATE INDEX "worker_jobs_worker_status_idx" ON "worker_jobs" USING btree ("workerId","status");--> statement-breakpoint

CREATE INDEX "worker_jobs_lease_expires_idx" ON "worker_jobs" USING btree ("leaseExpiresAt");--> statement-breakpoint

CREATE INDEX "worker_jobs_due_retry_idx" ON "worker_jobs" USING btree ("status","nextRetryAt");--> statement-breakpoint

CREATE INDEX "worker_jobs_admission_tenant_class_status_idx" ON "worker_jobs" USING btree ("tenantId","executionClass","status") WHERE "status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing');--> statement-breakpoint

CREATE INDEX "worker_jobs_admission_class_status_idx" ON "worker_jobs" USING btree ("executionClass","status") WHERE "status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing');--> statement-breakpoint

CREATE INDEX "worker_jobs_definition_hash_idx" ON "worker_jobs" USING btree ("tenantId","definitionHash");--> statement-breakpoint

CREATE INDEX "worker_jobs_series_binding_idx" ON "worker_jobs" USING btree ("workerSeriesBindingId","workerSeriesBindingRevision","status");--> statement-breakpoint

ALTER TABLE "app_identities" ADD CONSTRAINT "app_identities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "canonical_project_app_bindings" ADD CONSTRAINT "canonical_project_app_bindings_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."canonical_projects"("tenant_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "canonical_project_app_bindings" ADD CONSTRAINT "canonical_project_app_bindings_app_fk" FOREIGN KEY ("tenant_id","app_id") REFERENCES "public"."app_identities"("tenant_id","app_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "canonical_project_memberships" ADD CONSTRAINT "canonical_project_memberships_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."canonical_projects"("tenant_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "canonical_projects" ADD CONSTRAINT "canonical_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "mini_app_project_wiki_pages" ADD CONSTRAINT "mini_app_project_wiki_pages_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."canonical_projects"("tenant_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "mini_app_project_wiki_pages" ADD CONSTRAINT "mini_app_project_wiki_pages_app_fk" FOREIGN KEY ("tenant_id","app_id") REFERENCES "public"."app_identities"("tenant_id","app_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "mini_app_research_notes" ADD CONSTRAINT "mini_app_research_notes_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."canonical_projects"("tenant_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "mini_app_research_notes" ADD CONSTRAINT "mini_app_research_notes_app_fk" FOREIGN KEY ("tenant_id","app_id") REFERENCES "public"."app_identities"("tenant_id","app_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "runner_capability_snapshots" ADD CONSTRAINT "runner_capability_snapshots_runnerId_runner_nodes_runnerId_fk" FOREIGN KEY ("runnerId") REFERENCES "public"."runner_nodes"("runnerId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "runner_capability_snapshots" ADD CONSTRAINT "runner_capability_snapshots_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "runner_nodes" ADD CONSTRAINT "runner_nodes_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "runner_nodes" ADD CONSTRAINT "runner_nodes_ownerUserId_users_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tenant_data_transfer_previews" ADD CONSTRAINT "tenant_data_transfer_previews_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tenant_data_transfer_previews" ADD CONSTRAINT "tenant_data_transfer_previews_sourceUserId_users_id_fk" FOREIGN KEY ("sourceUserId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tenant_data_transfer_previews" ADD CONSTRAINT "tenant_data_transfer_previews_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tenant_data_transfer_previews" ADD CONSTRAINT "tenant_data_transfer_previews_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_defaultPersonaId_persona_templates_id_fk" FOREIGN KEY ("defaultPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_currentTenantId_tenants_id_fk" FOREIGN KEY ("currentTenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_defaultPersonaId_persona_templates_id_fk" FOREIGN KEY ("defaultPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_referredByInviteCodeId_invite_codes_id_fk" FOREIGN KEY ("referredByInviteCodeId") REFERENCES "public"."invite_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_attempts" ADD CONSTRAINT "worker_job_attempts_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_dispatches" ADD CONSTRAINT "worker_job_dispatches_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_dispatches" ADD CONSTRAINT "worker_job_dispatches_attemptId_worker_job_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."worker_job_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_events" ADD CONSTRAINT "worker_job_events_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_outbox" ADD CONSTRAINT "worker_job_outbox_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_outbox" ADD CONSTRAINT "worker_job_outbox_attemptId_worker_job_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."worker_job_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_settlements" ADD CONSTRAINT "worker_job_settlements_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_settlements" ADD CONSTRAINT "worker_job_settlements_attemptId_worker_job_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."worker_job_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_jobs" ADD CONSTRAINT "worker_jobs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_jobs" ADD CONSTRAINT "worker_jobs_requestedByUserId_users_id_fk" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
