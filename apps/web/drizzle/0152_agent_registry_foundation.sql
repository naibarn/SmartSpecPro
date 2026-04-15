CREATE TABLE IF NOT EXISTS "agent_registry_registries" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "registryKey" varchar(180) NOT NULL,
  "agentKind" varchar(64) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "owningTeamId" varchar(36),
  "owningUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "currentStableVersionId" varchar(36),
  "currentLatestVersionId" varchar(36),
  "rolloutState" varchar(32) NOT NULL DEFAULT 'draft',
  "modelFamilies" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_registry_registries_tenant_key_idx"
  ON "agent_registry_registries" USING btree ("tenantId", "registryKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_registries_tenant_idx"
  ON "agent_registry_registries" USING btree ("tenantId", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_registry_versions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "registryId" varchar(36) NOT NULL REFERENCES "agent_registry_registries"("id") ON DELETE cascade,
  "versionNumber" integer NOT NULL,
  "versionStatus" varchar(32) NOT NULL DEFAULT 'draft',
  "rolloutState" varchar(32) NOT NULL DEFAULT 'draft',
  "previousVersionId" varchar(36),
  "isStable" boolean NOT NULL DEFAULT false,
  "reviewRequired" boolean NOT NULL DEFAULT false,
  "publishedAt" timestamptz,
  "frozenAt" timestamptz,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_registry_versions_unique_version_idx"
  ON "agent_registry_versions" USING btree ("registryId", "versionNumber");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_versions_registry_idx"
  ON "agent_registry_versions" USING btree ("registryId", "versionNumber");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_versions_tenant_idx"
  ON "agent_registry_versions" USING btree ("tenantId", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_registry_policy_bindings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "registryId" varchar(36) NOT NULL REFERENCES "agent_registry_registries"("id") ON DELETE cascade,
  "versionId" varchar(36) NOT NULL REFERENCES "agent_registry_versions"("id") ON DELETE cascade,
  "purpose" text NOT NULL,
  "supportedWorkDomains" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "supportedToolClasses" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "disallowedActionClasses" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "memoryScopeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "budgetPolicyJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "escalationPolicyJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "approvalRequirementsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "modelCompatibilityJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "evaluationTargetsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outcomeMemoryHook" varchar(180) NOT NULL,
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_policy_bindings_registry_idx"
  ON "agent_registry_policy_bindings" USING btree ("registryId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_policy_bindings_version_idx"
  ON "agent_registry_policy_bindings" USING btree ("versionId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_registry_rollout_bindings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "registryId" varchar(36) NOT NULL REFERENCES "agent_registry_registries"("id") ON DELETE cascade,
  "versionId" varchar(36) NOT NULL REFERENCES "agent_registry_versions"("id") ON DELETE cascade,
  "tenantTargetId" varchar(36),
  "teamTargetId" varchar(36),
  "queueTargetId" varchar(36),
  "workpackFamily" varchar(120),
  "environment" varchar(64),
  "shadowPercent" integer NOT NULL DEFAULT 0,
  "canaryPercent" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_rollout_bindings_registry_idx"
  ON "agent_registry_rollout_bindings" USING btree ("registryId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_rollout_bindings_version_idx"
  ON "agent_registry_rollout_bindings" USING btree ("versionId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_registry_promotion_reviews" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "registryId" varchar(36) NOT NULL REFERENCES "agent_registry_registries"("id") ON DELETE cascade,
  "proposedVersionId" varchar(36) NOT NULL REFERENCES "agent_registry_versions"("id") ON DELETE cascade,
  "baselineVersionId" varchar(36),
  "decision" varchar(32) NOT NULL,
  "reason" text NOT NULL,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_promotion_reviews_registry_idx"
  ON "agent_registry_promotion_reviews" USING btree ("registryId", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_registry_outcome_memory" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "registryId" varchar(36) NOT NULL REFERENCES "agent_registry_registries"("id") ON DELETE cascade,
  "versionId" varchar(36) NOT NULL REFERENCES "agent_registry_versions"("id") ON DELETE cascade,
  "workloadClass" varchar(120) NOT NULL,
  "selectedModelFamily" varchar(120),
  "outcome" varchar(32) NOT NULL,
  "failureMode" varchar(180),
  "operatorEditsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "improvementNotes" text NOT NULL DEFAULT '',
  "redactionState" varchar(32) NOT NULL DEFAULT 'redacted',
  "retentionTier" varchar(32) NOT NULL DEFAULT 'standard',
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_outcome_memory_registry_idx"
  ON "agent_registry_outcome_memory" USING btree ("registryId", "workloadClass", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_registry_outcome_memory_version_idx"
  ON "agent_registry_outcome_memory" USING btree ("versionId", "createdAt");
--> statement-breakpoint
