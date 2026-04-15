DO $$
BEGIN
  CREATE TYPE "public"."work_os_state" AS ENUM (
    'new',
    'triaged',
    'planned',
    'in_progress',
    'waiting_for_approval',
    'waiting_for_input',
    'blocked',
    'escalated',
    'completed',
    'cancelled',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_os_assignment_type" AS ENUM (
    'human',
    'queue',
    'role',
    'hybrid'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_os_sla_breach_state" AS ENUM (
    'none',
    'at_risk',
    'breached',
    'resolved'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_os_approval_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "public"."work_os_exception_status" AS ENUM (
    'open',
    'paused',
    'downgraded',
    'resolved'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_requests" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "projectId" integer,
  "sourceType" varchar(50) NOT NULL,
  "sourceRef" varchar(255),
  "requesterType" "public"."work_os_assignment_type" NOT NULL DEFAULT 'human',
  "requesterId" varchar(36),
  "workType" varchar(100),
  "businessDomain" varchar(100),
  "urgency" varchar(30) NOT NULL DEFAULT 'normal',
  "riskLevel" varchar(30) NOT NULL DEFAULT 'medium',
  "classificationConfidence" double precision,
  "defaultOwnerType" "public"."work_os_assignment_type",
  "defaultOwnerId" varchar(36),
  "defaultQueueId" varchar(36),
  "title" varchar(500) NOT NULL,
  "objective" text,
  "currentState" "public"."work_os_state" NOT NULL DEFAULT 'new',
  "linkedConversationIdsJson" jsonb,
  "linkedWorkpackRunIdsJson" jsonb,
  "linkedRoleRoutineRunIdsJson" jsonb,
  "linkedCaseId" varchar(36),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_requests_tenant_state_idx"
  ON "work_requests" USING btree ("tenantId", "currentState", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_requests_tenant_source_idx"
  ON "work_requests" USING btree ("tenantId", "sourceType", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_cases" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "projectId" integer,
  "requestId" varchar(36) NOT NULL REFERENCES "work_requests"("id") ON DELETE cascade,
  "primaryTaskId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE set null,
  "title" varchar(500) NOT NULL,
  "summary" text,
  "ownerType" "public"."work_os_assignment_type",
  "ownerId" varchar(36),
  "priority" "public"."work_item_priority" NOT NULL DEFAULT 'normal',
  "riskLevel" varchar(30) NOT NULL DEFAULT 'medium',
  "dataClassification" varchar(30) NOT NULL DEFAULT 'internal',
  "currentState" "public"."work_os_state" NOT NULL DEFAULT 'new',
  "linkedConversationIdsJson" jsonb,
  "linkedWorkpackRunIdsJson" jsonb,
  "linkedRoleRoutineRunIdsJson" jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_cases_tenant_state_idx"
  ON "work_cases" USING btree ("tenantId", "currentState", "updatedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_cases_request_idx"
  ON "work_cases" USING btree ("requestId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_cases_primary_task_idx"
  ON "work_cases" USING btree ("primaryTaskId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_assignments" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "taskId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE set null,
  "previousOwnerType" "public"."work_os_assignment_type",
  "previousOwnerId" varchar(36),
  "ownerType" "public"."work_os_assignment_type" NOT NULL,
  "ownerId" varchar(36),
  "assignmentSource" varchar(50) NOT NULL DEFAULT 'manual',
  "reason" text,
  "actorAssistantId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE set null,
  "actorUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_assignments_case_created_idx"
  ON "work_assignments" USING btree ("caseId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_assignments_tenant_owner_idx"
  ON "work_assignments" USING btree ("tenantId", "ownerType", "ownerId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_assignments_task_idx"
  ON "work_assignments" USING btree ("taskId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_approvals" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "taskId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE set null,
  "approvalTransportId" varchar(36),
  "approvalStatus" "public"."work_os_approval_status" NOT NULL DEFAULT 'pending',
  "approverType" "public"."work_os_assignment_type" DEFAULT 'human',
  "approverId" varchar(36),
  "comment" text,
  "metadataJson" jsonb,
  "requestedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "respondedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_approvals_case_status_idx"
  ON "work_approvals" USING btree ("caseId", "approvalStatus", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_approvals_task_idx"
  ON "work_approvals" USING btree ("taskId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_exceptions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "taskId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE set null,
  "exceptionType" varchar(100) NOT NULL,
  "severity" varchar(30) NOT NULL DEFAULT 'medium',
  "status" "public"."work_os_exception_status" NOT NULL DEFAULT 'open',
  "reason" text,
  "ownerType" "public"."work_os_assignment_type",
  "ownerId" varchar(36),
  "metadataJson" jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "resolvedAt" timestamp with time zone,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_exceptions_case_status_idx"
  ON "work_exceptions" USING btree ("caseId", "status", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_exceptions_task_idx"
  ON "work_exceptions" USING btree ("taskId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_outcomes" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "taskId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE set null,
  "disposition" varchar(100) NOT NULL,
  "resolutionCode" varchar(100),
  "customerImpact" varchar(100),
  "reviewerResult" varchar(100),
  "followUpRequired" boolean NOT NULL DEFAULT false,
  "summary" text,
  "metadataJson" jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_outcomes_case_created_idx"
  ON "work_outcomes" USING btree ("caseId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_outcomes_task_idx"
  ON "work_outcomes" USING btree ("taskId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_slas" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) NOT NULL REFERENCES "work_cases"("id") ON DELETE cascade,
  "taskId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE set null,
  "policyId" varchar(36),
  "dueAt" timestamp with time zone,
  "serviceWindowStartAt" timestamp with time zone,
  "serviceWindowEndAt" timestamp with time zone,
  "urgency" varchar(30) NOT NULL DEFAULT 'normal',
  "breachState" "public"."work_os_sla_breach_state" NOT NULL DEFAULT 'none',
  "breachedAt" timestamp with time zone,
  "escalatedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_slas_case_due_idx"
  ON "work_slas" USING btree ("caseId", "dueAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_slas_task_idx"
  ON "work_slas" USING btree ("taskId");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "work_os_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "requestId" varchar(36) REFERENCES "work_requests"("id") ON DELETE cascade,
  "caseId" varchar(36) REFERENCES "work_cases"("id") ON DELETE cascade,
  "taskId" varchar(36) REFERENCES "team_work_items"("id") ON DELETE set null,
  "actorAssistantId" varchar(36) REFERENCES "assistant_profiles"("id") ON DELETE set null,
  "actorUserId" integer REFERENCES "users"("id") ON DELETE set null,
  "eventType" varchar(100) NOT NULL,
  "fromState" "public"."work_os_state",
  "toState" "public"."work_os_state",
  "detailJson" jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_os_events_case_created_idx"
  ON "work_os_events" USING btree ("caseId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_os_events_request_created_idx"
  ON "work_os_events" USING btree ("requestId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_os_events_task_created_idx"
  ON "work_os_events" USING btree ("taskId", "createdAt");
