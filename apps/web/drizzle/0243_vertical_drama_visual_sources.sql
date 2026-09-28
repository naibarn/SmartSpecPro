-- Feature 160: visual source revisions, news evidence, and explicit B-roll.
-- Additive/idempotent. Existing source-pack, media_assets, and shot-reference
-- rows are intentionally preserved and are not converted or deleted.

CREATE TABLE IF NOT EXISTS "vertical_drama_source_media_segments" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "packId" bigint NOT NULL REFERENCES "vertical_drama_source_packs"("id") ON DELETE CASCADE,
  "sourceAssetId" bigint NOT NULL REFERENCES "vertical_drama_source_assets"("id") ON DELETE CASCADE,
  "segmentKey" varchar(128) NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "mediaType" varchar(16) NOT NULL,
  "inSeconds" real,
  "outSeconds" real,
  "displayDurationSeconds" real,
  "label" varchar(180) NOT NULL,
  "description" text,
  "evidenceScopeJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "captureAt" timestamptz,
  "locationLabel" varchar(240),
  "sourceLabel" varchar(240),
  "audioPolicy" varchar(16) NOT NULL DEFAULT 'keep',
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_source_segments_revision_unique"
  ON "vertical_drama_source_media_segments" ("tenantId", "sourceAssetId", "segmentKey", "revision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_source_segments_pack_idx"
  ON "vertical_drama_source_media_segments" ("tenantId", "packId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_source_segments_asset_idx"
  ON "vertical_drama_source_media_segments" ("tenantId", "sourceAssetId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_visual_source_snapshots" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "snapshotId" varchar(128) NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "packId" bigint NOT NULL REFERENCES "vertical_drama_source_packs"("id") ON DELETE CASCADE,
  "seriesId" bigint REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "profileId" varchar(96) NOT NULL,
  "profileVersion" integer NOT NULL DEFAULT 1,
  "revision" integer NOT NULL DEFAULT 1,
  "fingerprint" varchar(64) NOT NULL,
  "snapshotJson" jsonb NOT NULL,
  "coverageJson" jsonb NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'approved',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_visual_snapshot_identity_unique"
  ON "vertical_drama_visual_source_snapshots" ("tenantId", "snapshotId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_visual_snapshot_revision_unique"
  ON "vertical_drama_visual_source_snapshots" ("tenantId", "packId", "revision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_visual_snapshot_series_idx"
  ON "vertical_drama_visual_source_snapshots" ("tenantId", "seriesId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_visual_snapshot_fingerprint_idx"
  ON "vertical_drama_visual_source_snapshots" ("tenantId", "fingerprint");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_news_claims" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "claimId" varchar(128) NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "claimText" text NOT NULL,
  "claimType" varchar(32) NOT NULL,
  "geography" varchar(240),
  "validFrom" timestamptz,
  "validUntil" timestamptz,
  "asOf" timestamptz,
  "status" varchar(32) NOT NULL DEFAULT 'needs_verification',
  "freshness" varchar(16) NOT NULL DEFAULT 'unknown',
  "attribution" varchar(500),
  "visualSlotIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "correctionRevision" integer NOT NULL DEFAULT 0,
  "correctionNote" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_news_claim_revision_unique"
  ON "vertical_drama_news_claims" ("tenantId", "seriesId", "claimId", "revision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_news_claim_lookup_idx"
  ON "vertical_drama_news_claims" ("tenantId", "seriesId", "status", "asOf");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_news_evidence_revisions" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "claimId" varchar(128) NOT NULL,
  "evidenceId" varchar(128) NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "refsJson" jsonb NOT NULL,
  "correctionNote" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_news_evidence_revision_unique"
  ON "vertical_drama_news_evidence_revisions"
    ("tenantId", "seriesId", "claimId", "evidenceId", "revision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_news_evidence_claim_idx"
  ON "vertical_drama_news_evidence_revisions"
    ("tenantId", "seriesId", "claimId", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vertical_drama_shot_broll_bindings" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "episodeId" bigint NOT NULL REFERENCES "vertical_drama_episodes"("id") ON DELETE CASCADE,
  "shotNumber" integer NOT NULL,
  "bindingId" varchar(128) NOT NULL,
  "sourceSlotId" bigint REFERENCES "vertical_drama_source_slots"("id") ON DELETE SET NULL,
  "sourceAssetId" bigint REFERENCES "vertical_drama_source_assets"("id") ON DELETE SET NULL,
  "mediaAssetId" bigint REFERENCES "media_assets"("id") ON DELETE SET NULL,
  "segmentId" varchar(128),
  "segmentRevision" integer,
  "snapshotRevision" integer NOT NULL,
  "snapshotFingerprint" varchar(64) NOT NULL,
  "semanticRole" varchar(32) NOT NULL,
  "mediaType" varchar(16) NOT NULL,
  "inSeconds" real,
  "outSeconds" real,
  "displayDurationSeconds" real,
  "order" integer NOT NULL DEFAULT 0,
  "fitMode" varchar(24) NOT NULL DEFAULT 'cover',
  "audioPolicy" varchar(16) NOT NULL DEFAULT 'keep',
  "labelMode" varchar(32) NOT NULL DEFAULT 'none',
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_shot_broll_binding_identity_unique"
  ON "vertical_drama_shot_broll_bindings"
    ("tenantId", "episodeId", "shotNumber", "bindingId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_shot_broll_lookup_idx"
  ON "vertical_drama_shot_broll_bindings"
    ("tenantId", "seriesId", "episodeId", "shotNumber", "active", "order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_shot_broll_media_idx"
  ON "vertical_drama_shot_broll_bindings" ("tenantId", "mediaAssetId");
