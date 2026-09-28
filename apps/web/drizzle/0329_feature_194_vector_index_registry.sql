DO $$
BEGIN
  CREATE TYPE "public"."vector_projection_status" AS ENUM (
    'queued',
    'indexing',
    'indexed',
    'stale',
    'delete_pending',
    'deleted',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vector_index_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "workspace_id" varchar(128),
  "plugin_id" varchar(128),
  "source_family" varchar(96) NOT NULL,
  "source_table" varchar(128) NOT NULL,
  "source_id" varchar(256) NOT NULL,
  "chunk_id" varchar(256),
  "asset_id" varchar(256),
  "vector_id" varchar(128) NOT NULL,
  "vector_index" varchar(128) NOT NULL,
  "namespace" varchar(128) NOT NULL,
  "embedding_model" varchar(256) NOT NULL,
  "embedding_dimensions" integer NOT NULL,
  "embedding_version" varchar(64) NOT NULL,
  "metric" varchar(32) NOT NULL DEFAULT 'cosine',
  "chunking_version" varchar(64) NOT NULL,
  "normalization_version" varchar(64),
  "content_hash" varchar(64) NOT NULL,
  "source_revision" varchar(256) NOT NULL,
  "indexed_at" timestamp with time zone,
  "last_mutation_id" varchar(256),
  "input_hash" varchar(64),
  "source_locator_kind" varchar(64),
  "status" "public"."vector_projection_status" NOT NULL DEFAULT 'queued',
  "failure_code" varchar(96),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "vector_index_records_dimensions_positive" CHECK ("embedding_dimensions" > 0),
  CONSTRAINT "vector_index_records_metric_check" CHECK ("metric" IN ('cosine', 'euclidean', 'dot-product'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vector_index_records_index_vector_unique"
  ON "vector_index_records" USING btree ("vector_index", "vector_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vector_index_records_index_namespace_idx"
  ON "vector_index_records" USING btree ("vector_index", "namespace");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vector_index_records_tenant_source_idx"
  ON "vector_index_records" USING btree ("tenant_id", "source_family", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vector_index_records_tenant_hash_version_idx"
  ON "vector_index_records" USING btree ("tenant_id", "content_hash", "embedding_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vector_index_records_index_status_idx"
  ON "vector_index_records" USING btree ("vector_index", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vector_index_records_source_revision_idx"
  ON "vector_index_records" USING btree ("source_revision");
