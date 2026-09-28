# Section 03 — Casting UI and Proof

## Ownership

Own `VerticalDramaCharacterStockPanel.tsx`, client tests and localization additions if needed.

## UI/UX Contract

- Target user/job: Drama Series creator choosing a new fictional actor face during Casting.
- Surface: existing reference disclosure, immediately above the 1–5 candidate generate button.
- Controls: candidate count 1–5, lock clothing switch, pose radio, camera framing select, optional additional-instructions textarea.
- Copy: clearly state references are optional, only guidance, and the result is a new person rather than the person in the reference. State that this option applies only to Casting.
- State matrix: no references (old flow), references attached (new skill flow), loading (disable controls/button), skill error (retain inputs and show retry), selected candidate (existing primary action).
- Accessibility: labels associated with controls, radio/select semantics, visible focus, error/status text and no color-only state.
- Responsive: controls wrap within the existing card; textarea remains full width; candidate cards retain existing responsive behavior.
- Browser evidence: focused route/browser pass is recommended but must be reported separately from unit proof if unavailable.

## TDD

- Test payload builder omits blank optional text and preserves enum values.
- Test controls and copy with references/no references.
- Test count 1–5 and disabled/loading state.

## Acceptance

The option is visible above generation, does not force an attachment, supports examples without requiring them, and the no-reference flow remains unchanged.
