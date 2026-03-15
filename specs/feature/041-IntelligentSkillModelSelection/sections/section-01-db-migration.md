# Section 01: Database Migration

## Overview

This section adds two new boolean columns to the `model_provider_map` table and provides a placeholder stub for a backfill mutation. These columns are prerequisites for every subsequent section in Feature 041.

**`supportsVision`** -- The existing schema tracks vision support at the provider level (`llmProviders.configJson.supportsVision`), but not per model. Many providers (e.g., OpenRouter) offer both vision and text-only models on the same provider entry. Skills that require image analysis need per-model vision metadata. This column fills that gap.

**`priorityLocked`** -- When the system auto-assigns a priority score to a newly enabled model (Section 02), it must know whether an admin has since overridden that value. `priorityLocked = true` means "admin set this manually -- do not overwrite on re-import or backfill." Auto-scoring logic (Sections 02, 05) checks this flag and skips locked entries.

Both columns default to `false`, so the migration is additive and backward-compatible. No existing queries, mutations, or TypeScript types break.

## Dependencies

- **None.** This is the first section and has no dependencies on other sections.
- Sections 02, 03, 05 all depend on the columns added here.

## Verification (Tests)

There are no unit tests for a migration. Verification is done post-migration via SQL and TypeScript compilation.

### Verification 1: SQL column check

After migration, run this query against the database to confirm both columns exist with correct types and defaults:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'model_provider_map'
  AND column_name IN ('supportsVision', 'priorityLocked');
```

**Expected result:** Two rows, both with `data_type = 'boolean'` and `column_default = 'false'`.

### Verification 2: TypeScript compilation

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check
```

Must pass with zero errors. The inferred types `ModelProviderMap` and `InsertModelProviderMap` automatically pick up the new columns, and all existing callers use only a subset of fields, so no compile errors are expected.

### Verification 3: Row count preservation

Before and after migration, row counts in `model_provider_map` must be identical. Record the count before running `db:push`:

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM model_provider_map;"
```

Re-run after migration and confirm the number has not changed.

## Implementation

### Step 1: Edit the schema

**File:** `apps/web/drizzle/schema.ts`

Locate the `modelProviderMap` table definition. Add two columns after the existing `supportsBackground` column and before the `isEnabled` column:

```typescript
/** Supports vision / image input */
supportsVision: boolean("supportsVision").default(false),

/** Whether priority was manually set by admin (locks against auto-reassignment) */
priorityLocked: boolean("priorityLocked").default(false),
```

The full column block in context (showing where the new columns fit among existing capability columns):

```typescript
// ── Capability metadata (for planner-based model selection) ──

/** Supports OpenAI Responses API */
supportsResponses: boolean("supportsResponses").default(false),

/** Supports structured output / JSON mode */
supportsStructuredOutputs: boolean("supportsStructuredOutputs").default(false),

/** Supports built-in web search */
supportsWebSearch: boolean("supportsWebSearch").default(false),

/** Supports function/tool calling */
supportsFunctionTools: boolean("supportsFunctionTools").default(false),

/** Supports code execution sandbox */
supportsCodeExecution: boolean("supportsCodeExecution").default(false),

/** Supports computer use / browser automation */
supportsComputerUse: boolean("supportsComputerUse").default(false),

/** Supports background/async processing */
supportsBackground: boolean("supportsBackground").default(false),

/** Supports vision / image input */
supportsVision: boolean("supportsVision").default(false),

/** Whether priority was manually set by admin (locks against auto-reassignment) */
priorityLocked: boolean("priorityLocked").default(false),

/** Whether this mapping is active */
isEnabled: boolean("isEnabled").default(true).notNull(),
```

The `supportsVision` column is placed alongside the other capability flags for readability. The `priorityLocked` column is placed after the capability block and before `isEnabled` because it is a control flag rather than a capability.

No changes are needed to the `uniqueIndex`, the type exports, or any other part of the table definition.

### Step 2: Run the migration

Follow the Database Safety Protocol from `CLAUDE.md`:

```bash
# Backup the table first
cd /home/dev/projects/SmartSpecPro
mkdir -p .db-backups
pg_dump "$DATABASE_URL" --data-only --table=model_provider_map \
  --file=".db-backups/model_provider_map_$(date +%Y%m%d_%H%M%S).sql"

# Record row count baseline
psql "$DATABASE_URL" -c "SELECT count(*) FROM model_provider_map;"

# Generate and apply the migration
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm db:push
```

This runs `drizzle-kit generate && drizzle-kit migrate`. The generated SQL will be an `ALTER TABLE` statement adding two nullable boolean columns with defaults.

The expected generated SQL is approximately:

```sql
ALTER TABLE "model_provider_map" ADD COLUMN "supportsVision" boolean DEFAULT false;
ALTER TABLE "model_provider_map" ADD COLUMN "priorityLocked" boolean DEFAULT false;
```

If `drizzle-kit migrate` fails, apply the SQL manually:

```bash
psql "$DATABASE_URL" -c "
  ALTER TABLE model_provider_map ADD COLUMN IF NOT EXISTS \"supportsVision\" boolean DEFAULT false;
  ALTER TABLE model_provider_map ADD COLUMN IF NOT EXISTS \"priorityLocked\" boolean DEFAULT false;
"
```

### Step 3: Verify post-migration

Run the three verification checks described above (SQL column check, `pnpm check`, row count comparison).

### Step 4: Add backfill mutation stub

**File:** `apps/web/server/routers/multiProvider.ts`

Add a placeholder tRPC mutation `backfillModelPriorities` to the multiProvider router. This is a stub only -- the full implementation depends on `computeModelPriority()` from Section 02. The stub allows Section 05 to fill in the logic without needing a new procedure registration.

Add this after the existing mutations in the router (near the end of the router definition):

```typescript
/**
 * One-time backfill: recompute priority for all model_provider_map rows
 * where priorityLocked = false. Idempotent and safe to re-run.
 *
 * Full implementation in Section 05 (depends on computeModelPriority from Section 02).
 */
backfillModelPriorities: adminProcedure
  .mutation(async ({ ctx }) => {
    // TODO(041-section-05): implement using computeModelPriority()
    // Iterate model_provider_map WHERE priorityLocked = false,
    // compute new priority for each row, UPDATE.
    return { success: true, updated: 0 };
  }),
```

This stub:
- Is gated behind `adminProcedure` (admin role required).
- Returns a typed response `{ success: boolean, updated: number }` so callers can be written against it immediately.
- Does nothing to the database (safe no-op until Section 05 fills it in).

## Backward Compatibility

Both new columns have `DEFAULT false` and are nullable (no `.notNull()` chain). This means:

1. **All existing `INSERT` statements** continue to work -- the columns receive their default values.
2. **All existing `SELECT` statements** continue to work -- Drizzle infers the new fields as optional on the TypeScript type, but existing callers that destructure only specific fields are unaffected.
3. **All existing `UPDATE` statements** continue to work -- they do not reference the new columns.
4. **The backfill stub** returns immediately with `updated: 0` -- no side effects.

No existing functionality changes behavior. The new columns are inert until Sections 02-05 wire them into scoring and selection logic.

## Files Modified

| File | Change |
|------|--------|
| `apps/web/drizzle/schema.ts` | Add `supportsVision` and `priorityLocked` columns to `modelProviderMap` table |
| `apps/web/drizzle/0072_red_zuras.sql` | Migration SQL adding the two columns |
| `apps/web/drizzle/meta/0072_snapshot.json` | Migration snapshot |

**Deviation from plan:** The `backfillModelPriorities` stub mutation was deferred to section-05. Reason: `multiProvider.ts` has ~200 lines of pre-existing feature-036 changes; staging the file for a no-op stub would mix unrelated code in this commit. The full implementation will be added directly in section-05.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Migration fails on large table | Low -- ADD COLUMN with DEFAULT is fast in PostgreSQL (no table rewrite since PG 11) | Use `IF NOT EXISTS` fallback if needed |
| Existing TypeScript callers break | Very low -- both columns are optional with defaults | `pnpm check` catches any issues immediately |
| Data loss during migration | None -- ADD COLUMN never deletes data | Backup taken before migration per protocol |
