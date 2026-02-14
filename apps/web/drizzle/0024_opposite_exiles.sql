CREATE TYPE "public"."edit_session_status" AS ENUM('active', 'saved_back', 'discarded', 'expired');--> statement-breakpoint
CREATE TYPE "public"."indexing_mode" AS ENUM('none', 'selected_folders', 'all_except', 'all');--> statement-breakpoint
CREATE TABLE "google_drive_edit_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"library_item_id" integer NOT NULL,
	"drive_file_id" varchar(128) NOT NULL,
	"edit_url" text NOT NULL,
	"original_source_url" text,
	"status" "edit_session_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_drive_sync_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"indexing_mode" "indexing_mode" DEFAULT 'none' NOT NULL,
	"folder_selections" jsonb DEFAULT '[]'::jsonb,
	"file_type_filter" jsonb DEFAULT '[]'::jsonb,
	"max_file_size_bytes" integer DEFAULT 52428800,
	"channel_id" varchar(128),
	"resource_id" varchar(128),
	"channel_token_hash" varchar(128),
	"channel_expiry" timestamp with time zone,
	"page_token" text,
	"files_total" integer DEFAULT 0,
	"files_processed" integer DEFAULT 0,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"auto_sync_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credit_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"monthly_limit" integer NOT NULL,
	"credits_used_this_month" integer DEFAULT 0 NOT NULL,
	"budget_month_key" varchar(7) NOT NULL,
	"alert_threshold_pct" integer DEFAULT 80 NOT NULL,
	"alert_sent" boolean DEFAULT false NOT NULL,
	"hard_cap_reached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "library_links_source_unique";--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "idempotencyKey" varchar(256);--> statement-breakpoint
ALTER TABLE "library_links" ADD COLUMN "tenant_id" varchar(36) REFERENCES "public"."tenants"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "google_drive_edit_sessions" ADD CONSTRAINT "google_drive_edit_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_edit_sessions" ADD CONSTRAINT "google_drive_edit_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_edit_sessions" ADD CONSTRAINT "google_drive_edit_sessions_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_sync_state" ADD CONSTRAINT "google_drive_sync_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_drive_sync_state" ADD CONSTRAINT "google_drive_sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credit_budgets" ADD CONSTRAINT "user_credit_budgets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credit_budgets" ADD CONSTRAINT "user_credit_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gdrive_edit_tenant_user_status_idx" ON "google_drive_edit_sessions" USING btree ("tenant_id","user_id","status");--> statement-breakpoint
CREATE INDEX "gdrive_edit_library_item_idx" ON "google_drive_edit_sessions" USING btree ("library_item_id");--> statement-breakpoint
CREATE INDEX "gdrive_edit_expires_at_idx" ON "google_drive_edit_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gdrive_sync_tenant_user_unique" ON "google_drive_sync_state" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "gdrive_sync_channel_id_idx" ON "google_drive_sync_state" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_credit_budgets_tenant_user_unique" ON "user_credit_budgets" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_idempotency_key_unique" ON "credit_transactions" USING btree ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "library_links_source_tenant_unique" ON "library_links" USING btree ("link_type","link_id","tenant_id");