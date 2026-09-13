-- Feature 184 parity: resumable managed uploads and reviewable analysis artifacts.
-- Additive migration; no existing project, asset or worker-job rows are removed.
CREATE TABLE IF NOT EXISTS "video_editor_upload_sessions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "projectId" integer REFERENCES "video_editor_projects"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sourceHash" varchar(128),
  "objectKey" text NOT NULL,
  "method" varchar(16) NOT NULL,
  "fileName" varchar(512) NOT NULL,
  "sizeBytes" bigint NOT NULL,
  "mimeType" varchar(256) NOT NULL,
  "partSizeBytes" integer,
  "checksumAlgorithm" varchar(16) NOT NULL DEFAULT 'sha256',
  "expectedChecksum" varchar(128),
  "status" varchar(16) NOT NULL DEFAULT 'created',
  "idempotencyKey" varchar(160) NOT NULL,
  "reservedBytes" bigint NOT NULL DEFAULT 0,
  "reservedObjects" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "abortedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_editor_upload_sessions_idempotency_unique"
  ON "video_editor_upload_sessions" ("tenantId", "userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "video_editor_upload_sessions_project_status_idx"
  ON "video_editor_upload_sessions" ("projectId", "status");
CREATE INDEX IF NOT EXISTS "video_editor_upload_sessions_expiry_idx"
  ON "video_editor_upload_sessions" ("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "video_editor_upload_sessions_source_hash_idx"
  ON "video_editor_upload_sessions" ("tenantId", "sourceHash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_editor_upload_parts" (
  "id" serial PRIMARY KEY NOT NULL,
  "sessionId" varchar(64) NOT NULL REFERENCES "video_editor_upload_sessions"("id") ON DELETE CASCADE,
  "partNumber" integer NOT NULL,
  "etag" varchar(256),
  "sizeBytes" bigint,
  "checksum" varchar(128),
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_editor_upload_parts_session_part_unique"
  ON "video_editor_upload_parts" ("sessionId", "partNumber");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_editor_analysis_artifacts" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "projectId" integer REFERENCES "video_editor_projects"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "revisionId" varchar(36) REFERENCES "video_editor_project_revisions"("id") ON DELETE SET NULL,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE SET NULL,
  "kind" varchar(64) NOT NULL,
  "sourceAssetIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "algorithmVersion" varchar(64) NOT NULL,
  "artifact" jsonb NOT NULL,
  "checksum" varchar(128),
  "confidence" jsonb,
  "reviewDecision" varchar(16) NOT NULL DEFAULT 'pending',
  "appliedRevisionId" varchar(36) REFERENCES "video_editor_project_revisions"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_editor_analysis_artifacts_project_kind_idx"
  ON "video_editor_analysis_artifacts" ("projectId", "kind");
CREATE INDEX IF NOT EXISTS "video_editor_analysis_artifacts_tenant_status_idx"
  ON "video_editor_analysis_artifacts" ("tenantId", "reviewDecision");
CREATE INDEX IF NOT EXISTS "video_editor_analysis_artifacts_revision_idx"
  ON "video_editor_analysis_artifacts" ("revisionId");
