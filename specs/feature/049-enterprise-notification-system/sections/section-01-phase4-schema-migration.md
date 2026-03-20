# Section 01 -- Phase 4 Schema Migration

## section-01-phase4-schema-migration

**Goal**: Extend the PostgreSQL `notification_type` enum, add deduplication columns to `userNotifications`, create the `notificationOccurrences` table, and add a unique partial index for atomic dedup. All schema changes are additive (nullable columns or columns with defaults), so there is zero data-loss risk.

**Depends on**: Nothing (first section in execution order, parallelizable with section-13).
**Blocks**: section-02-phase4-dedup-service, section-03-phase4-frontend-sse.

---

### 1. Prerequisite: Notification Type Enum Extension

The PostgreSQL enum `notification_type` currently has 4 values (`scheduled_message`, `follow_request`, `alert`, `system`). The TypeScript type also references `direct_message` and `urgent_message`, which cause runtime `CHECK` violations when used. This migration adds the missing values.

**Critical PostgreSQL constraint**: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block. Drizzle-kit wraps generated SQL in transactions, so this migration MUST be hand-written.

**File to create**: `apps/web/drizzle/0102_notification_type_enum_extension.sql`

Contents (conceptual -- do not copy verbatim, adapt to actual migration tooling):

```sql
-- This migration MUST run outside a transaction.
-- drizzle-kit cannot generate ALTER TYPE ADD VALUE; seed manually.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'direct_message';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'urgent_message';
```

**Post-migration step**: The hash for this SQL file must be seeded into `drizzle.__drizzle_migrations` so that `drizzle-kit migrate` does not attempt to re-run it. Follow the manual seeding procedure documented in the project CLAUDE.md.

---

### 2. Schema Changes in `drizzle/schema.ts`

**File to modify**: `apps/web/drizzle/schema.ts`

#### 2.1 Add columns to `userNotifications` (after line ~3124, before the index array)

Four new columns on the existing `userNotifications` pgTable:

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `groupKey` | `varchar("groupKey", { length: 200 })` | Yes | -- | Dedup identifier, e.g. `"media_job_failure:user_123"` |
| `occurrenceCount` | `integer("occurrenceCount")` | No | `1` | Number of events this notification represents |
| `firstOccurredAt` | `timestamp("firstOccurredAt", { withTimezone: true })` | No | `defaultNow()` | When first event in group occurred |
| `lastOccurredAt` | `timestamp("lastOccurredAt", { withTimezone: true })` | No | `defaultNow()` | When most recent event occurred |

All columns are either nullable (`groupKey`) or have safe defaults, so existing rows remain valid.

#### 2.2 Add unique partial index for atomic dedup

Add to the `userNotifications` index array (the `(t) => [...]` callback):

```typescript
uniqueIndex("idx_notif_dedup_active")
  .on(t.userId, t.groupKey)
  .where(sql`"isDismissed" = false AND "groupKey" IS NOT NULL`)
```

This index enforces that only ONE active (non-dismissed) notification exists per `(userId, groupKey)` pair. It enables the `ON CONFLICT` upsert in section-02. The `WHERE "groupKey" IS NOT NULL` clause ensures notifications without a group key are not affected.

**Security constraint S6**: This index guarantees atomicity of the dedup operation at the database level, preventing race conditions from concurrent inserts with the same group key.

#### 2.3 New table: `notificationOccurrences`

Define a new pgTable after `userNotifications`:

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `serial("id").primaryKey()` | No | auto | PK |
| `notificationId` | `integer("notificationId").references(() => userNotifications.id, { onDelete: "cascade" }).notNull()` | No | -- | FK with CASCADE delete |
| `content` | `text("content")` | Yes | -- | Snapshot of individual occurrence content |
| `metadata` | `jsonb("metadata")` | Yes | -- | Per-occurrence metadata (same shape as userNotifications.metadata) |
| `occurredAt` | `timestamp("occurredAt", { withTimezone: true }).defaultNow().notNull()` | No | `now()` | When this individual event happened |

Indexes:

```typescript
index("idx_notif_occurrences_notif_time").on(t.notificationId, t.occurredAt)
```

This index supports the `getGroupOccurrences` query in section-02 (ordered by `occurredAt DESC`).

Export types:

```typescript
export type NotificationOccurrence = typeof notificationOccurrences.$inferSelect;
export type InsertNotificationOccurrence = typeof notificationOccurrences.$inferInsert;
```

#### 2.4 Update `UserNotification` type

The existing `export type UserNotification = typeof userNotifications.$inferSelect;` will automatically pick up the new columns from Drizzle inference. No manual type changes needed.

---

### 3. Generated Migration

After modifying `schema.ts`, run `pnpm db:push` (which executes `drizzle-kit generate && drizzle-kit migrate`). This generates a migration SQL file (expected name: `apps/web/drizzle/0103_notification_dedup_grouping.sql`) containing:

1. `ALTER TABLE user_notifications ADD COLUMN "groupKey" varchar(200);`
2. `ALTER TABLE user_notifications ADD COLUMN "occurrenceCount" integer NOT NULL DEFAULT 1;`
3. `ALTER TABLE user_notifications ADD COLUMN "firstOccurredAt" timestamptz NOT NULL DEFAULT now();`
4. `ALTER TABLE user_notifications ADD COLUMN "lastOccurredAt" timestamptz NOT NULL DEFAULT now();`
5. `CREATE UNIQUE INDEX "idx_notif_dedup_active" ON "user_notifications" ("userId", "groupKey") WHERE "isDismissed" = false AND "groupKey" IS NOT NULL;`
6. `CREATE TABLE "notification_occurrences" (...)` with FK and index.

**Important**: The enum extension migration (step 1) MUST be applied before this migration, because `drizzle-kit migrate` runs inside a transaction. If both are in the same transaction, the `ALTER TYPE ADD VALUE` will fail. Ensure the enum migration file has a lower sequence number (0102 < 0103).

---

### 4. Migration Execution Order

1. Back up the `user_notifications` table (per Database Safety Protocol).
2. Record row count: `SELECT count(*) FROM user_notifications;`
3. Apply enum migration manually: `psql "$DATABASE_URL" -f drizzle/0102_notification_type_enum_extension.sql`
4. Seed hash into `drizzle.__drizzle_migrations` for the enum migration.
5. Run `pnpm db:push` to generate and apply the schema migration (0103).
6. Verify row count unchanged.
7. Verify new columns exist: `\d user_notifications` should show `groupKey`, `occurrenceCount`, `firstOccurredAt`, `lastOccurredAt`.
8. Verify new table exists: `\d notification_occurrences`.
9. Verify index exists: `\di idx_notif_dedup_active`.

---

### 5. TDD Expectations

All tests in this section go in a new file: `apps/web/server/services/__tests__/notificationSchema.test.ts`

Tests use Vitest with the existing Drizzle mock pattern (chainable mocks for `insert().values().returning()`).

#### 5.1 notificationOccurrences FK and CASCADE

```
Test: notificationOccurrences table insert with FK to userNotifications
- Verify inserting an occurrence with a valid notificationId succeeds
- Verify the occurrence row references the correct parent notification
```

```
Test: CASCADE delete removes occurrences when parent notification deleted
- Insert a parent notification, insert 3 occurrences referencing it
- Delete the parent notification
- Verify all 3 occurrences are also deleted (CASCADE)
```

These are integration-level tests that verify the FK constraint. They may be tested against a real database in CI or validated via schema inspection in unit tests.

#### 5.2 Schema shape validation (unit tests)

```
Test: userNotifications schema includes groupKey column (nullable varchar 200)
- Import userNotifications from schema.ts
- Assert column exists in the table definition
```

```
Test: userNotifications schema includes occurrenceCount column (integer, default 1, not null)
- Import userNotifications from schema.ts
- Assert column exists with correct type and default
```

```
Test: userNotifications schema includes firstOccurredAt column (timestamptz, default now, not null)
```

```
Test: userNotifications schema includes lastOccurredAt column (timestamptz, default now, not null)
```

```
Test: notificationOccurrences table has correct columns (id, notificationId, content, metadata, occurredAt)
- Import notificationOccurrences from schema.ts
- Assert all columns present with correct types
```

```
Test: notificationOccurrences has index on (notificationId, occurredAt)
- Verify the index definition exists in the table's index array
```

#### 5.3 Dedup index validation

```
Test: userNotifications has unique partial index idx_notif_dedup_active on (userId, groupKey)
- Verify the index is defined as uniqueIndex
- Verify it includes the WHERE clause for isDismissed=false AND groupKey IS NOT NULL
```

These schema-shape tests can inspect the Drizzle table definition objects at the TypeScript level (checking column names, types, and index definitions) without requiring a running database.

---

### 6. Key File Paths (Actual)

| File | Action |
|------|--------|
| `apps/web/drizzle/schema.ts` | Modified: added 4 columns to `userNotifications`, added `notificationOccurrences` table with FK and index |
| `apps/web/drizzle/0102_notification_type_enum_extension.sql` | Created: hand-written enum migration (enum values already existed, applied idempotently) |
| `apps/web/drizzle/0102_slim_red_wolf.sql` | Generated by `drizzle-kit generate`: schema migration for new columns, table, and indexes |
| `apps/web/drizzle/meta/_journal.json` | Updated automatically by drizzle-kit; enum migration hash manually seeded into `drizzle.__drizzle_migrations` |
| `apps/web/server/services/__tests__/notificationSchema.test.ts` | Created: 13 schema shape tests including column types, index existence, and WHERE predicate assertion |

**Deviations from plan:**
- Generated migration file named `0102_slim_red_wolf.sql` instead of `0103_notification_dedup_grouping.sql` — drizzle-kit auto-numbered it as 0102 since the enum migration was manually seeded and not tracked in `_journal.json`. No collision in practice since enum migration is manually applied.
- Enum values `direct_message` and `urgent_message` already existed in the database (added in prior work). The `IF NOT EXISTS` guard handled this gracefully.
- Added WHERE predicate content assertion (test 13) based on code review recommendation.

---

### 7. Notes for Downstream Sections

- **section-02-phase4-dedup-service** depends on the `groupKey` column and `idx_notif_dedup_active` index to implement `INSERT ... ON CONFLICT` in `createNotification()`. It also depends on `notificationOccurrences` for occurrence snapshot inserts.
- **section-03-phase4-frontend-sse** depends on `occurrenceCount`, `firstOccurredAt`, `lastOccurredAt` columns being present in query results.
- **section-04-phase5-schema-preferences** adds more tables to `schema.ts` but is independent of the columns added here.
- The `notification_type` enum extension enables `direct_message` and `urgent_message` types to be used safely across all downstream sections without runtime PostgreSQL errors.