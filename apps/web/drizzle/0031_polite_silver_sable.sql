CREATE TABLE "onedrive_edit_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"library_item_id" integer NOT NULL,
	"drive_item_id" varchar(256) NOT NULL,
	"edit_url" text NOT NULL,
	"original_source_url" text,
	"status" "edit_session_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onedrive_sync_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"indexing_mode" "indexing_mode" DEFAULT 'none' NOT NULL,
	"folder_selections" jsonb DEFAULT '[]'::jsonb,
	"file_type_filter" jsonb DEFAULT '[]'::jsonb,
	"max_file_size_bytes" integer DEFAULT 52428800,
	"delta_link" text,
	"subscription_id" varchar(128),
	"subscription_expiry" timestamp with time zone,
	"files_total" integer DEFAULT 0,
	"files_processed" integer DEFAULT 0,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"auto_sync_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onedrive_edit_sessions" ADD CONSTRAINT "onedrive_edit_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onedrive_edit_sessions" ADD CONSTRAINT "onedrive_edit_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onedrive_edit_sessions" ADD CONSTRAINT "onedrive_edit_sessions_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onedrive_sync_state" ADD CONSTRAINT "onedrive_sync_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onedrive_sync_state" ADD CONSTRAINT "onedrive_sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onedrive_edit_tenant_user_status_idx" ON "onedrive_edit_sessions" USING btree ("tenant_id","user_id","status");--> statement-breakpoint
CREATE INDEX "onedrive_edit_library_item_idx" ON "onedrive_edit_sessions" USING btree ("library_item_id");--> statement-breakpoint
CREATE INDEX "onedrive_edit_expires_at_idx" ON "onedrive_edit_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "onedrive_sync_tenant_user_unique" ON "onedrive_sync_state" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "onedrive_sync_subscription_id_idx" ON "onedrive_sync_state" USING btree ("subscription_id");