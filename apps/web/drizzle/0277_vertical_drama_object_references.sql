-- Feature 174: reusable story objects and the shared Special/Product tie-in catalog.
CREATE TABLE IF NOT EXISTS "vertical_drama_object_references" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "mode" varchar(32) NOT NULL DEFAULT 'story_object',
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "description" text,
  "canonicalPrompt" text,
  "source" varchar(32) NOT NULL DEFAULT 'uploaded',
  "marketplaceCaptureId" varchar(128),
  "marketplaceProductId" varchar(128),
  "stableKey" varchar(320) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "archivedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "vdo_ref_stable_key_idx" ON "vertical_drama_object_references" ("seriesId", "stableKey");
CREATE INDEX IF NOT EXISTS "vdo_ref_series_idx" ON "vertical_drama_object_references" ("tenantId", "seriesId", "status");

CREATE TABLE IF NOT EXISTS "vertical_drama_object_reference_assets" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "objectReferenceId" bigint NOT NULL REFERENCES "vertical_drama_object_references"("id") ON DELETE CASCADE,
  "mediaAssetId" bigint NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
  "role" varchar(16) NOT NULL DEFAULT 'alternate',
  "source" varchar(32) NOT NULL DEFAULT 'library',
  "label" varchar(160),
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "vdo_ref_asset_unique_idx" ON "vertical_drama_object_reference_assets" ("objectReferenceId", "mediaAssetId");
CREATE INDEX IF NOT EXISTS "vdo_ref_asset_lookup_idx" ON "vertical_drama_object_reference_assets" ("tenantId", "objectReferenceId");

CREATE TABLE IF NOT EXISTS "vertical_drama_shot_object_references" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "shotNumber" integer NOT NULL,
  "objectReferenceId" bigint NOT NULL REFERENCES "vertical_drama_object_references"("id") ON DELETE CASCADE,
  "assignmentSource" varchar(24) NOT NULL DEFAULT 'manual',
  "confidence" real,
  "locked" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "vdo_shot_ref_unique_idx" ON "vertical_drama_shot_object_references" ("episodeId", "shotNumber", "objectReferenceId");
CREATE INDEX IF NOT EXISTS "vdo_shot_ref_lookup_idx" ON "vertical_drama_shot_object_references" ("tenantId", "seriesId", "episodeId");

CREATE TABLE IF NOT EXISTS "vertical_drama_episode_object_references" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "objectReferenceId" bigint NOT NULL REFERENCES "vertical_drama_object_references"("id") ON DELETE CASCADE,
  "role" varchar(24) NOT NULL DEFAULT 'object',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "vdo_episode_ref_unique_idx" ON "vertical_drama_episode_object_references" ("episodeId", "objectReferenceId");
CREATE INDEX IF NOT EXISTS "vdo_episode_ref_lookup_idx" ON "vertical_drama_episode_object_references" ("tenantId", "seriesId", "episodeId");
