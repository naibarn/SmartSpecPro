-- Feature 116 production director schema hardening.
-- This migration is intentionally additive so environments that already ran
-- 0182/0183 with partially-created tables can converge without data loss.

CREATE TABLE IF NOT EXISTS "media_provider_assets" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(64) NOT NULL,
  "capability" varchar(80) NOT NULL,
  "assetType" varchar(40) NOT NULL,
  "providerAssetId" varchar(256) NOT NULL,
  "displayName" varchar(256) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "clientRequestId" varchar(128),
  "sourceMediaAssetId" bigint REFERENCES "media_assets"("id") ON DELETE set null,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "assetSnapshot" jsonb DEFAULT '{}'::jsonb,
  "lastUsedAt" timestamptz,
  "deletedAt" timestamptz,
  "purgeAfter" timestamptz,
  "reconciliationStatus" varchar(32),
  "reconciliationReason" varchar(128),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "provider" varchar(64);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "capability" varchar(80);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "assetType" varchar(40);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "providerAssetId" varchar(256);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "displayName" varchar(256);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'active';
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "clientRequestId" varchar(128);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "sourceMediaAssetId" bigint;
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "assetSnapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "lastUsedAt" timestamptz;
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "purgeAfter" timestamptz;
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "reconciliationStatus" varchar(32);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "reconciliationReason" varchar(128);
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE "media_provider_assets" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

UPDATE "media_provider_assets"
SET
  "status" = COALESCE("status", 'active'),
  "metadata" = COALESCE("metadata", '{}'::jsonb),
  "assetSnapshot" = COALESCE("assetSnapshot", '{}'::jsonb),
  "createdAt" = COALESCE("createdAt", now()),
  "updatedAt" = COALESCE("updatedAt", now());

CREATE TABLE IF NOT EXISTS "media_production_runs" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'goal_draft',
  "goalVersion" integer NOT NULL DEFAULT 1,
  "planVersion" integer NOT NULL DEFAULT 0,
  "goal" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "productionBible" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "assetPlan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "qualityGateSummary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "budgetSummary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "contractVersion" varchar(32) NOT NULL DEFAULT '1.0.0',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "status" varchar(40) DEFAULT 'goal_draft';
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "goalVersion" integer DEFAULT 1;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "planVersion" integer DEFAULT 0;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "goal" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "productionBible" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "assetPlan" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "qualityGateSummary" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "budgetSummary" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "contractVersion" varchar(32) DEFAULT '1.0.0';
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE "media_production_runs" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

UPDATE "media_production_runs"
SET
  "status" = COALESCE("status", 'goal_draft'),
  "goalVersion" = COALESCE("goalVersion", 1),
  "planVersion" = COALESCE("planVersion", 0),
  "goal" = COALESCE("goal", '{}'::jsonb),
  "productionBible" = COALESCE("productionBible", '{}'::jsonb),
  "assetPlan" = COALESCE("assetPlan", '{}'::jsonb),
  "qualityGateSummary" = COALESCE("qualityGateSummary", '{}'::jsonb),
  "budgetSummary" = COALESCE("budgetSummary", '{}'::jsonb),
  "contractVersion" = COALESCE("contractVersion", '1.0.0'),
  "createdAt" = COALESCE("createdAt", now()),
  "updatedAt" = COALESCE("updatedAt", now());

CREATE TABLE IF NOT EXISTS "media_production_goal_versions" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "version" integer NOT NULL,
  "goal" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "changedFields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "inputHash" varchar(128),
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "contractVersion" varchar(32) NOT NULL DEFAULT '1.0.0',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "goal" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "changedFields" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "inputHash" varchar(128);
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'active';
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "contractVersion" varchar(32) DEFAULT '1.0.0';
ALTER TABLE "media_production_goal_versions" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();

UPDATE "media_production_goal_versions"
SET
  "version" = COALESCE("version", 1),
  "goal" = COALESCE("goal", '{}'::jsonb),
  "changedFields" = COALESCE("changedFields", '[]'::jsonb),
  "status" = COALESCE("status", 'active'),
  "contractVersion" = COALESCE("contractVersion", '1.0.0'),
  "createdAt" = COALESCE("createdAt", now());

CREATE TABLE IF NOT EXISTS "media_production_plan_versions" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "goalVersion" integer NOT NULL DEFAULT 1,
  "version" integer NOT NULL,
  "plannerSkillId" varchar(128) NOT NULL DEFAULT 'media-production-storyboard-planner',
  "plannerSkillVersion" varchar(32),
  "plan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "inputHash" varchar(128),
  "outputHash" varchar(128),
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "contractVersion" varchar(32) NOT NULL DEFAULT '1.0.0',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "goalVersion" integer DEFAULT 1;
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "plannerSkillId" varchar(128) DEFAULT 'media-production-storyboard-planner';
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "plannerSkillVersion" varchar(32);
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "plan" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "inputHash" varchar(128);
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "outputHash" varchar(128);
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'draft';
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "contractVersion" varchar(32) DEFAULT '1.0.0';
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE "media_production_plan_versions" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

UPDATE "media_production_plan_versions"
SET
  "goalVersion" = COALESCE("goalVersion", 1),
  "version" = COALESCE("version", 1),
  "plannerSkillId" = COALESCE("plannerSkillId", 'media-production-storyboard-planner'),
  "plan" = COALESCE("plan", '{}'::jsonb),
  "status" = COALESCE("status", 'draft'),
  "contractVersion" = COALESCE("contractVersion", '1.0.0'),
  "createdAt" = COALESCE("createdAt", now()),
  "updatedAt" = COALESCE("updatedAt", now());

CREATE TABLE IF NOT EXISTS "media_production_plan_verifications" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "planVersion" integer NOT NULL,
  "verifierSkillId" varchar(128) NOT NULL DEFAULT 'media-production-plan-verifier',
  "verifierSkillVersion" varchar(32),
  "verdict" varchar(32) NOT NULL,
  "score" integer NOT NULL DEFAULT 0,
  "verification" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "blockingIssues" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "missingDecisions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "recommendedRevisions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "contractVersion" varchar(32) NOT NULL DEFAULT '1.0.0',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "planVersion" integer DEFAULT 1;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "verifierSkillId" varchar(128) DEFAULT 'media-production-plan-verifier';
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "verifierSkillVersion" varchar(32);
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "verdict" varchar(32) DEFAULT 'pending';
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "score" integer DEFAULT 0;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "verification" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "blockingIssues" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "warnings" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "missingDecisions" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "recommendedRevisions" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'active';
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "contractVersion" varchar(32) DEFAULT '1.0.0';
ALTER TABLE "media_production_plan_verifications" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();

UPDATE "media_production_plan_verifications"
SET
  "planVersion" = COALESCE("planVersion", 1),
  "verifierSkillId" = COALESCE("verifierSkillId", 'media-production-plan-verifier'),
  "verdict" = COALESCE("verdict", 'pending'),
  "score" = COALESCE("score", 0),
  "verification" = COALESCE("verification", '{}'::jsonb),
  "blockingIssues" = COALESCE("blockingIssues", '[]'::jsonb),
  "warnings" = COALESCE("warnings", '[]'::jsonb),
  "missingDecisions" = COALESCE("missingDecisions", '[]'::jsonb),
  "recommendedRevisions" = COALESCE("recommendedRevisions", '[]'::jsonb),
  "status" = COALESCE("status", 'active'),
  "contractVersion" = COALESCE("contractVersion", '1.0.0'),
  "createdAt" = COALESCE("createdAt", now());

CREATE TABLE IF NOT EXISTS "media_production_asset_plans" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "planVersion" integer NOT NULL,
  "assetPlan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "readiness" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(32) NOT NULL DEFAULT 'planned',
  "contractVersion" varchar(32) NOT NULL DEFAULT '1.0.0',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "planVersion" integer DEFAULT 1;
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "assetPlan" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "readiness" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'planned';
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "contractVersion" varchar(32) DEFAULT '1.0.0';
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE "media_production_asset_plans" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

UPDATE "media_production_asset_plans"
SET
  "planVersion" = COALESCE("planVersion", 1),
  "assetPlan" = COALESCE("assetPlan", '{}'::jsonb),
  "readiness" = COALESCE("readiness", '{}'::jsonb),
  "status" = COALESCE("status", 'planned'),
  "contractVersion" = COALESCE("contractVersion", '1.0.0'),
  "createdAt" = COALESCE("createdAt", now()),
  "updatedAt" = COALESCE("updatedAt", now());

CREATE TABLE IF NOT EXISTS "media_production_approvals" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "planVersion" integer NOT NULL,
  "approvalType" varchar(40) NOT NULL DEFAULT 'plan',
  "status" varchar(32) NOT NULL DEFAULT 'approved',
  "acceptedWarnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "lockedTargets" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text,
  "policySnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "budgetSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "planVersion" integer DEFAULT 1;
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "approvalType" varchar(40) DEFAULT 'plan';
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'approved';
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "acceptedWarnings" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "lockedTargets" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "policySnapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "budgetSnapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_approvals" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();

UPDATE "media_production_approvals"
SET
  "planVersion" = COALESCE("planVersion", 1),
  "approvalType" = COALESCE("approvalType", 'plan'),
  "status" = COALESCE("status", 'approved'),
  "acceptedWarnings" = COALESCE("acceptedWarnings", '[]'::jsonb),
  "lockedTargets" = COALESCE("lockedTargets", '[]'::jsonb),
  "policySnapshot" = COALESCE("policySnapshot", '{}'::jsonb),
  "budgetSnapshot" = COALESCE("budgetSnapshot", '{}'::jsonb),
  "createdAt" = COALESCE("createdAt", now());

CREATE TABLE IF NOT EXISTS "media_production_output_projections" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "storyboardRunId" varchar(128),
  "surface" varchar(40) NOT NULL,
  "surfaceRecordId" varchar(128),
  "projectionVersion" integer NOT NULL DEFAULT 1,
  "sourceOutputHash" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastSyncedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "storyboardRunId" varchar(128);
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "surface" varchar(40);
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "surfaceRecordId" varchar(128);
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "projectionVersion" integer DEFAULT 1;
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "sourceOutputHash" varchar(128);
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'active';
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "lastSyncedAt" timestamptz DEFAULT now();
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE "media_production_output_projections" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

UPDATE "media_production_output_projections"
SET
  "projectionVersion" = COALESCE("projectionVersion", 1),
  "status" = COALESCE("status", 'active'),
  "metadata" = COALESCE("metadata", '{}'::jsonb),
  "lastSyncedAt" = COALESCE("lastSyncedAt", now()),
  "createdAt" = COALESCE("createdAt", now()),
  "updatedAt" = COALESCE("updatedAt", now());

CREATE TABLE IF NOT EXISTS "media_production_spaces" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "version" integer NOT NULL,
  "space" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "changeKind" varchar(40) DEFAULT 'space' NOT NULL,
  "changedFields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "spaceHash" varchar(128) NOT NULL,
  "status" varchar(40) DEFAULT 'goal_draft' NOT NULL,
  "archivedAt" timestamp with time zone,
  "deletedAt" timestamp with time zone,
  "contractVersion" varchar(32) DEFAULT '1.0.0' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "space" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "changeKind" varchar(40) DEFAULT 'space';
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "changedFields" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "spaceHash" varchar(128);
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "status" varchar(40) DEFAULT 'goal_draft';
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp with time zone;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "contractVersion" varchar(32) DEFAULT '1.0.0';
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now();
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now();

UPDATE "media_production_spaces"
SET
  "version" = COALESCE("version", 1),
  "space" = COALESCE("space", '{}'::jsonb),
  "changeKind" = COALESCE("changeKind", 'space'),
  "changedFields" = COALESCE("changedFields", '[]'::jsonb),
  "status" = COALESCE("status", 'goal_draft'),
  "contractVersion" = COALESCE("contractVersion", '1.0.0'),
  "createdAt" = COALESCE("createdAt", now()),
  "updatedAt" = COALESCE("updatedAt", now());

CREATE INDEX IF NOT EXISTS "media_provider_assets_tenant_user_idx"
  ON "media_provider_assets" ("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "media_provider_assets_capability_status_idx"
  ON "media_provider_assets" ("capability", "status");
CREATE INDEX IF NOT EXISTS "media_provider_assets_provider_asset_idx"
  ON "media_provider_assets" ("provider", "providerAssetId");
CREATE UNIQUE INDEX IF NOT EXISTS "media_provider_assets_provider_unique"
  ON "media_provider_assets" ("tenantId", "provider", "capability", "providerAssetId");
CREATE UNIQUE INDEX IF NOT EXISTS "media_provider_assets_request_unique"
  ON "media_provider_assets" ("tenantId", "provider", "capability", "clientRequestId")
  WHERE "clientRequestId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "media_production_runs_identity_unique"
  ON "media_production_runs" ("tenantId", "productionRunId");
CREATE INDEX IF NOT EXISTS "media_production_runs_user_status_idx"
  ON "media_production_runs" ("userId", "status", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "media_production_goal_versions_unique"
  ON "media_production_goal_versions" ("tenantId", "productionRunId", "version");
CREATE INDEX IF NOT EXISTS "media_production_goal_versions_run_idx"
  ON "media_production_goal_versions" ("tenantId", "productionRunId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "media_production_plan_versions_unique"
  ON "media_production_plan_versions" ("tenantId", "productionRunId", "version");
CREATE INDEX IF NOT EXISTS "media_production_plan_versions_run_idx"
  ON "media_production_plan_versions" ("tenantId", "productionRunId", "createdAt");
CREATE INDEX IF NOT EXISTS "media_production_plan_verifications_run_idx"
  ON "media_production_plan_verifications" ("tenantId", "productionRunId", "planVersion", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "media_production_asset_plans_unique"
  ON "media_production_asset_plans" ("tenantId", "productionRunId", "planVersion");
CREATE INDEX IF NOT EXISTS "media_production_approvals_run_idx"
  ON "media_production_approvals" ("tenantId", "productionRunId", "planVersion", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "media_production_output_projection_unique"
  ON "media_production_output_projections" ("tenantId", "productionRunId", "surface", "sourceOutputHash");
CREATE UNIQUE INDEX IF NOT EXISTS "media_production_spaces_unique"
  ON "media_production_spaces" ("tenantId", "productionRunId", "version");
CREATE INDEX IF NOT EXISTS "media_production_spaces_run_idx"
  ON "media_production_spaces" ("tenantId", "productionRunId", "createdAt");
CREATE INDEX IF NOT EXISTS "media_production_spaces_user_status_idx"
  ON "media_production_spaces" ("userId", "status", "updatedAt");
