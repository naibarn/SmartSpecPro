I have all the context I need. Now I'll generate the complete section content.

# Section 01: Database Migration

## Overview

This is the first section in the implementation order. All downstream code — the Node.js export service, the tRPC router, the Python backend, and the React frontend — depends on the schema changes in this section being committed to the database before any other work begins.

This section adds:
1. A new `presentation_exports` table (stores export job records persistently)
2. A nullable `audioTrack` JSON column on the existing `presentation_slides` table
3. A nullable `projectAudioTrack` JSON column on the existing `presentation_decks` table

**This section has no dependencies on other feature sections.** It blocks sections 02, 03, and 05.

---

## Tests (Write First — TDD)

**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.test.ts`

Extend the existing test file. Add a new `describe` block. These are schema-shape tests (no DB connection needed) plus integration-style comments for post-migration verification.

```typescript
// Append to: /home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.test.ts

import {
  presentationExports,
  presentationSlides,
  presentationDecks,
} from './schema';

describe('presentation_exports table schema', () => {
  test('table is defined', () => {
    expect(presentationExports).toBeDefined();
  });

  test('has required columns', () => {
    const cols = presentationExports._.columns;
    expect(cols.id).toBeDefined();
    expect(cols.deckId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.tenantId).toBeDefined();
    expect(cols.format).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.progressPct).toBeDefined();
    expect(cols.stage).toBeDefined();
    expect(cols.errorMessage).toBeDefined();
    expect(cols.outputUrl).toBeDefined();
    expect(cols.outputStorageKey).toBeDefined();
    expect(cols.outputBytes).toBeDefined();
    expect(cols.width).toBeDefined();
    expect(cols.height).toBeDefined();
    expect(cols.fps).toBeDefined();
    expect(cols.quality).toBeDefined();
    expect(cols.celeryTaskId).toBeDefined();
    expect(cols.idempotencyKey).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  test('status column has default "queued"', () => {
    expect(presentationExports._.columns.status.default).toBe('queued');
  });

  test('progressPct column has default 0', () => {
    expect(presentationExports._.columns.progressPct.default).toBe(0);
  });

  test('width column has default 1920', () => {
    expect(presentationExports._.columns.width.default).toBe(1920);
  });

  test('height column has default 1080', () => {
    expect(presentationExports._.columns.height.default).toBe(1080);
  });

  test('idempotencyKey has a unique index', () => {
    const indexes = presentationExports[Symbol.for('drizzle:Indexes')];
    const uniqueIdx = indexes?.find(
      (idx: any) => idx.config.name === 'presentation_exports_idempotency_key_unique'
    );
    expect(uniqueIdx).toBeDefined();
    expect(uniqueIdx?.config.unique).toBe(true);
  });

  test('outputStorageKey column is nullable', () => {
    expect(presentationExports._.columns.outputStorageKey.notNull).toBeFalsy();
  });

  test('userId column is nullable (set null on user delete)', () => {
    expect(presentationExports._.columns.userId.notNull).toBeFalsy();
  });

  test('deckId column references presentation_decks', () => {
    expect(presentationExports._.columns.deckId.references).toBeDefined();
  });
});

describe('presentation_slides audio column', () => {
  test('audioTrack column exists', () => {
    expect(presentationSlides._.columns.audioTrack).toBeDefined();
  });

  test('audioTrack column is nullable', () => {
    expect(presentationSlides._.columns.audioTrack.notNull).toBeFalsy();
  });
});

describe('presentation_decks project audio column', () => {
  test('projectAudioTrack column exists', () => {
    expect(presentationDecks._.columns.projectAudioTrack).toBeDefined();
  });

  test('projectAudioTrack column is nullable', () => {
    expect(presentationDecks._.columns.projectAudioTrack.notNull).toBeFalsy();
  });
});
```

**Run the tests (they will fail until implementation is complete):**

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test drizzle/schema.test.ts
```

---

## Implementation

### Step 1: Pre-migration DB Backups (DB Safety Protocol — Mandatory)

Before editing any schema file, take backups of the two tables that will be altered:

```bash
cd /home/dev/projects/SmartSpecPro
mkdir -p .db-backups

# Backup presentation_decks (receiving a new column)
pg_dump "$DATABASE_URL" --data-only --table=presentation_decks \
  --file=".db-backups/presentation_decks_$(date +%Y%m%d_%H%M%S).sql"

# Backup presentation_slides (receiving a new column)
pg_dump "$DATABASE_URL" --data-only --table=presentation_slides \
  --file=".db-backups/presentation_slides_$(date +%Y%m%d_%H%M%S).sql"

# Record row counts as verification baseline
psql "$DATABASE_URL" -c "
  SELECT 'presentation_decks' as tbl, count(*) as rows FROM presentation_decks
  UNION ALL
  SELECT 'presentation_slides', count(*) FROM presentation_slides;
"
```

### Step 2: Edit `apps/web/drizzle/schema.ts`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

#### 2a. Add audio JSON types above the presentation section

Near the top of the Presentation Editing Tables comment block (around line 1720), add TypeScript types that describe the shapes stored in the JSON columns. These types are used only for Drizzle `$type<>()` annotations; the authoritative Zod schemas live in Section 02 (shared contracts).

```typescript
// Audio track shapes stored in JSON columns.
// Zod validation is in shared/presentation/contracts.ts (Section 02).
type SlideAudioTrackJson = {
  libraryItemId: number;
  volume: number;       // 0.0 – 1.0
  startAtMs: number;    // default 0
  endAtMs: number | null; // null = play to natural end
};

type DeckAudioTrackJson = {
  libraryItemId: number;
  volume: number;       // 0.0 – 1.0
  loop: boolean;
  fadeOutMs: number | null;
};
```

#### 2b. Add `projectAudioTrack` to `presentationDecks`

In the `presentationDecks` table definition, add the new nullable JSON column after `slideCount` (or `totalAssetBytes`):

```typescript
projectAudioTrack: json("project_audio_track").$type<DeckAudioTrackJson | null>(),
```

The full updated table should look like:

```typescript
export const presentationDecks = pgTable("presentation_decks", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  libraryItemId: integer("library_item_id").notNull().references(() => libraryItems.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  version: integer("version").notNull().default(1),
  slideCount: integer("slide_count").notNull().default(0),
  totalAssetBytes: integer("total_asset_bytes").notNull().default(0),
  projectAudioTrack: json("project_audio_track").$type<DeckAudioTrackJson | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // ... existing indexes unchanged ...
]);
```

#### 2c. Add `audioTrack` to `presentationSlides`

In the `presentationSlides` table definition, add the new nullable JSON column after `slideContent`:

```typescript
audioTrack: json("audio_track").$type<SlideAudioTrackJson | null>(),
```

The full updated table:

```typescript
export const presentationSlides = pgTable("presentation_slides", {
  id: serial("id").primaryKey(),
  deckId: integer("deck_id").notNull().references(() => presentationDecks.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
  version: integer("version").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull().default("Slide"),
  slideContent: json("slide_content").$type<Record<string, any>>().notNull().default({}),
  audioTrack: json("audio_track").$type<SlideAudioTrackJson | null>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // ... existing indexes unchanged ...
]);
```

#### 2d. Add the new `presentationExports` table

Insert this new table definition **after** the `presentationConversionLocks` block (around line 1850) and **before** the Google Drive Integration section:

```typescript
// ============================================================
// Presentation Export Jobs
// ============================================================

export const presentationExports = pgTable("presentation_exports", {
  id: serial("id").primaryKey(),

  // FK to deck — cascade delete (export history gone when deck is deleted)
  deckId: integer("deck_id")
    .notNull()
    .references(() => presentationDecks.id, { onDelete: "cascade" }),

  // FK to user — set null (preserve export audit trail if user is deleted)
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),

  tenantId: varchar("tenant_id", { length: 36 }).notNull(),

  // Export parameters
  format: varchar("format", { length: 8 }).notNull(),          // png | jpg | pdf | mp4
  quality: varchar("quality", { length: 12 }),                 // draft | standard | high
  width: integer("width").notNull().default(1920),
  height: integer("height").notNull().default(1080),
  fps: integer("fps"),                                         // MP4 only; default 30 in Python task

  // Job lifecycle
  status: varchar("status", { length: 16 }).notNull().default("queued"),
  // queued | processing | done | error | cancelled
  // Note: "cancelled" is reserved for future use — no code path sets it in v1
  progressPct: integer("progress_pct").notNull().default(0),   // 0 – 100
  stage: varchar("stage", { length: 64 }),                     // e.g. "rendering", "encoding", "uploading"
  errorMessage: text("error_message"),

  // Output
  outputUrl: text("output_url"),                               // 24-hour presigned S3/R2 download URL
  outputStorageKey: text("output_storage_key"),                // raw S3 key; used to re-presign if expired
  outputBytes: bigint("output_bytes", { mode: "number" }),

  // Celery bridge
  celeryTaskId: varchar("celery_task_id", { length: 255 }),

  // Deduplication (unique constraint enforced below)
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("presentation_exports_idempotency_key_unique").on(t.idempotencyKey),
  index("presentation_exports_deck_idx").on(t.deckId),
  index("presentation_exports_user_idx").on(t.userId),
  index("presentation_exports_tenant_idx").on(t.tenantId),
  index("presentation_exports_celery_task_idx").on(t.celeryTaskId),
]);

export type PresentationExport = typeof presentationExports.$inferSelect;
export type InsertPresentationExport = typeof presentationExports.$inferInsert;
```

**Important notes on the schema definition:**
- `bigint` for `outputBytes` requires `{ mode: "number" }` to get a JavaScript `number` type instead of `bigint`. This is consistent with how other large-integer columns are handled in this project.
- `userId` uses `integer` (not `varchar`) matching the `users.id: serial` type used throughout the project.
- The `tenantId` column does NOT have a `.references()` FK because the cascade already comes from the `deckId` FK. Adding a direct FK to `tenants` would be redundant and could cause ordering issues during migrations.
- All status values (`queued`, `processing`, `done`, `error`, `cancelled`) are stored as plain `varchar`, not a PostgreSQL enum. This is consistent with `conversionStatus` and other status columns in the presentation tables. Adding a new enum would require extra migration steps.

### Step 3: Run Migration

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm db:push
```

This runs `drizzle-kit generate && drizzle-kit migrate`. Watch for:
- No errors about column type conflicts
- Migration file generated in `apps/web/drizzle/`
- "migrations applied successfully" in the output

### Step 4: Verify Migration

```bash
# Confirm row counts haven't changed (no data loss on additive columns)
psql "$DATABASE_URL" -c "
  SELECT 'presentation_decks' as tbl, count(*) as rows FROM presentation_decks
  UNION ALL
  SELECT 'presentation_slides', count(*) FROM presentation_slides;
"

# Confirm new table exists
psql "$DATABASE_URL" -c "\d presentation_exports"

# Confirm new columns exist on existing tables
psql "$DATABASE_URL" -c "\d presentation_slides" | grep audio
psql "$DATABASE_URL" -c "\d presentation_decks" | grep project_audio

# Verify nullable columns on existing tables accept NULL (should already have NULLs for old rows)
psql "$DATABASE_URL" -c "
  SELECT count(*) as null_audio_tracks
  FROM presentation_slides
  WHERE audio_track IS NULL;
"

# Verify unique constraint on idempotency_key
psql "$DATABASE_URL" -c "
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'presentation_exports'
  ORDER BY indexname;
"
```

**Expected psql output for `\d presentation_exports`** (abbreviated):

```
                         Table "public.presentation_exports"
      Column         |            Type             | Nullable |      Default
---------------------+-----------------------------+----------+--------------------
 id                  | integer                     | not null | nextval(...)
 deck_id             | integer                     | not null |
 user_id             | integer                     |          |
 tenant_id           | character varying(36)       | not null |
 format              | character varying(8)        | not null |
 quality             | character varying(12)       |          |
 width               | integer                     | not null | 1920
 height              | integer                     | not null | 1080
 fps                 | integer                     |          |
 status              | character varying(16)       | not null | 'queued'::character varying
 progress_pct        | integer                     | not null | 0
 stage               | character varying(64)       |          |
 error_message       | text                        |          |
 output_url          | text                        |          |
 output_storage_key  | text                        |          |
 output_bytes        | bigint                      |          |
 celery_task_id      | character varying(255)      |          |
 idempotency_key     | character varying(128)      | not null |
 created_at          | timestamp with time zone    | not null | now()
 updated_at          | timestamp with time zone    | not null | now()
```

### Step 5: Run Tests

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test drizzle/schema.test.ts
```

All tests in the new `presentation_exports table schema`, `presentation_slides audio column`, and `presentation_decks project audio column` describe blocks should pass.

---

## Risk Notes

- Both column additions (`audioTrack`, `projectAudioTrack`) are **additive nullable columns** on existing tables with live data. This is the lowest-risk migration category — existing rows get `NULL` for the new column, which is expected behavior.
- The new `presentation_exports` table is created from scratch — no existing data is at risk.
- If `pnpm db:push` fails (e.g., Drizzle hash journal conflict), apply the generated SQL manually with `psql "$DATABASE_URL" -f drizzle/XXXX_migration.sql` and seed the hash into `drizzle.__drizzle_migrations` as documented in the root `CLAUDE.md` under "Migration Completion Rules".
- Do not proceed to Section 02 (Shared Contracts) until `\d presentation_exports` confirms the table exists and row counts on the existing tables match pre-migration values.
---

## Implementation Notes (Actual vs Planned)

### Deviations from Plan
1. **format column**: Changed to `varchar(16)` (plan specified `varchar(8)`) — approved via code review for future-proofing
2. **Composite index**: Added `presentation_exports_tenant_status_idx` on `(tenant_id, status)` — not in original plan, added for polling query efficiency
3. **Audio types exported**: `SlideAudioTrackJson` and `DeckAudioTrackJson` are exported (plan said they'd be annotation-only private types) — downstream sections need the exports
4. **Drizzle API update**: Schema tests use `getTableColumns(table)` from `drizzle-orm` instead of `table._.columns` (Drizzle 0.44.x removed the `_` accessor)
5. **vitest.config.ts**: Added `drizzle/*.test.ts` to include patterns so schema tests run
6. **Migration 0036**: `format` varchar(8)→16 and composite index required a second migration run

### Files Created/Modified
- **Modified**: `apps/web/drizzle/schema.ts` — added audio types, new columns, `presentationExports` table
- **Modified**: `apps/web/drizzle/schema.test.ts` — updated to Drizzle 0.44.x API, added 17 new tests
- **Modified**: `apps/web/vitest.config.ts` — added `drizzle/*.test.ts` include pattern
- **Created**: `apps/web/drizzle/0035_round_preak.sql` — initial migration (presentationExports, audio columns)
- **Created**: `apps/web/drizzle/0036_nosy_timeslip.sql` — format varchar(16), composite index
- **Created**: `apps/web/drizzle/meta/0035_snapshot.json`
- **Created**: `apps/web/drizzle/meta/0036_snapshot.json`
- **Updated**: `apps/web/drizzle/meta/_journal.json` — entries 0035 and 0036

### Test Results
- 31 schema tests pass (14 existing + 17 new)
- 45 pre-existing test failures in full suite (confirmed to exist before this section)
- No regressions introduced

### DB State After Migration
- `presentation_exports`: 20 columns, 7 indexes (including unique idempotency_key and composite tenant+status)
- `presentation_slides.audio_track`: nullable JSON
- `presentation_decks.project_audio_track`: nullable JSON
- Row counts preserved: 7 decks, 5 slides
