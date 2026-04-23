CREATE TABLE IF NOT EXISTS "library_knowledge_telemetry_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "event_type" varchar(64) NOT NULL,
  "surface" varchar(64),
  "status" varchar(64),
  "sample_count" integer DEFAULT 1 NOT NULL,
  "metric_json" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "library_knowledge_telemetry_events_tenant_created_idx"
  ON "library_knowledge_telemetry_events" ("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "library_knowledge_telemetry_events_tenant_type_created_idx"
  ON "library_knowledge_telemetry_events" ("tenant_id", "event_type", "created_at");

CREATE INDEX IF NOT EXISTS "library_knowledge_telemetry_events_tenant_surface_created_idx"
  ON "library_knowledge_telemetry_events" ("tenant_id", "surface", "created_at");
