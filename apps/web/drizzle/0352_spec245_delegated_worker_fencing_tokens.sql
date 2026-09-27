SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
ALTER TABLE "delegated_worker_concurrency_leases"
  ADD COLUMN "fencingToken" bigserial NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "delegated_worker_concurrency_leases_fencing_token_idx"
  ON "delegated_worker_concurrency_leases" ("fencingToken");
