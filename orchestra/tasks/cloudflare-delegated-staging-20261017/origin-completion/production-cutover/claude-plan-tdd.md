# Focused TDD guidance

## section-01-production-target-ui

- Extend Admin target environment choices to production and keep project/tenant validation, credential state, and exact-admin calls unchanged.
- Add visible copy that target metadata alone does not provision a Worker, create a grant, or enable traffic.
- Update `AdminDeploymentTargets.test.tsx`: production is selectable, target identity stays scoped, and staging/preview cases continue to work.

## section-02-production-deploy-authority

- Add contract tests first for environment/target cross-binding, expired/revoked grants, wrong project/account/worker, artifact/source mismatch, unauthorized actions, stale rollback refs, and mismatched config digests.
- Use separate production schema literals and executor tests; retain the staging executor's rejection tests.
- Verify all provider mutations are behind current approval/grant, lease, audit, target credential, and idempotency checks.

## section-03-production-runtime-composition

- Add Wrangler JSONC parse/contract tests proving SPA assets, expected API route set, production-only Container classes/namespaces and exact bindings.
- Test missing/invalid production profile and activation-off states fail closed; test Container lifecycle caps, idle cleanup, retained DB readiness, redirects/cookies, request cancellation, and no write replay.
- Assert generated config contains no account IDs, credential values, app secrets, or enabled routes/activation by default.

## section-04-production-readiness-and-cutover

- Unit-test read-only preflight result mapping for missing target, missing scopes, disabled policy, resource drift, unready retained DB, incomplete auth/runtime config, and invalid rollback evidence.
- Extend existing staging readiness tests without changing their expected status semantics.
- Live provider/browser tests remain explicitly tagged as external acceptance; do not fabricate fixture evidence as a production pass.

## Regression commands

Use focused Vitest files for AdminDeploymentTargets, cloudflareStagingDeploymentExecutor/Runtime, Cloudflare origin binding, HTTP ingress/container, canonical worker contracts, and production Wrangler config. Run `pnpm --filter @smartspec/cloudflare-runtime test`, `pnpm --filter @smartspec/web exec tsx scripts/verify-cloudflare-runtime-target.ts`, and the canonical build only after implementation SHAs are integrated. Do not run `npm run typecheck` locally.
