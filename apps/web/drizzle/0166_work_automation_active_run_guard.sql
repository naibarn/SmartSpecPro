CREATE TABLE IF NOT EXISTS "work_automation_active_run_guard_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL,
  "caseId" varchar(36) NOT NULL,
  "runId" varchar(36) NOT NULL,
  "previousStatus" text NOT NULL,
  "activeRank" integer NOT NULL,
  "repairAction" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_automation_active_run_guard_audit_run_action_unique"
  ON "work_automation_active_run_guard_audit" ("runId", "repairAction");

CREATE INDEX IF NOT EXISTS "work_automation_active_run_guard_audit_case_created_idx"
  ON "work_automation_active_run_guard_audit" ("tenantId", "caseId", "createdAt");

WITH ranked_active_runs AS (
  SELECT
    war."id",
    war."tenantId",
    war."caseId",
    war."status",
    ROW_NUMBER() OVER (
      PARTITION BY war."tenantId", war."caseId"
      ORDER BY
        EXISTS (
          SELECT 1
          FROM "team_runs" tr
          WHERE tr."constraintsJson"->>'workOsAutomationRunId' = war."id"
            AND tr."status" IN ('queued', 'running', 'paused')
        ) DESC,
        war."createdAt" DESC,
        war."id" DESC
    ) AS active_rank
  FROM "work_automation_runs" war
  WHERE war."status" IN ('pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused')
)
INSERT INTO "work_automation_active_run_guard_audit" (
  "tenantId",
  "caseId",
  "runId",
  "previousStatus",
  "activeRank",
  "repairAction"
)
SELECT
  "tenantId",
  "caseId",
  "id",
  "status",
  active_rank,
  'mark_duplicate_active_run_failed'
FROM ranked_active_runs
WHERE active_rank > 1
ON CONFLICT DO NOTHING;

WITH ranked_active_runs AS (
  SELECT
    war."id",
    ROW_NUMBER() OVER (
      PARTITION BY war."tenantId", war."caseId"
      ORDER BY
        EXISTS (
          SELECT 1
          FROM "team_runs" tr
          WHERE tr."constraintsJson"->>'workOsAutomationRunId' = war."id"
            AND tr."status" IN ('queued', 'running', 'paused')
        ) DESC,
        war."createdAt" DESC,
        war."id" DESC
    ) AS active_rank
  FROM "work_automation_runs" war
  WHERE war."status" IN ('pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused')
)
UPDATE "work_automation_runs"
SET
  "status" = 'failed',
  "finalDisposition" = COALESCE("finalDisposition", 'failed'),
  "finalDispositionReason" = COALESCE(
    "finalDispositionReason",
    'Superseded by newer active automation run during active-run guard migration.'
  ),
  "completedAt" = COALESCE("completedAt", NOW()),
  "updatedAt" = NOW()
WHERE "id" IN (
  SELECT "id"
  FROM ranked_active_runs
  WHERE active_rank > 1
);

WITH surviving_active_runs AS (
  SELECT
    war."tenantId",
    war."caseId",
    war."id" AS "runId",
    ROW_NUMBER() OVER (
      PARTITION BY war."tenantId", war."caseId"
      ORDER BY
        EXISTS (
          SELECT 1
          FROM "team_runs" tr
          WHERE tr."constraintsJson"->>'workOsAutomationRunId' = war."id"
            AND tr."status" IN ('queued', 'running', 'paused')
        ) DESC,
        war."createdAt" DESC,
        war."id" DESC
    ) AS active_rank
  FROM "work_automation_runs" war
  WHERE war."status" IN ('pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused')
)
UPDATE "work_cases"
SET
  "automationRunId" = surviving_active_runs."runId",
  "automationUpdatedAt" = NOW(),
  "updatedAt" = NOW()
FROM surviving_active_runs
WHERE
  surviving_active_runs.active_rank = 1
  AND "work_cases"."tenantId" = surviving_active_runs."tenantId"
  AND "work_cases"."id" = surviving_active_runs."caseId"
  AND "work_cases"."automationRunId" IS DISTINCT FROM surviving_active_runs."runId";

CREATE UNIQUE INDEX IF NOT EXISTS "work_automation_runs_case_active_unique"
  ON "work_automation_runs" ("tenantId", "caseId")
  WHERE "status" IN ('pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused');

DO $$
DECLARE
  duplicate_active_cases INTEGER;
  stale_case_pointers INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_active_cases
  FROM (
    SELECT "tenantId", "caseId"
    FROM "work_automation_runs"
    WHERE "status" IN ('pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused')
    GROUP BY "tenantId", "caseId"
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_active_cases > 0 THEN
    RAISE EXCEPTION 'work automation active-run guard verification failed: % duplicate active case(s) remain', duplicate_active_cases;
  END IF;

  SELECT COUNT(*)
  INTO stale_case_pointers
  FROM "work_cases"
  JOIN (
    SELECT
      "tenantId",
      "caseId",
      "id" AS "runId",
      ROW_NUMBER() OVER (
        PARTITION BY "tenantId", "caseId"
        ORDER BY "createdAt" DESC, "id" DESC
      ) AS active_rank
    FROM "work_automation_runs"
    WHERE "status" IN ('pending', 'running', 'waiting_for_input', 'waiting_for_approval', 'paused')
  ) active_runs
    ON active_runs.active_rank = 1
   AND "work_cases"."tenantId" = active_runs."tenantId"
   AND "work_cases"."id" = active_runs."caseId"
  WHERE "work_cases"."automationRunId" IS DISTINCT FROM active_runs."runId";

  IF stale_case_pointers > 0 THEN
    RAISE EXCEPTION 'work automation active-run guard verification failed: % stale case pointer(s) remain', stale_case_pointers;
  END IF;
END $$;
