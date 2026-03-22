ALTER TABLE "automation_handoffs"
  ADD COLUMN "idempotencyKey" varchar(64) NOT NULL DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN "dispatchTokenHash" varchar(64);
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN "callbackNonce" varchar(64);
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN "callbackDeadlineAt" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN "attemptCount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "automation_handoffs"
  ADD COLUMN "lastAttemptAt" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_handoffs_run_idempotency_idx"
  ON "automation_handoffs" USING btree ("runId", "idempotencyKey");
