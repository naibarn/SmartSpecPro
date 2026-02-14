CREATE TYPE "public"."library_index_job_status" AS ENUM('pending', 'processing', 'retry_pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."library_item_status" AS ENUM('draft', 'ready', 'indexing', 'archived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."library_visibility" AS ENUM('private', 'team', 'public');--> statement-breakpoint
CREATE TYPE "public"."media_callback_dlq_status" AS ENUM('pending', 'reprocessed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."media_callback_event_status" AS ENUM('pending', 'processing', 'retry_pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(32) DEFAULT 'member' NOT NULL,
	"added_by" integer,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "library_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"library_item_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_type" varchar(32) DEFAULT 'text' NOT NULL,
	"token_count" integer,
	"vector_ref_id" varchar(128),
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_content_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"library_item_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"content_type" varchar(32) DEFAULT 'markdown_source' NOT NULL,
	"content_size_bytes" integer NOT NULL,
	"change_description" text,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_index_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"library_item_id" integer NOT NULL,
	"job_type" varchar(64) NOT NULL,
	"status" "library_index_job_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"owner_user_id" integer NOT NULL,
	"item_type" varchar(32) NOT NULL,
	"source" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "library_item_status" DEFAULT 'ready' NOT NULL,
	"visibility" "library_visibility" DEFAULT 'private' NOT NULL,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"source_url" text,
	"thumbnail_url" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"library_item_id" integer NOT NULL,
	"link_type" varchar(64) NOT NULL,
	"link_id" varchar(128) NOT NULL,
	"provider_task_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"library_item_id" integer NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" varchar(64) NOT NULL,
	"permission_level" varchar(32) DEFAULT 'read' NOT NULL,
	"granted_by_user_id" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_callback_dlq" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer,
	"tenant_id" varchar(36),
	"provider_name" varchar(64) DEFAULT 'kie_ai' NOT NULL,
	"provider_task_id" varchar(128),
	"event_fingerprint" varchar(64) NOT NULL,
	"payload" json DEFAULT '{}'::json NOT NULL,
	"error_message" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"status" "media_callback_dlq_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_callback_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36),
	"provider_name" varchar(64) DEFAULT 'kie_ai' NOT NULL,
	"provider_task_id" varchar(128),
	"event_fingerprint" varchar(64) NOT NULL,
	"payload" json DEFAULT '{}'::json NOT NULL,
	"normalized_status" varchar(32),
	"result_url" text,
	"error_message" text,
	"status" "media_callback_event_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_callback_events_event_fingerprint_unique" UNIQUE("event_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"owner_id" integer NOT NULL,
	"icon_url" text,
	"settings" json DEFAULT '{"visibility":"private","joinPolicy":"invite_only"}'::json NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_chunks" ADD CONSTRAINT "library_chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_chunks" ADD CONSTRAINT "library_chunks_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_content_versions" ADD CONSTRAINT "library_content_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_content_versions" ADD CONSTRAINT "library_content_versions_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_content_versions" ADD CONSTRAINT "library_content_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_index_jobs" ADD CONSTRAINT "library_index_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_index_jobs" ADD CONSTRAINT "library_index_jobs_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_links" ADD CONSTRAINT "library_links_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_permissions" ADD CONSTRAINT "library_permissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_permissions" ADD CONSTRAINT "library_permissions_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_permissions" ADD CONSTRAINT "library_permissions_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_callback_dlq" ADD CONSTRAINT "media_callback_dlq_event_id_media_callback_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."media_callback_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_callback_dlq" ADD CONSTRAINT "media_callback_dlq_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_callback_events" ADD CONSTRAINT "media_callback_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_group_user_unique" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_members_group_active_idx" ON "group_members" USING btree ("group_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "group_members_user_active_idx" ON "group_members" USING btree ("user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "library_chunks_item_chunk_index_unique" ON "library_chunks" USING btree ("library_item_id","chunk_index");--> statement-breakpoint
CREATE INDEX "library_chunks_tenant_content_type_idx" ON "library_chunks" USING btree ("tenant_id","content_type");--> statement-breakpoint
CREATE INDEX "library_chunks_vector_ref_idx" ON "library_chunks" USING btree ("vector_ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_versions_item_version_unique" ON "library_content_versions" USING btree ("library_item_id","version_number");--> statement-breakpoint
CREATE INDEX "library_versions_item_created_idx" ON "library_content_versions" USING btree ("library_item_id","created_at");--> statement-breakpoint
CREATE INDEX "library_versions_tenant_created_idx" ON "library_content_versions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "library_versions_hash_idx" ON "library_content_versions" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "library_index_jobs_tenant_status_run_at_idx" ON "library_index_jobs" USING btree ("tenant_id","status","run_at");--> statement-breakpoint
CREATE INDEX "library_index_jobs_status_retry_idx" ON "library_index_jobs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "library_index_jobs_item_status_idx" ON "library_index_jobs" USING btree ("library_item_id","status");--> statement-breakpoint
CREATE INDEX "library_items_tenant_visibility_status_idx" ON "library_items" USING btree ("tenant_id","visibility","status");--> statement-breakpoint
CREATE INDEX "library_items_tenant_owner_status_idx" ON "library_items" USING btree ("tenant_id","owner_user_id","status");--> statement-breakpoint
CREATE INDEX "library_items_source_item_type_idx" ON "library_items" USING btree ("source","item_type");--> statement-breakpoint
CREATE INDEX "library_items_deleted_at_idx" ON "library_items" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_links_source_unique" ON "library_links" USING btree ("link_type","link_id");--> statement-breakpoint
CREATE INDEX "library_links_item_type_idx" ON "library_links" USING btree ("library_item_id","link_type");--> statement-breakpoint
CREATE INDEX "library_links_provider_task_idx" ON "library_links" USING btree ("provider_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_permissions_subject_unique" ON "library_permissions" USING btree ("library_item_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "library_permissions_tenant_subject_idx" ON "library_permissions" USING btree ("tenant_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "library_permissions_group_idx" ON "library_permissions" USING btree ("subject_id","subject_type") WHERE subject_type = 'group';--> statement-breakpoint
CREATE INDEX "media_callback_dlq_event_idx" ON "media_callback_dlq" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "media_callback_dlq_provider_task_idx" ON "media_callback_dlq" USING btree ("provider_task_id");--> statement-breakpoint
CREATE INDEX "media_callback_dlq_status_idx" ON "media_callback_dlq" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_callback_dlq_tenant_status_idx" ON "media_callback_dlq" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "media_callback_events_provider_task_idx" ON "media_callback_events" USING btree ("provider_task_id");--> statement-breakpoint
CREATE INDEX "media_callback_events_status_retry_idx" ON "media_callback_events" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "media_callback_events_provider_status_idx" ON "media_callback_events" USING btree ("provider_task_id","status");--> statement-breakpoint
CREATE INDEX "media_callback_events_tenant_status_retry_idx" ON "media_callback_events" USING btree ("tenant_id","status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_groups_tenant_name_unique" ON "user_groups" USING btree ("tenant_id","name") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "user_groups_tenant_idx" ON "user_groups" USING btree ("tenant_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "user_groups_owner_idx" ON "user_groups" USING btree ("owner_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "user_groups_visibility_idx" ON "user_groups" USING btree ("tenant_id",(settings->>'visibility')) WHERE deleted_at IS NULL;