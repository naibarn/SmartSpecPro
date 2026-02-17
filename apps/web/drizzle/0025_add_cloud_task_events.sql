CREATE TABLE IF NOT EXISTS "cloud_task_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "taskId" varchar(512) NOT NULL,
  "queueName" varchar(128) NOT NULL,
  "jobId" varchar(128),
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "attemptCount" integer DEFAULT 0 NOT NULL,
  "payload" json,
  "errorMessage" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "completedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_task_events_task_id_idx" ON "cloud_task_events" USING btree ("taskId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_task_events_status_idx" ON "cloud_task_events" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_task_events_queue_name_idx" ON "cloud_task_events" USING btree ("queueName");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_task_events_job_id_idx" ON "cloud_task_events" USING btree ("jobId");
