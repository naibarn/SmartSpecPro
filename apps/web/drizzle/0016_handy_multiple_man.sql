CREATE TABLE "webhook_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"nodeId" varchar(36) NOT NULL,
	"requestMethod" varchar(10),
	"requestBody" json,
	"requestHeaders" json,
	"executionId" varchar(36),
	"status" varchar(20),
	"response" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_event_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"nodeId" varchar(36) NOT NULL,
	"eventType" varchar(100) NOT NULL,
	"filterConditions" json,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"nodeId" varchar(36) NOT NULL,
	"cronExpression" varchar(100) NOT NULL,
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"lastRun" timestamp with time zone,
	"nextRun" timestamp with time zone NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_calls" ADD CONSTRAINT "webhook_calls_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_event_subscriptions" ADD CONSTRAINT "workflow_event_subscriptions_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_calls_workflow_node_idx" ON "webhook_calls" USING btree ("workflowId","nodeId");--> statement-breakpoint
CREATE INDEX "webhook_calls_execution_idx" ON "webhook_calls" USING btree ("executionId");--> statement-breakpoint
CREATE INDEX "webhook_calls_created_idx" ON "webhook_calls" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "workflow_event_subscriptions_workflow_idx" ON "workflow_event_subscriptions" USING btree ("workflowId");--> statement-breakpoint
CREATE INDEX "workflow_event_subscriptions_event_type_idx" ON "workflow_event_subscriptions" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "workflow_event_subscriptions_active_idx" ON "workflow_event_subscriptions" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "workflow_schedules_workflow_idx" ON "workflow_schedules" USING btree ("workflowId");--> statement-breakpoint
CREATE INDEX "workflow_schedules_next_run_idx" ON "workflow_schedules" USING btree ("nextRun");--> statement-breakpoint
CREATE INDEX "workflow_schedules_active_idx" ON "workflow_schedules" USING btree ("isActive");