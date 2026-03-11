ALTER TABLE "task_runs" ADD COLUMN "artifactIntent" varchar(32);--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "executionRoute" varchar(32);--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "routeReason" text;--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "presentationDeckId" integer;--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "artifactMessageId" integer;