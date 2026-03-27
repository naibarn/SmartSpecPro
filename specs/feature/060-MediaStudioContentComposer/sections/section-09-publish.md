Section 08 hasn't been written yet. I have enough context to write section-09. Let me now produce the output:

# Section 09 — Publish Procedure

## Section ID
`section-09-publish`

## Position in Dependency Graph
- **Depends on:** section-01-schema (`contentComposerDrafts`, `blogPosts` table types), section-03-trpc-crud (`contentComposerRouter`, `contentComposerProcedure`, `fetchOwnedDraft` helper)
- **Blocks:** section-10-tests
- **Batch:** 3 (runs in parallel with section-08-generation-stream after section-03 completes)

---

## Objective

Add the `publish` tRPC procedure to the existing `contentComposerRouter`. Create a dedicated service module `contentComposerPublishService.ts` that owns all fan-out logic. The procedure performs pre-publish validation (role, attachment ownership, stable refs, non-null article body) and then delegates to the appropriate destination handler. On success or failure, it updates the draft's `status` field.

This section touches **two files only**: it adds to the existing router file created in section-03, and creates the new service file.

---

## Files

| Action | Path |
|--------|------|
| Modify | `apps/web/server/routers/contentComposer.ts` (add `publish` procedure) |
| Create | `apps/web/server/services/contentComposerPublishService.ts` |
| Create | `apps/web/server/routers/__tests__/contentComposerPublish.test.ts` |

---

## Background Context

### What Section-03 Already Provides

Section-03 creates the router file with the following exports and helpers that section-09 relies on:

- `contentComposerRouter` — the tRPC router object (section-09 adds the `publish` key to it)
- `contentComposerProcedure` — middleware that resolves `tenantId` and checks `CONTENT_COMPOSER_ENABLED`
- `fetchOwnedDraft(id, tenantId, userId)` — throws `NOT_FOUND` / `FORBIDDEN` on ownership failures
- `saveDraftInputSchema` — Zod schema for all draft fields (may be reused for validation)

The router file in section-03 is structured to be open-ended: the `contentComposerRouter` object receives additional keys from section-08 (`generateSocialCaption`) and section-09 (`publish`). Extend the same object — do not redeclare it.

### Schema Types from Section-01

The following Drizzle table objects and types are imported from `../../drizzle/schema`:

```typescript
import {
  contentComposerDrafts,
  blogPosts,
  libraryItems,
  socialPages,
  tenantPages,
} from "../../drizzle/schema";
import type {
  ContentComposerDraft,
  BlogPost,
} from "../../drizzle/schema";
```

Note on "docs" destinations: the codebase uses `tenantPages` for documentation content. There is no separate `doc_pages` table in the schema — documentation pages are `tenantPages` rows whose `pageKey` follows the `"docs-*"` convention (e.g., `"docs-getting-started"`). The `docsSubKind` field distinguishes:
- `"doc_page"` → a `tenantPages` row treated as documentation (pageKey prefix `"docs-"`)
- `"cms_page"` → a `tenantPages` row treated as a CMS/marketing page

Both write to the same `tenantPages` table. The implementer should verify by checking `apps/web/scripts/seed-doc-pages.ts` which confirms `tenantPages` is the correct table.

### Library Items Validation

`libraryItemStatusEnum` values: `"processing"`, `"available"`, `"error"`, `"archived"`. Only `status = "ready"` is considered stable for publishing. **Confirmed:** The actual `libraryItemStatusEnum` in `apps/web/drizzle/schema.ts:1918` uses `["draft","ready","indexing","archived","failed"]`. Default is `"ready"`. Do NOT use `"available"` — that value does not exist in the enum. The `libraryItems` table has a camelCase Drizzle field `tenantId`.

### `sanitizeBlogHtml` in `blog.ts`

The blog router defines `sanitizeBlogHtml(html)`. Section-09's publish service should call `sanitizeHtml` with the same configuration (do not import from `blog.ts` — it is not exported). Copy the configuration into the publish service's local helper, or rely on the fact that `saveDraft` (section-03) already sanitized `articleBody` before storing — meaning the value from the DB is already clean and does not need re-sanitization at publish time.

### Slug Generation for Blog

The blog router generates slugs from titles using:
```typescript
title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
```
For uniqueness, the plan specifies appending a short UUID suffix: `slug + "-" + crypto.randomUUID().slice(0, 8)`.

### `createPublishingDraft` Signature (Social Fan-Out)

From `apps/web/server/services/socialPublishingService.ts` line 479:
```typescript
export async function createPublishingDraft(params: {
  tenantId: string;
  userId: number;
  pageId: number;
  contentText?: string | null;
  contentLink?: string | null;
  mediaRefs?: string[] | null;
}): Promise<SocialPublishingPostSummary>
```

For non-Upload-Post social destinations, call `createPublishingDraft` with `pageId = draft.socialTargetId`.

### `publishUploadPostNow` Signature

From `apps/web/server/services/uploadPostService.ts` line 955:
```typescript
export async function publishUploadPostNow(params: {
  tenantId: string;
  userId: number;
  profileId?: number | null;
  platform?: UploadPostPlatform;
  contentText?: string | null;
  contentLink?: string | null;
  mediaRefs?: string[] | null;
  metadata?: Record<string, unknown> | null;
}): Promise<UploadPostJobSummary>
```

For Upload-Post social destinations, call `publishUploadPostNow` with `profileId = draft.socialTargetId` (for Upload-Post targets, `socialTargetId` stores the `uploadPostProfiles.id`).

### Role Check Pattern

Role-based destination checks match the pattern in `apps/web/server/routers/blog.ts` Express routes:
```typescript
if (user.role !== "admin" && user.role !== "domain_admin") {
  return res.status(403).json({ error: "Unauthorized" });
}
```

In the tRPC router, this becomes:
```typescript
if (ctx.user.role !== "admin" && ctx.user.role !== "domain_admin") {
  throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can publish to Blog or Docs" });
}
```

---

## Procedure Specification

### `publish`

```
input:  { draftId: string }
output: { success: true, publishedId: string | number, destinationUrl?: string }
```

The procedure:
1. Calls `fetchOwnedDraft(draftId, ctx.tenantId, ctx.user.id)` — inherits all ownership errors from section-03
2. Runs pre-publish validation (see §Pre-publish Validation below)
3. Calls the appropriate handler in `contentComposerPublishService`
4. On success: updates `draft.status = "published"`, `draft.publishedAt = new Date()`
5. On failure: updates `draft.status = "failed"`, `draft.errorMessage = err.message`
6. Returns `{ success: true, publishedId, destinationUrl? }`

**Zod input:**
```typescript
const publishInputSchema = z.object({
  draftId: z.string().uuid("draftId must be a valid UUID"),
});
```

---

## Service: `contentComposerPublishService.ts`

Location: `apps/web/server/services/contentComposerPublishService.ts`

This module exports one top-level function `publishDraft` and four internal handler functions. The router procedure calls `publishDraft`; it must not call handler functions directly.

### `publishDraft` Signature

```typescript
export async function publishDraft(
  draft: ContentComposerDraft,
  ctx: { tenantId: string; userId: number; userRole: string },
  db: DrizzleDB,
): Promise<{ publishedId: string | number; destinationUrl?: string }>
```

The function:
1. Validates pre-publish constraints (role, articleBody, attachments, socialTarget)
2. Routes to the correct handler
3. Throws `TRPCError` for all validation failures so the router's catch block can set `status = "failed"`

---

## Pre-publish Validation (in `publishDraft`)

Validation runs in this order — fail fast, throw `TRPCError` on first failure:

### 1. Article body must be non-null

```typescript
if (!draft.articleBody) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "Article has not been generated yet" });
}
```

### 2. Destination kind must be set

```typescript
if (!draft.destinationKind) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "Destination is required before publishing" });
}
```

### 3. Role check for blog and docs destinations

```typescript
if (
  (draft.destinationKind === "blog" || draft.destinationKind === "docs") &&
  ctx.userRole !== "admin" &&
  ctx.userRole !== "domain_admin"
) {
  throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can publish to Blog or Docs" });
}
```

### 4. Attachment count upper-bound (defensive re-check)

```typescript
const attachmentIds = draft.attachmentIds ?? [];
if (attachmentIds.length > 6) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "A maximum of 6 attachments is allowed" });
}
```

### 5. Attachment ownership and availability

```typescript
// Load all specified attachment rows scoped to this tenant
const attachments = await db
  .select({ id: libraryItems.id, status: libraryItems.status, title: libraryItems.title, sourceUrl: libraryItems.sourceUrl })
  .from(libraryItems)
  .where(
    and(
      inArray(libraryItems.id, attachmentIds),
      eq(libraryItems.tenantId, ctx.tenantId),
      isNull(libraryItems.deletedAt),
    )
  );

// Verify all IDs were found (cross-tenant guard)
if (attachments.length !== attachmentIds.length) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "One or more attachments could not be found or do not belong to this tenant",
  });
}

// Verify all are in "ready" status
const unavailable = attachments.filter(a => a.status !== "ready");
if (unavailable.length > 0) {
  const names = unavailable.map(a => a.title).join(", ");
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `The following attachments are not ready for publishing: ${names}`,
  });
}
```

### 6. Social target ownership (if applicable)

```typescript
if (draft.destinationKind === "social" && draft.socialTargetId && draft.socialPlatform !== "upload_post") {
  const [target] = await db
    .select({ id: socialPages.id })
    .from(socialPages)
    .where(and(eq(socialPages.id, draft.socialTargetId), eq(socialPages.tenantId, ctx.tenantId)))
    .limit(1);
  if (!target) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Social target account does not belong to this tenant",
    });
  }
}
```

---

## Fan-Out Handlers (in `contentComposerPublishService.ts`)

### `handleBlogPublish`

```typescript
async function handleBlogPublish(
  draft: ContentComposerDraft,
  attachments: AttachmentRecord[],
  tenantId: string,
  db: DrizzleDB,
): Promise<{ publishedId: number; destinationUrl?: string }>
```

Logic:
1. Extract `coverImageUrl` = `attachments[0]?.sourceUrl ?? null`
2. Generate `title`: strip HTML tags from the first `<h1>` or `<h2>` in `articleBody`, fall back to first 100 chars of stripped text
3. Generate `slug`: `slugify(title) + "-" + crypto.randomUUID().slice(0, 8)` using the same slug-generation regex as `blog.ts`
4. If `draft.blogTargetId` is set: update the existing `blog_posts` row
5. Otherwise: insert a new `blog_posts` row with `isPublished: false` (draft state)
6. Return `{ publishedId: post.id, destinationUrl: "/blog/" + slug }`

Insert call shape:
```typescript
const [post] = await db.insert(blogPosts).values({
  tenantId,
  slug,
  title,
  content: draft.articleBody,   // already sanitized by saveDraft
  coverImage: coverImageUrl,
  mediaAttachments: attachmentIds,
  author: "Article Composer",   // overridable in Phase 2
  tags: [],
  isPublished: false,
  isFeatured: false,
  publishedAt: null,
}).returning();
```

Update call shape (when `blogTargetId` is set):
```typescript
await db.update(blogPosts)
  .set({
    content: draft.articleBody,
    coverImage: coverImageUrl,
    mediaAttachments: attachmentIds,
    updatedAt: new Date(),
  })
  .where(and(eq(blogPosts.id, draft.blogTargetId), eq(blogPosts.tenantId, tenantId)));
```

### `handleDocsPublish`

```typescript
async function handleDocsPublish(
  draft: ContentComposerDraft,
  tenantId: string,
  db: DrizzleDB,
): Promise<{ publishedId: number; destinationUrl?: string }>
```

Both `"doc_page"` and `"cms_page"` write to the `tenantPages` table. The distinction is in `pageKey` prefix:
- `docsSubKind === "doc_page"` → pageKey `"docs-" + slugify(title)`
- `docsSubKind === "cms_page"` → pageKey uses the slug directly

Logic:
1. Extract `title` from `articleBody` (same as blog: first H1/H2 or first 100 chars stripped)
2. Generate `slug` from title
3. If `draft.docsTargetId` set: update existing `tenantPages` row (`content = draft.articleBody`)
4. Otherwise: insert new `tenantPages` row
5. Return `{ publishedId: page.id, destinationUrl: "/" + slug }`

The `tenantPages` table uses an integer `tenantId` FK (`integer("tenantId")`). However, `ctx.tenantId` in the tRPC context is a varchar string. Verify the correct tenant resolution: look at how other tRPC routers (e.g., `socialPublishing.ts` or `library.ts`) resolve the tenant when writing to `tenantPages`. If `tenantPages.tenantId` is integer, a join via `tenants.id` (varchar) → `tenants` row → numeric ID lookup may be needed. The implementer should check the `tenantPages` schema column type carefully at `apps/web/drizzle/schema.ts` line 1292 and follow the existing pattern from other routers that write to `tenantPages`.

### `handleSocialPublish`

```typescript
async function handleSocialPublish(
  draft: ContentComposerDraft,
  attachments: AttachmentRecord[],
  ctx: { tenantId: string; userId: number },
): Promise<{ publishedId: number; destinationUrl?: string }>
```

Logic:
1. Build `mediaRefs` = `attachments.map(a => a.sourceUrl).filter(Boolean)`
2. Call `createPublishingDraft({ tenantId: ctx.tenantId, userId: ctx.userId, pageId: draft.socialTargetId!, contentText: draft.socialCaption, mediaRefs })`
3. Return `{ publishedId: result.id }`

Note: `createPublishingDraft` validates that the page is active and has publishing enabled — these checks are inside the service function itself. Do not duplicate them in the handler.

### `handleUploadPostPublish`

```typescript
async function handleUploadPostPublish(
  draft: ContentComposerDraft,
  attachments: AttachmentRecord[],
  ctx: { tenantId: string; userId: number },
): Promise<{ publishedId: number; destinationUrl?: string }>
```

Logic:
1. Build `mediaRefs` = `attachments.map(a => a.sourceUrl).filter(Boolean)`
2. Call `publishUploadPostNow({ tenantId: ctx.tenantId, userId: ctx.userId, profileId: draft.socialTargetId, contentText: draft.socialCaption, mediaRefs, metadata: { source: "article_composer" } })`
3. Return `{ publishedId: result.id }`

---

## Router Procedure: Adding `publish` to `contentComposerRouter`

In `apps/web/server/routers/contentComposer.ts`, extend the router object:

```typescript
// section-09 addition — add to the contentComposerRouter object
publish: contentComposerProcedure
  .input(publishInputSchema)
  .mutation(async ({ ctx, input }) => {
    /**
     * Fan-out publish mutation.
     *
     * 1. Load and verify draft ownership.
     * 2. Delegate all validation + destination routing to publishDraft().
     * 3. Update draft status to "published" or "failed".
     */
    const draft = await fetchOwnedDraft(input.draftId, ctx.tenantId, ctx.user.id);
    const db = await getDb();
    try {
      const result = await publishDraft(draft, {
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        userRole: ctx.user.role,
      }, db);

      await db.update(contentComposerDrafts)
        .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(contentComposerDrafts.id, input.draftId));

      return { success: true as const, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown publish error";
      await db.update(contentComposerDrafts)
        .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
        .where(eq(contentComposerDrafts.id, input.draftId));
      throw err;   // re-throw so tRPC returns the correct error code to the client
    }
  }),
```

Import additions needed at the top of `contentComposer.ts`:
```typescript
import { publishDraft } from "../services/contentComposerPublishService";
import { getDb } from "../db";   // if not already imported
import { eq } from "drizzle-orm"; // if not already imported
```

---

## Service File Structure

```typescript
/**
 * Content Composer publish service.
 *
 * Handles pre-publish validation and fan-out to:
 *   - Blog (blogPosts table)
 *   - Docs / CMS (tenantPages table)
 *   - Social (socialPublishingService.createPublishingDraft)
 *   - Upload-Post (uploadPostService.publishUploadPostNow)
 */
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  blogPosts,
  contentComposerDrafts,
  libraryItems,
  socialPages,
  tenantPages,
} from "../../drizzle/schema";
import type { ContentComposerDraft } from "../../drizzle/schema";
import { type DrizzleDB } from "../db";
import { createPublishingDraft } from "./socialPublishingService";
import { publishUploadPostNow } from "./uploadPostService";

/** Minimal attachment record resolved during validation */
interface AttachmentRecord {
  id: number;
  status: string;
  title: string;
  sourceUrl: string | null;
}

/** Strip HTML tags and return plain text; truncated to maxLen chars */
function stripHtml(html: string, maxLen = 100): string { /* ... */ }

/** Slugify a string for use in URLs */
function slugify(text: string): string { /* ... */ }

/** Extract title from article HTML (first H1 or H2; fall back to first N chars) */
function extractTitle(articleBody: string): string { /* ... */ }

// --- Validation ---
async function validateAttachments(...): Promise<AttachmentRecord[]> { /* ... */ }

// --- Handlers ---
async function handleBlogPublish(...): Promise<{ publishedId: number; destinationUrl?: string }> { /* ... */ }
async function handleDocsPublish(...): Promise<{ publishedId: number; destinationUrl?: string }> { /* ... */ }
async function handleSocialPublish(...): Promise<{ publishedId: number | string }> { /* ... */ }
async function handleUploadPostPublish(...): Promise<{ publishedId: number | string }> { /* ... */ }

// --- Entry point ---
export async function publishDraft(
  draft: ContentComposerDraft,
  ctx: { tenantId: string; userId: number; userRole: string },
  db: DrizzleDB,
): Promise<{ publishedId: string | number; destinationUrl?: string }> {
  // 1. validate articleBody, destinationKind, role, attachments, socialTarget
  // 2. route to handler
}
```

---

## TDD: Tests to Write First

### File: `apps/web/server/routers/__tests__/contentComposerPublish.test.ts`

This test file follows the same pattern as `contentComposer.test.ts` (section-03): `vi.hoisted()` mocks, `vi.mock(...)`, `createCaller()`, `beforeEach` resets.

Additional mocks required beyond section-03's set:

```typescript
// vi.hoisted() additions:
// - "../services/contentComposerPublishService" → mockPublishDraft
// Note: db.update() chain must be mocked for the status-update calls in the procedure
```

#### Pre-publish Validation Tests

```typescript
// Test: throws BAD_REQUEST when articleBody is null
// → set draft.articleBody = null in mock; assert TRPCError code === "BAD_REQUEST"
//   assert message contains "Article has not been generated"

// Test: throws BAD_REQUEST when destinationKind is null
// → set draft.destinationKind = null; assert BAD_REQUEST

// Test: throws FORBIDDEN when destinationKind = "blog" and user.role = "user"
// → createCaller with role="user", draft.destinationKind = "blog"
//   assert TRPCError code === "FORBIDDEN"

// Test: throws FORBIDDEN when destinationKind = "docs" and user.role = "user"
// → createCaller with role="user", draft.destinationKind = "docs"
//   assert TRPCError code === "FORBIDDEN"

// Test: social destination allowed for role = "user"
// → createCaller with role="user", draft.destinationKind = "social"
//   mockPublishDraft resolves → assert no error thrown

// Test: throws BAD_REQUEST when an attachmentId has status = "indexing"
// → mock db.select returning item with status="indexing"
//   assert BAD_REQUEST with attachment name in message

// Test: throws BAD_REQUEST when an attachmentId has status = "archived"

// Test: throws BAD_REQUEST when an attachmentId belongs to a different tenant
// → mock db.select returning fewer rows than requested (cross-tenant gap)
//   assert BAD_REQUEST "could not be found"

// Test: throws BAD_REQUEST when attachmentIds contains more than 6 items
// → draft.attachmentIds = [1,2,3,4,5,6,7]
//   assert BAD_REQUEST "maximum of 6"

// Test: throws BAD_REQUEST when socialTargetId belongs to a different tenant
// → mock socialPages query returning empty array
//   assert BAD_REQUEST

// Test: throws NOT_FOUND for draft from a different tenant
// → fetchOwnedDraft throws NOT_FOUND → propagated to caller
```

#### Success Path Tests

```typescript
// Test: blog publish creates blog_posts row and returns publishedId
// → role="admin", draft.destinationKind="blog", attachments ready
//   mockPublishDraft resolves { publishedId: 42, destinationUrl: "/blog/my-article-abc12345" }
//   assert return includes { success: true, publishedId: 42 }

// Test: draft.status updated to "published" after successful blog publish
// → after publish mutation succeeds, verify db.update called with status="published"
//   verify publishedAt is set (non-null)

// Test: draft.status updated to "failed" when publishDraft throws
// → mockPublishDraft.mockRejectedValue(new Error("DB error"))
//   verify db.update called with { status: "failed", errorMessage: "DB error" }
//   verify the original error is re-thrown (mutation rejects)

// Test: social publish returns publishedId from createPublishingDraft
// → draft.destinationKind="social", draft.socialPlatform="facebook"
//   assert return includes { success: true, publishedId: someId }

// Test: upload_post publish calls publishUploadPostNow with correct profileId
// → draft.destinationKind="social", draft.socialPlatform="upload_post", draft.socialTargetId=99
//   verify publishUploadPostNow called with profileId=99
```

#### Service-Level Tests (optional integration-style, in a separate file)

The TDD plan also specifies service integration tests at `apps/web/server/services/__tests__/contentComposerPublish.integration.test.ts` — these are assigned to section-10 and should be left as stubs here.

---

## Implementation Notes

### Atomic Status Update

The `publish` procedure performs two DB writes: one to the destination (blog, docs, social) via the service, and one to update `contentComposerDrafts.status`. These are NOT wrapped in a DB transaction in Phase 1. If the status update fails after a successful publish, the draft will incorrectly show as "draft" — this is an acceptable edge case for Phase 1. The implementer should add a comment noting this as a Phase 2 improvement.

### `getDb` vs `db` Import

Other routers in this codebase use different DB access patterns (`db.instance`, `await resolveDb()`, `getDb()`). Verify the correct pattern by checking how `contentComposer.ts` (section-03) imports `db`. Use the same pattern in both `contentComposer.ts` and `contentComposerPublishService.ts`.

### `inArray` for Empty Arrays

Drizzle's `inArray(col, [])` generates invalid SQL on some adapters. Guard against empty `attachmentIds`:

```typescript
if (attachmentIds.length === 0) {
  return [];   // no attachments to validate — OK
}
const attachments = await db.select(...).from(libraryItems).where(inArray(libraryItems.id, attachmentIds)...);
```

### `socialPages` Table Column Name

Verify whether `socialPages.tenantId` is stored as `"tenantId"` (camelCase varchar) or `"tenant_id"` (snake_case) by checking the `socialPages` table definition in `apps/web/drizzle/schema.ts`. Use the Drizzle field name (camelCase) in the `eq()` call, not the raw SQL column name.

### Re-throwing Errors

The `publish` procedure re-throws the error after writing the failure status to the DB. This means the tRPC client receives the original `TRPCError` (with the correct HTTP code and message). Do not wrap the error in a new generic error — preserve the original error code so the client can distinguish `FORBIDDEN` from `BAD_REQUEST` from `INTERNAL_SERVER_ERROR`.

---

## Acceptance Criteria for This Section

- [ ] `publish` procedure added to `contentComposerRouter` in `contentComposer.ts`
- [ ] `contentComposerPublishService.ts` created with `publishDraft` export and four internal handlers
- [ ] Pre-publish validation enforces: non-null `articleBody`, non-null `destinationKind`, role for blog/docs, max 6 attachments, all attachments `status = "ready"` and tenant-scoped, `socialTargetId` tenant-scoped
- [ ] Blog publish creates/updates `blog_posts` row with `coverImage`, `mediaAttachments`, and sanitized `content`
- [ ] Docs publish creates/updates `tenantPages` row with `content = draft.articleBody`
- [ ] Social publish calls `createPublishingDraft` with `mediaRefs` resolved from attachment `sourceUrl` values (not raw IDs)
- [ ] Upload-Post publish calls `publishUploadPostNow` with `profileId = draft.socialTargetId`
- [ ] `draft.status` updated to `"published"` + `publishedAt` set on success
- [ ] `draft.status` updated to `"failed"` + `errorMessage` set on error; original error re-thrown
- [ ] All tests in `contentComposerPublish.test.ts` pass
- [ ] TypeScript: `pnpm check` passes with no new errors

---

## Dependencies This Section Must NOT Touch

- `apps/web/drizzle/schema.ts` — owned by section-01; do not modify
- `apps/web/server/routes/contentComposerStream.ts` — owned by section-08
- Any frontend components — owned by sections 02, 04–07
- `apps/web/server/services/socialPublishingService.ts` — call only; do not modify
- `apps/web/server/services/uploadPostService.ts` — call only; do not modify