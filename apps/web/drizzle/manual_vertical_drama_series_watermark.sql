-- Vertical Drama Series — series-level WATERMARK config column (task #34,
-- planning/vertical-drama-end-card-teaser/plan.md v2 "ลายน้ำ") — additive,
-- nullable JSONB column, IF NOT EXISTS guarded. Hand-authored from
-- drizzle/schema.ts because drizzle-kit generate is blocked by the same
-- pre-existing meta-journal collision (0146/0147) documented for the prior
-- vertical-drama migrations (manual_vertical_drama_131.sql,
-- manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql,
-- manual_vertical_drama_character_voice_config.sql,
-- manual_vertical_drama_episode_ad_banner_plan.sql,
-- manual_vertical_drama_series_share_links.sql). Zero data-loss: nullable
-- ADD COLUMN, existing rows get watermark = NULL (client/server treat NULL
-- as "no watermark configured" — `enabled` defaults to false/absent).
--
-- Stores `VdSeriesWatermarkConfig` (`@shared/verticalDramaSeries/textOverlay.ts`):
-- enabled / type (text|image) / text / imageUrl / position / opacity /
-- scalePct / marginPx — branding attached to the SERIES (not per-episode),
-- flag-gated on `verticalDramaSeriesTextOverlaySuite` (F131AB, same flag as
-- the sibling `textOverlayPlan` column above — one flag covers the whole
-- suite including watermark). Read/written via `updateSeriesWatermark`
-- (server/routers/verticalDramaSeries.ts).
--
-- Backup taken immediately before this file was applied (DB Safety Protocol):
-- .db-backups/vertical_drama_series_20260709_074316.sql (4 rows, matches
-- post-migration count — verified via information_schema + row-count query,
-- see task #34's own Result Report for the full verification transcript).
BEGIN;

ALTER TABLE vertical_drama_series
  ADD COLUMN IF NOT EXISTS "watermark" jsonb;

COMMIT;
