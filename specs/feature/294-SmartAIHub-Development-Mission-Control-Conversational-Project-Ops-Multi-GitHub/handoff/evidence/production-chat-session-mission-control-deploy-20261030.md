# Production Chat Session and Mission Control UI Deployment — 2026-10-30

## Release identity

- Environment: production, `https://smartaihub.app`
- Previous serving source SHA: `83003207502f0ae20055883bda9aac44696309b4`
- Deployed source SHA: `182febfdab9fb54ee7c47201359d78e29aed2e12`
- Release ID: `smartspec-web-182febfdab9fb54ee7c47201359d78e29aed2e12-540f7def8ef3`
- Release generation: `244`
- Full artifact digest: `sha256:54afd984b9b463fb38a193f62445f576dd0d89de8827fb9cf066e82e561ca6b9`
- Public artifact digest: `sha256:59eb3dfa74ebec93ff0fe4953af76456d282af28c326830bd27a204b528b836c`
- Deployed at: `2026-10-30T02:11:42.259198Z`
- Deployment receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/production-deployments/smartspec-web-182febfdab9fb54ee7c47201359d78e29aed2e12-540f7def8ef3-244.json`

## Runtime and public verification

- Existing release controller returned `DEPLOYED_VERIFIED` and verified `smartspec-web.service` and `smartspec-node-worker.service` at the deployed source revision; `/healthz` returned 200.
- The active release symlink resolves to generation `244`; the preceding generation remains available for rollback.
- Public API smoke test reached 12/12 routes with no server errors. The smoke tool reported two additional findings outside the UI release acceptance: missing CORS headers on `/api/health` and a test not-found route returning 200.
- Public health check returned 200, valid TLS, and no missing security headers.
- The public `/chat?c=249` page returned the post-deploy frontend asset `/assets/index-OqbQj66A.js` (HTTP 200). That served bundle contains the `Mission Control` tab, `assistant-help-tab-mission-control`, and `Show sessions`/session-dock labels. This confirms the public host is serving the integrated UI source that was absent from the previous release.
- Focused browser-session/UI tests passed: 3 files, 78 tests.
- Authenticated visual browser acceptance was not performed: the local Orca computer sidecar exited with an accessibility error, and no authenticated Playwright browser session was available. No owner data or UI state was changed.

## Scope and remaining acceptance

This is deployment evidence only. SPEC-294 acceptance remains partial; authenticated desktop/mobile browser acceptance and populated inspector panels against a real authorized Run remain open. SPEC-224 remains incomplete until a genuine owner-authorized Goal executes Child 1 and Child 2 with receipts, settlement, automatic continuation, and independent Final Verify.
