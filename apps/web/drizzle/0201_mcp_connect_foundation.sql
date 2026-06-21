-- MCP Connect foundation: provider templates, user connections, group sharing, schema cache, usage audit, and shared video approvals.
-- Rollback after production data exists must prefer feature-flag rollback over dropping these audit/customer data tables.

CREATE TABLE IF NOT EXISTS "mcp_provider_templates" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_key" varchar(64) NOT NULL,
  "display_name" varchar(128) NOT NULL,
  "mcp_url" text NOT NULL,
  "auth_type" varchar(32) DEFAULT 'oauth' NOT NULL,
  "allowed_asset_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expected_tool_hints" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_mcp_connections" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "owner_user_id" integer NOT NULL,
  "provider_template_id" varchar(36) NOT NULL,
  "display_name" varchar(128) NOT NULL,
  "status" varchar(32) DEFAULT 'connected' NOT NULL,
  "encrypted_token_ref" text,
  "encryption_key_version" varchar(64),
  "provider_account_label" text,
  "provider_account_hash" varchar(128),
  "token_expires_at" timestamp with time zone,
  "scopes" jsonb,
  "last_error_code" varchar(128),
  "last_error_at" timestamp with time zone,
  "last_health_check_at" timestamp with time zone,
  "last_tool_discovery_at" timestamp with time zone,
  "default_for_image" boolean DEFAULT false NOT NULL,
  "default_for_video" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "mcp_connection_group_shares" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "connection_id" varchar(36) NOT NULL,
  "group_id" integer NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "allowed_asset_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "allowed_tools" jsonb,
  "allowed_models" jsonb,
  "daily_use_limit" integer,
  "concurrency_limit" integer,
  "requires_video_approval" boolean DEFAULT true NOT NULL,
  "daily_window_timezone" varchar(64),
  "created_by_user_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "disabled_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "mcp_tool_schema_cache" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "provider_template_id" varchar(36) NOT NULL,
  "connection_id" varchar(36),
  "tool_name" varchar(128) NOT NULL,
  "schema_hash" varchar(128) NOT NULL,
  "input_schema" jsonb NOT NULL,
  "safe_projection" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mcp_connection_usage_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "connection_id" varchar(36),
  "owner_user_id" integer,
  "actor_user_id" integer,
  "group_id" integer,
  "media_task_id" varchar(128),
  "event_type" varchar(64) NOT NULL,
  "asset_type" varchar(32),
  "provider_key" varchar(64),
  "status" varchar(32),
  "redacted_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "schema_hash" varchar(128),
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mcp_shared_video_approvals" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar(36) NOT NULL,
  "connection_id" varchar(36) NOT NULL,
  "share_id" varchar(36) NOT NULL,
  "group_id" integer NOT NULL,
  "owner_user_id" integer NOT NULL,
  "actor_user_id" integer NOT NULL,
  "asset_type" varchar(32) DEFAULT 'video' NOT NULL,
  "prompt_hash" varchar(128) NOT NULL,
  "request_hash" varchar(128) NOT NULL,
  "redacted_request_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_by_media_task_id" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "consumed_at" timestamp with time zone
);

ALTER TABLE "user_mcp_connections" ADD CONSTRAINT "user_mcp_connections_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_mcp_connections" ADD CONSTRAINT "user_mcp_connections_owner_user_id_users_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_mcp_connections" ADD CONSTRAINT "user_mcp_connections_provider_template_id_mcp_provider_templates_id_fk"
  FOREIGN KEY ("provider_template_id") REFERENCES "public"."mcp_provider_templates"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "mcp_connection_group_shares" ADD CONSTRAINT "mcp_connection_group_shares_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mcp_connection_group_shares" ADD CONSTRAINT "mcp_connection_group_shares_connection_id_user_mcp_connections_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "public"."user_mcp_connections"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "mcp_connection_group_shares" ADD CONSTRAINT "mcp_connection_group_shares_group_id_user_groups_id_fk"
  FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "mcp_connection_group_shares" ADD CONSTRAINT "mcp_connection_group_shares_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "mcp_tool_schema_cache" ADD CONSTRAINT "mcp_tool_schema_cache_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mcp_tool_schema_cache" ADD CONSTRAINT "mcp_tool_schema_cache_provider_template_id_mcp_provider_templates_id_fk"
  FOREIGN KEY ("provider_template_id") REFERENCES "public"."mcp_provider_templates"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mcp_tool_schema_cache" ADD CONSTRAINT "mcp_tool_schema_cache_connection_id_user_mcp_connections_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "public"."user_mcp_connections"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "mcp_connection_usage_events" ADD CONSTRAINT "mcp_connection_usage_events_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mcp_connection_usage_events" ADD CONSTRAINT "mcp_connection_usage_events_connection_id_user_mcp_connections_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "public"."user_mcp_connections"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "mcp_connection_usage_events" ADD CONSTRAINT "mcp_connection_usage_events_owner_user_id_users_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "mcp_connection_usage_events" ADD CONSTRAINT "mcp_connection_usage_events_actor_user_id_users_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "mcp_connection_usage_events" ADD CONSTRAINT "mcp_connection_usage_events_group_id_user_groups_id_fk"
  FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "mcp_shared_video_approvals" ADD CONSTRAINT "mcp_shared_video_approvals_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mcp_shared_video_approvals" ADD CONSTRAINT "mcp_shared_video_approvals_connection_id_user_mcp_connections_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "public"."user_mcp_connections"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "mcp_shared_video_approvals" ADD CONSTRAINT "mcp_shared_video_approvals_share_id_mcp_connection_group_shares_id_fk"
  FOREIGN KEY ("share_id") REFERENCES "public"."mcp_connection_group_shares"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "mcp_shared_video_approvals" ADD CONSTRAINT "mcp_shared_video_approvals_group_id_user_groups_id_fk"
  FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "mcp_shared_video_approvals" ADD CONSTRAINT "mcp_shared_video_approvals_owner_user_id_users_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "mcp_shared_video_approvals" ADD CONSTRAINT "mcp_shared_video_approvals_actor_user_id_users_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_provider_templates_provider_key_unique" ON "mcp_provider_templates" ("provider_key");
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_provider_templates_mcp_url_unique" ON "mcp_provider_templates" ("mcp_url");
CREATE INDEX IF NOT EXISTS "mcp_provider_templates_enabled_idx" ON "mcp_provider_templates" ("is_enabled");

CREATE INDEX IF NOT EXISTS "user_mcp_connections_tenant_owner_status_idx" ON "user_mcp_connections" ("tenant_id", "owner_user_id", "status");
CREATE INDEX IF NOT EXISTS "user_mcp_connections_tenant_provider_status_idx" ON "user_mcp_connections" ("tenant_id", "provider_template_id", "status");
CREATE INDEX IF NOT EXISTS "user_mcp_connections_provider_account_hash_idx" ON "user_mcp_connections" ("tenant_id", "provider_template_id", "provider_account_hash");
CREATE INDEX IF NOT EXISTS "user_mcp_connections_token_expires_at_idx" ON "user_mcp_connections" ("token_expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "user_mcp_connections_default_image_unique" ON "user_mcp_connections" ("tenant_id", "owner_user_id", "provider_template_id")
  WHERE default_for_image = true AND status IN ('connected', 'requires_reauth', 'error');
CREATE UNIQUE INDEX IF NOT EXISTS "user_mcp_connections_default_video_unique" ON "user_mcp_connections" ("tenant_id", "owner_user_id", "provider_template_id")
  WHERE default_for_video = true AND status IN ('connected', 'requires_reauth', 'error');

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_connection_group_shares_active_unique" ON "mcp_connection_group_shares" ("tenant_id", "connection_id", "group_id")
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "mcp_connection_group_shares_group_enabled_idx" ON "mcp_connection_group_shares" ("tenant_id", "group_id", "enabled");
CREATE INDEX IF NOT EXISTS "mcp_connection_group_shares_connection_enabled_idx" ON "mcp_connection_group_shares" ("tenant_id", "connection_id", "enabled");

CREATE INDEX IF NOT EXISTS "mcp_tool_schema_cache_provider_tool_idx" ON "mcp_tool_schema_cache" ("tenant_id", "provider_template_id", "tool_name");
CREATE INDEX IF NOT EXISTS "mcp_tool_schema_cache_connection_tool_idx" ON "mcp_tool_schema_cache" ("tenant_id", "connection_id", "tool_name");
CREATE INDEX IF NOT EXISTS "mcp_tool_schema_cache_expires_at_idx" ON "mcp_tool_schema_cache" ("expires_at");
CREATE INDEX IF NOT EXISTS "mcp_tool_schema_cache_schema_hash_idx" ON "mcp_tool_schema_cache" ("schema_hash");

CREATE INDEX IF NOT EXISTS "mcp_connection_usage_events_connection_date_idx" ON "mcp_connection_usage_events" ("tenant_id", "connection_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "mcp_connection_usage_events_owner_date_idx" ON "mcp_connection_usage_events" ("tenant_id", "owner_user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "mcp_connection_usage_events_actor_date_idx" ON "mcp_connection_usage_events" ("tenant_id", "actor_user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "mcp_connection_usage_events_group_date_idx" ON "mcp_connection_usage_events" ("tenant_id", "group_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "mcp_connection_usage_events_media_task_idx" ON "mcp_connection_usage_events" ("tenant_id", "media_task_id");

CREATE INDEX IF NOT EXISTS "mcp_shared_video_approvals_pending_expiry_idx" ON "mcp_shared_video_approvals" ("tenant_id", "status", "expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_shared_video_approvals_consumed_task_unique" ON "mcp_shared_video_approvals" ("consumed_by_media_task_id")
  WHERE consumed_by_media_task_id IS NOT NULL;
