# Cloudflare Staging Separation Handoff

Status: staging-only Static Assets configuration and local Workers proof implemented; live staging and tenant/database/auth acceptance remain blocked on external infrastructure/authorization.

Source base: `a70f84651ffbaa8be385d90da5710c514a0b72ec` (`origin/main`, 2026-10-17).
Worktree: `/home/dev/.cache/codex/canonical-sources/f29801373bfd4154c0d8/cloudflare-staging-separation-20261017`.
Branch: `codex/cloudflare-staging-separation-20261017`.

## Implemented

- Added `apps/cloudflare/wrangler.staging.jsonc`: `workers.dev` only, activation disabled, and no custom routes, cron, queues, KV, or Hyperdrive binding.
- Vite output is served from `apps/web/dist/public`; API/auth/OAuth/uploads/internal/health/metrics/WebSocket/well-known patterns are Worker-first, keeping API misses away from SPA fallback.
- Added static cache headers: shell/index is `no-cache`; fingerprinted `/assets/*` use one-year immutable caching.
- Added a staging config guard and Cloudflare CI build/workerd smoke coverage.
- Documented rollback and the fact that the static shell still has SmartAIHub production canonical metadata; it does not provide per-tenant server-rendered SEO.

## Verification on this worktree

- `npm --workspace @smartspec/cloudflare-runtime run check`: passed.
- `npm --workspace @smartspec/cloudflare-runtime test`: passed, 11 files / 70 tests.
- `node --test apps/cloudflare/wrangler.staging.config.test.mjs`: passed, 2 tests.
- Vite build: passed with `NODE_OPTIONS=--max-old-space-size=8192`; default 4 GiB Node heap failed during chunk rendering. One output chunk-size warning remains from the existing app.
- The clean Vite build requires generated exports from `@smartspec/remotion-render`; local setup built that package first, so CI now does the same before Vite.
- `pnpm dlx wrangler@4.151.1 deploy --config apps/cloudflare/wrangler.staging.jsonc --dry-run`: passed; 1,597 static files, Worker bundle 120.17 KiB / 28.15 KiB gzip.
- Local `wrangler dev --local`: native evidence keys 200; `/healthz` 200; browser navigation `/app/chat` 200 with SPA shell; unknown `/api/*` and auth proxy without origin both fail closed with 503; hashed Vite asset is `public, max-age=31536000, immutable`; `/` is `no-cache`.
- `git diff --check`: passed.

## CI follow-up

The first branch push had no previous commit (`github.event.before` was all zeroes), which made the existing Express architecture guard call `git merge-base` with an invalid object. The workflow now falls back to `origin/main` only when the supplied base does not resolve. The PR run also exposed that a clean checkout needs the Remotion schema package built before Vite; CI now builds that workspace package first. Re-check both repairs on the next CI SHA.

## External acceptance still pending

- `wrangler whoami` reports unauthenticated; no Worker deployment was attempted. Live staging URL, staging origin attestation credentials, and permitted staging route/domain are absent.
- Browser Playwright is not installed/available in this worktree; no browser E2E was run. Staging login/OAuth, CSRF, refresh/revocation, cookies, and two-tenant isolation remain unverified.
- The Worker static shell contains SmartAIHub canonical metadata, not tenant-specific server-rendered SEO. Canonical tenant data is resolved by the existing Linux authority; no tenant record or configuration was cloned or changed.
- No explicitly disposable PostgreSQL database or restricted test role was available. Local PostgreSQL listening on loopback was not used. No Hyperdrive/Drizzle prepared query, transaction, or pool integration proof was run.
- No production route/DNS, tenant records, credentials, database schema/location, SPEC-224, job ownership, activation, or consumer state changed.

Next action: obtain approved staging Worker/auth origin access, two staging tenant identities, restricted disposable PostgreSQL role, and browser E2E access. Then deploy only the isolated staging Worker and run the live acceptance matrix before considering any app-domain routing.

## Integration receipt

- PR [#1049](https://github.com/naibarn/SmartSpecPro/pull/1049) merged at `2026-10-17T08:33:53Z` as `14a41020c8ba9e25309ca0cc8da48663542735d3`; verified reachable from `origin/main`.
- Required PR checks on implementation SHA `6f1c735d7e5c585c040382311f1bd93d6d2b102d`: Mocked SPEC-308 passed, Cloudflare `local-contract` passed (including Vite/Worker/static assets/workerd), and progressive integration gate passed. The duplicate push-trigger local-contract also passed. `build-preview` was skipped by workflow policy.
- The first CI attempt exposed two workflow issues: branch-creation push supplied an all-zero `before` SHA to the Express architecture guard, and clean CI needed the generated Remotion schema package before Vite. Repairs were included in `6f1c735` and all required PR checks passed on that SHA.
- Latest integrated source at receipt: `14a41020c8ba9e25309ca0cc8da48663542735d3`. Live staging, browser auth, tenant record clone, and restricted disposable DB proof remain open and are not implied by CI.
