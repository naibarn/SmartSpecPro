# Section 09: End-to-End Proof and Gap Closure

## Objective

Close every acceptance criterion with executable evidence or an explicit
external-proof boundary.

## Owned paths

- golden/replay fixtures under the vertical-drama test fixture directory
- focused end-to-end service/router tests
- implementation checklist and section notes

## Required behavior

Create deterministic replay cases for: completed aligned run, partial
checkpoint resume, stale worker, duplicate queue delivery, provider unknown and
reconciliation, credit shortage/refund, source drift, approval and rejection,
local repair, cross-episode repair approval, criteria/flag drift, and finalizing
retry. Assert no candidate is visible as final and no duplicate charge/write is
possible.

## Verification loop

1. Run the section-specific tests and `npm --workspace apps/web run check`.
2. Run migration/section/spec checks and `git diff --check` on owned paths.
3. Map all 32 spec acceptance criteria to code and test evidence.
4. For every unmet item, patch the smallest owned surface and rerun the focused
   proof. Repeat until complete or externally blocked.
5. Report local-only evidence separately from unperformed production migration,
provider, browser, deployment, and live Agents SDK evidence.

## UI/UX Contract

### Target User / JTBD
N/A: this section verifies existing UI behavior rather than designing a new
surface.

### Existing Pattern Reference
Reuse section 06's `VerticalDramaSeriesDetailPage` state/action contract.

### Surface Inventory
None directly; verification targets the section 06 surfaces.

### Component Map
None.

### State Matrix
Covered by section 06 tests and replayed API summaries.

### Responsive Matrix
Covered by section 06; no browser proof is implied here.

### Accessibility Acceptance
Covered by section 06 component tests.

### Copy Contract
Verify localized status/reason keys remain truthful.

### Browser Evidence Required
Only claim browser evidence when a separate browser run produced artifacts.
