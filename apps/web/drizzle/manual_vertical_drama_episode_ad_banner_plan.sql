-- Vertical Drama Episodes — per-episode ad banner overlay SELECTION column
-- (F131W, task #30-A2, planning/vertical-drama-ad-banner-overlay/plan.md §2
-- "ชั้นการใช้") — additive, nullable JSONB column, IF NOT EXISTS guarded.
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is
-- blocked by the same pre-existing meta-journal collision (0146/0147)
-- documented for the prior vertical-drama migrations
-- (manual_vertical_drama_131.sql, manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql,
-- manual_vertical_drama_character_voice_config.sql). Zero data-loss:
-- nullable ADD COLUMN, existing rows get adBannerPlan = NULL (client/server
-- treat NULL as "no banners selected for this episode yet").
--
-- Verified already applied to the live database ahead of this file (2026-07-09,
-- task #30-A2) — this file exists so the change has a durable, idempotent
-- record alongside its schema.ts type, and so a fresh database (dev/CI)
-- provisioned from these migration files alone still gets the column.
BEGIN;

ALTER TABLE vertical_drama_episodes
  ADD COLUMN IF NOT EXISTS "adBannerPlan" jsonb;

COMMIT;
