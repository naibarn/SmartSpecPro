# Section 05: Autosave, Conflict, and Recovery

## Objective
Implement debounced autosave with conflict-burst protection and stale-version safeguards while preserving existing manual save and conflict recovery semantics.

## Dependencies
- `section-02-v2-schema-and-contracts`
- `section-03-desktop-interactions-and-command-model`

## Scope
- Implement autosave debounce controller for edit mutations.
- Preserve manual save trigger and existing conflict messaging UX behavior.
- Add cooldown after repeated conflict responses to prevent retry storms.
- Add stale-version guard that blocks autosave retries until refresh or explicit user action.
- Preserve deck auto-init and back-navigation flow behavior.

## Out of Scope
- Offline draft buffering.
- Collaboration merge semantics.

## Files to Add or Modify
- `apps/web/client/src/presentation-canvas/save/useAutosaveController.ts`
- `apps/web/client/src/presentation-canvas/save/conflictPolicy.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`

## Test-First Stubs (Write Before Implementation)
- Test: rapid edits are batched by debounce window into bounded mutation frequency.
- Test: stale-version writes enter deterministic conflict state and do not auto-loop.
- Test: cooldown suppresses immediate retry after repeated conflicts.
- Test: manual save and conflict recovery actions remain unchanged from baseline.
- Test: save status UI transitions (`saving`, `saved`, `conflict`, `error`) are deterministic.

## Implementation Tasks
1. Add autosave controller hook with configurable debounce and in-flight request dedupe.
2. Implement conflict policy state machine (`normal`, `cooldown`, `stale_blocked`) with transition guards.
3. Integrate conflict policy with editor save UI and existing conflict CTA actions.
4. Ensure manual save bypasses debounce but still respects stale-version guard.
5. Add telemetry events for autosave success/failure/conflict/cooldown transitions.
6. Update service tests for version conflict behavior under autosave cadence.

## Acceptance Criteria
- Autosave reduces request burst while preserving timely persistence.
- Conflict storms are prevented by cooldown and stale guards.
- Manual save and user-visible conflict recovery semantics remain backward compatible.
- Test coverage locks expected autosave/conflict state transitions.

## Risk Controls
- Keep conflict response format unchanged to avoid client/server drift.
- Protect against duplicate in-flight mutation submits.
- Add explicit timeout/error handling to avoid stuck `saving` UI state.

## As-Built

### Actual Files Changed
- `apps/web/client/src/presentation-canvas/save/conflictPolicy.ts`
- `apps/web/client/src/presentation-canvas/save/conflictPolicy.test.ts`
- `apps/web/client/src/presentation-canvas/save/useAutosaveController.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/lib/analytics/presentationEvents.ts`
- `apps/web/client/src/lib/analytics/presentationEvents.test.ts`
- `apps/web/server/services/presentationService.test.ts`
- `specs/feature/021-CanvasEditor/reviews/section-05-review.md`

### Deviations From Plan
- Server conflict behavior did not require production code changes in this section; autosave cadence coverage was added via `presentationService` tests.
- Conflict cooldown and stale-guard policy are implemented client-side with deterministic state transitions (`normal -> cooldown -> stale_blocked`).

### Tests Added or Updated
- Added:
  - `apps/web/client/src/presentation-canvas/save/conflictPolicy.test.ts`
- Updated:
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - `apps/web/client/src/lib/analytics/presentationEvents.test.ts`
  - `apps/web/server/services/presentationService.test.ts`
- Targeted run:
  - `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- client/src/presentation-canvas/save/conflictPolicy.test.ts client/src/lib/analytics/presentationEvents.test.ts client/src/pages/PresentationEditor.test.tsx server/services/presentationService.test.ts"`

### Known Follow-Ups
- Wire autosave analytics events into rollout dashboards and alert thresholds in Section 08.
