CREATE TABLE "mcp_server_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"mcp_server_id" integer NOT NULL,
	"target_type" varchar(10) NOT NULL,
	"target_id" varchar(36) NOT NULL,
	"enabled_tool_names" text[],
	"disabled_tool_names" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"transport_type" varchar(20) DEFAULT 'http' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"oauth_client_id" text,
	"oauth_client_secret_encrypted" text,
	"oauth_access_token_encrypted" text,
	"oauth_refresh_token_encrypted" text,
	"oauth_token_expires_at" timestamp with time zone,
	"oauth_config" jsonb,
	"capabilities" jsonb DEFAULT '{"tools":true}'::jsonb,
	"tool_name_prefix" boolean DEFAULT true,
	"max_tools_exposed" integer DEFAULT 50,
	"timeout_seconds" integer DEFAULT 30,
	"endpoint_path" varchar(100) DEFAULT '/rpc',
	"risk_level" varchar(10) DEFAULT 'high' NOT NULL,
	"data_classification" varchar(20) DEFAULT 'internal',
	"config_hash" varchar(64),
	"approved_at" timestamp with time zone,
	"approved_by" integer,
	"credit_per_call" numeric(10, 2) DEFAULT '1.0',
	"last_health_check" timestamp with time zone,
	"health_status" varchar(20) DEFAULT 'unknown',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
ALTER TABLE "mcp_server_assignments" ADD CONSTRAINT "mcp_server_assignments_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_assignments_server_target_unique" ON "mcp_server_assignments" USING btree ("mcp_server_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "ix_mcp_assignments_target" ON "mcp_server_assignments" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_servers_tenant_slug_unique" ON "mcp_servers" USING btree ("tenantId","slug");--> statement-breakpoint
CREATE INDEX "ix_mcp_servers_tenant" ON "mcp_servers" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "ix_mcp_servers_enabled" ON "mcp_servers" USING btree ("tenantId","enabled");