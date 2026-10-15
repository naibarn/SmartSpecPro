ALTER TYPE "public"."worker_runtime_type" ADD VALUE 'external_runtime';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_defaultPersonaId_persona_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "worker_job_events" ADD COLUMN "workerJobAttempt" integer;--> statement-breakpoint
ALTER TABLE "worker_job_events" ADD COLUMN "leaseFencingVersion" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_defaultPersonaId_persona_templates_id_fk" FOREIGN KEY ("defaultPersonaId") REFERENCES "public"."persona_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_created_at" ON "users" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_users_last_signed_in" ON "users" USING btree ("lastSignedIn");--> statement-breakpoint
CREATE INDEX "idx_users_plan" ON "users" USING btree ("plan");