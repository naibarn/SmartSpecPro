# Cloudflare Admin Authority and Deployment Handoff

Status: partial implementation; production and live staging remain unverified.

Source base: `cb67dc2c3f4801ecc4dd258cc2cf06db1cb5360c` (`origin/main`, 2026-10-17).
Worktree: `/home/dev/.cache/codex/canonical-sources/f29801373bfd4154c0d8/cloudflare-credential-path-20261017`.
Branch: `codex/cloudflare-credential-path-20261017`.

## Findings

- Cloudflare profiles remain in the existing encrypted credential center. The probe resolves the saved profile server-side and does not return token material.
- SmartAIHub Admin requests authenticate only from a verified bearer/session cookie. The database user role is passed to tRPC guards. The general Admin guard admits `admin` and `system_agent`; the Cloudflare credential metadata/target routes use an exact-admin guard and intentionally reject `system_agent`.
- A direct local Admin API call without an Admin session is rejected by SmartAIHub before database or Cloudflare access. This does not establish that the saved Cloudflare profile is missing or invalid. The supplied UI evidence shows the account permission catalog request succeeded, so the User Catalog 403 is a separate Cloudflare user-scope result.
- The Cloudflare User Permission Catalog requires a user-scoped permission. Its 403 does not prove that account/zone access or Workers deployment is unavailable. Do not add user-token permissions unless the complete user catalog is needed.
- Current Cloudflare read probes do not verify the saved token itself or return the resolved Zone ID. A new GET-only token verification is added to the existing probe; only status, HTTP code, Account ID, and the matching `smartaihub.app` Zone ID are returned.
- The scoped `provider_deployment_targets` plus encrypted `provider_deployment_credentials` resolver exists. No executable staging deployment adapter/pipeline was found. Do not use an unscoped Admin profile or Wrangler's unrelated local login as a substitute for exact staging target authorization.

## Implementation and verification

- Added Cloudflare token verification through `GET /user/tokens/verify`; only `active`, invalid, or unavailable status is exposed. The token ID and value are discarded.
- Cloudflare probes now accept an injected fetch for tests and return Account/Zone identifiers only after authorized read responses.
- Credential Center copy explains that User Catalog HTTP 403 is independent of Workers deployment capability.
- Added regression coverage that exact-admin credential metadata remains inaccessible to anonymous, regular-user, and system-agent callers.
- `cloudflarePermissionCatalog.test.ts`: passed, 19 tests.
- Filtered targeted permission/authority tests: passed, 21 tests; 6 unrelated tests skipped by filter.
- Full `infrastructure.deploymentTargets.test.ts`: 7 passed, 1 failed at the existing staged-preflight fixture (`STAGING_PREFLIGHT_READY` expected `PASS`, received `PENDING`). This assertion is outside the Cloudflare credential guard and was not changed.
- TSX syntax transpilation and `git diff --check`: passed.
- No live Cloudflare probe was issued because this session has no Admin browser/session authority. No token was read into agent context.

## Remaining work / blocker

- A live authorized Admin call is still required to verify the saved token, Account/Zone IDs, and effective Workers Scripts Read access. The screenshot's User Catalog 403 alone does not prove any deployment permission is missing.
- The repo has no staging deployment adapter or live Cloudflare deployment workflow. A safe adapter must use the exact persisted staging target and its environment-scoped credential, plus an authenticated, provenance-checked build artifact. The current worktree cannot inspect target records or stage a deployment because the Admin session is unavailable. Do not deploy until these are resolved.
- After an authorized Admin session is available: probe the existing profile, inspect the exact staging target binding/credential state, implement or wire the staging-only adapter if absent, then deploy only `smartspec-cloudflare-staging` from `wrangler.staging.jsonc` and run SPA/API/fail-closed/rollback checks. Keep Production DNS/routes/activation and Queue/Cron consumers untouched.

## Integration receipt

PR [#1053](https://github.com/naibarn/SmartSpecPro/pull/1053): `Cloudflare Admin authority diagnostics and read-only token verification` from `codex/cloudflare-credential-path-20261017` into `main`.

Implementation SHA `98bd97d7e9a1670934ffe73d82b28122547d74e1`. Required PR checks on this SHA passed: `local-contract` (including local Vite/Worker/static checks), `Mocked SPEC-308 browser simulation`, and `progressive_integration_gate`. `build-preview` was skipped by workflow policy. PR is open with clean merge state; review is pending.

No merge or live deployment was performed. The staging deployment adapter, live saved-token verification, and staging acceptance remain open pending authenticated Admin/target authority and a trusted source artifact path.

Update for PR #1053 follow-up: the failing staging-preflight fixture was subsequently added to Cloudflare local-readiness CI. CI identified the exact fixture defect: its trusted qualification expired on 2026-10-12 while the test ran on 2026-10-17. The service correctly failed closed. The fixture expiry is corrected to 2030-10-12; the expected `PASS` behavior remains unchanged. The exact test is rerunning in CI on PR head `86b39ec740e296d82505dd80bdcdab30104ba151` or its later repair head.
