I have all the context I need. Here is the complete section content:

# Section 10 — Integration Tests and Coverage Gap Closure

**Section ID:** `section-10-tests`
**Batch:** 5 — final section, runs after all other sections complete
**Depends on:** section-07-composer-panel, section-08-generation-stream, section-09-publish
**Blocks:** nothing (final)

---

## Overview

This section adds two categories of tests:

1. **Integration tests** — end-to-end coverage of the draft lifecycle (create → generate → attach → publish), attachment stable-ref validation, blog publish with `mediaAttachments`, and social publish with `mediaRefs`. These live in a new integration test file and exercise the full server-side path from tRPC procedure call through to the publish service.

2. **Coverage gap closure** — targeted unit test additions across sections 01–09 wherever the 80% line-coverage threshold is not yet met. Identified gaps are listed explicitly in this section. No new source files are created — only new test files and additions to existing test files.

The test command for everything in this feature is:

```
cd apps/web && pnpm test -- --testPathPattern="contentComposer|SafeHtml|composerReducer|SkillAgencySelector|SocialPlatformPicker|SocialAccountPicker|ArticleSettingsStep|MediaAttachmentStep|DestinationStep|ContentComposerPanel|MediaStudio.articleComposer|contentComposerStream|contentComposerPublish"
```

---

## Files

| Action | Path |
|--------|------|
| Create | `apps/web/server/services/__tests__/contentComposerPublish.integration.test.ts` |
| Modify (add stubs) | `apps/web/server/routers/__tests__/contentComposer.test.ts` |
| Modify (add stubs) | `apps/web/server/routers/__tests__/contentComposerPublish.test.ts` |
| Modify (add stubs) | `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx` |
| Modify (add stubs) | `apps/web/client/src/pages/__tests__/MediaStudio.articleComposer.test.tsx` |

Only the integration test file is created fresh. All other files were created in earlier sections — this section adds test cases to them.

---

## Background Context

### What earlier sections produced

| Section | Test file |
|---------|-----------|
| section-01-schema | `apps/web/server/routers/__tests__/contentComposerMigration.test.ts` |
| section-02-safe-html-state | `apps/web/client/src/components/ui/__tests__/SafeHtml.test.tsx` + `apps/web/client/src/components/media/__tests__/composerReducer.test.ts` |
| section-03-trpc-crud | `apps/web/server/routers/__tests__/contentComposer.test.ts` |
| section-04-skill-agency-selector | `apps/web/client/src/components/media/composer/__tests__/SkillAgencySelector.test.tsx` |
| section-05-social-pickers | `apps/web/client/src/components/media/composer/__tests__/SocialPlatformPicker.test.tsx` |
| section-06-wizard-steps | Step-level test files in `apps/web/client/src/components/media/composer/__tests__/` |
| section-07-composer-panel | `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx` + `apps/web/client/src/pages/__tests__/MediaStudio.articleComposer.test.tsx` |
| section-08-generation-stream | `apps/web/server/routes/__tests__/contentComposerStream.test.ts` |
| section-09-publish | `apps/web/server/routers/__tests__/contentComposerPublish.test.ts` |

### Key types and interfaces (established in prior sections)

**`ContentComposerDraft`** (from `apps/web/drizzle/schema.ts`, section-01):
```typescript
{
  id: string;                     // UUID varchar(36)
  tenantId: string;
  userId: number;
  topic: string;
  executionSource: "skill" | "agency" | null;
  skillId: string | null;
  agencyId: string | null;
  articleBody: string | null;     // sanitized HTML stored in DB
  requiresWebSearch: boolean;
  requiresThinking: boolean;
  attachmentIds: number[];        // libraryItems.id array
  destinationKind: "docs" | "blog" | "social" | null;
  docsSubKind: "doc_page" | "cms_page" | null;
  docsTargetId: number | null;
  blogTargetId: number | null;
  socialPlatform: "youtube" | "facebook" | "tiktok" | "upload_post" | null;
  socialTargetId: number | null;
  socialCaption: string | null;
  status: "draft" | "published" | "failed";
  errorMessage: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**`contentComposerPublishService`** (from section-09, `apps/web/server/services/contentComposerPublishService.ts`):
```typescript
// Functions called by the publish procedure:
publishToBlog(draft, tenantId, userId): Promise<{ publishedId: number; destinationUrl: string }>
publishToDocs(draft, tenantId, userId): Promise<{ publishedId: number; destinationUrl: string }>
publishToSocial(draft, tenantId, userId): Promise<{ publishedId: number }>
publishToUploadPost(draft, tenantId, userId): Promise<{ publishedId: string }>
```

**`socialPublishingService.createPublishingDraft`** (existing service, reused by section-09):
```typescript
createPublishingDraft(
  tenantId: string,
  userId: number,
  socialTargetId: number,
  payload: { contentText: string; mediaRefs: string[] }
): Promise<{ id: number }>
```

**SSE stream format** (from section-08):
- Each chunk: `data: <text>\n\n`
- End sentinel: `data: [DONE]\n\n`
- Error event: `event: error\ndata: <message>\n\n`

### Publish validation rules (from section-09)

Before any destination write, `publish` enforces:
1. `articleBody` is not null
2. `destinationKind` is not null
3. Role check: `"blog"` or `"docs"` require `role` in `["admin", "domain_admin"]`
4. All `attachmentIds` exist in `libraryItems` with `tenantId = ctx.tenantId AND status = "available"`
5. `attachmentIds.length <= 6`
6. `socialTargetId` (if set) belongs to `ctx.tenantId` via `socialPages` table

---

## Integration Test File

**File:** `apps/web/server/services/__tests__/contentComposerPublish.integration.test.ts`

**Purpose:** Test the full server-side draft lifecycle — from `saveDraft` through `publish` — exercising the publish service fan-out to the correct destination handler. These tests mock external dependencies (blog service, social service, upload-post gateway) but use the real tRPC caller and real Drizzle ORM calls against a test DB (or fully mocked DB, whichever pattern the existing integration tests in this project use).

Before writing the tests, check `apps/web/server/services/__tests__/contextPackingIntegration.test.ts` (an existing integration test) to understand:
- How the project initialises a test database or mocks `db`
- Which `vi.mock` patterns are used for DB calls
- Whether integration tests use `router.createCaller()` or direct service function calls

Follow that same pattern exactly in this file.

### Mock Setup

```typescript
// vi.hoisted() block — establish mock factories before all imports
const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

// Mock the db module (adjust path if the project uses a different alias)
vi.mock("../../db", () => ({ db: mockDb }));

// Mock external publish targets
const mockBlogCreate = vi.fn();
const mockSocialCreateDraft = vi.fn();
const mockUploadPostPublish = vi.fn();
const mockDocCreate = vi.fn();

vi.mock("../../services/contentComposerPublishService", () => ({
  contentComposerPublishService: {
    publishToBlog: mockBlogCreate,
    publishToDocs: mockDocCreate,
    publishToSocial: mockSocialCreateDraft,
    publishToUploadPost: mockUploadPostPublish,
  },
}));

// Mock sanitizeHtml (called in saveDraft)
vi.mock("sanitize-html", () => ({
  default: (html: string) => html,  // passthrough for tests
}));
```

### Test Stubs

Write these test stubs (failing or pending) before implementing any production code in this section:

```typescript
describe("contentComposerPublish — integration", () => {

  // ─── Full draft lifecycle ────────────────────────────────────────────────

  it("full lifecycle: create draft → save article body → select attachments → publish to blog", async () => {
    // Arrange: mock DB returns for draft insert, draft select, libraryItems select
    // Act: call saveDraft (no id), then saveDraft (with id + articleBody + attachmentIds), then publish
    // Assert: mockBlogCreate called with correct coverImage (first attachment sourceUrl)
    //         draft.status updated to "published" in DB
    //         publish returns { success: true, publishedId: <number>, destinationUrl: <string> }
  });

  it("full lifecycle: create draft → publish to social with mediaRefs as sourceUrl values", async () => {
    // Arrange: mock libraryItems query returns items with sourceUrl values
    // Act: saveDraft with socialPlatform, socialTargetId, socialCaption; then publish
    // Assert: mockSocialCreateDraft called with mediaRefs = sourceUrl array (NOT raw IDs)
    //         contentText = draft.socialCaption
  });

  it("full lifecycle: create draft → publish to Upload-Post gateway", async () => {
    // Arrange: draft with socialPlatform = "upload_post"
    // Act: publish
    // Assert: mockUploadPostPublish called, draft.status = "published"
  });

  it("full lifecycle: publish fails → draft.status = 'failed', errorMessage set", async () => {
    // Arrange: mockBlogCreate throws an error
    // Act: call publish
    // Assert: draft.status updated to "failed" in DB
    //         draft.errorMessage contains the error text
    //         publish throws (re-throws the underlying error)
  });

  // ─── Stable reference validation ────────────────────────────────────────

  it("publish rejects when an attachment has status = 'processing'", async () => {
    // Arrange: libraryItems query returns one item with status = "processing"
    // Act: call publish
    // Assert: throws TRPCError with code BAD_REQUEST
    //         error message contains the name of the unavailable item
    //         mockBlogCreate NOT called
  });

  it("publish rejects when an attachment has status = 'error'", async () => {
    // Similar to above, status = "error"
  });

  it("publish rejects when an attachmentId does not belong to the caller's tenant", async () => {
    // Arrange: libraryItems query returns 0 rows for one of the IDs (tenant mismatch)
    // Act: call publish
    // Assert: throws BAD_REQUEST "Some attachments are not available"
  });

  it("publish rejects when attachmentIds contains more than 6 items", async () => {
    // Arrange: draft.attachmentIds = [1,2,3,4,5,6,7]
    // Act: call publish
    // Assert: throws BAD_REQUEST
    //         mockBlogCreate NOT called
  });

  it("publish accepts when attachmentIds is empty (0 attachments)", async () => {
    // Arrange: draft with destinationKind = "blog", attachmentIds = [], articleBody set
    // Act: call publish
    // Assert: mockBlogCreate called with coverImage = undefined (no first attachment)
    //         blog_posts.mediaAttachments = []
  });

  // ─── Blog publish specifics ──────────────────────────────────────────────

  it("blog publish sets coverImage to the sourceUrl of the first attachment", async () => {
    // Arrange: libraryItems returns [{ id: 10, sourceUrl: "https://cdn.example.com/img.jpg" }, ...]
    // Assert: mockBlogCreate.mock.calls[0][0].coverImage === "https://cdn.example.com/img.jpg"
  });

  it("blog publish stores mediaAttachments as the full attachmentIds array", async () => {
    // Arrange: attachmentIds = [10, 11, 12]
    // Assert: blog_posts.mediaAttachments deep equals [10, 11, 12]
  });

  it("blog publish uses first 100 chars of stripped articleBody as title when no H1 present", async () => {
    // Arrange: articleBody = "<p>This is a long article about AI-driven content workflows...</p>"
    // Assert: blog title starts with "This is a long article about"
  });

  it("blog publish extracts H1 text as title when present", async () => {
    // Arrange: articleBody = "<h1>My Article Title</h1><p>Content...</p>"
    // Assert: blog title = "My Article Title"
  });

  // ─── Social publish specifics ────────────────────────────────────────────

  it("social publish passes mediaRefs as sourceUrl strings (not numeric IDs)", async () => {
    // Arrange: attachmentIds = [20, 21], libraryItems returns sourceUrls
    // Assert: createPublishingDraft called with mediaRefs = ["https://...", "https://..."]
    //         mediaRefs does NOT contain numbers
  });

  it("social publish uses draft.socialCaption as contentText", async () => {
    // Arrange: draft.socialCaption = "Check out this article! #AI"
    // Assert: createPublishingDraft called with contentText = "Check out this article! #AI"
  });

  it("social publish with empty socialCaption passes empty string as contentText", async () => {
    // Arrange: draft.socialCaption = null
    // Assert: createPublishingDraft called with contentText = ""
  });

  // ─── Role enforcement ────────────────────────────────────────────────────

  it("publish to blog is FORBIDDEN for role = 'user'", async () => {
    // Arrange: ctx.user.role = "user", destinationKind = "blog"
    // Act: call publish
    // Assert: throws TRPCError({ code: "FORBIDDEN" })
    //         mockBlogCreate NOT called
  });

  it("publish to docs is FORBIDDEN for role = 'user'", async () => {
    // Similar with destinationKind = "docs"
  });

  it("publish to social is ALLOWED for role = 'user'", async () => {
    // Arrange: ctx.user.role = "user", destinationKind = "social"
    // Assert: mockSocialCreateDraft called, no FORBIDDEN error
  });

  it("publish to blog is allowed for role = 'admin'", async () => {
    // Assert: mockBlogCreate called, no FORBIDDEN error
  });

  it("publish to docs is allowed for role = 'domain_admin'", async () => {
    // Assert: mockDocCreate called, no FORBIDDEN error
  });

  // ─── socialTargetId ownership ────────────────────────────────────────────

  it("publish throws BAD_REQUEST when socialTargetId belongs to a different tenant", async () => {
    // Arrange: socialPages query returns 0 rows (tenant mismatch)
    // Assert: throws BAD_REQUEST
    //         mockSocialCreateDraft NOT called
  });

  // ─── articleBody null guard ──────────────────────────────────────────────

  it("publish throws BAD_REQUEST when articleBody is null", async () => {
    // Arrange: draft.articleBody = null
    // Assert: throws BAD_REQUEST "Article has not been generated yet"
    //         no destination handler called
  });

  // ─── Docs publish ────────────────────────────────────────────────────────

  it("docs publish (doc_page subkind) calls publishToDocs with docsSubKind = 'doc_page'", async () => {
    // Assert: mockDocCreate called with the correct subkind
  });

  it("docs publish (cms_page subkind) calls publishToDocs with docsSubKind = 'cms_page'", async () => {
    // Assert: mockDocCreate called with correct subkind
  });

});
```

---

## Coverage Gap Analysis

The following gaps are identified by reviewing the test stubs from sections 01–09. Add the corresponding tests to the files listed.

### Gap 1: `saveDraft` rapid-succession upsert race

**File:** `apps/web/server/routers/__tests__/contentComposer.test.ts`

The section-03 test stubs cover basic create and update, but do not cover the case where the client calls `saveDraft` twice before the first call returns.

```typescript
it("saveDraft called twice with same id — second call updates, no duplicate created", async () => {
  // Arrange: create draft via first saveDraft call
  // Act: call saveDraft again with the same returned id
  // Assert: only 1 row exists in the DB for that id
  //         updatedAt on the row is the timestamp of the second call
});
```

### Gap 2: `generateSocialCaption` with unsupported platform

**File:** `apps/web/server/routers/__tests__/contentComposer.test.ts`

```typescript
it("generateSocialCaption throws BAD_REQUEST for unsupported platform 'mastodon'", async () => {
  // Assert: TRPCError({ code: "BAD_REQUEST" }) thrown
  //         draft.socialCaption NOT updated in DB
});

it("generateSocialCaption updates draft.socialCaption in DB on success", async () => {
  // Arrange: mock LLM call returns a caption string
  // Assert: draft.socialCaption = returned caption after call
});
```

### Gap 3: `generateArticle` tenant ownership check

**File:** `apps/web/server/routes/__tests__/contentComposerStream.test.ts`

```typescript
it("returns 403 when the draftId belongs to a different tenant", async () => {
  // Arrange: draft row in DB has tenantId != caller's tenantId
  // Assert: HTTP 403 response
  //         no LLM/stream started
});

it("agency route throws BAD_REQUEST when agencyId does not belong to caller's tenant", async () => {
  // Arrange: draft.executionSource = "agency", agencyId from different tenant
  // Assert: HTTP 400, stream never opened
});
```

### Gap 4: Autosave `isSaving` guard

**File:** `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx`

Section-07 covers the basic autosave flow, but does not cover the case where a second save is blocked while the first is in flight.

```typescript
it("does not start a second autosave while isSaving is true", async () => {
  // Arrange: vi.useFakeTimers(); mock saveDraft to hang (never resolve)
  // Act: type topic (triggers isDirty), advance timers past debounce, let first save start
  // Act: type more (triggers isDirty again), advance timers
  // Assert: mockSaveDraft called exactly once (second not started while first in flight)
});
```

### Gap 5: `ComposerDraftList` empty state

**File:** `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx`

```typescript
it("shows empty state with 'Start your first article' button when no drafts exist", async () => {
  // Arrange: mockListDrafts returns { pages: [{ drafts: [], nextCursor: null }] }
  // Assert: "No drafts yet" text visible
  //         "Start your first article" button visible
});

it("shows 'Load more' button when nextCursor is non-null", async () => {
  // Arrange: mockListDrafts returns nextCursor = "some-cursor"
  // Assert: "Load more" button visible
});
```

### Gap 6: `SafeHtml` URL scheme edge cases

**File:** `apps/web/client/src/components/ui/__tests__/SafeHtml.test.tsx`

Section-04 stubs cover the primary schemes. These cover additional attack vectors:

```typescript
it("strips tel: href from article profile (not in allowed scheme list)", async () => {
  // Note: per plan §5, mailto: IS allowed; tel: is also allowed — adjust assertion
  // to reflect the actual plan §5 allowed schemes: https?:// | mailto: | tel:
});

it("strips data:text/html href", async () => {
  // Arrange: html = '<a href="data:text/html,<script>alert(1)</script>">click</a>'
  // Assert: href attribute removed from rendered output
});

it("strips nested script in allowed tag attributes", async () => {
  // Arrange: html = '<p onclick="alert(1)">text</p>'
  // Assert: onclick not present in rendered output
});
```

### Gap 7: `MediaStudio.tsx` — article tab does not share tabStates

**File:** `apps/web/client/src/pages/__tests__/MediaStudio.articleComposer.test.tsx`

```typescript
it("switching to article tab then back to image tab preserves image prompt text", async () => {
  // Arrange: render MediaStudio, type something in the image prompt input
  // Act: click Article Composer tab, then click Image tab
  // Assert: image prompt text is still present
});

it("article tab does not render the standard image generation form", async () => {
  // Arrange: click Article Composer tab
  // Assert: prompt-input for image generation is not in the DOM
  //         ContentComposerPanel stub IS in the DOM
});
```

### Gap 8: `publish` with `blogTargetId` set (update path)

**File:** `apps/web/server/routers/__tests__/contentComposerPublish.test.ts`

Section-09 stubs cover the create-new-post path. Add:

```typescript
it("blog publish updates existing post when blogTargetId is set", async () => {
  // Arrange: draft.blogTargetId = 42
  // Assert: update call made to blog_posts WHERE id = 42
  //         NOT a new insert
});

it("docs publish updates existing doc_page when docsTargetId is set", async () => {
  // Arrange: draft.docsTargetId = 7, docsSubKind = "doc_page"
  // Assert: update called on doc_pages WHERE id = 7
});
```

---

## Regression Tests for Pre-existing Flows

These tests verify that the feature-063 additions do not break existing functionality. They go into new files with the suffix `.regression.test.ts` to make them identifiable in CI.

### File: `apps/web/client/src/pages/__tests__/MediaStudio.regression.test.tsx`

```typescript
describe("MediaStudio — regression: existing tabs unaffected by article tab", () => {

  it("Image tab renders image generation form correctly", async () => {
    // Arrange: render MediaStudio, default tab = image
    // Assert: image prompt input visible, "Generate" button visible
    //         ContentComposerPanel NOT in the DOM
  });

  it("Video tab renders video generation form correctly", async () => {
    // Arrange: click Video tab
    // Assert: video-specific controls visible
  });

  it("Audio tab renders audio generation form correctly", async () => {
    // Arrange: click Audio tab
    // Assert: audio-specific controls visible
  });

  it("image generation state is not affected by tabStates type widening", async () => {
    // Arrange: type in image prompt, change resolution setting
    // Assert: state is preserved; no TypeScript errors at runtime
  });

  it("switching tabs does not reset image prompt state", async () => {
    // Arrange: type "test prompt" in image tab
    // Act: switch to video, switch back to image
    // Assert: "test prompt" still visible
  });

});
```

### File: `apps/web/server/routers/__tests__/contentComposer.regression.test.ts`

```typescript
describe("contentComposer router — regression: existing routers unaffected", () => {

  it("blog router still handles POST correctly after contentComposer registration", async () => {
    // Arrange: call trpc.blog.* procedure
    // Assert: no interference from the new contentComposer router
  });

  it("library router still returns libraryItems after schema change", async () => {
    // Arrange: call library procedure
    // Assert: libraryItems returned with expected shape (mediaAttachments column addition on blog_posts is backward-compatible)
  });

  it("socialPublishing router still functions after new routers are registered", async () => {
    // Arrange: call trpc.socialPublishing.listPages
    // Assert: returns expected structure
  });

});
```

---

## Coverage Requirements

All new source files from sections 01–09 must reach at least 80% line coverage overall. The following paths are designated **100% coverage required** — confirm each has a test:

| Path | Rule | Covered by |
|------|------|------------|
| Role check: `destinationKind in ["blog","docs"]` requires admin | 100% | `contentComposerPublish.test.ts` + integration test |
| Attachment count limit `> 6` rejected | 100% | `contentComposerPublish.test.ts` + integration test |
| Attachment status `!= "available"` rejected | 100% | `contentComposerPublish.test.ts` + integration test |
| `socialTargetId` tenant ownership check | 100% | `contentComposerPublish.test.ts` + integration test |
| `articleBody` null rejected before publish | 100% | `contentComposerPublish.test.ts` + integration test |
| `SafeHtml`: `javascript:` href stripped | 100% | `SafeHtml.test.tsx` |
| `SafeHtml`: `data:` href stripped | 100% | `SafeHtml.test.tsx` (gap 6) |
| `SafeHtml`: `<script>` stripped | 100% | `SafeHtml.test.tsx` |
| `saveDraft` sanitizes `articleBody` | 100% | `contentComposer.test.ts` |
| Social `mediaRefs` resolved from `sourceUrl` not IDs | 100% | integration test |

---

## Test Execution Checklist

Before marking this section done, verify:

- [ ] `apps/web/server/services/__tests__/contentComposerPublish.integration.test.ts` created with all stubs above
- [ ] All stubs in that file are at least registered as `it(...)` (pending tests are acceptable before implementation)
- [ ] All gap-closure stubs added to their respective existing test files
- [ ] Regression test files created: `MediaStudio.regression.test.tsx` and `contentComposer.regression.test.ts`
- [ ] Run `pnpm test -- --testPathPattern="contentComposerPublish.integration"` — stubs collected (pending), no syntax errors
- [ ] Run `pnpm test:coverage` — check that no previously-passing section drops below 80%
- [ ] Confirm `SafeHtml.test.tsx` has at least one assertion per URL scheme listed in plan §5
- [ ] Confirm `contentComposerPublish.test.ts` has tests for both create and update paths for blog and docs

---

## Implementation Order for This Section

This section contains only test code. The implementation order within the section is:

1. Create `contentComposerPublish.integration.test.ts` with all stubs — ensures the integration skeleton is visible before any implementation is touched
2. Add gap-closure stubs to existing test files — run the suite to confirm nothing is broken
3. Create regression test files — run once to confirm existing behavior still passes
4. After all other sections are implemented, return to this file and fill in the assertions where stubs currently use `// TODO: implement`
5. Run full coverage report and fill any remaining gaps identified by the coverage tool

---

## Consistency Constraints from Neighboring Sections

**section-09-publish** defines `contentComposerPublishService` with four methods (`publishToBlog`, `publishToDocs`, `publishToSocial`, `publishToUploadPost`). The integration test mocks this service module at that exact path: `../../services/contentComposerPublishService`. Do not mock at the router level — mock at the service boundary to keep the router logic under test.

**section-08-generation-stream** uses `POST /api/content-composer/generate-stream` with `Content-Type: text/event-stream`. The gap-closure tests in section `contentComposerStream.test.ts` must use `supertest` (or the same HTTP testing helper used in `apps/web/server/routes/__tests__/`) with a real Express app instance, not a tRPC caller, because this is an Express route, not a tRPC procedure.

**section-03-trpc-crud** defines the `saveDraft` input schema. The integration test's `saveDraft` calls must use the exact same input shape. Do not construct raw DB inserts in integration tests — always go through the tRPC caller so the middleware (tenant check, feature flag) is exercised.

**section-02-composerReducer** tests are pure reducer function tests. They do not need any mock setup and must not import any React or tRPC code.
