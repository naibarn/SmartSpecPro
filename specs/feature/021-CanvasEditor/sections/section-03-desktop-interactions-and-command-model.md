# Section 03: Desktop Interactions and Command Model

## Objective
Implement desktop editing behaviors for selection, transform, snapping, arrange operations, and deterministic undo/redo so users can complete the primary CanvasEditor workflow safely and predictably.

## Dependencies
- `section-01-canvas-runtime-foundation`
- `section-02-v2-schema-and-contracts`

## Scope
- Implement single-select, multi-select (`shift`/marquee), and active selection bounds.
- Implement move, resize (8 handles), rotate, and z-order arrange actions.
- Implement snapping and alignment guides for edges and centers.
- Implement command bus for undo/redo with deterministic state transitions.
- Implement keyboard workflows (arrows, shift-arrows, duplicate, delete, undo/redo).
- Implement right-panel property updates for MVP object types.

## Out of Scope
- Mobile pan/edit mode behavior (Section 04).
- Autosave conflict handling (Section 05).

## Files to Add or Modify
- `apps/web/client/src/presentation-canvas/selection/SelectionEngine.ts`
- `apps/web/client/src/presentation-canvas/snap/SnapEngine.ts`
- `apps/web/client/src/presentation-canvas/commands/CommandBus.ts`
- `apps/web/client/src/presentation-canvas/commands/commands.ts`
- `apps/web/client/src/presentation-canvas/components/TransformHandles.tsx`
- `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`
- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/client/src/lib/presentationEditorState.test.ts`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`

## Test-First Stubs (Write Before Implementation)
- Test: select/move/resize/rotate produce deterministic geometry updates.
- Test: snapping emits expected edge/center guide behavior for representative layouts.
- Test: arrange operations maintain deterministic z-order for forward/back/front/back actions.
- Test: undo/redo restores exact prior states after multi-step transform chains.
- Test: keyboard flows enforce bounded movement and visible focus semantics.
- Test: property edits update object props and preserve schema validity.

## Implementation Tasks
1. Add selection state model and selection reducer actions in editor state.
2. Implement transform handlers with constrained geometry math and snapping hooks.
3. Implement `SnapEngine` guide computation with deterministic precedence for competing guides.
4. Implement command bus abstraction with reversible command payloads and history stack.
5. Map UI actions and keyboard shortcuts to command bus operations.
6. Build property panel editors for text/image/shape/line MVP types with typed field validation.
7. Integrate selection overlays and transform handles into stage render tree.
8. Add tests for transform math, command determinism, and keyboard accessibility flows.

## Acceptance Criteria
- Core desktop editing loop (select, transform, arrange, undo/redo) works for MVP object types.
- Command history behavior is deterministic and replay-safe.
- Snap guides are stable and not jitter-prone under typical edit motion.
- Keyboard and focus behavior is covered by tests and meets accessibility baseline.

## Risk Controls
- Keep state updates reducer-driven to avoid non-deterministic mutation side effects.
- Add snapshot or fixture tests for representative transform scenarios.
- Bound expensive snap calculations to active-object neighborhoods when possible.

## As-Built

### Actual Files Changed
- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/client/src/lib/presentationEditorState.test.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/presentation-canvas/CanvasStage.tsx`
- `apps/web/client/src/presentation-canvas/index.ts`
- `apps/web/client/src/presentation-canvas/selection/SelectionEngine.ts`
- `apps/web/client/src/presentation-canvas/selection/SelectionEngine.test.ts`
- `apps/web/client/src/presentation-canvas/snap/SnapEngine.ts`
- `apps/web/client/src/presentation-canvas/snap/SnapEngine.test.ts`
- `apps/web/client/src/presentation-canvas/commands/CommandBus.ts`
- `apps/web/client/src/presentation-canvas/commands/CommandBus.test.ts`
- `apps/web/client/src/presentation-canvas/commands/commands.ts`
- `apps/web/client/src/presentation-canvas/commands/commands.test.ts`
- `apps/web/client/src/presentation-canvas/components/TransformHandles.tsx`
- `apps/web/client/src/presentation-canvas/components/PropertyPanel.tsx`
- `specs/feature/021-CanvasEditor/reviews/section-03-review.md`

### Deviations From Plan
- Stage/runtime remains DOM-backed; `react-konva` wiring is still blocked by missing dependency path and remains tracked in blocked tasks.
- Rotation is implemented as deterministic command metadata (`rotationByElementId`) in client command state and is not yet persisted in shared slide schema.
- Marquee selection engine is implemented but pointer-drag marquee wiring is deferred; shift-toggle multi-select is active now.

### Tests Added or Updated
- Added:
  - `apps/web/client/src/presentation-canvas/selection/SelectionEngine.test.ts`
  - `apps/web/client/src/presentation-canvas/snap/SnapEngine.test.ts`
  - `apps/web/client/src/presentation-canvas/commands/CommandBus.test.ts`
  - `apps/web/client/src/presentation-canvas/commands/commands.test.ts`
- Updated:
  - `apps/web/client/src/lib/presentationEditorState.test.ts`
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`

### Known Follow-Ups
- Integrate `react-konva` stage/layer runtime and pointer transform handles once dependency/toolchain unblock is complete.
- Persist rotation in schema (or formalize non-persisted behavior) before production readiness section.
- Wire marquee drag interaction to `SelectionEngine.marquee` for full desktop parity.
