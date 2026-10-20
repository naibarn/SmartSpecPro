DO $$
BEGIN
  IF to_regtype('public.desktop_device_health_status') IS NULL THEN
    CREATE TYPE "public"."desktop_device_health_status" AS ENUM ('online', 'offline', 'unhealthy', 'disabled');
  END IF;
  IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid = to_regtype('public.desktop_device_health_status'))
      IS DISTINCT FROM ARRAY['online', 'offline', 'unhealthy', 'disabled']::text[] THEN
    RAISE EXCEPTION 'DESKTOP_HEALTH_ENUM_INCOMPATIBLE';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public"."desktop_devices" (
  "id" varchar(36) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer,
  "displayName" varchar(255) NOT NULL,
  "machineName" varchar(255),
  "healthStatus" "public"."desktop_device_health_status" NOT NULL DEFAULT 'offline',
  "workerProjectionEnabled" boolean NOT NULL DEFAULT false,
  "projectedWorkerRuntimeType" varchar(64),
  "platform" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "capabilitiesJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "healthSummaryJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "localRootsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "packageCachePathsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "packageSyncStateJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "pendingActionsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "currentWorkspaceProfileJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastRunSummaryJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "accessState" varchar(32) NOT NULL DEFAULT 'active',
  "policyOverridesJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "policyCursor" varchar(128),
  "policyVersion" varchar(128),
  "policyExpiresAt" timestamptz,
  "warningFlagsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "enrolledAt" timestamptz NOT NULL DEFAULT now(),
  "lastSeenAt" timestamptz,
  "disabledAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "desktop_devices_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "desktop_devices_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_devices_tenant_id_idx" ON "public"."desktop_devices" ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_devices_tenant_user_idx" ON "public"."desktop_devices" ("tenantId", "userId");
