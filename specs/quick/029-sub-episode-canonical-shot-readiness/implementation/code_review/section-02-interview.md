# Code Review Triage: Section 02 — UI and Server Integration

Date: 2026-07-13

No finding required a product or security decision from the user.

## Auto-fixes

- Removed conditional raw-clip server fallback; canonical/clip-derived
  resolution now applies to every assembly caller.
- Moved UI readiness derivation into the panel so component tests exercise raw
  storyboard/start-frame/motion-pack input.
- Added canonical partial fallback coverage.
- Added router integration proof for resolver identities and one-per-shot job
  submission.
- Updated the stale resolver documentation after the second review.

Re-review result: APPROVE.
