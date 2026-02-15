# section-03-text-authoring-keyframes

## Objective

Complete text clip authoring semantics for style/layout/transform and keyframe persistence in a parity-safe model.

## Scope

- Align editor controls to supported style/layout/transform fields.
- Persist segment easing and optional per-property easing overrides.
- Enforce keyframe constraints (no duplicate timestamp markers, valid ranges).

## Dependencies

- Requires `section-02-editor-timeline-t1` completion.

## Primary Files

- `apps/web/client/src/components/videoeditor/TextClipEditor.tsx`
- `apps/web/client/src/types/videoEditor.ts`
- `apps/web/client/src/components/videoeditor/__tests__/...` (new/updated)

## Tests First (Write Before Implementation)

1. Test: supported text style/layout fields persist losslessly through save/load.
2. Test: keyframe add/update/delete enforces unique timestamp markers.
3. Test: segment easing and per-property overrides serialize/deserialize correctly.
4. Test: interpolation falls back to segment easing when property override is absent.
5. Test: unsupported style controls are not exposed under strict-parity mode.

## Implementation Tasks

1. Update authoring state model for required text fields and transform controls.
2. Implement keyframe CRUD behavior with duplicate-time protections.
3. Persist easing metadata in canonical clip payload shape.
4. Keep UI complexity controlled while preserving full schema support for overrides.
5. Ensure editor outputs remain compatible with render-contract conversion requirements.

## Acceptance Criteria

1. Editing text style/transform and keyframes remains stable across reload cycles.
2. Keyframe semantics are deterministic and schema-valid.
3. No unsupported renderer features leak into editable UI state.

## Risks and Notes

- Keyframe model drift can break parity and contract conversion later in the pipeline.
- Avoid local-only editor state that cannot serialize to canonical payload.

## As-Built Update (2026-02-15)

### Actual Files Changed

- `apps/web/client/src/types/videoEditor.ts`
- `apps/web/client/src/services/projectManager.ts`
- `apps/web/client/src/components/videoeditor/transformKeyframes.ts`
- `apps/web/client/src/components/videoeditor/__tests__/transformKeyframes.test.ts`
- `apps/web/client/src/services/__tests__/projectManagerValidation.test.ts`

### Implementation Notes

1. Extended keyframe schema with optional `easingOverrides` per transform property (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`).
2. Validation now normalizes keyframe easing values to the supported easing set and preserves only valid per-property overrides.
3. Interpolation now evaluates easing per property:
- use property override when present and valid
- otherwise fall back to segment easing.
4. Existing duplicate-timestamp protection and strict-parity effect gating remain intact.

### Deviations From Plan

- No new keyframe authoring UI controls were added in this section; the schema and interpolation contract were implemented first to keep section scope minimal and parity-safe.

### Tests Added/Updated

- Added transform interpolation tests for per-property easing override behavior and segment-easing fallback.
- Added validation test ensuring per-property overrides are normalized and persisted deterministically.
- Re-ran strict-parity editor/timeline regression subset for text clip behavior.

### Follow-Ups

- Expose per-property easing override editing controls in UI only when parity policy allows (future section/iteration).
- Ensure backend render path consumes the same easing semantics for full preview/render parity (Section 05+).
