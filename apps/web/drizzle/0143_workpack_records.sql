DO $$
BEGIN
  CREATE TYPE "public"."workpack_record_type" AS ENUM (
    'case_source',
    'playbook',
    'workpack',
    'workpack_version',
    'workpack_run',
    'simulation_run',
    'workpack_exception',
    'benchmark_pack',
    'promotion_record',
    'improvement_proposal',
    'telemetry_event',
    'metric_snapshot',
    'incident_record',
    'schedule_record'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "workpack_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "recordType" "workpack_record_type" NOT NULL,
  "recordId" varchar(128) NOT NULL,
  "workpackId" varchar(128),
  "sortTimestamp" timestamp with time zone,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "workpack_records_tenant_type_record_unique"
  ON "workpack_records" USING btree ("tenantId", "recordType", "recordId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workpack_records_type_record_idx"
  ON "workpack_records" USING btree ("recordType", "recordId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workpack_records_tenant_type_idx"
  ON "workpack_records" USING btree ("tenantId", "recordType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workpack_records_tenant_workpack_idx"
  ON "workpack_records" USING btree ("tenantId", "workpackId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workpack_records_tenant_type_sort_idx"
  ON "workpack_records" USING btree ("tenantId", "recordType", "sortTimestamp");
