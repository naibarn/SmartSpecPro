# Section 03 — Real Browser Acceptance

- **Requirement IDs:** R3, R5, R7, R8, R10
- **Objective:** Prove the exact model-generated expense tracker works at its owner-private canonical Mini-App URL.
- **Owned paths:** Browser acceptance script/spec, narrowly scoped UI/runtime fixes and scrubbed journey evidence.
- **Prerequisites:** Section 02 has a real bound artifact; a non-production owner browser session and an independent second identity exist.
- **Deliverables:** Actual appId/URL; income and expense actions; correct totals/chart; reload persistence; usable mobile viewport; owner access; unauthorized denial; failure-retention and same-app continuation proof.
- **Verification:** Real browser (Playwright or visible Chrome) against the registered non-production HTTPS origin or deployed canonical route. Browser evidence binds target URL, appId, artifact/source digest and exact revision.
- **Completion predicate:** All primary interactions pass; unauthorized identity receives no private bytes; evidence is persisted; only then may USER_TRIAL_READY be recorded.
- **Evidence:** Scrubbed screenshots/trace, assertions, API/network status, owner identities by opaque test ID, artifact/source digest and timestamp.
- **Fallback:** Fix and re-integrate issues, rerun the same appId. Preserve last-known-good artifact on build failure. Never substitute mocked unit tests for the real trial.
- **Blocker challenge:** Validate app CSP/sandbox and storage bridge, authentication cookie, tenant/owner policy and mobile layout. Do not loosen access controls to make the test pass.
- **Waiting/reactivation:** If browser target is not deployed yet, keep preview/build state truthful and continue local proof. Production URL verification waits for Section 04.
