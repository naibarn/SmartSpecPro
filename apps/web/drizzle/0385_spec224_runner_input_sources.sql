CREATE TABLE IF NOT EXISTS "spec224_runner_input_sources" (
  "id" varchar(160) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "startRef" varchar(160) NOT NULL,
  "inputDigest" varchar(64) NOT NULL,
  "totalBytes" integer NOT NULL,
  "filesJson" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "spec224_runner_input_sources_bytes_check" CHECK ("totalBytes" > 0 AND "totalBytes" <= 2097152),
  CONSTRAINT "spec224_runner_input_sources_digest_check" CHECK ("inputDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "spec224_runner_input_sources_files_size_check" CHECK (octet_length("filesJson"::text) <= 4194304)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spec224_runner_input_sources_start_unique" ON "spec224_runner_input_sources" ("tenantId", "startRef");
