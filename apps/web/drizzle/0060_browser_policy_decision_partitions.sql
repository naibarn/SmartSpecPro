CREATE TABLE IF NOT EXISTS "browser_policy_decisions" (
  "id" serial NOT NULL,
  "traceId" varchar(64),
  "tenantId" varchar(36) NOT NULL,
  "userId" integer,
  "workflowId" integer,
  "executionId" varchar(128),
  "actionType" varchar(64) NOT NULL,
  "actionClass" "browser_action_class" NOT NULL,
  "pageSensitivity" "browser_page_sensitivity" NOT NULL,
  "decision" "browser_policy_decision" NOT NULL,
  "reasonCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "approvalState" varchar(32) NOT NULL,
  "outcome" varchar(16) NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "previousEventHash" varchar(128),
  "eventHash" varchar(128) NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "browser_policy_decisions_event_hash_uq" UNIQUE ("eventHash")
) PARTITION BY RANGE ("createdAt");
--> statement-breakpoint

ALTER TABLE "browser_policy_decisions"
  ADD CONSTRAINT "browser_policy_decisions_tenantId_tenants_id_fk"
  FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "browser_policy_decisions"
  ADD CONSTRAINT "browser_policy_decisions_userId_users_id_fk"
  FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "browser_policy_decisions_tenant_created_idx"
  ON "browser_policy_decisions" USING btree ("tenantId", "createdAt");
--> statement-breakpoint
CREATE INDEX "browser_policy_decisions_trace_idx"
  ON "browser_policy_decisions" USING btree ("traceId");
--> statement-breakpoint
CREATE INDEX "browser_policy_decisions_execution_idx"
  ON "browser_policy_decisions" USING btree ("executionId");
--> statement-breakpoint
CREATE INDEX "browser_policy_decisions_decision_idx"
  ON "browser_policy_decisions" USING btree ("decision", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "browser_policy_decisions_2026_03"
  PARTITION OF "browser_policy_decisions"
  FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "browser_policy_decisions_2026_04"
  PARTITION OF "browser_policy_decisions"
  FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
--> statement-breakpoint

COMMENT ON TABLE "browser_policy_decisions" IS
  'Browser policy decision audit table. Partition lifecycle is owned by pg_partman with celery_beat fallback checks.';
