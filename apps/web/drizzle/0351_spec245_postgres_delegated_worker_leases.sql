SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "delegated_worker_concurrency_leases" (
  "leaseId" varchar(36) PRIMARY KEY,
  "scopeKey" varchar(256) NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "workerId" varchar(36) NOT NULL,
  "workerJobId" varchar(36) NOT NULL,
  "actionClass" varchar(16) NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "delegated_worker_concurrency_leases_action_class_check"
    CHECK ("actionClass" IN ('read', 'compute', 'media', 'mcp_write'))
);
--> statement-breakpoint
CREATE INDEX "delegated_worker_concurrency_leases_scope_expiry_idx"
  ON "delegated_worker_concurrency_leases" ("scopeKey", "expiresAt");
