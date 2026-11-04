# Core SPEC import independent of Runner execution readiness

- Observed at: 2026-11-04T13:04:52Z
- Integrated source SHA: `0a981643401a6af74e29e127089f9c9794a77f35`
- Target: `legacy-debian-dev` (`https://smartaihub.app`), Debian `smartspec-web.service` on port 3000
- Release: `smartspec-web-0a981643401a6af74e29e127089f9c9794a77f35-ab31478777a1`, generation `g355`
- Artifact digest: `sha256:80df9f97a8caaecdf29339fece15f1907db26fb0a58bc080b8cf7a7b0df1e920`
- Previous serving generation for recovery: `g354`, source `550846fba964eac652b534a75ace01ca251cd409`

## Change

The previous UI/API gate still required a current Runner snapshot and source fingerprints before importing canonical Specs. That import only stores trusted project metadata in the conversation's Spec Set; it does not read or modify the Runner checkout, deploy, or start work. The import gate now requires an authorized Admin flow, a Platform Engineering workspace for the exact `modular-debian-dev` repository/target, and a non-revoked conversation binding to that workspace. Stale execution snapshots and missing execution fingerprints no longer disable metadata import. Revoked/forbidden bindings and wrong workspace/target authority remain rejected. Preparing and starting WorkPackages still require the current snapshot and normal Runner readiness.

The Task Control card now keeps import available for that authorized stale binding, offers a direct rebind action before later execution, and states that importing itself does not wait for the Runner.

## Focused verification

- `quick`, exact source `0a981643401a6af74e29e127089f9c9794a77f35`: `pnpm --dir apps/web exec vitest run client/src/components/chat/Spec224WorkspacePanel.test.tsx` passed 43/43 tests.
- Focused import regressions across the UI, service and API suites passed 4/4 selected tests (115 unrelated tests filtered out). Coverage includes stale Core metadata import without source fingerprints, current Core binding import, stale execution binding admission, and revoked/non-platform rejection.
- `git diff --check` passed. No typecheck was run. No database schema changed.
- A broader three-file sweep also reported two failures outside the changed import gate: platform workspace display-name expectation and a missing referenced Spec during package preparation. These remain separate from the focused import results and are not represented as passing.
- Spec handoff validation returned `valid: true` with no validation errors; completion remains ineligible because SPEC-224 requirements are still open. Global index check reports drift in `spec-index.json`, `reconciliation-report.json`, and `ambiguity-review.json`; these files were already dirty before this fix and were preserved without regeneration. The check reported no per-Spec status drift and `global_invariant: true`.

## Deployment verification

- Repository environment manifest validation passed: 10/10 required variables, `deploy_ready: true`.
- Migration static configuration passed; database state was not queried. This change has no database migration.
- The exact-SHA Linux release controller returned `DEPLOYED_VERIFIED` for `legacy-debian-dev`. `smartspec-web.service` and `smartspec-node-worker.service` both report source revision `0a981643401a6af74e29e127089f9c9794a77f35`; runtime health returned HTTP 200 and anonymous diagnostics remained denied with HTTP 403.
- Public health check passed: HTTP 200 in 165 ms, valid TLS, and no missing security headers. API smoke reached 12/12 routes with zero server errors and 120 ms average response. It also reported two existing unrelated findings: `/api/health` lacks CORS headers and `/404-test-page` returns the SPA with HTTP 200.
- The immutable release bundle's `Spec224WorkspacePanel-DS1O-UTr.js` contains the new “นำเข้า Specs ได้โดยไม่ต้องรอ Runner” guidance, the direct rebind action, and the Specs 312–324 import control.
- Authenticated browser interaction and a persisted live Spec Set import were not exercised. UI and server mutation behavior were verified by focused tests; deployment health does not establish that the owner's conversation imported the data.
- No Cloudflare artifact or Worker was built or deployed; `smartsihub.com` was not activated.

## Resource profile

- `package`: host available memory 25,471,116 KiB; memory PSI `some.avg10=0.00`; user-slice current 18,656,190,464 bytes, reclaimable 12,400,805,032 bytes, effective 6,255,385,432 bytes, `high` 19,327,352,832 bytes, `max` 21,474,836,480 bytes, swap current/limit 3,438,489,600 / 6,442,450,944 bytes. Main Vite build completed in 53 seconds.

This is exact-SHA implementation, focused-test, and development-deployment evidence only. It does not claim a live import or overall SPEC-224 acceptance.
