-- Video Intelligence Platform (feature 133, section-05-db-tables-brand-kit)
-- — three brand-new tables, CREATE IF NOT EXISTS, zero data-loss (no
-- existing table touched): brand_kits, video_projects,
-- video_project_revisions.
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is
-- blocked by the same pre-existing meta-journal collision (0146/0147)
-- documented for the prior vertical-drama migrations
-- (manual_vertical_drama_131.sql, manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql,
-- manual_vertical_drama_character_voice_config.sql,
-- manual_vertical_drama_episode_ad_banner_plan.sql,
-- manual_vertical_drama_episode_text_overlay_plan.sql,
-- manual_vertical_drama_series_share_links.sql).
--
-- FK id-type parity (load-bearing — verified against schema.ts):
--   users.id          -> integer      (bigserial/bigint would fail to FK)
--   media_assets.id   -> bigserial/bigint (mode: number)
--   library_items.id  -> serial/integer
--   worker_jobs.id    -> varchar(36), no FK (loose backlink, worker fabric
--                        owns that table)
--
-- brand_kits is created BEFORE video_projects so video_projects.brandKitId
-- can FK-reference brand_kits.id.
BEGIN;

CREATE TABLE IF NOT EXISTS brand_kits (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  "logoAssetId" bigint REFERENCES media_assets(id) ON DELETE SET NULL,
  colors jsonb,
  fonts jsonb,
  "captionPresetId" varchar(64),
  locks jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_kits_tenant_user_idx
  ON brand_kits ("tenantId", "userId");

CREATE TABLE IF NOT EXISTS video_projects (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "studioType" varchar(20) NOT NULL,
  name varchar(200) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'brief',
  "automationMode" varchar(10) NOT NULL DEFAULT 'guided',
  brief jsonb,
  document jsonb,
  revision integer NOT NULL DEFAULT 1,
  "brandKitId" bigint REFERENCES brand_kits(id) ON DELETE SET NULL,
  "sourceRefs" jsonb,
  "qaLedger" jsonb,
  "renderJobId" varchar(36),
  "previewJobId" varchar(36),
  "resultLibraryItemId" integer REFERENCES library_items(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_projects_tenant_user_status_idx
  ON video_projects ("tenantId", "userId", status);

CREATE INDEX IF NOT EXISTS video_projects_tenant_studio_idx
  ON video_projects ("tenantId", "studioType");

CREATE TABLE IF NOT EXISTS video_project_revisions (
  id bigserial PRIMARY KEY,
  "projectId" bigint NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  document jsonb NOT NULL,
  "createdBy" integer REFERENCES users(id) ON DELETE SET NULL,
  reason varchar(200),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS video_project_revisions_project_revision_unique
  ON video_project_revisions ("projectId", revision);

COMMIT;
