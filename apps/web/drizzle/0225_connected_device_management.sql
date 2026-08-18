CREATE TABLE IF NOT EXISTS "connected_devices" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "ownerUserId" integer NOT NULL,
  "workerId" varchar(36),
  "deviceIdHash" varchar(64) NOT NULL,
  "deviceFingerprint" varchar(16),
  "workerConnectionId" varchar(128),
  "consentId" varchar(128),
  "displayName" varchar(255) NOT NULL,
  "runtimeType" varchar(80) NOT NULL,
  "authKind" varchar(40) NOT NULL,
  "connectionMethod" varchar(40) NOT NULL,
  "platform" varchar(40),
  "architecture" varchar(40),
  "scopesJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadataJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(24) DEFAULT 'active' NOT NULL,
  "approvedAt" timestamp with time zone,
  "lastSeenAt" timestamp with time zone,
  "accessTokenExpiresAt" timestamp with time zone,
  "refreshTokenExpiresAt" timestamp with time zone,
  "revokedAt" timestamp with time zone,
  "revokedByUserId" integer,
  "revocationReason" varchar(255),
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connected_devices" ADD CONSTRAINT "connected_devices_tenant_id_fk"
  FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connected_devices" ADD CONSTRAINT "connected_devices_owner_user_id_fk"
  FOREIGN KEY ("ownerUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connected_devices" ADD CONSTRAINT "connected_devices_worker_id_fk"
  FOREIGN KEY ("workerId") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connected_devices" ADD CONSTRAINT "connected_devices_revoked_by_user_id_fk"
  FOREIGN KEY ("revokedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connected_devices_owner_binding_unique"
  ON "connected_devices" ("tenantId", "ownerUserId", "deviceIdHash", "authKind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_devices_owner_status_idx"
  ON "connected_devices" ("tenantId", "ownerUserId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_devices_worker_idx"
  ON "connected_devices" ("workerId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_devices_refresh_expiry_idx"
  ON "connected_devices" ("refreshTokenExpiresAt");
