# TDD Plan — Feature 060: Media Studio Content Composer

This document defines test stubs for each implementation section in `claude-plan.md`. Tests are written BEFORE implementing each section.

**Testing stack:** Vitest + jsdom + @testing-library/react + @testing-library/user-event (frontend); Vitest + vi.hoisted() + router.createCaller() (tRPC backend).

---

## Section 1: Database Schema (Plan §3)

### Tests: `apps/web/server/routers/__tests__/contentComposerMigration.test.ts`

// Test: content_composer_drafts table exists after migration
// Test: content_composer_drafts has all required columns (id, tenantId, userId, topic, executionSource, etc.)
// Test: blog_posts table has mediaAttachments column after migration
// Test: content_composer_drafts.status defaults to "draft"
// Test: content_composer_drafts.requiresWebSearch defaults to false
// Test: content_composer_drafts.attachmentIds defaults to []

*Migration tests are schema-level checks; use a test DB with real Drizzle queries to confirm column existence and defaults.*

---

## Section 2: tRPC Router — CRUD Procedures (Plan §4.1, §4.2)

### Tests: `apps/web/server/routers/__tests__/contentComposer.test.ts`

**listDrafts**
// Test: returns empty array when user has no drafts
// Test: returns drafts sorted by updatedAt DESC
// Test: does NOT return drafts from other tenants
// Test: does NOT return deleted drafts (status = "deleted")
// Test: respects limit parameter; returns nextCursor for pagination
// Test: DraftSummary includes { id, topic, status, destinationKind, updatedAt, attachmentCount }

**getDraft**
// Test: returns full draft for valid id belonging to caller's tenant+user
// Test: throws NOT_FOUND for non-existent id
// Test: throws FORBIDDEN (or NOT_FOUND) for draft belonging to different tenant

**saveDraft — create**
// Test: creates new draft with returned id when no id provided
// Test: topic can be empty string (no min-length-1 error at save time)
// Test: articleBody is sanitized via sanitizeHtml() before storing (mock sanitizeHtml)
// Test: new draft gets status "draft" by default
// Test: new draft gets tenantId and userId from ctx

**saveDraft — update**
// Test: updates existing draft's topic when id provided
// Test: updates draft's attachmentIds when provided
// Test: updates draft's destinationKind
// Test: updatedAt changes after update
// Test: cannot update a draft from a different tenant (throws FORBIDDEN)

**deleteDraft**
// Test: sets status to "deleted" for valid draft
// Test: throws NOT_FOUND for non-existent draft
// Test: does not hard-delete — row still exists with status "deleted"

---

## Section 3: tRPC Router — Publish Procedure (Plan §4.3, §10)

### Tests: `apps/web/server/routers/__tests__/contentComposerPublish.test.ts`

**Pre-publish validation**
// Test: throws BAD_REQUEST when articleBody is null
// Test: throws BAD_REQUEST when destinationKind is null
// Test: throws FORBIDDEN when destinationKind = "blog" and user role = "user"
// Test: throws FORBIDDEN when destinationKind = "docs" and user role = "user"
// Test: social destination allowed for role = "user"
// Test: throws BAD_REQUEST when an attachmentId has status = "processing"
// Test: throws BAD_REQUEST when an attachmentId has status = "error"
// Test: throws BAD_REQUEST when an attachmentId belongs to a different tenant
// Test: throws BAD_REQUEST when attachmentIds contains more than 6 items
// Test: throws BAD_REQUEST when socialTargetId belongs to a different tenant
// Test: throws BAD_REQUEST when socialTargetId's publishingReady = false

**Blog publish**
// Test: creates new blog_posts row when blogTargetId is null
// Test: updates existing blog_posts row when blogTargetId is set
// Test: blog_posts.coverImage = first attachment's sourceUrl
// Test: blog_posts.mediaAttachments = array of all attachmentIds
// Test: draft.status updated to "published" on success
// Test: draft.publishedAt is set on success

**Social publish**
// Test: creates social_posts draft via socialPublishingService.createPublishingDraft
// Test: mediaRefs = array of sourceUrl values from attachmentIds (NOT raw IDs)
// Test: contentText = draft.socialCaption
// Test: draft.status updated to "published" on success

**Upload-Post publish**
// Test: calls uploadPost gateway with correct profileId for upload_post platform
// Test: draft.status updated to "published" on success
// Test: draft.status = "failed" and errorMessage set when gateway throws

---

## Section 4: SafeHtml Component (Plan §5)

### Tests: `apps/web/client/src/components/ui/__tests__/SafeHtml.test.tsx`

// Test: renders plain text without modification
// Test: renders allowed tags (h2, p, strong, a with https href)
// Test: strips <script> tags in article profile
// Test: strips <iframe> tags in article profile
// Test: strips onclick attribute in article profile
// Test: strips style attribute in article profile
// Test: strips javascript: href and removes the href attribute
// Test: strips data: href and removes the href attribute
// Test: strips vbscript: href and removes the href attribute
// Test: allows https:// href in both profiles
// Test: allows mailto: href in both profiles
// Test: social profile strips <h2> tags (not in allowed list)
// Test: renders empty string without errors
// Test: memoizes — DOMPurify is not called again when props unchanged (spy on DOMPurify.sanitize)
// Test: className prop is forwarded to the container div

---

## Section 5: Composer State (useReducer) (Plan §6)

### Tests: Inline unit tests for the reducer function itself (pure function)

*File: `apps/web/client/src/components/media/__tests__/composerReducer.test.ts`*

// Test: initial state has currentStep = 0, activeDraftId = null
// Test: START_NEW_DRAFT action → currentStep = 1, activeDraftId = null
// Test: DRAFT_CREATED(id) action → activeDraftId = id
// Test: SET_TOPIC action → updates topic, sets isDirty = true
// Test: SET_TOPIC with complexity keywords → showComplexityBanner = true
// Test: SET_TOPIC without keywords and length < 150 → showComplexityBanner = false
// Test: TOGGLE_WEB_SEARCH action → flips requiresWebSearch, sets isDirty = true
// Test: STREAMING_CHUNK action → appends chunk to articleBody
// Test: GENERATION_COMPLETE action → isGenerating = false, isDirty = true
// Test: GENERATION_ERROR action → isGenerating = false, generationError = message
// Test: ADD_ATTACHMENT action → adds id to attachmentIds
// Test: ADD_ATTACHMENT when already 6 items → no change (silently ignored)
// Test: REMOVE_ATTACHMENT action → removes id from attachmentIds
// Test: SET_SOCIAL_CAPTION action → updates socialCaption, captionIsManuallyEdited = true
// Test: CAPTION_GENERATED action → updates socialCaption, captionIsManuallyEdited = false
// Test: SAVE_SUCCESS action → isSaving = false, isDirty = false, lastSavedAt updated
// Test: SAVE_FAILURE action → isSaving = false, isDirty = true (remains)
// Test: GO_TO_STEP action → updates currentStep for steps 0-4
// Test: ABORT_GENERATION action → isGenerating = false

---

## Section 6: SkillAgencySelector Component (Plan §7.2)

### Tests: `apps/web/client/src/components/media/composer/__tests__/SkillAgencySelector.test.tsx`

// Test: renders "Use a Skill" and "Use an Agency" radio options
// Test: "Skill" is selected by default
// Test: selecting "Skill" shows a skill dropdown (calls trpc.skills.list)
// Test: skill dropdown only shows skills with category in ["chat_assistant", "prompt_enhancement"]
// Test: selecting "Agency" opens AgencyPickerModal
// Test: selecting an agency from the modal calls onAgencySelect callback
// Test: complexity banner shows when showComplexityBanner = true prop
// Test: complexity banner is dismissible (click X → banner hides)
// Test: complexity banner is not shown by default

---

## Section 7: SocialPlatformPicker + SocialAccountPicker (Plan §7.2)

### Tests: `apps/web/client/src/components/media/composer/__tests__/SocialPlatformPicker.test.tsx`

**SocialPlatformPicker**
// Test: renders 4 platform options (YouTube, Facebook, TikTok, Upload-Post)
// Test: platform with no connected accounts shows disabled state with tooltip
// Test: selecting a platform calls onSelect callback
// Test: Upload-Post option uses uploadPost.getConnection query to check availability

**SocialAccountPicker**
// Test: shows only accounts matching the selected platform's provider
// Test: account with publishingReady = true shows no warning
// Test: account with publishingReady = false shows the publishingIssueCode description
// Test: account with publishingReady = false is shown but blocked for selection (or shown with warning)
// Test: selecting an account calls onSelect callback with the account's id

---

## Section 8: ArticleSettingsStep (Plan §7.2)

### Tests: `apps/web/client/src/components/media/composer/__tests__/ArticleSettingsStep.test.tsx`

// Test: topic textarea is required (generate button disabled when empty)
// Test: generate button is enabled when topic has at least 1 character
// Test: web search toggle defaults to off
// Test: clicking web search toggle dispatches TOGGLE_WEB_SEARCH
// Test: thinking toggle defaults to off
// Test: generate button click dispatches START_GENERATION (or equivalent)
// Test: "generate" text while topic has complexity keywords shows agency banner

---

## Section 9: MediaAttachmentStep (Plan §7.2)

### Tests: `apps/web/client/src/components/media/composer/__tests__/MediaAttachmentStep.test.tsx`

// Test: shows "0 / 6 selected" counter initially
// Test: selecting an item increments counter
// Test: selecting a 7th item shows an error toast and does NOT add to state
// Test: attached items show a thumbnail card with a remove button
// Test: clicking remove dispatches REMOVE_ATTACHMENT
// Test: items with status = "processing" are not selectable (shown as disabled in LibraryFilePicker)
// Test: "Skip" button is visible and advances to next step
// Test: skipping with 0 attachments shows a warning (but does not block)

---

## Section 10: DestinationStep (Plan §7.2)

### Tests: `apps/web/client/src/components/media/composer/__tests__/DestinationStep.test.tsx`

// Test: admin user sees Docs, Blog, and Social post options
// Test: regular user sees ONLY Social post option (no Docs, no Blog)
// Test: selecting Docs shows docsSubKind picker (Documentation vs CMS Page)
// Test: selecting social → platform picker renders
// Test: selecting social platform → account picker renders filtered by platform
// Test: selecting social account → generateSocialCaption is called automatically
// Test: social caption renders in editable textarea after generation
// Test: manually editing caption sets captionIsManuallyEdited = true
// Test: "Regenerate caption" button triggers new caption generation
// Test: caption generation failure shows inline error with manual entry option
// Test: character count shown for social caption textarea

---

## Section 11: ContentComposerPanel (Plan §7.2)

### Tests: `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx`

// Test: renders ComposerDraftList when currentStep = 0
// Test: renders ComposerStepper when currentStep > 0
// Test: "New Article" advances to step 1 without creating a draft immediately
// Test: first topic change triggers autosave (via debounce — fast-forward fake timers)
// Test: autosave creates new draft when activeDraftId is null (captures returned id)
// Test: autosave updates existing draft when activeDraftId is set
// Test: "Draft saved" indicator appears after successful save
// Test: autosave failure shows warning toast
// Test: navigation guard blocks navigation while isGenerating = true
// Test: navigation guard shows "Stop generation and leave?" dialog
// Test: "Stop and leave" in dialog cancels stream and allows navigation

---

## Section 12: MediaStudio Tab Integration (Plan §11)

### Tests: `apps/web/client/src/pages/__tests__/MediaStudio.articleComposer.test.tsx`

// Test: "Article Composer" tab is visible in MediaStudio tab bar
// Test: switching to Article Composer tab renders ContentComposerPanel
// Test: switching back to Image tab renders the standard image generation form
// Test: video generation tab state is preserved when switching to/from article tab
// Test: Article Composer tab does not affect image/video/audio tab states

---

## Section 13: generateArticle Streaming Route (Plan §8)

### Tests: `apps/web/server/routes/__tests__/contentComposerStream.test.ts`

// Test: returns 401 when no auth token provided
// Test: returns 400 when draftId not found
// Test: returns 403 when draft belongs to different tenant
// Test: streams text chunks as SSE events (Content-Type: text/event-stream)
// Test: sends [DONE] sentinel at end of stream
// Test: handles skill route: loads skill from registry, passes content as system prompt
// Test: handles agency route: validates agencyId belongs to tenant, invokes orchestrator
// Test: webSearch = true passes web search tool to LLM call
// Test: thinking = true passes thinking mode to LLM call
// Test: stream abort (client disconnects) stops LLM generation

---

## Section 14: generateSocialCaption Procedure (Plan §9)

### Tests: (part of contentComposer.test.ts)

// Test: returns generated caption for valid draftId + platform
// Test: updates draft.socialCaption in DB
// Test: uses platform-appropriate character limit in the prompt
// Test: throws NOT_FOUND for non-existent draftId
// Test: throws FORBIDDEN for draft from different tenant
// Test: throws BAD_REQUEST for unsupported platform string

---

## Testing Run Commands

```bash
# Run all article composer tests
cd apps/web && pnpm test -- --testPathPattern="contentComposer|SafeHtml|SkillAgencySelector|SocialPlatformPicker|SocialAccountPicker|ArticleSettingsStep|MediaAttachmentStep|DestinationStep|ContentComposerPanel|MediaStudio.articleComposer|composerReducer"

# Run with coverage
cd apps/web && pnpm test:coverage
```

## Coverage Requirements

All new components and tRPC procedures should reach ≥ 80% line coverage. Critical paths that MUST be covered at 100%:
- Role-based destination filtering (admin vs user)
- Attachment count limit (max 6)
- Stable reference validation in publish (no temp URLs)
- Social target ownership check
- HTML sanitization in saveDraft
