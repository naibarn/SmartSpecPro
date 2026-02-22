# Section 02: v2 Schema and Contracts

## Objective
Define and enforce the `presentation_canvas_v2` slide payload contract for MVP object types (`text`, `image`, `shape`, `line`) across client state, shared validators, server request handling, and export-facing compatibility checks.

## Dependencies
- `section-01-canvas-runtime-foundation`

## Scope
- Introduce strongly typed object schema with common transform and layer fields.
- Enforce version marker (`schemaVersion: presentation_canvas_v2`) and strict unknown-field/type rejection.
- Add shared normalization so client and server produce deterministic payload ordering and defaults.
- Add fixture-backed contract tests for accepted/rejected payloads.
- Preserve existing API envelope compatibility while hard-switching editing payload semantics to v2.

## Out of Scope
- Rich desktop transform behavior and command bus (Section 03).
- Export degradation precedence and warning UX (Section 06).

## Files to Add or Modify
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/shared/presentation/validators.ts`
- `apps/web/shared/presentation/normalizers.ts`
- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/shared/presentation/__fixtures__/canvasV2-valid.json`
- `apps/web/shared/presentation/__fixtures__/canvasV2-invalid.json`
- `apps/web/client/src/lib/presentationEditorState.test.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/routers/presentation.test.ts`

## Test-First Stubs (Write Before Implementation)
- Test: validator accepts MVP object types with required common fields and type-specific props.
- Test: validator rejects unknown type, unknown required-field omissions, and unsupported field combinations with stable error codes.
- Test: normalized payload output is deterministic for same semantic input (ordering/defaults).
- Test: server update paths reject non-v2 payloads and preserve existing status/error mapping.
- Test: client and server fixture matrix stays byte-stable for accepted payloads.

## Implementation Tasks
1. Define canonical shared contract types for artboard, background, guides, and object union variants.
2. Implement schema validator with explicit stable error code taxonomy for deterministic failures.
3. Implement normalizer that applies defaults and canonical ordering without lossy transforms.
4. Update editor state helpers to treat v2 schema as authoritative edit format.
5. Update server request parsing and persistence guardrails to require validated v2 payloads.
6. Add shared fixtures covering edge values, unknown fields, and unsupported types.
7. Add compatibility path for legacy unexpected payload detection: block edit session with deterministic operator guidance and telemetry event.
8. Lock contract behavior through unit and router/service integration tests.

## Acceptance Criteria
- v2 contract is the single accepted editable schema for this feature.
- Client/server validation behavior is identical for equivalent payloads.
- Unknown or malformed payloads fail deterministically and do not persist partial writes.
- Contract fixtures and tests are in CI and stable across reruns.

## Risk Controls
- Keep route names and payload envelope shape stable; change only inner `slideContent` schema semantics.
- Prefer additive validators and helper modules before removing old codepaths.
- Emit structured telemetry for blocked legacy payloads to avoid silent failures.

## As-Built

### Actual Files Changed
- `apps/web/shared/presentation/constants.ts`
- `apps/web/shared/presentation/contracts.ts`
- `apps/web/shared/presentation/validators.ts`
- `apps/web/shared/presentation/normalizers.ts`
- `apps/web/shared/presentation/contracts.test.ts`
- `apps/web/shared/presentation/__fixtures__/canvasV2-valid.json`
- `apps/web/shared/presentation/__fixtures__/canvasV2-invalid.json`
- `apps/web/client/src/lib/presentationEditorState.ts`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationService.test.ts`
- `specs/feature/021-CanvasEditor/reviews/section-02-review.md`

### Deviations From Plan
- MVP shape support is represented as `type: "rect"` in current schema/contracts.
- No dedicated `shape` discriminator was added in this section to avoid breaking existing element handling paths.

### Tests Added or Updated
- Added `apps/web/shared/presentation/contracts.test.ts` fixture-backed contract tests.
- Added fixtures:
  - `apps/web/shared/presentation/__fixtures__/canvasV2-valid.json`
  - `apps/web/shared/presentation/__fixtures__/canvasV2-invalid.json`
- Extended `apps/web/server/services/presentationService.test.ts` to verify schema rejection and byte-size limits.
- Revalidated:
  - `apps/web/client/src/lib/presentationEditorState.test.ts`
  - `apps/web/server/routers/presentation.test.ts`

### Known Follow-Ups
- Add explicit aliasing/migration strategy if product naming must switch from `rect` to `shape`.
- Add end-to-end fixture path that exercises shared fixtures through router mutation and persistence adapters.
