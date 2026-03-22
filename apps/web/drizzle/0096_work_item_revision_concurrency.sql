CREATE TYPE "public"."work_item_status" AS ENUM('planned', 'in_progress', 'in_review', 'needs_revision', 'awaiting_approval', 'completed', 'failed', 'blocked', 'cancelled', 'superseded');
--> statement-breakpoint
CREATE TYPE "public"."work_item_priority" AS ENUM('low', 'normal', 'high', 'urgent');
--> statement-breakpoint
CREATE TYPE "public"."work_item_risk_class" AS ENUM('low', 'medium', 'high', 'critical');
--> statement-breakpoint
CREATE TYPE "public"."work_item_approval_state" AS ENUM('not_required', 'pending', 'approved', 'rejected');
--> statement-breakpoint
CREATE TABLE "team_work_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "teamId" varchar(36) NOT NULL,
  "roomId" varchar(36) NOT NULL,
  "runId" varchar(36),
  "routineId" varchar(36),
  "sourceType" varchar(50) DEFAULT 'manual' NOT NULL,
  "sourceRef" varchar(255),
  "title" varchar(500) NOT NULL,
  "objective" text,
  "status" "work_item_status" DEFAULT 'planned' NOT NULL,
  "revisionVersion" integer DEFAULT 1 NOT NULL,
  "threadRootMessageId" varchar(36),
  "activeDraftArtifactId" varchar(36),
  "priority" "work_item_priority" DEFAULT 'normal' NOT NULL,
  "riskClass" "work_item_risk_class" DEFAULT 'medium' NOT NULL,
  "assignedMemberId" varchar(36),
  "reviewerMemberId" varchar(36),
  "approverMemberId" varchar(36),
  "lockOwnerMemberId" varchar(36),
  "lockExpiresAt" timestamp with time zone,
  "parentWorkItemId" varchar(36),
  "supersededByWorkItemId" varchar(36),
  "artifactRefsJson" jsonb,
  "approvalState" "work_item_approval_state" DEFAULT 'pending' NOT NULL,
  "carryOverReason" text,
  "dueAt" timestamp with time zone,
  "completedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_work_items" ADD CONSTRAINT "team_work_items_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_work_items" ADD CONSTRAINT "team_work_items_teamId_assistant_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."assistant_teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_work_items" ADD CONSTRAINT "team_work_items_roomId_team_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."team_rooms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_work_items" ADD CONSTRAINT "team_work_items_runId_team_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."team_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_work_items" ADD CONSTRAINT "team_work_items_assignedMemberId_assistant_profiles_id_fk" FOREIGN KEY ("assignedMemberId") REFERENCES "public"."assistant_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_work_items" ADD CONSTRAINT "team_work_items_reviewerMemberId_assistant_profiles_id_fk" FOREIGN KEY ("reviewerMemberId") REFERENCES "public"."assistant_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_work_items" ADD CONSTRAINT "team_work_items_approverMemberId_assistant_profiles_id_fk" FOREIGN KEY ("approverMemberId") REFERENCES "public"."assistant_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_work_items" ADD CONSTRAINT "team_work_items_lockOwnerMemberId_assistant_profiles_id_fk" FOREIGN KEY ("lockOwnerMemberId") REFERENCES "public"."assistant_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "work_item_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workItemId" varchar(36) NOT NULL,
  "roomId" varchar(36) NOT NULL,
  "runId" varchar(36),
  "actorAssistantId" varchar(36),
  "actorUserId" integer,
  "eventType" varchar(50) NOT NULL,
  "fromStatus" "work_item_status",
  "toStatus" "work_item_status",
  "revisionVersion" integer,
  "detailJson" jsonb,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_workItemId_team_work_items_id_fk" FOREIGN KEY ("workItemId") REFERENCES "public"."team_work_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_roomId_team_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."team_rooms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_runId_team_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."team_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_actorAssistantId_assistant_profiles_id_fk" FOREIGN KEY ("actorAssistantId") REFERENCES "public"."assistant_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_events" ADD CONSTRAINT "work_item_events_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "team_work_items_team_status_idx" ON "team_work_items" USING btree ("teamId","status","updatedAt");
--> statement-breakpoint
CREATE INDEX "team_work_items_room_created_idx" ON "team_work_items" USING btree ("roomId","createdAt");
--> statement-breakpoint
CREATE INDEX "team_work_items_parent_idx" ON "team_work_items" USING btree ("parentWorkItemId");
--> statement-breakpoint
CREATE INDEX "team_work_items_assigned_status_idx" ON "team_work_items" USING btree ("assignedMemberId","status");
--> statement-breakpoint
CREATE INDEX "work_item_events_work_item_created_idx" ON "work_item_events" USING btree ("workItemId","createdAt");
--> statement-breakpoint
CREATE INDEX "work_item_events_room_created_idx" ON "work_item_events" USING btree ("roomId","createdAt");
