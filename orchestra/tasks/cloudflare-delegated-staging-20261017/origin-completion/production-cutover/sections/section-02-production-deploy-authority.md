# Section 02 — Production deploy authority

## Contract

- **Requirement IDs:** PCT-05, PCT-07.
- **Objective:** support production deployment only through the existing exact provider target, approval/grant, lease, audit, credential, canary, and rollback controls while keeping the staging executor unchanged.
- **Owned paths:** production-specific Cloudflare deployment contract/authority/executor and focused unit/DB integration tests; narrowly shared transport only when type-safe.
- **Prerequisites:** Section 01 identity shape; confirm current approval APIs and provider target schema before edits.
- **Deliverable:** separate production grant schema and executor path bind tenant/project/environment/account/worker/artifact/source/config/action/canary/rollback/budget/expiry. Missing production target, policy, grant, or credential fails closed before provider mutation.
- **Acceptance:** negative cross-environment tests and positive mocked authorized production lifecycle; provider call counters remain zero for denied cases; staging behavior remains unchanged.
- **Fallback:** keep production deployment unavailable and continue staging/non-production work if the existing approval authority cannot issue an exact production grant. Never seed an approval policy or approval row in live DB.
- **Rollback:** revert only production authority code; preserve staging executor and stored provider state.
- **Merge readiness:** code/test slice can integrate without live provider state; no production deploy occurs in CI/local checks.

## Verification

Run production contract/executor tests and existing staging executor/runtime suite. No raw Wrangler deploy, API write, or production credential scope mutation.
