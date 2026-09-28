-- Feature 186 follow-up: durable operator action and callback replay evidence.
-- This migration is additive and deliberately does not create a second job
-- ledger or mutate existing lifecycle rows.

CREATE TABLE IF NOT EXISTS "worker_job_actions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "actionId" varchar(128) NOT NULL,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "command" varchar(40) NOT NULL,
  "actorId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" varchar(500) NOT NULL,
  "expectedStatus" varchar(40) NOT NULL,
  "expectedAttempt" integer NOT NULL,
  "expectedFencingVersion" integer NOT NULL,
  "authorizationScope" varchar(160),
  "outcomeJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "effectiveAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_actions_action_unique" ON "worker_job_actions" ("actionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_actions_job_created_idx" ON "worker_job_actions" ("workerJobId", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "worker_job_callbacks" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "adapterNamespace" varchar(120) NOT NULL,
  "providerEventId" varchar(255),
  "replayKey" varchar(255),
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE SET NULL,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE SET NULL,
  "signatureVerified" boolean NOT NULL DEFAULT false,
  "disposition" varchar(40) NOT NULL,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "observedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_callbacks_provider_event_unique"
  ON "worker_job_callbacks" ("adapterNamespace", "providerEventId")
  WHERE "providerEventId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_callbacks_replay_unique"
  ON "worker_job_callbacks" ("adapterNamespace", "replayKey")
  WHERE "replayKey" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_callbacks_job_observed_idx"
  ON "worker_job_callbacks" ("workerJobId", "observedAt");--> statement-breakpoint

-- Lifecycle evidence must survive a parent-row cleanup attempt. Existing
-- cascades on these Feature 186 child FKs are replaced with fail-closed
-- RESTRICT behavior; archival/redaction must precede any future deletion.
DO $$
DECLARE
  child_table text;
  constraint_name text;
BEGIN
  FOREACH child_table IN ARRAY ARRAY[
    'worker_job_events',
    'worker_job_attempts',
    'worker_job_dispatches',
    'worker_job_outbox',
    'worker_job_schedule_occurrences',
    'worker_job_settlements',
    'worker_job_actions'
  ] LOOP
    SELECT c.conname INTO constraint_name
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    WHERE child.relname = child_table
      AND parent.relname = 'worker_jobs'
      AND c.contype = 'f'
      AND c.confdeltype = 'c'
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', child_table, constraint_name);
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("workerJobId") REFERENCES "worker_jobs"("id") ON DELETE RESTRICT',
        child_table,
        constraint_name || '_restrict'
      );
    END IF;
    constraint_name := NULL;
  END LOOP;
END $$;
