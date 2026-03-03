# Section 02: Stream A Auto Layout

## Objective
Stabilize relayout for dense-media slides using deterministic, degrade-first behavior and no-silent-drop guarantees.

## Scope
- Improve pre-drop filtering and degrade transforms.
- Enforce deterministic ranking and tie-breaks.
- Add overlap ceiling checks with deterministic fallback repack.
- Preserve warning metadata for truncation/degradation visibility.

## Dependencies
- Requires Section 01 outputs.

## Target Files
- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- closest existing editor relayout test file

## TDD First (Stubs)
- Stub: filter hidden/zero-size/off-canvas decorative candidates before drop.
- Stub: apply degrade transforms before drop decisions.
- Stub: deterministic ordering with stable tie-breaks.
- Stub: overlap ratio ceiling and deterministic repack fallback.
- Stub: dense fixture tests for >=60 and >=80 media elements.

## Implementation Tasks
1. Add explicit preprocessing stage in relayout pipeline.
2. Apply degrade-first transformations prior to drop policy.
3. Lock deterministic ordering inputs and fallback algorithm.
4. Emit structured warnings for degraded/dropped outcomes.
5. Wire UI status surface to new warning outputs where needed.

## Validation
- Same deck + same seed yields identical retained order and warning sequence.
- Dense fixtures meet element-retention and overlap threshold targets.
- No silent drop for eligible retained media.

## Risks and Rollback
- Risk: composition changes too aggressive on marginal overflow.
- Rollback: feature-flag deterministic fallback path and tune thresholds before wider rollout.

## Done Criteria
- Stream A tests pass and determinism criteria are met.
