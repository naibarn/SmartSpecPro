# Self-Review Round 1

## Scorecard

| Category | Score | Findings |
| --- | --- | --- |
| Structural Integrity | 5/5 | End-to-end path is traceable from UI to verified Library publish. |
| Completeness vs Spec | 6/6 | User requirements for preview parity, server MVP, standard/high quality, and client-capture caution are covered. |
| Implementability | 6/6 | File areas, contracts, job lifecycle, worker runtime, verification, and rollout are specified. |
| Internal Consistency | 4/4 | Naming uses `preview_match_browser_capture`, `Capture Final Composite`, and `Capture ตาม Preview` consistently. |
| Edge Cases | 5/5 | Stale hashes, cancellation, duplicate clicks, verification failure, token leakage, and text softness are covered. |

Total: 26/26 - PASS.

## Fixes Applied During Review

- Clarified that long capture work must not run inside Express/tRPC handlers.
- Added explicit stale attempt rejection after cancellation.
- Added high-quality fallback/blocking rule when Thai text sharpness fails.
- Added evidence redaction and support authorization requirements.
- Added UI/UX state, responsive, accessibility, and browser evidence contract.

## Remaining Suggestions

- During implementation, inspect current migration conventions before choosing between `worker_jobs` and a narrow `storyboard_capture_jobs` table.
- During implementation, verify the exact web test script in `apps/web/package.json` before final command documentation.
