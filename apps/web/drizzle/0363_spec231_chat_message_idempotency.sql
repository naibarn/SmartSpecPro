SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "messages"
  ADD COLUMN "inferenceIdempotencyHash" varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX "messages_inference_idempotency_hash_unique"
  ON "messages" ("inferenceIdempotencyHash")
  WHERE "inferenceIdempotencyHash" IS NOT NULL;
