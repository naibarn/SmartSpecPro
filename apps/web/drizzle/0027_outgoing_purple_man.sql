CREATE TYPE "public"."backfill_run_status" AS ENUM('running', 'paused', 'aborted', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('pending', 'passed', 'failed');--> statement-breakpoint
CREATE TABLE "funnel_backfill_checkpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"runId" varchar(64) NOT NULL,
	"checkpointPosition" jsonb NOT NULL,
	"recordsProcessed" integer NOT NULL,
	"eventsInserted" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_backfill_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"runId" varchar(64) NOT NULL,
	"tenantId" varchar(36),
	"status" "backfill_run_status" DEFAULT 'running' NOT NULL,
	"startDate" timestamp with time zone NOT NULL,
	"endDate" timestamp with time zone NOT NULL,
	"sourceFilter" varchar(128),
	"batchSize" integer DEFAULT 1000 NOT NULL,
	"dryRun" boolean DEFAULT false NOT NULL,
	"totalRecordsProcessed" integer DEFAULT 0 NOT NULL,
	"totalEventsInserted" integer DEFAULT 0 NOT NULL,
	"reconciliationStatus" "reconciliation_status" DEFAULT 'pending' NOT NULL,
	"reconciliationReport" jsonb,
	"startedAt" timestamp with time zone NOT NULL,
	"pausedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"abortedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funnel_backfill_runs_runId_unique" UNIQUE("runId")
);
--> statement-breakpoint
CREATE TABLE "funnel_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"domain" varchar(255),
	"userId" integer,
	"eventName" varchar(128) NOT NULL,
	"eventTime" timestamp with time zone NOT NULL,
	"eventKey" varchar(255) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funnel_backfill_checkpoints" ADD CONSTRAINT "funnel_backfill_checkpoints_runId_funnel_backfill_runs_runId_fk" FOREIGN KEY ("runId") REFERENCES "public"."funnel_backfill_runs"("runId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_backfill_runs" ADD CONSTRAINT "funnel_backfill_runs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funnel_backfill_checkpoints_run_idx" ON "funnel_backfill_checkpoints" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "funnel_backfill_runs_status_idx" ON "funnel_backfill_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "funnel_backfill_runs_tenant_idx" ON "funnel_backfill_runs" USING btree ("tenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_events_event_key_unique" ON "funnel_events" USING btree ("eventKey");--> statement-breakpoint
CREATE INDEX "funnel_events_tenant_event_time_idx" ON "funnel_events" USING btree ("tenantId","eventTime");--> statement-breakpoint
CREATE INDEX "funnel_events_domain_event_time_idx" ON "funnel_events" USING btree ("domain","eventTime");--> statement-breakpoint
CREATE INDEX "funnel_events_name_event_time_idx" ON "funnel_events" USING btree ("eventName","eventTime");--> statement-breakpoint
CREATE INDEX "funnel_events_user_name_time_idx" ON "funnel_events" USING btree ("userId","eventName","eventTime");--> statement-breakpoint
CREATE INDEX "credit_transactions_type_created_idx" ON "credit_transactions" USING btree ("type","createdAt");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "registration_events_created_user_idx" ON "registration_events" USING btree ("createdAt","userId");