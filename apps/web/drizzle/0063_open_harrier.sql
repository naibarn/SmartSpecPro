CREATE TYPE "public"."task_run_status" AS ENUM('planned', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"tenantId" varchar(36),
	"taskType" varchar(32) NOT NULL,
	"sourceType" varchar(32) NOT NULL,
	"status" "task_run_status" DEFAULT 'planned' NOT NULL,
	"planJson" jsonb NOT NULL,
	"skillSlug" varchar(100),
	"conversationId" integer,
	"totalCreditsUsed" integer DEFAULT 0,
	"completedAt" timestamp with time zone,
	"errorMessage" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_step_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskRunId" integer NOT NULL,
	"attemptIndex" integer DEFAULT 0 NOT NULL,
	"resolvedModelSnapshot" jsonb,
	"effectiveModel" varchar(128),
	"provider" varchar(128),
	"strategy" varchar(32),
	"inputTokens" integer DEFAULT 0,
	"outputTokens" integer DEFAULT 0,
	"creditsUsed" integer DEFAULT 0,
	"costUsd" numeric(12, 8) DEFAULT '0',
	"durationMs" integer,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"fallbackReason" text,
	"errorMessage" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_step_attempts" ADD CONSTRAINT "task_step_attempts_taskRunId_task_runs_id_fk" FOREIGN KEY ("taskRunId") REFERENCES "public"."task_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_runs_user_idx" ON "task_runs" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "task_runs_tenant_idx" ON "task_runs" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "task_runs_status_idx" ON "task_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_runs_created_idx" ON "task_runs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "task_step_attempts_run_idx" ON "task_step_attempts" USING btree ("taskRunId");--> statement-breakpoint
CREATE INDEX "task_step_attempts_model_idx" ON "task_step_attempts" USING btree ("effectiveModel");