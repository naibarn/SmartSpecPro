CREATE TABLE IF NOT EXISTS "runner_update_commands" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "runnerId" varchar(160) NOT NULL REFERENCES "runner_nodes"("runnerId") ON DELETE CASCADE ON UPDATE NO ACTION,
  "releaseAssetId" integer NOT NULL REFERENCES "runner_release_assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  "idempotencyKey" varchar(200) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "phase" varchar(32) NOT NULL DEFAULT 'queued',
  "requestedBy" integer REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "errorCode" varchar(128),
  "errorMessage" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "runner_update_commands_idempotency_unique"
  ON "runner_update_commands" ("tenantId", "runnerId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "runner_update_commands_pending_idx"
  ON "runner_update_commands" ("runnerId", "status", "createdAt");
