# Moli Agent UAT Handoff

## Outcome

Moli is now the default browser engine for authenticated SmartAIHub development
UAT. `npm run test:uat` starts Moli in a systemd system service with direct
network egress denied, connects Playwright over loopback CDP, and uses the
existing local UAT session broker. `npm run test:uat:chromium` remains available
for browser behavior and screenshots representative of a human user.

The browser retains the `https://smartaihub.app` origin, normal TLS validation,
existing auth/session/tenant permission checks, and SmartAIHub Gateway API
contract. The only browser egress is through a loopback CONNECT proxy which
allows `smartaihub.app:443` and `api.smartaihub.app:443`; direct provider hosts
are denied. Session revocation and Moli service/profile cleanup run after each
test. The run-scoped rootfs is removed by global teardown.

## Verification

- Moli authenticated UAT: 6 passed, 0 skipped, 0 flaky. Run:
  `apps/web/test-results/smarthub-uat/42bc16f0-21c0-476b-93d1-2a1da7eae0c0`
- Gateway Integration UAT: real OpenRouter response through SmartAIHub Gateway,
  20 tokens recorded against the isolated test tenant. Receipt:
  `apps/web/test-results/smarthub-uat/42bc16f0-21c0-476b-93d1-2a1da7eae0c0/uat-gateway-integration-au-e5acc-cords-scoped-provider-usage-moli/gateway-integration-receipt.json`
- Network evidence records `/api/v1/models`, `/api/v1/chat/completions`, no
  provider attempts, no request failures, and revoked session:
  `apps/web/test-results/smarthub-uat/42bc16f0-21c0-476b-93d1-2a1da7eae0c0/uat-gateway-integration-au-e5acc-cords-scoped-provider-usage-moli/network-evidence.json`
- Route evidence confirms the Cloudflare development tunnel targets, verified
  TLS, gateway health and systemd egress probe:
  `apps/web/test-results/smarthub-uat/42bc16f0-21c0-476b-93d1-2a1da7eae0c0/route-evidence.json`
- Chromium owner dashboard smoke: 1 passed. Screenshot:
  `apps/web/test-results/smarthub-uat/0f65f60c-b7b3-4efc-abfc-c9ac08d417f8/uat-authenticated-navigati-7c47b--its-actual-tenant-identity-chromium/authenticated-page.png`
- Moli runtime isolation unit tests: 3 passed.
- Moli's network evidence records the lack of a screenshot in its structured
  profile. A diagnostic `--layout` screenshot was tried but made an existing
  visibility assertion fail and consumed substantially more CPU. The default
  Moli profile remains structured/DOM-first; use the passing Chromium profile
  for visual screenshot evidence.

The route used the existing Debian development services and Cloudflare tunnel;
no public DNS change or production deployment was made. The public AI provider
was reached only by the authorized SmartAIHub Gateway.

## Changed implementation

- `apps/web/tests/e2e/uat/moliUatRuntime.ts`
- `apps/web/tests/e2e/uat/globalSetup.ts`
- `apps/web/tests/e2e/uat/globalTeardown.ts`
- `apps/web/tests/e2e/uat/authenticated.fixture.ts`
- `apps/web/tests/e2e/uat/authenticated-navigation.spec.ts`
- `apps/web/playwright.config.ts`
- `apps/web/package.json`
- `apps/web/server/services/moliUatRuntime.test.ts`
- `skills/orchestra/SKILL.md`
- `skills/orchestra/references/ui-browser-verification.md`

SPEC-208 implementation and ownership records were not changed. Moli remains a
development test dependency; no application authentication behavior changed.

## Next action

Source branch: `codex/moli-authenticated-uat`

Base and expected canonical SHA: `bdb2f6f2576f5a327cfde18dfe774d662312abff`

The implementation, full Moli UAT, Chromium smoke, and focused runtime tests are
complete. The FAST INTEGRATION GATE passed locally: focused tests passed,
`git diff --check` is clean, no conflict state or staged unrelated paths exist,
and the source contains no credentials. The task-owned source paths are ready
for an explicit-path commit and protected PR. PR/commit/integrated SHA will be
recorded here after confirmation.

Keep `apps/web/test-results/smarthub-uat/` untracked as local evidence; do not
stage it.
