Now I have all the context I need. Let me generate the section content for section-01-database-schema:

# Section 01: Database Schema

## Overview

This section establishes the database foundation for the custom groups and permission-based file sharing feature. It introduces two new tables (`user_groups` and `group_members`) and extends existing tables (`library_permissions` and `library_items`) to support group-based permissions and enhanced trash tracking.

**Critical Implementation Note:** This section MUST be completed before any service layer or UI work begins. All subsequent sections depend on these schema changes.

## Dependencies

- None (this is the foundation section)

## Blocks

- section-02-groups-service
- section-03-library-service
- section-04-groups-router
- section-05-library-router
- section-06-trash-job

## Test Stubs (Write These First)

**Test File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.test.ts` (NEW)

```typescript
import { describe, test, expect } from 'vitest';
import { userGroups, groupMembers, libraryPermissions, libraryItems } from './schema';

describe('user_groups table schema', () => {
  test('has required columns with correct types');
  test('has partial unique index on (tenantId, name) WHERE deletedAt IS NULL');
  test('settings JSONB column accepts valid visibility and joinPolicy values');
  test('memberCount defaults to 0 on insert');
  test('foreign keys cascade correctly (tenantId, ownerId)');
});

describe('group_members table schema', () => {
  test('has required columns with correct types');
  test('has unique constraint on (groupId, userId)');
  test('foreign keys cascade correctly (groupId, userId)');
  test('addedBy foreign key uses ON DELETE SET NULL');
  test('has partial indexes on (groupId) and (userId) WHERE status = active');
});

describe('library_permissions schema updates', () => {
  test('subjectType accepts "group" value');
  test('permissionLevel accepts "delete" value');
  test('existing permissions remain valid after schema update');
  test('has index on (subjectId, subjectType) WHERE subjectType = group');
});

describe('library_items schema updates', () => {
  test('deletedBy column exists with correct foreign key');
  test('deletedBy foreign key uses ON DELETE SET NULL');
  test('existing deleted items remain valid with NULL deletedBy');
});
```

## Migration Verification Checklist

After running migrations, verify these conditions:

```bash
# 1. Check tables exist
psql "$DATABASE_URL" -c "SELECT * FROM user_groups LIMIT 1;"
psql "$DATABASE_URL" -c "SELECT * FROM group_members LIMIT 1;"

# 2. Check column additions
psql "$DATABASE_URL" -c "SELECT deletedBy FROM library_items WHERE deletedAt IS NOT NULL LIMIT 5;"

# 3. Check indexes exist
psql "$DATABASE_URL" -c "
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename IN ('user_groups', 'group_members', 'library_permissions')
  ORDER BY tablename, indexname;
"

# 4. Verify partial unique index for namespace collision fix
psql "$DATABASE_URL" -c "
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE indexname = 'user_groups_tenant_name_unique';
"

# 5. Check row counts (should be unchanged for existing tables)
psql "$DATABASE_URL" -c "
  SELECT 'library_items' as tbl, count(*) as rows FROM library_items
  UNION ALL
  SELECT 'library_permissions', count(*) FROM library_permissions;
"
```

## Implementation Steps

### Step 1: Database Backup (MANDATORY)

Before ANY schema changes, create backups of affected tables:

```bash
mkdir -p /home/dev/projects/SmartSpecPro/.db-backups

# Backup existing tables that will be modified
pg_dump "$DATABASE_URL" --data-only --table=library_items \
  --file="/home/dev/projects/SmartSpecPro/.db-backups/library_items_$(date +%Y%m%d_%H%M%S).sql"

pg_dump "$DATABASE_URL" --data-only --table=library_permissions \
  --file="/home/dev/projects/SmartSpecPro/.db-backups/library_permissions_$(date +%Y%m%d_%H%M%S).sql"

# Capture baseline row counts
psql "$DATABASE_URL" -c "
  SELECT 'library_items' as tbl, count(*) as rows FROM library_items
  UNION ALL
  SELECT 'library_permissions', count(*) FROM library_permissions;
" > /home/dev/projects/SmartSpecPro/.db-backups/row_counts_$(date +%Y%m%d_%H%M%S).txt
```

### Step 2: Update Drizzle Schema

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

**Add new table: user_groups**

Insert after the `tenants` table definition (around line 300):

```typescript
export const userGroups = pgTable("user_groups", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  iconUrl: text("icon_url"),
  settings: json("settings").$type<{
    visibility: "private" | "public";
    joinPolicy: "invite_only" | "request_to_join" | "open";
  }>().notNull().default({ visibility: "private", joinPolicy: "invite_only" }),
  memberCount: integer("member_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  // Partial unique index - allows recreating deleted group names (namespace collision fix)
  uniqueIndex("user_groups_tenant_name_unique")
    .on(t.tenantId, t.name)
    .where(sql`deleted_at IS NULL`),
  
  // Partial indexes for soft-delete performance
  index("user_groups_tenant_idx")
    .on(t.tenantId)
    .where(sql`deleted_at IS NULL`),
  index("user_groups_owner_idx")
    .on(t.ownerId)
    .where(sql`deleted_at IS NULL`),
  index("user_groups_visibility_idx")
    .on(t.tenantId, sql`(settings->>'visibility')`)
    .where(sql`deleted_at IS NULL`),
]);

export type UserGroup = typeof userGroups.$inferSelect;
export type InsertUserGroup = typeof userGroups.$inferInsert;
```

**Add new table: group_members**

Insert immediately after `userGroups`:

```typescript
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => userGroups.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 32 }).notNull().default("member"), // "admin" | "member"
  addedBy: integer("added_by").references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 32 }).notNull().default("active"), // "active" | "pending" | "removed"
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (t) => [
  // One membership per user per group
  uniqueIndex("group_members_group_user_unique").on(t.groupId, t.userId),
  
  // Partial indexes for active memberships only (huge performance gain)
  index("group_members_group_active_idx")
    .on(t.groupId)
    .where(sql`status = 'active'`),
  index("group_members_user_active_idx")
    .on(t.userId)
    .where(sql`status = 'active'`),
]);

export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = typeof groupMembers.$inferInsert;
```

**Update existing table: library_permissions**

Locate the `libraryPermissions` table definition (around line 1490) and modify:

```typescript
export const libraryPermissions = pgTable("library_permissions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id")
    .notNull()
    .references(() => libraryItems.id, { onDelete: "cascade" }),
  
  // UPDATED: Now supports "user", "tenant_role", and "group"
  subjectType: varchar("subject_type", { length: 32 }).notNull(),
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  
  // UPDATED: Now supports "read", "write", "delete", and "owner"
  permissionLevel: varchar("permission_level", { length: 32 }).notNull().default("read"),
  
  grantedByUserId: integer("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("library_permissions_subject_unique").on(t.libraryItemId, t.subjectType, t.subjectId),
  index("library_permissions_tenant_subject_idx").on(t.tenantId, t.subjectType, t.subjectId),
  
  // NEW INDEX: Optimize group permission lookups
  index("library_permissions_group_idx")
    .on(t.subjectId, t.subjectType)
    .where(sql`subject_type = 'group'`),
]);
```

**Update existing table: library_items**

Locate the `libraryItems` table definition (around line 1428) and add the `deletedBy` column:

```typescript
export const libraryItems = pgTable("library_items", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  itemType: varchar("item_type", { length: 32 }).notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: libraryItemStatusEnum("status").notNull().default("ready"),
  visibility: libraryVisibilityEnum("visibility").notNull().default("private"),
  metadata: json("metadata").$type<Record<string, any>>().notNull().default({}),
  sourceUrl: text("source_url"),
  thumbnailUrl: text("thumbnail_url"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  
  // NEW COLUMN: Track who deleted the file (for trash UI)
  deletedBy: integer("deleted_by").references(() => users.id, { onDelete: "set null" }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("library_items_tenant_visibility_status_idx").on(t.tenantId, t.visibility, t.status),
  index("library_items_tenant_owner_status_idx").on(t.tenantId, t.ownerUserId, t.status),
  index("library_items_source_item_type_idx").on(t.source, t.itemType),
  index("library_items_deleted_at_idx").on(t.deletedAt),
]);
```

**Important Notes:**
- Import `sql` from `drizzle-orm` at the top of the file: `import { sql } from "drizzle-orm";`
- The partial unique index on `user_groups` allows recreating deleted group names (fixes namespace collision)
- The partial indexes on `group_members` (WHERE `status = 'active'`) dramatically improve query performance
- Existing data in `library_permissions` and `library_items` remains valid (backward-compatible changes)

### Step 3: Generate Drizzle Migrations

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm drizzle-kit generate
```

This will create a new migration SQL file in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/` with a timestamp prefix.

### Step 4: Review Generated SQL (CRITICAL)

**Manually inspect the generated migration SQL file** before applying it. Verify:

1. **Partial indexes are correct:**
   - `user_groups_tenant_name_unique` has `WHERE deleted_at IS NULL`
   - `group_members_group_active_idx` has `WHERE status = 'active'`
   - `group_members_user_active_idx` has `WHERE status = 'active'`

2. **Foreign keys have correct ON DELETE behavior:**
   - `user_groups.tenantId` → `ON DELETE CASCADE`
   - `user_groups.ownerId` → `ON DELETE CASCADE`
   - `group_members.groupId` → `ON DELETE CASCADE`
   - `group_members.userId` → `ON DELETE CASCADE`
   - `group_members.addedBy` → `ON DELETE SET NULL`
   - `library_items.deletedBy` → `ON DELETE SET NULL`

3. **No DROP statements** (this is an additive migration, nothing should be dropped)

4. **Enum extensions are safe** (adding values to `subjectType` and `permissionLevel` should not break existing data)

**If the generated SQL is incorrect:** Manually edit the migration file to fix issues, or create a custom SQL migration.

### Step 5: Apply Migrations

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm drizzle-kit migrate
```

**If migration fails:**
- Read the error message carefully
- Check for constraint violations or type mismatches
- Apply the SQL manually via `psql "$DATABASE_URL" -f drizzle/XXXX_migration_name.sql`
- If manual application succeeds, seed the migration hash into `drizzle.__drizzle_migrations` table

### Step 6: Verify Migration Success

Run the verification checklist from the beginning of this section:

```bash
# 1-5: Run all verification queries
# Compare row counts with baseline from Step 1
```

**If row counts decreased:** Restore immediately from backup:
```bash
psql "$DATABASE_URL" < /home/dev/projects/SmartSpecPro/.db-backups/library_items_TIMESTAMP.sql
psql "$DATABASE_URL" < /home/dev/projects/SmartSpecPro/.db-backups/library_permissions_TIMESTAMP.sql
```

**Do NOT proceed to subsequent sections until verification passes.**

### Step 7: Test Index Performance (Optional but Recommended)

Verify that partial indexes are being used by the query planner:

```sql
-- Should use user_groups_tenant_idx (partial index)
EXPLAIN ANALYZE
SELECT * FROM user_groups
WHERE tenant_id = 'test-tenant' AND deleted_at IS NULL;

-- Should use group_members_user_active_idx (partial index)
EXPLAIN ANALYZE
SELECT * FROM group_members
WHERE user_id = 1 AND status = 'active';

-- Should use library_permissions_group_idx
EXPLAIN ANALYZE
SELECT * FROM library_permissions
WHERE subject_type = 'group' AND subject_id = '123';
```

Look for "Index Scan" or "Index Only Scan" in the output. If you see "Seq Scan", the index is not being used (check your WHERE clause matches the index definition).

## Rollback Plan

If this migration causes production issues:

```bash
# 1. Restore from backup
psql "$DATABASE_URL" < /home/dev/projects/SmartSpecPro/.db-backups/library_items_TIMESTAMP.sql
psql "$DATABASE_URL" < /home/dev/projects/SmartSpecPro/.db-backups/library_permissions_TIMESTAMP.sql

# 2. Drop new tables (cascades will handle foreign keys)
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS group_members CASCADE;"
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS user_groups CASCADE;"

# 3. Revert schema.ts changes
git checkout HEAD -- apps/web/drizzle/schema.ts

# 4. Remove migration files
rm apps/web/drizzle/XXXX_add_groups.sql
```

## Key Technical Decisions

1. **Partial Unique Index for Namespace Collision:**
   - Problem: User deletes "Marketing Team" group, later wants to create a new "Marketing Team"
   - Solution: Unique constraint only applies WHERE `deletedAt IS NULL`
   - Trade-off: Deleted groups with same name can coexist (acceptable for soft-delete pattern)

2. **Partial Indexes for Soft Deletes:**
   - Problem: Indexes grow large with soft-deleted records that are rarely queried
   - Solution: Index only active records (WHERE `deletedAt IS NULL` or `status = 'active'`)
   - Benefit: 90%+ smaller indexes, faster queries, reduced disk I/O

3. **Varchar vs Enum for `subjectType` and `permissionLevel`:**
   - Decision: Use `varchar` instead of PostgreSQL enum
   - Rationale: Drizzle enums are harder to extend (require ALTER TYPE), varchar is more flexible
   - Validation: Enforce valid values in application layer (Zod schemas)

4. **`deletedBy` Column for Trash UI:**
   - Purpose: Show "Deleted by John Doe" in trash panel
   - Type: Integer reference to `users.id` with ON DELETE SET NULL
   - Nullable: Yes (existing deleted items won't have this value, which is acceptable)

## Files Modified

- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (EXTEND)

## Files Created

- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.test.ts` (NEW)
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/XXXX_add_groups.sql` (generated migration)

## Dependencies for Next Sections

Once this section is complete and verified:
- section-02-groups-service can begin (requires `user_groups` and `group_members` tables)
- section-03-library-service can begin (requires updated `library_permissions` and `library_items`)
- section-06-trash-job can begin (requires `deletedBy` column)

## Security Notes

- **Tenant Isolation:** All new tables include `tenantId` foreign key with CASCADE delete
- **Soft Delete Pattern:** Groups use `deletedAt` timestamp (consistent with existing `library_items`)
- **Audit Trail:** `group_members.addedBy` and `library_items.deletedBy` provide audit information
- **No Sensitive Data:** Group names and descriptions are not encrypted (they're not secrets)

## Performance Impact

- **Positive:** Partial indexes reduce index size by 90%+ for large tenants
- **Positive:** Group membership cache (implemented in section-10) reduces JOIN queries
- **Neutral:** Adding `deletedBy` column has no performance impact (nullable, no index)
- **Negative:** Adding "group" permissions increases permission check overhead by 3-8x (acceptable per interview Q7)

## Completion Checklist

- [ ] Database backup created
- [ ] Drizzle schema updated (`user_groups`, `group_members`, `library_permissions`, `library_items`)
- [ ] `sql` imported from `drizzle-orm` for partial index definitions
- [ ] Migration generated with `pnpm drizzle-kit generate`
- [ ] Generated SQL reviewed and verified correct
- [ ] Migration applied with `pnpm drizzle-kit migrate`
- [ ] All verification queries pass
- [ ] Row counts match baseline (no data loss)
- [ ] Partial indexes are used by query planner (EXPLAIN ANALYZE)
- [ ] Test stubs written in `schema.test.ts`
- [ ] Rollback plan documented and tested in staging

---

**End of Section 01: Database Schema**