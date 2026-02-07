ALTER TYPE "public"."skill_category" ADD VALUE 'image_video_generation' BEFORE 'audio_generation';--> statement-breakpoint
CREATE TABLE "api_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"traceId" varchar(32) NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"userId" integer,
	"endpoint" varchar(512),
	"model" varchar(128),
	"provider" varchar(64),
	"statusCode" integer,
	"errorMessage" text,
	"responseTimeMs" integer,
	"creditsCharged" integer DEFAULT 0,
	"costUsd" numeric(12, 8),
	"skillSlug" varchar(100),
	"mediaType" varchar(20),
	"mediaTaskId" varchar(128),
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_editor_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"projectData" json NOT NULL,
	"thumbnailUrl" text,
	"duration" numeric(10, 2) DEFAULT '0',
	"resolution" varchar(20),
	"trackCount" integer DEFAULT 4,
	"clipCount" integer DEFAULT 0,
	"version" varchar(10) DEFAULT '1.0',
	"isAutoSave" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_usage_log" ADD COLUMN "traceId" varchar(32);--> statement-breakpoint
ALTER TABLE "provider_usage_log" ADD COLUMN "errorMessage" text;--> statement-breakpoint
ALTER TABLE "provider_usage_log" ADD COLUMN "requestType" varchar(32);--> statement-breakpoint
ALTER TABLE "api_audit_events" ADD CONSTRAINT "api_audit_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_editor_projects" ADD CONSTRAINT "video_editor_projects_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_audit_events_trace_id" ON "api_audit_events" USING btree ("traceId");--> statement-breakpoint
CREATE INDEX "api_audit_events_user_created" ON "api_audit_events" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "api_audit_events_type_created" ON "api_audit_events" USING btree ("eventType","createdAt");--> statement-breakpoint
CREATE INDEX "video_editor_projects_user_idx" ON "video_editor_projects" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "video_editor_projects_updated_idx" ON "video_editor_projects" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "provider_usage_log_trace_id" ON "provider_usage_log" USING btree ("traceId");