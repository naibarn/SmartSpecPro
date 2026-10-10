# SPEC-308 implementation continuation — 2026-10-10, wave 5

## Reconciliation

- Refreshed `origin/main`: `6dcd7934332db7929904f8da642915751a6bb79`.
- PR #399 latest source checkpoint: `f0fa060c55779beb6d55c7baeba727d9dd3a517c` (previous implementation commit `eee0fa4cc389590d378307fff3af5a15f74c42e0`).
- PR #403 head remains `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; PR #405 remains `868a5600ff770be91885666b7f584835e03fc690`. Their worktrees and branches were not edited.

## Exact-head focused run and repairs

- Run `37983209928` tested `2fec9d4b4b4e889951fcd20efe253855d0f6c43c`. Install and schema generation passed. The focused runner correctly selected eight files after the previous workflow-argument defect was fixed, but 3 files failed (20 failed / 118 passed); the browser stage was skipped because of that unit failure.
- FeedbackButton failures shared one fixture defect: the mocked tRPC mutation omitted `reset()`, which the actual mutation hook provides. The fixture now provides it.
- Bell failure exposed stale accessible status: zero unread items always claimed history was available. The Bell now derives its accessible name from actual unread/recent data, hides the Recent pill when no recent item exists, and localizes the new status strings in EN/TH.
- Settings failures exposed test selectors that no longer matched the radio IDs and an invalid-motion case without a hydrated scoped preference baseline. The tests now use accessible radio roles and seed the valid baseline before asserting invalid input is ignored.
- Run `37984108309` completed on exact SHA `eee0fa4cc389590d378307fff3af5a15f74c42e0` with 120 passed / 20 failed across eight focused files; two files failed and the browser stage was skipped. Failures showed the Bell mock returned raw translation keys where existing tests expected English, several existing Bell tests still selected the old aria text, dock-position assertions rejected jsdom-unsupported CSS `max()`, and Feedback tab/form tests lacked mappings for authenticated Chat/Task Control/Feedback translation keys. The new 320px browser assertion did not run.
- Repairs in `f0fa060c55779beb6d55c7baeba727d9dd3a517c` make the focused translation mocks reflect EN output, use English accessibility names in existing assertions, preserve numeric dock offsets for jsdom while applying safe-area padding to the dock content, and supply the authenticated Feedback label fixture. New exact-head run `37984601979` is in progress on that SHA; no result is inferred yet.

## Added implementation

- Bell popover placement now clamps to the current viewport and visual viewport, including resize/keyboard changes; it respects safe-area offsets and places the panel above the Bell where needed. Opening focuses the labeled non-modal dialog; Escape and its close button return focus to the Bell.
- Added a local mascot render error boundary so a decorative mascot failure falls back to a Chat glyph without replacing Chat/Feedback or Settings controls; errors remain reportable to Sentry.
- Added privacy-safe outcome definitions in `evidence/discoverability-metrics.md`. This adds no analytics or telemetry; collection still requires the existing consent-governed path and privacy approval.
- Added unit/browser regression coverage for truthful empty Bell state, focus return, mascot fallback, and a 320px Bell popover bounds check. The exact-head run is pending.

## State

- `git diff --check` and EN/TH admin-locale JSON parsing pass on the implementation checkpoint; no local unit/E2E tests, full typecheck, or build were run.
- Requirements remain OPEN. AC-308-007, -021, -022, -024 and -033 have additional source-level partial evidence only; no PASS or verified status is claimed.
- Existing authority blockers remain: Feature-049 tenant/occurrence authority, approved authenticated non-production runtime/identity, PR #403 MCP live authority and test configuration, and Security/Runtime Owner disposition for `sprintf-js` Moderate. Production flags remain OFF.

## Next action

Inspect run `37984601979` logs/artifacts on the exact SHA, repair only proven candidate failures, then update the generated canonical handoff and per-requirement ledger. Continue one consolidated verification round after implementation stabilizes; do not equate simulated browser results with live authenticated acceptance.
