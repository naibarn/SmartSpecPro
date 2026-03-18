CREATE TYPE "public"."inter_agent_channel" AS ENUM('system_broadcast', 'system_control', 'team_escalation', 'system_direct', 'system_context');--> statement-breakpoint
CREATE TYPE "public"."inter_agent_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."inter_agent_source_type" AS ENUM('team', 'system', 'external');--> statement-breakpoint
CREATE TYPE "public"."inter_agent_status" AS ENUM('delivered', 'acknowledged');--> statement-breakpoint
CREATE TYPE "public"."inter_agent_target_type" AS ENUM('room', 'run', 'team', 'user', 'all_active_runs');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('healthy', 'degraded', 'down', 'critical');--> statement-breakpoint
CREATE TABLE "inter_agent_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"channel" "inter_agent_channel" NOT NULL,
	"sourceAgentType" "inter_agent_source_type" NOT NULL,
	"sourceAgentId" varchar(100) NOT NULL,
	"targetType" "inter_agent_target_type" NOT NULL,
	"targetId" varchar(100),
	"priority" "inter_agent_priority" DEFAULT 'normal' NOT NULL,
	"messageType" varchar(64) NOT NULL,
	"payload" jsonb,
	"displayMessage" text,
	"actionRequired" boolean DEFAULT false NOT NULL,
	"status" "inter_agent_status" DEFAULT 'delivered' NOT NULL,
	"acknowledgedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"relatedIncidentId" integer,
	"relatedRunId" varchar(36),
	"relatedRoomId" varchar(36),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_resource_state" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36),
	"resourceType" varchar(32) NOT NULL,
	"status" "resource_status" NOT NULL,
	"stateJson" jsonb,
	"updatedBy" varchar(64),
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inter_agent_messages_target_created_idx" ON "inter_agent_messages" USING btree ("targetType","targetId","createdAt");--> statement-breakpoint
CREATE INDEX "inter_agent_messages_incident_idx" ON "inter_agent_messages" USING btree ("relatedIncidentId");--> statement-breakpoint
CREATE INDEX "inter_agent_messages_run_idx" ON "inter_agent_messages" USING btree ("relatedRunId");