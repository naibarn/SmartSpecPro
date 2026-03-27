# Feature 060 — Media Studio Content Composer & Publish Router
## Synthesized Specification

---

## 1. Feature Overview

Feature 060 adds an **Article Composer** track to Media Studio. Instead of only generating images/video/audio and leaving users to manually handle content elsewhere, the new track provides a self-contained workflow:

1. **Compose** an article from a topic using a skill or agency
2. **Attach** 1–6 library-backed media assets
3. **Route** the result to Docs, Blog, or Social post
4. **Publish** with explicit confirmation

This removes the current fragmentation between Media Studio, Blog editor, Docs editor, and Social Publishing. The existing media generation capabilities (Track A) are preserved unchanged.

---

## 2. Context and Constraints

### 2.1 Current State (Problems This Feature Solves)

- Media Studio generates media but has no article authoring
- Blog and docs content is edited in separate pages
- Social publishing requires manual navigation to a different section
- Generated media URLs are temporary until promoted to the library, leading to broken references

### 2.2 Integration Points (from codebase research)

- `apps/web/client/src/pages/MediaStudio.tsx` — 5,614 lines, per-tab state isolation pattern
- `apps/web/server/routers/socialPublishing.ts` — `listPages()` returns `SocialPublishingPageOption[]` with `provider` field for platform filtering
- `apps/web/server/routers/uploadPost.ts` — Upload-Post gateway for platform scheduling
- `apps/web/server/routers/blog.ts` — Express routes for blog CRUD with `sanitizeHtml()`
- `apps/web/server/routers/tenant.ts` — Tenant page management
- `apps/web/drizzle/schema.ts` — `libraryItems`, `blogPosts` (coverImage varchar), `socialPosts` (mediaRefs json), `socialPages` (provider field), `tenantPages`, `docPages`
- Agency components: `AgencyPickerModal`, `ModelPicker`, `ToolPicker` (already exist)
- Library components: `LibraryFilePicker`, `DocumentPreviewPanel` (already exist)

---

## 3. User Roles and Feature Access

| Role | Available destinations |
|------|----------------------|
| `admin`, `domain_admin` | Docs (doc pages + CMS pages), Blog, Social post |
| `user` | Social post only |

Role is checked both client-side (`useAuth()`) and server-side (tRPC procedure middleware) before any destination is rendered or any publish mutation is accepted.

If a connected social account is not ready (`publishingReady === false`), the UI must surface the `publishingIssueCode` with a human-readable explanation and block publish.

---

## 4. User Experience

### 4.1 Track A/B Navigation

The existing Image/Video/Audio tabs in Media Studio gain a fourth top-level tab: **"Article Composer"**. The existing tab state isolation pattern (`tabStates` record keyed by tab name) is extended with an `"article"` key that holds article composer state. When on the Article Composer tab, the full existing generation panel is replaced by `ContentComposerPanel`.

### 4.2 Draft Lifecycle

The Article Composer tab shows two views:
1. **Draft list** — when no draft is open. Shows a "New Article" button and a list of in-progress drafts (last updated, topic preview, status badge). Users can resume a draft or delete it.
2. **Composer** — when a draft is open. Shows the 5-step wizard.

Drafts autosave to the database ~2 seconds after any change (debounced tRPC mutation). A "Draft saved" toast indicator appears in the composer header. Navigating away with unsaved changes shows a confirmation: "Leave? Your draft will be saved." (not lost — always saved before navigation).

### 4.3 The Five-Step Wizard

**Step 1 — Topic & Settings**

- Topic text input (required, up to 2,000 chars)
- Execution source selector: skill or agency radio group
  - Skill selected → skill picker (filters to `chat_assistant` and `prompt_enhancement` categories)
  - Agency selected → `AgencyPickerModal` opens
- Web search toggle (default: off)
- Thinking toggle (default: off)
- Complexity recommendation: if topic length > 150 chars OR topic contains complexity keywords (research, compare, analyze, comprehensive, multi-step, in-depth, detailed, review, versus, vs, pros and cons) → show soft suggestion banner: "This topic looks complex — consider using an Agency." Dismissible. Does not force a switch.
- "Generate Article" primary button (disabled until topic is non-empty)

**Step 2 — Generated Content**

- Streaming HTML preview: text appears word-by-word as the LLM generates
- "Stop generating" button while generating; "Regenerate" button after
- Inline editing of the generated content (using `UnifiedDocumentSurface` component or a contenteditable div)
- DOMPurify sanitization applied to rendered preview (article profile: h1–h4, p, ul, ol, li, blockquote, pre, code, a, b, i, em, strong, br, img)
- "Continue" button enabled after generation completes

**Step 3 — Media Attachment**

- Library asset picker (reuse `LibraryFilePicker`)
- Select 1–6 images or videos (enforced with a counter badge)
- Attachment cards show: thumbnail, filename, media type badge, remove button
- "Generate more media" shortcut opens a mini-panel to generate → promote to library → auto-attach
- Selected assets must have `status === "ready"` in `libraryItems` (no processing/error items)
- Step is optional: user can skip to Step 4 with 0 attachments (though spec requires 1–6 for publish; warn if 0 at publish time)

**Step 4 — Destination**

Role determines which options appear:

For admins/domain_admins:
- **Docs** → sub-picker: "Documentation" (doc_pages) or "CMS Page" (tenant_pages) → then target selector (existing pages with search, or "Create new")
- **Blog** → blog post target selector (existing posts or "Create new draft")
- **Social post** → social flow (see below)

For users:
- **Social post** only (Docs and Blog options hidden)

Social destination flow (platform-first):
1. Platform icon pills: YouTube | Facebook | TikTok | Upload-Post
2. Account picker: filtered to `socialPages` where `provider` matches selected platform; shows `publishingReady` badge and issue explanation if not ready
3. For Upload-Post: uses `trpc.uploadPost.getConnection` to list profiles grouped by platform
4. Auto-truncated social summary: on selecting social destination, a lightweight LLM call generates a platform-appropriate caption (≤280 chars for Facebook/TikTok/YouTube description). Result shown in an editable text field. User can regenerate or edit.

**Step 5 — Review & Confirm**

Full summary card shows:
- Topic
- Execution source (skill name or agency name)
- Article body excerpt (first 200 chars)
- Attached media thumbnails
- Destination: full target description (e.g., "Blog post: 'Create new draft'" or "Facebook page: Brand Name (@brandname)")
- Social caption (if social destination)
- Web search: on/off
- Thinking: on/off

Primary CTA: **"Publish Now"** (not "Submit"). Secondary: "Back to edit".

Confirmation dialog before publish:
```
"Publish to [destination]?"
Body: "This will [create a blog draft / update doc page / queue a social post] with [N] media attachments."
Buttons: [Keep editing]  [Publish now →]
```

### 4.4 Post-Publish State

After successful publish:
- Draft status updates to `"published"`
- Toast: "Published to [destination]!" with a link to the published item where applicable
- Wizard resets to Step 1 with topic cleared
- Draft list shows the published draft with status badge

---

## 5. Functional Requirements

### 5.1 Article Generation

- Article generation MUST be streaming (same SSE/streaming infrastructure as chat)
- Skill route: selected skill's content is used as the system prompt for article generation
- Agency route: the selected agency orchestrates the generation; user must confirm which agency will run before clicking "Generate"
- Web search toggle: when enabled, adds a web search tool to the generation context
- Thinking toggle: when enabled, enables extended thinking mode in the LLM call
- The agency/skill switch MUST never happen silently after the user confirms their choice
- Article body stored as sanitized HTML in the draft

### 5.2 Media Attachment

- Maximum 6 attachments, minimum 0 at draft-save time, minimum 1 warning at publish time
- All attached assets MUST have `status === "ready"` in `libraryItems`
- Attachment references stored as `libraryItems.id` array (integer IDs) in the draft
- Temp preview URLs (generation task URLs) MUST never appear in `attachmentIds`
- The publish step resolves `libraryItems.sourceUrl` from IDs when creating blog/doc/social content

### 5.3 Destination Routing

- Docs (Documentation): create or update a `doc_pages` record
- Docs (CMS Page): create or update a `tenant_pages` record
- Blog: create or update a `blog_posts` record; `coverImage` = first attachment's `sourceUrl`; additional attachment URLs embedded in article body HTML; new `mediaAttachments` JSON column for all attachment IDs
- Social post: create a `social_posts` draft via `trpc.socialPublishing.createDraft`; `mediaRefs` = array of `sourceUrl` values from attached library items; `contentText` = the edited social caption

### 5.4 Social Caption Generation

- Triggered on-demand when user selects a social destination in Step 4
- A lightweight LLM call: system prompt = "Summarize this article for a [platform] social post in under 280 characters. Include relevant hashtags."
- Caption is pre-filled in an editable text field; user can modify or regenerate
- Character count indicator shown per platform

### 5.5 Draft Persistence

- `content_composer_drafts` table stores the full draft state
- Autosave trigger: 2-second debounce after any field change
- Draft list shows last 20 drafts sorted by `updatedAt DESC`
- Draft deletion is immediate with undo toast (5 seconds)

### 5.6 Role Enforcement

- Server-side: tRPC publish procedures check `ctx.user.role` for Blog/Docs targets
- Client-side: Destination options filtered by role before rendering
- Social publish: validate `socialTargetId` belongs to caller's `tenantId` before creating social post

### 5.7 Stable References

- The publish step MUST validate that all `attachmentIds` resolve to `libraryItems` with `status === "ready"` for the caller's tenant
- If any attachment is unavailable, publish is blocked with an error: "Attachment [name] is no longer available. Please remove or replace it."
- The published blog/doc/social content MUST use `libraryItems.sourceUrl` values, never raw generation task preview URLs

---

## 6. Data Model

### 6.1 New Table: `content_composer_drafts`

```
id            varchar(36) PK  UUID
tenantId      varchar(36)     FK → tenants.id
userId        integer         FK → users.id
topic         text            NOT NULL
executionSource varchar(20)   "skill" | "agency"
skillId       varchar(255)    nullable
agencyId      varchar(255)    nullable
articleBody   text            sanitized HTML (nullable until generated)
attachmentIds json            integer[] (libraryItems IDs)
destinationKind varchar(20)   "docs" | "blog" | "social" | null
docsSubKind   varchar(20)     "doc_page" | "cms_page" | null
docsTargetId  integer         nullable (existing page ID if updating)
blogTargetId  integer         nullable (existing blog post ID if updating)
socialPlatform varchar(50)    nullable ("youtube"|"facebook"|"tiktok"|"upload_post")
socialTargetId integer        nullable (socialPages.id)
socialCaption text            nullable (auto-generated social summary)
requiresWebSearch boolean     default false
requiresThinking boolean      default false
status        varchar(30)     "draft" | "published" | "failed"
errorMessage  text            nullable
publishedAt   timestamp       nullable
createdAt     timestamp       now()
updatedAt     timestamp       now()
```

Indexes: `(tenantId, userId, status)`, `(tenantId, updatedAt DESC)`

### 6.2 Modified Table: `blog_posts`

Add column: `mediaAttachments json` — stores `number[]` of `libraryItems.id`. Backward compatible nullable addition. Existing `coverImage` varchar remains for legacy compatibility.

---

## 7. New tRPC Router: `contentComposer`

### 7.1 Procedures

- `saveDraft(input)` → upsert draft, return `{ id, updatedAt }`
- `getDraft({ id })` → return full draft by ID (tenant-scoped)
- `listDrafts({ limit?, cursor? })` → paginated list of drafts for current user
- `deleteDraft({ id })` → soft-delete (status = "deleted")
- `generateArticle({ draftId, topic, skillId?, agencyId?, requiresWebSearch, requiresThinking })` → streaming response; updates draft as it streams
- `generateSocialCaption({ draftId, platform })` → one-shot LLM call; updates draft.socialCaption; returns caption
- `publish({ draftId })` → validate + route to correct destination endpoint; update draft.status

### 7.2 Validation Rules (enforced server-side)

- `topic`: required, min 1, max 2,000 chars
- `attachmentIds`: max 6 items; each must exist in `libraryItems` for the tenant
- `destinationKind`: "blog" or "docs" require `ctx.user.role` in `["admin", "domain_admin"]`
- `socialTargetId`: must belong to caller's `tenantId`

---

## 8. New React Components

| Component | Path | Description |
|---|---|---|
| `ContentComposerPanel` | `client/src/components/media/ContentComposerPanel.tsx` | Owns wizard state via `useReducer`; renders draft list or wizard |
| `ComposerDraftList` | `client/src/components/media/composer/ComposerDraftList.tsx` | List of in-progress drafts with resume/delete |
| `ArticleSettingsStep` | `client/src/components/media/composer/ArticleSettingsStep.tsx` | Step 1: topic, skill/agency, toggles |
| `ArticlePreviewStep` | `client/src/components/media/composer/ArticlePreviewStep.tsx` | Step 2: streaming preview, edit |
| `MediaAttachmentStep` | `client/src/components/media/composer/MediaAttachmentStep.tsx` | Step 3: library picker, max-6 |
| `DestinationStep` | `client/src/components/media/composer/DestinationStep.tsx` | Step 4: routing + role filter |
| `ComposerReviewStep` | `client/src/components/media/composer/ComposerReviewStep.tsx` | Step 5: review + publish CTA |
| `SocialPlatformPicker` | `client/src/components/media/composer/SocialPlatformPicker.tsx` | Platform icon pills |
| `SocialAccountPicker` | `client/src/components/media/composer/SocialAccountPicker.tsx` | Filtered by platform |
| `SafeHtml` | `client/src/components/ui/SafeHtml.tsx` | DOMPurify wrapper (article + social profiles) |
| `SkillAgencySelector` | `client/src/components/media/composer/SkillAgencySelector.tsx` | Skill vs agency radio + pickers |

### 8.1 Reused Existing Components

- `AgencyPickerModal` — agency selection
- `LibraryFilePicker` — media attachment
- `DynamicSkillForm` — skill-specific parameters
- `UnifiedDocumentSurface` — article body editing

---

## 9. Article Generation Streaming Architecture

The `generateArticle` tRPC procedure establishes a streaming response. The flow:

1. Client calls `generateArticle({ draftId, ... })` — opens an SSE connection or streaming tRPC call
2. Server routes to the existing chat/skill/agency streaming service with `articleMode: true`
3. Text chunks stream back to the client
4. Client appends chunks to the article preview textarea in real time
5. On stream end, client applies DOMPurify sanitization client-side (for preview)
6. Client calls `saveDraft(...)` with the final article body — server applies `sanitizeHtml()` before DB write

If the agency route is selected: the agency is invoked through the existing agency orchestrator. The streaming output is the final article text produced by the agency run.

---

## 10. Security Requirements

1. **HTML sanitization**: Article body sanitized server-side via existing `sanitizeHtml()` before storage; DOMPurify on client for preview
2. **Temp URL prohibition**: `publish` procedure validates no attachment resolves to a generation task URL pattern
3. **Role enforcement**: tRPC middleware checks role for Blog/Docs mutations; social target ownership validated
4. **Agency constraints**: agencyId must belong to caller's tenant; tool permissions enforced by existing agency orchestrator
5. **Attachment ownership**: each `attachmentId` validated against `libraryItems WHERE tenantId = ctx.tenantId AND status = "ready"`
6. **Social target ownership**: `socialTargetId` validated against `socialPages WHERE tenantId = ctx.tenantId`
7. **Rate limiting**: apply existing rate limiting to `generateArticle` (LLM call) and `publish` (mutation) procedures

---

## 11. Acceptance Criteria (Testable)

1. `[Role]` Admin sees Docs + Blog + Social. Regular user sees Social only.
2. `[Generation]` Article streams word-by-word when "Generate Article" is clicked.
3. `[Generation]` Skill route uses selected skill as system prompt. Agency route invokes selected agency.
4. `[Generation]` Web search and thinking toggles affect LLM call options.
5. `[Media]` User can attach 1–6 library items. Selecting a 7th is blocked with an error.
6. `[Media]` Assets in "processing" or "error" status cannot be attached.
7. `[Social]` Platform picker filters account list to matching `provider` pages only.
8. `[Social]` Social caption is auto-generated when social destination is selected.
9. `[Social]` Account with `publishingReady === false` shows issue explanation and blocks publish.
10. `[Publish]` Blog publish creates/updates `blog_posts` with `coverImage` = first attachment `sourceUrl`.
11. `[Publish]` Social publish creates `social_posts` draft with `mediaRefs` = library `sourceUrl` values.
12. `[Publish]` No temp/preview URLs appear in published content.
13. `[Draft]` Draft autosaves within 3 seconds of a change.
14. `[Draft]` User can navigate away and return to draft with no data loss.
15. `[Complexity]` Topic with complexity keywords shows agency suggestion banner.
16. `[Track B]` Article Composer tab is visible in Media Studio. Existing Image/Video/Audio tabs unaffected.

---

## 12. Implementation Sequence

1. DB schema: `content_composer_drafts` table + `mediaAttachments` column on `blog_posts`
2. tRPC router: `contentComposer` with `saveDraft`, `getDraft`, `listDrafts`, `deleteDraft`
3. `SafeHtml` component + DOMPurify installation
4. `SkillAgencySelector` + `SocialPlatformPicker` + `SocialAccountPicker` components
5. Five step components (ArticleSettingsStep → ArticlePreviewStep → MediaAttachmentStep → DestinationStep → ComposerReviewStep)
6. `ContentComposerPanel` + `ComposerDraftList` (wizard orchestration)
7. MediaStudio.tsx: add Article Composer tab
8. tRPC: `generateArticle` streaming + `generateSocialCaption`
9. tRPC: `publish` procedure (fan-out to blog/docs/social)
10. Tests for all components and procedures
