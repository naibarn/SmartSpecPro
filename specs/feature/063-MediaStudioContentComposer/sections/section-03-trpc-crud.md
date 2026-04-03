I now have all the context needed to write the section. Here is the complete section content:

---

# Section 03 — tRPC CRUD Router: `contentComposer`

## Section ID
`section-03-trpc-crud`

## Position in Dependency Graph
- **Depends on:** section-01-schema (requires `contentComposerDrafts` table + Drizzle schema types)
- **Blocks:** section-08-generation-stream, section-09-publish (both add procedures to this router)
- **Batch:** 2 (runs after section-01 completes)

---

## Objective

Create the `contentComposer` tRPC router with four CRUD procedures: `listDrafts`, `getDraft`, `saveDraft`, and `deleteDraft`. Add a `contentComposerProcedure` middleware that resolves the tenant and checks the feature flag. Register the router in `apps/web/server/routers.ts`.

Later sections (08 and 09) will add `generateArticle`, `generateSocialCaption`, and `publish` procedures to this same router file.

---

## Files

| Action | Path |
|--------|------|
| Create | `apps/web/server/routers/contentComposer.ts` |
| Modify | `apps/web/server/routers.ts` |
| Create | `apps/web/server/routers/__tests__/contentComposer.test.ts` |

---

## Background Context

### Middleware Pattern (copy from `socialPublishing.ts`)

The `contentComposerProcedure` follows the exact same pattern as `socialPublishingProcedure`:

```typescript
import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { TRPCError } from "@trpc/server";

const contentComposerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
  }
  const enabled = await getTenantFeatureFlag("CONTENT_COMPOSER_ENABLED", tenantId);
  if (!enabled) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Content Composer is disabled for this tenant" });
  }
  return next({ ctx: { ...ctx, tenantId } });
});
```

The feature flag key is `"CONTENT_COMPOSER_ENABLED"`. Like all feature flags in this codebase, it defaults to `true` when not explicitly set (see `getTenantFeatureFlag` implementation).

### Schema Types from Section 01

Section 01 exports from `apps/web/drizzle/schema.ts`:
- `contentComposerDrafts` — the Drizzle table object
- Type `ContentComposerDraft` — full row type (inferred via `typeof contentComposerDrafts.$inferSelect`)
- The `blog_posts` table gains a `mediaAttachments` json column (used in section-09 publish)

Import pattern:
```typescript
import { db } from "../db";
import { contentComposerDrafts } from "../../drizzle/schema";
import type { ContentComposerDraft } from "../../drizzle/schema";
```

Confirm the exact import paths by checking how other routers (e.g., `socialPublishing.ts`) import from the schema. The services in `apps/web/server/services/` typically use `import { db } from "../db"` and `import { tableX } from "../../drizzle/schema"`.

### HTML Sanitization (server-side)

`saveDraft` must sanitize `articleBody` before writing to the database, matching the pattern in `apps/web/server/routers/blog.ts`:

```typescript
import sanitizeHtml from "sanitize-html";
```

The sanitization call in `saveDraft` uses the same `sanitizeHtml()` invoked in the blog router. Do not introduce a new sanitization library — reuse the existing `sanitize-html` package.

### `listDrafts` — Cursor-Based Pagination

The `listDrafts` query returns drafts sorted by `updatedAt DESC`. Excluded statuses: `"deleted"` (soft-deleted rows must not appear). The cursor is the `updatedAt` ISO string of the last row seen; the next page starts with rows `updatedAt < cursor`.

`DraftSummary` is a projection (not the full row):
```typescript
type DraftSummary = {
  id: string;
  topic: string;
  status: string;
  destinationKind: string | null;
  updatedAt: Date;
  attachmentCount: number;   // computed: (attachmentIds ?? []).length
};
```

### `deleteDraft` — Soft Delete

Deletion sets `status = "deleted"` on the row. No hard DELETE. The row remains in the database so accidental deletion can be recovered. `listDrafts` filters out `status = "deleted"` rows.

### Tenant + User Ownership

Every procedure that reads or writes a specific draft (by `id`) must verify both:
- `draft.tenantId === ctx.tenantId` — tenant isolation
- `draft.userId === ctx.user.id` — user ownership (a different user in the same tenant cannot read or overwrite another user's draft)

For cross-tenant access, throw `TRPCError({ code: "NOT_FOUND" })` rather than `FORBIDDEN` — leaking the existence of other tenants' drafts is itself a disclosure. For same-tenant but different-user access, throw `FORBIDDEN`.

---

## Procedure Specifications

### `listDrafts`

```
input:  { cursor?: string, limit?: number (default 20, max 50) }
output: { drafts: DraftSummary[], nextCursor: string | null }
```

- Queries `contentComposerDrafts WHERE tenantId = ctx.tenantId AND userId = ctx.user.id AND status != "deleted"`
- Orders by `updatedAt DESC`
- If `cursor` provided, adds `updatedAt < cursor` condition (use ISO timestamp comparison)
- Fetches `limit + 1` rows; if more rows exist, sets `nextCursor` to the last row's `updatedAt`
- Returns at most `limit` rows in `drafts`

### `getDraft`

```
input:  { id: string }
output: ContentComposerDraft (full row)
```

- Fetches by `id`
- Throws `NOT_FOUND` if no row found or `tenantId` differs from `ctx.tenantId`
- Throws `FORBIDDEN` if `userId` differs from `ctx.user.id`
- Does NOT return soft-deleted drafts (status = "deleted")

### `saveDraft`

```
input:  SaveDraftInput (see Zod schema below)
output: { id: string, updatedAt: string }
```

- If `input.id` is omitted or `null`, creates a new row with `status = "draft"`, `tenantId = ctx.tenantId`, `userId = ctx.user.id`
- If `input.id` is provided, updates the existing row
  - Before updating, verify `tenantId` matches; throw `NOT_FOUND` if not found or wrong tenant; throw `FORBIDDEN` if wrong user
- Server sanitizes `articleBody` with `sanitizeHtml()` before writing
- Returns the newly-created or updated `{ id, updatedAt }`

**Zod input schema (`SaveDraftInput`):**
```typescript
const saveDraftInputSchema = z.object({
  id: z.string().optional().nullable(),
  topic: z.string().max(2000).optional().nullable(),          // nullable; no min at save time
  executionSource: z.enum(["skill", "agency"]).optional().nullable(),
  skillId: z.string().max(255).optional().nullable(),
  agencyId: z.string().max(255).optional().nullable(),
  requiresWebSearch: z.boolean().optional(),
  requiresThinking: z.boolean().optional(),
  articleBody: z.string().optional().nullable(),              // sanitized before storage
  attachmentIds: z.array(z.number().int().positive()).max(6).optional().nullable(),
  destinationKind: z.enum(["docs", "blog", "social"]).optional().nullable(),
  docsSubKind: z.enum(["doc_page", "cms_page"]).optional().nullable(),
  docsTargetId: z.number().int().positive().optional().nullable(),
  blogTargetId: z.number().int().positive().optional().nullable(),
  socialPlatform: z.enum(["youtube", "facebook", "tiktok", "upload_post"]).optional().nullable(),
  socialTargetId: z.number().int().positive().optional().nullable(),
  socialCaption: z.string().max(2000).optional().nullable(),
  status: z.enum(["draft", "published", "failed"]).optional(),
});
```

Note: `topic` has no minimum length at save time — this allows the initial autosave to fire even when the user has only typed a few characters. Minimum length is enforced only by the `publish` procedure (section-09).

### `deleteDraft`

```
input:  { id: string }
output: { success: true }
```

- Verifies `tenantId` and `userId` ownership (same guards as `getDraft`)
- Sets `status = "deleted"` (soft delete)
- Throws `NOT_FOUND` if no matching row

---

## Router Registration in `routers.ts`

Add an import and a router key to `apps/web/server/routers.ts`:

```typescript
import { contentComposerRouter } from "./routers/contentComposer";
```

Then inside the `appRouter` object:
```typescript
contentComposer: contentComposerRouter,
```

Follow the alphabetical/functional grouping already used in `routers.ts`. The natural location is near other content-management routers (`blog`, `library`, `socialPublishing`).

---

## TDD: Tests to Write First

File: `apps/web/server/routers/__tests__/contentComposer.test.ts`

This test file follows the exact pattern of `apps/web/server/routers/__tests__/socialPublishing.test.ts`:
- `vi.hoisted()` at the very top for all mock factories
- `vi.mock(...)` for each dependency module
- `createCaller()` helper with a typed user object
- `describe` + `beforeEach` with `vi.clearAllMocks()` and default mock return values

### Mocks required

```typescript
// vi.hoisted() block — mock these modules:
// - "../../services/featureFlags"    → mockGetTenantFeatureFlag
// - "../../services/tenantContext"   → mockResolveTenantIdVarchar
// - "../db" or "../../drizzle/..."   → mockDb (Drizzle db object — mock select/insert/update)
// - "sanitize-html"                  → mockSanitizeHtml
```

The database mock should intercept Drizzle query builder chains. A common pattern for Drizzle in this codebase is to mock `db` with chained methods: `{ select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(...) })) })) }`. Check how other router tests (e.g., `scopedMemory.test.ts` or `library.ts` tests) mock the Drizzle `db` object — copy that pattern exactly.

### Test stubs to implement

**`listDrafts` tests:**
```typescript
// Test: returns empty array when user has no drafts
// Test: returns drafts sorted by updatedAt DESC
// Test: does NOT return drafts from other tenants
// Test: does NOT return deleted drafts (status = "deleted")
// Test: respects limit parameter; returns nextCursor when more items exist
// Test: DraftSummary shape includes { id, topic, status, destinationKind, updatedAt, attachmentCount }
// Test: attachmentCount = 0 when attachmentIds is null or []
// Test: attachmentCount = 3 when attachmentIds has 3 items
```

**`getDraft` tests:**
```typescript
// Test: returns full draft for valid id belonging to caller's tenant+user
// Test: throws NOT_FOUND for non-existent id
// Test: throws NOT_FOUND (not FORBIDDEN) for draft belonging to different tenant
// Test: throws FORBIDDEN for draft belonging to different user in same tenant
// Test: throws NOT_FOUND for soft-deleted draft (status = "deleted")
```

**`saveDraft` — create tests:**
```typescript
// Test: creates new draft with returned id when no id provided
// Test: topic can be empty string — no min-length-1 error at save time
// Test: topic can be null — allowed at save time
// Test: articleBody is passed through sanitizeHtml() before storing (assert mock called)
// Test: new draft gets status "draft" by default
// Test: new draft gets tenantId and userId from ctx
// Test: returns { id: string, updatedAt: string } on success
```

**`saveDraft` — update tests:**
```typescript
// Test: updates existing draft's topic when id provided
// Test: updates draft's attachmentIds when provided
// Test: updates draft's destinationKind
// Test: updatedAt changes after update (mock returns new timestamp)
// Test: throws NOT_FOUND when updating draft from different tenant
// Test: throws FORBIDDEN when updating draft belonging to different user
```

**`deleteDraft` tests:**
```typescript
// Test: sets status to "deleted" for valid draft (not a hard delete)
// Test: throws NOT_FOUND for non-existent draft
// Test: throws NOT_FOUND for draft from different tenant
// Test: returns { success: true } on successful deletion
// Test: row still exists with status "deleted" (DB update called, not delete)
```

**Middleware tests:**
```typescript
// Test: throws BAD_REQUEST when tenantId cannot be resolved
// Test: throws FORBIDDEN when CONTENT_COMPOSER_ENABLED flag is false
// Test: proceeds normally when flag is true and tenantId resolves
```

---

## Implementation Guidance

### File: `apps/web/server/routers/contentComposer.ts`

Structure outline (do not include full implementations):

```typescript
/**
 * Content Composer tRPC router.
 *
 * CRUD for article composer drafts. Generation (section-08) and
 * publish (section-09) procedures are added to this router later.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";

import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { db } from "../db";
import { contentComposerDrafts } from "../../drizzle/schema";
import type { ContentComposerDraft } from "../../drizzle/schema";

// --- Middleware ---
const contentComposerProcedure = protectedProcedure.use(/* ... */);

// --- Zod schemas ---
const saveDraftInputSchema = z.object({ /* ... per spec above ... */ });

// --- Helpers ---
/** Sanitize article HTML using same config as blog router */
function sanitizeArticleBody(html: string): string { /* sanitizeHtml(html, {...}) */ }

/** Compute DraftSummary projection from a full draft row */
function toDraftSummary(draft: ContentComposerDraft): DraftSummary { /* ... */ }

// --- Router ---
export const contentComposerRouter = router({
  listDrafts: contentComposerProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  getDraft: contentComposerProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  saveDraft: contentComposerProcedure
    .input(saveDraftInputSchema)
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  deleteDraft: contentComposerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),
});
```

Section 08 will add `generateSocialCaption` and section 09 will add `publish` to the same `contentComposerRouter` object. Structure the router so those additions are straightforward (keep the object open-ended — do not freeze or seal it).

### Ownership verification helper

Extract a small helper to avoid repeating the tenant+user check:

```typescript
async function fetchOwnedDraft(
  id: string,
  tenantId: string,
  userId: number
): Promise<ContentComposerDraft> {
  /**
   * Returns the draft or throws:
   * - NOT_FOUND if missing or tenantId mismatch
   * - FORBIDDEN if userId mismatch
   * - NOT_FOUND if status = "deleted"
   */
}
```

Use this helper in `getDraft`, `saveDraft` (update path), and `deleteDraft`.

### Drizzle query pattern

Follow the existing patterns visible in other routers. For inserts with `returning()`:
```typescript
const [created] = await db.insert(contentComposerDrafts).values({ ... }).returning();
```

For updates:
```typescript
const [updated] = await db
  .update(contentComposerDrafts)
  .set({ ...fields, updatedAt: new Date() })
  .where(eq(contentComposerDrafts.id, input.id))
  .returning();
```

Import `eq`, `and`, `lt`, `ne` from `drizzle-orm` as needed.

### New UUID generation for draft `id`

The schema definition from section 01 uses `$defaultFn(() => crypto.randomUUID())` on the `id` column, so Drizzle handles ID generation automatically on insert. Do not manually generate the UUID in the router.

### `sanitizeHtml` configuration for `saveDraft`

Reuse the allowedTags and allowedAttributes from `apps/web/server/routers/blog.ts`. Do not define a new config; factor the shared config into the helper function or import from a shared location if blog.ts exports it. If blog.ts does not export its config, copy the config into a local `sanitizeArticleBody()` helper in `contentComposer.ts` — duplication is acceptable here over coupling.

---

## Acceptance Criteria for This Section

- [ ] `contentComposerRouter` exported from `apps/web/server/routers/contentComposer.ts`
- [ ] `contentComposer: contentComposerRouter` registered in `apps/web/server/routers.ts`
- [ ] `contentComposerProcedure` middleware resolves tenant and checks `CONTENT_COMPOSER_ENABLED` flag
- [ ] `listDrafts` returns only the caller's non-deleted drafts, sorted newest-first, with cursor pagination
- [ ] `getDraft` enforces tenant + user ownership
- [ ] `saveDraft` creates when `id` is absent, updates when `id` is present; sanitizes `articleBody`
- [ ] `deleteDraft` sets `status = "deleted"` (soft delete); does not hard-delete
- [ ] All tests in `contentComposer.test.ts` pass
- [ ] TypeScript: `pnpm check` passes with no new errors

---

## Dependencies This Section Must NOT Touch

- `apps/web/drizzle/schema.ts` — schema is owned by section-01; do not modify here
- `apps/web/server/routes/contentComposerStream.ts` — owned by section-08
- `apps/web/server/services/contentComposerPublishService.ts` — owned by section-09
- Any frontend components — owned by sections 02, 04–07