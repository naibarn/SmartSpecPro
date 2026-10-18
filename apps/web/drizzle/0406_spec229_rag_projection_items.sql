DO $$ BEGIN
  CREATE TYPE "rag_projection_status" AS ENUM (
    'queued', 'indexing', 'indexed', 'stale', 'delete_pending', 'deleted', 'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "rag_projection_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "source_type" varchar(48) NOT NULL,
  "source_id" varchar(256) NOT NULL,
  "source_version" varchar(160) NOT NULL,
  "projection_part" varchar(128) NOT NULL DEFAULT 'whole',
  "acl_scope" varchar(64) NOT NULL,
  "projection_key" varchar(256) NOT NULL,
  "projection_hash" varchar(64) NOT NULL,
  "projection_bytes" integer NOT NULL,
  "provider" varchar(32) NOT NULL DEFAULT 'cloudflare_ai_search',
  "instance_id" varchar(64) NOT NULL,
  "provider_item_id" varchar(256),
  "embedding_profile" varchar(96) NOT NULL,
  "status" "rag_projection_status" NOT NULL DEFAULT 'queued',
  "indexed_at" timestamptz,
  "deleted_at" timestamptz,
  "last_error" varchar(96),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "rag_projection_items_acl_scope_bytes_check"
    CHECK (octet_length("acl_scope") <= 64),
  CONSTRAINT "rag_projection_items_projection_hash_check"
    CHECK ("projection_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "rag_projection_items_projection_bytes_check"
    CHECK ("projection_bytes" BETWEEN 1 AND 4000000),
  CONSTRAINT "rag_projection_items_provider_check"
    CHECK ("provider" = 'cloudflare_ai_search'),
  CONSTRAINT "rag_projection_items_key_unique"
    UNIQUE ("tenant_id", "projection_key"),
  CONSTRAINT "rag_projection_items_identity_unique"
    UNIQUE (
      "tenant_id", "source_type", "source_id", "source_version",
      "projection_part", "acl_scope", "embedding_profile"
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "rag_projection_items_provider_item_unique"
  ON "rag_projection_items" ("provider", "instance_id", "provider_item_id")
  WHERE "provider_item_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "rag_projection_items_tenant_source_idx"
  ON "rag_projection_items" ("tenant_id", "source_type", "source_id", "source_version");
CREATE INDEX IF NOT EXISTS "rag_projection_items_tenant_status_idx"
  ON "rag_projection_items" ("tenant_id", "status");
