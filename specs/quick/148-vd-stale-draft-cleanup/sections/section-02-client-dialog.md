# Section 02 — Client dialog

## Ownership

Own the stale-cleanup dialog/helper and the minimal `VerticalDramaShell` wiring.
Preserve all unrelated shell changes already present in the dirty worktree.

## TDD expectations

- Red tests for oldest non-empty default (10 -> 7), summary signature,
  selection counts, and no automatic interruption.
- Cover mutation pending, success refresh/count, and error feedback where the
  existing test harness can render the dialog without unrelated providers.

## UI/UX Contract

- Target user/job: a Vertical Drama creator opening the series index who wants
  to archive old pre-series Draft jobs from the active inbox safely.
- Surface inventory: one non-blocking maintenance banner and an explicitly
  opened modal; no new page, menu, or settings.
- Component map: AlertDialog, RadioGroup, Button/actions, warning icon, toast.
- State matrix: hidden/no stale jobs; banner/selectable; open/selectable;
  pending/locked; success/closed/refetched; error/open/retryable.
- Responsive matrix: single-column choices and footer on narrow screens; compact
  dialog within existing max width on desktop.
- Accessibility: labelled title/description, native radio semantics, visible
  focus, Cancel and confirm actions, no close while mutation is pending.
- Design system: use existing shadcn/Astryx-compatible primitives and current
  semantic color classes; no raw hex/px or new dependency.
- Copy: concise Thai and English labels; explicitly state inactive Draft only,
  created series and history unaffected, count, age threshold, success,
  zero-race, and error.
- Browser evidence: verify the route at desktop and narrow width when an
  authenticated browser environment is available; otherwise report it pending.

## Acceptance checks

- Dialog does not open automatically; the maintenance banner opens it on the
  index route.
- An empty threshold option is disabled and never submitted.
- Successful mutation refreshes the metadata list/summary without full-Draft
  fetches or optimistic deletion.

## Implemented

- Added `VerticalDramaStaleDraftCleanupDialog.tsx` with the 7/10 choice UI,
  oldest non-empty default, explicit-open maintenance hook, and tested mutation
  success/zero-race/error behavior.
- Wired the dialog into `VerticalDramaShell.tsx`; it is mounted only on the
  series index and refreshes the Draft metadata query after success.
- Added two focused UI/hook suites. Together with the existing Shell route and
  lineage regression, Section 02 passes 3 files / 26 tests.
- Review found a one-render detail-route exposure and missing mutation callback
  tests; conditional mounting and a testable mutation hook resolved both, and
  re-review passed.
- Authenticated browser evidence was unavailable in this shell; accessible DOM
  behavior is covered by jsdom tests and live route proof remains pending.
