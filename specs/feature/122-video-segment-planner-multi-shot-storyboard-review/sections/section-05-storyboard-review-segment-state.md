# Section 05: Storyboard Review Segment State

## Goal

Make Storyboard Review load, display, regenerate, and repair video prompts from the shared segment state. Existing per-shot reviews must continue working through synthesized per-shot plans.

## Depends On

- Section 01 shared planner.
- Section 02 prompt builder.
- Section 03 Marketplace handoff.

## Files To Modify

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/lib/storyboardReviewWorkspace.ts`
- server router/service files for saved Storyboard Review data, including `regenerateVideoSegmentPrompt`
- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts`
- `apps/web/server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts`
- `apps/web/shared/hyperframes/__tests__/storyboardReviewState.test.ts` if shared review-state helpers are extended

## Behavior

Add normalization:

- when loading review data, read `reviewData.videoSegmentState`;
- if missing, synthesize per-shot segment plan from tasks;
- store segment metadata in `storyboardContext.extraParams`.

Regeneration:

- load `segmentId`, `shotIds`, frame roles, model, audio strategy, creative presets, and creative brief;
- compose final provider prompt through `buildVideoSegmentPrompt`;
- keep existing skills as optional helper text generation only;
- mark affected prompts stale when creative brief or segment structure changes;
- protect manual prompt edits until user explicitly regenerates.
- block paid generation for stale auto-generated prompts until the user regenerates or explicitly keeps the current prompt.

Fallback:

- if a multi-shot segment fails repeatedly or cannot be repaired safely, split it into per-shot tasks preserving references and lineage.
- paid retry after split requires explicit user confirmation.

Add `regenerateVideoSegmentPrompt` on the saved Storyboard Review/video editor project server surface. It must return a plain-text prompt, prompt source, creative brief hash, warnings, and affected stale task IDs.

## UI/UX Contract

### Target User / JTBD

- Role: reviewer/editor.
- Goal: inspect segment structure, regenerate prompts, and recover failed clips.
- Entry point: `/storyboard-review`.
- Success outcome: user can understand which shots one clip represents and repair it without losing references.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Storyboard task list/detail | `StoryboardReviewPage.tsx` | segment badge, stale state, split/regenerate action |
| Prompt planning | `StoryboardReviewPage.tsx` | segment-aware final prompt composition |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `StoryboardSegmentBadge` | new or inline | shot count/model/provider label | task extra params |
| `StoryboardSegmentActions` | new or inline | regenerate/split controls | draft task state |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| legacy | synthesized per-shot plan, no alarming warning | test |
| stale | visible stale label and regenerate action | test |
| failed | split fallback available for multi-shot | test |
| split confirm | paid retry remains blocked until user confirms split retry | test/browser |
| access blocked | clear error, no silent transport switch | test |
| success | segment/shot lineage visible | test/browser |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | badges/actions wrap in task panel | screenshot/manual |
| tablet 768x1024 | review panels remain usable | screenshot/manual |
| desktop 1440x900 | segment details visible without crowding main preview | screenshot/manual |
| laptop 1024x768 | right-side panel does not overflow | screenshot/manual |

### Accessibility Acceptance

- Segment badges have text labels.
- Split/regenerate buttons have accessible names.
- Stale/blocked states are announced as text.
- Keyboard action path remains usable.

### Copy Contract

Thai and English copy should distinguish `segment`, `shot`, `multi-shot`, and `split back to per-shot`. Avoid technical provider jargon unless it explains a failure.

### Browser Evidence Required

Record Storyboard Review evidence after implementation for mobile, tablet, and desktop, including a stale or error state if possible.

## Test First

Tests:

- legacy synthesis;
- stored segment regeneration;
- creative brief stale semantics;
- manual prompt preservation;
- split fallback;
- split fallback confirmation before paid retry;
- stale prompt paid-generation block and explicit keep/regenerate actions;
- MCP access blocked path;
- generated task metadata preserves segment and shot lineage.

## Implementation Notes

- Extended `apps/web/client/src/lib/storyboardReviewWorkspace.ts` with `videoSegmentState`, stored state normalization, and legacy per-shot synthesis for older drafts.
- Review task projection now includes segment plan hash, effective mode, stale prompt flags, and segment lineage.
- Added `regenerateVideoSegmentPrompt` server surface in `apps/web/server/routers/videoEditorProjects.ts` with a tested pure helper for stored segment prompt regeneration.
- Added `evaluateStoryboardVideoSegmentPromptGenerationGate` and wired Storyboard Review paid video regeneration to block stale auto-generated segment prompts unless the prompt is manually edited or explicitly kept.
- Added segment badges and a per-task `Regenerate segment prompt` action in Storyboard Review. The action calls the saved-review `regenerateVideoSegmentPrompt` endpoint, updates local draft state, preserves manual generation blocking semantics, and only clears stale flags for the affected segment.
- Added `applyRegeneratedVideoSegmentPromptToDraft` so server regeneration results and client draft state use the same per-segment update semantics.
- Added explicit-only split fallback repair for failed multi-shot segments. It requires user confirmation before creating per-shot retry tasks, preserves the original provider/model/payload error in metadata, does not submit paid generation automatically, and labels the new tasks with original segment lineage so fallback cannot silently hide the root cause.
- Verification passed:
  - `npm --prefix apps/web test -- --run client/src/lib/storyboardReviewWorkspace.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts`
  - `npm --prefix apps/web run check`

## Addendum: Source Trim And Disabled Middle Ranges

The implemented Storyboard Review source-trim workflow is documented in:

- `sections/section-07-storyboard-source-trim-and-disabled-ranges.md`

That addendum covers task-level `sourceTrim` metadata, head/tail trim, disabled middle ranges, tablet mark-from-current-frame UX, preview playback skip behavior, render/capture expectations, and future silence-cut/derived-render hooks.
