# Section 04 — Integration and Verification

## Dependency

Requires Sections 01-03.

## Ownership

Verification artifacts and safe cross-section fixes only. Do not stage or commit.

## Checks

1. Run focused Skill/runtime, stock/router, and UI tests.
2. Run the Visual Bible Skill bundle verifier.
3. Run scoped `git diff --check`.
4. Run web workspace typecheck; classify unrelated pre-existing failures separately.
5. Inspect SocratiCode impact closure for changed shared/router/service contracts.
6. Record browser evidence at 390x844, 768x1024, and 1440x900, or exact blockers.
7. Run one clean targeted standard-light convergence round after the final fix.
8. Complete gap-closure and loop-policy ledgers.

## Acceptance

No material contract mismatch, stale focused gate, candidate-reference leak, credit double
refund, owner-boundary gap, inaccessible primary action, or unclosed must-do-now item remains.

## UI/UX Contract

### Target User / JTBD
Verify the Section 03 creator flow end to end.
### Surface Inventory
Characters tab candidate controls, preview, grid, and selection states.
### Component Map
N/A — verification does not create components.
### State Matrix
Verify open, loading, prompt-ready, rendering, partial, failed, selected, switching, and
read-only states from Section 03.
### Responsive Matrix
Verify 390x844, 768x1024, and 1440x900; add 1024x768 when available.
### Accessibility Acceptance
Verify keyboard order, labelled radios/buttons, pressed state, live/alert text, and focus.
### Copy Contract
Verify Thai/English labels are creator-facing and hide technical IDs/JSON/provider jargon.
### Browser Evidence Required
Record screenshots/manual evidence or exact authentication/dev-server blockers.
