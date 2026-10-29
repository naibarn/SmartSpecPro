# Auth Login Environment Module Resolution

Date: 2026-10-29 (Asia/Bangkok)
Integrated source: `7fd27c7dfb037d5a4bfc1452b4ed33ad82d93d98`

## Finding and change

An authenticated-UAT run had reported `The requested module './_core/env' does not provide an export named 'ENV'`. The login resolver used a dynamic extensionless import while the checkout contains both `env.ts` and a legacy `env.js` module at that path. `auth.login` now uses a static import with the explicit `.ts` source extension so the TypeScript runtime cannot select the stale JavaScript sibling.

Added a local authenticated-UAT regression that submits an intentionally invalid `.invalid` account and expects the normal `401` rejection. This exercises the real login route and confirms it does not fail while loading `ENV`.

## Verification

- `JWT_SECRET=spec294-auth-login-module-load-test-2026-10-29 pnpm --dir apps/web exec vitest run server/routers.appShape.test.ts server/__tests__/authLoginError.test.ts --reporter=dot` — **2 files, 5 tests passed**.
- `NODE_OPTIONS='--import=tsx' NODE_ENV=development SMARTSPEC_BROWSER_UAT=1 SMARTSPEC_UAT_BROWSER=chromium pnpm exec playwright test tests/e2e/uat/auth-login-module.spec.ts tests/e2e/uat/chat-transcript-recovery.spec.ts --project=chromium --reporter=line` from `apps/web` — **2 tests passed** against the isolated local development web service and authenticated UAT session broker. The login probe returned `401`; transcript failure remained visibly retryable. The prior named-export error did not recur.
- `git diff --check` — passed.

The browser test used a synthetic `.invalid` account and made no valid-account login or credential change. This is local UAT evidence only; it does not establish public-site serving provenance or root-cause the separately observed hosted `chat.getMessages` / `workerJobs.observability` 500 responses. SPEC-224 genuine two-child Runner receipts, settlement, automatic continuation and Independent Final Verify remain open.
