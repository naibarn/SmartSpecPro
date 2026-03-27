CREATE TABLE "scheduled_job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskName" varchar(200) NOT NULL,
	"taskId" varchar(100),
	"status" varchar(20) NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	"durationMs" integer,
	"result" text,
	"errorMessage" text,
	"retryCount" integer DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_task_idx" ON "scheduled_job_runs" USING btree ("taskName","startedAt");--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_status_idx" ON "scheduled_job_runs" USING btree ("status","startedAt");