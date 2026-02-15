# section-01-contract-validation-foundation

## Objective

Establish the data-contract and validation base for T1 text clips so save/load and render-conversion behavior is deterministic, backward-compatible, and version-aware.

## Scope

- Accept and normalize `text` tracks in project validation.
- Define canonical text payload defaults and keyframe constraints.
- Publish a versioned capability matrix for strict-parity controls.
- Add explicit contract version behavior for mixed-version rollouts.

## Primary Files

- `apps/web/client/src/services/projectManager.ts`
- `apps/web/client/src/types/videoEditor.ts`
- `apps/web/shared/types/mediaJob.ts`
- `specs/feature/012-AddTextClip/implementation-plan.md` (reference)

## Tests First (Write Before Implementation)

1. Test: `validateProjectStructure` accepts valid `text` tracks and text clips.
2. Test: malformed text payloads/keyframes fail with deterministic validation errors.
3. Test: missing optional text fields are defaulted safely on load.
4. Test: capability-matrix compliance rejects unsupported UI field exposure in strict-parity mode.
5. Test: mixed-version contract behavior enforces explicit policy (`reject_with_clear_error` or gated downgrade).

## Implementation Tasks

1. Extend project schema/validation to include `text` track type and clip payload requirements.
2. Add normalization/defaulting for text clip optional fields and keyframe metadata.
3. Introduce canonical capability matrix constants with explicit support states.
4. Add contract version metadata for project/timeline payload conversion boundaries.
5. Implement deterministic behavior for unsupported contract versions and field sets.
6. Document compatibility behavior inline where conversion/validation decisions are applied.

## Acceptance Criteria

1. Legacy projects load without text regressions.
2. New text clip payloads round-trip save/load without lossy transformations.
3. Invalid payloads fail fast with stable error messages.
4. Capability and version policies are codified and test-covered.

## Risks and Notes

- High-impact regression area: any contract mismatch can break existing renders.
- Do not silently drop unsupported fields during mixed-version handling.

## As-Built Update (2026-02-15)

### Actual Files Changed

- `apps/web/client/src/services/projectManager.ts`
- `apps/web/shared/types/mediaJob.ts`
- `apps/web/client/src/services/__tests__/projectManagerValidation.test.ts`
- `apps/web/shared/types/__tests__/mediaJob.test.ts`

### Implementation Notes

1. Validation now accepts `text` tracks and applies deterministic text-clip normalization defaults (font/style/color/effect, volume/speed/effects defaults).
2. Strict-parity capability matrix enforcement is active for text effects, with unsupported effects rejected explicitly.
3. Text transform keyframes now enforce `time` bounds (`0..1`) and uniqueness.
4. Media timeline contract version policy is explicit:
- default `reject_with_clear_error`
- gated downgrade allowed only for unsupported future contract versions with no text semantics.
5. Timeline conversion now preserves text semantics (`subtitle <-> text`) and carries contract metadata.

### Deviations From Plan

- No schema migration was introduced; validation + conversion contract policy was implemented directly in existing service/type modules.
- Capability matrix was implemented as strict-parity constants in validation/conversion layer; UI gating integration is deferred to Section 02/03.

### Tests Added/Updated

- Updated `projectManager` validation suite for text tracks, text defaulting, strict-parity effect rejection, duplicate keyframe rejection, and contract version policy handling.
- Updated `mediaJob` suite for contract version metadata, subtitle-to-text mapping, expanded job type list, and unsupported-version behavior.

### Follow-Ups

- Wire strict-parity capability matrix directly into authoring controls in `TextClipEditor`/timeline interaction flows (Section 02/03).
- Ensure preview/runtime parity for unsupported-effect handling and telemetry reason codes (Sections 04-06).
