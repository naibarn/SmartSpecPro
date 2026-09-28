CREATE TABLE IF NOT EXISTS "runner_release_builds" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "repository" varchar(256) NOT NULL,
  "workflow" varchar(256) NOT NULL,
  "ref" varchar(256) NOT NULL,
  "version" varchar(64) NOT NULL,
  "platform" varchar(24) NOT NULL,
  "profile" varchar(32) NOT NULL,
  "releaseId" varchar(128) NOT NULL,
  "releaseNotes" text,
  "workflowRunId" varchar(128),
  "workflowRunUrl" text,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "syncStatus" varchar(32) NOT NULL DEFAULT 'idle',
  "syncError" text,
  "requestedBy" integer REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "runner_release_builds_release_unique"
  ON "runner_release_builds" ("repository", "releaseId");
CREATE INDEX IF NOT EXISTS "runner_release_builds_status_idx"
  ON "runner_release_builds" ("status", "updatedAt");
