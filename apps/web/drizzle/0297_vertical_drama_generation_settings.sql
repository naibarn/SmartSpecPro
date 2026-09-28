ALTER TABLE "vertical_drama_series"
  ADD COLUMN IF NOT EXISTS "generationSettings" jsonb;

ALTER TABLE "vertical_drama_episodes"
  ADD COLUMN IF NOT EXISTS "generationSettings" jsonb;
