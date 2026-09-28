-- Vertical Drama compiled-video artifact versions.
-- A raw render is durable and usable immediately. Content protection is a
-- downstream best-effort step that may add a protected sibling version.
CREATE TABLE IF NOT EXISTS "vertical_drama_artifact_versions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "renderJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE CASCADE,
  "sourceArtifactId" varchar(36) REFERENCES "worker_artifacts"("id") ON DELETE SET NULL,
  "protectionJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE SET NULL,
  "protectionAssetId" varchar(36) REFERENCES "content_protection_assets"("id") ON DELETE SET NULL,
  "versionNumber" integer NOT NULL,
  "artifactKind" varchar(32) NOT NULL,
  "status" varchar(24) NOT NULL,
  "storageRef" text NOT NULL,
  "checksumSha256" varchar(64),
  "contentType" varchar(160) NOT NULL DEFAULT 'video/mp4',
  "durationSeconds" real,
  "shotCount" integer,
  "errorCode" varchar(100),
  "errorMessage" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "availableAt" timestamptz,
  CONSTRAINT "vds_artifact_version_kind_check" CHECK ("artifactKind" IN ('raw_render', 'protected_render')),
  CONSTRAINT "vds_artifact_version_status_check" CHECK ("status" IN ('processing', 'available', 'failed')),
  CONSTRAINT "vds_artifact_version_number_check" CHECK ("versionNumber" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "vds_artifact_version_render_kind_unique"
  ON "vertical_drama_artifact_versions" ("tenantId", "renderJobId", "artifactKind");
CREATE INDEX IF NOT EXISTS "vds_artifact_version_episode_idx"
  ON "vertical_drama_artifact_versions" ("tenantId", "ownerUserId", "seriesId", "episodeId", "createdAt");
CREATE INDEX IF NOT EXISTS "vds_artifact_version_protection_job_idx"
  ON "vertical_drama_artifact_versions" ("tenantId", "protectionJobId");
