Now I have all the context I need. Let me generate the section-01-schema-migration content.

---

# Section 01: Schema Migration

## Overview

This section establishes the database foundation for Telegram notifications by adding four new columns to the users table and extending the user preferences type. It also fixes an existing schema drift and prepares the system settings for Telegram configuration.

**Dependencies:** None (foundation section)

**Blocks:** sections 02-06 (all backend sections require these columns)

## Tests First

No direct unit tests for schema changes. Schema validation occurs through:
1. Successful migration generation and application
2. Downstream tests in sections 03, 04, 06 that query these columns
3. TypeScript compile-time validation that schema types match usage

## What You're Implementing

### Problem Statement

SmartSpecPro needs to store Telegram account linkage data for each user. The existing `users` table tracks phone numbers and backup emails with `*Verified` patterns — we follow the same convention for Telegram.

Additionally, there's an **existing schema drift**: migration `0010_add_password_changed_at.sql` added the `passwordChangedAt` column to the database, but this column is missing from `apps/web/drizzle/schema.ts`. If we generate a new migration without fixing this, Drizzle will attempt to drop the column.

### Solution Architecture

1. **Fix schema drift** — Add `passwordChangedAt` to the schema before generating new migrations
2. **Add Telegram columns** — Four columns following the existing verified-field pattern
3. **Extend userPreferences JSON type** — Add Telegram notification preferences
4. **Update system settings schema** — Allow "telegram" as a settings category

## Database Changes

### File: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

#### Step 1: Fix passwordChangedAt Drift

Locate the users table definition (around line 35-94). Add this column to match the existing migration:

```typescript
// After lastSignedIn column (around line 93), add:
passwordChangedAt: timestamp("passwordChangedAt", { withTimezone: true }),
```

**Context:** This column was added by migration `0010_add_password_changed_at.sql` but never reflected in the schema file. Drizzle's migration generator compares `schema.ts` against the database — missing columns appear as "to be dropped" in the generated migration.

#### Step 2: Add Telegram Columns

Add these four columns to the users table definition (after `phoneVerified`, around line 84):

```typescript
// Telegram account linking
telegramChatId: varchar("telegramChatId", { length: 64 }),
telegramUsername: varchar("telegramUsername", { length: 64 }),
telegramVerified: boolean("telegramVerified").default(false).notNull(),
telegramVerifiedAt: timestamp("telegramVerifiedAt", { withTimezone: true }),
```

**Column rationale:**
- `telegramChatId` — Telegram's unique chat identifier (string, not numeric). Used as the destination for `sendMessage` API calls. Max observed length is ~15 chars, 64 allows for future format changes.
- `telegramUsername` — User's @username for display purposes (optional in Telegram, may be null)
- `telegramVerified` — Boolean flag indicating the chat was successfully linked via the /start verification flow. This is the **canonical signal** — even if `chatId` exists, only send notifications when `verified === true`.
- `telegramVerifiedAt` — Timestamp of verification completion, for audit trails

**Nullability:** `chatId`, `username`, and `verifiedAt` are nullable (user may not have linked yet). `verified` is NOT NULL with default false (consistent with `phoneVerified`, `backupEmailVerified`).

#### Step 3: Extend userPreferences Type

Locate the `userPreferences` JSON column definition (around line 75-78). Extend the type:

```typescript
userPreferences: json("userPreferences").$type<{
  translationLanguage?: string;
  translationModel?: string;
  telegramNotifyLevel?: "all" | "high_critical" | "critical_only" | "off";
  telegramDeliveryFailing?: boolean;
}>().default({})
```

**New fields:**
- `telegramNotifyLevel` — Controls which notification priorities trigger Telegram delivery. Default when linked: `"high_critical"`. Default when not linked: undefined (treated as `"off"`).
- `telegramDeliveryFailing` — Set to true when 5+ consecutive delivery failures occur (bot blocked, invalid chatId). Triggers a warning banner in the UI. Reset to false on next successful delivery.

**Why JSON vs columns:** These are user preferences that change frequently and don't need indexing. JSON avoids adding more nullable columns to an already-wide table. The `deliveryFailing` flag is informational only (not used for filtering).

**Note on failure tracking:** The consecutive failure *counter* is tracked in Redis (`telegram:failures:{userId}`) to avoid race conditions when multiple notification jobs fail simultaneously. The boolean flag in `userPreferences` is a denormalized "warning state" for the UI.

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts`

#### Step 4: Add "telegram" to settingCategorySchema

Locate the `settingCategorySchema` definition (line 17) and add `"telegram"`:

```typescript
const settingCategorySchema = z.enum(["stripe", "invoice", "email", "general", "oauth", "ai", "telegram"]);
```

**Why this matters:** The `systemSettings` table stores configuration in category/key pairs. The tRPC router validates category values with this enum. Without adding "telegram", attempts to save Telegram settings (in section 04) will fail validation with "Invalid enum value" errors.

## Migration Generation and Application

### Pre-Migration Checklist

**MANDATORY — Follow Database Safety Protocol from root CLAUDE.md:**

1. **Identify affected tables:**
   - `users` (4 columns added, 1 schema drift fixed)
   - `system_settings` (no schema change, only validation update)

2. **Backup the users table:**
```bash
mkdir -p /home/dev/projects/SmartSpecPro/.db-backups
pg_dump "$DATABASE_URL" --data-only --table=users \
  --file="/home/dev/projects/SmartSpecPro/.db-backups/users_$(date +%Y%m%d_%H%M%S).sql"
```

3. **Record current row counts:**
```bash
psql "$DATABASE_URL" -c "SELECT 'users' as tbl, count(*) as rows FROM users;"
```

Save the output (e.g., "users | 42") for post-migration verification.

### Generate Migration

Run from `apps/web/`:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm db:push
```

**What this does:**
1. `drizzle-kit generate` — Compares `schema.ts` against the database and creates a new `.sql` file in `drizzle/`
2. `drizzle-kit migrate` — Applies the migration to the database

**Expected migration content:**
```sql
-- Migration should contain ONLY these statements:
ALTER TABLE "users" ADD COLUMN "telegramChatId" VARCHAR(64);
ALTER TABLE "users" ADD COLUMN "telegramUsername" VARCHAR(64);
ALTER TABLE "users" ADD COLUMN "telegramVerified" BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN "telegramVerifiedAt" TIMESTAMP WITH TIME ZONE;
```

**If you see passwordChangedAt in the migration:** This indicates step 1 (fixing drift) was missed. The migration will try to add it again (benign due to `IF NOT EXISTS`) or drop it (data loss). Stop and fix the schema first.

### Post-Migration Verification

**Immediately after migration, verify all checks:**

```bash
# 1. Verify row counts match (no data loss)
psql "$DATABASE_URL" -c "SELECT 'users' as tbl, count(*) as rows FROM users;"
# Compare with pre-migration count — must match exactly

# 2. Verify new columns exist
psql "$DATABASE_URL" -c "\d users" | grep telegram
# Should show: telegramChatId, telegramUsername, telegramVerified, telegramVerifiedAt

# 3. Spot-check existing data is intact
psql "$DATABASE_URL" -c "SELECT id, email, role FROM users LIMIT 3;"

# 4. Verify passwordChangedAt wasn't dropped
psql "$DATABASE_URL" -c "\d users" | grep passwordChangedAt
# Should show: passwordChangedAt
```

**If any check fails:**
1. **STOP immediately** — Do not proceed to other sections
2. **Restore the backup:**
   ```bash
   psql "$DATABASE_URL" < "/home/dev/projects/SmartSpecPro/.db-backups/users_TIMESTAMP.sql"
   ```
3. **Review the generated migration** — Identify what went wrong (did Drizzle generate DROP statements?)
4. **Fix the schema** and regenerate

### If `drizzle-kit migrate` Fails

If the migration generation succeeds but `drizzle-kit migrate` fails (e.g., due to drizzle metadata corruption):

```bash
# Apply the migration manually
psql "$DATABASE_URL" -f "/home/dev/projects/SmartSpecPro/apps/web/drizzle/XXXX_migration_name.sql"

# Seed the hash into Drizzle's migration tracking table
# (This prevents Drizzle from attempting to re-apply it)
psql "$DATABASE_URL" -c "
  INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
  VALUES ('HASH_FROM_MIGRATION_FILE', CURRENT_TIMESTAMP);
"
```

The hash value is the filename without the extension (e.g., `0012_add_telegram_columns`).

## System Settings Data

**No data migration needed.** The `system_settings` table is already designed for dynamic category/key pairs. Admin UI (section 07) will create the Telegram entries on first save:

| category | key | value | isSensitive |
|----------|-----|-------|-------------|
| telegram | bot_token | (encrypted) | true |
| telegram | bot_username | SmartSpecProBot | false |
| telegram | webhook_secret | (encrypted, auto-generated) | true |
| telegram | app_url | https://app.smartspecpro.com | false |
| telegram | enabled | true | false |

## TypeScript Type Validation

After migration, rebuild the project to ensure TypeScript picks up the new column types:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm check
```

**Expected:** No type errors related to users table or userPreferences.

**If you see type errors in existing code referencing passwordChangedAt:** This confirms the drift was fixed correctly (the code was referencing a column that didn't exist in the schema).

## Dependencies for Downstream Sections

**Sections 02-06 depend on this migration being complete:**
- Section 03 (Telegram Service) queries `telegramChatId`, `telegramVerified`, `userPreferences.telegramNotifyLevel`
- Section 04 (Admin Backend) writes to `system_settings` with category "telegram"
- Section 05 (Webhook Python) updates `telegramChatId`, `telegramUsername`, `telegramVerified`, `telegramVerifiedAt`
- Section 06 (User Backend) reads and updates all Telegram columns

**Do not proceed to other sections until:**
1. Migration is successfully applied
2. All verification checks pass
3. Row counts match pre-migration baseline
4. TypeScript compilation succeeds

## Common Issues and Solutions

| Issue | Cause | Fix |
|-------|-------|-----|
| Migration attempts to DROP passwordChangedAt | Schema drift not fixed | Add `passwordChangedAt` to schema.ts before generating migration |
| `drizzle-kit migrate` fails with "hash mismatch" | Migration journal out of sync | Apply SQL manually, seed hash into `drizzle.__drizzle_migrations` |
| Row count decreased after migration | Migration generated DROP statements | Restore backup immediately, review generated migration for DROP statements |
| Type errors on `ctx.user.telegramChatId` in later sections | Migration not applied or schema rebuild needed | Run `pnpm db:push` and `pnpm check` |
| `Invalid enum value` when saving Telegram settings | settingCategorySchema not updated | Add "telegram" to the enum in systemSettings.ts |

## Success Criteria

- [ ] `passwordChangedAt` column exists in both database and schema.ts
- [ ] All 4 Telegram columns exist in users table
- [ ] userPreferences type includes `telegramNotifyLevel` and `telegramDeliveryFailing`
- [ ] settingCategorySchema includes "telegram"
- [ ] Migration successfully applied via `pnpm db:push`
- [ ] Row count in users table unchanged
- [ ] `pnpm check` passes with no type errors
- [ ] `.db-backups/users_*.sql` backup file exists

## File Summary

**Modified:**
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` — Added 4 Telegram columns, fixed passwordChangedAt drift, extended userPreferences type
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/systemSettings.ts` — Added "telegram" to settingCategorySchema

**Generated:**
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/0013_clear_victor_mancha.sql` — Auto-generated migration
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/0013_apply_telegram_columns.sql` — Manual idempotent version using IF NOT EXISTS
- `/home/dev/projects/SmartSpecPro/apps/web/scripts/apply-migration-0013.ts` — Migration application script with verification
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/meta/_journal.json` — Auto-updated

## Implementation Notes

**Migration Application:**
- Standard `npm run db:push` failed due to existing columns from uncommitted migrations
- Created idempotent SQL with IF NOT EXISTS logic
- Applied via custom TypeScript script using postgres.js
- Verified all 4 Telegram columns + passwordChangedAt added
- Row count unchanged (5 users)

**Schema Drift Fixes:**
- Fixed passwordChangedAt (missing from schema.ts)
- Migration includes priority enum and columns for scheduled_messages/user_notifications

**Database State:**
- All Telegram columns exist and are nullable except telegramVerified (default false, NOT NULL)
- userPreferences JSON type updated in schema only
- system_settings category enum updated for future use