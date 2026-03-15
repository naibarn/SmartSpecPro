DROP INDEX "automation_jobs_idempotency_idx";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "quotaHourly" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "quotaDaily" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "quotaWeekly" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "quotaMonthly" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_jobs_idempotency_idx" ON "automation_jobs" USING btree ("tenantId","idempotencyKey");