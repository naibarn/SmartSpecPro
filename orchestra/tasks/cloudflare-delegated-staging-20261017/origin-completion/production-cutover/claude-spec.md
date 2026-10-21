# Production Cloudflare cutover capability

## Objective

Move the user-facing `smartaihub.app` runtime from Debian to Cloudflare Workers and bounded on-demand Workers Containers while retaining PostgreSQL at its current host. Production remains disabled until the exact existing owner/policy authority approves the production target, grant, artifact, routes, runtime config, and rollback.

## Requirement ledger

| ID | Requirement | Current evidence | State |
| --- | --- | --- | --- |
| PCT-01 | Production target can be recorded separately from preview/staging | provider target table accepts environments; Admin UI filters preview/staging | unsatisfied |
| PCT-02 | Production Worker serves the built SPA and supported API routes | production Worker is disabled, cache-only; no Worker routes | unsatisfied |
| PCT-03 | Node/Python HTTP runtime can run in production with on-demand bounded Containers | existing app and bridge contracts enforce staging | unsatisfied |
| PCT-04 | Existing PostgreSQL remains the database and is proven ready through the private transport | connector/readiness implementation exists; no live prod proof | partial |
| PCT-05 | Production deploy/cutover/rollback use exact provider target, existing approvals, audit, and recovery controls | deployment grant/executor are staging-only; no active production target/policy | unsatisfied |
| PCT-06 | Jobs, auth/OAuth/2FA, tenant isolation, uploads, realtime, and recovery are accepted on Cloudflare | current staging and production runtime evidence incomplete | unsatisfied |
| PCT-07 | Container billing remains bounded and no prewarm occurs | staging on-demand budgets exist; no prod profile | partial |

## Constraints and non-goals

- Keep PostgreSQL on its current host; do not migrate or alter production data as part of code work.
- Do not issue or synthesize approvals, credentials, provider permissions, identities, or deployment evidence.
- Do not mutate production Cloudflare state until the exact production authority admits the operation.
- Preserve existing staging-only boundaries, retired systems, and rollback behavior.
- No Stripe requirement. No Container prewarming or unbounded runtime.

## Acceptance

Code acceptance requires a production-scoped target and deployment path that is separate from staging, default-disabled, and protected by the existing target-scoped grant and audit authorities; production Worker config must compose SPA assets, API routes, and only authorized runtime bindings; readiness must prove the retained database before serving; bounded Containers and rollback must be explicit. Live completion additionally requires an exact production grant, provider API readback, DNS/route evidence, real auth and tenant-isolation/browser tests, supported job and realtime journeys, canary, rollback, and final serving-SHA proof. Missing external authority remains an external blocker and cannot be represented as a successful cutover.
