CREATE TABLE IF NOT EXISTS "upload_post_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL,
  "apiKeyEncrypted" text NOT NULL,
  "apiKeyFingerprint" varchar(128) NOT NULL,
  "apiKeyHint" varchar(12),
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "healthStatus" varchar(20) NOT NULL DEFAULT 'unknown',
  "disclosureAcceptedAt" timestamp with time zone,
  "disclosurePolicyVersion" varchar(32),
  "consentAcknowledgedByUserId" integer,
  "handshakeNonce" varchar(255),
  "handshakeNonceExpiresAt" timestamp with time zone,
  "lastVerifiedAt" timestamp with time zone,
  "lastHealthCheckAt" timestamp with time zone,
  "quotaRemaining" integer,
  "quotaLimit" integer,
  "quotaResetAt" timestamp with time zone,
  "queueSettings" jsonb,
  "metadata" jsonb,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "upload_post_connections_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "upload_post_connections_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "upload_post_connections_consent_userId_users_id_fk" FOREIGN KEY ("consentAcknowledgedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_connections_tenant" ON "upload_post_connections" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_connections_user" ON "upload_post_connections" USING btree ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_connections_status" ON "upload_post_connections" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_upload_post_connections_fingerprint" ON "upload_post_connections" USING btree ("tenantId", "apiKeyFingerprint");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "upload_post_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "connectionId" integer NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL,
  "platform" varchar(50) NOT NULL,
  "platformPageId" varchar(255) NOT NULL,
  "displayName" varchar(500),
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "metadata" jsonb,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "upload_post_profiles_connectionId_upload_post_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "public"."upload_post_connections"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "upload_post_profiles_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "upload_post_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_profiles_tenant" ON "upload_post_profiles" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_profiles_connection" ON "upload_post_profiles" USING btree ("connectionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_profiles_user" ON "upload_post_profiles" USING btree ("userId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_upload_post_profiles_unique" ON "upload_post_profiles" USING btree ("connectionId", "platform", "platformPageId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "upload_post_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL,
  "connectionId" integer NOT NULL,
  "profileId" integer,
  "platform" varchar(50) NOT NULL,
  "queueKey" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "contentText" text,
  "contentLink" text,
  "mediaRefs" jsonb,
  "scheduledAt" timestamp with time zone,
  "publishedAt" timestamp with time zone,
  "providerJobId" varchar(255),
  "platformResults" jsonb,
  "metadata" jsonb,
  "metadataClearedAt" timestamp with time zone,
  "errorMessage" text,
  "lastSyncedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "upload_post_jobs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "upload_post_jobs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "upload_post_jobs_connectionId_upload_post_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "public"."upload_post_connections"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "upload_post_jobs_profileId_upload_post_profiles_id_fk" FOREIGN KEY ("profileId") REFERENCES "public"."upload_post_profiles"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_jobs_tenant_status" ON "upload_post_jobs" USING btree ("tenantId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_jobs_connection_status" ON "upload_post_jobs" USING btree ("connectionId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_post_jobs_tenant_scheduled" ON "upload_post_jobs" USING btree ("tenantId", "scheduledAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_upload_post_jobs_queue_key" ON "upload_post_jobs" USING btree ("tenantId", "queueKey");
