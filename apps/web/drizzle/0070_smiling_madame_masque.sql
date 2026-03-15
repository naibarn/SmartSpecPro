CREATE TYPE "public"."content_automation_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'export_failed');--> statement-breakpoint
CREATE TYPE "public"."content_spec_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."live_browser_actor_type" AS ENUM('agent', 'user', 'system', 'policy');--> statement-breakpoint
CREATE TYPE "public"."live_browser_assist_request_type" AS ENUM('decision', 'field_input', 'review_page', 'takeover_required');--> statement-breakpoint
CREATE TYPE "public"."live_browser_control_mode" AS ENUM('observe', 'approve_only', 'takeover', 'agent_control');--> statement-breakpoint
CREATE TYPE "public"."live_browser_event_type" AS ENUM('session_created', 'session_state_changed', 'stream_ready', 'frame_updated', 'url_changed', 'command_queued', 'command_started', 'command_completed', 'command_failed', 'assist_requested', 'assist_resolved', 'approval_requested', 'approval_resolved', 'takeover_started', 'takeover_lease_expiring', 'takeover_ended', 'incident', 'agent_started', 'agent_resumed', 'navigation_completed', 'session_completed', 'session_failed');--> statement-breakpoint
CREATE TYPE "public"."live_browser_session_status" AS ENUM('created', 'provisioning', 'ready', 'agent_running', 'waiting_for_human', 'human_controlling', 'waiting_for_runtime_recovery', 'failed_recovery_required', 'completed', 'cancelled', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."live_browser_source_type" AS ENUM('automation', 'workflow', 'agency');--> statement-breakpoint
CREATE TABLE "content_automation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"spec_id" integer NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"schedule_item_index" integer DEFAULT 0 NOT NULL,
	"status" "content_automation_run_status" DEFAULT 'pending' NOT NULL,
	"topics_resolved" jsonb DEFAULT '[]'::jsonb,
	"items_requested" integer DEFAULT 0 NOT NULL,
	"items_completed" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"output_artifacts" jsonb DEFAULT '[]'::jsonb,
	"export_urls" jsonb DEFAULT '[]'::jsonb,
	"item_errors" jsonb DEFAULT '[]'::jsonb,
	"credits_used" numeric(10, 4) DEFAULT '0',
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_specs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"spec_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_spec_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_run" timestamp with time zone,
	"last_run" timestamp with time zone,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"total_items_created" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"webhook_secret_encrypted" text,
	"daily_credit_limit" integer,
	"monthly_credit_limit" integer,
	"credits_used_today" integer DEFAULT 0 NOT NULL,
	"credits_used_month" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
ALTER TABLE "agencies" ADD COLUMN "sourceTemplateId" varchar(36);--> statement-breakpoint
ALTER TABLE "content_automation_runs" ADD CONSTRAINT "content_automation_runs_spec_id_content_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."content_specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_automation_runs" ADD CONSTRAINT "content_automation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_specs" ADD CONSTRAINT "content_specs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_specs" ADD CONSTRAINT "content_specs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_assist_requests" ADD CONSTRAINT "live_browser_assist_requests_sessionId_live_browser_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."live_browser_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_assist_requests" ADD CONSTRAINT "live_browser_assist_requests_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_control_transfers" ADD CONSTRAINT "live_browser_control_transfers_sessionId_live_browser_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."live_browser_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_control_transfers" ADD CONSTRAINT "live_browser_control_transfers_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_events" ADD CONSTRAINT "live_browser_events_sessionId_live_browser_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."live_browser_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_events" ADD CONSTRAINT "live_browser_events_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_idempotency_keys" ADD CONSTRAINT "live_browser_idempotency_keys_sessionId_live_browser_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."live_browser_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_sessions" ADD CONSTRAINT "live_browser_sessions_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_browser_sessions" ADD CONSTRAINT "live_browser_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_automation_runs_spec_created_idx" ON "content_automation_runs" USING btree ("spec_id","created_at");--> statement-breakpoint
CREATE INDEX "content_automation_runs_tenant_idx" ON "content_automation_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "content_automation_runs_created_at_idx" ON "content_automation_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "content_automation_runs_status_idx" ON "content_automation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_specs_status_next_run_idx" ON "content_specs" USING btree ("status","next_run");--> statement-breakpoint
CREATE INDEX "content_specs_tenant_idx" ON "content_specs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "content_specs_user_idx" ON "content_specs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_browser_assist_requests_session_status_idx" ON "live_browser_assist_requests" USING btree ("sessionId","status");--> statement-breakpoint
CREATE INDEX "live_browser_assist_requests_session_requested_idx" ON "live_browser_assist_requests" USING btree ("sessionId","requestedAt");--> statement-breakpoint
CREATE INDEX "live_browser_control_transfers_session_created_idx" ON "live_browser_control_transfers" USING btree ("sessionId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_live_browser_events_session_cursor" ON "live_browser_events" USING btree ("sessionId","cursor");--> statement-breakpoint
CREATE INDEX "live_browser_events_session_created_idx" ON "live_browser_events" USING btree ("sessionId","createdAt");--> statement-breakpoint
CREATE INDEX "live_browser_events_session_version_idx" ON "live_browser_events" USING btree ("sessionId","sessionVersionAt");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_live_browser_idempotency_keys_session_key" ON "live_browser_idempotency_keys" USING btree ("sessionId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "live_browser_idempotency_keys_expires_idx" ON "live_browser_idempotency_keys" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "live_browser_sessions_tenant_status_idx" ON "live_browser_sessions" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "live_browser_sessions_user_activity_idx" ON "live_browser_sessions" USING btree ("userId","lastActivityAt");--> statement-breakpoint
CREATE INDEX "live_browser_sessions_runtime_owner_idx" ON "live_browser_sessions" USING btree ("runtimeOwnerId","runtimeOwnerClaimedAt");--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_sourceTemplateId_agency_templates_id_fk" FOREIGN KEY ("sourceTemplateId") REFERENCES "public"."agency_templates"("id") ON DELETE set null ON UPDATE no action;