CREATE TYPE "public"."agent_event_category" AS ENUM('status_change', 'communication', 'tool_use', 'memory_op', 'artifact_op', 'handoff', 'approval', 'error');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'warning', 'error', 'critical');--> statement-breakpoint
CREATE TYPE "public"."room_message_recipient_type" AS ENUM('all', 'assistant', 'subgroup', 'user');--> statement-breakpoint
CREATE TYPE "public"."room_message_sender_type" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."room_message_turn_type" AS ENUM('discussion', 'handoff', 'review', 'decision', 'execution_update', 'summary');--> statement-breakpoint
CREATE TYPE "public"."room_message_visibility" AS ENUM('transparent', 'milestone', 'summary_only', 'private_internal');--> statement-breakpoint
CREATE TYPE "public"."room_participant_type" AS ENUM('user', 'assistant', 'observer');--> statement-breakpoint
CREATE TYPE "public"."team_room_status" AS ENUM('active', 'archived', 'paused');--> statement-breakpoint
CREATE TYPE "public"."team_room_type" AS ENUM('direct', 'team', 'auto_team', 'job_review');--> statement-breakpoint
CREATE TYPE "public"."team_run_execution_mode" AS ENUM('team_chat', 'auto_team', 'review');--> statement-breakpoint
CREATE TYPE "public"."team_run_status" AS ENUM('queued', 'running', 'paused', 'completed', 'failed', 'stopped');--> statement-breakpoint
CREATE TABLE "agent_activity_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"teamId" varchar(36) NOT NULL,
	"roomId" varchar(36) NOT NULL,
	"runId" varchar(36) NOT NULL,
	"assistantId" varchar(36),
	"eventType" text NOT NULL,
	"eventCategory" "agent_event_category" NOT NULL,
	"visibility" "room_message_visibility" DEFAULT 'transparent' NOT NULL,
	"summary" text,
	"detailJson" jsonb,
	"tokenUsageSnapshot" integer,
	"costSnapshot" numeric(12, 4),
	"durationMs" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_summaries" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runId" varchar(36) NOT NULL,
	"assistantId" varchar(36) NOT NULL,
	"turnCount" integer DEFAULT 0 NOT NULL,
	"totalInputTokens" integer DEFAULT 0 NOT NULL,
	"totalOutputTokens" integer DEFAULT 0 NOT NULL,
	"totalCostCredits" numeric(12, 4) DEFAULT '0' NOT NULL,
	"toolCallCount" integer DEFAULT 0 NOT NULL,
	"toolSuccessCount" integer DEFAULT 0 NOT NULL,
	"toolFailureCount" integer DEFAULT 0 NOT NULL,
	"memoriesRead" integer DEFAULT 0 NOT NULL,
	"memoriesWritten" integer DEFAULT 0 NOT NULL,
	"memoriesPromoted" integer DEFAULT 0 NOT NULL,
	"artifactsCreated" integer DEFAULT 0 NOT NULL,
	"handoffsSent" integer DEFAULT 0 NOT NULL,
	"handoffsReceived" integer DEFAULT 0 NOT NULL,
	"errorCount" integer DEFAULT 0 NOT NULL,
	"activeDurationMs" integer DEFAULT 0 NOT NULL,
	"waitDurationMs" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrator_notifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"teamId" varchar(36),
	"roomId" varchar(36),
	"runId" varchar(36),
	"notificationType" text NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"actionUrl" text,
	"isRead" boolean DEFAULT false NOT NULL,
	"isDismissed" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"readAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "run_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runId" varchar(36) NOT NULL,
	"capturedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"activeAssistantId" varchar(36),
	"agentStatusesJson" jsonb,
	"tokenUsageJson" jsonb,
	"costJson" jsonb,
	"artifactCountJson" jsonb,
	"pendingApprovalsCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_room_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roomId" varchar(36) NOT NULL,
	"runId" varchar(36),
	"senderType" "room_message_sender_type" NOT NULL,
	"senderUserId" integer,
	"senderAssistantId" varchar(36),
	"recipientType" "room_message_recipient_type" DEFAULT 'all' NOT NULL,
	"recipientAssistantId" varchar(36),
	"recipientGroupJson" jsonb,
	"turnType" "room_message_turn_type" DEFAULT 'discussion' NOT NULL,
	"visibility" "room_message_visibility" DEFAULT 'transparent' NOT NULL,
	"content" text NOT NULL,
	"summaryContent" text,
	"artifactRefsJson" jsonb,
	"memoryRefsJson" jsonb,
	"metadataJson" jsonb,
	"tokenUsageJson" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_room_participants" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roomId" varchar(36) NOT NULL,
	"participantType" "room_participant_type" NOT NULL,
	"participantUserId" integer,
	"participantAssistantId" varchar(36),
	"participantLabel" varchar(255),
	"roleInRoom" varchar(100),
	"isMuted" boolean DEFAULT false NOT NULL,
	"canWriteSharedMemory" boolean DEFAULT true NOT NULL,
	"joinedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_rooms" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"teamId" varchar(36) NOT NULL,
	"orchestratorUserId" integer NOT NULL,
	"backingAgencyConversationId" varchar(36),
	"roomType" "team_room_type" NOT NULL,
	"title" varchar(255),
	"goalPrompt" text,
	"projectId" integer,
	"viewMode" varchar(30) DEFAULT 'transparent',
	"summaryMode" varchar(30),
	"autonomyLevel" varchar(30),
	"status" "team_room_status" DEFAULT 'active' NOT NULL,
	"lastRunId" varchar(36),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roomId" varchar(36) NOT NULL,
	"teamId" varchar(36) NOT NULL,
	"backingAgencyRunId" varchar(36),
	"initiatedByUserId" integer NOT NULL,
	"executionMode" "team_run_execution_mode" NOT NULL,
	"objective" text,
	"constraintsJson" jsonb,
	"status" "team_run_status" DEFAULT 'queued' NOT NULL,
	"activeAssistantId" varchar(36),
	"stopPolicyJson" jsonb,
	"approvalPolicyJson" jsonb,
	"budgetSnapshotJson" jsonb,
	"summaryArtifactId" varchar(36),
	"stopReason" text,
	"startedAt" timestamp with time zone,
	"endedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_run_summaries" ADD CONSTRAINT "agent_run_summaries_runId_team_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."team_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_summaries" ADD CONSTRAINT "agent_run_summaries_assistantId_assistant_profiles_id_fk" FOREIGN KEY ("assistantId") REFERENCES "public"."assistant_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_notifications" ADD CONSTRAINT "orchestrator_notifications_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestrator_notifications" ADD CONSTRAINT "orchestrator_notifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_snapshots" ADD CONSTRAINT "run_snapshots_runId_team_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."team_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_room_messages" ADD CONSTRAINT "team_room_messages_roomId_team_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."team_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_room_messages" ADD CONSTRAINT "team_room_messages_senderUserId_users_id_fk" FOREIGN KEY ("senderUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_room_messages" ADD CONSTRAINT "team_room_messages_senderAssistantId_assistant_profiles_id_fk" FOREIGN KEY ("senderAssistantId") REFERENCES "public"."assistant_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_room_participants" ADD CONSTRAINT "team_room_participants_roomId_team_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."team_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_room_participants" ADD CONSTRAINT "team_room_participants_participantUserId_users_id_fk" FOREIGN KEY ("participantUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_room_participants" ADD CONSTRAINT "team_room_participants_participantAssistantId_assistant_profiles_id_fk" FOREIGN KEY ("participantAssistantId") REFERENCES "public"."assistant_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_teamId_assistant_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."assistant_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_orchestratorUserId_users_id_fk" FOREIGN KEY ("orchestratorUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_backingAgencyConversationId_agency_conversations_id_fk" FOREIGN KEY ("backingAgencyConversationId") REFERENCES "public"."agency_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_runs" ADD CONSTRAINT "team_runs_roomId_team_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."team_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_runs" ADD CONSTRAINT "team_runs_teamId_assistant_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."assistant_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_runs" ADD CONSTRAINT "team_runs_initiatedByUserId_users_id_fk" FOREIGN KEY ("initiatedByUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_activity_events_run_created_idx" ON "agent_activity_events" USING btree ("runId","createdAt");--> statement-breakpoint
CREATE INDEX "agent_activity_events_assistant_created_idx" ON "agent_activity_events" USING btree ("assistantId","createdAt");--> statement-breakpoint
CREATE INDEX "agent_run_summaries_run_idx" ON "agent_run_summaries" USING btree ("runId");--> statement-breakpoint
CREATE INDEX "orchestrator_notifications_user_unread_idx" ON "orchestrator_notifications" USING btree ("userId","isRead","createdAt");--> statement-breakpoint
CREATE INDEX "orchestrator_notifications_tenant_created_idx" ON "orchestrator_notifications" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX "run_snapshots_run_captured_idx" ON "run_snapshots" USING btree ("runId","capturedAt");--> statement-breakpoint
CREATE INDEX "team_room_messages_room_created_idx" ON "team_room_messages" USING btree ("roomId","createdAt");--> statement-breakpoint
CREATE INDEX "team_room_messages_run_created_idx" ON "team_room_messages" USING btree ("runId","createdAt");--> statement-breakpoint
CREATE INDEX "team_room_participants_room_idx" ON "team_room_participants" USING btree ("roomId");--> statement-breakpoint
CREATE INDEX "team_rooms_tenant_team_idx" ON "team_rooms" USING btree ("tenantId","teamId");--> statement-breakpoint
CREATE INDEX "team_rooms_orchestrator_idx" ON "team_rooms" USING btree ("orchestratorUserId");--> statement-breakpoint
CREATE INDEX "team_runs_room_status_idx" ON "team_runs" USING btree ("roomId","status");--> statement-breakpoint
CREATE INDEX "team_runs_team_status_idx" ON "team_runs" USING btree ("teamId","status");--> statement-breakpoint
CREATE INDEX "team_runs_initiated_by_idx" ON "team_runs" USING btree ("initiatedByUserId");