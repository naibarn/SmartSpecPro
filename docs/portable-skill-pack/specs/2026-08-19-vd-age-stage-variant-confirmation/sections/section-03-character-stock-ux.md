# Section 03 — Character Stock UX

## UI/UX Contract

- Target user/job: creator fixing a child flashback without understanding
  internal role tiers.
- Surface: existing Vertical Drama Character Stock panel and Add Look dialog.
- States: idle, recoverable child-look prompt, confirmation, creating, queued,
  completed, failed/retry, cancelled.
- Responsive: reuse the existing dialog and stack controls on small screens.
- Accessibility: dialog title/description explain the requested age; buttons
  have distinct accessible names; status is text plus icon, not color alone.
- Copy: Thai is primary in Thai mode, English fallback is always supplied.
- Browser evidence: verify the dialog opens from the marker and retains the
  custom instruction; authenticated browser verification is a separate check.

## Targets

- `VerticalDramaCharacterStockPanel.tsx`
- panel tests

## Acceptance

The existing Add Look flow opens in `age_stage` mode, requests confirmation
before credit use, and continues through existing variant generation/polling.
