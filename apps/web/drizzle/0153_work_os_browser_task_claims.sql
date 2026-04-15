CREATE TABLE IF NOT EXISTS "work_automation_browser_task_claims" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "runId" varchar(36) NOT NULL REFERENCES "work_automation_runs"("id") ON DELETE cascade,
  "stepId" varchar(36) REFERENCES "work_automation_run_steps"("id") ON DELETE set null,
  "stepKey" varchar(120) NOT NULL,
  "stepIndex" integer NOT NULL DEFAULT 0,
  "title" varchar(500) NOT NULL,
  "idempotencyKey" varchar(180),
  "claimToken" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'claimed',
  "taskId" varchar(200),
  "executionId" varchar(200),
  "reservationId" varchar(120),
  "inputRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outputRefsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "detailJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "errorMessage" text,
  "claimedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "dispatchedAt" timestamp with time zone,
  "lastPolledAt" timestamp with time zone,
  "nextPollAt" timestamp with time zone,
  "completedAt" timestamp with time zone,
  "pollCount" integer NOT NULL DEFAULT 0,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "createdByAssistantId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE set null,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_automation_browser_task_claims_tenant_run_step_idempotency_unique"
  ON "work_automation_browser_task_claims" ("tenantId", "runId", "stepKey", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "work_automation_browser_task_claims_tenant_task_unique"
  ON "work_automation_browser_task_claims" ("tenantId", "taskId")
  WHERE "taskId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "work_automation_browser_task_claims_tenant_status_poll_idx"
  ON "work_automation_browser_task_claims" ("tenantId", "status", "nextPollAt");

CREATE INDEX IF NOT EXISTS "work_automation_browser_task_claims_run_idx"
  ON "work_automation_browser_task_claims" ("runId", "createdAt");

CREATE INDEX IF NOT EXISTS "work_automation_browser_task_claims_case_idx"
  ON "work_automation_browser_task_claims" ("caseId", "createdAt");
