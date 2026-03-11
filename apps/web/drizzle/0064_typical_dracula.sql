CREATE TYPE "public"."step_attempt_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
ALTER TABLE "task_step_attempts" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."step_attempt_status";--> statement-breakpoint
ALTER TABLE "task_step_attempts" ALTER COLUMN "status" SET DATA TYPE "public"."step_attempt_status" USING "status"::"public"."step_attempt_status";--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;