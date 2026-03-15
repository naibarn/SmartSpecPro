CREATE TABLE "api_keys" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"keyPrefix" varchar(16) NOT NULL,
	"keyHash" varchar(128) NOT NULL,
	"scopes" json NOT NULL,
	"rateLimit" integer DEFAULT 60 NOT NULL,
	"creditLimit" integer,
	"expiresAt" timestamp with time zone,
	"lastUsedAt" timestamp with time zone,
	"isActive" boolean DEFAULT true NOT NULL,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_webhook_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"webhookEndpointId" varchar(36) NOT NULL,
	"eventType" varchar(50) NOT NULL,
	"payload" json NOT NULL,
	"statusCode" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"deliveredAt" timestamp with time zone,
	"error" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_webhook_endpoints" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"apiKeyId" varchar(36),
	"url" varchar(2048) NOT NULL,
	"secretEncrypted" text NOT NULL,
	"events" json NOT NULL,
	"retryPolicy" varchar(20) DEFAULT 'exponential' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"lastDeliveredAt" timestamp with time zone,
	"failureCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"apiKeyId" varchar(36) NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"params" json,
	"result" json,
	"error" json,
	"progress" integer DEFAULT 0 NOT NULL,
	"creditsReserved" integer DEFAULT 0 NOT NULL,
	"creditsUsed" integer DEFAULT 0 NOT NULL,
	"callbackUrl" varchar(2048),
	"callbackSecretEncrypted" text,
	"parentJobId" varchar(36),
	"stepIndex" integer,
	"traceId" varchar(36),
	"idempotencyKey" varchar(64),
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "public_api_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"apiKeyId" varchar(36) NOT NULL,
	"traceId" varchar(36),
	"method" varchar(10) NOT NULL,
	"path" varchar(255) NOT NULL,
	"statusCode" integer,
	"creditsUsed" integer DEFAULT 0,
	"latencyMs" integer,
	"ip" varchar(45),
	"userAgent" text,
	"requestMeta" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_conversations" ADD COLUMN "source" varchar(20) DEFAULT 'web';--> statement-breakpoint
ALTER TABLE "agency_conversations" ADD COLUMN "apiKeyId" varchar(36);--> statement-breakpoint
ALTER TABLE "agency_conversations" ADD COLUMN "expiresAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "source" varchar(20) DEFAULT 'web';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "apiKeyId" varchar(36);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "expiresAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_usage_log" ADD COLUMN "apiKeyId" varchar(36);--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_webhook_deliveries" ADD CONSTRAINT "api_webhook_deliveries_webhookEndpointId_api_webhook_endpoints_id_fk" FOREIGN KEY ("webhookEndpointId") REFERENCES "public"."api_webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_webhook_endpoints" ADD CONSTRAINT "api_webhook_endpoints_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_webhook_endpoints" ADD CONSTRAINT "api_webhook_endpoints_apiKeyId_api_keys_id_fk" FOREIGN KEY ("apiKeyId") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("keyHash");--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "api_webhook_endpoints_tenant_idx" ON "api_webhook_endpoints" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "api_webhook_endpoints_api_key_idx" ON "api_webhook_endpoints" USING btree ("apiKeyId");--> statement-breakpoint
CREATE INDEX "automation_jobs_tenant_status_idx" ON "automation_jobs" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "automation_jobs_api_key_idx" ON "automation_jobs" USING btree ("apiKeyId");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_jobs_idempotency_idx" ON "automation_jobs" USING btree ("idempotencyKey");--> statement-breakpoint
CREATE INDEX "automation_jobs_parent_idx" ON "automation_jobs" USING btree ("parentJobId");--> statement-breakpoint
CREATE INDEX "public_api_audit_log_tenant_created_idx" ON "public_api_audit_log" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "public_api_audit_log_api_key_idx" ON "public_api_audit_log" USING btree ("apiKeyId");--> statement-breakpoint
CREATE INDEX "public_api_audit_log_trace_idx" ON "public_api_audit_log" USING btree ("traceId");