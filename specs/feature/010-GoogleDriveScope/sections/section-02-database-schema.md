Now I have all the context I need. Let me generate the section content.

# Section 02: Database Schema -- New Tables and Extensions

## Overview

This section creates the database tables and modifies existing tables required by the Google Drive and Google Workspace integration. It is a **foundational section** with no dependencies and is required by nearly every subsequent section (03 through 15).

Three new Drizzle tables are created (`google_drive_sync_state`, `google_drive_edit_sessions`, `user_credit_budgets`), two existing Drizzle tables are modified (`library_links`, `credit_transactions`), and one Python/SQLAlchemy model is extended (`oauth_connections`). After schema changes, Drizzle and Python migrations must be generated and applied immediately.

## Critical Constraint -- `tenantId` Type

The `tenants` table primary key is `varchar("id", { length: 36 })` -- it is a string, **not** an integer. All new tables that reference tenants MUST use `varchar("tenant_id", { length: 36 })`. Using `integer` will cause foreign key failures at runtime.

This matches the pattern already used by `library_items`, `library_chunks`, `library_content_versions`, `library_permissions`, and `library_index_jobs`.

## Files to Create or Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | Add 3 new tables, modify 2 existing tables, add 2 new enums |
| `/home/dev/projects/SmartSpecPro/python-backend/app/models/oauth.py` | Add `status`, `scopes`, `tenant_id` columns and unique constraint |
| `/home/dev/projects/SmartSpecPro/python-backend/migrations/003_oauth_drive_extensions.py` | New migration script for Python-side schema changes |

---

## Tests FIRST

### Vitest -- Drizzle Schema Validation

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/schema.googleDrive.test.ts`

These tests validate that the schema definitions exported from `drizzle/schema.ts` have the correct shape. They do not hit the database -- they inspect the Drizzle table metadata objects at the TypeScript level.

```
describe("Google Drive Schema - google_drive_sync_state", () => {
  it("should export googleDriveSyncState table definition")
    // Verify the table export exists and is a pgTable

  it("should have tenant_id as varchar(36) matching tenants.id type")
    // Inspect the column definition: type must be varchar, length 36
    // Must have a FK reference to tenants.id

  it("should have unique constraint on (tenant_id, user_id)")
    // Inspect the table's index list for a uniqueIndex on those two columns

  it("should define indexing_mode column using the indexingModeEnum")
    // Verify the enum has values: none, selected_folders, all_except, all

  it("should have auto_sync_enabled default to true")
    // Check the column default value
})

describe("Google Drive Schema - google_drive_edit_sessions", () => {
  it("should export googleDriveEditSessions table definition")

  it("should have tenant_id as varchar(36)")

  it("should define status column using editSessionStatusEnum")
    // Verify the enum has values: active, saved_back, discarded, expired

  it("should have correct column types and defaults")
    // Check expires_at is timestamp, drive_file_id is varchar(128), etc.
})

describe("Google Drive Schema - user_credit_budgets", () => {
  it("should export userCreditBudgets table definition")

  it("should have unique constraint on (tenant_id, user_id)")

  it("should default credits_used_this_month to 0")

  it("should default alert_threshold_pct to 80")

  it("should default alert_sent and hard_cap_reached to false")
})

describe("Google Drive Schema - library_links modifications", () => {
  it("should have tenant_id column added as varchar(36)")

  it("should have unique index on (linkType, linkId, tenant_id) instead of (linkType, linkId)")
    // The old uniqueIndex("library_links_source_unique").on(t.linkType, t.linkId) must be
    // replaced with uniqueIndex("library_links_source_tenant_unique").on(t.linkType, t.linkId, t.tenantId)
})

describe("Google Drive Schema - credit_transactions modifications", () => {
  it("should have nullable idempotency_key column as varchar(256)")

  it("should have unique index on idempotency_key where not null")
    // Partial unique index: only enforced when value is non-null
})
```

### pytest -- Python OAuth Model Migration

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_oauth_migration.py`

```
@pytest.mark.unit
class TestOAuthConnectionMigration:

    def test_oauth_connections_has_status_column_with_default_active():
        """Verify the OAuthConnection model has a status column defaulting to 'active'."""

    def test_oauth_connections_has_scopes_column():
        """Verify the OAuthConnection model has a scopes text column."""

    def test_oauth_connections_has_tenant_id_column():
        """Verify the OAuthConnection model has a nullable tenant_id varchar(36) column."""

    def test_oauth_connections_has_unique_constraint_on_user_id_provider():
        """Verify UniqueConstraint('user_id', 'provider') exists in __table_args__."""

    def test_migration_is_reversible():
        """Verify the downgrade function removes the added columns without errors."""
```

---

## Implementation Details

### 1. New Drizzle Enums

Add two new `pgEnum` definitions in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, placed near the existing enum block at the top of the file (around line 85):

**`indexingModeEnum`** -- controls how the user's Google Drive files are indexed:

```typescript
export const indexingModeEnum = pgEnum("indexing_mode", [
  "none",
  "selected_folders",
  "all_except",
  "all",
]);
```

**`editSessionStatusEnum`** -- tracks the lifecycle of a Google Docs/Sheets editing session:

```typescript
export const editSessionStatusEnum = pgEnum("edit_session_status", [
  "active",
  "saved_back",
  "discarded",
  "expired",
]);
```

### 2. New Table: `google_drive_sync_state`

Stores per-user sync configuration (indexing mode, folder selections, file type filters, size guards), webhook channel tracking fields (channel_id, resource_id, expiry, channel_token for security validation), and the Google Drive Changes API page token for incremental sync.

**Location:** After the library-related tables block in `schema.ts` (around line 1639, after `libraryIndexJobs`).

Key columns and their purposes:

| Column | Type | Purpose |
|--------|------|---------|
| `tenant_id` | `varchar(36)` NOT NULL, FK to `tenants.id` | Multi-tenant isolation |
| `user_id` | `integer` NOT NULL, FK to `users.id` | The user whose Drive is being synced |
| `indexing_mode` | `indexingModeEnum` NOT NULL, default `"none"` | Which files to index |
| `folder_selections` | `jsonb` default `[]` | Array of folder IDs for selected_folders/all_except modes |
| `file_type_filter` | `jsonb` default `[]` | Array of MIME types to include/exclude |
| `max_file_size_bytes` | `integer` default `52428800` (50MB) | Size guard |
| `channel_id` | `varchar(128)` nullable | Google webhook channel ID |
| `resource_id` | `varchar(128)` nullable | Google webhook resource ID |
| `channel_token` | `varchar(64)` nullable | Crypto-random token for webhook validation |
| `channel_expiry` | `timestamp with timezone` nullable | When the webhook channel expires |
| `page_token` | `text` nullable | Changes API page token for incremental sync |
| `files_total` | `integer` default `0` | Progress tracking: total files to process |
| `files_processed` | `integer` default `0` | Progress tracking: files completed |
| `last_sync_at` | `timestamp with timezone` nullable | Last successful sync time |
| `last_error` | `text` nullable | Last sync error message |
| `auto_sync_enabled` | `boolean` default `true` | Whether automatic sync is active |
| `created_at` | `timestamp with timezone` default now | Row creation time |
| `updated_at` | `timestamp with timezone` default now | Row update time |

**Constraints:**
- `uniqueIndex("gdrive_sync_tenant_user_unique").on(t.tenantId, t.userId)` -- one sync state per user per tenant.
- `index("gdrive_sync_channel_id_idx").on(t.channelId)` -- for webhook lookup by channel ID.

The stub definition:

```typescript
export const googleDriveSyncState = pgTable("google_drive_sync_state", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  indexingMode: indexingModeEnum("indexing_mode").notNull().default("none"),
  folderSelections: json("folder_selections").$type<string[]>().default([]),
  fileTypeFilter: json("file_type_filter").$type<string[]>().default([]),
  maxFileSizeBytes: integer("max_file_size_bytes").default(52428800),
  channelId: varchar("channel_id", { length: 128 }),
  resourceId: varchar("resource_id", { length: 128 }),
  channelToken: varchar("channel_token", { length: 64 }),
  channelExpiry: timestamp("channel_expiry", { withTimezone: true }),
  pageToken: text("page_token"),
  filesTotal: integer("files_total").default(0),
  filesProcessed: integer("files_processed").default(0),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  autoSyncEnabled: boolean("auto_sync_enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("gdrive_sync_tenant_user_unique").on(t.tenantId, t.userId),
  index("gdrive_sync_channel_id_idx").on(t.channelId),
]);

export type GoogleDriveSyncState = typeof googleDriveSyncState.$inferSelect;
export type InsertGoogleDriveSyncState = typeof googleDriveSyncState.$inferInsert;
```

### 3. New Table: `google_drive_edit_sessions`

Tracks active editing sessions where a library file has been uploaded to Google Drive for editing in Google Docs/Sheets. Each record links a `library_items` row to a temporary Drive file.

Key columns:

| Column | Type | Purpose |
|--------|------|---------|
| `tenant_id` | `varchar(36)` NOT NULL, FK to `tenants.id` | Multi-tenant isolation |
| `user_id` | `integer` NOT NULL, FK to `users.id` | User who opened the editing session |
| `library_item_id` | `integer` NOT NULL, FK to `library_items.id` | The library file being edited |
| `drive_file_id` | `varchar(128)` NOT NULL | Google Drive file ID for the temp copy |
| `edit_url` | `text` NOT NULL | Full Google Docs/Sheets editing URL |
| `original_source_url` | `text` nullable | Original S3/R2 source URL for the file |
| `status` | `editSessionStatusEnum` NOT NULL, default `"active"` | Session lifecycle state |
| `expires_at` | `timestamp with timezone` NOT NULL | Auto-expiry time (24h from creation) |
| `created_at` | `timestamp with timezone` default now | Session creation time |
| `updated_at` | `timestamp with timezone` default now | Last update time |

**Indexes:**
- `index("gdrive_edit_tenant_user_status_idx").on(t.tenantId, t.userId, t.status)` -- find active sessions for a user.
- `index("gdrive_edit_library_item_idx").on(t.libraryItemId)` -- look up sessions for a specific file.
- `index("gdrive_edit_expires_at_idx").on(t.expiresAt)` -- for the cleanup task that expires stale sessions.

The stub definition:

```typescript
export const googleDriveEditSessions = pgTable("google_drive_edit_sessions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  driveFileId: varchar("drive_file_id", { length: 128 }).notNull(),
  editUrl: text("edit_url").notNull(),
  originalSourceUrl: text("original_source_url"),
  status: editSessionStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("gdrive_edit_tenant_user_status_idx").on(t.tenantId, t.userId, t.status),
  index("gdrive_edit_library_item_idx").on(t.libraryItemId),
  index("gdrive_edit_expires_at_idx").on(t.expiresAt),
]);

export type GoogleDriveEditSession = typeof googleDriveEditSessions.$inferSelect;
export type InsertGoogleDriveEditSession = typeof googleDriveEditSessions.$inferInsert;
```

### 4. New Table: `user_credit_budgets`

Tracks per-user monthly credit budget limits. This table is **not** Google Drive-specific -- it applies to ALL credit-consuming operations system-wide (library indexing, RAG queries, Drive indexing, MCP reads). It is used by Section 05 (Budget Protection).

Key columns:

| Column | Type | Purpose |
|--------|------|---------|
| `tenant_id` | `varchar(36)` NOT NULL, FK to `tenants.id` | Multi-tenant isolation |
| `user_id` | `integer` NOT NULL, FK to `users.id` | Budget owner |
| `monthly_limit` | `integer` NOT NULL | Max credits per month |
| `credits_used_this_month` | `integer` NOT NULL, default `0` | Running total of credits consumed |
| `budget_month_key` | `varchar(7)` NOT NULL | Format "YYYY-MM", used to detect month rollover |
| `alert_threshold_pct` | `integer` NOT NULL, default `80` | Percentage at which alert fires |
| `alert_sent` | `boolean` NOT NULL, default `false` | Whether threshold alert has been sent |
| `hard_cap_reached` | `boolean` NOT NULL, default `false` | Whether 100% budget is reached |
| `created_at` | `timestamp with timezone` default now | Row creation time |
| `updated_at` | `timestamp with timezone` default now | Row update time |

**Constraints:**
- `uniqueIndex("user_credit_budgets_tenant_user_unique").on(t.tenantId, t.userId)` -- one budget record per user per tenant.

The stub definition:

```typescript
export const userCreditBudgets = pgTable("user_credit_budgets", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  monthlyLimit: integer("monthly_limit").notNull(),
  creditsUsedThisMonth: integer("credits_used_this_month").notNull().default(0),
  budgetMonthKey: varchar("budget_month_key", { length: 7 }).notNull(),
  alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
  alertSent: boolean("alert_sent").notNull().default(false),
  hardCapReached: boolean("hard_cap_reached").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_credit_budgets_tenant_user_unique").on(t.tenantId, t.userId),
]);

export type UserCreditBudget = typeof userCreditBudgets.$inferSelect;
export type InsertUserCreditBudget = typeof userCreditBudgets.$inferInsert;
```

### 5. Existing Table Modification: `library_links`

**Current state** (from `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` line 1534):

```typescript
export const libraryLinks = pgTable("library_links", {
  id: serial("id").primaryKey(),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  linkType: varchar("link_type", { length: 64 }).notNull(),
  linkId: varchar("link_id", { length: 128 }).notNull(),
  providerTaskId: varchar("provider_task_id", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("library_links_source_unique").on(t.linkType, t.linkId),
  index("library_links_item_type_idx").on(t.libraryItemId, t.linkType),
  index("library_links_provider_task_idx").on(t.providerTaskId),
]);
```

**Changes required:**

1. **Add `tenantId` column:** `varchar("tenant_id", { length: 36 })` -- nullable initially to avoid breaking existing rows that lack a tenant ID. Once backfilled, can be made NOT NULL in a follow-up migration.

2. **Replace unique index:** Change from `uniqueIndex("library_links_source_unique").on(t.linkType, t.linkId)` to `uniqueIndex("library_links_source_tenant_unique").on(t.linkType, t.linkId, t.tenantId)`. This allows the same Drive file to be referenced by different tenants independently, while preventing duplicates within a single tenant.

**Migration safety:** Adding a nullable column is LOW risk. Changing the unique index is MEDIUM risk -- the old index must be dropped and the new one created. Existing data is not lost, but the constraint changes. Backfill `tenant_id` from the parent `library_items.tenant_id` via a SQL UPDATE after the column is added.

The updated definition:

```typescript
export const libraryLinks = pgTable("library_links", {
  id: serial("id").primaryKey(),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  linkType: varchar("link_type", { length: 64 }).notNull(),
  linkId: varchar("link_id", { length: 128 }).notNull(),
  providerTaskId: varchar("provider_task_id", { length: 128 }),
  tenantId: varchar("tenant_id", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("library_links_source_tenant_unique").on(t.linkType, t.linkId, t.tenantId),
  index("library_links_item_type_idx").on(t.libraryItemId, t.linkType),
  index("library_links_provider_task_idx").on(t.providerTaskId),
]);
```

**Post-migration backfill SQL** (run after Drizzle migration applies):

```sql
UPDATE library_links ll
SET tenant_id = li.tenant_id
FROM library_items li
WHERE ll.library_item_id = li.id
  AND ll.tenant_id IS NULL;
```

### 6. Existing Table Modification: `credit_transactions`

**Current state** (line 170 in schema.ts): The table has `id`, `userId`, `amount`, `type`, `description`, `metadata`, `balanceAfter`, `referenceId`, `createdAt`.

**Change required:** Add a nullable `idempotencyKey` column with a partial unique index (unique only when non-null). This prevents double-charging for the same operation.

Add this column to the table definition:

```typescript
/** Idempotency key to prevent duplicate charges for the same operation */
idempotencyKey: varchar("idempotency_key", { length: 256 }),
```

Add this index in the table's constraint array (if the table does not currently have a constraint callback, add one):

```typescript
uniqueIndex("credit_transactions_idempotency_key_unique")
  .on(t.idempotencyKey)
  .where(sql`idempotency_key IS NOT NULL`),
```

**Migration safety:** Adding a nullable column with a partial unique index is LOW risk. No existing data is affected.

### 7. Python/SQLAlchemy Model: `oauth_connections` Extensions

**Current state** (file `/home/dev/projects/SmartSpecPro/python-backend/app/models/oauth.py`):

The `OAuthConnection` model has: `id`, `user_id`, `provider`, `provider_user_id`, `access_token`, `refresh_token`, `token_expires_at`, `profile_data`, `created_at`, `updated_at`. It has an empty `__table_args__`.

**Changes required:**

1. Add `status` column: `Column(String(20), nullable=False, server_default="active")` -- values: `active`, `expired`, `revoked`.
2. Add `scopes` column: `Column(Text, nullable=True)` -- stores granted OAuth scopes as comma-separated string (e.g., `"openid,email,drive.readonly,drive.file"`).
3. Add `tenant_id` column: `Column(String(36), nullable=True)` -- for multi-tenant isolation. Nullable because existing rows may not have tenant context.
4. Add unique constraint: `UniqueConstraint("user_id", "provider", name="uq_oauth_connections_user_provider")` in `__table_args__`.

**Updated model stub:**

```python
class OAuthConnection(Base):
    """OAuth connection model for social login and Google Drive integration."""

    __tablename__ = "oauth_connections"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), nullable=False, index=True)
    provider_user_id = Column(String(255), nullable=False)
    access_token = Column(Text)
    refresh_token = Column(Text)
    token_expires_at = Column(DateTime(timezone=True))
    profile_data = Column(Text)

    # New columns for Google Drive integration
    status = Column(String(20), nullable=False, server_default="active")
    scopes = Column(Text, nullable=True)
    tenant_id = Column(String(36), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_oauth_connections_user_provider"),
    )
```

### 8. Python Migration Script

**File:** `/home/dev/projects/SmartSpecPro/python-backend/migrations/003_oauth_drive_extensions.py`

This project uses custom migration scripts (not Alembic `versions/` directory). The script follows the pattern established by `001_marketplace_security_updates.py`: an async `upgrade()` function that uses `CREATE_ASYNC_ENGINE` and raw SQL via `session.execute(text(...))`.

The migration should:

1. Add `status` column with default `'active'` (using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
2. Add `scopes` column.
3. Add `tenant_id` column.
4. Add unique constraint on `(user_id, provider)` -- use `CREATE UNIQUE INDEX IF NOT EXISTS`.
5. Include a `downgrade()` function that drops the added columns and constraint.

Use `IF NOT EXISTS` / `IF EXISTS` guards so the migration is idempotent (safe to run multiple times).

### 9. Existing Table Usage (No Schema Changes Needed)

The following tables will use existing columns with new values. No schema modifications are required, but these conventions must be documented for downstream sections:

- **`library_items.source`**: Use the string value `"google_drive"` for virtual references to Drive files.
- **`library_items.metadata`** (JSON column): Store Drive-specific metadata: `{ driveFileId: string, driveMimeType: string, driveModifiedTime: string, contentHash: string, syncStatus: string }`.
- **`library_links.link_type`**: Use `"google_drive_file"` with `link_id` set to the Drive file ID.
- **`library_index_jobs.jobType`**: Use `"google_drive_sync"` for Drive indexing jobs.

---

## Migration Execution Steps

After making all schema changes, follow this exact sequence:

### Step A: Backup (mandatory before any migration)

```bash
cd /home/dev/projects/SmartSpecPro
mkdir -p .db-backups

# Backup affected tables
pg_dump "$DATABASE_URL" --data-only --table=library_links \
  --file=".db-backups/library_links_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=credit_transactions \
  --file=".db-backups/credit_transactions_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=oauth_connections \
  --file=".db-backups/oauth_connections_$(date +%Y%m%d_%H%M%S).sql"

# Record row counts
psql "$DATABASE_URL" -c "
  SELECT 'library_links' as tbl, count(*) FROM library_links
  UNION ALL SELECT 'credit_transactions', count(*) FROM credit_transactions
  UNION ALL SELECT 'oauth_connections', count(*) FROM oauth_connections;"
```

### Step B: Run Drizzle migration

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm db:push
```

This generates a new SQL file in `drizzle/` and applies it. The migration will:
- Create the `indexing_mode` and `edit_session_status` enums.
- Create the three new tables.
- Add `tenant_id` column to `library_links`.
- Drop the old `library_links_source_unique` index and create `library_links_source_tenant_unique`.
- Add `idempotency_key` column and partial unique index to `credit_transactions`.

### Step C: Backfill library_links.tenant_id

```bash
psql "$DATABASE_URL" -c "
  UPDATE library_links ll
  SET tenant_id = li.tenant_id
  FROM library_items li
  WHERE ll.library_item_id = li.id
    AND ll.tenant_id IS NULL;"
```

### Step D: Run Python migration

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
python -c "import asyncio; from migrations.003_oauth_drive_extensions import upgrade; asyncio.run(upgrade())"
```

### Step E: Verify data integrity

```bash
psql "$DATABASE_URL" -c "
  SELECT 'library_links' as tbl, count(*) FROM library_links
  UNION ALL SELECT 'credit_transactions', count(*) FROM credit_transactions
  UNION ALL SELECT 'oauth_connections', count(*) FROM oauth_connections
  UNION ALL SELECT 'google_drive_sync_state', count(*) FROM google_drive_sync_state
  UNION ALL SELECT 'google_drive_edit_sessions', count(*) FROM google_drive_edit_sessions
  UNION ALL SELECT 'user_credit_budgets', count(*) FROM user_credit_budgets;"
```

Row counts for existing tables must match pre-migration counts. New tables should have 0 rows.

---

## Dependencies on Other Sections

This section has **no dependencies** -- it can be implemented first.

The following sections depend on schema created here:

| Dependent Section | Tables Used |
|-------------------|-------------|
| section-03 (OAuth Consent) | `oauth_connections` (status, scopes, tenant_id) |
| section-04 (Credit Billing) | `credit_transactions.idempotency_key` |
| section-05 (Budget Protection) | `user_credit_budgets` |
| section-07 (Edit in Google) | `google_drive_edit_sessions` |
| section-08 (Virtual References) | `library_links.tenant_id`, `library_items` metadata conventions |
| section-11 (Sync & Webhooks) | `google_drive_sync_state` |
| section-14 (Disconnect) | All new tables (for cleanup) |