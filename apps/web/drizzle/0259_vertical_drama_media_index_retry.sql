ALTER TABLE "vertical_drama_media_index_records"
  ADD COLUMN IF NOT EXISTS "attemptCount" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastError" text;
