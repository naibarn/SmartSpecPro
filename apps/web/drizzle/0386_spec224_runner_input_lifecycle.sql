ALTER TABLE "spec224_runner_input_sources"
  ADD COLUMN IF NOT EXISTS "workerJobId" varchar(36)
    REFERENCES "worker_jobs"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spec224_runner_input_sources_worker_job_idx"
  ON "spec224_runner_input_sources" ("workerJobId", "createdAt");
