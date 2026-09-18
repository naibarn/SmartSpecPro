CREATE TABLE IF NOT EXISTS "video_editor_execution_snapshots" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "projectId" integer NOT NULL REFERENCES "video_editor_projects"("id") ON DELETE CASCADE,
  "revisionId" varchar(36) NOT NULL REFERENCES "video_editor_project_revisions"("id") ON DELETE RESTRICT,
  "workerJobId" varchar(36),
  "idempotencyKey" varchar(160) NOT NULL,
  "operation" varchar(100) NOT NULL,
  "contractVersion" varchar(40) NOT NULL,
  "document" jsonb NOT NULL,
  "documentHash" varchar(64) NOT NULL,
  "snapshotHash" varchar(64) NOT NULL,
  "sourceFingerprints" jsonb NOT NULL,
  "capabilityProfile" jsonb NOT NULL,
  "policy" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_editor_execution_snapshots_worker_job_fk'
  ) THEN
    ALTER TABLE "video_editor_execution_snapshots"
      ADD CONSTRAINT "video_editor_execution_snapshots_worker_job_fk"
      FOREIGN KEY ("workerJobId") REFERENCES "worker_jobs"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "video_editor_execution_snapshots_tenant_idempotency_unique"
  ON "video_editor_execution_snapshots" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "video_editor_execution_snapshots_project_idx"
  ON "video_editor_execution_snapshots" ("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "video_editor_execution_snapshots_revision_idx"
  ON "video_editor_execution_snapshots" ("revisionId");
CREATE INDEX IF NOT EXISTS "video_editor_execution_snapshots_job_idx"
  ON "video_editor_execution_snapshots" ("workerJobId");
