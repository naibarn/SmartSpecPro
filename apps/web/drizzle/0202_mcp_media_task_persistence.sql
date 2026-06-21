-- MCP Connect media task persistence.
-- Rollback guidance: prefer feature-flag rollback and leave task/audit data intact until tenant retention permits compaction.

CREATE TABLE IF NOT EXISTS "mcp_media_tasks" (
  "id" varchar(128) PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "user_id" integer NOT NULL,
  "connection_id" varchar(36),
  "share_id" varchar(36),
  "provider_task_id" varchar(128),
  "idempotency_key" varchar(128),
  "media_type" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'processing' NOT NULL,
  "model" varchar(255) NOT NULL,
  "prompt" text NOT NULL,
  "parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "mcp_media_tasks" ADD CONSTRAINT "mcp_media_tasks_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "mcp_media_tasks" ADD CONSTRAINT "mcp_media_tasks_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "mcp_media_tasks" ADD CONSTRAINT "mcp_media_tasks_connection_id_user_mcp_connections_id_fk"
    FOREIGN KEY ("connection_id") REFERENCES "public"."user_mcp_connections"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "mcp_media_tasks" ADD CONSTRAINT "mcp_media_tasks_share_id_mcp_connection_group_shares_id_fk"
    FOREIGN KEY ("share_id") REFERENCES "public"."mcp_connection_group_shares"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "mcp_media_tasks_tenant_user_created_idx"
  ON "mcp_media_tasks" ("tenant_id", "user_id", "created_at");
CREATE INDEX IF NOT EXISTS "mcp_media_tasks_status_idx"
  ON "mcp_media_tasks" ("tenant_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "mcp_media_tasks_connection_idx"
  ON "mcp_media_tasks" ("tenant_id", "connection_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_media_tasks_idempotency_unique"
  ON "mcp_media_tasks" ("tenant_id", "user_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
