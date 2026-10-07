DROP INDEX IF EXISTS "api_audit_migration_receipt_phase_idempotency_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "api_audit_migration_receipt_attempt_phase_unique"
  ON "api_audit_events" USING btree (
    ("metadata"->>'idempotencyKey'),
    (coalesce("metadata"->>'attemptNumber', '0')),
    ("metadata"->>'phase')
  )
  WHERE "eventType" = 'migration_execution_receipt';
