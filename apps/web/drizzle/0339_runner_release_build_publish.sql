ALTER TABLE "runner_release_builds"
  ADD COLUMN IF NOT EXISTS "publish" boolean NOT NULL DEFAULT false;
