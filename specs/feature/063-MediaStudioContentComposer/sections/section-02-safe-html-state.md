I now have all the context needed to write the section. Here is the complete markdown for `section-02-safe-html-state.md`:

---

# Section 02: SafeHtml Component + Composer Reducer State

**Section ID:** `section-02-safe-html-state`
**Batch:** 1 — no dependencies, can be implemented in parallel with section-01-schema
**Blocks:** section-04-skill-agency-selector, section-05-social-pickers, section-06-wizard-steps

---

## Overview

This section delivers two independent, self-contained deliverables:

1. **`SafeHtml` React component** — a memoized DOMPurify wrapper with two sanitization profiles (`"article"` and `"social"`), a URL-scheme enforcement hook, and a forbidden-scheme attribute stripper.
2. **`composerReducer`** — the pure `useReducer` reducer function and its full `ComposerState` + `ComposerAction` type definitions for the Content Composer wizard.

Neither deliverable has runtime dependencies on anything else in feature 063. They are utility-level primitives consumed by every other section in this feature.

---

## Prerequisites

### Package Availability

`dompurify` and `@types/dompurify` are **already present** in `apps/web/package.json` (versions `^3.3.1` and `^3.2.0` respectively). No new install is required.

### Existing Pattern Reference

The existing `SafeMarkdown` component at `apps/web/client/src/components/chat/SafeMarkdown.tsx` already uses DOMPurify. Review it before implementing `SafeHtml` to ensure consistent DOMPurify configuration patterns (allowed-tags array, forbidden-tags list, `ALLOW_DATA_ATTR: false`).

---

## Deliverable 1: SafeHtml Component

### File

`apps/web/client/src/components/ui/SafeHtml.tsx`

### Purpose

`SafeHtml` is the **only** permitted path for rendering untrusted HTML in the Article Composer. Direct use of `dangerouslySetInnerHTML` anywhere in the `components/media/` subtree is forbidden. When implementing any step component that needs to display article HTML, it must import and use this component.

### Props Interface

```typescript
interface SafeHtmlProps {
  html: string;
  profile?: "article" | "social";   // default: "article"
  className?: string;
}
```

### Sanitization Profiles

**Article profile** — for rendering generated article body content:

| Allowed tags | h1, h2, h3, h4, p, ul, ol, li, blockquote, pre, code, a, b, i, em, strong, br, img |
|---|---|
| Allowed attributes on `<a>` | `href`, `title` only |
| Allowed attributes on `<img>` | `src`, `alt` only |
| Forbidden tags | `script`, `style`, `iframe`, `form`, `input`, `object`, `embed` |
| Forbidden attributes | all event handlers (`onclick`, `onerror`, `onload`, etc.) |

**Social profile** — for rendering social captions and short snippets:

| Allowed tags | `b`, `i`, `em`, `strong`, `a`, `p`, `br` |
|---|---|
| Allowed attributes on `<a>` | `href` only |
| Forbidden tags | Everything not in the allowed list including `h1`–`h4`, `img` |

### URL Scheme Hook

Register a DOMPurify `beforeSanitizeAttributes` hook to enforce URL scheme allowlisting on `href` and `src` attributes. The hook logic:

- Extract the attribute value
- If the scheme does NOT match `/^https?:\/\/|^mailto:|^tel:/i`, remove the attribute entirely
- This catches `javascript:`, `data:`, `vbscript:`, and any other non-allowlisted scheme

The hook must be registered once per `SafeHtml` instance via `DOMPurify.addHook(...)` inside `useMemo`. To avoid hook accumulation across re-renders, call `DOMPurify.removeAllHooks()` at the start of the memo (before re-adding) — or use a module-level singleton pattern with a flag. The implementer should follow the same guard pattern as `SafeMarkdown.tsx` if one exists; otherwise the `removeAllHooks` pattern is acceptable.

### Memoization

The component must be memoized: `DOMPurify.sanitize()` should only be called when `html` or `profile` changes. Use `useMemo` to compute the sanitized string, then render via `dangerouslySetInnerHTML={{ __html: sanitized }}` on a `<div>` that forwards `className`.

```typescript
// Rough shape — do NOT copy verbatim; write from plan spec
export const SafeHtml = memo(function SafeHtml({ html, profile = "article", className }: SafeHtmlProps) {
  const sanitized = useMemo(() => {
    // 1. register URL hook
    // 2. call DOMPurify.sanitize with profile-specific config
    // 3. return sanitized string
  }, [html, profile]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized }} />;
});
```

---

## Deliverable 2: Composer Reducer

### Files

- `apps/web/client/src/components/media/composerReducer.ts` — state type, action type, initial state, reducer function
- This file exports only pure TypeScript — no React imports, no JSX, no tRPC calls.

### State Shape

```typescript
export interface ComposerState {
  // Navigation
  activeDraftId: string | null;
  currentStep: 0 | 1 | 2 | 3 | 4 | 5;   // 0 = draft list; 1-5 = wizard steps

  // Step 1 — Topic & Settings
  topic: string;
  executionSource: "skill" | "agency";
  skillId: string | null;
  agencyId: string | null;
  agencyName: string | null;  // display name of the selected agency (for Review step)
  requiresWebSearch: boolean;
  requiresThinking: boolean;
  showComplexityBanner: boolean;

  // Step 2 — Generated Content
  articleBody: string;
  isGenerating: boolean;
  generationError: string | null;

  // Step 3 — Media Attachment
  attachmentIds: number[];

  // Step 4 — Destination
  destinationKind: "docs" | "blog" | "social" | null;
  docsSubKind: "doc_page" | "cms_page" | null;
  docsTargetId: number | null;
  blogTargetId: number | null;
  socialPlatform: "youtube" | "facebook" | "tiktok" | "upload_post" | null;
  socialTargetId: number | null;
  socialCaption: string;
  captionIsManuallyEdited: boolean;
  isCaptionGenerating: boolean;

  // Draft sync
  lastSavedAt: Date | null;
  isSaving: boolean;
  isDirty: boolean;

  // Publish
  isPublishing: boolean;
  publishError: string | null;
}
```

### Complexity Detection

Define a module-level constant (not inline per-render):

```typescript
const COMPLEXITY_KEYWORDS = [
  "research", "compare", "analyze", "comprehensive",
  "multi-step", "in-depth", "detailed", "review",
  "versus", "vs", "pros and cons",
];
```

The `showComplexityBanner` field is computed inside the reducer on every `SET_TOPIC` action:

```typescript
// Inside the SET_TOPIC case:
const lower = action.payload.toLowerCase();
const isComplex =
  action.payload.length > 150 ||
  COMPLEXITY_KEYWORDS.some((kw) => lower.includes(kw));
```

`showComplexityBanner` is only set to `true` automatically. It is set to `false` by the explicit `DISMISS_COMPLEXITY_BANNER` action. It does NOT reset automatically when the topic is cleared.

### Initial State

```typescript
export const initialComposerState: ComposerState = {
  activeDraftId: null,
  currentStep: 0,
  topic: "",
  executionSource: "skill",
  skillId: null,
  agencyId: null,
  agencyName: null,
  requiresWebSearch: false,
  requiresThinking: false,
  showComplexityBanner: false,
  articleBody: "",
  isGenerating: false,
  generationError: null,
  attachmentIds: [],
  destinationKind: null,
  docsSubKind: null,
  docsTargetId: null,
  blogTargetId: null,
  socialPlatform: null,
  socialTargetId: null,
  socialCaption: "",
  captionIsManuallyEdited: false,
  isCaptionGenerating: false,
  lastSavedAt: null,
  isSaving: false,
  isDirty: false,
  isPublishing: false,
  publishError: null,
};
```

### Action Types

```typescript
export type ComposerAction =
  // Navigation
  | { type: "START_NEW_DRAFT" }
  | { type: "DRAFT_CREATED"; payload: string }           // id of new draft
  | { type: "RESUME_DRAFT"; payload: ComposerState }     // full state from DB
  | { type: "GO_TO_STEP"; payload: 0 | 1 | 2 | 3 | 4 | 5 }

  // Step 1
  | { type: "SET_TOPIC"; payload: string }
  | { type: "SET_EXECUTION_SOURCE"; payload: "skill" | "agency" }
  | { type: "SET_SKILL"; payload: string | null }
  | { type: "SET_AGENCY"; payload: { id: string; name: string } | null }  // stores id + display name
  | { type: "TOGGLE_WEB_SEARCH" }
  | { type: "TOGGLE_THINKING" }
  | { type: "DISMISS_COMPLEXITY_BANNER" }

  // Step 2 — Generation
  | { type: "START_GENERATION" }
  | { type: "STREAMING_CHUNK"; payload: string }
  | { type: "GENERATION_COMPLETE" }
  | { type: "GENERATION_ERROR"; payload: string }
  | { type: "ABORT_GENERATION" }
  | { type: "SET_ARTICLE_BODY"; payload: string }        // for manual edits

  // Step 3
  | { type: "ADD_ATTACHMENT"; payload: number }
  | { type: "REMOVE_ATTACHMENT"; payload: number }

  // Step 4
  | { type: "SET_DESTINATION_KIND"; payload: "docs" | "blog" | "social" | null }
  | { type: "SET_DOCS_SUB_KIND"; payload: "doc_page" | "cms_page" | null }
  | { type: "SET_DOCS_TARGET"; payload: number | null }
  | { type: "SET_BLOG_TARGET"; payload: number | null }
  | { type: "SET_SOCIAL_PLATFORM"; payload: "youtube" | "facebook" | "tiktok" | "upload_post" | null }
  | { type: "SET_SOCIAL_TARGET"; payload: number | null }
  | { type: "SET_SOCIAL_CAPTION"; payload: string }      // sets captionIsManuallyEdited = true
  | { type: "CAPTION_GENERATED"; payload: string }       // sets captionIsManuallyEdited = false
  | { type: "SET_CAPTION_GENERATING"; payload: boolean }

  // Draft sync
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; payload: { savedAt: Date; draftId?: string } }
  | { type: "SAVE_FAILURE" }

  // Publish
  | { type: "PUBLISH_START" }
  | { type: "PUBLISH_SUCCESS" }
  | { type: "PUBLISH_FAILURE"; payload: string }

  // Reset
  | { type: "RESET" };
```

### Reducer Behavior Notes

Key behavioral constraints that tests will verify:

- `START_NEW_DRAFT`: sets `currentStep: 1`, `activeDraftId: null`. Does NOT pre-create a DB row. The draft is created lazily on the first `SAVE_SUCCESS` with a new `draftId` payload.
- `DRAFT_CREATED(id)`: sets `activeDraftId: id` (called after first successful `saveDraft` returns a new id).
- `SET_TOPIC`: updates `topic`, sets `isDirty: true`, recomputes `showComplexityBanner`.
- `STREAMING_CHUNK`: **appends** `payload` to existing `articleBody` (does not replace).
- `GENERATION_COMPLETE`: sets `isGenerating: false`, `isDirty: true`.
- `GENERATION_ERROR`: sets `isGenerating: false`, `generationError: payload`. Does NOT clear `articleBody` (partial content is retained).
- `ABORT_GENERATION`: sets `isGenerating: false`. Does NOT clear `articleBody`.
- `ADD_ATTACHMENT` when `attachmentIds.length >= 6`: no-op (silently ignored; the UI layer shows the error toast separately).
- `SET_SOCIAL_CAPTION`: updates `socialCaption`, sets `captionIsManuallyEdited: true`, `isDirty: true`.
- `CAPTION_GENERATED`: updates `socialCaption`, sets `captionIsManuallyEdited: false`, `isDirty: true`.
- `SET_AGENCY` with `{ id, name }` payload: sets `agencyId: id`, `agencyName: name`, `isDirty: true`. With `null` payload: clears both to null.
- `SET_SOCIAL_PLATFORM`: sets `socialPlatform: payload`. When the platform changes (new value differs from current), also clears `socialTargetId: null`, `socialCaption: ""`, `captionIsManuallyEdited: false`, `isDirty: true`. This prevents stale account state when the user switches platforms.
- `SAVE_SUCCESS` with `draftId` payload: sets `activeDraftId: draftId` if `activeDraftId` is currently null (first-save case), plus sets `isSaving: false`, `isDirty: false`, `lastSavedAt: payload.savedAt`.
- `SAVE_FAILURE`: sets `isSaving: false`. `isDirty` remains `true`.
- `RESET`: returns `initialComposerState`.

---

## Tests

### SafeHtml Tests

**File:** `apps/web/client/src/components/ui/__tests__/SafeHtml.test.tsx`

**Testing stack:** Vitest + jsdom + `@testing-library/react`

Note: DOMPurify requires a DOM environment. Vitest's `jsdom` environment provides this. Add `// @vitest-environment jsdom` at the top of the test file if not set globally.

Stub list (implement as failing stubs first, then fill in):

```typescript
// Test: renders plain text content without modification
// Test: renders allowed tags in article profile — h2, p, strong
// Test: renders <a href="https://..."> passthrough in article profile
// Test: renders <a href="mailto:..."> passthrough in article profile
// Test: renders <a href="tel:..."> passthrough in article profile
// Test: strips <script> tags in article profile (tag and contents removed)
// Test: strips <iframe> tags in article profile
// Test: strips <style> tags in article profile
// Test: strips onclick attribute in article profile
// Test: strips style attribute in article profile
// Test: strips javascript: href — entire href attribute is removed
// Test: strips data: href — entire href attribute is removed
// Test: strips vbscript: href — entire href attribute is removed
// Test: social profile strips <h2> (not in social allowed list)
// Test: social profile strips <img> tags
// Test: social profile allows <strong>, <em>, <a href="https://...">
// Test: renders empty string input without throwing
// Test: className prop forwarded to container div
// Test: memoizes — DOMPurify.sanitize not called again when html+profile unchanged
//        (spy on DOMPurify.sanitize, render twice with same props, assert call count === 1)
// Test: DOMPurify.sanitize called again when html changes
// Test: DOMPurify.sanitize called again when profile changes
```

### Composer Reducer Tests

**File:** `apps/web/client/src/components/media/__tests__/composerReducer.test.ts`

**Testing stack:** Vitest only (pure function — no React, no DOM)

Stub list:

```typescript
// Test: initialComposerState has currentStep = 0, activeDraftId = null
// Test: initialComposerState has executionSource = "skill"
// Test: initialComposerState has requiresWebSearch = false, requiresThinking = false
// Test: START_NEW_DRAFT → currentStep = 1, activeDraftId = null
// Test: DRAFT_CREATED(id) → activeDraftId = "draft-abc"
// Test: SET_TOPIC → updates topic, isDirty = true
// Test: SET_TOPIC with complexity keyword "research" → showComplexityBanner = true
// Test: SET_TOPIC with topic length > 150 chars → showComplexityBanner = true
// Test: SET_TOPIC without keywords and length <= 150 → showComplexityBanner = false
// Test: DISMISS_COMPLEXITY_BANNER → showComplexityBanner = false
// Test: TOGGLE_WEB_SEARCH → flips requiresWebSearch, sets isDirty = true
// Test: TOGGLE_THINKING → flips requiresThinking, sets isDirty = true
// Test: SET_EXECUTION_SOURCE "agency" → executionSource = "agency", isDirty = true
// Test: START_GENERATION → isGenerating = true, generationError = null
// Test: STREAMING_CHUNK → appends chunk to articleBody (does not replace)
// Test: STREAMING_CHUNK applied twice → articleBody = first + second chunk concatenated
// Test: GENERATION_COMPLETE → isGenerating = false, isDirty = true
// Test: GENERATION_COMPLETE does not clear articleBody
// Test: GENERATION_ERROR → isGenerating = false, generationError = "Network error"
// Test: GENERATION_ERROR does not clear partial articleBody
// Test: ABORT_GENERATION → isGenerating = false
// Test: ABORT_GENERATION does not clear articleBody
// Test: SET_ARTICLE_BODY → replaces articleBody, isDirty = true
// Test: ADD_ATTACHMENT → adds id to attachmentIds
// Test: ADD_ATTACHMENT when attachmentIds.length === 6 → no-op (length still 6)
// Test: REMOVE_ATTACHMENT → removes id from attachmentIds
// Test: REMOVE_ATTACHMENT with id not in list → no change
// Test: SET_DESTINATION_KIND "blog" → destinationKind = "blog", isDirty = true
// Test: SET_SOCIAL_PLATFORM "youtube" → socialPlatform = "youtube", isDirty = true
// Test: SET_SOCIAL_CAPTION → socialCaption updated, captionIsManuallyEdited = true, isDirty = true
// Test: CAPTION_GENERATED → socialCaption updated, captionIsManuallyEdited = false, isDirty = true
// Test: SET_CAPTION_GENERATING true → isCaptionGenerating = true
// Test: SAVE_START → isSaving = true
// Test: SAVE_SUCCESS with no draftId → isSaving = false, isDirty = false, lastSavedAt updated
// Test: SAVE_SUCCESS with draftId when activeDraftId is null → activeDraftId set to draftId
// Test: SAVE_SUCCESS with draftId when activeDraftId already set → activeDraftId unchanged
// Test: SAVE_FAILURE → isSaving = false, isDirty = true (remains dirty)
// Test: GO_TO_STEP 3 → currentStep = 3
// Test: PUBLISH_START → isPublishing = true, publishError = null
// Test: PUBLISH_SUCCESS → isPublishing = false
// Test: PUBLISH_FAILURE → isPublishing = false, publishError = "Forbidden"
// Test: RESET → returns initialComposerState
```

---

## Implementation Checklist

- [ ] Create `apps/web/client/src/components/ui/SafeHtml.tsx` with both profiles
- [ ] Create `apps/web/client/src/components/ui/__tests__/SafeHtml.test.tsx` with all stubs
- [ ] Create `apps/web/client/src/components/media/composerReducer.ts` with state, actions, initial state, reducer
- [ ] Create `apps/web/client/src/components/media/__tests__/composerReducer.test.ts` with all stubs
- [ ] Verify `dompurify` import in `SafeHtml.tsx` resolves (package already in `package.json`)
- [ ] `SafeHtml.tsx` must NOT use `dangerouslySetInnerHTML` directly on its exported props — the sanitization must happen inside the component before the inner `div` renders
- [ ] `composerReducer.ts` must have zero React/JSX imports — pure TypeScript only
- [ ] Run `pnpm test -- --testPathPattern="SafeHtml|composerReducer"` and confirm tests are collected (they will fail until implementation is filled in — that is expected at stub stage)

---

## Consistency Notes for Neighboring Sections

Sections that consume these deliverables must follow these constraints:

- **section-04 (SkillAgencySelector):** imports `ComposerAction` from `composerReducer.ts`; dispatches `SET_EXECUTION_SOURCE`, `SET_SKILL`, `SET_AGENCY`, `DISMISS_COMPLEXITY_BANNER`.
- **section-05 (SocialPlatformPicker / SocialAccountPicker):** dispatches `SET_SOCIAL_PLATFORM`, `SET_SOCIAL_TARGET`.
- **section-06 (Wizard Steps):** `ArticlePreviewStep` renders article HTML exclusively through `<SafeHtml profile="article" />`. `DestinationStep` uses `SET_SOCIAL_CAPTION` and `CAPTION_GENERATED` actions.
- **section-07 (ContentComposerPanel):** imports `initialComposerState` and `composerReducer`; passes `state` and `dispatch` as props to each step component.

No other section may import `ComposerState` from anywhere other than `composerReducer.ts`. This is the single source of truth for the state shape.
