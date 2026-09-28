# Section 03 — UI recovery action and proof

## Ownership boundary

Own the deep-story panel, localized copy, and client tests. Reuse existing
AlertDialog/Button/Badge patterns and the current polling helper.

## Target files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts`
- focused client test under `apps/web/client/src/components/verticalDramaSeries/__tests__/`

## UI/UX Contract

- Target user: a creator recovering an interrupted paid story generation.
- Job-to-be-done: understand what was saved, then explicitly continue only the
  missing work.
- Surface: existing deep-story action card; add a compact failed/recoverable
  status banner above generation controls.
- States: loading, active, failed-and-recoverable, recovery-confirmation,
  recovery-pending, non-recoverable, success, and mutation error.
- Responsive: counts and action wrap on mobile; no horizontal overflow.
- Accessibility: semantic button, accessible name, keyboard/focus support,
  disabled pending state, and `aria-live="polite"` progress/error status.
- Copy: Thai and English labels, confirmation, error, loading, and no-checkpoint
  explanation with safe localization fallback.
- Browser evidence: targeted component tests plus manual/authenticated browser
  verification after deployment; local tests do not prove production paid flow.

## Required behavior

- query recovery state on mount;
- display completed and remaining episode numbers from the server;
- confirm before calling the mutation;
- after success, poll the same domain job id and invalidate the series;
- do not open a fresh-generation dialog while recovery is active.

## TDD expectations

Cover Thai/English rendering, confirmation, pending disablement, same-job polling,
and non-recoverable state without any real network or credit call.
