CREATE TABLE IF NOT EXISTS "worker_runtime_releases" (
  "id" serial PRIMARY KEY NOT NULL,
  "version" varchar(64) NOT NULL,
  "runtimeId" varchar(64) NOT NULL,
  "platform" varchar(24) NOT NULL,
  "channel" varchar(24) NOT NULL DEFAULT 'stable',
  "fileName" varchar(260) NOT NULL,
  "contentType" varchar(256) NOT NULL DEFAULT 'application/zip',
  "storageKey" text NOT NULL,
  "fileSizeBytes" bigint NOT NULL,
  "fileSha256" varchar(64) NOT NULL,
  "manifestJson" jsonb NOT NULL,
  "validationStatus" varchar(24) NOT NULL,
  "validationChecksJson" jsonb NOT NULL,
  "isPublished" boolean NOT NULL DEFAULT false,
  "publishedAt" timestamptz,
  "withdrawnAt" timestamptz,
  "uploadedBy" integer REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "uploadedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "worker_runtime_releases_runtime_version_channel_unique"
  ON "worker_runtime_releases" ("runtimeId", "version", "channel");
CREATE UNIQUE INDEX IF NOT EXISTS "worker_runtime_releases_storage_key_unique"
  ON "worker_runtime_releases" ("storageKey");
CREATE INDEX IF NOT EXISTS "worker_runtime_releases_current_idx"
  ON "worker_runtime_releases" ("runtimeId", "channel", "isPublished", "withdrawnAt", "version");
