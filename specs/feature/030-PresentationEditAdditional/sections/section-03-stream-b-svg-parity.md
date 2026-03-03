# Section 03: Stream B SVG Parity

## Objective
Ensure inline SVG and `.svg` file assets behave consistently across editor, play, and export with explicit fallback outcomes.

## Scope
- Normalize SVG handling across render paths.
- Implement fallback chain: rasterize to PNG, then bounded placeholder.
- Prevent blank/white artifacts by always surfacing fallback state.
- Propagate SVG warning codes for user-visible and machine-readable status.

## Dependencies
- Requires Section 01 outputs.

## Target Files
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/server/routes/slideRender.ts`
- server/client status mapping files used for export warnings

## TDD First (Stubs)
- Stub: inline SVG renders with stable bounds.
- Stub: `.svg` source renders with parity to inline behavior.
- Stub: rasterization fallback succeeds with no layout shift.
- Stub: placeholder fallback preserves original bounds when rasterization fails.
- Stub: warning codes emitted (`W_SVG_LOAD_FAILED`, `W_SVG_PARSE_FAILED`, `W_SVG_RASTERIZED`, `W_SVG_PLACEHOLDER`).

## Implementation Tasks
1. Consolidate SVG source normalization in one shared transform path.
2. Apply unified fallback chain in editor/play/export renderers.
3. Add warning mapping so fallback is reported as success-with-warning unless structural failure.
4. Verify status rendering in UI remains backward-compatible.

## Validation
- Parity fixture outputs match expected bounds/state across all three paths.
- No white-block artifacts in play/export snapshots.
- Warning-only outcomes map to completed-with-warnings.

## Risks and Rollback
- Risk: over-eager placeholder fallback on recoverable assets.
- Rollback: keep rasterization and placeholder behind controllable fallback flags.

## Done Criteria
- SVG parity suite passes for inline and file-based assets.

## As-Built (2026-03-04)

### Actual Files Changed
- `apps/web/client/src/presentation-canvas/CanvasObjects.tsx`
- `apps/web/client/src/presentation-canvas/CanvasObjects.test.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/routes/slideRender.test.ts`
- `apps/web/shared/presentation/exportWarnings.ts`
- `apps/web/server/services/presentationExportDegradation.ts`
- `apps/web/server/services/presentationExportDegradation.test.ts`
- `specs/feature/030-PresentationEditAdditional/reviews/section-03-review.md`
- `specs/feature/030-PresentationEditAdditional/sections/section-03-stream-b-svg-parity.md`

### Deviations from Plan
- Implemented deterministic SVG warning classification at export-spec build time (`W_SVG_*` codes) rather than deferring warnings to runtime renderer-only telemetry.

### Tests Added/Updated
- Added `client/src/presentation-canvas/CanvasObjects.test.tsx` for invalid inline SVG placeholder behavior and `.svg` source parity.
- Added slideshow overlay invalid-inline-SVG fallback test in `client/src/pages/PresentationEditor.test.tsx`.
- Added route HTML contract assertion for SVG fallback logic in `server/routes/slideRender.test.ts`.
- Expanded `server/services/presentationExportDegradation.test.ts` to cover SVG warning taxonomy output.
- Executed targeted verification:
  - `client/src/presentation-canvas/CanvasObjects.test.tsx`
  - `client/src/pages/PresentationEditor.test.tsx`
  - `server/routes/slideRender.test.ts`
  - `server/services/presentationExportDegradation.test.ts`

### Known Follow-ups
- `W_SVG_LOAD_FAILED` is currently emitted from deterministic preflight classification only for explicit SVG-format missing-source conditions; runtime load failures are handled by bounded placeholder rendering.
