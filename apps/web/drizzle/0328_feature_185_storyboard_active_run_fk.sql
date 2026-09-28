-- Feature 185/186: keep the project recovery pointer referentially safe.
-- Additive only; deleting a run clears the pointer instead of leaving a stale
-- activeRunId that can mislead refresh/recovery flows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'storyboard_skill_projects_active_run_fk'
  ) THEN
    ALTER TABLE "storyboard_skill_projects"
      ADD CONSTRAINT "storyboard_skill_projects_active_run_fk"
      FOREIGN KEY ("active_run_id")
      REFERENCES "storyboard_skill_runs"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
