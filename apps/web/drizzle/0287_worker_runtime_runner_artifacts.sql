CREATE TABLE IF NOT EXISTS "worker_runtime_runner_artifacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "fileName" varchar(260) NOT NULL,
  "contentType" varchar(256) NOT NULL DEFAULT 'application/octet-stream',
  "storageKey" text NOT NULL,
  "fileSizeBytes" bigint NOT NULL,
  "fileSha256" varchar(64) NOT NULL,
  "uploadedBy" integer REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "uploadedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "worker_runtime_runner_artifacts_storage_key_unique"
  ON "worker_runtime_runner_artifacts" ("storageKey");
CREATE UNIQUE INDEX IF NOT EXISTS "worker_runtime_runner_artifacts_sha256_unique"
  ON "worker_runtime_runner_artifacts" ("fileSha256");
CREATE INDEX IF NOT EXISTS "worker_runtime_runner_artifacts_uploaded_at_idx"
  ON "worker_runtime_runner_artifacts" ("uploadedAt");
