CREATE UNIQUE INDEX IF NOT EXISTS "work_automation_run_steps_tenant_run_step_idempotency_unique"
  ON "work_automation_run_steps" ("tenantId", "runId", "stepKey", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
