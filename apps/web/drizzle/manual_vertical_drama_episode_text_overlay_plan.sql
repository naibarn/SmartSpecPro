-- Vertical Drama Episodes — Text Overlay Suite per-episode PLAN column
-- (task #34, planning/vertical-drama-end-card-teaser/plan.md v2) — additive,
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
-- ADD COLUMN, existing rows get textOverlayPlan = NULL (client/server treat
-- NULL as "no text overlay plan configured for this episode yet" — every
-- kind defaults to disabled/absent).
--
-- Stores `VdTextOverlayPlan` (`@shared/verticalDramaSeries/textOverlay.ts`):
-- endCard / openerRecap / titleBumper / episodeIndicator /
-- characterIntroCards / cards[] — flag-gated on `verticalDramaSeriesTextOverlaySuite`
-- (F131AB). Read/written via `updateEpisodeTextOverlayPlan`
-- (server/routers/verticalDramaEpisodes.ts).
--
-- Backup taken immediately before this file was applied (DB Safety Protocol):
-- .db-backups/vertical_drama_episodes_20260709_074316.sql (22 rows, matches
-- post-migration count — verified via information_schema + row-count query,
-- see task #34's own Result Report for the full verification transcript).
BEGIN;

ALTER TABLE vertical_drama_episodes
  ADD COLUMN IF NOT EXISTS "textOverlayPlan" jsonb;

COMMIT;
