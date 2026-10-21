# Production Cloudflare cutover implementation plan

## Current architecture and root cause

The staging deployment target, origin-version descriptor, grant, and executor explicitly require `environment=staging` and `smartspec-cloudflare-staging`. The Admin target editor also exposes only preview/staging. Production `smartspec-cloudflare-runtime` currently has activation disabled and only Search Result Cache bindings; the active `smartaihub.app` zone has no Worker routes. The production Wrangler template serves only a narrow emergency API set and lacks SPA assets and the full application HTTP bridge. Therefore an existing production Worker name is not evidence that the application has moved.

Cloudflare currently has two staging Container applications (Node/Python). Application HTTP configuration and lifecycle profiles enforce staging and short on-demand budgets. Production target, Container applications, routes, and grants do not exist in the app's current authority model. The original PostgreSQL host remains the intended database; its private connector and readiness gate need live production proof. Read-only credential checks used separate Admin credentials: the audit token can list Container apps/routes while the target deployment token received 403 from Containers list; no token scope is changed by this work.

## Approach

Keep staging behavior immutable and introduce explicit production-scoped types/configuration instead of loosening staging literals. Reuse the existing provider target registry, exact-admin UI, encrypted credentials, approval/grant store, deployment job, audit, and recovery mechanisms. A production request must bind tenant, project, production environment, exact Worker/zone/Container app IDs, immutable canonical artifact, database/runtime configuration digest, action, canary scope, budget, and expiry. Production remains default-off until an existing authority issues the exact grant. No provider mutation is run during implementation.

Compose the production Worker as a canonical artifact that serves the built SPA and routes supported API/realtime traffic to the production application runtime. Keep native APIs separate from Express routes, and route legacy/retired paths according to the existing manifest. Use a separate production Container profile/namespace with an on-demand, bounded lifecycle; require `/readyz` to establish access to the retained PostgreSQL before forwarding. Preserve existing auth, OAuth/2FA, tenant, CSRF, Access, origin-attestation, and job fencing contracts. Activation and public routes remain disabled until canary and rollback evidence exists.

## Sections and dependency order

1. `section-01-production-target-ui`: expose production target metadata to exact admins, with explicit status that metadata does not deploy or enable traffic. Preserve staging/preview behavior.
2. `section-02-production-deploy-authority`: add a production grant/deployment contract and executor path using existing approval/audit/credential/rollback authorities. Keep staging contract unchanged; no policy bypass.
3. `section-03-production-runtime-composition`: add a production Worker build/config that serves SPA assets and supported app routes, plus distinct bounded Container bindings/configuration. Default activation and routes off in generated artifacts until granted.
4. `section-04-production-readiness-and-cutover`: preflight exact target/resources/token scopes, retained DB readiness, auth/isolation/jobs/realtime and rollback evidence; run only after exact production authority exists.

Sections 01 and 03 can be developed independently. Section 02 depends on target identity contracts from 01. Section 04 depends on 02 and 03. Existing branch protection and project fast gates remain applicable. Production deployment is never a local test prerequisite.

## Risks and mitigations

- Cross-environment authority confusion: retain staging literals and add production-specific schemas/tests; reject staging grants against production and vice versa.
- Accidental traffic change: generated production config stays disabled; require explicit route/activation grant and rollback checkpoint; no provider writes in code implementation.
- Existing production Worker has stale/incomplete bindings: inspect provider metadata read-only and compare complete expected binding sets before any deploy.
- Database/network errors: `/readyz` must test the actual retained PostgreSQL path; liveness alone is insufficient. Fail closed and never fall back after an uncertain write.
- Container cost: use on-demand DO-managed applications, existing bounded start/compute/deadline rules, no prewarm, and explicit start/readiness/idle/cleanup accounting.
- Incomplete application parity: acceptance lists auth/OAuth/2FA, independent tenants, uploads, streams/realtime, canonical jobs, media, storage, callbacks, recovery, and mobile/desktop behavior; unsupported routes remain on current origin until individually qualified.
- Missing IAM/authority: surface exact missing read/write permissions and stop only provider mutations; continue local code and tests.

## Definition of Done

Code DoD: all four sections integrated; no local typecheck; focused service, worker, UI, contract, and config tests pass; existing staging tests remain green; production templates are fail-closed; handoff contains exact main/artifact SHAs and open authority gaps.

Live DoD: an existing production authority provides an active exact target-scoped grant and deployment token with the needed scopes; provider target/resources are read back; production artifact is built from canonical main; DB `/readyz`, OAuth/2FA/session/tenant isolation, API routes, job/realtime flows and bounded Container lifecycle pass; a canary is observable; rollback to known-good Debian/origin is verified; only then may production traffic cut over. Without those live proofs the outcome stays NOT_ACCEPTED.

## Rollback and verification

Code rollback reverts only the production-capability commits; staging remains independent. Runtime rollback disables production routes/activation through the authorized provider path and returns traffic to the verified current origin, preserving PostgreSQL and job control-plane state. Run section-specific Vitest and Wrangler config checks; build canonical artifacts from exact integrated main SHAs; never treat a build or published artifact as deployment evidence.
