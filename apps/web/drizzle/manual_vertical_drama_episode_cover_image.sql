-- Vertical Drama Episodes — per-episode generated/uploaded cover state.
-- Additive nullable JSONB column. This is intentionally hand-authored because
-- drizzle-kit generation is blocked by the existing meta-journal collision in
-- the Vertical Drama migration lineage. Existing episodes remain NULL and
-- continue using their approved Start Frame thumbnail.
BEGIN;

ALTER TABLE vertical_drama_episodes
  ADD COLUMN IF NOT EXISTS "coverImage" jsonb;

COMMIT;
