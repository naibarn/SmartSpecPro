-- Durable Draft Job Inbox metadata.
-- UUID remains the machine identity; jobCode is a stable human-facing number.
CREATE SEQUENCE IF NOT EXISTS "vertical_drama_draft_job_code_seq";

ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "jobCode" bigint;
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "jobStatus" varchar(32) NOT NULL DEFAULT 'queued';
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "requestJson" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "compositionJobId" varchar(36);
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "qcRunId" varchar(36);
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "lastError" text;
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "lastQcScore" integer;
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "lastQcPassed" boolean;
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz;

ALTER SEQUENCE "vertical_drama_draft_job_code_seq"
  OWNED BY "vertical_drama_draft_ledgers"."jobCode";
ALTER TABLE "vertical_drama_draft_ledgers"
  ALTER COLUMN "jobCode" SET DEFAULT nextval('vertical_drama_draft_job_code_seq');

-- Backfill existing ledgers before making the human-facing code mandatory.
UPDATE "vertical_drama_draft_ledgers"
SET "jobCode" = nextval('vertical_drama_draft_job_code_seq')
WHERE "jobCode" IS NULL;

ALTER TABLE "vertical_drama_draft_ledgers"
  ALTER COLUMN "jobCode" SET NOT NULL;

-- Existing durable ledgers represent completed composition snapshots. They are
-- recoverable Draft jobs, never silently discarded during migration.
UPDATE "vertical_drama_draft_ledgers"
SET "jobStatus" = CASE
  WHEN "currentStage" IN ('validation', 'qc-baseline', 'qc-revision', 'qc-final')
    THEN 'ready_for_qc'
  WHEN "currentStage" = 'completion' THEN 'ready_for_qc'
  ELSE 'queued'
END
WHERE "jobStatus" = 'queued';

UPDATE "vertical_drama_draft_ledgers"
SET "compositionJobId" = "id"
WHERE "compositionJobId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "vdd_ledger_job_code_unique"
  ON "vertical_drama_draft_ledgers" ("jobCode");
CREATE INDEX IF NOT EXISTS "vdd_ledger_owner_status_updated_idx"
  ON "vertical_drama_draft_ledgers" ("tenantId", "userId", "jobStatus", "updatedAt");
