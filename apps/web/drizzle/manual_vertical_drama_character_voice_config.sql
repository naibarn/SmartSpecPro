-- Vertical Drama Series — per-character voice casting column (W12-A voice chain
-- wave) — additive, nullable JSONB column, IF NOT EXISTS guarded.
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is blocked by
-- the same pre-existing meta-journal collision (0146/0147) documented for the
-- prior vertical-drama migrations (manual_vertical_drama_131.sql,
-- manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql). Zero data-loss: nullable ADD
-- COLUMN, existing rows get voiceConfig = NULL (client/server treat NULL as
-- "not cast yet").
--
-- Verified already applied to the live database ahead of this file (see
-- `\d vertical_drama_characters` investigation, W12-A) — this file exists so
-- the change has a durable, idempotent record alongside its schema.ts type,
-- and so a fresh database (dev/CI) provisioned from these migration files
-- alone still gets the column.
BEGIN;

ALTER TABLE vertical_drama_characters
  ADD COLUMN IF NOT EXISTS "voiceConfig" jsonb;

COMMIT;
