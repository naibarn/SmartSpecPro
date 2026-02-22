# Section 04: Mobile Safe-Core Interactions

## Objective
Deliver a stable mobile-safe editing path with explicit pan/edit modes, touch-safe selection/move/basic text updates, and gesture controls that avoid accidental transforms on small screens.

## Dependencies
- `section-01-canvas-runtime-foundation`
- `section-02-v2-schema-and-contracts`

## Scope
- Implement explicit interaction mode state (`pan_mode`, `edit_mode`) with visible UI toggle.
- Implement pinch zoom and two-finger pan behavior for stage viewport.
- Implement touch-safe single-select, move, and basic text edit interactions.
- Implement minimum touch target constraints for handles and quick actions.
- Implement telemetry for mode switches and accidental-transform cancellation signals.

## Out of Scope
- Full desktop parity transforms on mobile.
- Slide multi-select operations.

## Files to Add or Modify
- `apps/web/client/src/presentation-canvas/mobile/MobileInteractionState.ts`
- `apps/web/client/src/presentation-canvas/mobile/useMobileGestures.ts`
- `apps/web/client/src/presentation-canvas/components/MobileBottomSheet.tsx`
- `apps/web/client/src/presentation-canvas/components/MobileQuickActions.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/lib/analytics/presentationEvents.ts`

## Test-First Stubs (Write Before Implementation)
- Test: pinch/pan updates viewport transform while preserving selected object context.
- Test: pan mode suppresses advanced transform handles and edit actions.
- Test: touch interactions below minimum hit target do not trigger unintended transforms.
- Test: mobile safe-core supports select/move/basic text edit without desktop-only control leakage.
- Test: mode-switch and accidental-transform telemetry events are emitted with required fields.

## Implementation Tasks
1. Add explicit mobile interaction state model with mode switch reducers and guards.
2. Implement gesture hook that differentiates single-touch selection vs multi-touch pan/zoom.
3. Add bottom sheet tabs (`Add`, `Layers`, `Properties`, `Pages`) with drag states for compact/half/full.
4. Add touch-friendly quick action controls and handle sizing policy.
5. Integrate mode guard checks into transform and property handlers.
6. Add analytics emission for mode switches and gesture cancellation edge cases.
7. Extend mobile editor tests to cover core-safe workflow and accidental-edit prevention.

## Acceptance Criteria
- Mobile users can pan/zoom/select/move/basic-edit without frequent accidental transforms.
- Mode switching is explicit, persistent during session, and observable via telemetry.
- Mobile UI adapts for `<768px` layout without blocking core edit flow.

## Risk Controls
- Keep advanced transforms disabled in pan mode by default.
- Use conservative gesture threshold tuning and add regression tests for edge interactions.
- Track cancellation and error events to validate production behavior during canary.

## As-Built

### Actual Files Changed
- `apps/web/client/src/presentation-canvas/mobile/MobileInteractionState.ts`
- `apps/web/client/src/presentation-canvas/mobile/MobileInteractionState.test.ts`
- `apps/web/client/src/presentation-canvas/mobile/useMobileGestures.ts`
- `apps/web/client/src/presentation-canvas/mobile/useMobileGestures.test.ts`
- `apps/web/client/src/presentation-canvas/components/MobileQuickActions.tsx`
- `apps/web/client/src/presentation-canvas/components/MobileBottomSheet.tsx`
- `apps/web/client/src/presentation-canvas/CanvasStage.tsx`
- `apps/web/client/src/presentation-canvas/index.ts`
- `apps/web/client/src/lib/analytics/presentationEvents.ts`
- `apps/web/client/src/lib/analytics/presentationEvents.test.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `specs/feature/021-CanvasEditor/reviews/section-04-review.md`

### Deviations From Plan
- Gesture behavior is currently delivered through a deterministic hook API (`applyGesture`) and editor-triggered simulation path rather than raw pinch-event adapters.
- Bottom sheet tabs are implemented with compact tab sections in the existing shell layout rather than a draggable sheet state machine.
- Advanced transforms are blocked on mobile across current quick-action paths (edit safe-core), while desktop retains full transform tooling.

### Tests Added or Updated
- Added:
  - `apps/web/client/src/presentation-canvas/mobile/MobileInteractionState.test.ts`
  - `apps/web/client/src/presentation-canvas/mobile/useMobileGestures.test.ts`
  - `apps/web/client/src/lib/analytics/presentationEvents.test.ts`
- Updated:
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`

### Known Follow-Ups
- Replace simulated gesture trigger with real pinch/touch adapter wiring from pointer/touch events.
- Persist mobile interaction mode per-session preferences if product requires cross-reload continuity.
- Implement draggable bottom-sheet states (compact/half/full) when mobile layout hardening is prioritized.
