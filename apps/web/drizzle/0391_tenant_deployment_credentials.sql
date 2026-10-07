CREATE TABLE "provider_deployment_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "projectId" varchar(100) NOT NULL,
  "environment" varchar(32) NOT NULL,
  "provider" varchar(64) NOT NULL,
  "credentialRef" varchar(255) NOT NULL UNIQUE,
  "encryptedSecret" text NOT NULL,
  "status" varchar(16) DEFAULT 'CONFIGURED' NOT NULL,
  "revokedAt" timestamptz,
  "createdBy" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updatedBy" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "provider_deployment_credentials_status_check"
    CHECK ("status" IN ('CONFIGURED', 'REVOKED', 'UNAVAILABLE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_deployment_credentials_scope_unique"
  ON "provider_deployment_credentials" USING btree ("tenantId", "projectId", "environment", "provider");
