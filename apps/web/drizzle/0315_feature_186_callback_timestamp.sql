-- Feature 186: persist provider callback time for replay-window evidence.
-- Additive only; existing callback rows remain valid using their observation
-- time as the best available historical timestamp.
ALTER TABLE "worker_job_callbacks"
  ADD COLUMN IF NOT EXISTS "occurredAt" timestamptz;
UPDATE "worker_job_callbacks"
SET "occurredAt" = "observedAt"
WHERE "occurredAt" IS NULL;
ALTER TABLE "worker_job_callbacks"
  ALTER COLUMN "occurredAt" SET DEFAULT now();
ALTER TABLE "worker_job_callbacks"
  ALTER COLUMN "occurredAt" SET NOT NULL;
