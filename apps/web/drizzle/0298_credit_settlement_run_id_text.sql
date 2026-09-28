-- Skill run identifiers may contain a deterministic execution fingerprint with
-- prompt/context data. The former varchar(191) silently made valid skill
-- executions fail during settlement when that fingerprint exceeded 191 chars.
-- Keep the full id for idempotency and forensic lookup; the unique index works
-- on PostgreSQL text values without a length limit.
ALTER TABLE "skill_revenue_settlements"
  ALTER COLUMN "runId" TYPE text;
