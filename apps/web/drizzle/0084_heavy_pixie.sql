CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired', 'execution_failed');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('info', 'warning', 'error', 'critical');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'acknowledged', 'resolved', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ticket_resolution" AS ENUM('fixed', 'wont_fix', 'duplicate', 'cannot_reproduce', 'planned', 'by_design');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('new', 'triaged', 'in_progress', 'deferred', 'resolved', 'duplicate', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('bug', 'feature_request', 'observation', 'question');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'system_agent';--> statement-breakpoint
CREATE TABLE "feedback_ticket_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"fileUrl" varchar(500) NOT NULL,
	"fileSize" integer,
	"mimeType" varchar(100),
	"uploadedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"authorId" integer,
	"authorType" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"isInternal" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36),
	"submittedBy" integer,
	"submittedByType" varchar(16) NOT NULL,
	"ticketType" "ticket_type" NOT NULL,
	"priority" "reminder_priority" DEFAULT 'normal' NOT NULL,
	"severity" varchar(16),
	"category" varchar(64),
	"title" varchar(255) NOT NULL,
	"description" text,
	"stepsToReproduce" text,
	"expectedBehavior" text,
	"actualBehavior" text,
	"contextJson" json,
	"autoCategory" varchar(64),
	"autoPriority" varchar(16),
	"autoSummary" text,
	"duplicateOf" integer,
	"relatedIncidentId" integer,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"assignedTo" integer,
	"adminResponse" text,
	"resolutionNotes" text,
	"resolutionType" "ticket_resolution",
	"plannedVersion" varchar(32),
	"planningDocUrl" varchar(500),
	"devBranch" varchar(100),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"triagedAt" timestamp with time zone,
	"respondedAt" timestamp with time zone,
	"resolvedAt" timestamp with time zone,
	"closedAt" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "virtual_admin_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"incidentId" integer NOT NULL,
	"actionType" varchar(64) NOT NULL,
	"actionParamsJson" json,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requestedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"decidedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL,
	"decidedBy" integer,
	"decisionComment" text
);
--> statement-breakpoint
CREATE TABLE "virtual_admin_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36),
	"sensorId" varchar(64) NOT NULL,
	"ruleId" varchar(64) NOT NULL,
	"severity" "incident_severity" NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text,
	"metricsJson" json,
	"actionTaken" varchar(64),
	"actionResult" text,
	"resolvedBy" integer,
	"resolvedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "virtual_admin_sensor_config" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"sensorId" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"intervalMs" integer,
	"thresholdsJson" json,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "isSystemUser" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "feedback_ticket_attachments" ADD CONSTRAINT "feedback_ticket_attachments_ticketId_feedback_tickets_id_fk" FOREIGN KEY ("ticketId") REFERENCES "public"."feedback_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_ticket_attachments" ADD CONSTRAINT "feedback_ticket_attachments_uploadedBy_users_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_ticket_comments" ADD CONSTRAINT "feedback_ticket_comments_ticketId_feedback_tickets_id_fk" FOREIGN KEY ("ticketId") REFERENCES "public"."feedback_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_ticket_comments" ADD CONSTRAINT "feedback_ticket_comments_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tickets" ADD CONSTRAINT "feedback_tickets_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tickets" ADD CONSTRAINT "feedback_tickets_submittedBy_users_id_fk" FOREIGN KEY ("submittedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tickets" ADD CONSTRAINT "feedback_tickets_duplicateOf_feedback_tickets_id_fk" FOREIGN KEY ("duplicateOf") REFERENCES "public"."feedback_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tickets" ADD CONSTRAINT "feedback_tickets_relatedIncidentId_virtual_admin_incidents_id_fk" FOREIGN KEY ("relatedIncidentId") REFERENCES "public"."virtual_admin_incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tickets" ADD CONSTRAINT "feedback_tickets_assignedTo_users_id_fk" FOREIGN KEY ("assignedTo") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_admin_approvals" ADD CONSTRAINT "virtual_admin_approvals_incidentId_virtual_admin_incidents_id_fk" FOREIGN KEY ("incidentId") REFERENCES "public"."virtual_admin_incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_admin_approvals" ADD CONSTRAINT "virtual_admin_approvals_decidedBy_users_id_fk" FOREIGN KEY ("decidedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_admin_incidents" ADD CONSTRAINT "virtual_admin_incidents_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_admin_incidents" ADD CONSTRAINT "virtual_admin_incidents_resolvedBy_users_id_fk" FOREIGN KEY ("resolvedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_admin_sensor_config" ADD CONSTRAINT "virtual_admin_sensor_config_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "va_incidents_tenant_idx" ON "virtual_admin_incidents" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "va_incidents_status_idx" ON "virtual_admin_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "va_incidents_severity_idx" ON "virtual_admin_incidents" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "va_incidents_sensor_idx" ON "virtual_admin_incidents" USING btree ("sensorId");