# Section 04 — UI and proof

## Ownership

Both QC panels, their host/surface callback wiring, component tests, and final
focused verification.

## UI/UX Contract

- Target: creator deciding whether to spend credits to improve a failed QC
  result.
- States: no plan, confirmation, queued, running, validation failure, fresh QC,
  passed candidate awaiting selection, no improvement, and stale candidate.
- Thai is the default copy; English mirrors every action/error/status label.
- Primary action remains visible; dangerous/credit actions are confirmation
  gated and disabled during the matching operation only.
- Accessibility: semantic buttons, alert/live regions for progress/errors,
  keyboard-usable confirmation, and readable score comparison at mobile width.
- Responsive: plan/action cards stack at narrow widths without hiding the
  primary repair or selection action.
- Browser evidence: capture both confirmation flows and the post-repair
  comparison/selection state if local runtime is available.

## Targets

- `VerticalDramaDraftQualityQcPanel.tsx`
- `CreateSeriesWizard.tsx`
- `MarketplaceDraftQualityQcPanel.tsx`
- `StagedCheckpointReviewSurface.tsx`
- `StagedCheckpointReviewPanel.tsx`
- `AutoReviewPlanReviewPanel.tsx`
- focused UI tests

## Acceptance

User can see what will change, confirm repair, observe a fresh QC, compare old
and repaired candidates, and explicitly select a safe result in both domains.
