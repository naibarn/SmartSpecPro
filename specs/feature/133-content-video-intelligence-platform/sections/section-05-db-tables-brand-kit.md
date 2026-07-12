I have all the context needed. Here is the section content.

<!-- The SubagentStop hook will extract the markdown below and write it to section-05-db-tables-brand-kit.md -->

# Section 05 — DB Tables & Brand Kit

**Section id:** `section-05-db-tables-brand-kit`
**Source:** `claude-plan.md` §6 (data model) · `claude-plan-tdd.md` Section 5 · `spec.md` §14.1/§14.2 · interview Q3 (brand kit = minimal + locks).
**Work dir:** `/home/dev/projects/SmartSpecPro/apps/web`
**Depends on:** nothing (DB-only, no code deps on section-01). **Blocks:** section-07 (router reads/writes these tables via the thin repo defined here).
**Batch:** 1 (parallel with section-01).

---

## 1. Scope & intent

Add three **additive** Postgres tables plus a **thin data-access repo** so later sections have durable storage for the Video Intelligence platform:

1. `video_projects` — one row per authored project; holds the `VideoProjectDocument` JSONB (schema owned by section-01), stage status, brand-kit link, source refs, QA ledger, and render-job backlinks.
2. `video_project_revisions` — lean append-only document history for optimistic-concurrency saves and restore.
3. `brand_kits` — Phase-1 minimal brand kit (logo, colors, fonts, caption preset) **with enforced locks** (interview Q3). The lock *enforcement* itself is deterministic and lives in the compiler (section-01, `BrandLockViolationError`); this section only persists `locks`.

This section is **DB + repo only**. No tRPC procedures, no UI. The `videoProjects` router (section-07) is the consumer and calls the repo functions defined here.

**Explicitly NOT in this migration** (`claude-plan.md` §6.3): no render-job table (reuse `worker_jobs`), no motion-template table (code registry, section-02), no claim-evidence table (reuse `marketplaceCaptureInsights`), no `media_clip_index` (Phase 4), and **no advanced brand-kit columns** (motionPersonality / transitionStyle / musicStyle / ctaStyle / cameraBehavior are added later — leave them out).

---

## 2. Files

| File | Action |
|---|---|
| `apps/web/drizzle/schema.ts` | **Modify** — append three `pgTable` definitions + `$inferSelect`/`$inferInsert` type exports, near the other feature tables. All needed imports (`bigserial`, `bigint`, `integer`, `varchar`, `jsonb`, `timestamp`, `serial`, `index`, `uniqueIndex`) already exist at the top of the file — do not add imports. |
| `apps/web/drizzle/manual_video_intelligence_tables.sql` | **Create** — idempotent hand-authored `CREATE TABLE IF NOT EXISTS` migration (fallback path; see §5). |
| `apps/web/server/services/videoProjectRepo.ts` | **Create** — thin, tenant+owner-scoped data-access helpers over the three tables. This is the module `videoProjectRepo.test.ts` (TDD Section 5) targets. |
| `apps/web/server/services/__tests__/videoProjectRepo.test.ts` | **Create (tests first)** — TRPC-style mocked `db` chain. |
| `apps/web/drizzle/meta/_journal.json` + generated `.sql` | **Modify/verify** — only if `drizzle-kit generate` succeeds (§5). |

---

## 3. Table specifications (authoritative — column types are load-bearing)

Match the existing `verticalDramaEpisodes` style (`drizzle/schema.ts` ~L20662): `bigserial` PK in `{ mode: "number" }`, `tenantId varchar(36)` **without** an FK (matches every tenant-scoped table in this schema), `userId integer` **with** `.references(() => users.id, { onDelete: "cascade" })`, camelCase column names, `defaultNow().notNull()` timestamps.

Referenced-table id types (verified in `schema.ts`) — **use exactly these** or FK creation fails:
- `users.id` → `integer`
- `media_assets.id` → `bigserial`/`bigint` (number)
- `library_items.id` → `serial`/`integer`
- `worker_jobs.id` → treat as `varchar(36)` string backlink, **no FK** (loose backlink; the worker fabric owns that table).

### 3.1 `video_projects` (spec §14.1)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK (number) | |
| `tenantId` | `varchar(36)` NOT NULL | no FK (tenant convention) |
| `userId` | `integer` NOT NULL | FK → `users.id` cascade |
| `studioType` | `varchar(20)` NOT NULL | `catalog`\|`motion`\|`content`\|`review_remix`\|`imported` |
| `name` | `varchar(200)` NOT NULL | |
| `status` | `varchar(30)` NOT NULL default `"brief"` | `brief`\|`content`\|`narration`\|`scenes`\|`motion`\|`assets`\|`captions`\|`qa`\|`ready`\|`rendering`\|`completed`\|`failed` |
| `automationMode` | `varchar(10)` NOT NULL default `"guided"` | `auto`\|`guided`\|`expert` |
| `brief` | `jsonb` (nullable) | |
| `document` | `jsonb` (nullable) | `VideoProjectDocument` (section-01 schema) |
| `revision` | `integer` NOT NULL default `1` | optimistic-concurrency counter |
| `brandKitId` | `bigint` (number, nullable) | FK → `brand_kits.id` (set null) |
| `sourceRefs` | `jsonb` (nullable) | `{ productIds?, sourceVideoAssetId?, storyboardReviewId?, presentationDeckId?, verticalDramaEpisodeId?, articleLibraryItemId? }` |
| `qaLedger` | `jsonb` (nullable) | append-only review records |
| `renderJobId` | `varchar(36)` (nullable) | `worker_jobs.id` backlink, no FK |
| `previewJobId` | `varchar(36)` (nullable) | `worker_jobs.id` backlink, no FK |
| `resultLibraryItemId` | `integer` (nullable) | FK → `library_items.id` (set null) |
| `videoEditorProjectId` | `integer` (nullable) | Expert-bridge; unused Phase 1, leave nullable/no FK unless an existing project table is obvious — a plain nullable `integer` is acceptable |
| `createdAt` / `updatedAt` | `timestamptz` NOT NULL defaultNow | |

Indexes: `index("video_projects_tenant_user_status_idx").on(tenantId, userId, status)` and `index("video_projects_tenant_studio_idx").on(tenantId, studioType)`.

Type exports: `VideoProjectRow = typeof videoProjects.$inferSelect;` and `InsertVideoProjectRow = typeof videoProjects.$inferInsert;`.

> `brandKitId` FK references `brand_kits.id` — declare `brandKits` **before** `videoProjects` in the file (or use the `(): AnyPgColumn` lazy-ref form) so the reference resolves.

### 3.2 `video_project_revisions` (spec §14.1, lean history)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK (number) | |
| `projectId` | `bigint` NOT NULL | FK → `video_projects.id` cascade |
| `revision` | `integer` NOT NULL | |
| `document` | `jsonb` NOT NULL | full snapshot |
| `createdBy` | `integer` (nullable) | FK → `users.id` (set null) optional |
| `reason` | `varchar(200)` (nullable) | |
| `createdAt` | `timestamptz` NOT NULL defaultNow | |

Constraint: `uniqueIndex("video_project_revisions_project_revision_unique").on(projectId, revision)`.
Restore semantics (implemented in §4): copy the chosen revision's `document` back onto `video_projects.document` and **bump** `video_projects.revision` (never reuse an old number).

Type exports: `VideoProjectRevisionRow`, `InsertVideoProjectRevisionRow`.

### 3.3 `brand_kits` (spec §14.2, interview Q3 — minimal + locks)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK (number) | |
| `tenantId` | `varchar(36)` NOT NULL | no FK |
| `userId` | `integer` NOT NULL | FK → `users.id` cascade |
| `name` | `varchar(200)` NOT NULL | |
| `logoAssetId` | `bigint` (number, nullable) | FK → `media_assets.id` (set null) |
| `colors` | `jsonb` (nullable) | `{ primary, secondary?, accent? }` |
| `fonts` | `jsonb` (nullable) | `{ heading?, body? }` |
| `captionPresetId` | `varchar(64)` (nullable) | reuse existing `CaptionPresetId` values (section-01); do NOT invent a new enum |
| `locks` | `jsonb` (nullable) | `{ colors?: boolean, fonts?: boolean }` (Phase-1 minimal) |
| `createdAt` / `updatedAt` | `timestamptz` NOT NULL defaultNow | |

Index: `index("brand_kits_tenant_user_idx").on(tenantId, userId)`.
Type exports: `BrandKitRow`, `InsertBrandKitRow`.

> The `locks` shape must stay compatible with what the compiler's `BrandLockViolationError` check reads (section-01) — a boolean-per-token map keyed `colors`/`fonts`. Keep it a plain JSONB object.

---

## 4. `videoProjectRepo.ts` — thin data-access layer

Purpose: give section-07's router a small, testable surface and keep raw Drizzle queries out of the router. **Every function takes an explicit auth scope `{ tenantId, userId }` and filters on BOTH `tenantId` and `userId`** (spec §17.1 tenant+owner isolation). No cross-tenant read is ever possible through this repo.

Export signatures only (implementer fills bodies — no full implementations here):

```ts
// apps/web/server/services/videoProjectRepo.ts
import { db } from "<existing db handle>";           // reuse the app's Drizzle db, do not create a new pool
import { videoProjects, videoProjectRevisions, brandKits } from "../../drizzle/schema";

export type ProjectAuthScope = { tenantId: string; userId: number };

/** Insert a new project row scoped to tenant+user. Returns the created row. */
export function insertVideoProject(
  scope: ProjectAuthScope,
  values: Omit<InsertVideoProjectRow, "tenantId" | "userId">,
): Promise<VideoProjectRow>;

/** Owner-scoped single fetch; returns null when not found or foreign-tenant. */
export function getVideoProject(scope: ProjectAuthScope, id: number): Promise<VideoProjectRow | null>;

/** Owner-scoped list (optionally filtered by studioType/status). */
export function listVideoProjects(
  scope: ProjectAuthScope,
  filter?: { studioType?: string; status?: string },
): Promise<VideoProjectRow[]>;

/**
 * Optimistic-concurrency document save:
 *  - reject (throw a CONFLICT-mapped error) if `baseRevision !== current row.revision`
 *  - on success: write a video_project_revisions snapshot of the NEW document,
 *    bump video_projects.revision to baseRevision + 1, update document + updatedAt.
 * Returns the new revision number.
 */
export function saveVideoProjectDocument(
  scope: ProjectAuthScope,
  args: { id: number; baseRevision: number; document: unknown; reason?: string },
): Promise<{ revision: number }>;

/** List revision metadata (id, revision, reason, createdAt) newest-first. */
export function listVideoProjectRevisions(scope: ProjectAuthScope, projectId: number): Promise<VideoProjectRevisionRow[]>;

/**
 * Restore: copy the target revision's document back onto the project and
 * bump revision (never reuse an old number). Writes a new revision row too.
 */
export function restoreVideoProjectRevision(
  scope: ProjectAuthScope,
  args: { projectId: number; revision: number; reason?: string },
): Promise<{ revision: number }>;

/** Brand-kit CRUD, all tenant+owner scoped. */
export function insertBrandKit(scope: ProjectAuthScope, values: Omit<InsertBrandKitRow, "tenantId" | "userId">): Promise<BrandKitRow>;
export function getBrandKit(scope: ProjectAuthScope, id: number): Promise<BrandKitRow | null>;
export function listBrandKits(scope: ProjectAuthScope): Promise<BrandKitRow[]>;
export function updateBrandKit(scope: ProjectAuthScope, id: number, patch: Partial<Omit<InsertBrandKitRow, "tenantId" | "userId" | "id">>): Promise<BrandKitRow | null>;
export function deleteBrandKit(scope: ProjectAuthScope, id: number): Promise<boolean>;
```

Implementation notes:
- Reuse the existing app `db` handle (same import other `server/services/*.ts` files use) — do **not** open a new connection.
- `saveVideoProjectDocument` and `restoreVideoProjectRevision` must do the revision-write + revision-bump **atomically** (wrap in `db.transaction(...)`) so a crash can't leave `revision` and the snapshot table out of sync.
- The CONFLICT case should throw an error the router can map to a tRPC `CONFLICT` (e.g. a small `VideoProjectRevisionConflictError` class, or reuse the app's existing conflict-error convention if one exists — check `presentation` autosave precedent referenced in `claude-plan.md` §9.1). Do not swallow it.
- The optimistic-concurrency logic and error class are **the** substantive logic in this section; keep everything else a straight scoped query.

---

## 5. Migration procedure (Database Safety Protocol — MANDATORY)

All three tables are brand-new (additive) → **low data-loss risk**, but follow the protocol exactly (`CLAUDE.md` Database Safety + Migration Completion rules).

1. **Identify & backup.** No existing table is altered. Take a cheap full backup anyway before touching schema:
   `pg_dump "$DATABASE_URL" --file=".db-backups/full_backup_$(date +%Y%m%d_%H%M%S).sql"`.
2. **Baseline row counts** (will be 0 for the new tables; capture for symmetry).
3. **Preferred path:** edit `drizzle/schema.ts`, then run `cd apps/web && pnpm db:push` (`drizzle-kit generate && drizzle-kit migrate`). Confirm "migrations applied successfully" and that a new `.sql` + `_journal.json` entry were produced.
4. **Fallback path (known VD journal collision):** the VD table lineage documents a pre-existing meta-journal collision that blocks `drizzle-kit generate` for hand-authored tables (see the header of `manual_vertical_drama_series_share_links.sql`). If `db:push` fails for that reason, hand-author `drizzle/manual_video_intelligence_tables.sql` as an idempotent `BEGIN; CREATE TABLE IF NOT EXISTS …; CREATE INDEX IF NOT EXISTS …; COMMIT;` script (mirror the exact style/comments of `manual_vertical_drama_series_share_links.sql`), apply it with `psql "$DATABASE_URL" -f drizzle/manual_video_intelligence_tables.sql`, then seed the migration hash into `drizzle.__drizzle_migrations` per the CLAUDE.md rule so future migrations still work. `schema.ts` remains the type source of truth even on this path.
5. **Verify.** Confirm the three tables exist with the correct columns:
   `psql "$DATABASE_URL" -c "\d video_projects" -c "\d video_project_revisions" -c "\d brand_kits"`.
   Re-check that **existing** table row counts are unchanged (no accidental drop/alter).
6. **Complete the cycle immediately** — do not defer. An un-migrated `schema.ts` change is a runtime crash waiting to happen.

Never leave `schema.ts` out of sync with the DB after this section.

---

## 6. Tests first (TDD Section 5)

Write `server/services/__tests__/videoProjectRepo.test.ts` **before** the repo body. TRPC-style: mock the Drizzle `db` chain (`vi.fn()` returning chainable `.select().from().where()` / `.insert().values().returning()` / `db.transaction`), assert **exact** call shapes and that `tenantId`+`userId` appear in every `where`.

Required `it` cases (from the TDD plan, plus the concurrency branch this section owns):

```
it("inserts a video_projects row scoped to tenant+user")            // values include scope.tenantId & scope.userId
it("getVideoProject filters on both tenantId and userId")           // owner isolation — foreign row returns null
it("writes a video_project_revisions row on saveDocument")          // snapshot insert happens
it("saveDocument rejects a stale baseRevision")                     // baseRevision !== current → throws conflict error
it("saveDocument bumps revision to baseRevision + 1 on success")
it("restoreRevision copies document back and bumps revision")       // new revision number, not the restored one
it("brand-kit CRUD is tenant+owner scoped")                         // list/get/update/delete all carry scope
```

Rules (`claude-plan-tdd.md` cross-cutting):
- Assert **exact** `db.select`/`db.insert` call counts — lock "no extra queries".
- Every failure path asserts a **specific** error (the conflict class), never a blanket throw.
- Run with the repo's standard env: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run server/services/__tests__/videoProjectRepo.test.ts`.

The **migration** is validated by the Database Safety steps in §5 (backup → push → `\d` verify → row-count check), **not** a Vitest test. Optionally add an opt-in `videoProjectRepo.integration.test.ts` gated by `RUN_DB_INTEGRATION_TESTS` that round-trips a real insert/select/save/restore against the guarded test DB (research B7); it must be skipped by default and excluded from `pnpm test`.

Brand-kit **lock enforcement** is NOT tested here — it is covered by the compiler test in section-01 (`BrandLockViolationError`). This section only persists `locks`.

---

## 7. Security & consistency checklist

- **Tenant+owner isolation on every query** (spec §17.1): every repo function filters on `tenantId` AND `userId`; a foreign-tenant id returns `null`/`false`, never another user's row. This is asserted by the tests above.
- **No secrets** in any column (brand kits hold only public brand tokens, colors, font names, asset ids — never API keys).
- **Asset refs are numeric ids** (`media_assets.id` bigint, `library_items.id` int), not raw external URLs (spec §17.3) — the columns are typed as such; URL resolution happens later in section-07's `videoProjectAssetResolver`.
- **FK id-type parity**: `brandKitId`/`logoAssetId` are `bigint`, `resultLibraryItemId`/`userId` are `integer` — mismatched widths silently fail FK creation.
- **Naming parity** with section-07: the router (section-07) imports `videoProjectRepo` functions and the `videoProjects`/`brandKits` table symbols exactly as named here. Do not rename without updating the index/manifest.

---

## 8. Done criteria

- `schema.ts` has `videoProjects`, `videoProjectRevisions`, `brandKits` + their `$inferSelect`/`$inferInsert` exports; `pnpm check` is green.
- Migration applied (via `db:push` or the manual fallback); `\d` confirms all three tables + indexes + the unique `(projectId, revision)` constraint; existing-table row counts unchanged.
- `videoProjectRepo.ts` exports the §4 functions; `videoProjectRepo.test.ts` passes with exact-call-count assertions and a specific conflict error.
- Full existing suite stays green (`JWT_SECRET=… pnpm test`) — this section touches no frozen contract.