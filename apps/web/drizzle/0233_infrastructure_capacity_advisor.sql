-- Persisted infrastructure capacity snapshots and LLM recommendations.
-- Additive and idempotent so it can be applied safely after an interrupted deploy.

CREATE TABLE IF NOT EXISTS "capacity_assessments" (
  "id" serial PRIMARY KEY,
  "status" text NOT NULL,
  "trigger" text NOT NULL,
  "requestedByUserId" integer,
  "snapshot" jsonb NOT NULL,
  "assessment" jsonb,
  "errorMessage" text,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_capacity_assessments_status"
  ON "capacity_assessments" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_capacity_assessments_created_at"
  ON "capacity_assessments" USING btree ("createdAt");
