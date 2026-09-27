// Deliberately scoped to the Spec 224 DB-certification profile. This is a
// separate Drizzle schema projection; the historical application schema and
// migration journal remain untouched by baseline generation.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import {
  inviteCodeTypeEnum,
  inviteCodes,
  planEnum,
  personaTemplates,
  tenants,
  tenantDataTransferPreviews,
  roleEnum,
  users,
  workerJobAttempts,
  workerJobDispatches,
  workerJobEvents,
  workerJobOutbox,
  workerJobSettlements,
  workerJobStatusEnum,
  workerResourceProfileEnum,
  workerRuntimeTypeEnum,
} from "../schema";

export {
  inviteCodeTypeEnum,
  inviteCodes,
  planEnum,
  personaTemplates,
  roleEnum,
  tenants,
  tenantDataTransferPreviews,
  users,
  workerJobAttempts,
  workerJobDispatches,
  workerJobEvents,
  workerJobOutbox,
  workerJobSettlements,
  workerJobStatusEnum,
  workerResourceProfileEnum,
  workerRuntimeTypeEnum,
};

// Job admission also checks the durable tenant-identity fence. Include only
// this active Feature 189 persistence dependency; do not pull in its legacy
// workflow/Agency execution associations.
export const tenantIdentityActions = pgTable(
  "tenant_identity_actions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actionId: varchar("actionId", { length: 128 }).notNull(),
    commandTargetHash: varchar("commandTargetHash", { length: 64 }).notNull(),
    sourceTenantId: varchar("sourceTenantId", { length: 36 }).references(
      () => tenants.id,
      { onDelete: "restrict" }
    ),
    targetTenantId: varchar("targetTenantId", { length: 36 }).references(
      () => tenants.id,
      { onDelete: "restrict" }
    ),
    phase: varchar("phase", { length: 40 }).notNull().default("pending"),
    fencingVersion: integer("fencingVersion").notNull().default(0),
    authorizationDecision: varchar("authorizationDecision", {
      length: 40,
    }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    outcomeJson: jsonb("outcomeJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    safeErrorCode: varchar("safeErrorCode", { length: 100 }),
    effectiveAt: timestamp("effectiveAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("tenant_identity_actions_user_action_unique").on(
      t.userId,
      t.actionId
    ),
    uniqueIndex("tenant_identity_actions_active_fence_unique")
      .on(t.userId)
      .where(
        sql`"phase" IN ('pending', 'open', 'fenced', 'executing', 'paused')`
      ),
    index("tenant_identity_actions_user_updated_idx").on(t.userId, t.updatedAt),
  ]
);

// assistant_teams -> agencies is a retired execution path. Keep the
// worker_jobs columns from the canonical schema but omit only those optional
// association FKs from this isolated certification projection.
export const workerJobs = pgTable(
  "worker_jobs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: varchar("teamId", { length: 36 }),
    workerId: varchar("workerId", { length: 36 }),
    workerSeriesBindingId: varchar("workerSeriesBindingId", { length: 36 }),
    workerSeriesBindingRevision: integer("workerSeriesBindingRevision"),
    runtimeType: workerRuntimeTypeEnum("runtimeType").notNull(),
    workflowRunId: varchar("workflowRunId", { length: 36 }),
    requestedByUserId: integer("requestedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    requestedByPersonaId: varchar("requestedByPersonaId", { length: 36 }),
    requestedBySystemComponent: varchar("requestedBySystemComponent", {
      length: 100,
    }),
    jobType: varchar("jobType", { length: 100 }).notNull(),
    status: workerJobStatusEnum("status").notNull().default("queued"),
    executionClass: varchar("executionClass", { length: 32 })
      .notNull()
      .default("short"),
    contractVersion: varchar("contractVersion", { length: 40 })
      .notNull()
      .default("feature-186-v1"),
    definitionHash: varchar("definitionHash", { length: 64 }),
    statusReason: text("statusReason"),
    priority: integer("priority").notNull().default(0),
    resourceProfile: workerResourceProfileEnum("resourceProfile")
      .notNull()
      .default("cpu_light"),
    capabilityRequirementsJson: jsonb("capabilityRequirementsJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    inputJson: jsonb("inputJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    instructionsJson: jsonb("instructionsJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    outputJson: jsonb("outputJson").$type<Record<string, unknown>>(),
    failureReason: text("failureReason"),
    errorCode: varchar("errorCode", { length: 100 }),
    errorMessage: text("errorMessage"),
    timeoutSeconds: integer("timeoutSeconds").notNull().default(3600),
    retryPolicyJson: jsonb("retryPolicyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    timeoutPolicyJson: jsonb("timeoutPolicyJson")
      .$type<{ softTimeoutMs: number; hardTimeoutMs: number }>()
      .notNull()
      .default({ softTimeoutMs: 0, hardTimeoutMs: 3600000 }),
    attempt: integer("attempt").notNull().default(1),
    maxAttempts: integer("maxAttempts").notNull().default(1),
    nextRetryAt: timestamp("nextRetryAt", { withTimezone: true }),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }),
    leaseOwnerToken: varchar("leaseOwnerToken", { length: 128 }),
    leaseExpiresAt: timestamp("leaseExpiresAt", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeatAt", { withTimezone: true }),
    fencingVersion: integer("fencingVersion").notNull().default(0),
    progressJson: jsonb("progressJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    resultRef: text("resultRef"),
    scheduledAt: timestamp("scheduledAt", { withTimezone: true }),
    operatorReviewRequired: boolean("operatorReviewRequired")
      .notNull()
      .default(false),
    operatorReviewReason: text("operatorReviewReason"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    finishedAt: timestamp("finishedAt", { withTimezone: true }),
  },
  t => [
    uniqueIndex("worker_jobs_tenant_idempotency_key_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("worker_jobs_tenant_status_priority_idx").on(
      t.tenantId,
      t.status,
      t.priority
    ),
    index("worker_jobs_worker_status_idx").on(t.workerId, t.status),
    index("worker_jobs_lease_expires_idx").on(t.leaseExpiresAt),
    index("worker_jobs_due_retry_idx").on(t.status, t.nextRetryAt),
    index("worker_jobs_admission_tenant_class_status_idx")
      .on(t.tenantId, t.executionClass, t.status)
      .where(
        sql`"status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing')`
      ),
    index("worker_jobs_admission_class_status_idx")
      .on(t.executionClass, t.status)
      .where(
        sql`"status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing')`
      ),
    index("worker_jobs_definition_hash_idx").on(t.tenantId, t.definitionHash),
    index("worker_jobs_series_binding_idx").on(
      t.workerSeriesBindingId,
      t.workerSeriesBindingRevision,
      t.status
    ),
  ]
);

// Job admission consults the active transfer fence even for unrelated job
// types; include its canonical plan and preview persistence in this profile.
export const tenantDataTransferPlans = pgTable(
  "tenant_data_transfer_plans",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    operationId: varchar("operationId", { length: 36 })
      .notNull()
      .references(() => workerJobs.id, { onDelete: "restrict" }),
    previewId: varchar("previewId", { length: 36 })
      .notNull()
      .references(() => tenantDataTransferPreviews.id, {
        onDelete: "restrict",
      }),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    sourceUserId: integer("sourceUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetUserId: integer("targetUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    previewFingerprint: varchar("previewFingerprint", { length: 64 }).notNull(),
    selectionJson: jsonb("selectionJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    handlerSnapshotJson: jsonb("handlerSnapshotJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    policyJson: jsonb("policyJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    approvedAt: timestamp("approvedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("tenant_data_transfer_plans_operation_unique").on(
      t.operationId
    ),
    uniqueIndex("tenant_data_transfer_plans_preview_unique").on(t.previewId),
    index("tenant_data_transfer_plans_tenant_source_idx").on(
      t.tenantId,
      t.sourceUserId,
      t.createdAt
    ),
    check(
      "tenant_data_transfer_plans_distinct_users_check",
      sql`"sourceUserId" <> "targetUserId"`
    ),
  ]
);

// These tables are owned by the Python ApprovalDBService. This projection
// mirrors its existing SQLAlchemy metadata only so the isolated Drizzle fresh
// baseline can encode a reproducible cross-service certification schema.
export const approvalTypeEnum = pgEnum("approvaltype", [
  "CODE_EXECUTION",
  "FILE_MODIFICATION",
  "DEPLOYMENT",
  "CONFIGURATION_CHANGE",
  "COST_THRESHOLD",
  "SECURITY_SENSITIVE",
  "CUSTOM",
]);
export const approvalStatusEnum = pgEnum("approvalstatus", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
]);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    requestType: approvalTypeEnum("request_type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    tenantId: varchar("tenant_id", { length: 36 }).references(
      () => tenants.id,
      { onDelete: "cascade" }
    ),
    projectId: varchar("project_id", { length: 36 }),
    executionId: varchar("execution_id", { length: 36 }),
    requesterId: integer("requester_id").references(() => users.id),
    requesterType: varchar("requester_type", { length: 50 }),
    status: approvalStatusEnum("status").notNull(),
    payload: json("payload"),
    extraData: json("extra_data"),
    actionDigest: varchar("action_digest", { length: 128 }),
    domFingerprint: varchar("dom_fingerprint", { length: 255 }),
    screenshotHash: varchar("screenshot_hash", { length: 255 }),
    correlationKey: varchar("correlation_key", { length: 255 }),
    revokedAt: timestamp("revoked_at"),
    riskLevel: varchar("risk_level", { length: 20 }),
    riskFactors: json("risk_factors"),
    requiredApprovers: integer("required_approvers"),
    currentApprovals: integer("current_approvals"),
    expiresAt: timestamp("expires_at"),
    timeoutAction: varchar("timeout_action", { length: 20 }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at"),
    resolvedAt: timestamp("resolved_at"),
  },
  t => [
    index("idx_approval_request_status").on(t.status),
    index("idx_approval_request_tenant").on(t.tenantId),
    index("idx_approval_request_type").on(t.requestType),
    index("idx_approval_request_execution").on(t.executionId),
    index("idx_approval_request_correlation").on(t.correlationKey),
  ]
);

export const approvalResponses = pgTable(
  "approval_responses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    requestId: varchar("request_id", { length: 36 })
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    approverId: integer("approver_id")
      .notNull()
      .references(() => users.id),
    decision: varchar("decision", { length: 20 }).notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").notNull(),
  },
  t => [
    index("idx_approval_response_request").on(t.requestId),
    index("idx_approval_response_approver").on(t.approverId),
  ]
);

export const approvalRules = pgTable(
  "approval_rules",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    tenantId: varchar("tenant_id", { length: 36 }).references(
      () => tenants.id,
      { onDelete: "cascade" }
    ),
    projectId: varchar("project_id", { length: 36 }),
    triggerType: approvalTypeEnum("trigger_type").notNull(),
    conditions: json("conditions"),
    approverRoles: json("approver_roles"),
    approverUsers: json("approver_users"),
    requiredApprovals: integer("required_approvals"),
    timeoutMinutes: integer("timeout_minutes"),
    timeoutAction: varchar("timeout_action", { length: 20 }),
    autoApproveConditions: json("auto_approve_conditions"),
    priority: integer("priority"),
    isActive: boolean("is_active"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at"),
  },
  t => [
    index("idx_approval_rule_tenant").on(t.tenantId),
    index("idx_approval_rule_type").on(t.triggerType),
    index("idx_approval_rule_active").on(t.isActive),
  ]
);

// Feature 207 economic table projection. These integrity checks are copied
// from the approved historical 0340 SQL contract (fingerprint recorded in the
// D3.39 report); tables are created once by this baseline, never by 0340/0354.
export const economicIntents = pgTable(
  "economic_intents",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorId: varchar("actorId", { length: 160 }).notNull(),
    actorType: varchar("actorType", { length: 24 }).notNull(),
    workerJobId: varchar("workerJobId", { length: 36 })
      .notNull()
      .references(() => workerJobs.id, { onDelete: "restrict" }),
    attemptId: varchar("attemptId", { length: 36 })
      .notNull()
      .references(() => workerJobAttempts.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    effectType: varchar("effectType", { length: 48 }).notNull(),
    resourceRef: varchar("resourceRef", { length: 255 }).notNull(),
    amountMinorUnits: bigint("amountMinorUnits", {
      mode: "number",
    }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("admitted"),
    metadataJson: jsonb("metadataJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("economic_intents_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("economic_intents_job_attempt_idx").on(
      t.tenantId,
      t.workerJobId,
      t.attemptId,
      t.createdAt
    ),
    check(
      "economic_intents_amount_nonnegative_check",
      sql`"amountMinorUnits" >= 0`
    ),
    check(
      "economic_intents_currency_format_check",
      sql`"currency" ~ '^[A-Z]{3}$'`
    ),
    check(
      "economic_intents_actor_type_check",
      sql`"actorType" IN ('user', 'agent', 'system')`
    ),
    check(
      "economic_intents_idempotency_length_check",
      sql`length("idempotencyKey") BETWEEN 8 AND 128`
    ),
  ]
);

export const economicBudgets = pgTable(
  "economic_budgets",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    scopeType: varchar("scopeType", { length: 32 }).notNull(),
    scopeRef: varchar("scopeRef", { length: 160 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    limitMinorUnits: bigint("limitMinorUnits", {
      mode: "number",
    }).notNull(),
    heldMinorUnits: bigint("heldMinorUnits", {
      mode: "number",
    })
      .notNull()
      .default(0),
    capturedMinorUnits: bigint("capturedMinorUnits", { mode: "number" })
      .notNull()
      .default(0),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    version: bigint("version", {
      mode: "number",
    })
      .notNull()
      .default(0),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("economic_budgets_scope_unique").on(
      t.tenantId,
      t.scopeType,
      t.scopeRef,
      t.currency
    ),
    check(
      "economic_budgets_amounts_nonnegative_check",
      sql`"limitMinorUnits" >= 0 AND "heldMinorUnits" >= 0 AND "capturedMinorUnits" >= 0`
    ),
    check(
      "economic_budgets_currency_format_check",
      sql`"currency" ~ '^[A-Z]{3}$'`
    ),
  ]
);

export const economicHolds = pgTable(
  "economic_holds",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    intentId: varchar("intentId", { length: 36 })
      .notNull()
      .references(() => economicIntents.id, { onDelete: "restrict" }),
    budgetId: varchar("budgetId", { length: 36 })
      .notNull()
      .references(() => economicBudgets.id, { onDelete: "restrict" }),
    workerJobId: varchar("workerJobId", { length: 36 })
      .notNull()
      .references(() => workerJobs.id, { onDelete: "restrict" }),
    attemptId: varchar("attemptId", { length: 36 })
      .notNull()
      .references(() => workerJobAttempts.id, { onDelete: "restrict" }),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountMinorUnits: bigint("amountMinorUnits", { mode: "number" }).notNull(),
    capturedMinorUnits: bigint("capturedMinorUnits", { mode: "number" })
      .notNull()
      .default(0),
    releasedMinorUnits: bigint("releasedMinorUnits", { mode: "number" })
      .notNull()
      .default(0),
    status: varchar("status", { length: 24 }).notNull().default("held"),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("economic_holds_intent_unique").on(t.tenantId, t.intentId),
    uniqueIndex("economic_holds_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("economic_holds_active_idx").on(t.tenantId, t.status, t.updatedAt),
    check(
      "economic_holds_amounts_check",
      sql`"amountMinorUnits" >= 0 AND "capturedMinorUnits" >= 0 AND "releasedMinorUnits" >= 0 AND "capturedMinorUnits" + "releasedMinorUnits" <= "amountMinorUnits"`
    ),
    check(
      "economic_holds_currency_format_check",
      sql`"currency" ~ '^[A-Z]{3}$'`
    ),
  ]
);

export const economicLedgerAccounts = pgTable(
  "economic_ledger_accounts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountType: varchar("accountType", { length: 32 }).notNull(),
    ownerRef: varchar("ownerRef", { length: 160 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    balanceMinorUnits: bigint("balanceMinorUnits", { mode: "number" })
      .notNull()
      .default(0),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("economic_ledger_accounts_identity_unique").on(
      t.tenantId,
      t.accountType,
      t.ownerRef,
      t.currency
    ),
    check(
      "economic_ledger_accounts_currency_format_check",
      sql`"currency" ~ '^[A-Z]{3}$'`
    ),
  ]
);

export const economicJournalEntries = pgTable(
  "economic_journal_entries",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workerJobId: varchar("workerJobId", { length: 36 }).references(
      () => workerJobs.id,
      { onDelete: "restrict" }
    ),
    attemptId: varchar("attemptId", { length: 36 }).references(
      () => workerJobAttempts.id,
      { onDelete: "restrict" }
    ),
    idempotencyKey: varchar("idempotencyKey", { length: 200 }).notNull(),
    description: varchar("description", { length: 512 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("posted"),
    reversalOfEntryId: varchar("reversalOfEntryId", { length: 36 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("economic_journal_entries_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
    index("economic_journal_entries_correlation_idx").on(
      t.tenantId,
      t.workerJobId,
      t.attemptId,
      t.createdAt
    ),
  ]
);

export const economicJournalLines = pgTable(
  "economic_journal_lines",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    entryId: varchar("entryId", { length: 36 })
      .notNull()
      .references(() => economicJournalEntries.id, { onDelete: "restrict" }),
    accountId: varchar("accountId", { length: 36 })
      .notNull()
      .references(() => economicLedgerAccounts.id, { onDelete: "restrict" }),
    currency: varchar("currency", { length: 3 }).notNull(),
    debitMinorUnits: bigint("debitMinorUnits", { mode: "number" })
      .notNull()
      .default(0),
    creditMinorUnits: bigint("creditMinorUnits", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    index("economic_journal_lines_entry_idx").on(t.tenantId, t.entryId),
    check(
      "economic_journal_lines_nonnegative_check",
      sql`"debitMinorUnits" >= 0 AND "creditMinorUnits" >= 0`
    ),
    check(
      "economic_journal_lines_one_side_check",
      sql`("debitMinorUnits" > 0 AND "creditMinorUnits" = 0) OR ("creditMinorUnits" > 0 AND "debitMinorUnits" = 0)`
    ),
    check(
      "economic_journal_lines_currency_format_check",
      sql`"currency" ~ '^[A-Z]{3}$'`
    ),
  ]
);

export const economicEvents = pgTable(
  "economic_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 200 }).notNull(),
    workerJobId: varchar("workerJobId", { length: 36 }).references(
      () => workerJobs.id,
      { onDelete: "restrict" }
    ),
    attemptId: varchar("attemptId", { length: 36 }).references(
      () => workerJobAttempts.id,
      { onDelete: "restrict" }
    ),
    actorId: varchar("actorId", { length: 160 }).notNull(),
    policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
    payloadJson: jsonb("payloadJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    uniqueIndex("economic_events_tenant_idempotency_unique").on(
      t.tenantId,
      t.idempotencyKey
    ),
  ]
);

export const economicReconciliations = pgTable(
  "economic_reconciliations",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: varchar("tenantId", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workerJobId: varchar("workerJobId", { length: 36 }).references(
      () => workerJobs.id,
      { onDelete: "restrict" }
    ),
    attemptId: varchar("attemptId", { length: 36 }).references(
      () => workerJobAttempts.id,
      { onDelete: "restrict" }
    ),
    holdId: varchar("holdId", { length: 36 }).references(
      () => economicHolds.id,
      { onDelete: "restrict" }
    ),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    reasonCode: varchar("reasonCode", { length: 100 }).notNull(),
    externalReference: varchar("externalReference", { length: 255 }),
    detailsJson: jsonb("detailsJson")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
  },
  t => [
    index("economic_reconciliations_pending_idx").on(
      t.tenantId,
      t.status,
      t.createdAt
    ),
  ]
);
