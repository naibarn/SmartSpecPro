DO $$
BEGIN
  CREATE TYPE "public"."role_record_type" AS ENUM (
    'role_blueprint',
    'role_agent',
    'role_contract',
    'role_workpack_binding',
    'role_routine',
    'role_routine_run',
    'role_checkpoint',
    'role_message',
    'role_handoff',
    'role_metric_snapshot',
    'role_exception_binding',
    'role_improvement_proposal',
    'role_promotion_gate',
    'role_telemetry_event',
    'role_incident_record',
    'role_routine_queue_item',
    'role_approval_request',
    'role_memory_item'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "role_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "recordType" "role_record_type" NOT NULL,
  "recordId" varchar(128) NOT NULL,
  "roleId" varchar(128),
  "routineId" varchar(128),
  "routineRunId" varchar(128),
  "sortTimestamp" timestamp with time zone,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "role_records_tenant_type_record_unique"
  ON "role_records" USING btree ("tenantId", "recordType", "recordId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_records_type_record_idx"
  ON "role_records" USING btree ("recordType", "recordId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_records_tenant_type_idx"
  ON "role_records" USING btree ("tenantId", "recordType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_records_tenant_role_idx"
  ON "role_records" USING btree ("tenantId", "roleId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_records_tenant_routine_idx"
  ON "role_records" USING btree ("tenantId", "routineId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_records_tenant_routine_run_idx"
  ON "role_records" USING btree ("tenantId", "routineRunId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_records_tenant_type_sort_idx"
  ON "role_records" USING btree ("tenantId", "recordType", "sortTimestamp");
