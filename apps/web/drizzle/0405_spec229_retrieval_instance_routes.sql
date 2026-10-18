CREATE TABLE IF NOT EXISTS "retrieval_instance_routes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "environment" varchar(24) NOT NULL,
  "topology_mode" varchar(32) NOT NULL,
  "namespace" varchar(64) NOT NULL,
  "instance_ids" jsonb NOT NULL,
  "source_class_routes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "shard_policy" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "capacity_state" varchar(32) NOT NULL DEFAULT 'unknown',
  "profile_version" varchar(64) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "retrieval_instance_routes_tenant_environment_unique"
    UNIQUE ("tenant_id", "environment"),
  CONSTRAINT "retrieval_instance_routes_environment_check"
    CHECK ("environment" IN ('dev', 'staging', 'prod')),
  CONSTRAINT "retrieval_instance_routes_topology_check"
    CHECK ("topology_mode" IN ('shared', 'dedicated', 'pooled', 'sharded')),
  CONSTRAINT "retrieval_instance_routes_capacity_state_check"
    CHECK ("capacity_state" IN ('unknown', 'healthy', 'warning', 'rebalance_required', 'full')),
  CONSTRAINT "retrieval_instance_routes_instance_ids_check"
    CHECK (CASE WHEN jsonb_typeof("instance_ids") = 'array'
      THEN jsonb_array_length("instance_ids") BETWEEN 1 AND 10 ELSE false END),
  CONSTRAINT "retrieval_instance_routes_source_class_routes_check"
    CHECK (jsonb_typeof("source_class_routes") = 'object'),
  CONSTRAINT "retrieval_instance_routes_shard_policy_check"
    CHECK (jsonb_typeof("shard_policy") = 'object')
);

CREATE INDEX IF NOT EXISTS "retrieval_instance_routes_environment_enabled_idx"
  ON "retrieval_instance_routes" ("environment", "enabled");
