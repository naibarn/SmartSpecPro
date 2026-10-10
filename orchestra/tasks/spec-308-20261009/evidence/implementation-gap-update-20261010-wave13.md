# SPEC-308 continuation wave 13 — implementation-first browser evidence tooling

## Implemented in the task worktree

- Added a raw metrics harness in `apps/web/tests/e2e/helpers/spec308-metrics.ts` and a feature-flag OFF/ON browser scenario in `spec-308-dual-surface.spec.ts`. It records same-origin request/resource byte totals, Chromium JS heap proxy, largest CLS session window, function callback timer registrations/active handles, string-handler timer counts, mock procedure counts, viewport, and actual gzip sizes of all five rendered mascot SVG variants.
- Added `spec-308-side-effects.spec.ts` to exercise mocked balloon show, dismiss, and notification CTA with API/tRPC side-effect checks. It checks that the CTA opens the existing Bell and does not open Chat; captured request data stores only pathnames, not queries or credentials.
- Added `spec-308-route-surfaces.spec.ts` for mobile Bell/launcher coexistence on `/notifications` and the `/presentation-editor/:docId` unavailable-item fallback.
- Updated `.github/workflows/spec-308-browser.yml` to include all three browser spec files in the existing Chromium simulation job. The job already uploads `apps/web/test-results/production-director/`, including the raw metrics JSON.
- Updated the requirement map for implementation/test/evidence links. The canonical ledger remains 66/66 OPEN; no PASS was added.

## Review and verification

- Read-only metrics review raised and closed three concrete issues: calculate the CLS session-window value, preserve native `window` callback receiver, exclude string handlers from active-timer tracking and count them separately, and fail if the observer/CDP heap metrics are missing.
- `git diff --check` passed after the edits. No Playwright tests or TypeScript checks were run; they are deferred to the requested consolidated test wave, and repository-wide typecheck remains restricted by RAM policy.
- Existing mocked browser CI run 38009610472 still refers to SHA `0fdda9580ff80988266f7677980991481637c076`; it predates this wave and does not verify the new instrumentation or specs.

## Evidence boundaries and remaining work

- Feature-flag OFF versus ON is a same-build UI fixture comparison. It is not a main-versus-candidate commit comparison, a live-network measurement, low-end physical-device measurement, or live authenticated acceptance.
- No performance threshold is asserted. The QA owner must set budgets from an approved baseline; physical Android/tablet, live runtime identity, Feature-049 notification authorization, and Security/Media Runtime owner decisions remain external gates.
- The editor route check covers only the unavailable-item shell; it does not test editing or draft preservation. The new browser cases remain unverified until the consolidated run on the committed exact SHA.
