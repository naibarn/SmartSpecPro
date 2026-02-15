# section-02-editor-timeline-t1

## Objective

Deliver stable timeline lifecycle behavior for T1 text clips in the editor while preserving existing non-text interactions.

## Scope

- Ensure Add Text reliably targets/creates `T1`.
- Support select/move/trim/delete for text clips.
- Preserve deterministic overlap ordering by clip-array order.
- Enforce strict-parity control gating at editor interaction level.

## Dependencies

- Requires `section-01-contract-validation-foundation` to be complete.

## Primary Files

- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- `apps/web/client/src/components/videoeditor/Timeline.tsx`
- `apps/web/client/src/components/videoeditor/__tests__/...` (new/updated)

## Tests First (Write Before Implementation)

1. Test: Add Text initializes defaults and always attaches clip to `T1`.
2. Test: text clip move guards prevent invalid cross-track moves.
3. Test: overlap-allowed behavior preserves deterministic array-order z-index.
4. Test: timeline labels/markers for text clips remain stable after edits.
5. Test: unsupported controls are hidden/disabled in strict-parity mode.

## Implementation Tasks

1. Finalize `handleAddTextClip` and T1 creation fallback for legacy projects.
2. Validate drag/move/edit actions are text-track-scoped and do not affect other track semantics.
3. Update timeline rendering details for text labels and keyframe presence indicators.
4. Align control visibility/editability with capability matrix outputs.
5. Ensure ordering semantics are preserved through all timeline operations.

## Acceptance Criteria

1. T1 text lifecycle operations work without regressing video/audio/overlay workflows.
2. Overlap rendering order is deterministic and consistent with clip array order.
3. Strict-parity control restrictions are enforced in editor UI.

## Risks and Notes

- Reordering logic can introduce subtle regressions in existing timeline behavior.
- Keep clip identity stable when moving or trimming to avoid keyframe desynchronization.

## As-Built Update (2026-02-15)

### Actual Files Changed

- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- `apps/web/client/src/components/videoeditor/TextClipEditor.tsx`
- `apps/web/client/src/components/videoeditor/textTimelineUtils.ts`
- `apps/web/client/src/components/videoeditor/__tests__/textTimelineUtils.test.ts`
- `apps/web/client/src/components/videoeditor/__tests__/TextClipEditor.strictParity.test.tsx`

### Implementation Notes

1. Added `textTimelineUtils` to centralize T1 behavior:
- create T1 track if missing
- add text clips with deterministic defaults
- enforce strict-parity supported effect subset
- codify text clip move restrictions and overlap policy.
2. `handleAddTextClip` now uses shared utility and no longer depends on pre-existing text track state.
3. Clip move behavior now restores invalid moves without mutating timeline state and allows overlap on text semantics.
4. Ripple edit compaction now skips text tracks so T1 overlap behavior remains deterministic.
5. Text authoring effect controls are strict-parity-gated in `TextClipEditor` (unsupported effects hidden).

### Deviations From Plan

- Timeline visual marker changes were already present; no additional marker rendering logic was needed in this section.
- Overlap policy was enforced in move/ripple logic rather than timeline rendering because rendering already derives order from clip array sequence.

### Tests Added/Updated

- Added unit tests for text timeline utility behaviors (T1 creation, move guards, overlap policy, strict effect gating).
- Added component test to verify strict-parity effect control gating in `TextClipEditor`.
- Re-ran Section 01 validation/conversion suites as regression coverage.

### Follow-Ups

- Extend `TextClipEditor` with keyframe authoring persistence and easing semantics (Section 03).
- Connect preview rendering to T1 text clips and explicit z-order parity fixtures (Section 04).
