CREATE TYPE "public"."dlq_item_status" AS ENUM('pending', 'reprocessing', 'resolved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."policy_action" AS ENUM('allow', 'deny', 'require_approval');--> statement-breakpoint
CREATE TYPE "public"."workflow_execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled', 'interrupted');--> statement-breakpoint
CREATE TABLE "workflow_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"executionId" integer,
	"nodeId" varchar(36),
	"eventType" varchar(50) NOT NULL,
	"actorId" integer,
	"data" json,
	"tenantId" varchar(36) NOT NULL,
	"traceId" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_cache_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"cacheKey" varchar(64) NOT NULL,
	"nodeType" varchar(100) NOT NULL,
	"hitCount" integer DEFAULT 0 NOT NULL,
	"lastHitAt" timestamp with time zone,
	"ttlSeconds" integer NOT NULL,
	"valueSizeBytes" integer,
	"tenantId" varchar(36),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_cache_metadata_cacheKey_unique" UNIQUE("cacheKey")
);
--> statement-breakpoint
CREATE TABLE "workflow_dead_letter_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"executionId" integer,
	"nodeId" varchar(36) NOT NULL,
	"nodeType" varchar(100),
	"inputData" json NOT NULL,
	"error" text NOT NULL,
	"stackTrace" text,
	"retryCount" integer DEFAULT 0 NOT NULL,
	"status" "dlq_item_status" DEFAULT 'pending' NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"reprocessedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"status" "workflow_execution_status" DEFAULT 'pending' NOT NULL,
	"inputData" json,
	"outputData" json,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"error" text,
	"nodeCount" integer DEFAULT 0 NOT NULL,
	"creditsUsed" integer DEFAULT 0 NOT NULL,
	"threadId" varchar(128),
	"triggerType" varchar(50),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_policy_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"ruleType" varchar(100) NOT NULL,
	"condition" json NOT NULL,
	"action" "policy_action" NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"workflowIds" json,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_secrets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"encryptedValue" text NOT NULL,
	"vaultBackend" varchar(50) DEFAULT 'internal' NOT NULL,
	"description" text,
	"createdBy" integer,
	"updatedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_audit_events" ADD CONSTRAINT "workflow_audit_events_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_events" ADD CONSTRAINT "workflow_audit_events_executionId_workflow_executions_id_fk" FOREIGN KEY ("executionId") REFERENCES "public"."workflow_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_events" ADD CONSTRAINT "workflow_audit_events_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit_events" ADD CONSTRAINT "workflow_audit_events_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_cache_metadata" ADD CONSTRAINT "workflow_cache_metadata_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_dead_letter_queue" ADD CONSTRAINT "workflow_dead_letter_queue_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_dead_letter_queue" ADD CONSTRAINT "workflow_dead_letter_queue_executionId_workflow_executions_id_fk" FOREIGN KEY ("executionId") REFERENCES "public"."workflow_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_dead_letter_queue" ADD CONSTRAINT "workflow_dead_letter_queue_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_policy_rules" ADD CONSTRAINT "workflow_policy_rules_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_policy_rules" ADD CONSTRAINT "workflow_policy_rules_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_secrets" ADD CONSTRAINT "workflow_secrets_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_secrets" ADD CONSTRAINT "workflow_secrets_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_secrets" ADD CONSTRAINT "workflow_secrets_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_workflow_idx" ON "workflow_audit_events" USING btree ("workflowId");--> statement-breakpoint
CREATE INDEX "audit_events_execution_idx" ON "workflow_audit_events" USING btree ("executionId");--> statement-breakpoint
CREATE INDEX "audit_events_event_type_idx" ON "workflow_audit_events" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_idx" ON "workflow_audit_events" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "workflow_audit_events" USING btree ("actorId");--> statement-breakpoint
CREATE INDEX "audit_events_trace_idx" ON "workflow_audit_events" USING btree ("traceId");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "workflow_audit_events" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "cache_metadata_node_type_idx" ON "workflow_cache_metadata" USING btree ("nodeType");--> statement-breakpoint
CREATE INDEX "cache_metadata_tenant_idx" ON "workflow_cache_metadata" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "cache_metadata_last_hit_idx" ON "workflow_cache_metadata" USING btree ("lastHitAt");--> statement-breakpoint
CREATE INDEX "dlq_workflow_idx" ON "workflow_dead_letter_queue" USING btree ("workflowId");--> statement-breakpoint
CREATE INDEX "dlq_execution_idx" ON "workflow_dead_letter_queue" USING btree ("executionId");--> statement-breakpoint
CREATE INDEX "dlq_status_idx" ON "workflow_dead_letter_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dlq_tenant_idx" ON "workflow_dead_letter_queue" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "dlq_created_idx" ON "workflow_dead_letter_queue" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "workflow_executions_workflow_idx" ON "workflow_executions" USING btree ("workflowId");--> statement-breakpoint
CREATE INDEX "workflow_executions_tenant_idx" ON "workflow_executions" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "workflow_executions_user_idx" ON "workflow_executions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_executions_thread_idx" ON "workflow_executions" USING btree ("threadId");--> statement-breakpoint
CREATE INDEX "workflow_executions_created_idx" ON "workflow_executions" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "policy_rules_tenant_idx" ON "workflow_policy_rules" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "policy_rules_type_idx" ON "workflow_policy_rules" USING btree ("ruleType");--> statement-breakpoint
CREATE INDEX "policy_rules_enabled_idx" ON "workflow_policy_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "policy_rules_priority_idx" ON "workflow_policy_rules" USING btree ("priority");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_secrets_tenant_name_unique" ON "workflow_secrets" USING btree ("tenantId","name");--> statement-breakpoint
CREATE INDEX "workflow_secrets_tenant_idx" ON "workflow_secrets" USING btree ("tenantId");