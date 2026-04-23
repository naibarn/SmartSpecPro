CREATE TABLE IF NOT EXISTS "library_knowledge_release_gate_overrides" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) REFERENCES "tenants"("id") ON DELETE cascade,
  "scope_type" varchar(16) NOT NULL,
  "scope_id" varchar(64),
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "approved_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "reason" text NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "revoked_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "library_knowledge_release_gate_overrides_tenant_active_idx"
  ON "library_knowledge_release_gate_overrides" ("tenant_id", "status", "expires_at");

CREATE INDEX IF NOT EXISTS "library_knowledge_release_gate_overrides_scope_idx"
  ON "library_knowledge_release_gate_overrides" ("scope_type", "scope_id", "status", "expires_at");

CREATE TABLE IF NOT EXISTS "library_knowledge_telemetry_rollups" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "surface" varchar(64),
  "status" varchar(64),
  "sample_count" integer DEFAULT 0 NOT NULL,
  "metric_json" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "library_knowledge_telemetry_rollups_tenant_window_idx"
  ON "library_knowledge_telemetry_rollups" ("tenant_id", "window_start", "window_end");

CREATE INDEX IF NOT EXISTS "library_knowledge_telemetry_rollups_tenant_type_idx"
  ON "library_knowledge_telemetry_rollups" ("tenant_id", "event_type", "window_start");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_knowledge_release_gate_overrides_scope_check'
  ) THEN
    ALTER TABLE "library_knowledge_release_gate_overrides"
      ADD CONSTRAINT "library_knowledge_release_gate_overrides_scope_check"
      CHECK (
        ("scope_type" = 'global' AND "scope_id" IS NULL)
        OR ("scope_type" = 'tenant' AND "scope_id" IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_knowledge_release_gate_overrides_status_check'
  ) THEN
    ALTER TABLE "library_knowledge_release_gate_overrides"
      ADD CONSTRAINT "library_knowledge_release_gate_overrides_status_check"
      CHECK ("status" IN ('active', 'revoked', 'expired'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_knowledge_release_gate_overrides_expiry_check'
  ) THEN
    ALTER TABLE "library_knowledge_release_gate_overrides"
      ADD CONSTRAINT "library_knowledge_release_gate_overrides_expiry_check"
      CHECK ("expires_at" > "created_at");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_knowledge_telemetry_events_sample_count_positive'
  ) THEN
    ALTER TABLE "library_knowledge_telemetry_events"
      ADD CONSTRAINT "library_knowledge_telemetry_events_sample_count_positive"
      CHECK ("sample_count" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_knowledge_telemetry_events_type_check'
  ) THEN
    ALTER TABLE "library_knowledge_telemetry_events"
      ADD CONSTRAINT "library_knowledge_telemetry_events_type_check"
      CHECK ("event_type" IN (
        'surface_latency',
        'counter',
        'leakage_probe',
        'context_pack_resolution'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'library_knowledge_telemetry_rollups_sample_count_nonnegative'
  ) THEN
    ALTER TABLE "library_knowledge_telemetry_rollups"
      ADD CONSTRAINT "library_knowledge_telemetry_rollups_sample_count_nonnegative"
      CHECK ("sample_count" >= 0);
  END IF;
END $$;
