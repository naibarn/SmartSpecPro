diff --git a/apps/web/drizzle/0026_add_funnel_events.sql b/apps/web/drizzle/0026_add_funnel_events.sql
new file mode 100644
index 0000000..4918c8e
--- /dev/null
+++ b/apps/web/drizzle/0026_add_funnel_events.sql
@@ -0,0 +1,31 @@
+CREATE TABLE IF NOT EXISTS "funnel_events" (
+  "id" serial PRIMARY KEY NOT NULL,
+  "tenantId" varchar(36) NOT NULL,
+  "domain" varchar(255),
+  "userId" integer,
+  "eventName" varchar(128) NOT NULL,
+  "eventTime" timestamp with time zone NOT NULL,
+  "eventKey" varchar(255) NOT NULL,
+  "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
+  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
+);
+--> statement-breakpoint
+ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
+--> statement-breakpoint
+ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
+--> statement-breakpoint
+CREATE UNIQUE INDEX IF NOT EXISTS "funnel_events_event_key_unique" ON "funnel_events" USING btree ("eventKey");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "funnel_events_tenant_event_time_idx" ON "funnel_events" USING btree ("tenantId","eventTime");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "funnel_events_domain_event_time_idx" ON "funnel_events" USING btree ("domain","eventTime");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "funnel_events_name_event_time_idx" ON "funnel_events" USING btree ("eventName","eventTime");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "funnel_events_user_name_time_idx" ON "funnel_events" USING btree ("userId","eventName","eventTime");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "registration_events_created_user_idx" ON "registration_events" USING btree ("createdAt","userId");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("createdAt");
+--> statement-breakpoint
+CREATE INDEX IF NOT EXISTS "credit_transactions_type_created_idx" ON "credit_transactions" USING btree ("type","createdAt");
diff --git a/apps/web/drizzle/meta/_journal.json b/apps/web/drizzle/meta/_journal.json
index 7af7f22..f3c48ba 100644
--- a/apps/web/drizzle/meta/_journal.json
+++ b/apps/web/drizzle/meta/_journal.json
@@ -176,6 +176,20 @@
       "when": 1771055133024,
       "tag": "0024_opposite_exiles",
       "breakpoints": true
+    },
+    {
+      "idx": 25,
+      "version": "7",
+      "when": 1771230569335,
+      "tag": "0025_add_cloud_task_events",
+      "breakpoints": true
+    },
+    {
+      "idx": 26,
+      "version": "7",
+      "when": 1771275000000,
+      "tag": "0026_add_funnel_events",
+      "breakpoints": true
     }
   ]
-}
\ No newline at end of file
+}
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 4253575..4f249be 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -223,6 +223,7 @@ export const creditTransactions = pgTable("credit_transactions", {
   uniqueIndex("credit_transactions_idempotency_key_unique")
     .on(t.idempotencyKey)
     .where(sql`"idempotencyKey" IS NOT NULL`),
+  index("credit_transactions_type_created_idx").on(t.type, t.createdAt),
 ]);
 
 export type CreditTransaction = typeof creditTransactions.$inferSelect;
@@ -1161,7 +1162,9 @@ export const messages = pgTable("messages", {
   parentMessageId: integer("parentMessageId"),
 
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
-});
+}, (t) => [
+  index("messages_created_at_idx").on(t.createdAt),
+]);
 
 export type Message = typeof messages.$inferSelect;
 export type InsertMessage = typeof messages.$inferInsert;
@@ -2419,7 +2422,9 @@ export const registrationEvents = pgTable("registration_events", {
   outcome: varchar("outcome", { length: 20 }).notNull(), // allowed, flagged, blocked
   metadata: json("metadata").$type<Record<string, any>>(),
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
-});
+}, (t) => [
+  index("registration_events_created_user_idx").on(t.createdAt, t.userId),
+]);
 
 /** Links browser fingerprint hashes to users */
 export const deviceFingerprints = pgTable("device_fingerprints", {
@@ -3128,3 +3133,40 @@ export const cloudTaskEvents = pgTable("cloud_task_events", {
 
 export type CloudTaskEvent = typeof cloudTaskEvents.$inferSelect;
 export type InsertCloudTaskEvent = typeof cloudTaskEvents.$inferInsert;
+
+// Funnel Events — Canonical milestone analytics stream
+export const funnelEvents = pgTable("funnel_events", {
+  id: serial("id").primaryKey(),
+
+  /** Tenant scope for analytics isolation and query performance */
+  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
+
+  /** Domain scope for domain-admin fallback and attribution compatibility */
+  domain: varchar("domain", { length: 255 }),
+
+  /** User scope for first-event semantics and per-user drilldown */
+  userId: integer("userId").references(() => users.id, { onDelete: "set null" }),
+
+  /** Canonical milestone event name */
+  eventName: varchar("eventName", { length: 128 }).notNull(),
+
+  /** Canonical UTC timestamp used for all aggregations */
+  eventTime: timestamp("eventTime", { withTimezone: true }).notNull(),
+
+  /** Deterministic dedup key used for insert-once contract */
+  eventKey: varchar("eventKey", { length: 255 }).notNull(),
+
+  /** Flexible metadata payload for drilldown and export */
+  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
+
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  uniqueIndex("funnel_events_event_key_unique").on(t.eventKey),
+  index("funnel_events_tenant_event_time_idx").on(t.tenantId, t.eventTime),
+  index("funnel_events_domain_event_time_idx").on(t.domain, t.eventTime),
+  index("funnel_events_name_event_time_idx").on(t.eventName, t.eventTime),
+  index("funnel_events_user_name_time_idx").on(t.userId, t.eventName, t.eventTime),
+]);
+
+export type FunnelEvent = typeof funnelEvents.$inferSelect;
+export type InsertFunnelEvent = typeof funnelEvents.$inferInsert;
diff --git a/apps/web/server/__tests__/funnelEvents.migration.test.ts b/apps/web/server/__tests__/funnelEvents.migration.test.ts
new file mode 100644
index 0000000..1d0eedc
--- /dev/null
+++ b/apps/web/server/__tests__/funnelEvents.migration.test.ts
@@ -0,0 +1,48 @@
+import fs from "fs";
+import path from "path";
+import { describe, it, expect } from "vitest";
+
+const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
+const journalPath = path.join(drizzleDir, "meta/_journal.json");
+const migrationPath = path.join(drizzleDir, "0026_add_funnel_events.sql");
+
+describe("funnel_events migration", () => {
+  it("has a journal entry in the next migration slot", () => {
+    expect(fs.existsSync(journalPath)).toBe(true);
+    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
+      entries: Array<{ idx: number; tag: string }>;
+    };
+
+    const latest = journal.entries[journal.entries.length - 1];
+    expect(latest).toBeDefined();
+    expect(latest.idx).toBe(26);
+    expect(latest.tag).toBe("0026_add_funnel_events");
+  });
+
+  it("creates funnel_events and required supporting indexes", () => {
+    expect(fs.existsSync(migrationPath)).toBe(true);
+    const content = fs.readFileSync(migrationPath, "utf-8");
+
+    expect(content).toContain('CREATE TABLE IF NOT EXISTS "funnel_events"');
+    expect(content).toContain('"eventKey" varchar(255) NOT NULL');
+    expect(content).toContain('"eventTime" timestamp with time zone NOT NULL');
+
+    expect(content).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "funnel_events_event_key_unique"');
+    expect(content).toContain('CREATE INDEX IF NOT EXISTS "funnel_events_tenant_event_time_idx"');
+    expect(content).toContain('CREATE INDEX IF NOT EXISTS "funnel_events_domain_event_time_idx"');
+    expect(content).toContain('CREATE INDEX IF NOT EXISTS "funnel_events_name_event_time_idx"');
+    expect(content).toContain('CREATE INDEX IF NOT EXISTS "funnel_events_user_name_time_idx"');
+
+    expect(content).toContain('CREATE INDEX IF NOT EXISTS "registration_events_created_user_idx"');
+    expect(content).toContain('CREATE INDEX IF NOT EXISTS "messages_created_at_idx"');
+    expect(content).toContain('CREATE INDEX IF NOT EXISTS "credit_transactions_type_created_idx"');
+  });
+
+  it("remains additive and non-destructive", () => {
+    const content = fs.readFileSync(migrationPath, "utf-8");
+
+    expect(content).not.toMatch(/\bDROP\s+TABLE\b/i);
+    expect(content).not.toMatch(/\bDROP\s+COLUMN\b/i);
+    expect(content).not.toMatch(/\bALTER\s+TABLE\b[\s\S]*\bDROP\b/i);
+  });
+});
diff --git a/apps/web/server/__tests__/funnelEvents.schema.test.ts b/apps/web/server/__tests__/funnelEvents.schema.test.ts
new file mode 100644
index 0000000..85747bf
--- /dev/null
+++ b/apps/web/server/__tests__/funnelEvents.schema.test.ts
@@ -0,0 +1,41 @@
+import { describe, it, expect } from "vitest";
+import { getTableColumns, getTableName } from "drizzle-orm";
+import { getTableConfig } from "drizzle-orm/pg-core";
+
+describe("funnel_events schema", () => {
+  it("defines funnel_events with required columns", async () => {
+    const schema = await import("@db/schema");
+    expect(schema.funnelEvents).toBeDefined();
+
+    const table = schema.funnelEvents;
+    expect(getTableName(table)).toBe("funnel_events");
+
+    const columns = getTableColumns(table);
+    expect(columns).toHaveProperty("id");
+    expect(columns).toHaveProperty("tenantId");
+    expect(columns).toHaveProperty("domain");
+    expect(columns).toHaveProperty("userId");
+    expect(columns).toHaveProperty("eventName");
+    expect(columns).toHaveProperty("eventTime");
+    expect(columns).toHaveProperty("eventKey");
+    expect(columns).toHaveProperty("properties");
+    expect(columns).toHaveProperty("createdAt");
+
+    expect(columns.tenantId.notNull).toBe(true);
+    expect(columns.eventName.notNull).toBe(true);
+    expect(columns.eventTime.notNull).toBe(true);
+    expect(columns.eventKey.notNull).toBe(true);
+  });
+
+  it("includes unique and analytics indexes", async () => {
+    const schema = await import("@db/schema");
+    const config = getTableConfig(schema.funnelEvents);
+    const indexNames = config.indexes.map((idx) => idx.config.name);
+
+    expect(indexNames).toContain("funnel_events_event_key_unique");
+    expect(indexNames).toContain("funnel_events_tenant_event_time_idx");
+    expect(indexNames).toContain("funnel_events_domain_event_time_idx");
+    expect(indexNames).toContain("funnel_events_name_event_time_idx");
+    expect(indexNames).toContain("funnel_events_user_name_time_idx");
+  });
+});
diff --git a/specs/feature/014-Core-Funnel-Dashboard/implementation-blocked-tasks.md b/specs/feature/014-Core-Funnel-Dashboard/implementation-blocked-tasks.md
new file mode 100644
index 0000000..6a59fab
--- /dev/null
+++ b/specs/feature/014-Core-Funnel-Dashboard/implementation-blocked-tasks.md
@@ -0,0 +1,3 @@
+# Implementation Blocked Tasks
+
+No blocked tasks currently.
diff --git a/specs/feature/014-Core-Funnel-Dashboard/implementation-decision-log.md b/specs/feature/014-Core-Funnel-Dashboard/implementation-decision-log.md
new file mode 100644
index 0000000..75ecf19
--- /dev/null
+++ b/specs/feature/014-Core-Funnel-Dashboard/implementation-decision-log.md
@@ -0,0 +1,38 @@
+# Implementation Decision Log
+
+## 2026-02-16
+
+### Section / Step
+- Preflight branch/worktree handling
+
+### Options Considered
+- `proceed_here`
+- `switch_branch`
+- `stop`
+
+### Decision Taken
+- `proceed_here`
+
+### Mode Used
+- `asked` (`smart_auto`, high-impact)
+
+### Rationale
+- User explicitly approved implementation on current dirty `main`; changes are being isolated to funnel feature files.
+
+---
+
+### Section / Step
+- Section 01 supporting index scope
+
+### Options Considered
+- Add broad index set across many source tables
+- Add targeted index set on highest-impact aggregation sources
+
+### Decision Taken
+- Add targeted index set: `registration_events`, `messages`, `credit_transactions`
+
+### Mode Used
+- `auto` (`smart_auto`, low-impact)
+
+### Rationale
+- Keeps migration additive with lower lock/write overhead while covering core funnel milestone query paths.
diff --git a/specs/feature/014-Core-Funnel-Dashboard/implementation-progress.md b/specs/feature/014-Core-Funnel-Dashboard/implementation-progress.md
new file mode 100644
index 0000000..b67f87b
--- /dev/null
+++ b/specs/feature/014-Core-Funnel-Dashboard/implementation-progress.md
@@ -0,0 +1,14 @@
+# Implementation Progress
+
+## Section 01: Data Schema, Migration, and Index Foundation
+- Status: completed
+- Commit: pending
+- Test command: `npm --workspace @smartspec/web test`
+- Section test run:
+  - `npm --workspace @smartspec/web test -- server/__tests__/funnelEvents.schema.test.ts server/__tests__/funnelEvents.migration.test.ts` (pass)
+- Regression subset:
+  - `npm --workspace @smartspec/web test -- server/__tests__/cloudTaskEvents.schema.test.ts server/__tests__/migrationOrdering.test.ts` (pass)
+- Notable deviations:
+  - Supporting indexes were limited to `registration_events`, `messages`, and `credit_transactions`.
+- Blocked tasks resolved/remaining:
+  - none / none
diff --git a/specs/feature/014-Core-Funnel-Dashboard/reviews/section-01-review.md b/specs/feature/014-Core-Funnel-Dashboard/reviews/section-01-review.md
new file mode 100644
index 0000000..2fdf6e4
--- /dev/null
+++ b/specs/feature/014-Core-Funnel-Dashboard/reviews/section-01-review.md
@@ -0,0 +1,18 @@
+# Section 01 Review
+
+## Scope Reviewed
+- `apps/web/drizzle/schema.ts`
+- `apps/web/drizzle/0026_add_funnel_events.sql`
+- `apps/web/drizzle/meta/_journal.json`
+- `apps/web/server/__tests__/funnelEvents.schema.test.ts`
+- `apps/web/server/__tests__/funnelEvents.migration.test.ts`
+
+## Findings
+- No correctness regressions found in the schema/migration slice.
+- Dedup contract is enforced at DB level (`funnel_events_event_key_unique`) and validated by tests.
+- Migration remains additive (new table + new indexes only).
+- Supporting indexes selected are aligned to planned funnel event producers and keep lock scope bounded.
+
+## Risks / Follow-Ups
+- `messages_created_at_idx` is broad and can increase write overhead; keep and validate benefit during section-04 query performance checks.
+- Additional source-table indexes may still be needed after real query-plan analysis.
diff --git a/specs/feature/014-Core-Funnel-Dashboard/sections/section-01-data-schema-migration-and-index-foundation.md b/specs/feature/014-Core-Funnel-Dashboard/sections/section-01-data-schema-migration-and-index-foundation.md
new file mode 100644
index 0000000..159d6ec
--- /dev/null
+++ b/specs/feature/014-Core-Funnel-Dashboard/sections/section-01-data-schema-migration-and-index-foundation.md
@@ -0,0 +1,85 @@
+# Section 01: Data Schema, Migration, and Index Foundation
+
+## Objective
+Establish the additive database foundation for funnel analytics by introducing `funnel_events` and performance-critical indexes, without regressing existing auth, credit, or analytics workloads.
+
+## Scope
+- Define `funnel_events` schema in Drizzle with columns needed for milestone analytics, tenant/domain scoping, dedup keys, and event timestamps.
+- Add non-destructive indexes for high-read analytics paths on both new and existing tables.
+- Prepare migration sequencing and operational checks for low-lock production execution.
+- Ensure schema supports deterministic first-event uniqueness constraints required by later sections.
+
+## Out of Scope
+- Tracker service behavior and side-channel analytics calls.
+- Event instrumentation in business flows.
+- Router procedures and frontend rendering.
+- Backfill execution logic.
+
+## Dependencies
+- None. This is the root section.
+
+## Implementation Tasks
+1. Extend Drizzle schema with `funnel_events` table including explicit scoping fields (`tenant`, `domain`, `user`, `event_name`, `event_time`, `event_key`, properties payload).
+2. Add DB-level uniqueness strategy for deterministic first-event dedup contract (`event_key` uniqueness or equivalent constrained index).
+3. Add planned supporting indexes on existing tables used by funnel aggregations (time-bucket and user/tenant query paths).
+4. Generate migration files with additive operations only.
+5. Validate migration ordering with current journal state and avoid renumbering collisions.
+6. Write migration-run instructions with pre/post checks (index existence, row-count sanity, query plan smoke checks).
+
+## TDD-First Test Stubs
+- Test: schema contract includes required `funnel_events` columns and index definitions.
+- Test: uniqueness constraint rejects duplicate first-event records with identical dedup key.
+- Test: migration ordering test confirms new migration appears in expected sequence.
+- Test: non-destructive migration check ensures no drop/alter operations on existing critical columns.
+- Test: index presence verification confirms required indexes are created after migration.
+
+## Risk Controls
+- Use additive expand-first migration sequence only.
+- Keep migration rollback-safe by allowing feature-flag disable without schema rollback for routine incidents.
+- Schedule lock-sensitive index operations for low-traffic windows and capture pre-run DB snapshot metadata.
+
+## Deliverables
+- Updated Drizzle schema and migration files.
+- Migration execution and verification checklist.
+- Schema/index test coverage proving dedup and index contract readiness.
+
+## Done Criteria
+- `funnel_events` exists with dedup-ready uniqueness enforcement.
+- Required analytics indexes exist and are verifiable.
+- Migration and schema tests pass in CI.
+- No destructive schema behavior introduced.
+
+## As-Built Update (2026-02-16)
+
+### Files Changed
+- `apps/web/drizzle/schema.ts`
+- `apps/web/drizzle/0026_add_funnel_events.sql`
+- `apps/web/drizzle/meta/_journal.json`
+- `apps/web/server/__tests__/funnelEvents.schema.test.ts`
+- `apps/web/server/__tests__/funnelEvents.migration.test.ts`
+
+### Implementation Notes
+- Added `funnel_events` Drizzle schema with required scope columns, canonical event timestamp, deterministic dedup key, and JSONB properties payload.
+- Added DB-level uniqueness via `funnel_events_event_key_unique`.
+- Added analytics indexes for tenant/domain/event and user drilldown query paths.
+- Added supporting indexes for existing aggregation-heavy sources:
+  - `registration_events_created_user_idx`
+  - `messages_created_at_idx`
+  - `credit_transactions_type_created_idx`
+
+### Deviation From Plan
+- Supporting indexes on existing tables were narrowed to three high-impact paths (`registration_events`, `messages`, `credit_transactions`) for low-lock rollout safety. Additional read-optimization indexes can be added after query profiling in section 04.
+
+### Tests Added
+- `apps/web/server/__tests__/funnelEvents.schema.test.ts`
+- `apps/web/server/__tests__/funnelEvents.migration.test.ts`
+
+### Migration Run Instructions (Section 01)
+1. Pre-check:
+   - Confirm journal sequence contains `0026_add_funnel_events`.
+   - Capture baseline row counts for `registration_events`, `messages`, and `credit_transactions`.
+2. Apply migration in a low-traffic window.
+3. Post-check:
+   - Validate `funnel_events` table exists with `funnel_events_event_key_unique`.
+   - Validate index creation for the three supporting source tables.
+   - Run `npm --workspace @smartspec/web test -- server/__tests__/funnelEvents.schema.test.ts server/__tests__/funnelEvents.migration.test.ts`.
