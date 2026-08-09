-- Vertical Drama episode cover state.
-- Idempotent because some environments may already have received the
-- hand-authored manual migration before this numbered migration was added.
ALTER TABLE "vertical_drama_episodes"
  ADD COLUMN IF NOT EXISTS "coverImage" jsonb;
