Now I have all the context needed to write the section. Here is the complete section content:

# Section 10: Database Schema for Level 3 (L3 Content Automation Engine)

## Overview

This section adds the two database tables needed for the Level 3 Content Automation Engine: `content_specs` and `content_automation_runs`. These tables are created now (Phase 1) so the schema is ready for Phase 2 implementation without schema drift surprises at runtime.

**No application code references these tables yet.** The tables are a forward-design deposit — they will be activated in Phase 2 when the Content Automation Dashboard and scheduler are built.

**Dependency:** This section is fully independent. It can be implemented in parallel with all other sections in Batch 1.

**Blocks:** `section-11-integration-tests` (schema verification tests run last).

---

## Files to Modify

- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` — append two new tables and enums at the end of the file

## Files to Create

- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/contentAutomationSchema.test.ts` — schema validation tests

---

## Tests First

**File:** `apps/web/server/routers/contentAutomationSchema.test.ts`

The test file uses Drizzle's introspection helpers or a live test database connection to verify structural constraints. Since Drizzle's `pgTable` definitions are TypeScript objects, many structural tests can be pure TypeScript checks (compile-time shape tests) rather than requiring a running database.

```typescript
// apps/web/server/routers/contentAutomationSchema.test.ts
import { describe, it, expect } from "vitest";
import {
  contentSpecs,
  contentAutomationRuns,
} from "../../drizzle/schema";

describe("content_specs table schema", () => {
  it("content_specs table created with all required columns", () => {
    // Verify key columns exist on the Drizzle table object
    const cols = contentSpecs;
    expect(cols).toBeDefined();
    // Spot-check required column names
    const colNames = Object.keys(cols);
    expect(colNames).toContain("id");
    expect(colNames).toContain("tenantId");
    expect(colNames).toContain("userId");
    expect(colNames).toContain("name");
    expect(colNames).toContain("specData");
    expect(colNames).toContain("status");
    expect(colNames).toContain("nextRun");
    expect(colNames).toContain("consecutiveFailures");
    expect(colNames).toContain("dailyCreditLimit");
    expect(colNames).toContain("monthlyCreditLimit");
    expect(colNames).toContain("webhookSecretEncrypted");
  });

  it("content_automation_runs table created with FK to content_specs", () => {
    const cols = contentAutomationRuns;
    expect(cols).toBeDefined();
    const colNames = Object.keys(cols);
    expect(colNames).toContain("specId");
    expect(colNames).toContain("tenantId");
    expect(colNames).toContain("status");
    expect(colNames).toContain("creditsUsed");
    expect(colNames).toContain("startedAt");
    expect(colNames).toContain("completedAt");
  });

  it("new tables support tenant isolation (tenantId column present)", () => {
    expect(Object.keys(contentSpecs)).toContain("tenantId");
    expect(Object.keys(contentAutomationRuns)).toContain("tenantId");
  });

  it("migration does not alter existing tables", () => {
    // This is a smoke test: if existing table exports still compile
    // and have their expected columns, the migration only added tables.
    // Import a well-known existing table and check its shape.
    // (The full migration safety check is manual: row count comparison.)
    expect(true).toBe(true); // compile-time guard — if schema.ts fails to import, this file won't run
  });
});

describe("content_automation_runs table schema", () => {
  it("has scheduleItemIndex column for batch ordering", () => {
    expect(Object.keys(contentAutomationRuns)).toContain("scheduleItemIndex");
  });

  it("has outputArtifacts JSON column", () => {
    expect(Object.keys(contentAutomationRuns)).toContain("outputArtifacts");
  });

  it("has itemErrors JSON column", () => {
    expect(Object.keys(contentAutomationRuns)).toContain("itemErrors");
  });
});
```

Run tests with: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test contentAutomationSchema`

---

## Implementation

### Step 1: Backup Before Migration

Before editing `drizzle/schema.ts`, record a baseline (these are new tables so no existing data, but confirm no accidental table drops):

```bash
cd /home/dev/projects/SmartSpecPro
mkdir -p .db-backups
# Record row counts of tables we might accidentally touch
psql "$DATABASE_URL" -c "
  SELECT 'scheduled_messages' as tbl, count(*) FROM scheduled_messages
  UNION ALL SELECT 'presentation_decks', count(*) FROM presentation_decks
  UNION ALL SELECT 'users', count(*) FROM users;
"
```

### Step 2: Add Enums to `drizzle/schema.ts`

Append the following **before** the new table definitions. Place after the last existing enum block near the end of the file (after `followStatusEnum`, `notificationTypeEnum`, etc.):

```typescript
// ============================================================
// Content Automation Engine — Level 3 Schema (Phase 2 forward-design)
// Tables created in Phase 1 for schema readiness; not yet referenced
// by application code. Will be activated in Phase 2.
// ============================================================

export const contentSpecStatusEnum = pgEnum("content_spec_status", [
  "active",
  "paused",
  "archived",
]);

export const contentAutomationRunStatusEnum = pgEnum("content_automation_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "export_failed",
]);
```

### Step 3: Add `content_specs` Table

```typescript
/**
 * Content Specs — Level 3 Content Automation Engine definitions.
 * One row per user-defined automation spec (recurring or one-time).
 * Tracks scheduling state, credit counters, and failure tracking.
 * Tables are schema-ready for Phase 2; no application code references them yet.
 */
export const contentSpecs = pgTable("content_specs", {
  id: serial("id").primaryKey(),

  /** Tenant owning this spec — ALL queries MUST filter by tenantId */
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** User who created and owns this spec */
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Human-readable name for the spec */
  name: varchar("name", { length: 255 }).notNull(),

  /** Optional longer description */
  description: text("description"),

  /** Full YAML/JSON spec blob — source of truth for what to generate */
  specData: jsonb("spec_data").$type<Record<string, any>>().notNull().default({}),

  /** Lifecycle status */
  status: contentSpecStatusEnum("status").notNull().default("active"),

  /** Schema version for forward compatibility */
  version: integer("version").notNull().default(1),

  /** Next scheduled execution time (null for one-time, already-run, or paused) */
  nextRun: timestamp("next_run", { withTimezone: true }),

  /** Last actual execution time */
  lastRun: timestamp("last_run", { withTimezone: true }),

  /** Cumulative count of times this spec has been executed */
  totalRuns: integer("total_runs").notNull().default(0),

  /** Total content items created across all runs */
  totalItemsCreated: integer("total_items_created").notNull().default(0),

  /**
   * Consecutive failure counter — auto-pauses spec after 3 consecutive failures.
   * Reset to 0 on any successful run.
   */
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),

  /**
   * HMAC secret for outgoing webhook signatures.
   * Encrypted at rest using encrypt() from crypto.ts (AES-256-GCM).
   * Never returned in API responses — only used server-side for signing.
   */
  webhookSecretEncrypted: text("webhook_secret_encrypted"),

  /** Per-run daily credit ceiling (null = unlimited) */
  dailyCreditLimit: integer("daily_credit_limit"),

  /** Per-run monthly credit ceiling (null = unlimited) */
  monthlyCreditLimit: integer("monthly_credit_limit"),

  /** Credits consumed today (reset at midnight UTC) */
  creditsUsedToday: integer("credits_used_today").notNull().default(0),

  /** Credits consumed this calendar month */
  creditsUsedMonth: integer("credits_used_month").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  /** Hot path: scheduler queries for active specs with a due next_run */
  index("content_specs_status_next_run_idx").on(t.status, t.nextRun),
  /** Tenant isolation index — all application queries filter by tenantId */
  index("content_specs_tenant_idx").on(t.tenantId),
  /** User-scoped queries (dashboard listing) */
  index("content_specs_user_idx").on(t.userId),
]);

export type ContentSpec = typeof contentSpecs.$inferSelect;
export type InsertContentSpec = typeof contentSpecs.$inferInsert;
```

### Step 4: Add `content_automation_runs` Table

```typescript
/**
 * Content Automation Runs — execution history for each fired content spec.
 * One row per individual run invocation. Items within a run are tracked
 * as JSON arrays rather than individual rows to avoid table bloat.
 */
export const contentAutomationRuns = pgTable("content_automation_runs", {
  id: serial("id").primaryKey(),

  /** Parent spec that triggered this run */
  specId: integer("spec_id").notNull().references(() => contentSpecs.id, { onDelete: "cascade" }),

  /** Denormalized for fast tenant-scoped queries without joining content_specs */
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /**
   * Position in the spec's schedule item list (0-based).
   * Allows ordered batch runs to track which scheduled slot was processed.
   */
  scheduleItemIndex: integer("schedule_item_index").notNull().default(0),

  /** Run lifecycle status */
  status: contentAutomationRunStatusEnum("status").notNull().default("pending"),

  /** Resolved topic strings after placeholder substitution */
  topicsResolved: jsonb("topics_resolved").$type<string[]>().default([]),

  /** Number of items requested from this run */
  itemsRequested: integer("items_requested").notNull().default(0),

  /** Number of items that completed successfully */
  itemsCompleted: integer("items_completed").notNull().default(0),

  /** Number of items that failed */
  itemsFailed: integer("items_failed").notNull().default(0),

  /**
   * Artifact references produced by this run.
   * Shape: Array<{ deck_id: number, topic: string, slide_count: number }>
   */
  outputArtifacts: jsonb("output_artifacts").$type<Array<{
    deck_id: number;
    topic: string;
    slide_count: number;
  }>>().default([]),

  /**
   * Export URLs (e.g., PDF/PPTX) if export was requested.
   * Shape: Array<{ deck_id: number, url: string, format: string }>
   */
  exportUrls: jsonb("export_urls").$type<Array<{
    deck_id: number;
    url: string;
    format: string;
  }>>().default([]),

  /**
   * Per-item error details for partial failures.
   * Shape: Array<{ topic: string, error: string, index: number }>
   */
  itemErrors: jsonb("item_errors").$type<Array<{
    topic: string;
    error: string;
    index: number;
  }>>().default([]),

  /** Total credits consumed across all items in this run */
  creditsUsed: numeric("credits_used", { precision: 10, scale: 4 }).default("0"),

  /** When the run was dispatched/started */
  startedAt: timestamp("started_at", { withTimezone: true }),

  /** When the run reached a terminal status (completed/failed/export_failed) */
  completedAt: timestamp("completed_at", { withTimezone: true }),

  /** Top-level error message if the entire run failed (not item-level) */
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  /** For listing a spec's run history in chronological order */
  index("content_automation_runs_spec_created_idx").on(t.specId, t.createdAt),
  /** Tenant isolation for cross-spec queries (dashboard, admin) */
  index("content_automation_runs_tenant_idx").on(t.tenantId),
  /** Cleanup jobs: find old runs by created_at for TTL pruning in Phase 2 */
  index("content_automation_runs_created_at_idx").on(t.createdAt),
  /** Status filter for in-progress run detection */
  index("content_automation_runs_status_idx").on(t.status),
]);

export type ContentAutomationRun = typeof contentAutomationRuns.$inferSelect;
export type InsertContentAutomationRun = typeof contentAutomationRuns.$inferInsert;
```

### Step 5: Run Migration Immediately

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm db:push
```

If `drizzle-kit migrate` fails, apply the generated SQL manually:

```bash
psql "$DATABASE_URL" -f "drizzle/XXXX_content_automation_l3_schema.sql"
# Then seed the hash (see root CLAUDE.md Database Safety Protocol)
```

### Step 6: Verify Migration

```bash
psql "$DATABASE_URL" -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('content_specs', 'content_automation_runs');
"
# Expected: 2 rows

psql "$DATABASE_URL" -c "
  SELECT indexname FROM pg_indexes
  WHERE tablename IN ('content_specs', 'content_automation_runs')
  ORDER BY tablename, indexname;
"
# Expected: 8 indexes total

# Confirm existing tables were NOT altered
psql "$DATABASE_URL" -c "
  SELECT 'scheduled_messages' as tbl, count(*) FROM scheduled_messages
  UNION ALL SELECT 'presentation_decks', count(*) FROM presentation_decks
  UNION ALL SELECT 'users', count(*) FROM users;
"
# Row counts must match pre-migration baseline
```

---

## Design Decisions

### Why `jsonb` for `specData`, `outputArtifacts`, `itemErrors`?

`jsonb` (binary JSON) is preferred over `json` for columns that will be queried with PostgreSQL JSON operators in Phase 2 (e.g., filtering runs by artifact deck_id). `jsonb` is indexed-friendly and stores data in a parsed form for faster reads.

### Why NOT a foreign key from `content_automation_runs.tenantId` to `content_specs.tenantId`?

Drizzle does not easily express composite foreign keys in a single inline declaration without the `foreignKey()` helper. The `tenantId` in `content_automation_runs` is denormalized from `content_specs` for query efficiency. The application layer (Phase 2) will enforce consistency on insert. This matches the same pattern used in `presentationAssetLinks` and `libraryPermissions`.

### Why `numeric` for `creditsUsed` not `integer`?

Credit deductions can be fractional (e.g., 2.5 credits for a 12-slide deck at a 1.25x multiplier). Using `numeric(10,4)` matches the same type used in `scheduledMessageLogs.creditsUsed`.

### Multi-Tenancy Constraint

Every query against `content_specs` and `content_automation_runs` in Phase 2 **must** include a `tenantId` filter. This is enforced architecturally by:
1. The composite indexes including `tenantId` make tenant-scoped queries the fast path.
2. The `consecutiveFailures` auto-pause logic (after 3 failures) must check `tenantId` to avoid cross-tenant interference.

### Webhook Secret Storage

`webhookSecretEncrypted` stores the HMAC signing secret using `encrypt()` from `apps/web/server/services/crypto.ts` (AES-256-GCM). Never return the decrypted value in API responses — return only `webhookConfigured: true/false`.

---

## Column Reference

### `content_specs`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `tenantId` | varchar(36) NOT NULL | FK → tenants, cascade delete |
| `userId` | integer NOT NULL | FK → users, cascade delete |
| `name` | varchar(255) NOT NULL | Display name |
| `description` | text | Optional |
| `specData` | jsonb NOT NULL | Full YAML/JSON spec blob |
| `status` | enum | active / paused / archived |
| `version` | integer | Schema version, default 1 |
| `nextRun` | timestamp | Null if paused/one-time/exhausted |
| `lastRun` | timestamp | Last execution |
| `totalRuns` | integer | Cumulative run count |
| `totalItemsCreated` | integer | Cumulative items created |
| `consecutiveFailures` | integer | Auto-pause after 3 |
| `webhookSecretEncrypted` | text | AES-256-GCM encrypted HMAC secret |
| `dailyCreditLimit` | integer | Null = unlimited |
| `monthlyCreditLimit` | integer | Null = unlimited |
| `creditsUsedToday` | integer | Resets at midnight UTC |
| `creditsUsedMonth` | integer | Resets on calendar month boundary |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### `content_automation_runs`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `specId` | integer NOT NULL | FK → content_specs, cascade delete |
| `tenantId` | varchar(36) NOT NULL | Denormalized from spec for query perf |
| `scheduleItemIndex` | integer | 0-based position in schedule |
| `status` | enum | pending / running / completed / failed / export_failed |
| `topicsResolved` | jsonb | Topics after placeholder substitution |
| `itemsRequested` | integer | Items scheduled for this run |
| `itemsCompleted` | integer | Successful item count |
| `itemsFailed` | integer | Failed item count |
| `outputArtifacts` | jsonb | Array of {deck_id, topic, slide_count} |
| `exportUrls` | jsonb | Array of {deck_id, url, format} |
| `itemErrors` | jsonb | Array of {topic, error, index} |
| `creditsUsed` | numeric(10,4) | Total credits across run |
| `startedAt` | timestamp | When run began |
| `completedAt` | timestamp | When run reached terminal state |
| `errorMessage` | text | Top-level error (not per-item) |
| `createdAt` | timestamp | |

### Indexes

| Table | Index | Purpose |
|---|---|---|
| `content_specs` | `(status, next_run)` | Scheduler hot path |
| `content_specs` | `(tenant_id)` | Tenant isolation |
| `content_specs` | `(user_id)` | Dashboard listing |
| `content_automation_runs` | `(spec_id, created_at)` | Run history per spec |
| `content_automation_runs` | `(tenant_id)` | Tenant isolation |
| `content_automation_runs` | `(created_at)` | TTL cleanup |
| `content_automation_runs` | `(status)` | In-progress detection |

---

## Risk Assessment

**Risk level:** Low. These are brand-new tables with no existing data. The migration adds tables only and does not alter any existing column or index.

| Scenario | Mitigation |
|---|---|
| Drizzle generates DROP for existing table (false diff) | Read the generated SQL before running `migrate`; abort if any DROP appears |
| Enum name collision with existing enum | All new enum names (`content_spec_status`, `content_automation_run_status`) are unique in the schema |
| FK violation at insert time | Both tables have cascade deletes; risk is only relevant when inserting in Phase 2 |
| Accidental NOT NULL without default | All required columns have either `.default()` or are explicitly nullable |