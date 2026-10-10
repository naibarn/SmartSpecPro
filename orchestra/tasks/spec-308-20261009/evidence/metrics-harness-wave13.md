# SPEC-308 metrics evidence harness — wave 13

## Implemented

- Added an isolated Playwright observation comparing the existing notification bell with the dual-surface feature flag OFF versus ON on the same authenticated mock fixture, browser, viewport, and source SHA.
- The raw JSON records same-origin request counts/failures and Resource Timing transfer/encoded byte totals, Chromium `JSHeapUsedSize` as a desktop proxy, largest CLS session-window value excluding recent-input shifts, registered/active function-callback timers, counts of untracked string-handler timers, mock procedure-call counts, and the viewport. The browser cache is cleared before the ON sample so both initial-load samples use a cold cache. Timer wrappers preserve `window` as the callback receiver.
- The harness renders each of the five production `AssistantMascot` React variants to inline SVG and records raw and gzip byte counts using Node's built-in `zlib`; no dependency was added.
- The workflow already uploads `apps/web/test-results/production-director/`, so the new `spec-308-metrics-<sha>.json` is included with its existing Playwright artifact.

## Limits and remaining evidence

- This comparison is feature-flag OFF versus ON on one build. It does not establish a main-versus-candidate commit comparison, live network usage, low-end Android/tablet performance, device heap, or live authenticated acceptance.
- The test asserts that measurements are collected; it does not invent or enforce budget thresholds. The Spec requires the QA owner to set those from an approved baseline.
- A future consolidated test run must inspect the generated raw JSON, confirm all five SVG measurements, pair a control and candidate revision if the QA owner requires that comparison, and record any agreed threshold decision.
- No tests or typecheck were run in this implementation wave, per the requested deferred test pass and repository RAM policy. `git diff --check` is the only verification performed so far.

## Requirement status

`REQ-EAAA066D4991` and `AC-308-029` remain OPEN. Instrumentation is implemented but has no runtime output until the deferred Playwright run; even then hosted Chromium evidence cannot satisfy physical-device or live-acceptance requirements.
