Good. Now I have a thorough understanding of all the patterns. Let me produce the section file.

# Section 13: Database Schema Changes

## Overview

This section adds six new PostgreSQL tables to support the workflow engine rebuild. These tables are required by the DLQ (Section 7), caching system (Section 10), security/governance nodes (Section 8), audit trail (Section 8), secrets vault (Section 8), and policy gates (Phase 2 placeholder). It also introduces two new `pgEnum` types and documents the LangGraph checkpoint tables that are auto-managed by `AsyncPostgresSaver`.

This is one of the first sections to implement (second after Section 1 in the implementation order) because multiple downstream sections depend on these tables existing.

**Risk level**: Low-Medium. All changes are additive (new tables and enums only). No existing tables are modified. No data migration required.

---

## Dependencies

- **None** -- this section is standalone and can be implemented immediately.
- **Downstream dependents**: Section 7 (DLQ executor), Section 8 (Audit/Secrets/RBAC nodes), Section 10 (Cache metadata), Section 14 (API endpoints for DLQ listing).

---

## New Enums

Two new `pgEnum` types are needed.

### `workflow_execution_status`

Tracks execution lifecycle. Distinct from the existing `workflowStatusEnum` (which tracks the workflow definition state: draft/compiled/running/completed/failed). Execution status tracks individual runs.

```typescript
// File: /home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts
// Location: After the existing enum declarations (after line ~45)

export const workflowExecutionStatusEnum = pgEnum("workflow_execution_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted",  // Paused at HITL interrupt, awaiting human input
]);
```

### `dlq_item_status`

Tracks the state of items in the dead letter queue.

```typescript
export const dlqItemStatusEnum = pgEnum("dlq_item_status", [
  "pending",      // Awaiting reprocessing
  "reprocessing", // Currently being retried
  "resolved",     // Successfully reprocessed
  "discarded",    // Manually discarded by admin
]);
```

### `policy_action`

Defines what action a policy rule takes.

```typescript
export const policyActionEnum = pgEnum("policy_action", [
  "allow",
  "deny",
  "require_approval",
]);
```

---

## Tables to Create

All six tables are appended to the end of `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (after the existing `workflowEventSubscriptions` table, around line 2351).

### Table 1: `workflow_executions`

Tracks individual workflow execution runs. Currently missing from the schema (there is a TODO at `workflows.py` line 240 in the Python backend). This table is essential for listing/tracking executions, correlating with DLQ items and audit events, and tracking credit usage per run.

```typescript
/**
 * Workflow Executions — Individual workflow run tracking
 * Each row represents one execution of a workflow (manual, scheduled, webhook, etc.)
 * 
 * NOTE: LangGraph checkpoint tables (checkpoints, checkpoint_blobs, checkpoint_writes, 
 * checkpoint_migrations) are auto-created by AsyncPostgresSaver.setup() in the Python backend.
 * Those tables are NOT managed by Drizzle. Do not add them here.
 */
export const workflowExecutions = pgTable("workflow_executions", {
  id: serial("id").primaryKey(),

  /** Workflow definition that was executed */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Tenant for multi-tenant isolation */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** User who triggered the execution */
  userId: integer("userId").notNull().references(() => users.id),

  /** Execution status */
  status: workflowExecutionStatusEnum("status").default("pending").notNull(),

  /** Input data provided to the workflow trigger */
  inputData: json("inputData").$type<Record<string, any>>(),

  /** Final output data from the workflow (null if still running or failed) */
  outputData: json("outputData").$type<Record<string, any>>(),

  /** When execution started (null if still pending) */
  startedAt: timestamp("startedAt", { withTimezone: true }),

  /** When execution completed/failed/cancelled */
  completedAt: timestamp("completedAt", { withTimezone: true }),

  /** Error message if execution failed */
  error: text("error"),

  /** Number of nodes executed in this run */
  nodeCount: integer("nodeCount").default(0).notNull(),

  /** Total credits consumed by this execution */
  creditsUsed: integer("creditsUsed").default(0).notNull(),

  /** LangGraph thread ID for checkpoint correlation (format: "{tenantId}:{executionId}") */
  threadId: varchar("threadId", { length: 128 }),

  /** Trigger type that started this execution */
  triggerType: varchar("triggerType", { length: 50 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("workflow_executions_workflow_idx").on(t.workflowId),
  index("workflow_executions_tenant_idx").on(t.tenantId),
  index("workflow_executions_user_idx").on(t.userId),
  index("workflow_executions_status_idx").on(t.status),
  index("workflow_executions_thread_idx").on(t.threadId),
  index("workflow_executions_created_idx").on(t.createdAt),
]);

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertWorkflowExecution = typeof workflowExecutions.$inferInsert;
```

### Table 2: `workflow_dead_letter_queue`

Stores failed workflow items for inspection and reprocessing. Used by the DLQ node executor (Section 7, node #24) and the DLQ admin API endpoints (Section 14).

```typescript
/**
 * Workflow Dead Letter Queue — Failed items for reprocessing
 * Items land here after exhausting retry attempts. Admins can inspect and reprocess.
 */
export const workflowDeadLetterQueue = pgTable("workflow_dead_letter_queue", {
  id: serial("id").primaryKey(),

  /** Workflow that generated this failure */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Execution run where the failure occurred */
  executionId: integer("executionId").references(() => workflowExecutions.id, { onDelete: "set null" }),

  /** Node that failed */
  nodeId: varchar("nodeId", { length: 36 }).notNull(),

  /** Node type for display/filtering */
  nodeType: varchar("nodeType", { length: 100 }),

  /** Input data that caused the failure */
  inputData: json("inputData").$type<Record<string, any>>().notNull(),

  /** Error message from the last failure */
  error: text("error").notNull(),

  /** Full error stack trace (for debugging) */
  stackTrace: text("stackTrace"),

  /** Number of retry attempts before DLQ */
  retryCount: integer("retryCount").default(0).notNull(),

  /** DLQ item status */
  status: dlqItemStatusEnum("status").default("pending").notNull(),

  /** Tenant isolation */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** When the item was reprocessed (null if not yet) */
  reprocessedAt: timestamp("reprocessedAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("dlq_workflow_idx").on(t.workflowId),
  index("dlq_execution_idx").on(t.executionId),
  index("dlq_status_idx").on(t.status),
  index("dlq_tenant_idx").on(t.tenantId),
  index("dlq_created_idx").on(t.createdAt),
]);

export type WorkflowDeadLetterQueueItem = typeof workflowDeadLetterQueue.$inferSelect;
export type InsertWorkflowDeadLetterQueueItem = typeof workflowDeadLetterQueue.$inferInsert;
```

### Table 3: `workflow_cache_metadata`

Tracks cache hit/miss statistics for the exact-hash caching system (Section 10). The actual cached values live in Redis; this table provides observability and tuning data.

```typescript
/**
 * Workflow Cache Metadata — Cache statistics and observability
 * Actual cached values live in Redis. This table tracks hit/miss rates per cache key
 * for monitoring, tuning TTLs, and identifying high-value cache entries.
 */
export const workflowCacheMetadata = pgTable("workflow_cache_metadata", {
  id: serial("id").primaryKey(),

  /** SHA-256 cache key */
  cacheKey: varchar("cacheKey", { length: 64 }).notNull().unique(),

  /** Node type that produced this cache entry (e.g., "http_request", "llm_call") */
  nodeType: varchar("nodeType", { length: 100 }).notNull(),

  /** Number of cache hits */
  hitCount: integer("hitCount").default(0).notNull(),

  /** Last time the cache was hit */
  lastHitAt: timestamp("lastHitAt", { withTimezone: true }),

  /** TTL in seconds configured for this cache entry */
  ttlSeconds: integer("ttlSeconds").notNull(),

  /** Size of cached value in bytes (for capacity planning) */
  valueSizeBytes: integer("valueSizeBytes"),

  /** Tenant isolation (null for shared/global cache entries) */
  tenantId: varchar("tenantId", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("cache_metadata_node_type_idx").on(t.nodeType),
  index("cache_metadata_tenant_idx").on(t.tenantId),
  index("cache_metadata_last_hit_idx").on(t.lastHitAt),
]);

export type WorkflowCacheMetadata = typeof workflowCacheMetadata.$inferSelect;
export type InsertWorkflowCacheMetadata = typeof workflowCacheMetadata.$inferInsert;
```

### Table 4: `workflow_audit_events`

Structured audit log for workflow execution events. Complements the existing `providerUsageLog` and `apiAuditEvents` tables by capturing workflow-specific lifecycle events (node start/complete/fail, approval decisions, secret access, etc.).

```typescript
/**
 * Workflow Audit Events — Structured execution audit trail
 * Records who did what, when, with what data for governance and debugging.
 * Complements existing providerUsageLog (LLM-specific) and apiAuditEvents (media-specific).
 */
export const workflowAuditEvents = pgTable("workflow_audit_events", {
  id: serial("id").primaryKey(),

  /** Workflow definition */
  workflowId: integer("workflowId").notNull().references(() => workflows.id, { onDelete: "cascade" }),

  /** Execution run (null for workflow-level events like deploy/publish) */
  executionId: integer("executionId").references(() => workflowExecutions.id, { onDelete: "set null" }),

  /** Node that generated the event (null for workflow-level events) */
  nodeId: varchar("nodeId", { length: 36 }),

  /** Event type (e.g., "node_start", "node_complete", "node_error", "approval_granted", 
   *  "approval_rejected", "secret_accessed", "policy_checked", "execution_start", 
   *  "execution_complete") */
  eventType: varchar("eventType", { length: 50 }).notNull(),

  /** Actor: user who triggered/approved/performed the action */
  actorId: integer("actorId").references(() => users.id),

  /** Event payload (structured JSON with event-type-specific fields) */
  data: json("data").$type<Record<string, any>>(),

  /** Tenant isolation */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Trace ID for correlation with providerUsageLog and external systems */
  traceId: varchar("traceId", { length: 64 }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("audit_events_workflow_idx").on(t.workflowId),
  index("audit_events_execution_idx").on(t.executionId),
  index("audit_events_event_type_idx").on(t.eventType),
  index("audit_events_tenant_idx").on(t.tenantId),
  index("audit_events_actor_idx").on(t.actorId),
  index("audit_events_trace_idx").on(t.traceId),
  index("audit_events_created_idx").on(t.createdAt),
]);

export type WorkflowAuditEvent = typeof workflowAuditEvents.$inferSelect;
export type InsertWorkflowAuditEvent = typeof workflowAuditEvents.$inferInsert;
```

### Table 5: `workflow_secrets`

Encrypted credential storage for the Secrets Vault node (Section 8, node #26). Values are encrypted using AES-256-GCM via the same `LLM_ENCRYPTION_KEY` as the rest of the system (see `crypto.ts` and `smartspecweb_crypto.py`).

```typescript
/**
 * Workflow Secrets — Encrypted credential vault
 * Stores encrypted API keys, tokens, and passwords for use by workflow nodes.
 * Values are encrypted with AES-256-GCM using LLM_ENCRYPTION_KEY (same key as crypto.ts).
 * 
 * SECURITY: Never log or expose decrypted values. Secret access is recorded in 
 * workflow_audit_events with eventType "secret_accessed".
 */
export const workflowSecrets = pgTable("workflow_secrets", {
  id: serial("id").primaryKey(),

  /** Tenant that owns this secret */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Human-readable secret name (unique per tenant, e.g., "stripe_api_key", "github_token") */
  name: varchar("name", { length: 255 }).notNull(),

  /** AES-256-GCM encrypted value (format: "iv:authTag:ciphertext" hex) */
  encryptedValue: text("encryptedValue").notNull(),

  /** Vault backend used for this secret ("internal" = AES-256-GCM, future: "hashicorp", "aws_sm") */
  vaultBackend: varchar("vaultBackend", { length: 50 }).default("internal").notNull(),

  /** Optional description of what this secret is for */
  description: text("description"),

  /** User who created this secret */
  createdBy: integer("createdBy").references(() => users.id),

  /** User who last updated this secret */
  updatedBy: integer("updatedBy").references(() => users.id),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("workflow_secrets_tenant_name_unique").on(t.tenantId, t.name),
  index("workflow_secrets_tenant_idx").on(t.tenantId),
]);

export type WorkflowSecret = typeof workflowSecrets.$inferSelect;
export type InsertWorkflowSecret = typeof workflowSecrets.$inferInsert;
```

### Table 6: `workflow_policy_rules`

Placeholder table for the Phase 2 Policy Gate system. Schema is defined now to avoid a migration later when Phase 2 is implemented. In Phase 1, this table will exist but will not have any data or active consumers.

```typescript
/**
 * Workflow Policy Rules — Tenant-configurable governance policies
 * Phase 2 placeholder: Schema defined now to avoid migration during Phase 2.
 * Used by the Policy Gate node to enforce rules like:
 *   - Budget caps per workflow/user
 *   - Tool/API allowlists
 *   - PII redaction requirements
 *   - Required approval for destructive actions
 */
export const workflowPolicyRules = pgTable("workflow_policy_rules", {
  id: serial("id").primaryKey(),

  /** Tenant that owns this rule */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** Rule type (e.g., "budget_cap", "tool_allowlist", "pii_redaction", "action_approval") */
  ruleType: varchar("ruleType", { length: 100 }).notNull(),

  /** Condition expression (JSON) that triggers this rule */
  condition: json("condition").$type<Record<string, any>>().notNull(),

  /** Action to take when condition matches */
  action: policyActionEnum("action").notNull(),

  /** Priority (lower number = higher priority, evaluated in order) */
  priority: integer("priority").default(100).notNull(),

  /** Whether this rule is active */
  enabled: boolean("enabled").default(true).notNull(),

  /** Optional human-readable description of what this rule does */
  description: text("description"),

  /** Optional: restrict rule to specific workflow IDs (null = all workflows) */
  workflowIds: json("workflowIds").$type<number[]>(),

  /** User who created this rule */
  createdBy: integer("createdBy").references(() => users.id),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("policy_rules_tenant_idx").on(t.tenantId),
  index("policy_rules_type_idx").on(t.ruleType),
  index("policy_rules_enabled_idx").on(t.enabled),
  index("policy_rules_priority_idx").on(t.priority),
]);

export type WorkflowPolicyRule = typeof workflowPolicyRules.$inferSelect;
export type InsertWorkflowPolicyRule = typeof workflowPolicyRules.$inferInsert;
```

---

## LangGraph Checkpoint Tables

LangGraph's `AsyncPostgresSaver` automatically creates and manages the following tables when `setup()` is called from the Python backend:

- `checkpoints` -- stores serialized LangGraph state snapshots
- `checkpoint_blobs` -- stores large binary data referenced by checkpoints
- `checkpoint_writes` -- stores pending writes for concurrent access
- `checkpoint_migrations` -- tracks schema versions of the checkpoint system

**These tables are NOT managed by Drizzle.** They are created by `AsyncPostgresSaver.setup()` in the Python backend (see Section 1). A comment documenting this is included in the `workflowExecutions` table definition above.

**Do not add these tables to `schema.ts`.** If Drizzle attempts to manage them, it could conflict with LangGraph's internal schema expectations. The `threadId` column on `workflowExecutions` serves as the correlation key between Drizzle-managed tables and LangGraph-managed checkpoint tables.

---

## File Modifications Summary

**File**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

**Changes** (all additive, no modifications to existing code):

1. Add three new enums after line ~45 (after existing enum declarations):
   - `workflowExecutionStatusEnum`
   - `dlqItemStatusEnum`
   - `policyActionEnum`

2. Append six new tables after line ~2351 (after `workflowEventSubscriptions`):
   - `workflowExecutions`
   - `workflowDeadLetterQueue`
   - `workflowCacheMetadata`
   - `workflowAuditEvents`
   - `workflowSecrets`
   - `workflowPolicyRules`

---

## Migration Steps

Follow the Database Safety Protocol from CLAUDE.md. Since all changes are additive (new tables and enums only), risk is Low.

### Step 1: Identify affected tables

```
This migration adds NEW tables: workflow_executions, workflow_dead_letter_queue, 
workflow_cache_metadata, workflow_audit_events, workflow_secrets, workflow_policy_rules.
No existing tables are modified.
```

### Step 2: Backup (precautionary full backup)

Even though we are only adding tables, take a precautionary backup in case the migration tool has side effects:

```bash
mkdir -p /home/dev/projects/SmartSpecPro/.db-backups
pg_dump "$DATABASE_URL" \
  --file="/home/dev/projects/SmartSpecPro/.db-backups/full_backup_pre_workflow_schema_$(date +%Y%m%d_%H%M%S).sql"
```

Record baseline row counts for existing workflow tables (to verify no data loss):

```bash
psql "$DATABASE_URL" -c "
  SELECT 'workflows' as tbl, count(*) as rows FROM workflows
  UNION ALL
  SELECT 'workflow_templates', count(*) FROM workflow_templates
  UNION ALL
  SELECT 'workflow_schedules', count(*) FROM workflow_schedules
  UNION ALL
  SELECT 'webhook_calls', count(*) FROM webhook_calls
  UNION ALL
  SELECT 'workflow_event_subscriptions', count(*) FROM workflow_event_subscriptions;
"
```

### Step 3: Run the migration

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm db:push
```

This runs `drizzle-kit generate && drizzle-kit migrate`.

### Step 4: Verify data integrity

```bash
# 1. Verify new tables exist
psql "$DATABASE_URL" -c "
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name LIKE 'workflow_%'
  ORDER BY table_name;
"

# 2. Verify new enums exist
psql "$DATABASE_URL" -c "
  SELECT typname FROM pg_type 
  WHERE typname IN ('workflow_execution_status', 'dlq_item_status', 'policy_action');
"

# 3. Verify existing table row counts unchanged
psql "$DATABASE_URL" -c "
  SELECT 'workflows' as tbl, count(*) as rows FROM workflows
  UNION ALL
  SELECT 'workflow_templates', count(*) FROM workflow_templates
  UNION ALL
  SELECT 'workflow_schedules', count(*) FROM workflow_schedules
  UNION ALL
  SELECT 'webhook_calls', count(*) FROM webhook_calls
  UNION ALL
  SELECT 'workflow_event_subscriptions', count(*) FROM workflow_event_subscriptions;
"

# 4. Verify indexes created
psql "$DATABASE_URL" -c "
  SELECT indexname FROM pg_indexes 
  WHERE tablename LIKE 'workflow_%' 
  AND indexname LIKE '%idx%'
  ORDER BY indexname;
"
```

### Step 5: Verify TypeScript compilation

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm check
```

---

## Tests

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/schema.test.ts`

These tests verify that the Drizzle schema definitions are structurally correct and that the tables can be referenced by downstream code. Since Drizzle schema is declarative TypeScript, the primary value is in verifying that the types export correctly, the enum values are correct, and the table relationships are well-formed.

```typescript
/**
 * Tests for Section 13: Database Schema Changes
 * 
 * Validates that new workflow engine tables are correctly defined in Drizzle schema.
 * These are structural/type tests -- they verify the schema declarations, not database state.
 * Integration tests that verify actual table creation run as part of the migration step.
 */
import { describe, it, expect } from "vitest";
import {
  workflowExecutionStatusEnum,
  dlqItemStatusEnum,
  policyActionEnum,
  workflowExecutions,
  workflowDeadLetterQueue,
  workflowCacheMetadata,
  workflowAuditEvents,
  workflowSecrets,
  workflowPolicyRules,
} from "../../drizzle/schema";

describe("Section 13: Workflow Engine Schema", () => {
  describe("Enums", () => {
    it("workflowExecutionStatusEnum has correct values", () => {
      expect(workflowExecutionStatusEnum.enumValues).toEqual([
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
        "interrupted",
      ]);
    });

    it("dlqItemStatusEnum has correct values", () => {
      expect(dlqItemStatusEnum.enumValues).toEqual([
        "pending",
        "reprocessing",
        "resolved",
        "discarded",
      ]);
    });

    it("policyActionEnum has correct values", () => {
      expect(policyActionEnum.enumValues).toEqual([
        "allow",
        "deny",
        "require_approval",
      ]);
    });
  });

  describe("workflowExecutions table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowExecutions);
      expect(columns).toContain("id");
      expect(columns).toContain("workflowId");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("userId");
      expect(columns).toContain("status");
      expect(columns).toContain("inputData");
      expect(columns).toContain("outputData");
      expect(columns).toContain("startedAt");
      expect(columns).toContain("completedAt");
      expect(columns).toContain("error");
      expect(columns).toContain("nodeCount");
      expect(columns).toContain("creditsUsed");
      expect(columns).toContain("threadId");
      expect(columns).toContain("triggerType");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("workflowDeadLetterQueue table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowDeadLetterQueue);
      expect(columns).toContain("id");
      expect(columns).toContain("workflowId");
      expect(columns).toContain("executionId");
      expect(columns).toContain("nodeId");
      expect(columns).toContain("nodeType");
      expect(columns).toContain("inputData");
      expect(columns).toContain("error");
      expect(columns).toContain("stackTrace");
      expect(columns).toContain("retryCount");
      expect(columns).toContain("status");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("reprocessedAt");
      expect(columns).toContain("createdAt");
    });
  });

  describe("workflowCacheMetadata table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowCacheMetadata);
      expect(columns).toContain("id");
      expect(columns).toContain("cacheKey");
      expect(columns).toContain("nodeType");
      expect(columns).toContain("hitCount");
      expect(columns).toContain("lastHitAt");
      expect(columns).toContain("ttlSeconds");
      expect(columns).toContain("valueSizeBytes");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("createdAt");
    });
  });

  describe("workflowAuditEvents table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowAuditEvents);
      expect(columns).toContain("id");
      expect(columns).toContain("workflowId");
      expect(columns).toContain("executionId");
      expect(columns).toContain("nodeId");
      expect(columns).toContain("eventType");
      expect(columns).toContain("actorId");
      expect(columns).toContain("data");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("traceId");
      expect(columns).toContain("createdAt");
    });
  });

  describe("workflowSecrets table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowSecrets);
      expect(columns).toContain("id");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("name");
      expect(columns).toContain("encryptedValue");
      expect(columns).toContain("vaultBackend");
      expect(columns).toContain("description");
      expect(columns).toContain("createdBy");
      expect(columns).toContain("updatedBy");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("workflowPolicyRules table", () => {
    it("has required columns", () => {
      const columns = Object.keys(workflowPolicyRules);
      expect(columns).toContain("id");
      expect(columns).toContain("tenantId");
      expect(columns).toContain("ruleType");
      expect(columns).toContain("condition");
      expect(columns).toContain("action");
      expect(columns).toContain("priority");
      expect(columns).toContain("enabled");
      expect(columns).toContain("description");
      expect(columns).toContain("workflowIds");
      expect(columns).toContain("createdBy");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });
});
```

### Python-side Integration Tests

The Python backend also needs to verify it can query these tables. This test file goes in the Python test suite.

**Test File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_schema.py`

```python
"""
Tests for Section 13: Database Schema Changes (Python-side verification)

Validates that the new workflow engine tables exist in PostgreSQL and have
the expected columns. These are integration tests that require a running
database with the Drizzle migration applied.
"""
import pytest
from sqlalchemy import text, inspect
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.integration
class TestWorkflowEngineSchema:
    """Verify new tables exist and have expected structure."""

    async def _table_exists(self, session: AsyncSession, table_name: str) -> bool:
        """Check if a table exists in the public schema."""
        result = await session.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :name)"
            ),
            {"name": table_name},
        )
        return result.scalar()

    async def _get_columns(self, session: AsyncSession, table_name: str) -> list[str]:
        """Get column names for a table."""
        result = await session.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :name "
                "ORDER BY ordinal_position"
            ),
            {"name": table_name},
        )
        return [row[0] for row in result.fetchall()]

    @pytest.mark.asyncio
    async def test_workflow_executions_table_exists(self, db_session: AsyncSession):
        """Table created with all columns."""
        assert await self._table_exists(db_session, "workflow_executions")
        columns = await self._get_columns(db_session, "workflow_executions")
        assert "id" in columns
        assert "workflowId" in columns
        assert "tenantId" in columns
        assert "status" in columns
        assert "threadId" in columns

    @pytest.mark.asyncio
    async def test_dlq_table_exists(self, db_session: AsyncSession):
        """DLQ table created."""
        assert await self._table_exists(db_session, "workflow_dead_letter_queue")
        columns = await self._get_columns(db_session, "workflow_dead_letter_queue")
        assert "inputData" in columns
        assert "error" in columns
        assert "retryCount" in columns
        assert "status" in columns

    @pytest.mark.asyncio
    async def test_audit_events_table_exists(self, db_session: AsyncSession):
        """Audit table created."""
        assert await self._table_exists(db_session, "workflow_audit_events")
        columns = await self._get_columns(db_session, "workflow_audit_events")
        assert "eventType" in columns
        assert "traceId" in columns

    @pytest.mark.asyncio
    async def test_secrets_table_encrypted(self, db_session: AsyncSession):
        """Encrypted column stores ciphertext, not plaintext."""
        assert await self._table_exists(db_session, "workflow_secrets")
        columns = await self._get_columns(db_session, "workflow_secrets")
        assert "encryptedValue" in columns
        assert "vaultBackend" in columns
        # Column name signals encryption -- actual encryption tested in Section 8

    @pytest.mark.asyncio
    async def test_policy_rules_table_exists(self, db_session: AsyncSession):
        """Policy rules table created (Phase 2 placeholder)."""
        assert await self._table_exists(db_session, "workflow_policy_rules")
        columns = await self._get_columns(db_session, "workflow_policy_rules")
        assert "ruleType" in columns
        assert "condition" in columns
        assert "action" in columns
        assert "priority" in columns
        assert "enabled" in columns

    @pytest.mark.asyncio
    async def test_cache_metadata_table_exists(self, db_session: AsyncSession):
        """Cache metadata table created."""
        assert await self._table_exists(db_session, "workflow_cache_metadata")
        columns = await self._get_columns(db_session, "workflow_cache_metadata")
        assert "cacheKey" in columns
        assert "hitCount" in columns
        assert "ttlSeconds" in columns
```

---

## Indexes Summary

| Table | Index Name | Column(s) | Purpose |
|-------|-----------|-----------|---------|
| `workflow_executions` | `workflow_executions_workflow_idx` | `workflowId` | List executions per workflow |
| `workflow_executions` | `workflow_executions_tenant_idx` | `tenantId` | Tenant isolation queries |
| `workflow_executions` | `workflow_executions_user_idx` | `userId` | User's execution history |
| `workflow_executions` | `workflow_executions_status_idx` | `status` | Filter by running/failed/etc. |
| `workflow_executions` | `workflow_executions_thread_idx` | `threadId` | Correlate with LangGraph checkpoints |
| `workflow_executions` | `workflow_executions_created_idx` | `createdAt` | Chronological listing |
| `workflow_dead_letter_queue` | `dlq_workflow_idx` | `workflowId` | DLQ items per workflow |
| `workflow_dead_letter_queue` | `dlq_execution_idx` | `executionId` | DLQ items per execution |
| `workflow_dead_letter_queue` | `dlq_status_idx` | `status` | Filter pending/resolved |
| `workflow_dead_letter_queue` | `dlq_tenant_idx` | `tenantId` | Tenant isolation |
| `workflow_dead_letter_queue` | `dlq_created_idx` | `createdAt` | Chronological listing |
| `workflow_cache_metadata` | `cache_metadata_node_type_idx` | `nodeType` | Stats per node type |
| `workflow_cache_metadata` | `cache_metadata_tenant_idx` | `tenantId` | Tenant isolation |
| `workflow_cache_metadata` | `cache_metadata_last_hit_idx` | `lastHitAt` | Find stale cache entries |
| `workflow_audit_events` | `audit_events_workflow_idx` | `workflowId` | Audit trail per workflow |
| `workflow_audit_events` | `audit_events_execution_idx` | `executionId` | Audit trail per execution |
| `workflow_audit_events` | `audit_events_event_type_idx` | `eventType` | Filter by event type |
| `workflow_audit_events` | `audit_events_tenant_idx` | `tenantId` | Tenant isolation |
| `workflow_audit_events` | `audit_events_actor_idx` | `actorId` | Audit trail per user |
| `workflow_audit_events` | `audit_events_trace_idx` | `traceId` | Cross-system trace correlation |
| `workflow_audit_events` | `audit_events_created_idx` | `createdAt` | Chronological listing |
| `workflow_secrets` | `workflow_secrets_tenant_name_unique` | `(tenantId, name)` UNIQUE | Prevent duplicate secret names per tenant |
| `workflow_secrets` | `workflow_secrets_tenant_idx` | `tenantId` | Tenant isolation |
| `workflow_policy_rules` | `policy_rules_tenant_idx` | `tenantId` | Tenant isolation |
| `workflow_policy_rules` | `policy_rules_type_idx` | `ruleType` | Filter by rule type |
| `workflow_policy_rules` | `policy_rules_enabled_idx` | `enabled` | Filter active rules |
| `workflow_policy_rules` | `policy_rules_priority_idx` | `priority` | Ordered rule evaluation |

---

## Foreign Key Relationships

```
workflows (id) ─────────── workflow_executions.workflowId (CASCADE)
tenants (id) ──────────── workflow_executions.tenantId (CASCADE)
users (id) ────────────── workflow_executions.userId (NO ACTION)

workflows (id) ─────────── workflow_dead_letter_queue.workflowId (CASCADE)
workflow_executions (id) ── workflow_dead_letter_queue.executionId (SET NULL)
tenants (id) ──────────── workflow_dead_letter_queue.tenantId (CASCADE)

tenants (id) ──────────── workflow_cache_metadata.tenantId (CASCADE)

workflows (id) ─────────── workflow_audit_events.workflowId (CASCADE)
workflow_executions (id) ── workflow_audit_events.executionId (SET NULL)
users (id) ────────────── workflow_audit_events.actorId (NO ACTION)
tenants (id) ──────────── workflow_audit_events.tenantId (CASCADE)

tenants (id) ──────────── workflow_secrets.tenantId (CASCADE)
users (id) ────────────── workflow_secrets.createdBy (NO ACTION)
users (id) ────────────── workflow_secrets.updatedBy (NO ACTION)

tenants (id) ──────────── workflow_policy_rules.tenantId (CASCADE)
users (id) ────────────── workflow_policy_rules.createdBy (NO ACTION)
```

**Design decisions on CASCADE vs SET NULL**:
- `workflowId` uses CASCADE: deleting a workflow should clean up all its executions, DLQ items, and audit events.
- `executionId` on DLQ and audit events uses SET NULL: execution records might be cleaned up by retention policies, but the DLQ/audit data should survive for compliance.
- `userId`/`actorId`/`createdBy`/`updatedBy` uses NO ACTION (default): users should not be deleted while referenced data exists.
- `tenantId` uses CASCADE: tenant deletion should clean up all tenant-scoped data.

---

## Conventions Applied

All definitions follow the existing patterns in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`:

- `pgTable` with string literal table names using snake_case
- `serial("id").primaryKey()` for auto-incrementing integer PKs
- `camelCase` column names in both TypeScript and database
- `timestamp("...", { withTimezone: true })` for all timestamp columns
- `.defaultNow().notNull()` for `createdAt`
- `json("...").$type<T>()` for typed JSON columns
- `varchar` with explicit `length` for bounded strings
- `text` for unbounded strings (errors, descriptions, encrypted values)
- Index definitions in the table callback using `(t) => [...]` syntax
- Type exports: `typeof table.$inferSelect` and `typeof table.$inferInsert`
- `pgEnum` with snake_case database names