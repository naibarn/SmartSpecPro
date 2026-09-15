-- Feature 185/186: bind the storyboard run to one canonical control-plane job
-- and retain per-shot provider/recovery evidence. This migration is additive
-- and rerunnable; it does not rewrite existing creative payloads.
ALTER TABLE "storyboard_skill_runs"
  ADD COLUMN IF NOT EXISTS "worker_job_id" varchar(36),
  ADD COLUMN IF NOT EXISTS "candidate_history" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'storyboard_skill_runs_worker_job_fk'
  ) THEN
    ALTER TABLE "storyboard_skill_runs"
      ADD CONSTRAINT "storyboard_skill_runs_worker_job_fk"
      FOREIGN KEY ("worker_job_id") REFERENCES "worker_jobs"("id") ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storyboard_skill_runs_worker_job_unique"
  ON "storyboard_skill_runs" ("worker_job_id")
  WHERE "worker_job_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "storyboard_skill_shots"
  ADD COLUMN IF NOT EXISTS "prompt_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "provider_operation_key" varchar(255),
  ADD COLUMN IF NOT EXISTS "reference_asset_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "suppressed_result" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storyboard_skill_shots_run_status_idx"
  ON "storyboard_skill_shots" ("run_id", "status", "shot_number");
