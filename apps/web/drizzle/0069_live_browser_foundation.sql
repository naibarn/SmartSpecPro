CREATE TYPE "live_browser_source_type" AS ENUM('automation', 'workflow', 'agency');
--> statement-breakpoint
CREATE TYPE "live_browser_session_status" AS ENUM('created', 'provisioning', 'ready', 'agent_running', 'waiting_for_human', 'human_controlling', 'waiting_for_runtime_recovery', 'failed_recovery_required', 'completed', 'cancelled', 'failed', 'expired');
--> statement-breakpoint
CREATE TYPE "live_browser_control_mode" AS ENUM('observe', 'approve_only', 'takeover', 'agent_control');
--> statement-breakpoint
CREATE TYPE "live_browser_assist_request_type" AS ENUM('decision', 'field_input', 'review_page', 'takeover_required');
--> statement-breakpoint
CREATE TYPE "live_browser_actor_type" AS ENUM('agent', 'user', 'system', 'policy');
--> statement-breakpoint
CREATE TYPE "live_browser_event_type" AS ENUM('session_created', 'session_state_changed', 'stream_ready', 'frame_updated', 'url_changed', 'command_queued', 'command_started', 'command_completed', 'command_failed', 'assist_requested', 'assist_resolved', 'approval_requested', 'approval_resolved', 'takeover_started', 'takeover_lease_expiring', 'takeover_ended', 'incident', 'agent_started', 'agent_resumed', 'navigation_completed', 'session_completed', 'session_failed');
--> statement-breakpoint
CREATE TABLE "live_browser_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"sourceType" "live_browser_source_type" NOT NULL,
	"sourceId" varchar(128),
	"status" "live_browser_session_status" DEFAULT 'created' NOT NULL,
	"controlMode" "live_browser_control_mode" DEFAULT 'observe' NOT NULL,
	"sessionVersion" integer DEFAULT 1 NOT NULL,
	"controllerActorType" "live_browser_actor_type",
	"controllerActorId" varchar(64),
	"controllerConnectionId" varchar(128),
	"controllerLeaseExpiresAt" timestamp with time zone,
	"runtimeOwnerId" varchar(128),
	"runtimeOwnerClaimedAt" timestamp with time zone,
	"pauseReason" varchar(128),
	"pendingAssistRequestId" varchar(64),
	"pendingApprovalRequestId" varchar(64),
	"policyContextJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"browserContextRef" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"streamRef" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activeTabCount" integer DEFAULT 1 NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastActivityAt" timestamp with time zone DEFAULT now() NOT NULL,
	"endedAt" timestamp with time zone,
	"endReason" varchar(128)
);
--> statement-breakpoint
ALTER TABLE "live_browser_sessions" ADD CONSTRAINT "live_browser_sessions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_browser_sessions" ADD CONSTRAINT "live_browser_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "live_browser_idempotency_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"commandType" varchar(64) NOT NULL,
	"responseJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_browser_idempotency_keys" ADD CONSTRAINT "live_browser_idempotency_keys_sessionId_live_browser_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."live_browser_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "live_browser_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"sessionVersionAt" integer NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"eventType" "live_browser_event_type" NOT NULL,
	"actorType" "live_browser_actor_type" NOT NULL,
	"actorId" varchar(64),
	"payloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"screenshotRef" varchar(255),
	"cursor" varchar(255) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_browser_events" ADD CONSTRAINT "live_browser_events_sessionId_live_browser_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."live_browser_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_browser_events" ADD CONSTRAINT "live_browser_events_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "live_browser_assist_requests" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"sessionVersionAt" integer NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"requestType" "live_browser_assist_request_type" NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"prompt" text NOT NULL,
	"contextJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"responseJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolvedSessionVersionAt" integer,
	"requestedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "live_browser_assist_requests" ADD CONSTRAINT "live_browser_assist_requests_sessionId_live_browser_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."live_browser_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_browser_assist_requests" ADD CONSTRAINT "live_browser_assist_requests_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "live_browser_control_transfers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"sessionVersionAt" integer NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"fromActorType" "live_browser_actor_type" NOT NULL,
	"fromActorId" varchar(64),
	"toActorType" "live_browser_actor_type" NOT NULL,
	"toActorId" varchar(64),
	"reason" varchar(128) NOT NULL,
	"policyCheckHash" varchar(128),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_browser_control_transfers" ADD CONSTRAINT "live_browser_control_transfers_sessionId_live_browser_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."live_browser_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_browser_control_transfers" ADD CONSTRAINT "live_browser_control_transfers_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "live_browser_sessions_tenant_status_idx" ON "live_browser_sessions" USING btree ("tenantId","status");
--> statement-breakpoint
CREATE INDEX "live_browser_sessions_user_activity_idx" ON "live_browser_sessions" USING btree ("userId","lastActivityAt");
--> statement-breakpoint
CREATE INDEX "live_browser_sessions_runtime_owner_idx" ON "live_browser_sessions" USING btree ("runtimeOwnerId","runtimeOwnerClaimedAt");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_live_browser_idempotency_keys_session_key" ON "live_browser_idempotency_keys" USING btree ("sessionId","idempotencyKey");
--> statement-breakpoint
CREATE INDEX "live_browser_idempotency_keys_expires_idx" ON "live_browser_idempotency_keys" USING btree ("expiresAt");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_live_browser_events_session_cursor" ON "live_browser_events" USING btree ("sessionId","cursor");
--> statement-breakpoint
CREATE INDEX "live_browser_events_session_created_idx" ON "live_browser_events" USING btree ("sessionId","createdAt");
--> statement-breakpoint
CREATE INDEX "live_browser_events_session_version_idx" ON "live_browser_events" USING btree ("sessionId","sessionVersionAt");
--> statement-breakpoint
CREATE INDEX "live_browser_assist_requests_session_status_idx" ON "live_browser_assist_requests" USING btree ("sessionId","status");
--> statement-breakpoint
CREATE INDEX "live_browser_assist_requests_session_requested_idx" ON "live_browser_assist_requests" USING btree ("sessionId","requestedAt");
--> statement-breakpoint
CREATE INDEX "live_browser_control_transfers_session_created_idx" ON "live_browser_control_transfers" USING btree ("sessionId","createdAt");
