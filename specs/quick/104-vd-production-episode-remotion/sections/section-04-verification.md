# Section 04 — Verification

## Required checks

- Focused Vitest suites for shared, Remotion, service/router, and UI.
- Targeted TypeScript check/diagnostics for changed files; report known full-repo baseline separately.
- `git diff --check`.
- Browser route evidence at 390x844, 768x1024, and 1440x900 if Playwright/dev server is available; otherwise record skipped checks and manual source inspection.

## Acceptance

No must-do-now contract, ownership, stale-state, or accessibility gap remains. Legacy Production Episode rows still parse and render their existing player.
