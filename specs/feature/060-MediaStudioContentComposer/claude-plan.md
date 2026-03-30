# Implementation Plan — Feature 060: Media Studio Content Composer

---

## 1. What We Are Building

Feature 060 adds an **Article Composer** track to Media Studio — a five-step wizard that guides the user from a topic to a published article. The wizard generates article content using the existing skill/agency streaming infrastructure, lets the user attach 1–6 library-backed media assets, routes the result to Docs, Blog, or Social post depending on the user's role, and publishes only after explicit confirmation.

The core problems being solved:
- Media Studio has no article authoring capability; users must navigate to separate Blog, Docs, and Social pages
- Generated media URLs are temporary until promoted to the library, causing broken references in published content
- No single workflow ties article generation to media selection and destination routing

The existing Image, Video, and Audio generation capabilities inside Media Studio (Track A) are preserved unchanged. The Article Composer is Track B, added as a new top-level tab.

---

## 2. Architecture Overview

### 2.1 Two-Track MediaStudio

MediaStudio.tsx currently uses a per-tab state isolation pattern: a `tabStates` record keyed by media type (`"image"`, `"video"`, `"audio"`), where each key holds a `TabState` object. The existing tabs share a generation pipeline.

The Article Composer tab is added as a fourth top-level tab. It does NOT share the generation pipeline state — instead, when the user switches to the `"article"` tab, `ContentComposerPanel` renders in place of the normal generation form. The `tabStates` record gains an `"article"` key, but its value is minimal (just enough for tab restoration — the real composer state lives inside `ContentComposerPanel` via `useReducer`).

The tab bar after the change reads: **Image | Video | Audio | Article Composer**

### 2.2 Composer State Machine

`ContentComposerPanel` owns all wizard state via a single `useReducer`. The draft lifecycle follows this state machine:

```
no draft selected
    │ "New Article" pressed → create empty draft (autosaved immediately)
    ▼
step 1: Topic & Settings
    │ "Generate Article"
    ▼
step 2: Generated Content (streaming in progress or complete)
    │ streaming complete, user advances
    ▼
step 3: Media Attachment (0–6 items selected)
    │ user advances
    ▼
step 4: Destination (role-filtered; social platform + account picker)
    │ user advances
    ▼
step 5: Review & Confirm
    │ "Publish Now"
    ▼
published (draft.status = "published")
```

Any state change at any step triggers an autosave (2-second debounce, tRPC `contentComposer.saveDraft` mutation).

### 2.3 Data Flow Summary

```
User input (topic, skill/agency, toggles)
    │ generateArticle mutation → streaming SSE
    ▼
Article body (raw HTML from LLM)
    │ DOMPurify (client-side, for preview only)
    ▼
Article preview (rendered in SafeHtml)
    │ saveDraft mutation → server applies sanitizeHtml() before storage
    ▼
contentComposerDrafts.articleBody (sanitized HTML in DB)
    │ publish mutation
    ▼
blog_posts | doc_pages | tenant_pages | social_posts
    (stable libraryItems.sourceUrl used for all media references)
```

---

## 3. Database Schema

### 3.1 New Table: `content_composer_drafts`

This table stores one row per in-progress or published article composition per user.

Fields:

```
id                varchar(36)   PK, UUID generated on insert
tenantId          varchar(36)   FK → tenants.id, NOT NULL, indexed
userId            integer       FK → users.id, NOT NULL
topic             text          NOT NULL (max 2,000 chars enforced in tRPC)
executionSource   varchar(20)   "skill" | "agency"
skillId           varchar(255)  nullable — selected skill ID
agencyId          varchar(255)  nullable — selected agency ID
articleBody       text          nullable — sanitized HTML; set after generation
requiresWebSearch boolean       default false
requiresThinking  boolean       default false
attachmentIds     json          integer[] — libraryItems.id array, default []
destinationKind   varchar(20)   nullable — "docs" | "blog" | "social"
docsSubKind       varchar(20)   nullable — "doc_page" | "cms_page" (used when destinationKind=docs)
docsTargetId      integer       nullable — existing doc_pages.id or tenant_pages.id to update
blogTargetId      integer       nullable — existing blog_posts.id to update (null = create new)
socialPlatform    varchar(50)   nullable — "youtube" | "facebook" | "tiktok" | "upload_post"
socialTargetId    integer       nullable — socialPages.id
socialCaption     text          nullable — auto-generated + user-edited social summary
status            varchar(30)   "draft" | "published" | "failed", default "draft"
errorMessage      text          nullable — set on publish failure
publishedAt       timestamp TZ  nullable
createdAt         timestamp TZ  default now()
updatedAt         timestamp TZ  default now()
```

Indexes:
- `(tenantId, userId, status)` for draft list queries
- `(tenantId, updatedAt DESC)` for ordered listing

### 3.2 Modified Table: `blog_posts`

Add one nullable JSON column:

```
mediaAttachments  json   nullable, default null — integer[] of libraryItems.id
```

This is a backward-compatible addition. The existing `coverImage` varchar remains for legacy compatibility. The `coverImage` continues to be set to the first attachment's `sourceUrl` when publishing from the article composer.

### 3.3 Migration Notes

Both schema changes require a Drizzle migration (`pnpm db:push` in `apps/web`). The `blog_posts` change is low-risk (nullable column add). The new `content_composer_drafts` table is a fresh creation. Follow the Database Safety Protocol for backup and verification.

---

## 4. tRPC Router: `contentComposer`

A new tRPC router at `apps/web/server/routers/contentComposer.ts`, registered in `apps/web/server/routers.ts`.

### 4.1 Middleware

All procedures use `protectedProcedure` with a `contentComposerProcedure` middleware that resolves and validates `tenantId` (same pattern as `socialPublishingProcedure` in `socialPublishing.ts`).

### 4.2 Procedure Signatures

```
listDrafts(input: { cursor?: string, limit?: number })
  → { drafts: DraftSummary[], nextCursor: string | null }
  DraftSummary: { id, topic, status, destinationKind, updatedAt, attachmentCount }

getDraft(input: { id: string })
  → ContentComposerDraft (full row)
  Throws FORBIDDEN if draft.tenantId !== ctx.tenantId

saveDraft(input: SaveDraftInput)
  → { id: string, updatedAt: string }
  Creates if id omitted, updates if id provided.
  Server sanitizes articleBody with sanitizeHtml() before storing.
  SaveDraftInput mirrors all nullable fields of content_composer_drafts.
  topic is optional/nullable in saveDraft (allows autosave before the user has typed);
  topic min-length-1 is only enforced in publish validation, not in saveDraft.

deleteDraft(input: { id: string })
  → { success: true }
  Sets status = "deleted" (soft delete). Throws NOT_FOUND if not found.

generateArticle(input: { draftId: string })
  → streaming text response
  Reads draft fields from DB; invokes skill or agency via existing streaming service.
  Each text chunk is streamed back to client via SSE/streaming tRPC.
  After stream ends, saves sanitized articleBody back to the draft via saveDraft.

generateSocialCaption(input: { draftId: string, platform: string })
  → { caption: string }
  Reads draft.articleBody; calls LLM with a platform-specific summarization prompt.
  Updates draft.socialCaption. Returns the generated caption.

publish(input: { draftId: string })
  → { success: true, publishedId: string | number, destinationUrl?: string }
  Validates all constraints (role, attachment ownership, stable refs).
  Routes to the correct destination handler.
  Updates draft.status to "published" or "failed".
```

### 4.3 Publish Fan-Out Logic

The `publish` procedure reads the draft's `destinationKind` and calls the appropriate internal service:

- `destinationKind === "blog"` → calls the blog creation/update logic (same path as `POST /api/blog/posts`); requires `role` in `["admin", "domain_admin"]`
- `destinationKind === "docs"` with `docsSubKind === "doc_page"` → calls doc_pages create/update; requires admin role
- `destinationKind === "docs"` with `docsSubKind === "cms_page"` → calls tenant_pages create/update; requires admin role
- `destinationKind === "social"` with `socialPlatform !== "upload_post"` → calls `socialPublishingService.createDraft()`
- `destinationKind === "social"` with `socialPlatform === "upload_post"` → calls the Upload-Post gateway job creation

Before any publish call, the procedure:
1. Validates all `attachmentIds` exist in `libraryItems` where `tenantId = ctx.tenantId AND status = "ready"`
2. Validates `socialTargetId` (if set) belongs to `ctx.tenantId`
3. Ensures `articleBody` is not null (generation must have completed)
4. Confirms the caller's role permits the `destinationKind`

---

## 5. SafeHtml Component

Location: `apps/web/client/src/components/ui/SafeHtml.tsx`

This is a thin wrapper around DOMPurify. It is the ONLY permitted path for rendering untrusted HTML in this feature. Direct use of `dangerouslySetInnerHTML` in any article composer component is forbidden.

The component accepts:
- `html: string` — raw HTML to sanitize and render
- `profile: "article" | "social"` — determines allowed tags (default: "article")
- `className?: string` — forwarded to the container div

**Article profile** allows: h1–h4, p, ul, ol, li, blockquote, pre, code, a (href, title only), b, i, em, strong, br, img (src, alt only). Forbids: script, style, iframe, form, input. All event handler attributes are stripped.

**Social profile** allows: b, i, em, strong, a (href only), p, br.

A `beforeSanitizeAttributes` DOMPurify hook enforces that all `href` attributes match `^https?:\/\/|^mailto:|^tel:` — any other scheme (javascript:, data:, vbscript:) causes attribute removal.

The component is memoized: it only re-runs DOMPurify when `html` or `profile` changes.

---

## 6. Composer State (useReducer Shape)

`ContentComposerPanel` manages all wizard state with a `useReducer`. The state shape:

```typescript
interface ComposerState {
  // Navigation
  activeDraftId: string | null
  currentStep: 0 | 1 | 2 | 3 | 4   // 0 = draft list

  // Step 1 — Topic & Settings
  topic: string
  executionSource: "skill" | "agency"
  skillId: string | null
  agencyId: string | null
  requiresWebSearch: boolean
  requiresThinking: boolean
  showComplexityBanner: boolean

  // Step 2 — Generated Content
  articleBody: string          // accumulated streaming chunks
  isGenerating: boolean
  generationError: string | null

  // Step 3 — Media Attachment
  attachmentIds: number[]      // libraryItems.id values

  // Step 4 — Destination
  destinationKind: "docs" | "blog" | "social" | null
  docsSubKind: "doc_page" | "cms_page" | null
  docsTargetId: number | null
  blogTargetId: number | null
  socialPlatform: "youtube" | "facebook" | "tiktok" | "upload_post" | null
  socialTargetId: number | null
  socialCaption: string
  isCaptionGenerating: boolean

  // Draft sync
  lastSavedAt: Date | null
  isSaving: boolean
  isDirty: boolean

  // Publish
  isPublishing: boolean
  publishError: string | null
}
```

Actions are dispatched for every user interaction (SET_TOPIC, SET_SKILL, TOGGLE_WEB_SEARCH, etc.) and for async events (STREAMING_CHUNK, GENERATION_COMPLETE, SAVE_SUCCESS, etc.).

---

## 7. Component Architecture

### 7.0 i18n Requirement

All user-visible strings in article composer components MUST use the `useI18n()` hook and i18n translation keys. New keys should be added to `apps/web/client/src/lib/i18n/locales/en.ts` and `th.ts` following the existing nested object pattern. Use the key prefix `mediaStudio.articleComposer.*`. Example: `mediaStudio.articleComposer.generateButton`, `mediaStudio.articleComposer.draftSaved`, etc.

### 7.1 Directory Structure

```
apps/web/client/src/components/media/
  ContentComposerPanel.tsx        ← orchestrator; owns useReducer + useEffect autosave
  composer/
    ComposerDraftList.tsx         ← list view when no draft is open
    ArticleSettingsStep.tsx       ← step 1
    ArticlePreviewStep.tsx        ← step 2 (streaming)
    MediaAttachmentStep.tsx       ← step 3
    DestinationStep.tsx           ← step 4
    ComposerReviewStep.tsx        ← step 5
    SocialPlatformPicker.tsx      ← platform icon pills
    SocialAccountPicker.tsx       ← account list filtered by platform
    SkillAgencySelector.tsx       ← skill vs agency radio group + pickers
    ComposerStepper.tsx           ← horizontal step indicator (steps 1–5)

apps/web/client/src/components/ui/
  SafeHtml.tsx                    ← DOMPurify wrapper
```

### 7.2 Component Responsibilities

**ContentComposerPanel**

Owns the `useReducer` state and all tRPC calls. Renders either `ComposerDraftList` (when `currentStep === 0`) or the active step component + `ComposerStepper`. Contains the autosave `useEffect` (2-second debounce on `isDirty`). Does NOT render any UI itself — delegates to step components via props.

**ComposerDraftList**

Calls `trpc.contentComposer.listDrafts.useQuery()`. Renders a paginated list of in-progress drafts. "New Article" button dispatches `START_NEW_DRAFT` which advances to step 1 with `activeDraftId: null` — it does NOT pre-create a draft on the server. The draft is created on the first successful autosave, which happens when the user first types a topic. `saveDraft` called without an `id` creates a new record and returns the new `id`; the client dispatches `DRAFT_CREATED(id)` to set `activeDraftId`. This avoids creating empty DB rows for sessions where the user opens but never types anything. Each existing draft row has a "Resume" and "Delete" button.

**ArticleSettingsStep**

Renders: topic textarea, `SkillAgencySelector`, web-search toggle, thinking toggle, complexity banner (shown/hidden from state), "Generate Article" button. Complexity check runs as a `useMemo` on `topic` text — no async calls.

**SkillAgencySelector**

A radio group: "Use a Skill" | "Use an Agency". When "Skill" selected: calls `trpc.skills.list.useQuery()` to fetch all tenant skills, then filters client-side to those with `category` in `["chat_assistant", "prompt_enhancement"]`. The `trpc.skills.list` procedure already exists (it is called in the existing skill browser and chat views). Results populate a Select dropdown. When "Agency" selected: opens `AgencyPickerModal`.

**ArticlePreviewStep**

Renders: a streaming text area (content appended via `SafeHtml` with `profile="article"`) and a "Stop" button during generation, then "Regenerate" and "Edit manually" buttons after completion. Manual editing uses a `<textarea>` that replaces `SafeHtml` when editing mode is active. The component receives the streaming text via props from `ContentComposerPanel` (which owns the streaming subscription).

**MediaAttachmentStep**

Renders: a `LibraryFilePicker` in multi-select mode capped at 6 items. Shows selected assets as cards (thumbnail, name, remove button). Shows a counter: "3 / 6 selected". A "Skip" option is visible but triggers a warning toast on the Review step if 0 items are attached.

**DestinationStep**

Renders based on `ctx.user.role`:
- Admin/domain_admin: three option cards — Docs, Blog, Social post
- User: one option card — Social post

Selecting "Docs" shows the `docsSubKind` picker (Documentation vs CMS Page), then a searchable target selector. For "Documentation" targets, call the existing `GET /api/docs/pages` Express route (or the equivalent tRPC procedure if one exists — implementer should check `apps/web/server/routers/` for a docs router; if absent, use the Express route directly via a `useQuery` wrapping `fetch`). For "CMS Page" targets, call `trpc.tenant.listContentPages` (if it exists) or the equivalent tenant pages list endpoint. The implementer should search for the existing page listing calls used by `DomainAdminContent.tsx` and reuse those. Both show results in a searchable Select with an "Create new" option at the top.

Selecting "Social post" renders `SocialPlatformPicker` then (after platform choice) `SocialAccountPicker`. After account selection, calls `trpc.contentComposer.generateSocialCaption` and shows the result in an editable textarea with character count.

**SocialPlatformPicker**

Renders four icon pills: YouTube, Facebook, TikTok, Upload-Post. Calls `trpc.socialPublishing.listPages.useQuery()` and `trpc.uploadPost.getConnection.useQuery()` to know which platforms have connected accounts. Platforms with no connected accounts are shown as disabled with a "Connect first" tooltip.

**SocialAccountPicker**

Receives `platform` prop. Filters the `listPages` data to `pages.filter(p => p.provider === platform)`. Shows account cards with `publishingReady` badge. If `publishingReady === false`, shows the `publishingIssueCode` description (from `formatPublishingReadiness()` utility already in `social.ts`).

**ComposerStepper**

A horizontal progress indicator rendered at the top of the wizard (steps 1–5). Each step is shown as a numbered node with a label (Topic, Content, Media, Destination, Review). Completed steps show a checkmark; the active step is highlighted; future steps are muted. Clicking a completed step navigates back to it (dispatches `GO_TO_STEP`). Clicking a future step is blocked. No tRPC calls — read-only display component driven by `currentStep` prop.

**ComposerReviewStep**

Shows a read-only summary of all choices. The "Publish Now" button calls `trpc.contentComposer.publish`. Shows a confirmation dialog (see spec §4.3) before calling publish. While publishing: spinner on button, all other controls disabled.

---

## 8. Article Generation Streaming

### 8.1 How Streaming Works

`ContentComposerPanel` uses the tRPC v11 experimental streaming or httpSubscription pattern. Implementer should check how the existing chat streaming is implemented in `ChatView.tsx` and use the same mechanism (likely via a custom `EventSource` / `fetch` streaming call to an Express streaming route, since tRPC v11 streaming support may use a non-mutation endpoint).

**Implementation approach:** The implementer must first find the existing chat streaming endpoint (look for `POST /api/chat/stream` or similar in `apps/web/server/routes/` or `apps/web/server/services/chatService.ts`). The article generation stream must use the **exact same streaming mechanism** as the existing chat stream — whether that is SSE (with `res.setHeader('Content-Type', 'text/event-stream')`) or Socket.io or tRPC httpSubscription. Do not introduce a new streaming protocol. Add a new route `POST /api/content-composer/generate-stream` modeled after the existing chat stream route. Each chunk is dispatched as `STREAMING_CHUNK`. A final `[DONE]` sentinel triggers `GENERATION_COMPLETE`.

The `useEffect` in `ContentComposerPanel` manages the stream lifecycle. When `isGenerating` becomes true, it opens the stream. When the component unmounts or the user clicks "Stop", it aborts the stream via `AbortController`.

This reuses the existing streaming infrastructure used by the chat service. The key addition is an `articleMode: true` flag passed to the streaming service, which signals that the output should be structured as an HTML article (the skill/agency prompt instructs the LLM to format with proper HTML tags).

### 8.2 Error Handling for Streaming

If the stream connection fails or returns an error event:
- Dispatch `GENERATION_ERROR` with the error message
- Set `isGenerating: false`
- Show an inline error below the preview area: "Generation failed: [message]. Try again."
- The "Generate Article" button becomes available again
- Any partial article body from before the failure is retained in state (user can keep it or regenerate)

If the user navigates away while `isGenerating` is true: the navigation guard (`useBlocker`) intercepts and shows a dialog: "Article is currently generating. Stop generation and leave?" [Cancel] [Stop and leave]. Choosing "Stop and leave" dispatches `ABORT_GENERATION` (which aborts the stream) then allows navigation.

### 8.2 Skill Route

When `executionSource === "skill"`:
1. Load the selected skill from the skills registry
2. Use the skill's markdown content as the system prompt
3. Pass the topic as the user message
4. Apply `requiresWebSearch` and `requiresThinking` flags to the LLM call options

### 8.3 Agency Route

When `executionSource === "agency"`:
1. Validate that the `agencyId` belongs to the caller's tenant before starting (throw BAD_REQUEST if not)
2. Invoke the existing agency orchestrator with the selected `agencyId`
3. Pass the topic as the initial user message to the agency's entry agent
4. Stream the agency's final output back to the client
5. The agency's tool permissions are those configured on the agency — no special article mode tool restriction in Phase 1. The spec requirement for "approved templates" is deferred to Phase 2; in Phase 1, any agency belonging to the tenant is valid.

Note: the spec states "The system must not silently switch from skill to agency or from agency to skill." Enforced client-side: `executionSource` is locked after clicking "Generate Article" and cannot be changed mid-generation. To switch, the user must click "Regenerate" which resets state and re-enables the selector.

### 8.4 Post-Generation

When generation completes:
1. Client dispatches `GENERATION_COMPLETE`
2. `isDirty` is set to true → autosave triggers within 2 seconds
3. `saveDraft` mutation sends the article body to the server
4. Server applies `sanitizeHtml()` before writing to `content_composer_drafts.articleBody`

### 8.5 Autosave Failure Handling

If the `saveDraft` mutation returns an error:
- Show a non-blocking warning toast: "Draft save failed — changes not saved. Retrying..."
- Retry once automatically after 5 seconds
- If the retry also fails, show a persistent warning banner at the top of the composer: "⚠ Unable to save draft. Your changes may be lost. Check your connection."
- `isDirty` remains true; the next user interaction will trigger another debounced save attempt
- Do NOT block the user from continuing to edit while the save is failing

Concurrent autosave: the debounce function cancels any pending save before scheduling a new one. Only one `saveDraft` mutation is in flight at a time (enforce with a `isSaving` flag that blocks a new save from starting until the previous one completes or fails).

---

## 9. Social Caption Generation

`generateSocialCaption` is a one-shot (non-streaming) tRPC mutation. It triggers automatically when the user sets `socialTargetId` for the first time. After the first caption is generated, switching accounts does NOT auto-regenerate if the user has manually edited the caption.

State tracks `captionIsManuallyEdited: boolean`. If false and the account changes, auto-regenerate. If true (user has edited the textarea), do not auto-regenerate — the user must click "Regenerate caption" explicitly. The "Regenerate caption" button resets `captionIsManuallyEdited` to false.

If `generateSocialCaption` fails, show an inline error under the caption textarea: "Caption generation failed — you can write one manually." The caption field remains editable and the user can proceed without a generated caption (the field is optional: an empty caption results in an empty `contentText` in the social post draft, which is valid per the existing `createDraft` schema).

### Platform-specific prompts

The server constructs a system prompt tailored to the platform:
- Facebook: "Summarize for a Facebook post. Keep it under 500 characters. Include 2–3 relevant hashtags."
- YouTube: "Write a YouTube video description. Keep it under 300 characters and include a clear call to action."
- TikTok: "Write a TikTok caption. Keep it under 150 characters. Include trending hashtags."
- Upload-Post: "Write a social media post suitable for cross-platform scheduling. Under 280 characters."

The generated caption is stored in `draft.socialCaption` and rendered in an editable `<textarea>` with a character count indicator. Manually dispatching `SET_SOCIAL_CAPTION` from the textarea's `onChange` sets `captionIsManuallyEdited: true`.

---

## 10. Publish Fan-Out

The `publish` tRPC procedure is the single entry point for all destination types.

### 10.1 Pre-publish Validation

Before any write, the procedure must:
1. Load all `attachmentIds` from `libraryItems WHERE id IN (...) AND tenantId = ctx.tenantId`
2. Verify all attachments have `status = "ready"` — throw `BAD_REQUEST` with the names of any unavailable items
3. Verify no `attachmentId` resolves to a URL matching a generation task URL pattern (a future-proofing guard; for now, all library items with `status = "ready"` are considered stable)
4. Verify `destinationKind` in `["blog", "docs"]` requires `ctx.user.role` in `["admin", "domain_admin"]` — throw `FORBIDDEN` otherwise
5. Verify `socialTargetId` (if set) belongs to `ctx.tenantId` via `socialPages WHERE id = socialTargetId AND tenantId = ctx.tenantId`

### 10.2 Blog Publish

Calls the blog creation/update service (same logic as `POST /api/blog/posts`):
- `title`: first line of article or first 100 chars of `articleBody` stripped of HTML tags. The slug is auto-generated from the title + a UUID suffix (e.g., `article-title-abc123f4`) to guarantee uniqueness per tenant — follow the existing slug generation pattern in `blog.ts`; if the blog router already handles slug uniqueness, rely on that behavior.
- `content`: `articleBody` (already sanitized)
- `coverImage`: `libraryItems.sourceUrl` of the first `attachmentId`
- `mediaAttachments`: the full `attachmentIds` array

If `blogTargetId` is set, this is an update; otherwise create a new draft post (`isPublished: false`).

Returns the blog post ID. `destinationUrl` = `/blog/{slug}` if available.

### 10.3 Docs Publish

- `docsSubKind === "doc_page"` → upsert `doc_pages` record with `content = articleBody`
- `docsSubKind === "cms_page"` → upsert `tenant_pages` record with `content = articleBody`

If `docsTargetId` is set, update the existing page. Otherwise create a new draft page.

### 10.4 Social Publish

Calls `createPublishingDraft(tenantId, userId, socialTargetId, { contentText: socialCaption, mediaRefs: attachmentSourceUrls })` — reusing the existing `socialPublishingService.createPublishingDraft()` function.

`attachmentSourceUrls` are resolved from `libraryItems.sourceUrl` for each `attachmentId`.

For Upload-Post targets: calls the Upload-Post gateway `publishUploadPostNow()` or `scheduleUploadPostJob()` depending on whether the user wants immediate or scheduled publishing. (Phase 1: always immediate via `publishUploadPostNow`.)

---

## 11. MediaStudio.tsx Integration

### 11.1 Tab Addition

MediaStudio.tsx currently renders tabs defined by a `tabs` array of objects with `{ key, label, mediaType }`. A new entry is added:
```
{ key: "article", label: "Article Composer", mediaType: null }
```

The tab switching logic that currently always renders the generation form is updated with a conditional: when `currentTab === "article"`, render `<ContentComposerPanel />` instead of the standard generation form.

The `tabStates` record type is updated to allow an `"article"` key. The tab state for `"article"` is kept minimal (just persists which step the user was on, if desired — or left as an empty object since `ContentComposerPanel` manages its own state).

### 11.2 No Regressions

All changes to `MediaStudio.tsx` are additive. The existing `tabStates` for `"image"`, `"video"`, `"audio"` and their generation logic are not modified. The new tab rendering branch uses an `if (currentTab === "article") return <ContentComposerPanel />` pattern, isolated from the existing render path.

---

## 12. Role-Based Access Enforcement

### 12.1 Client-Side

`DestinationStep` reads `const { user } = useAuth()` and computes `const isAdmin = user?.role === "admin" || user?.role === "domain_admin"`. Docs and Blog destination option cards are only rendered when `isAdmin === true`.

### 12.2 Server-Side

The `publish` procedure and `saveDraft` procedure both check role for Blog/Docs destinations. The check uses `ctx.user.role` (available on all `protectedProcedure` contexts). Attempting to publish to Blog or Docs as a `"user"` role throws `TRPCError({ code: "FORBIDDEN" })`.

The role check is in the middleware layer, not in the service layer — following the existing pattern in `blog.ts` Express routes.

---

## 13. Testing Strategy

### 13.1 Unit Tests — Components

File: `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx`

Test cases:
- Shows draft list on initial load (no draft selected)
- "New Article" creates a draft and advances to step 1
- Admin user sees Docs + Blog + Social on DestinationStep
- Regular user sees only Social on DestinationStep
- Topic with complexity keywords shows the agency suggestion banner
- Topic without keywords hides the agency suggestion banner
- Attaching a 7th media item is blocked with an error message
- Media items with `status !== "ready"` cannot be selected
- Social platform picker filters account list to matching provider

File: `apps/web/client/src/components/ui/__tests__/SafeHtml.test.tsx`

Test cases:
- `<script>` tags are stripped in article profile
- `javascript:` href is stripped in both profiles
- Valid `https://` href passes through
- `style` attribute is stripped
- `onclick` attribute is stripped
- Article profile allows `<h2>`, social profile does not

### 13.2 Unit Tests — tRPC Router

File: `apps/web/server/routers/__tests__/contentComposer.test.ts`

Test cases:
- `saveDraft` creates a new draft for the caller's tenant/user
- `saveDraft` sanitizes articleBody before storing (mock `sanitizeHtml`)
- `getDraft` returns NOT_FOUND for a draft from a different tenant
- `publish` to Blog throws FORBIDDEN for `user` role
- `publish` to Blog succeeds for `admin` role
- `publish` throws BAD_REQUEST when an attachment has `status = "processing"`
- `publish` throws BAD_REQUEST when `socialTargetId` belongs to a different tenant
- `listDrafts` returns only drafts for the caller's user/tenant
- `deleteDraft` sets status to "deleted" and does not hard-delete the row

### 13.2.5 Edge Case Tests (router)

- `saveDraft` called twice in rapid succession — second call updates, no duplicate created
- `publish` called when `articleBody` is null → throws BAD_REQUEST "Article has not been generated yet"
- `publish` called when a library item's status changed to "error" after attachment → throws BAD_REQUEST listing the unavailable item name
- `generateArticle` called for a draft from a different tenant → throws FORBIDDEN
- `generateSocialCaption` called with an unsupported platform string → throws BAD_REQUEST

### 13.3 Integration Tests

File: `apps/web/server/services/__tests__/contentComposerPublish.test.ts`

Test cases:
- Blog publish creates `blog_posts` row with correct `coverImage` and `mediaAttachments`
- Social publish creates `social_posts` row with `mediaRefs` as `sourceUrl` values
- Publish resolves attachment IDs to stable `sourceUrl` values (not raw task URLs)
- Publish chain: draft created → article generated → attachments selected → published → draft.status updated

---

## 14. Security Checklist

- [ ] DOMPurify installed (`npm install dompurify @types/dompurify` in `apps/web`)
- [ ] `SafeHtml` is the only path for rendering article HTML (grep for `dangerouslySetInnerHTML` in composer components)
- [ ] `sanitizeHtml()` called server-side in `saveDraft` before writing `articleBody` to DB
- [ ] All `attachmentIds` validated against tenant-scoped `libraryItems` before publish
- [ ] Role check enforced server-side for Blog/Docs destinations
- [ ] `socialTargetId` validated against `socialPages WHERE tenantId = ctx.tenantId`
- [ ] Generation task preview URLs (raw task URLs) never written to `socialPosts.mediaRefs` or `blogPosts.coverImage`
- [ ] Rate limiting applied to `generateArticle` and `publish` (reuse existing rate limit middleware)

---

## 15. Dependencies and Install Requirements

- **New npm package:** `dompurify` + `@types/dompurify` in `apps/web`
- No new Python backend dependencies required for Phase 1
- No new external API integrations — reuses existing social publishing, upload-post, blog, and docs APIs

---

## 16. Out of Scope (Phase 1)

- Scheduling social posts from the composer (always publish immediately in Phase 1; Upload-Post scheduling in Phase 2)
- Per-platform content customization tabs (all platforms get the same caption; platform-specific tabs in Phase 2)
- Agency tool-constraint enforcement specific to article generation (use agency's existing tool permissions in Phase 1)
- Undo window after publish (Phase 2 improvement)
- Draft sharing or multi-user collaboration on a draft
- Import existing blog post content into the composer for revision
