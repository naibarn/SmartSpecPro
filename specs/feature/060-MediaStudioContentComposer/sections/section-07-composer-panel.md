Now I have all the context needed to write the section. Let me compose it:

# Section 07 — `ContentComposerPanel` Orchestrator + `ComposerDraftList` + MediaStudio Tab Integration

**Section ID:** `section-07-composer-panel`
**Batch:** 4 — runs after section-06-wizard-steps completes
**Depends on:** section-06-wizard-steps (which depends on 02, 04, 05)
**Blocks:** section-10-tests

---

## Overview

This section assembles the top-level orchestrator component that drives the entire Article Composer wizard. It owns the `useReducer` state, all tRPC mutations, the autosave debounce, the streaming subscription lifecycle, and navigation-guard logic. It also implements the draft list view shown before any draft is open, and wires the new "Article Composer" tab into `MediaStudio.tsx`.

By the time this section is implemented, all wizard step components (section-06), the composer reducer (section-02), and the social/skill pickers (sections 04–05) are already complete. This section connects them and exposes `ContentComposerPanel` as a fully working panel.

---

## Files

| Action | Path |
|--------|------|
| Create | `apps/web/client/src/components/media/ContentComposerPanel.tsx` |
| Create | `apps/web/client/src/components/media/composer/ComposerDraftList.tsx` |
| Modify | `apps/web/client/src/pages/MediaStudio.tsx` |
| Create | `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx` |
| Create | `apps/web/client/src/pages/__tests__/MediaStudio.articleComposer.test.tsx` |

---

## Background Context

### Composer Reducer (section-02)

`ContentComposerPanel` imports from `apps/web/client/src/components/media/composerReducer.ts`:

```typescript
import { composerReducer, initialComposerState } from "../composerReducer";
import type { ComposerState, ComposerAction } from "../composerReducer";
```

All wizard state lives in a single `useReducer(composerReducer, initialComposerState)` call at the top of `ContentComposerPanel`. Step components receive `state` and `dispatch` as props — they do not own any state that maps to `ComposerState` fields.

### tRPC Router (section-03)

`ContentComposerPanel` uses three tRPC mutations and one query:

```typescript
trpc.contentComposer.listDrafts.useQuery(...)   // drives ComposerDraftList
trpc.contentComposer.saveDraft.useMutation(...)  // autosave
trpc.contentComposer.deleteDraft.useMutation(...) // draft deletion from list
trpc.contentComposer.generateSocialCaption.useMutation(...) // caption auto-gen
```

The `publish` mutation is called from `ComposerReviewStep` (section-06), but `ContentComposerPanel` must pass down an `onPublish` callback that calls `trpc.contentComposer.publish.useMutation`.

### Streaming Route (section-08)

Article generation uses a streaming SSE route at `POST /api/content-composer/generate-stream` (implemented in section-08). `ContentComposerPanel` manages the `EventSource` / `AbortController` lifecycle for this stream. The stream is not a tRPC mutation — it is a direct `fetch` call with SSE parsing, matching the pattern in `apps/web/client/src/hooks/useAgencyStream.ts`.

Before implementing, read `useAgencyStream.ts` to understand the exact SSE parsing and `AbortController` pattern used in this codebase, and replicate it for the article generation stream.

### Wizard Step Components (section-06)

All five step components are pure presentation components. They receive `state: ComposerState`, `dispatch: React.Dispatch<ComposerAction>`, and callback props. `ContentComposerPanel` is solely responsible for:
- Rendering the correct step
- Passing the current state and dispatch
- Providing callbacks for actions that require async tRPC calls (e.g., generating a caption)

### MediaStudio.tsx Integration

`MediaStudio.tsx` currently uses:
```typescript
type MediaType = "image" | "video" | "audio";
const [activeTab, setActiveTab] = useState<MediaType>("image");
const [tabStates, setTabStates] = useState<Record<MediaType, TabState>>({ ... });
```

The article tab integration widens `MediaType` to include `"article"` and adds an `if (activeTab === "article")` branch to render `ContentComposerPanel` instead of the normal generation form. The `tabStates` record does **not** need an `"article"` key — `ContentComposerPanel` owns its own state internally.

---

## Component: `ContentComposerPanel`

**File:** `apps/web/client/src/components/media/ContentComposerPanel.tsx`

### Responsibilities

1. Own `useReducer` state for all wizard steps
2. Debounced autosave: `useEffect` watches `state.isDirty`; waits 2 seconds after last change; calls `saveDraft` mutation
3. Stream lifecycle management: opens/aborts the SSE stream for article generation
4. Navigation guard: blocks navigation while `state.isGenerating === true` (use Wouter's equivalent of `useBlocker` or a `beforeunload` / navigate guard)
5. Route/render the correct step or the draft list based on `state.currentStep`
6. Social caption auto-generation trigger: when `state.socialTargetId` is set for the first time and `captionIsManuallyEdited` is false, fire `generateSocialCaption` mutation

### Props Interface

`ContentComposerPanel` accepts no required props. All tRPC context and user context is pulled internally.

```typescript
export interface ContentComposerPanelProps {
  className?: string;
}
```

### Layout Structure

```
<div className="flex flex-col h-full">
  {/* Persistent unsaved-changes warning banner */}
  {autosaveWarning && <AutosaveWarningBanner ... />}

  {/* Step header: ComposerStepper (hidden when currentStep === 0) */}
  {state.currentStep > 0 && (
    <ComposerStepper currentStep={state.currentStep} dispatch={dispatch} />
  )}

  {/* Main content area */}
  {state.currentStep === 0 && (
    <ComposerDraftList
      onNewDraft={() => dispatch({ type: "START_NEW_DRAFT" })}
      onResumeDraft={handleResumeDraft}
      onDeleteDraft={handleDeleteDraft}
    />
  )}
  {state.currentStep === 1 && (
    <ArticleSettingsStep state={state} dispatch={dispatch} onGenerate={handleStartGeneration} />
  )}
  {state.currentStep === 2 && (
    <ArticlePreviewStep state={state} dispatch={dispatch} onStop={handleAbortGeneration} />
  )}
  {state.currentStep === 3 && (
    <MediaAttachmentStep state={state} dispatch={dispatch} />
  )}
  {state.currentStep === 4 && (
    <DestinationStep
      state={state}
      dispatch={dispatch}
      onGenerateCaption={handleGenerateCaption}
    />
  )}
  {state.currentStep === 5 && (
    <ComposerReviewStep
      state={state}
      dispatch={dispatch}
      onPublish={handlePublish}
    />
  )}

  {/* Draft saved indicator */}
  {state.lastSavedAt && !state.isDirty && (
    <DraftSavedIndicator savedAt={state.lastSavedAt} />
  )}
</div>
```

Note: `ComposerStepper` and all step components are imported from the `./composer/` subdirectory (implemented in section-06).

### Autosave Logic

```typescript
// Autosave effect — fires 2 seconds after isDirty becomes true
useEffect(() => {
  if (!state.isDirty || state.isSaving) return;

  const timer = setTimeout(async () => {
    dispatch({ type: "SAVE_START" });
    try {
      const result = await saveDraftMutation.mutateAsync({
        id: state.activeDraftId ?? undefined,
        topic: state.topic,
        executionSource: state.executionSource,
        skillId: state.skillId,
        agencyId: state.agencyId,
        requiresWebSearch: state.requiresWebSearch,
        requiresThinking: state.requiresThinking,
        articleBody: state.articleBody || undefined,
        attachmentIds: state.attachmentIds,
        destinationKind: state.destinationKind,
        docsSubKind: state.docsSubKind,
        docsTargetId: state.docsTargetId,
        blogTargetId: state.blogTargetId,
        socialPlatform: state.socialPlatform,
        socialTargetId: state.socialTargetId,
        socialCaption: state.socialCaption || undefined,
      });
      dispatch({
        type: "SAVE_SUCCESS",
        payload: {
          savedAt: new Date(result.updatedAt),
          draftId: state.activeDraftId === null ? result.id : undefined,
        },
      });
    } catch (err) {
      dispatch({ type: "SAVE_FAILURE" });
      toast.warning(t("mediaStudio.articleComposer.saveFailedRetrying"));
      // Retry once after 5 seconds — handled by the isDirty flag remaining true
    }
  }, AUTOSAVE_DEBOUNCE_MS);

  return () => clearTimeout(timer);
}, [state.isDirty, state.isSaving, state.activeDraftId /* stable refs only */]);
```

Constants:
```typescript
const AUTOSAVE_DEBOUNCE_MS = 2000;
```

The autosave `useEffect` dependency array must be carefully written to avoid infinite loops. Only depend on `state.isDirty` and `state.isSaving` — not on the whole `state` object. Capture the current state values needed for the save inside the callback (closure over `state` at effect time is acceptable since the timer fires 2s later and the closure captures the current values).

### Article Generation Stream Handler

```typescript
const abortControllerRef = useRef<AbortController | null>(null);

function handleStartGeneration() {
  if (!state.activeDraftId && !state.topic.trim()) return; // Guard: must have at least a topic

  dispatch({ type: "START_GENERATION" });

  const controller = new AbortController();
  abortControllerRef.current = controller;

  // Open SSE stream — matches pattern from useAgencyStream.ts
  fetchArticleStream(
    {
      draftId: state.activeDraftId,  // may be null on first generation; server accepts topic directly
      topic: state.topic,
      skillId: state.skillId,
      agencyId: state.agencyId,
      executionSource: state.executionSource,
      requiresWebSearch: state.requiresWebSearch,
      requiresThinking: state.requiresThinking,
    },
    controller.signal,
    (chunk) => dispatch({ type: "STREAMING_CHUNK", payload: chunk }),
    () => dispatch({ type: "GENERATION_COMPLETE" }),
    (error) => dispatch({ type: "GENERATION_ERROR", payload: error }),
  );
}

function handleAbortGeneration() {
  abortControllerRef.current?.abort();
  dispatch({ type: "ABORT_GENERATION" });
}
```

`fetchArticleStream` is a utility function defined in the same file (or in a sibling `articleStreamClient.ts` file if the implementation prefers separation). It wraps the `fetch` + SSE parsing — refer to `useAgencyStream.ts` for the exact ReadableStream / TextDecoder / `[DONE]` sentinel pattern used in the codebase.

Cleanup on unmount:
```typescript
useEffect(() => {
  return () => {
    abortControllerRef.current?.abort();
  };
}, []);
```

### Social Caption Auto-Generation

```typescript
const prevSocialTargetIdRef = useRef<number | null>(null);

useEffect(() => {
  const targetChanged = state.socialTargetId !== prevSocialTargetIdRef.current;
  prevSocialTargetIdRef.current = state.socialTargetId;

  if (
    state.socialTargetId !== null &&
    targetChanged &&
    !state.captionIsManuallyEdited &&
    state.socialPlatform
  ) {
    handleGenerateCaption();
  }
}, [state.socialTargetId, state.captionIsManuallyEdited, state.socialPlatform]);

async function handleGenerateCaption() {
  if (!state.activeDraftId || !state.socialPlatform) return;
  dispatch({ type: "SET_CAPTION_GENERATING", payload: true });
  try {
    const result = await generateCaptionMutation.mutateAsync({
      draftId: state.activeDraftId,
      platform: state.socialPlatform,
    });
    dispatch({ type: "CAPTION_GENERATED", payload: result.caption });
  } catch {
    dispatch({ type: "SET_CAPTION_GENERATING", payload: false });
    // Inline error shown in DestinationStep via state.isCaptionGenerating fallback
    toast.error(t("mediaStudio.articleComposer.captionGenerationFailed"));
  }
}
```

### Navigation Guard

Wouter does not have a built-in `useBlocker`. Use the `beforeunload` event for tab-close protection and a custom approach for in-app navigation:

```typescript
useEffect(() => {
  if (!state.isGenerating) return;

  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [state.isGenerating]);
```

For in-app navigation while `isGenerating` is true, render a confirmation dialog inline. The implementer should check if the codebase has an existing navigation-blocking pattern (check `ChatView.tsx` or `AgencyBuilder.tsx` for any `usePrompt` / location-change guards). If none exists, use a visible "You are leaving while generating" dialog triggered by monitoring location changes via Wouter's `useLocation` hook.

### Resume Draft

When the user clicks "Resume" on a draft in `ComposerDraftList`:

```typescript
async function handleResumeDraft(draftId: string) {
  try {
    const draft = await getDraftQuery.mutateAsync({ id: draftId });
    dispatch({
      type: "RESUME_DRAFT",
      payload: mapDraftToComposerState(draft),
    });
  } catch {
    toast.error(t("mediaStudio.articleComposer.loadDraftFailed"));
  }
}
```

`mapDraftToComposerState` is a helper that converts a `ContentComposerDraft` DB row to the `ComposerState` shape (specifically `currentStep` is set to `1` on resume so the user lands on the settings step, then can advance from there).

### Delete Draft

```typescript
async function handleDeleteDraft(draftId: string) {
  await deleteDraftMutation.mutateAsync({ id: draftId });
  listDraftsQuery.refetch();
}
```

### Publish Handler

```typescript
async function handlePublish() {
  if (!state.activeDraftId) return;
  dispatch({ type: "PUBLISH_START" });
  try {
    const result = await publishMutation.mutateAsync({ draftId: state.activeDraftId });
    dispatch({ type: "PUBLISH_SUCCESS" });
    toast.success(t("mediaStudio.articleComposer.publishSuccess"));
    // Optionally navigate to the published destination
  } catch (err: any) {
    const message = err?.message ?? t("mediaStudio.articleComposer.publishFailed");
    dispatch({ type: "PUBLISH_FAILURE", payload: message });
  }
}
```

---

## Component: `ComposerDraftList`

**File:** `apps/web/client/src/components/media/composer/ComposerDraftList.tsx`

### Purpose

Renders the initial view of the composer — a list of in-progress drafts for the current user, with "New Article" at the top. This is what the user sees when `state.currentStep === 0`.

### Props Interface

```typescript
export interface ComposerDraftListProps {
  onNewDraft: () => void;
  onResumeDraft: (draftId: string) => void;
  onDeleteDraft: (draftId: string) => void;
  className?: string;
}
```

### Data Loading

```typescript
const { data, isLoading, fetchNextPage, hasNextPage } =
  trpc.contentComposer.listDrafts.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined }
  );
```

Note: the tRPC router's `listDrafts` uses cursor pagination. Use `useInfiniteQuery` for "Load more" support. Flatten pages: `data?.pages.flatMap(p => p.drafts) ?? []`.

### Render Structure

```
<div>
  <div className="flex justify-between items-center mb-4">
    <h2>{t("mediaStudio.articleComposer.myDrafts")}</h2>
    <Button onClick={onNewDraft}>
      <PlusIcon /> {t("mediaStudio.articleComposer.newArticle")}
    </Button>
  </div>

  {isLoading && <Skeleton lines={3} />}

  {!isLoading && drafts.length === 0 && (
    <EmptyState
      icon={FileText}
      title={t("mediaStudio.articleComposer.noDrafts")}
      description={t("mediaStudio.articleComposer.noDraftsDescription")}
      action={<Button onClick={onNewDraft}>{t("mediaStudio.articleComposer.startFirstArticle")}</Button>}
    />
  )}

  {drafts.map(draft => (
    <DraftRow key={draft.id} draft={draft} onResume={onResumeDraft} onDelete={onDeleteDraft} />
  ))}

  {hasNextPage && (
    <Button variant="outline" onClick={() => fetchNextPage()}>
      {t("common.loadMore")}
    </Button>
  )}
</div>
```

### `DraftRow` (inline sub-component)

Each row shows:
- Topic (truncated at 80 chars) or `"(No topic)"` placeholder
- Status badge: `draft` | `published` | `failed`
- Destination kind badge (if set): Docs / Blog / Social
- Attachment count: `{n} attachments`
- `updatedAt` formatted as relative time (e.g., "2 hours ago") — use `date-fns` `formatDistanceToNow` (already in `apps/web/package.json`)
- "Resume" button → `onResumeDraft(draft.id)`
- "Delete" button (with confirmation popover) → `onDeleteDraft(draft.id)`

---

## MediaStudio.tsx Integration

**File:** `apps/web/client/src/pages/MediaStudio.tsx`

### Changes Required

This section makes the **minimum** additive changes to `MediaStudio.tsx`. The existing image/video/audio generation flow is not modified.

#### 1. Widen the `MediaType` type

```typescript
// Before:
type MediaType = "image" | "video" | "audio";

// After:
type MediaType = "image" | "video" | "audio" | "article";
```

#### 2. Add the import

```typescript
import { ContentComposerPanel } from "@/components/media/ContentComposerPanel";
```

Add near the other component imports from the `media/` directory.

#### 3. Add the "Article Composer" tab trigger

Inside the `<TabsList>` that already contains Image, Video, Audio:

```tsx
<TabsTrigger
  value="article"
  className="flex-1 gap-2 data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
>
  <FileText className="h-4 w-4" />
  {t("mediaStudio.tabs.article")}
</TabsTrigger>
```

`FileText` is already imported from `lucide-react` in MediaStudio.tsx (if not, add it to the existing lucide import block).

#### 4. Add the conditional rendering branch

Immediately before (or after) the `<DashboardSurface>` that renders the prompt input, add:

```tsx
{activeTab === "article" ? (
  <ContentComposerPanel className="min-h-[600px]" />
) : (
  /* existing generation form content — unchanged */
  <DashboardSurface className="space-y-4 p-4">
    {/* ALL existing content here, untouched */}
  </DashboardSurface>
)}
```

This wraps the existing generation form in the else-branch. The existing form code is not modified — it is simply wrapped in a conditional.

#### 5. Guard `tabStates` access

The existing code has destructuring like:
```typescript
const currentTabState = tabStates[activeTab];
```

Since `tabStates` does not have an `"article"` key, add a guard or provide a default:
```typescript
const currentTabState = activeTab !== "article"
  ? tabStates[activeTab as Exclude<MediaType, "article">]
  : null;
```

Any downstream code that uses `currentTabState` should already be inside the non-article render branch. Verify this by checking whether any of the derived variables (`prompt`, `enhancedPrompt`, `referenceImages`, etc.) are used outside the existing generation form block. If they are used in shared header/toolbar areas, add `activeTab !== "article"` guards around those usages.

#### 6. Suppress `tabStates` initializer TypeScript error

The `useState` initializer only includes `image`, `video`, `audio` keys. The `"article"` key is intentionally absent. TypeScript will complain if `MediaType` is widened without updating `tabStates`. The fix is:

```typescript
const [tabStates, setTabStates] = useState<Record<Exclude<MediaType, "article">, TabState>>(() => ({
  image: createDefaultTabState("image"),
  video: createDefaultTabState("video"),
  audio: createDefaultTabState("audio"),
}));
```

This uses `Exclude<MediaType, "article">` so the record type remains valid without an `"article"` key.

---

## i18n Keys

Add to `apps/web/client/src/lib/i18n/locales/en.ts` under `mediaStudio`:

```typescript
// Inside mediaStudio object:
tabs: {
  // existing: image, video, audio
  article: "Article Composer",
},
articleComposer: {
  myDrafts: "My Article Drafts",
  newArticle: "New Article",
  noDrafts: "No drafts yet",
  noDraftsDescription: "Start writing your first article — choose a topic, generate content, and publish.",
  startFirstArticle: "Start your first article",
  draftSaved: "Draft saved",
  saveFailedRetrying: "Draft save failed — retrying…",
  saveFailed: "Unable to save draft. Your changes may be lost.",
  loadDraftFailed: "Could not load draft. Please try again.",
  publishSuccess: "Published successfully!",
  publishFailed: "Publish failed. Please try again.",
  captionGenerationFailed: "Caption generation failed — you can write one manually.",
  generationStopAndLeave: "Article is currently generating. Stop generation and leave?",
  stopAndLeaveConfirm: "Stop and Leave",
  cancel: "Cancel",
  resumeDraft: "Resume",
  deleteDraft: "Delete",
  deleteDraftConfirm: "Delete this draft?",
  deleteDraftBody: "This action cannot be undone.",
  statusDraft: "Draft",
  statusPublished: "Published",
  statusFailed: "Failed",
  noTopic: "(No topic)",
  attachmentCount_one: "{{count}} attachment",
  attachmentCount_other: "{{count}} attachments",
  loadMore: "Load more",
},
```

Add corresponding Thai translations to `apps/web/client/src/lib/i18n/locales/th.ts`. The Thai translations may be placeholder strings for Phase 1; the implementer should add reasonable Thai values following the existing pattern in `th.ts`.

---

## TDD: Tests to Write First

### File: `apps/web/client/src/components/media/__tests__/ContentComposerPanel.test.tsx`

**Testing stack:** Vitest + `@testing-library/react` + `@testing-library/user-event` + jsdom

**Mock requirements:**

```typescript
// vi.hoisted()
const mockSaveDraft = vi.fn();
const mockDeleteDraft = vi.fn();
const mockGenerateCaption = vi.fn();
const mockPublish = vi.fn();
const mockListDrafts = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    contentComposer: {
      listDrafts: {
        useInfiniteQuery: mockListDrafts,
      },
      saveDraft: {
        useMutation: () => ({ mutateAsync: mockSaveDraft, isPending: false }),
      },
      deleteDraft: {
        useMutation: () => ({ mutateAsync: mockDeleteDraft }),
      },
      generateSocialCaption: {
        useMutation: () => ({ mutateAsync: mockGenerateCaption }),
      },
      publish: {
        useMutation: () => ({ mutateAsync: mockPublish }),
      },
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, role: "admin", currentTenantId: "t1" } }),
}));
```

Also mock all wizard step components with data-testid stubs so the tests are isolated:

```typescript
vi.mock("@/components/media/composer/ArticleSettingsStep", () => ({
  ArticleSettingsStep: ({ state, onGenerate }: any) => (
    <div data-testid="step-settings">
      <span data-testid="topic-value">{state.topic}</span>
      <button onClick={onGenerate}>Generate</button>
    </div>
  ),
}));
// ...similar stubs for ArticlePreviewStep, MediaAttachmentStep, DestinationStep, ComposerReviewStep, ComposerStepper, ComposerDraftList
```

### Test Stubs

```typescript
// --- Initial render ---
// Test: renders ComposerDraftList (step 0) on initial render
// Test: does NOT render ComposerStepper when currentStep === 0

// --- Draft list interaction ---
// Test: "New Article" dispatches START_NEW_DRAFT and renders ArticleSettingsStep (step 1)
// Test: ComposerStepper is rendered when currentStep > 0

// --- Autosave ---
// Test: setting topic triggers autosave after 2-second debounce (use vi.useFakeTimers)
// Test: autosave calls saveDraft mutation with correct fields
// Test: autosave creates new draft when activeDraftId is null (saveDraft called without id)
// Test: DRAFT_CREATED action sets activeDraftId after first save (mocked saveDraft returns { id: "d1", updatedAt: "..." })
// Test: autosave updates existing draft when activeDraftId is set (saveDraft called with id)
// Test: autosave failure shows warning toast (mock saveDraft to reject)
// Test: "Draft saved" indicator visible after successful save

// --- Generation stream ---
// Test: handleStartGeneration dispatches START_GENERATION
// Test: stream chunks dispatch STREAMING_CHUNK (mock fetch/ReadableStream)
// Test: stream completion dispatches GENERATION_COMPLETE
// Test: stream abort dispatches ABORT_GENERATION

// --- Navigation guard ---
// Test: window beforeunload listener is added when isGenerating = true
// Test: window beforeunload listener is removed when isGenerating becomes false

// --- Social caption auto-generation ---
// Test: setting socialTargetId triggers handleGenerateCaption when captionIsManuallyEdited = false
// Test: setting socialTargetId does NOT trigger caption generation when captionIsManuallyEdited = true
// Test: caption generation failure shows error toast

// --- Step rendering ---
// Test: currentStep 1 renders ArticleSettingsStep
// Test: currentStep 2 renders ArticlePreviewStep
// Test: currentStep 3 renders MediaAttachmentStep
// Test: currentStep 4 renders DestinationStep
// Test: currentStep 5 renders ComposerReviewStep

// --- Admin vs user role ---
// Test: admin user — ContentComposerPanel renders without restriction
// Test: user role — ContentComposerPanel renders without restriction (role gating is in DestinationStep, not here)

// --- Resume draft ---
// Test: handleResumeDraft loads draft via getDraft and dispatches RESUME_DRAFT
// Test: getDraft failure shows toast and leaves currentStep unchanged

// --- Publish ---
// Test: handlePublish dispatches PUBLISH_START
// Test: successful publish dispatches PUBLISH_SUCCESS and shows success toast
// Test: failed publish dispatches PUBLISH_FAILURE with error message
```

### File: `apps/web/client/src/pages/__tests__/MediaStudio.articleComposer.test.tsx`

```typescript
// Test: "Article Composer" tab is visible in the tab bar
// Test: clicking "Article Composer" tab renders ContentComposerPanel (mocked)
// Test: switching back to "Image" tab renders the image generation form (not ContentComposerPanel)
// Test: switching to "Video" tab after "Article" tab renders video form
// Test: article tab does not mount the prompt generation form
// Test: image tab state is preserved when switching to article and back (prompt text unchanged)
// Test: video tab state is preserved when switching to article and back
```

---

## Implementation Checklist

- [ ] Create `apps/web/client/src/components/media/ContentComposerPanel.tsx`
  - [ ] `useReducer(composerReducer, initialComposerState)` at top level
  - [ ] Autosave `useEffect` with 2-second debounce and `isSaving` guard
  - [ ] Stream lifecycle via `AbortController` ref + `fetchArticleStream` helper
  - [ ] Navigation guard via `beforeunload` event listener
  - [ ] Social caption auto-gen `useEffect` watching `socialTargetId`
  - [ ] Conditional rendering of draft list vs. step components
  - [ ] All tRPC mutations declared via `useMutation`
  - [ ] `mapDraftToComposerState` helper function
- [ ] Create `apps/web/client/src/components/media/composer/ComposerDraftList.tsx`
  - [ ] `useInfiniteQuery` for `listDrafts`
  - [ ] Empty state when no drafts exist
  - [ ] "New Article" button
  - [ ] `DraftRow` sub-component with Resume + Delete
  - [ ] Relative timestamps using `date-fns`
- [ ] Modify `apps/web/client/src/pages/MediaStudio.tsx`
  - [ ] Widen `MediaType` to include `"article"`
  - [ ] Update `tabStates` type to `Record<Exclude<MediaType, "article">, TabState>`
  - [ ] Add `FileText` icon to lucide imports (if not already present)
  - [ ] Add "Article Composer" `<TabsTrigger>` to the tab bar
  - [ ] Add `activeTab === "article"` branch to render `<ContentComposerPanel />`
  - [ ] Guard `currentTabState` access with `activeTab !== "article"` check
  - [ ] Add i18n key `mediaStudio.tabs.article` usage
- [ ] Add i18n keys to `en.ts` and `th.ts`
- [ ] Create both test files with stubs before writing any implementation
- [ ] Run `pnpm check` — no new TypeScript errors
- [ ] Run `pnpm test -- --testPathPattern="ContentComposerPanel|MediaStudio.articleComposer"` — all stubs collected

---

## Consistency Constraints from Neighboring Sections

- **section-02 (composerReducer):** `ContentComposerPanel` must not manage any local `useState` that duplicates a `ComposerState` field. The reducer is the single source of truth. Exception: `abortControllerRef` (a ref, not state) and `prevSocialTargetIdRef` (a ref used for change detection).

- **section-03 (tRPC CRUD):** `saveDraft` input shape and `listDrafts` output shape are defined there. Do not redefine Zod schemas here — use the tRPC client types inferred from the router.

- **section-06 (wizard steps):** Step components are pure presentational. `ContentComposerPanel` passes `state` and `dispatch` to each step. Steps do not call any tRPC procedures directly (except `DestinationStep` which fires the social pages query, and `MediaAttachmentStep` which uses `LibraryFilePicker` — both of those are reads, not mutations).

- **section-08 (streaming route):** The SSE stream URL is `POST /api/content-composer/generate-stream`. The request body shape is `{ draftId?: string | null, topic: string, skillId?: string | null, agencyId?: string | null, executionSource: "skill" | "agency", requiresWebSearch: boolean, requiresThinking: boolean }`. The stream sends `data: {chunk}\n\n` SSE events and ends with `data: [DONE]\n\n`. The `fetchArticleStream` helper in `ContentComposerPanel` must parse this format.

- **section-09 (publish):** The `publish` mutation is called via `handlePublish` in `ContentComposerPanel` and delegated from `ComposerReviewStep`'s "Publish Now" button via an `onPublish` callback prop. The review step does not directly call `useMutation` — it calls the callback.

---

## What This Section Does NOT Cover

- The wizard step component implementations — owned by section-06
- The `composerReducer` and `ComposerState` type definitions — owned by section-02
- The `generateArticle` / `generateSocialCaption` streaming route — owned by section-08
- The `publish` tRPC procedure server logic — owned by section-09
- Integration tests across the full draft lifecycle — owned by section-10