DO $$
BEGIN
  CREATE TYPE "browser_policy_decision" AS ENUM (
    'allow',
    'allow_with_redaction',
    'require_approval',
    'deny',
    'escalate_for_review'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "browser_action_class" AS ENUM (
    'read',
    'draft',
    'commit',
    'restricted'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "browser_page_sensitivity" AS ENUM (
    'none',
    'auth',
    'financial',
    'admin',
    'sensitive_data',
    'communication',
    'code'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_browser_policy_config" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "enforcementMode" varchar(32) DEFAULT 'observe' NOT NULL,
  "defaultApprovalTtlSeconds" integer DEFAULT 300 NOT NULL,
  "reviewCadenceDays" integer DEFAULT 90 NOT NULL,
  "killSwitchEnabled" boolean DEFAULT false NOT NULL,
  "requireTamperEvidence" boolean DEFAULT true NOT NULL,
  "evidenceRetentionDays" integer DEFAULT 365 NOT NULL,
  "allowedDomains" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "visionModel" varchar(100) DEFAULT 'gpt-4o' NOT NULL,
  "seededDefault" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_browser_policy_config_tenantId_unique" UNIQUE ("tenantId"),
  CONSTRAINT "tenant_browser_policy_config_ttl_bounds"
    CHECK ("defaultApprovalTtlSeconds" >= 60 AND "defaultApprovalTtlSeconds" <= 900)
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tenant_browser_policy_config"
    ADD CONSTRAINT "tenant_browser_policy_config_tenantId_tenants_id_fk"
    FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_browser_policy_config_tenant_idx"
  ON "tenant_browser_policy_config" USING btree ("tenantId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_browser_policy_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "description" text,
  "match" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "decision" "browser_policy_decision" NOT NULL,
  "reasonCode" varchar(100) NOT NULL,
  "actionClass" "browser_action_class",
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tenant_browser_policy_rules"
    ADD CONSTRAINT "tenant_browser_policy_rules_tenantId_tenants_id_fk"
    FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_browser_policy_rules_tenant_idx"
  ON "tenant_browser_policy_rules" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_browser_policy_rules_priority_idx"
  ON "tenant_browser_policy_rules" USING btree ("tenantId", "priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_browser_policy_rules_enabled_idx"
  ON "tenant_browser_policy_rules" USING btree ("tenantId", "enabled");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "browser_workflow_entitlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "workflowId" integer NOT NULL,
  "workflowName" varchar(255) NOT NULL,
  "businessOwner" varchar(255),
  "technicalOwner" varchar(255),
  "riskRating" varchar(32) DEFAULT 'medium' NOT NULL,
  "allowedCapabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "forbiddenCapabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowedDataClasses" jsonb DEFAULT '["public","internal"]'::jsonb NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "expiresAt" timestamp with time zone,
  "reviewCadenceDays" integer DEFAULT 90 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "browser_workflow_entitlements"
    ADD CONSTRAINT "browser_workflow_entitlements_tenantId_tenants_id_fk"
    FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "browser_workflow_entitlements"
    ADD CONSTRAINT "browser_workflow_entitlements_workflowId_workflows_id_fk"
    FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_browser_workflow_entitlements_tenant_workflow"
  ON "browser_workflow_entitlements" USING btree ("tenantId", "workflowId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_workflow_entitlements_tenant_idx"
  ON "browser_workflow_entitlements" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_workflow_entitlements_workflow_idx"
  ON "browser_workflow_entitlements" USING btree ("workflowId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "browser_policy_decisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "traceId" varchar(64),
  "tenantId" varchar(36) NOT NULL,
  "userId" integer,
  "workflowId" integer,
  "executionId" varchar(128),
  "actionType" varchar(64) NOT NULL,
  "actionClass" "browser_action_class" NOT NULL,
  "pageSensitivity" "browser_page_sensitivity" NOT NULL,
  "decision" "browser_policy_decision" NOT NULL,
  "reasonCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "approvalState" varchar(32) NOT NULL,
  "outcome" varchar(16) NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "previousEventHash" varchar(128),
  "eventHash" varchar(128) NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "browser_policy_decisions_event_hash_uq" UNIQUE ("eventHash")
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "browser_policy_decisions"
    ADD CONSTRAINT "browser_policy_decisions_tenantId_tenants_id_fk"
    FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "browser_policy_decisions"
    ADD CONSTRAINT "browser_policy_decisions_userId_users_id_fk"
    FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_policy_decisions_tenant_created_idx"
  ON "browser_policy_decisions" USING btree ("tenantId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_policy_decisions_trace_idx"
  ON "browser_policy_decisions" USING btree ("traceId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_policy_decisions_execution_idx"
  ON "browser_policy_decisions" USING btree ("executionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_policy_decisions_decision_idx"
  ON "browser_policy_decisions" USING btree ("decision", "createdAt");
