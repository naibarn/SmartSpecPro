# Integration finish lifecycle event

- Integrated pull request: #156
- Code commit: `cef39eed9`
- Canonical integration SHA: `b2791404dde26fef8a2a9a46caece7f3f8b24285`
- Changed scope: the audit producer emits `INTEGRATION_FINISH` only when a durable successful convergence receipt has a valid integrated SHA equal to canonical SHA, a clean canonical-user-workspace role, and a stable receipt identity. Enqueue uses the existing worker_jobs control plane and a receipt/SHA idempotency key.
- Verification: focused `workspaceAuthorityAuditJob.test.ts` — 9 passed; `git diff --check` passed.
- Outcome: session finish, owner lease expiration, canonical convergence and verified integration receipt events now have producers. Handoff and recovery/archive producers and the authenticated safe-action API/Runner path remain open. `P0_CODE_IMPLEMENTATION` stays `PARTIAL`.
- External runtime verification: `NOT_RUN`.
