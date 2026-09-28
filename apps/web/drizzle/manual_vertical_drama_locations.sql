-- Vertical Drama Locations — location/environment roster + asset-junction
-- tables for the "Location Visual Bible" feature
-- (planning/polished-toasting-gadget.md Phase 2), added 2026-07-12.
-- Hand-authored from drizzle/schema.ts because `drizzle-kit generate` is
-- blocked by the same pre-existing meta-journal collision (0146/0147)
-- documented for the prior vertical-drama migrations
-- (manual_vertical_drama_131.sql, manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql,
-- manual_vertical_drama_character_voice_config.sql,
-- manual_vertical_drama_episode_ad_banner_plan.sql,
-- manual_vertical_drama_series_share_links.sql,
-- manual_vertical_drama_series_watermark.sql,
-- manual_vertical_drama_episode_text_overlay_plan.sql,
-- manual_vertical_drama_series_llm_model_policy.sql,
-- manual_vertical_drama_character_variant_columns.sql). Confirmed via
-- `pnpm db:push`: `drizzle-kit generate` failed with
-- "[drizzle/meta/0146_snapshot.json, drizzle/meta/0147_snapshot.json] are
-- pointing to a parent snapshot ... which is a collision" before this file
-- was authored — same documented blocker, not a new issue.
--
-- Zero data-loss: both tables are BRAND NEW (`CREATE TABLE IF NOT EXISTS`),
-- zero pre-existing rows. Per the root CLAUDE.md Database Safety Protocol,
-- the mandated pg_dump backup step is a no-op in substance for a table that
-- does not exist yet — skipped for that reason (a dump targeting a
-- nonexistent table would only fail harmlessly); row counts were verified
-- to be 0/0 immediately after this file was applied instead (see this
-- task's own Result Report for the verification transcript).
--
-- Mirrors `vertical_drama_characters` / `vertical_drama_character_assets`
-- (see those tables' doc comments in drizzle/schema.ts), deliberately
-- simpler — no variant/twin/voice columns, no `containsHumanFace` (a
-- location has no face to QC).
--
-- `vertical_drama_locations.data` — { description, aggregatedFacts?:
-- string[] }. `vertical_drama_location_assets.metadata` — { state, source,
-- ... }. Both nullable jsonb, same convention as their character-table
-- counterparts.
BEGIN;

CREATE TABLE IF NOT EXISTS vertical_drama_locations (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "locationKey" varchar(64) NOT NULL,
  name varchar(255) NOT NULL,
  data jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vds_location_lookup_idx
  ON vertical_drama_locations ("tenantId", "seriesId", "locationKey");

CREATE UNIQUE INDEX IF NOT EXISTS vds_location_key_unique
  ON vertical_drama_locations ("seriesId", "locationKey");

CREATE TABLE IF NOT EXISTS vertical_drama_location_assets (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "locationId" bigint REFERENCES vertical_drama_locations(id) ON DELETE CASCADE,
  "mediaAssetId" bigint REFERENCES media_assets(id) ON DELETE SET NULL,
  "assetType" varchar(40) NOT NULL,
  role varchar(40),
  approved boolean NOT NULL DEFAULT false,
  "qcStatus" varchar(20) NOT NULL DEFAULT 'pending',
  "checksumSha256" varchar(64),
  metadata jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vds_location_asset_series_idx
  ON vertical_drama_location_assets ("tenantId", "seriesId");

CREATE INDEX IF NOT EXISTS vds_location_asset_location_idx
  ON vertical_drama_location_assets ("seriesId", "locationId");

CREATE INDEX IF NOT EXISTS vds_location_asset_media_idx
  ON vertical_drama_location_assets ("mediaAssetId");

COMMIT;
