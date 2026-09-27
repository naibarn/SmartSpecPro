CREATE TYPE "public"."approvalstatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."approvaltype" AS ENUM('CODE_EXECUTION', 'FILE_MODIFICATION', 'DEPLOYMENT', 'CONFIGURATION_CHANGE', 'COST_THRESHOLD', 'SECURITY_SENSITIVE', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."invite_code_type" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'domain_admin', 'system_agent');--> statement-breakpoint
CREATE TYPE "public"."worker_job_status" AS ENUM('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing', 'completed', 'succeeded', 'failed', 'canceled', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."worker_resource_profile" AS ENUM('cpu_light', 'cpu_heavy', 'gpu_required', 'large_disk_temp', 'network_heavy', 'long_running', 'sandbox_required', 'human_observable');--> statement-breakpoint
CREATE TYPE "public"."worker_runtime_type" AS ENUM('openclaw_gateway', 'desktop_zeroclaw_managed', 'nemoclaw_sandbox', 'hiclaw_cluster', 'hermes_agent_gateway', 'remotion_executor', 'local_llm_worker', 'node_job_worker', 'python_job_worker');--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"request_type" "approvaltype" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"tenant_id" varchar(36),
	"project_id" varchar(36),
	"execution_id" varchar(36),
	"requester_id" integer,
	"requester_type" varchar(50),
	"status" "approvalstatus" NOT NULL,
	"payload" json,
	"extra_data" json,
	"action_digest" varchar(128),
	"dom_fingerprint" varchar(255),
	"screenshot_hash" varchar(255),
	"correlation_key" varchar(255),
	"revoked_at" timestamp,
	"risk_level" varchar(20),
	"risk_factors" json,
	"required_approvers" integer,
	"current_approvals" integer,
	"expires_at" timestamp,
	"timeout_action" varchar(20),
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "approval_responses" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"request_id" varchar(36) NOT NULL,
	"approver_id" integer NOT NULL,
	"decision" varchar(20) NOT NULL,
	"comment" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"tenant_id" varchar(36),
	"project_id" varchar(36),
	"trigger_type" "approvaltype" NOT NULL,
	"conditions" json,
	"approver_roles" json,
	"approver_users" json,
	"required_approvals" integer,
	"timeout_minutes" integer,
	"timeout_action" varchar(20),
	"auto_approve_conditions" json,
	"priority" integer,
	"is_active" boolean,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "economic_budgets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"scopeType" varchar(32) NOT NULL,
	"scopeRef" varchar(160) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"limitMinorUnits" bigint NOT NULL,
	"heldMinorUnits" bigint DEFAULT 0 NOT NULL,
	"capturedMinorUnits" bigint DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_budgets_amounts_nonnegative_check" CHECK ("limitMinorUnits" >= 0 AND "heldMinorUnits" >= 0 AND "capturedMinorUnits" >= 0),
	CONSTRAINT "economic_budgets_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "economic_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"idempotencyKey" varchar(200) NOT NULL,
	"workerJobId" varchar(36),
	"attemptId" varchar(36),
	"actorId" varchar(160) NOT NULL,
	"policyVersion" varchar(64) NOT NULL,
	"payloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_holds" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"intentId" varchar(36) NOT NULL,
	"budgetId" varchar(36) NOT NULL,
	"workerJobId" varchar(36) NOT NULL,
	"attemptId" varchar(36) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amountMinorUnits" bigint NOT NULL,
	"capturedMinorUnits" bigint DEFAULT 0 NOT NULL,
	"releasedMinorUnits" bigint DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'held' NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_holds_amounts_check" CHECK ("amountMinorUnits" >= 0 AND "capturedMinorUnits" >= 0 AND "releasedMinorUnits" >= 0 AND "capturedMinorUnits" + "releasedMinorUnits" <= "amountMinorUnits"),
	CONSTRAINT "economic_holds_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "economic_intents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"actorId" varchar(160) NOT NULL,
	"actorType" varchar(24) NOT NULL,
	"workerJobId" varchar(36) NOT NULL,
	"attemptId" varchar(36) NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"effectType" varchar(48) NOT NULL,
	"resourceRef" varchar(255) NOT NULL,
	"amountMinorUnits" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"policyVersion" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'admitted' NOT NULL,
	"metadataJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_intents_amount_nonnegative_check" CHECK ("amountMinorUnits" >= 0),
	CONSTRAINT "economic_intents_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "economic_intents_actor_type_check" CHECK ("actorType" IN ('user', 'agent', 'system')),
	CONSTRAINT "economic_intents_idempotency_length_check" CHECK (length("idempotencyKey") BETWEEN 8 AND 128)
);
--> statement-breakpoint
CREATE TABLE "economic_journal_entries" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"workerJobId" varchar(36),
	"attemptId" varchar(36),
	"idempotencyKey" varchar(200) NOT NULL,
	"description" varchar(512) NOT NULL,
	"status" varchar(24) DEFAULT 'posted' NOT NULL,
	"reversalOfEntryId" varchar(36),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_journal_lines" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"entryId" varchar(36) NOT NULL,
	"accountId" varchar(36) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"debitMinorUnits" bigint DEFAULT 0 NOT NULL,
	"creditMinorUnits" bigint DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_journal_lines_nonnegative_check" CHECK ("debitMinorUnits" >= 0 AND "creditMinorUnits" >= 0),
	CONSTRAINT "economic_journal_lines_one_side_check" CHECK (("debitMinorUnits" > 0 AND "creditMinorUnits" = 0) OR ("creditMinorUnits" > 0 AND "debitMinorUnits" = 0)),
	CONSTRAINT "economic_journal_lines_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "economic_ledger_accounts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"accountType" varchar(32) NOT NULL,
	"ownerRef" varchar(160) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"balanceMinorUnits" bigint DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_ledger_accounts_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "economic_reconciliations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"workerJobId" varchar(36),
	"attemptId" varchar(36),
	"holdId" varchar(36),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reasonCode" varchar(100) NOT NULL,
	"externalReference" varchar(255),
	"detailsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvedAt" timestamp with time zone
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
CREATE TABLE "tenant_data_transfer_plans" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operationId" varchar(36) NOT NULL,
	"previewId" varchar(36) NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"sourceUserId" integer NOT NULL,
	"targetUserId" integer NOT NULL,
	"previewFingerprint" varchar(64) NOT NULL,
	"selectionJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"handlerSnapshotJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policyJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approvedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_data_transfer_plans_distinct_users_check" CHECK ("sourceUserId" <> "targetUserId")
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
CREATE TABLE "tenant_identity_actions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" integer NOT NULL,
	"actionId" varchar(128) NOT NULL,
	"commandTargetHash" varchar(64) NOT NULL,
	"sourceTenantId" varchar(36),
	"targetTenantId" varchar(36),
	"phase" varchar(40) DEFAULT 'pending' NOT NULL,
	"fencingVersion" integer DEFAULT 0 NOT NULL,
	"authorizationDecision" varchar(40) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"outcomeJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"safeErrorCode" varchar(100),
	"effectiveAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_responses" ADD CONSTRAINT "approval_responses_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_responses" ADD CONSTRAINT "approval_responses_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_budgets" ADD CONSTRAINT "economic_budgets_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_events" ADD CONSTRAINT "economic_events_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_events" ADD CONSTRAINT "economic_events_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_events" ADD CONSTRAINT "economic_events_attemptId_worker_job_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."worker_job_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_holds" ADD CONSTRAINT "economic_holds_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_holds" ADD CONSTRAINT "economic_holds_intentId_economic_intents_id_fk" FOREIGN KEY ("intentId") REFERENCES "public"."economic_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_holds" ADD CONSTRAINT "economic_holds_budgetId_economic_budgets_id_fk" FOREIGN KEY ("budgetId") REFERENCES "public"."economic_budgets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_holds" ADD CONSTRAINT "economic_holds_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_holds" ADD CONSTRAINT "economic_holds_attemptId_worker_job_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."worker_job_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_intents" ADD CONSTRAINT "economic_intents_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_intents" ADD CONSTRAINT "economic_intents_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_intents" ADD CONSTRAINT "economic_intents_attemptId_worker_job_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."worker_job_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_journal_entries" ADD CONSTRAINT "economic_journal_entries_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_journal_entries" ADD CONSTRAINT "economic_journal_entries_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_journal_entries" ADD CONSTRAINT "economic_journal_entries_attemptId_worker_job_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."worker_job_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_journal_lines" ADD CONSTRAINT "economic_journal_lines_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_journal_lines" ADD CONSTRAINT "economic_journal_lines_entryId_economic_journal_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."economic_journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_journal_lines" ADD CONSTRAINT "economic_journal_lines_accountId_economic_ledger_accounts_id_fk" FOREIGN KEY ("accountId") REFERENCES "public"."economic_ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_ledger_accounts" ADD CONSTRAINT "economic_ledger_accounts_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_reconciliations" ADD CONSTRAINT "economic_reconciliations_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_reconciliations" ADD CONSTRAINT "economic_reconciliations_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_reconciliations" ADD CONSTRAINT "economic_reconciliations_attemptId_worker_job_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."worker_job_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_reconciliations" ADD CONSTRAINT "economic_reconciliations_holdId_economic_holds_id_fk" FOREIGN KEY ("holdId") REFERENCES "public"."economic_holds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD CONSTRAINT "persona_templates_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_plans" ADD CONSTRAINT "tenant_data_transfer_plans_operationId_worker_jobs_id_fk" FOREIGN KEY ("operationId") REFERENCES "public"."worker_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_plans" ADD CONSTRAINT "tenant_data_transfer_plans_previewId_tenant_data_transfer_previews_id_fk" FOREIGN KEY ("previewId") REFERENCES "public"."tenant_data_transfer_previews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_plans" ADD CONSTRAINT "tenant_data_transfer_plans_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_plans" ADD CONSTRAINT "tenant_data_transfer_plans_sourceUserId_users_id_fk" FOREIGN KEY ("sourceUserId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_plans" ADD CONSTRAINT "tenant_data_transfer_plans_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_previews" ADD CONSTRAINT "tenant_data_transfer_previews_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_previews" ADD CONSTRAINT "tenant_data_transfer_previews_sourceUserId_users_id_fk" FOREIGN KEY ("sourceUserId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_previews" ADD CONSTRAINT "tenant_data_transfer_previews_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_data_transfer_previews" ADD CONSTRAINT "tenant_data_transfer_previews_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_identity_actions" ADD CONSTRAINT "tenant_identity_actions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_identity_actions" ADD CONSTRAINT "tenant_identity_actions_sourceTenantId_tenants_id_fk" FOREIGN KEY ("sourceTenantId") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_identity_actions" ADD CONSTRAINT "tenant_identity_actions_targetTenantId_tenants_id_fk" FOREIGN KEY ("targetTenantId") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_defaultPersonaId_persona_templates_id_fk" FOREIGN KEY ("defaultPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_currentTenantId_tenants_id_fk" FOREIGN KEY ("currentTenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_defaultPersonaId_persona_templates_id_fk" FOREIGN KEY ("defaultPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "idx_approval_request_status" ON "approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_approval_request_tenant" ON "approval_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_approval_request_type" ON "approval_requests" USING btree ("request_type");--> statement-breakpoint
CREATE INDEX "idx_approval_request_execution" ON "approval_requests" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_approval_request_correlation" ON "approval_requests" USING btree ("correlation_key");--> statement-breakpoint
CREATE INDEX "idx_approval_response_request" ON "approval_responses" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_approval_response_approver" ON "approval_responses" USING btree ("approver_id");--> statement-breakpoint
CREATE INDEX "idx_approval_rule_tenant" ON "approval_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_approval_rule_type" ON "approval_rules" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "idx_approval_rule_active" ON "approval_rules" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_budgets_scope_unique" ON "economic_budgets" USING btree ("tenantId","scopeType","scopeRef","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_events_tenant_idempotency_unique" ON "economic_events" USING btree ("tenantId","idempotencyKey");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_holds_intent_unique" ON "economic_holds" USING btree ("tenantId","intentId");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_holds_idempotency_unique" ON "economic_holds" USING btree ("tenantId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "economic_holds_active_idx" ON "economic_holds" USING btree ("tenantId","status","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_intents_tenant_idempotency_unique" ON "economic_intents" USING btree ("tenantId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "economic_intents_job_attempt_idx" ON "economic_intents" USING btree ("tenantId","workerJobId","attemptId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_journal_entries_tenant_idempotency_unique" ON "economic_journal_entries" USING btree ("tenantId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "economic_journal_entries_correlation_idx" ON "economic_journal_entries" USING btree ("tenantId","workerJobId","attemptId","createdAt");--> statement-breakpoint
CREATE INDEX "economic_journal_lines_entry_idx" ON "economic_journal_lines" USING btree ("tenantId","entryId");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_ledger_accounts_identity_unique" ON "economic_ledger_accounts" USING btree ("tenantId","accountType","ownerRef","currency");--> statement-breakpoint
CREATE INDEX "economic_reconciliations_pending_idx" ON "economic_reconciliations" USING btree ("tenantId","status","createdAt");--> statement-breakpoint
CREATE INDEX "invite_codes_owner_idx" ON "invite_codes" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "invite_codes_type_active_idx" ON "invite_codes" USING btree ("type","isActive");--> statement-breakpoint
CREATE INDEX "invite_codes_tenant_idx" ON "invite_codes" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "persona_templates_tenant_scope_idx" ON "persona_templates" USING btree ("tenantId","scope");--> statement-breakpoint
CREATE INDEX "persona_templates_user_idx" ON "persona_templates" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "persona_templates_source_template_ids_idx" ON "persona_templates" USING gin ("sourceTemplateIds");--> statement-breakpoint
CREATE INDEX "persona_templates_blueprint_origin_idx" ON "persona_templates" USING btree ("provisionedByBlueprintId","provisionedByBlueprintMemberId");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_data_transfer_plans_operation_unique" ON "tenant_data_transfer_plans" USING btree ("operationId");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_data_transfer_plans_preview_unique" ON "tenant_data_transfer_plans" USING btree ("previewId");--> statement-breakpoint
CREATE INDEX "tenant_data_transfer_plans_tenant_source_idx" ON "tenant_data_transfer_plans" USING btree ("tenantId","sourceUserId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_data_transfer_previews_request_unique" ON "tenant_data_transfer_previews" USING btree ("tenantId","requestIdempotencyKey");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_data_transfer_previews_fingerprint_unique" ON "tenant_data_transfer_previews" USING btree ("tenantId","snapshotFingerprint");--> statement-breakpoint
CREATE INDEX "tenant_data_transfer_previews_tenant_expiry_idx" ON "tenant_data_transfer_previews" USING btree ("tenantId","expiresAt");--> statement-breakpoint
CREATE INDEX "tenant_data_transfer_previews_source_idx" ON "tenant_data_transfer_previews" USING btree ("tenantId","sourceUserId","generatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_identity_actions_user_action_unique" ON "tenant_identity_actions" USING btree ("userId","actionId");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_identity_actions_active_fence_unique" ON "tenant_identity_actions" USING btree ("userId") WHERE "phase" IN ('pending', 'open', 'fenced', 'executing', 'paused');--> statement-breakpoint
CREATE INDEX "tenant_identity_actions_user_updated_idx" ON "tenant_identity_actions" USING btree ("userId","updatedAt");--> statement-breakpoint
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
CREATE INDEX "worker_jobs_series_binding_idx" ON "worker_jobs" USING btree ("workerSeriesBindingId","workerSeriesBindingRevision","status");