-- Capacity Advisor V2 run lifecycle and trusted decision metadata.
-- Additive and idempotent; existing 0233 rows remain readable.
ALTER TABLE "capacity_assessments"
  ADD COLUMN IF NOT EXISTS "phase" text NOT NULL DEFAULT 'requested',
  ADD COLUMN IF NOT EXISTS "policyVersion" text,
  ADD COLUMN IF NOT EXISTS "deterministicAssessment" jsonb,
  ADD COLUMN IF NOT EXISTS "coverage" jsonb,
  ADD COLUMN IF NOT EXISTS "durationMs" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capacity_assessments_phase"
  ON "capacity_assessments" USING btree ("phase");
