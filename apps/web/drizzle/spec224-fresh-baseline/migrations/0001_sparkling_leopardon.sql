CREATE TABLE "revoked_token_jtis" (
	"jti_hash" varchar(64) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_capability_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runnerId" varchar(160) NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"revision" varchar(128) NOT NULL,
	"idempotencyKey" varchar(200) NOT NULL,
	"observedAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"snapshotJson" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_nodes" (
	"runnerId" varchar(160) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"ownerUserId" integer,
	"nodeKind" varchar(32) NOT NULL,
	"profile" varchar(32) NOT NULL,
	"deviceId" varchar(160),
	"displayName" varchar(255) NOT NULL,
	"trustState" varchar(32) DEFAULT 'pending' NOT NULL,
	"status" varchar(32) DEFAULT 'offline' NOT NULL,
	"currentSnapshotRevision" varchar(128),
	"currentSnapshotJson" jsonb,
	"snapshotObservedAt" timestamp with time zone,
	"snapshotExpiresAt" timestamp with time zone,
	"activeSessionId" varchar(160),
	"lastSeenAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runner_capability_snapshots" ADD CONSTRAINT "runner_capability_snapshots_runnerId_runner_nodes_runnerId_fk" FOREIGN KEY ("runnerId") REFERENCES "public"."runner_nodes"("runnerId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_capability_snapshots" ADD CONSTRAINT "runner_capability_snapshots_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_nodes" ADD CONSTRAINT "runner_nodes_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_nodes" ADD CONSTRAINT "runner_nodes_ownerUserId_users_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revoked_token_jtis_expires_at_idx" ON "revoked_token_jtis" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runner_snapshots_runner_revision_unique" ON "runner_capability_snapshots" USING btree ("runnerId","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "runner_snapshots_runner_idempotency_unique" ON "runner_capability_snapshots" USING btree ("runnerId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "runner_snapshots_tenant_created_idx" ON "runner_capability_snapshots" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "runner_nodes_tenant_status_idx" ON "runner_nodes" USING btree ("tenantId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "runner_nodes_tenant_device_unique" ON "runner_nodes" USING btree ("tenantId","deviceId");