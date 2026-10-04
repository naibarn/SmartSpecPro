CREATE TABLE IF NOT EXISTS "spec224_runner_job_inputs" (
  "id" varchar(160) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "commandId" varchar(160) NOT NULL,
  "attemptId" varchar(36) NOT NULL,
  "attempt" integer NOT NULL,
  "leaseId" varchar(160) NOT NULL,
  "fencingToken" integer NOT NULL,
  "runnerId" varchar(160) NOT NULL,
  "runnerSessionId" varchar(160) NOT NULL,
  "authorizationGrantRef" varchar(160) NOT NULL,
  "workspaceRef" varchar(200) NOT NULL,
  "fetchGrantHash" varchar(64) NOT NULL,
  "fetchGrantConsumedAt" timestamptz,
  "inputDigest" varchar(64) NOT NULL,
  "totalBytes" integer NOT NULL,
  "filesJson" jsonb NOT NULL,
  "materializedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "spec224_runner_job_inputs_attempt_check" CHECK ("attempt" > 0),
  CONSTRAINT "spec224_runner_job_inputs_fence_check" CHECK ("fencingToken" > 0),
  CONSTRAINT "spec224_runner_job_inputs_bytes_check" CHECK ("totalBytes" > 0 AND "totalBytes" <= 2097152),
  CONSTRAINT "spec224_runner_job_inputs_digest_check" CHECK ("inputDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "spec224_runner_job_inputs_fetch_grant_hash_check" CHECK ("fetchGrantHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "spec224_runner_job_inputs_files_size_check" CHECK (octet_length("filesJson"::text) <= 4194304)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spec224_runner_job_inputs_command_unique" ON "spec224_runner_job_inputs" ("commandId");
CREATE INDEX IF NOT EXISTS "spec224_runner_job_inputs_runner_fetch_idx" ON "spec224_runner_job_inputs" ("runnerId", "runnerSessionId", "id");
CREATE INDEX IF NOT EXISTS "spec224_runner_job_inputs_job_attempt_idx" ON "spec224_runner_job_inputs" ("workerJobId", "attempt", "fencingToken");
