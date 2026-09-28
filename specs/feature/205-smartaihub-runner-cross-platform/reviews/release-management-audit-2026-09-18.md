# SmartAIHub Runner release-management audit

Date: 2026-09-18
Scope: Feature 205 release catalog, manual build/sync, Dashboard distribution,
verified self-update and Feature 204 boundary.

Each round compared a different contract boundary and reran the relevant
focused assertions. All ten local rounds passed after the catalog filtering,
Runner ownership/platform checks, Dashboard localization and the durable
publish/checksum gates were fixed.

| Round | Boundary | Result | Evidence |
|---:|---|---|---|
| 1 | Spec 205 sections 10–14 vs owned files/routes | PASS | section files, migration paths and route names match implementation |
| 2 | Release identity/profile/target separation | PASS | Zod identity rules and native/shared-container target set agree |
| 3 | Catalog publication/withdrawal/validation | PASS | public list and stream require published + valid + non-withdrawn |
| 4 | Storage/hash/header/provider boundary | PASS | bytes are hashed server-side, range streaming is same-origin and provider URLs are not returned |
| 5 | Manual workflow/publish semantics | PASS | workflow_dispatch-only, four native targets, selected commit, publish-gated `runner-v` release |
| 6 | Admin dispatch/sync/auth redaction | PASS | admin-only server dispatch, durable build row, persisted publish gate, package/raw/checksum/manifest completeness, raw signature metadata required, no token in normal response |
| 7 | Browser Runner update authorization | PASS | tenant + owner/admin check, local-device profile and platform/architecture compatibility check |
| 8 | Runner command/update recovery | PASS | `runner:update`, device proof, command-bound binary, monotonic phase transitions, hash/RSA/atomic rollback |
| 9 | Dashboard and localization | PASS | same-origin download/check/update card, connected Runner status/version/last-seen plus redacted tool/capability readiness counts, Thai/English labels, no normal-user GitHub/chat navigation |
| 10 | Cross-feature boundaries and proof | PASS | Worker release tables unchanged, Cloudflare lifecycle remains Feature 204, focused tests and diff check pass |

## External gates intentionally not claimed as local passes

- Real GitHub Actions run with signing secrets and all native host artifacts.
- Real Windows x86_64, macOS Intel (x64), macOS arm64 (Apple Silicon) and Linux x64 install/update runs.
- Real Cloudflare target-account Container deployment and replacement proof.
- Real external-agent authentication/session acceptance runs.
- Deployed browser/Playwright proof and production download bytes.

The repository-wide TypeScript check was not run because the project has an
explicit RAM constraint; changed server modules were import-probed and changed
UI paths were covered by focused Vitest/jsdom tests.
