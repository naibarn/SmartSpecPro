## Objective

Let users repair a single broken slide directly from its Slide Note by regenerating that slide in place.

## Affected Areas

- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- related server/router/editor tests

## Approach

1. Add a service function that:
   - validates the source slide
   - derives a single-slide narrative from the saved note
   - chooses a suitable template and component recipe
   - regenerates image media for the slide
   - renders new slide content and AI metadata
2. Add a tRPC mutation that updates the current slide in deck storage.
3. Add a Slide Note dialog action that saves pending note edits if needed, runs the repair mutation, updates the selected slide locally, refreshes deck data, and preserves undo history.
4. Add server and editor regression tests.

## Acceptance Criteria

- Slide Note dialog shows a repair/regenerate action.
- Clicking repair replaces the current slide instead of adding slides.
- Repair uses saved note content and warns if save fails.
- Repaired slide keeps working with undo.
- Tests cover mutation/service behavior and editor behavior.
