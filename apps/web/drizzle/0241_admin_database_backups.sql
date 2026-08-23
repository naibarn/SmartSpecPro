CREATE TABLE IF NOT EXISTS "backup_jobs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "mode" varchar(16) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'queued',
  "databaseZipPath" text,
  "databaseZipBytes" bigint,
  "databaseZipSha256" varchar(64),
  "applicationZipPath" text,
  "applicationZipBytes" bigint,
  "applicationZipSha256" varchar(64),
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "expiresAt" timestamptz NOT NULL,
  "errorMessage" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "backup_jobs_mode_check" CHECK ("mode" IN ('safe', 'full')),
  CONSTRAINT "backup_jobs_status_check" CHECK ("status" IN ('queued', 'running', 'completed', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backup_jobs_status_created_idx"
  ON "backup_jobs" ("status", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backup_jobs_expires_idx"
  ON "backup_jobs" ("expiresAt");
