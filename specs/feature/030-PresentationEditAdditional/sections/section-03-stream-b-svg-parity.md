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
