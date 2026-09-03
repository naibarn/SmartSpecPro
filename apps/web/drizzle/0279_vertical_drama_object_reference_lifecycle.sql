-- Feature 174 lifecycle/completeness follow-up. Additive and safe to rerun.
ALTER TABLE "vertical_drama_object_references"
  ADD COLUMN IF NOT EXISTS "objectType" varchar(32) NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "narrativeRole" varchar(160),
  ADD COLUMN IF NOT EXISTS "continuityNotes" text,
  ADD COLUMN IF NOT EXISTS "metadataJson" jsonb,
  ADD COLUMN IF NOT EXISTS "commercialTieInEnabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 0;

ALTER TABLE "vertical_drama_object_reference_assets"
  ADD COLUMN IF NOT EXISTS "state" varchar(16) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "originalSource" varchar(32),
  ADD COLUMN IF NOT EXISTS "approvedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "removedAt" timestamptz;

ALTER TABLE "vertical_drama_shot_object_references"
  ADD COLUMN IF NOT EXISTS "usageType" varchar(32) NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS "evidenceJson" jsonb,
  ADD COLUMN IF NOT EXISTS "contextFingerprint" varchar(128),
  ADD COLUMN IF NOT EXISTS "manualOverride" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "selectedMediaAssetId" bigint,
  ADD COLUMN IF NOT EXISTS "removedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 0;

ALTER TABLE "vertical_drama_episode_object_references"
  ADD COLUMN IF NOT EXISTS "reviewedSnapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "source" varchar(32) NOT NULL DEFAULT 'special_tie_in';

CREATE TABLE IF NOT EXISTS "vertical_drama_object_reference_aliases" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "objectReferenceId" bigint NOT NULL REFERENCES "vertical_drama_object_references"("id") ON DELETE CASCADE,
  "alias" varchar(160) NOT NULL,
  "normalizedAlias" varchar(160) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("seriesId", "normalizedAlias")
);
CREATE INDEX IF NOT EXISTS "vdo_alias_object_idx" ON "vertical_drama_object_reference_aliases" ("tenantId", "objectReferenceId");

CREATE TABLE IF NOT EXISTS "vertical_drama_object_detection_suggestions" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "shotNumber" integer NOT NULL,
  "objectReferenceId" bigint NOT NULL REFERENCES "vertical_drama_object_references"("id") ON DELETE CASCADE,
  "detectorVersion" varchar(64) NOT NULL,
  "contextFingerprint" varchar(128) NOT NULL,
  "evidenceJson" jsonb,
  "confidence" real,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "decision" varchar(16),
  "retryCount" integer NOT NULL DEFAULT 0,
  "nextRetryAt" timestamptz,
  "expiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("episodeId", "shotNumber", "objectReferenceId", "contextFingerprint")
);
CREATE INDEX IF NOT EXISTS "vdo_suggestion_pending_idx" ON "vertical_drama_object_detection_suggestions" ("tenantId", "status", "nextRetryAt");

CREATE TABLE IF NOT EXISTS "vertical_drama_object_reference_prompt_runs" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "objectReferenceId" bigint NOT NULL REFERENCES "vertical_drama_object_references"("id") ON DELETE CASCADE,
  "operation" varchar(24) NOT NULL,
  "inputFingerprint" varchar(128) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'queued',
  "resultJson" jsonb,
  "idempotencyKey" varchar(128) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "vdo_prompt_object_idx" ON "vertical_drama_object_reference_prompt_runs" ("tenantId", "objectReferenceId", "status");

CREATE TABLE IF NOT EXISTS "vertical_drama_object_reference_projections" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "shotNumber" integer NOT NULL,
  "objectReferenceId" bigint NOT NULL REFERENCES "vertical_drama_object_references"("id") ON DELETE CASCADE,
  "shotReferenceId" bigint NOT NULL REFERENCES "vertical_drama_shot_references"("id") ON DELETE CASCADE,
  "sourceRevision" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("shotReferenceId")
);
CREATE INDEX IF NOT EXISTS "vdo_projection_shot_idx" ON "vertical_drama_object_reference_projections" ("tenantId", "episodeId", "shotNumber");
