DO $$
BEGIN
  ALTER TYPE "worker_runtime_type" ADD VALUE IF NOT EXISTS 'local_llm_worker';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "worker_llm_models" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workerId" varchar(36) NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "localProviderId" varchar(160) NOT NULL,
  "providerKind" varchar(64) NOT NULL,
  "localModelId" varchar(160) NOT NULL,
  "providerModelId" varchar(240) NOT NULL,
  "modelRef" varchar(160) NOT NULL,
  "displayName" varchar(240) NOT NULL,
  "capabilitiesJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "contextWindow" integer,
  "inventoryRevision" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'unknown',
  "enabled" boolean NOT NULL DEFAULT true,
  "tombstoned" boolean NOT NULL DEFAULT false,
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastInventoryAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "worker_llm_models_worker_provider_model_unique"
    UNIQUE ("tenantId", "workerId", "localProviderId", "providerModelId"),
  CONSTRAINT "worker_llm_models_model_ref_unique" UNIQUE ("modelRef")
);
CREATE INDEX IF NOT EXISTS "worker_llm_models_actor_catalog_idx"
  ON "worker_llm_models" ("tenantId", "ownerUserId", "enabled", "tombstoned");
CREATE INDEX IF NOT EXISTS "worker_llm_models_worker_revision_idx"
  ON "worker_llm_models" ("workerId", "inventoryRevision");

CREATE TABLE IF NOT EXISTS "worker_llm_inventory_sync" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workerId" varchar(36) NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lastAcceptedRevision" integer NOT NULL DEFAULT 0,
  "lastInventoryHash" varchar(128) NOT NULL,
  "lastIdempotencyKey" varchar(160) NOT NULL,
  "lastSyncedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "worker_llm_inventory_sync_worker_unique" UNIQUE ("tenantId", "workerId")
);
CREATE INDEX IF NOT EXISTS "worker_llm_inventory_sync_revision_idx"
  ON "worker_llm_inventory_sync" ("tenantId", "lastAcceptedRevision");

ALTER TABLE "worker_job_events"
  ADD COLUMN IF NOT EXISTS "assignmentId" varchar(160),
  ADD COLUMN IF NOT EXISTS "sequence" integer;
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_events_assignment_sequence_unique"
  ON "worker_job_events" ("workerJobId", "assignmentId", "sequence")
  WHERE "assignmentId" IS NOT NULL AND "sequence" IS NOT NULL;
