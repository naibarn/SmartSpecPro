# Production Cloudflare cutover support

## Request
Enable a safe, complete production cutover of smartaihub.app from Debian Linux to Cloudflare while retaining the existing PostgreSQL database host. Continue engineering independently; do not bypass the repository's existing exact production approval, credentials, rollout, or rollback authorities. Cloudflare Containers must remain bounded/on-demand and only be used for workloads that require them.

## Observed state
- Production zone `smartaihub.app` is active, but its Cloudflare Worker Routes list is empty.
- Existing production Worker `smartspec-cloudflare-runtime` is disabled and has only Search Result Cache bindings; it does not serve the web application.
- The account has separate Node/Python `smartspec-staging-*` Container applications, and the staging Worker is configured with those bindings while activation is disabled.
- The application deployment target registry has a staging target only. Existing deployment and origin grant contracts/executor are hard-coded to `staging`.
- No active production approval policy/grant or production target exists in the current database. No production provider mutation is authorized by this plan.
- A fresh canonical web/runtime artifact was built and published from main SHA `4309f4b1e`; it is an artifact only, not a deployment.
- PostgreSQL remains on the original host. A private database connector/readiness path is implemented but has no current production runtime proof.

## Constraints
- Use the existing provider target, approval/grant, audit, deployment job, and rollback authorities; never invent identity, token scope, grant, or provider evidence.
- No production traffic change until a valid target-scoped authorization and all preflight/rollback checks pass.
- Keep billing bounded: no prewarming; on-demand/smallest compatible Container profile; no Container activation unless necessary.
- Do not migrate PostgreSQL. Do not require Stripe. Preserve unrelated dirty work and never use retired systems listed in AGENTS.md.

## Likely scope
Production target/admin configuration, Worker asset/API/Container composition, production-scoped grants and rollback, database readiness, authentication, tenant routing, background jobs/realtime, and preflight diagnostics.
