CREATE TABLE "tenant_data_transfer_plans" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "operationId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "previewId" varchar(36) NOT NULL REFERENCES "tenant_data_transfer_previews"("id") ON DELETE RESTRICT,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "targetUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "previewFingerprint" varchar(64) NOT NULL,
  "selectionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "handlerSnapshotJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "policyJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "approvedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_data_transfer_plans_distinct_users_check"
    CHECK ("sourceUserId" <> "targetUserId")
);
--> statement-breakpoint

CREATE UNIQUE INDEX "tenant_data_transfer_plans_operation_unique"
  ON "tenant_data_transfer_plans" ("operationId");
CREATE UNIQUE INDEX "tenant_data_transfer_plans_preview_unique"
  ON "tenant_data_transfer_plans" ("previewId");
