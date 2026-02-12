-- ShareFile Feature: User Groups and Group Members
-- Migration: Add user_groups, group_members tables and update library schema

-- Create user_groups table
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

-- Create group_members table
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

-- Add deletedBy column to library_items (for trash tracking)
ALTER TABLE "library_items" ADD COLUMN IF NOT EXISTS "deleted_by" integer;

-- Add foreign keys for user_groups
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_owner_id_users_id_fk"
  FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- Add foreign keys for group_members
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_user_groups_id_fk"
  FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_added_by_users_id_fk"
  FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

-- Add foreign key for library_items.deleted_by
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_deleted_by_users_id_fk"
  FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

-- Create indexes for user_groups
CREATE UNIQUE INDEX "user_groups_tenant_name_unique" ON "user_groups" USING btree ("tenant_id","name")
  WHERE deleted_at IS NULL;
CREATE INDEX "user_groups_tenant_idx" ON "user_groups" USING btree ("tenant_id")
  WHERE deleted_at IS NULL;
CREATE INDEX "user_groups_owner_idx" ON "user_groups" USING btree ("owner_id")
  WHERE deleted_at IS NULL;
CREATE INDEX "user_groups_visibility_idx" ON "user_groups" USING btree ("tenant_id",(settings->>'visibility'))
  WHERE deleted_at IS NULL;

-- Create indexes for group_members
CREATE UNIQUE INDEX "group_members_group_user_unique" ON "group_members" USING btree ("group_id","user_id");
CREATE INDEX "group_members_group_active_idx" ON "group_members" USING btree ("group_id")
  WHERE status = 'active';
CREATE INDEX "group_members_user_active_idx" ON "group_members" USING btree ("user_id")
  WHERE status = 'active';

-- Add group index for library_permissions
CREATE INDEX IF NOT EXISTS "library_permissions_group_idx" ON "library_permissions" USING btree ("subject_id","subject_type")
  WHERE subject_type = 'group';
