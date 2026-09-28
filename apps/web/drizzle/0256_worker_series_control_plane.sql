CREATE TABLE IF NOT EXISTS "worker_series_bindings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL,
  "workerId" varchar(36) NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "rootId" varchar(128) NOT NULL,
  "rootFingerprint" varchar(128) NOT NULL,
  "workspaceMode" varchar(32) NOT NULL DEFAULT 'local_only',
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "bindingRevision" integer NOT NULL DEFAULT 1,
  "policySnapshotJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastValidatedAt" timestamptz,
  "lastScanAt" timestamptz,
  "revokedAt" timestamptz,
  "revokedByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "revocationReason" varchar(255),
  "createdByUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "worker_series_bindings_worker_idx"
  ON "worker_series_bindings" ("tenantId", "workerId", "status");
CREATE INDEX IF NOT EXISTS "worker_series_bindings_series_idx"
  ON "worker_series_bindings" ("tenantId", "seriesId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "worker_series_bindings_active_root_unique"
  ON "worker_series_bindings" ("tenantId", "workerId", "seriesId", "rootId")
  WHERE "status" IN ('pending', 'active', 'stale', 'revoking');

CREATE TABLE IF NOT EXISTS "worker_series_control_plane_idempotency" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL,
  "workerId" varchar(36) NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "idempotencyKey" varchar(160) NOT NULL,
  "requestHash" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'accepted',
  "responseJson" jsonb,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "workerId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "worker_series_idempotency_expiry_idx"
  ON "worker_series_control_plane_idempotency" ("expiresAt");

CREATE TABLE IF NOT EXISTS "vertical_drama_media_assets" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "bindingId" varchar(36) REFERENCES "worker_series_bindings"("id") ON DELETE SET NULL,
  "sourceAssetId" varchar(160) NOT NULL,
  "sourceRevision" varchar(160) NOT NULL,
  "sourceFingerprint" varchar(64) NOT NULL,
  "assetKind" varchar(24) NOT NULL,
  "pipelineState" varchar(24) NOT NULL DEFAULT 'discovered',
  "sourceMetadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "derivedArtifactJson" jsonb,
  "qcReportJson" jsonb,
  "provenanceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "vectorIndexStatus" varchar(24) NOT NULL DEFAULT 'not_requested',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "seriesId", "sourceAssetId", "sourceRevision")
);
CREATE INDEX IF NOT EXISTS "vds_media_assets_series_state_idx"
  ON "vertical_drama_media_assets" ("tenantId", "seriesId", "pipelineState");
CREATE INDEX IF NOT EXISTS "vds_media_assets_vector_status_idx"
  ON "vertical_drama_media_assets" ("tenantId", "seriesId", "vectorIndexStatus");

CREATE TABLE IF NOT EXISTS "vertical_drama_media_index_records" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "mediaAssetId" varchar(36) NOT NULL REFERENCES "vertical_drama_media_assets"("id") ON DELETE CASCADE,
  "artifactRevision" varchar(160) NOT NULL,
  "searchableText" text NOT NULL DEFAULT '',
  "tagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "embeddingRef" varchar(255),
  "status" varchar(24) NOT NULL DEFAULT 'queued',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "seriesId", "mediaAssetId", "artifactRevision")
);
CREATE INDEX IF NOT EXISTS "vds_media_index_series_status_idx"
  ON "vertical_drama_media_index_records" ("tenantId", "seriesId", "status");
