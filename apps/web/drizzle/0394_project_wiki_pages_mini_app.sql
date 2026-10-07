-- Project Wiki Pages reference Mini App, tenant/project/App-bound CRUD content.
BEGIN;

CREATE TABLE "mini_app_project_wiki_pages" (
  "page_id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "stable_id" varchar(36) NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "app_id" varchar(128) NOT NULL,
  "owner_principal_id" varchar(160) NOT NULL,
  "path" varchar(512) NOT NULL,
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "content_hash" varchar(64) NOT NULL,
  "lifecycle" varchar(16) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mini_app_project_wiki_pages_tenant_page_unique" UNIQUE ("tenant_id", "page_id"),
  CONSTRAINT "mini_app_project_wiki_pages_project_fk" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "canonical_projects"("tenant_id", "project_id") ON DELETE CASCADE,
  CONSTRAINT "mini_app_project_wiki_pages_app_fk" FOREIGN KEY ("tenant_id", "app_id") REFERENCES "app_identities"("tenant_id", "app_id") ON DELETE CASCADE,
  CONSTRAINT "mini_app_project_wiki_pages_lifecycle_check" CHECK ("lifecycle" IN ('ACTIVE', 'ARCHIVED')),
  CONSTRAINT "mini_app_project_wiki_pages_path_nonempty_check" CHECK (length(btrim("path")) > 0),
  CONSTRAINT "mini_app_project_wiki_pages_path_lowercase_check" CHECK ("path" = lower("path")),
  CONSTRAINT "mini_app_project_wiki_pages_title_nonempty_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "mini_app_project_wiki_pages_owner_nonempty_check" CHECK (length(btrim("owner_principal_id")) > 0),
  CONSTRAINT "mini_app_project_wiki_pages_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "mini_app_project_wiki_pages_content_size_check" CHECK (octet_length("content") <= 262144)
);

CREATE UNIQUE INDEX "mini_app_project_wiki_pages_stable_id_unique"
  ON "mini_app_project_wiki_pages" ("tenant_id", "project_id", "stable_id");
CREATE UNIQUE INDEX "mini_app_project_wiki_pages_active_path_unique"
  ON "mini_app_project_wiki_pages" ("tenant_id", "project_id", "path")
  WHERE "lifecycle" = 'ACTIVE';
CREATE INDEX "mini_app_project_wiki_pages_updated_idx"
  ON "mini_app_project_wiki_pages" ("tenant_id", "project_id", "updated_at" DESC, "page_id");

COMMIT;
