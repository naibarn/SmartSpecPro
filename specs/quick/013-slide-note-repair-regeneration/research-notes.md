## Existing Code Paths

- `apps/web/client/src/pages/PresentationEditor.tsx`
  - `handleAutoRelayoutSlide()` already has the version-refresh + undo restoration pattern.
  - Slide Note dialog currently only supports `Copy`, `Close`, `Save Note`.
- `apps/web/server/routers/presentation.ts`
  - `presentation.ai.relayoutSlide` already loads the deck/slide, validates slide content, updates the slide, and returns warnings.
  - `getPresentationToken()` provides a bearer token for media-generation scopes.
- `apps/web/server/services/aiPresentationService.ts`
  - `extractNarrativeFromSlideNotes()` and `normalizeSlideHierarchy()` already repair sparse or malformed note-derived narrative.
  - `assignAIComponentRecipes()` chooses modern component/block recipes.
  - `generateAIDraft()` already contains the per-slide media prompt + image generation + layout compilation pipeline needed for a one-slide repair flow.

## Reuse Strategy

- Reuse note parsing / narrative normalization helpers from `aiPresentationService.ts`.
- Reuse image generation helpers and layout compilation helpers from the Draft with AI pipeline.
- Reuse the editor-side optimistic apply + refresh + undo-stack restoration pattern from auto layout.

## Risks

- Duplicating too much of `generateAIDraft()` would make maintenance harder.
- Updating slide title during repair affects sidebar labels and version conflict handling.
- Repair should not consume unsaved note draft silently unless save succeeds first.
