---
name: Feature 044 — Generate Layout with AI (Review Pass 1, 2026-03-15)
description: Review findings for the AI-powered layout generation feature (generateLayoutFromNote / generateLayoutFromDeckNote)
type: project
---

# Feature 044: Generate Layout with AI — Review Findings

**Why:** Captured for future reference in case of regressions or follow-on work on the presentation AI pipeline.
**How to apply:** Flag these in any future PR that touches the layout-from-note path.

## CRITICAL

- **Redis key mismatch — deck-note progress is permanently invisible**: `generateLayoutFromDeckNoteAsync` writes progress to `ai_draft:progress:{taskId}` (colon-separated) but `getDraftProgress` reads from `ai_draft_progress:{taskId}` (underscore-separated). The router's fire-and-forget catch block also uses `ai_draft:progress:{taskId}`. The UI will poll forever and report "not found" for every deck-level generation. The fix: change the key in the service to `ai_draft_progress:{taskId}`.
  - Service write: `aiPresentationService.ts:13083`
  - Router catch write: `presentation.ts:768`
  - getDraftProgress read: `presentation.ts:797`

## HIGH

- **Lock key mismatch — `getDraftProgress` stall detection is broken for deck-note tasks**: The service acquires lock `ai_draft:lock:deck:{deckId}` but `getDraftProgress` checks `ai_draft_lock:{userId}`. `workerActive` will always be false for deck-note tasks, so the stall-detection logic (`finalizeStalledDraftProgress`) can never detect or recover a stalled deck-note job.
  - Service lock: `aiPresentationService.ts:13084`
  - getDraftProgress lockKey: `presentation.ts:798`

- **Missing credit pre-check before LLM call in single-slide path**: `generateLayoutFromNoteAsync` calls the LLM unconditionally, then deducts credits afterward. An insufficient-credit user can trigger a full LLM + image generation call at no cost. The existing `generateAIDraft` uses `hasEnoughCredits` before starting. The same guard should be applied here.
  - Service deduction after LLM: `aiPresentationService.ts:12817–12831`

- **Memory leak — poll interval not cleared on component unmount**: `deckLayoutGenPollRef` is used to track the active `setInterval`, and it is correctly replaced when a second generation starts, but there is no `useEffect` cleanup that calls `clearInterval(deckLayoutGenPollRef.current)` on unmount. If the user navigates away during a deck generation, the interval fires indefinitely (every 2 seconds, making tRPC calls, until the 5-minute safety timeout fires).
  - Ref declared: `PresentationEditor.tsx:2509`
  - No unmount cleanup found in any useEffect return.

## MEDIUM

- **`generateLayoutFromNote` router input schema duplicates `GenerateLayoutFromNoteInputSchema`**: The router at `presentation.ts:672–678` defines its own inline Zod schema that is a near-copy of the exported `GenerateLayoutFromNoteInputSchema` in `aiTypes.ts`. If one is updated, the other drifts. The router should import and use the shared schema directly (pattern used by `generateAIDraft`).

- **No `numSlides` upper bound enforcement on the client side before mutation**: `deckLayoutGenSlideCount` input uses `parseInt` without a NaN/range guard before sending. If `parseInt` returns `NaN`, the condition `numSlides && numSlides > 0` silently falls back to auto — but if it returns a number outside [1, 30] due to manual DOM manipulation, the Zod schema on the server will reject it with a tRPC validation error that is shown raw to the user.

- **`generateLayoutFromNote` does not save slide notes before calling the backend**: The handler checks `slideNoteDirty` and tries `handleSaveSlide({ silent: true })`, but if that save fails it exits with a toast. If the user added notes to the draft textarea but the auto-save has not yet flushed, the backend generates a layout from the *previously saved* (possibly empty) notes. The failure path is handled, but the success path with stale notes is not. (`PresentationEditor.tsx:6572–6578`)

## LOW

- **`aiDesign.source` is hardcoded to `"draft-with-ai"` in both new functions**: The `source` field in `aiDesign` metadata is `"draft-with-ai"` for both `generateLayoutFromNoteAsync` and `generateLayoutFromDeckNoteAsync`. Future log queries filtering by `source` won't distinguish between the original draft-with-ai path and the new layout-from-note path. Consider `"layout-from-note"` and `"layout-from-deck-note"`.
  - `aiPresentationService.ts:13017` and `aiPresentationService.ts:13295`

- **Skill `input.schema.json` is unused by the tRPC mutations**: The `presentation-layout-designer` skill has an `input.schema.json` with a `content` required field, but the actual execution happens through `generateLayoutFromNote` / `generateLayoutFromDeckNote` tRPC mutations that take `deckId`/`slideId`, not free-form `content`. The skill as registered can only be invoked via the generic chat skill execution path, where no `deckId`/`slideId` is available. The skill and its schema describe a standalone LLM-only flow that has no code wiring to the new tRPC procedures.

- **Safety `setTimeout` for polling (5 min) is not tracked for cleanup**: The `setTimeout(() => clearInterval(pollId), 300_000)` call at `PresentationEditor.tsx:6721` is fire-and-forget. If the component unmounts before 5 minutes, the `setTimeout` callback fires and silently calls `clearInterval` on a potentially re-used `pollId`. Low risk in practice (NodeJS recycles timer IDs rarely) but the ref should be cleaned up in the same unmount effect.
