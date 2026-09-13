CREATE TABLE IF NOT EXISTS "video_editor_project_revisions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "projectId" integer NOT NULL REFERENCES "video_editor_projects"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "schemaVersion" varchar(32) NOT NULL,
  "document" jsonb NOT NULL,
  "documentHash" varchar(64) NOT NULL,
  "reason" varchar(32) NOT NULL DEFAULT 'edit',
  "actorUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "clientMutationId" varchar(160),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_editor_project_revisions_project_revision_unique" ON "video_editor_project_revisions" ("projectId", "revision");
CREATE UNIQUE INDEX IF NOT EXISTS "video_editor_project_revisions_mutation_unique" ON "video_editor_project_revisions" ("projectId", "clientMutationId");
CREATE INDEX IF NOT EXISTS "video_editor_project_revisions_tenant_idx" ON "video_editor_project_revisions" ("tenantId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_editor_project_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "projectId" integer NOT NULL REFERENCES "video_editor_projects"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "revisionId" varchar(36) REFERENCES "video_editor_project_revisions"("id") ON DELETE SET NULL,
  "namespace" varchar(32) NOT NULL,
  "assetRef" jsonb NOT NULL,
  "sourceHash" varchar(128),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "video_editor_project_assets_project_idx" ON "video_editor_project_assets" ("projectId");
CREATE INDEX IF NOT EXISTS "video_editor_project_assets_tenant_idx" ON "video_editor_project_assets" ("tenantId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_editor_project_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "projectId" integer NOT NULL REFERENCES "video_editor_projects"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "revisionId" varchar(36) NOT NULL REFERENCES "video_editor_project_revisions"("id") ON DELETE RESTRICT,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "planHash" varchar(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_editor_project_jobs_worker_job_unique" ON "video_editor_project_jobs" ("workerJobId");
CREATE INDEX IF NOT EXISTS "video_editor_project_jobs_project_idx" ON "video_editor_project_jobs" ("projectId");
