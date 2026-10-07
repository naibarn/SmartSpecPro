CREATE TABLE "provider_deployment_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "projectId" varchar(100) NOT NULL,
  "environment" varchar(32) NOT NULL,
  "provider" varchar(64) NOT NULL,
  "deploymentTargetId" varchar(160) NOT NULL,
  "accountRef" varchar(255),
  "workerRef" varchar(255),
  "containerApplicationRef" varchar(255),
  "credentialRef" varchar(255) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "provenance" varchar(500) NOT NULL,
  "region" varchar(100),
  "runtimePolicy" varchar(160),
  "verificationVersion" integer DEFAULT 1 NOT NULL,
  "lastVerifiedAt" timestamp with time zone,
  "createdBy" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updatedBy" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "provider_deployment_targets_identity_nonempty" CHECK (
    length(trim("projectId")) > 0 AND length(trim("environment")) > 0 AND
    length(trim("provider")) > 0 AND length(trim("deploymentTargetId")) > 0 AND
    length(trim("credentialRef")) > 0 AND length(trim("provenance")) > 0
  ),
  CONSTRAINT "provider_deployment_targets_verification_version_positive" CHECK ("verificationVersion" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_deployment_targets_active_identity_unique"
  ON "provider_deployment_targets" USING btree ("tenantId", "projectId", "environment", "provider")
  WHERE "enabled" = true;
--> statement-breakpoint
CREATE INDEX "provider_deployment_targets_project_idx"
  ON "provider_deployment_targets" USING btree ("tenantId", "projectId", "environment");
--> statement-breakpoint
CREATE UNIQUE INDEX "api_audit_migration_receipt_phase_idempotency_unique"
  ON "api_audit_events" USING btree (("metadata"->>'idempotencyKey'), ("metadata"->>'phase'))
  WHERE "eventType" = 'migration_execution_receipt';
