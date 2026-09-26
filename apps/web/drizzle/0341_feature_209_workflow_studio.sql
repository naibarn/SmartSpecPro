-- Feature 209: additive semantic Workflow Studio persistence. This does not
-- restore or call the retired legacy engine.
CREATE TABLE IF NOT EXISTS "workflow_studio_definitions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" varchar(200) NOT NULL,
  "description" varchar(1000),
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "semanticDefinitionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "miniAppSchemaJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "accessMode" varchar(24) NOT NULL DEFAULT 'private',
  "currentVersionNumber" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_definitions_tenant_name_unique" ON "workflow_studio_definitions" ("tenantId", "name");
CREATE INDEX IF NOT EXISTS "workflow_studio_definitions_tenant_status_idx" ON "workflow_studio_definitions" ("tenantId", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "workflow_studio_versions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "versionNumber" integer NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "semanticDefinitionJson" jsonb NOT NULL,
  "inputSchemaJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "outputSchemaJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "publishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workflow_studio_versions_number_positive" CHECK ("versionNumber" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_versions_definition_number_unique" ON "workflow_studio_versions" ("definitionId", "versionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_versions_published_hash_unique" ON "workflow_studio_versions" ("definitionId", "contentHash");

CREATE TABLE IF NOT EXISTS "workflow_studio_views" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "viewJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_views_user_definition_unique" ON "workflow_studio_views" ("definitionId", "userId");

CREATE TABLE IF NOT EXISTS "workflow_studio_apps" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE RESTRICT,
  "versionId" varchar(36) NOT NULL REFERENCES "workflow_studio_versions"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "slug" varchar(160) NOT NULL,
  "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "accessMode" varchar(24) NOT NULL DEFAULT 'private',
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "publishedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_apps_tenant_slug_unique" ON "workflow_studio_apps" ("tenantId", "slug");

ALTER TABLE "workflow_studio_apps"
  ADD COLUMN IF NOT EXISTS "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "workflow_studio_definitions"
  ADD COLUMN IF NOT EXISTS "draftRevision" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "workflow_studio_runs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actorUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE RESTRICT,
  "versionId" varchar(36) NOT NULL REFERENCES "workflow_studio_versions"("id") ON DELETE RESTRICT,
  "contentHash" varchar(64) NOT NULL,
  "inputFingerprint" varchar(64) NOT NULL,
  "inputJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "mode" varchar(24) NOT NULL,
  "targetNodeId" varchar(128),
  "checkpointId" varchar(36),
  "idempotencyKey" varchar(160) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'admitted',
  "runRevision" integer NOT NULL DEFAULT 0,
  "canonicalJobRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outputJson" jsonb,
  "errorJson" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "startedAt" timestamptz,
  "finishedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_runs_tenant_idempotency_unique" ON "workflow_studio_runs" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "workflow_studio_runs_tenant_status_idx" ON "workflow_studio_runs" ("tenantId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "workflow_studio_runs_version_created_idx" ON "workflow_studio_runs" ("versionId", "createdAt");

CREATE TABLE IF NOT EXISTS "workflow_studio_run_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "runId" varchar(36) NOT NULL REFERENCES "workflow_studio_runs"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "eventType" varchar(80) NOT NULL,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "eventIdempotencyKey" varchar(200) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_run_events_sequence_unique" ON "workflow_studio_run_events" ("runId", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_studio_run_events_idempotency_unique" ON "workflow_studio_run_events" ("runId", "eventIdempotencyKey");
CREATE INDEX IF NOT EXISTS "workflow_studio_run_events_tenant_created_idx" ON "workflow_studio_run_events" ("tenantId", "createdAt");

CREATE TABLE IF NOT EXISTS "workflow_studio_checkpoints" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "runId" varchar(36) NOT NULL REFERENCES "workflow_studio_runs"("id") ON DELETE CASCADE,
  "definitionId" varchar(36) NOT NULL REFERENCES "workflow_studio_definitions"("id") ON DELETE RESTRICT,
  "versionId" varchar(36) NOT NULL REFERENCES "workflow_studio_versions"("id") ON DELETE RESTRICT,
  "contentHash" varchar(64) NOT NULL,
  "inputFingerprint" varchar(64) NOT NULL,
  "completedNodeIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outputJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "artifactRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "digest" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'ready',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workflow_studio_checkpoints_run_created_idx" ON "workflow_studio_checkpoints" ("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "workflow_studio_checkpoints_tenant_version_idx" ON "workflow_studio_checkpoints" ("tenantId", "versionId", "createdAt");
