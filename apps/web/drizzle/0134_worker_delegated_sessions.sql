CREATE TABLE "worker_delegated_sessions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "teamId" varchar(36),
  "workerId" varchar(36) NOT NULL,
  "workerJobId" varchar(36) NOT NULL,
  "actingUserId" integer NOT NULL,
  "ownerUserId" integer NOT NULL,
  "runtimeType" "worker_runtime_type" NOT NULL,
  "scopeProfile" varchar(100) NOT NULL,
  "grantedScopesJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "manifestJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "leaseOwnerToken" varchar(128) NOT NULL,
  "tokenJti" varchar(128) NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "revokedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "worker_job_grants" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workerJobId" varchar(36) NOT NULL,
  "delegatedSessionId" varchar(36),
  "tenantId" varchar(36) NOT NULL,
  "grantType" varchar(64) NOT NULL,
  "resourceId" varchar(255),
  "resourceScopeJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "worker_delegated_sessions" ADD CONSTRAINT "worker_delegated_sessions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_delegated_sessions" ADD CONSTRAINT "worker_delegated_sessions_teamId_assistant_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."assistant_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_delegated_sessions" ADD CONSTRAINT "worker_delegated_sessions_workerId_workers_id_fk" FOREIGN KEY ("workerId") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_delegated_sessions" ADD CONSTRAINT "worker_delegated_sessions_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_delegated_sessions" ADD CONSTRAINT "worker_delegated_sessions_actingUserId_users_id_fk" FOREIGN KEY ("actingUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_delegated_sessions" ADD CONSTRAINT "worker_delegated_sessions_ownerUserId_users_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "worker_job_grants" ADD CONSTRAINT "worker_job_grants_workerJobId_worker_jobs_id_fk" FOREIGN KEY ("workerJobId") REFERENCES "public"."worker_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_job_grants" ADD CONSTRAINT "worker_job_grants_delegatedSessionId_worker_delegated_sessions_id_fk" FOREIGN KEY ("delegatedSessionId") REFERENCES "public"."worker_delegated_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_job_grants" ADD CONSTRAINT "worker_job_grants_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "worker_delegated_sessions_token_jti_unique" ON "worker_delegated_sessions" USING btree ("tokenJti");--> statement-breakpoint
CREATE INDEX "worker_delegated_sessions_job_idx" ON "worker_delegated_sessions" USING btree ("workerJobId","expiresAt");--> statement-breakpoint
CREATE INDEX "worker_delegated_sessions_worker_idx" ON "worker_delegated_sessions" USING btree ("workerId","expiresAt");--> statement-breakpoint
CREATE INDEX "worker_delegated_sessions_owner_idx" ON "worker_delegated_sessions" USING btree ("ownerUserId","expiresAt");--> statement-breakpoint
CREATE INDEX "worker_job_grants_job_type_idx" ON "worker_job_grants" USING btree ("workerJobId","grantType");--> statement-breakpoint
CREATE INDEX "worker_job_grants_session_type_idx" ON "worker_job_grants" USING btree ("delegatedSessionId","grantType");--> statement-breakpoint
CREATE INDEX "worker_job_grants_resource_idx" ON "worker_job_grants" USING btree ("grantType","resourceId");--> statement-breakpoint
