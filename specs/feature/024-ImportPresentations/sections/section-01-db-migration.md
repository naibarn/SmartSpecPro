Now I have all the context I need to generate a complete, self-contained section for `section-01-db-migration`.

# Section 01: DB Migration + Contracts Update

## Overview

This section covers all database schema changes and TypeScript contract updates needed to support the presentation import feature. It is a prerequisite for sections 05 and 06 (Node.js tRPC router and service layer). Sections 02 and 03 (Python importers) can be implemented in parallel with this section.

**Test command:** `cd apps/web && pnpm check` (TypeScript type check after migration)

**Migration command:** `cd apps/web && pnpm db:push`

---

## Background

The `presentationConversionRecords` table currently exists in the schema and is used for tracking PPTX-to-deck conversion jobs. It needs to be extended to support the new import feature, which adds:

- Async job lifecycle tracking (`status`, `progress`)
- User ownership for callback handling (`userId`)
- Google Slides import support (`slidesUrl`)
- Proper NULL semantics on FK columns that cannot be populated at queue time

The existing schema (at `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`, lines 1832-1852) shows the current state of the table. Several FK columns are currently `notNull()` but must become nullable because they are set during or after deck creation — not at the point the conversion record is queued.

---

## Verification Tests (Manual Post-Migration Checks)

These are not automated unit tests. After running `pnpm db:push`, verify the following using `psql "$DATABASE_URL"` or equivalent:

1. **New columns exist with correct defaults:**
   ```sql
   SELECT column_name, column_default, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'presentation_conversion_records'
     AND column_name IN ('status', 'progress', 'user_id', 'slides_url');
   -- Expected: status default='queued', progress default=0, user_id NOT NULL, slides_url nullable
   ```

2. **FK columns are now nullable (INSERT with nulls succeeds):**
   ```sql
   -- This must not error:
   INSERT INTO presentation_conversion_records
     (tenant_id, source_format, idempotency_key, status, progress, user_id, expires_at)
   VALUES
     ('test-tenant', 'pptx', gen_random_uuid(), 'queued', 0, 1, NOW() + INTERVAL '1 day');
   -- source_item_id, deck_library_item_id, deck_id must all accept NULL
   ```

3. **Unique partial index replaces old unique index:**
   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE tablename = 'presentation_conversion_records'
     AND indexname LIKE '%source%';
   -- Must show a partial index with WHERE clause, NOT a plain unique index on (tenant_id, source_item_id)
   ```

4. **TypeScript compiles clean:**
   ```bash
   cd apps/web && pnpm check
   ```

5. **Row count unchanged** from pre-migration snapshot.

---

## Migration Procedure

Follow the Database Safety Protocol from CLAUDE.md before making any changes.

**Step 1 — Backup the table:**
```bash
mkdir -p .db-backups
pg_dump "$DATABASE_URL" --data-only --table=presentation_conversion_records \
  --file=".db-backups/presentation_conversion_records_$(date +%Y%m%d_%H%M%S).sql"

psql "$DATABASE_URL" -c "SELECT count(*) as rows FROM presentation_conversion_records;"
```

**Step 2 — Edit the schema file** (see changes below).

**Step 3 — Run migration:**
```bash
cd apps/web && pnpm db:push
```

**Step 4 — Verify** (run all SQL checks listed in the Verification Tests section above).

**Step 5 — TypeScript check:**
```bash
cd apps/web && pnpm check
```

---

## File: `apps/web/drizzle/schema.ts`

### Change 1 — Modify `presentationConversionRecords` table definition

The current definition (around line 1832) must be replaced. The complete updated table definition:

```typescript
export const presentationConversionRecords = pgTable("presentation_conversion_records", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Nullable: no source library item for Google Slides imports
  sourceItemId: integer("source_item_id").references(() => libraryItems.id, { onDelete: "cascade" }),

  sourceFormat: varchar("source_format", { length: 16 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),

  // Nullable: set by callback handler after deck creation completes
  deckLibraryItemId: integer("deck_library_item_id").references(() => libraryItems.id, { onDelete: "cascade" }),

  // Nullable: set by callback handler after deck creation completes
  deckId: integer("deck_id").references(() => presentationDecks.id, { onDelete: "cascade" }),

  // NEW: job lifecycle tracking
  status: varchar("status", { length: 16 }).notNull().default("queued"),
  // Values: "queued" | "processing" | "done" | "failed" | "cancelled"

  progress: integer("progress").notNull().default(0),
  // Values: 0–100

  // NEW: required so the callback handler can construct a PresentationActor
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // NEW: stores Google Slides URL when sourceFormat is "google_slides"
  slidesUrl: varchar("slides_url", { length: 2048 }),

  partialFidelity: boolean("partial_fidelity").notNull().default(false),
  fidelityWarnings: json("fidelity_warnings").$type<string[]>().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // CHANGED: partial unique index replaces plain unique index.
  // PostgreSQL allows multiple NULLs in a unique index, so a plain index on
  // (tenantId, sourceItemId) would permit any number of Google Slides rows
  // (all with sourceItemId=NULL). The partial index restricts uniqueness only
  // for PPTX imports that have a real sourceItemId.
  uniqueIndex("presentation_conversion_records_source_unique")
    .on(t.tenantId, t.sourceItemId)
    .where(sql`${t.sourceItemId} IS NOT NULL`),

  // Idempotency lookup index — unchanged
  index("presentation_conversion_records_idempotency_idx").on(t.tenantId, t.sourceItemId, t.idempotencyKey),

  index("presentation_conversion_records_expires_at_idx").on(t.expiresAt),

  // NEW: lookup by userId for ownership queries
  index("presentation_conversion_records_user_idx").on(t.userId),
]);

export type PresentationConversionRecord = typeof presentationConversionRecords.$inferSelect;
export type InsertPresentationConversionRecord = typeof presentationConversionRecords.$inferInsert;
```

**Important notes on the index change:**
- The `sql` template tag import is already used elsewhere in `schema.ts` (it comes from `drizzle-orm`). Confirm the import is present: `import { sql } from "drizzle-orm";`. If the partial index syntax is not supported by your version of drizzle-kit, the alternative is to drop the index in a raw SQL migration and recreate it manually, then record the migration hash.
- The old index name `presentation_conversion_records_source_unique` is reused intentionally — drizzle-kit will drop and recreate it because the definition changed.

---

## File: `apps/web/shared/presentation/contracts.ts`

### Change — Add `"google_slides"` to `presentationReadOnlySourceFormatSchema`

The current schema (around line 99) defines:

```typescript
const presentationReadOnlySourceFormatSchema = z.enum([
  "pptx",
  "ppt",
  "unknown",
]);
```

Change it to:

```typescript
const presentationReadOnlySourceFormatSchema = z.enum([
  "pptx",
  "ppt",
  "google_slides",
  "unknown",
]);
```

Also update `presentationConversionResultSchema` (around line 139) which currently has:

```typescript
sourceFormat: z.enum(["pptx", "ppt"]),
```

Change it to:

```typescript
sourceFormat: z.enum(["pptx", "ppt", "google_slides"]),
```

**This is a TypeScript-only change.** The `source_format` column is `VARCHAR(16)` — not a Postgres enum type — so no SQL migration is required for this change. The string `"google_slides"` (13 chars) fits within the 16-char limit.

**Why this change is here:** The `sourceFormat` field on `presentationConversionRecords` and `presentationSourceAttachments` will be set to `"google_slides"` for Google Slides imports. Without updating the Zod schemas and TypeScript types, the tRPC router and service layer (sections 05 and 06) will fail type checks when they use `"google_slides"` as a valid value.

---

## Dependencies

- No other sections must complete before this one.
- Sections 05 and 06 (tRPC router and service layer) depend on this section completing first, as they both read and write the new `status`, `progress`, `userId`, and `slidesUrl` columns.

## What This Section Does NOT Include

- The `presentationSourceAttachments` table is not modified in this section — its existing `sourceFormat` column already accepts arbitrary `VARCHAR(16)` values, and the Zod schema update above covers the contract layer.
- No new tables are created.
- No changes to `presentationConversionLocks` or any other table.
- Python backend changes (requirements.txt, importers) are in sections 02 and 03.

---

## Implementation Notes (Actual vs Plan)

### Additional files changed beyond the plan

The plan listed two files to change. Implementation required 3 additional server-side files to maintain TypeScript compilation and runtime correctness:

**`apps/web/server/services/presentationPersistence.ts`** (not in plan):
- `StoredPresentationConversionRecord.sourceFormat` widened to `"pptx" | "ppt" | "google_slides"`
- `StoredPresentationConversionRecord.sourceItemId/deckLibraryItemId/deckId` made `number | null`
- `UpsertPresentationConversionRecordInput` extended with `userId: number`, `sourceItemId: number | null`, `sourceFormat: "pptx" | "ppt" | "google_slides"` (widen for sections 05/06)
- `mapStoredConversionRecord` updated to handle `"google_slides"` format correctly
- `upsertPresentationConversionRecord` insert: added `userId: input.userId`
- `onConflictDoUpdate`: added `targetWhere: sql\`${presentationConversionRecords.sourceItemId} IS NOT NULL\`` — required because the plain unique index was replaced with a partial unique index; without this, `ON CONFLICT` throws `there is no unique or exclusion constraint matching the ON CONFLICT specification` at runtime

**`apps/web/server/services/presentationCompatibilityService.ts`** (not in plan):
- `ConversionRecord.sourceFormat` widened to include `"google_slides"`
- `PresentationConversionDependencies.upsertStoredConversionRecord` interface: added `userId`, widened `sourceItemId`/`sourceFormat`
- `fallbackStateDependencies.upsertStoredConversionRecord`: added `userId`, widened `sourceItemId`/`sourceFormat`
- `buildSourceKey` signature: `sourceItemId: number | null`
- Call site at line 593: added `userId: actor.userId`

### Plan omissions addressed

1. **`onConflictDoUpdate` / partial index**: The plan did not mention updating the existing upsert's `ON CONFLICT` clause after changing from a plain to a partial unique index. This is a mandatory fix — failure would crash the PPTX flow at runtime.
2. **`presentationConversionResultSchema.sourceItemId`**: Made `.optional()` (per user decision) to support Google Slides records where `sourceItemId` is null.
3. **Interface widening for sections 05/06**: `sourceItemId: number | null` and `sourceFormat` extended to include `"google_slides"` to unblock the Google Slides import path in future sections.

### Generated migration

`apps/web/drizzle/0037_silky_otto_octavius.sql` — applied successfully via `pnpm db:push`.