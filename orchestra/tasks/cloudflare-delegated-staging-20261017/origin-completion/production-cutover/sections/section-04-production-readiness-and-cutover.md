# Section 04 — Production readiness, canary, and cutover proof

## Contract

- **Requirement IDs:** PCT-04, PCT-05, PCT-06, PCT-07.
- **Objective:** prove actual production behavior and safely transfer traffic only after the existing production authority admits the exact operation.
- **Owned paths:** existing readiness/preflight/evidence services and focused tests; external evidence is recorded only in the existing parent HANDOFF.
- **Prerequisites:** Sections 02 and 03 integrated; current canonical artifact; active exact production target/grant; provider read scopes; rollback resource/config; authorized browser/test tenant access.
- **Deliverable:** preflight for target/permissions/resource drift, private PostgreSQL `/readyz`, auth/OAuth/2FA, tenant isolation, API/assets/upload/stream/realtime, canonical jobs/outbox, media/storage and rollback. Bounded canary must pass before broader routes.
- **Acceptance:** actual provider readback and deployed source/config IDs; live database readiness without DB migration; real browser flows and independent tenant isolation; job/realtime and bounded Container evidence; verified rollback to the known-good origin and repeat health; final serving SHA matches approved artifact.
- **Fallback:** keep production routes/activation disabled and origin serving if any gate is missing or fails; preserve staging evidence and continue fixing code-level issues.
- **Rollback:** disable only the authorized production routes/activation and restore the recorded origin-compatible config; do not drop or migrate PostgreSQL or job data.
- **Merge readiness:** unit/preflight improvements integrate independently. Final acceptance cannot be claimed from local tests or artifact publication.

## UI and browser acceptance

Retain existing login, 2FA, OAuth callback, session, error and tenant surfaces. Test loading, authenticated, invalid/expired session, wrong tenant and upstream unavailable states in Thai/English, desktop and mobile, with keyboard and accessible errors. Do not expose secrets, cookies, provider payloads, or personal data in evidence. Label Moli/Chromium distinctly.

## Verification

Use read-only provider inventory before and after any approved deploy, exact deployment job/grant/rollback IDs, production DB `/readyz`, actual auth/session/tenant tests, and browser network evidence. No manual provider mutation outside the existing deployment executor.
