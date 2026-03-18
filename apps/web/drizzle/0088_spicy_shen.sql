CREATE TYPE "public"."external_task_status" AS ENUM('received', 'awaiting_review', 'approved', 'rejected', 'materialized', 'failed');--> statement-breakpoint
CREATE TYPE "public"."handoff_approval_state" AS ENUM('not_required', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('pending', 'approved', 'rejected', 'executing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."trust_tier" AS ENUM('untrusted', 'basic', 'verified', 'privileged');--> statement-breakpoint
CREATE TABLE "automation_handoffs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"teamId" varchar(36) NOT NULL,
	"roomId" varchar(36) NOT NULL,
	"runId" varchar(36) NOT NULL,
	"assistantId" varchar(36) NOT NULL,
	"destinationType" varchar(50) NOT NULL,
	"destinationId" varchar(100),
	"status" "handoff_status" DEFAULT 'pending' NOT NULL,
	"approvalState" "handoff_approval_state" DEFAULT 'pending' NOT NULL,
	"requestPayloadJson" jsonb,
	"resultPayloadJson" jsonb,
	"approvedByUserId" integer,
	"errorDetail" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_task_inbox" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"sourceId" varchar(36) NOT NULL,
	"targetTeamId" varchar(36),
	"status" "external_task_status" DEFAULT 'received' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal',
	"title" varchar(500) NOT NULL,
	"description" text,
	"payloadJson" jsonb,
	"materializedRoomId" varchar(36),
	"materializedRunId" varchar(36),
	"reviewedByUserId" integer,
	"errorDetail" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_task_sources" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"sourceType" varchar(50) NOT NULL,
	"trustTier" "trust_tier" DEFAULT 'untrusted' NOT NULL,
	"configJson" jsonb,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_task_inbox" ADD CONSTRAINT "external_task_inbox_sourceId_external_task_sources_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."external_task_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_handoffs_run_idx" ON "automation_handoffs" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "automation_handoffs_team_idx" ON "automation_handoffs" USING btree ("teamId");--> statement-breakpoint
CREATE INDEX "external_task_inbox_tenant_status_idx" ON "external_task_inbox" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "external_task_inbox_source_idx" ON "external_task_inbox" USING btree ("sourceId");--> statement-breakpoint
CREATE INDEX "external_task_sources_tenant_idx" ON "external_task_sources" USING btree ("tenantId");