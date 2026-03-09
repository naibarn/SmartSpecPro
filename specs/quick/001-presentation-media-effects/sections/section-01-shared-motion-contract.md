# Section 01: Shared Motion Contract

## Goal

Introduce a backward-compatible media-motion contract for `image` and `video` elements and define deterministic transform semantics that later sections can consume consistently.

## Scope

- Update shared schema/types for motion-enabled media elements
- Establish default/normalization helpers
- Define and test pure motion transform math

## Files

- `apps/web/shared/presentation/contracts.ts`
- `apps/web/shared/presentation/contracts.test.ts`
- `apps/web/client/src/lib/presentationEditorState.ts`
- New helper module, likely one of:
  - `apps/web/client/src/lib/presentationMediaMotion.ts`
  - `apps/web/client/src/presentation-canvas/play/presentationMediaMotion.ts`

## Implementation Tasks

1. Add a shared schema for media motion, for example:
   - `presentationMediaMotionPresetSchema`
   - `presentationMediaMotionSchema`
2. Extend `presentationImageElementSchema` and `presentationVideoElementSchema` with optional `mediaMotion`.
3. Export the inferred motion types for frontend/runtime use.
4. Add safe defaults/normalization helpers so omitted values behave exactly like "no effect".
5. Implement pure math that converts:
   - base crop state
   - motion preset config
   - normalized progress `0..1`
   into an additive transform descriptor.
6. Keep the math preset-driven and deterministic; avoid DOM access in the helper.

## TDD Notes

- Start by adding schema tests for valid/invalid `mediaMotion`.
- Add pure helper tests for `zoom-in`, `zoom-out`, and one pan preset.
- Only after those fail, implement the new contract and helper.

## Acceptance Notes

- Existing slides with no `mediaMotion` still parse unchanged.
- The helper must not mutate base crop values.
- The motion helper output should be stable and serializable so it can be mirrored in server-generated HTML.
