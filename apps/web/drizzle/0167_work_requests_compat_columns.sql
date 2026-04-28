ALTER TABLE "work_requests"
  ADD COLUMN IF NOT EXISTS "projectId" integer,
  ADD COLUMN IF NOT EXISTS "sourceRef" varchar(255),
  ADD COLUMN IF NOT EXISTS "requesterType" "public"."work_os_assignment_type" NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS "requesterId" varchar(36),
  ADD COLUMN IF NOT EXISTS "workType" varchar(100),
  ADD COLUMN IF NOT EXISTS "businessDomain" varchar(100),
  ADD COLUMN IF NOT EXISTS "urgency" varchar(30) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "riskLevel" varchar(30) NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS "classificationConfidence" double precision,
  ADD COLUMN IF NOT EXISTS "defaultOwnerType" "public"."work_os_assignment_type",
  ADD COLUMN IF NOT EXISTS "defaultOwnerId" varchar(36),
  ADD COLUMN IF NOT EXISTS "defaultQueueId" varchar(36),
  ADD COLUMN IF NOT EXISTS "objective" text,
  ADD COLUMN IF NOT EXISTS "currentState" "public"."work_os_state" NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS "linkedConversationIdsJson" jsonb,
  ADD COLUMN IF NOT EXISTS "linkedWorkpackRunIdsJson" jsonb,
  ADD COLUMN IF NOT EXISTS "linkedRoleRoutineRunIdsJson" jsonb,
  ADD COLUMN IF NOT EXISTS "linkedCaseId" varchar(36),
  ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(180),
  ADD COLUMN IF NOT EXISTS "idempotencyFingerprint" varchar(64),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "work_requests_tenant_state_idx"
  ON "work_requests" USING btree ("tenantId", "currentState", "createdAt");

CREATE INDEX IF NOT EXISTS "work_requests_tenant_source_idx"
  ON "work_requests" USING btree ("tenantId", "sourceType", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "work_requests_tenant_idempotency_unique"
  ON "work_requests" ("tenantId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
