-- Vertical Drama Series trailer state (series trailer feature, 2026-07-07) — additive,
-- nullable JSONB column, IF NOT EXISTS guarded.
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is blocked by the same
-- pre-existing meta-journal collision (0146/0147) documented for the prior vertical-drama
-- migrations (manual_vertical_drama_131.sql, manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql). Zero data-loss: nullable ADD COLUMN,
-- existing rows get trailer = NULL (client/server treat NULL as "idle").
BEGIN;

ALTER TABLE vertical_drama_series
  ADD COLUMN IF NOT EXISTS "trailer" jsonb;

COMMIT;
