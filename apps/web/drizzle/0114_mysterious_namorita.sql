ALTER TYPE "public"."entity_type" ADD VALUE 'note';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'checklist';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'artifact_note';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'handoff_note';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'episode';--> statement-breakpoint
CREATE TABLE "agency_improvement_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"triggerType" varchar(30) NOT NULL,
	"triggerRef" varchar(100),
	"changeType" varchar(30) NOT NULL,
	"agentNodeId" text,
	"description" text NOT NULL,
	"previousValue" text,
	"newValue" text,
	"approvedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_run_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"runId" varchar(36) NOT NULL,
	"conversationId" varchar(36),
	"userId" integer NOT NULL,
	"rating" integer NOT NULL,
	"whatWorked" text,
	"whatDidntWork" text,
	"improvementRequests" text,
	"advisorAnalysis" jsonb,
	"suggestionsApplied" boolean DEFAULT false,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "objective" text;--> statement-breakpoint
ALTER TABLE "agency_improvement_history" ADD CONSTRAINT "agency_improvement_history_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_improvement_history" ADD CONSTRAINT "agency_improvement_history_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_improvement_history" ADD CONSTRAINT "agency_improvement_history_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_run_feedback" ADD CONSTRAINT "agency_run_feedback_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_run_feedback" ADD CONSTRAINT "agency_run_feedback_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_run_feedback" ADD CONSTRAINT "agency_run_feedback_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_improvement_agency_idx" ON "agency_improvement_history" USING btree ("agencyId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_run_feedback_unique" ON "agency_run_feedback" USING btree ("runId","userId");--> statement-breakpoint
CREATE INDEX "agency_run_feedback_agency_idx" ON "agency_run_feedback" USING btree ("agencyId","createdAt");