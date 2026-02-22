# Section 01: Canvas Runtime Foundation

## Objective
Establish the Canvas Editor runtime boundary in `apps/web/client` so all downstream behavior (schema, transforms, autosave, export handling) runs inside a stable `react-konva` stage architecture without regressing existing presentation routing and deck lifecycle flows.

## Dependencies
- None.

## Scope
- Create `presentation-canvas` module boundaries (`CanvasShell`, `CanvasStage`, `CanvasObjects` entrypoint composition).
- Integrate `react-konva` stage and layers while keeping serialized slide content as the single source of truth.
- Keep editor route behavior stable for `/presentation-editor/:docId` and non-presentation guard behavior.
- Ensure mount/unmount lifecycle cleanup for stage listeners and viewport subscriptions.
- Preserve `DocumentManagement` create/open handoff and deck auto-initialize behavior.

## Out of Scope
- Final object schema validation logic (Section 02).
- Full desktop transform behaviors (Section 03).
- Mobile-specific interaction model (Section 04).

## Files to Add or Modify
- `apps/web/client/src/presentation-canvas/CanvasShell.tsx`
- `apps/web/client/src/presentation-canvas/CanvasStage.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/presentation-canvas/index.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/lib/presentationRouting.test.ts`

## Test-First Stubs (Write Before Implementation)
- Test: `/presentation-editor/:docId` still resolves and hydrates editor shell after module split.
- Test: route guard still blocks non-presentation item opens with deterministic error payload.
- Test: stage/layer shell renders from serialized slide content and re-renders only changed object layer segments.
- Test: remounting editor route does not leak stage listeners or viewport state.
- Test: `DocumentManagement` new/open presentation flow still reaches editable deck route.

## Implementation Tasks
1. Create `presentation-canvas` module skeleton with explicit exports and no business logic in route page component.
2. Implement `CanvasShell` layout container that hosts top bar, left rail, stage, and right panel placeholders.
3. Implement `CanvasStage` wrapper around `react-konva` with controlled props for viewport and selected object ids.
4. Define stage-layer structure contract (`background`, `content`, `selection-guides`, `interaction-overlay`) for downstream sections.
5. Wire existing presentation editor page to use `CanvasShell` and preserve current load/save/error state boundaries.
6. Ensure route guard and create/open handoff behavior remain unchanged for non-presentation items.
7. Add cleanup logic for stage listeners and throttled callbacks on component unmount.
8. Update test suites to lock routing, mount lifecycle, and shell rendering behavior.

## Acceptance Criteria
- New canvas module exists and is the only runtime entrypoint for presentation editing.
- Existing route and guard behavior remains backward compatible.
- Deck auto-initialize and editor hydration continue working for new and existing presentations.
- Lifecycle tests prove no stage listener leakage across route transitions.

## Risk Controls
- Keep route namespace and endpoint usage unchanged in this section to reduce blast radius.
- Introduce module in additive manner; avoid deleting old helpers until section-level tests pass.
- Gate major UI activation behind existing feature flag path where applicable.

## As-Built

### Actual Files Changed
- `apps/web/client/src/presentation-canvas/CanvasShell.tsx`
- `apps/web/client/src/presentation-canvas/CanvasStage.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/presentation-canvas/index.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `specs/feature/021-CanvasEditor/reviews/section-01-review.md`

### Deviations From Plan
- `CanvasStage` is currently a layered DOM scaffold instead of a full `react-konva` stage runtime.
- This keeps route/deck lifecycle behavior stable while preserving a deterministic stage-layer contract for subsequent interaction sections.

### Tests Added or Updated
- Updated `apps/web/client/src/pages/PresentationEditor.test.tsx`:
  - validates canvas shell/layer render contract.
  - validates stage listener cleanup across unmount/remount.
  - retains existing routing, deck-init, save/export behavior checks.

### Known Follow-Ups
- Replace DOM stage scaffold with `react-konva` runtime integration before completing transform-heavy sections.
- Add stage-specific interaction/render regression tests once transform and gesture layers are implemented.
