# SPEC-308 isolated browser simulation

## Authority and scope

- This is a deterministic Playwright simulation, not live acceptance. The test intercepts `/api/tenant/current` and tRPC calls and supplies the synthetic `spec-308-browser@smartspec.local` identity and `tenant-spec-308-browser` tenant.
- No approved non-production app/API endpoint, database/control-plane credentials, or authorized persistent test identity was available in this task worktree. No production credentials or active primary-checkout services were used.
- Browser run used the Vite client on loopback with a Playwright Chromium context; no backend requests were authorized by the test fixture.

## Browser checks

The isolated spec `apps/web/tests/e2e/spec-308-dual-surface.spec.ts` passed 9 tests:

1. Synthetic authenticated identity resolves through mocked APIs.
2. Launcher uses the mascot renderer and keeps the existing dialog entry point.
3. AI Chat and Feedback tabs remain reachable.
4. Unsaved feedback title survives tab changes.
5. Unsaved Chat draft survives Chat ↔ Task Control ↔ Chat.
6. OS reduced-motion preference is emulated; the greeting animation computes to `animation-name: none` and `0s`.
7. Settings selects and persists a mascot style in a user-and-tenant scoped key; switching the mocked tenant starts from its own default.
8. The demo reminder balloon CTA opens the existing notification Bell and displays the deterministic mock row.
9. No horizontal overflow at 320, 360, 390, 767, 768, and 1440 CSS pixels.

Responsive full-page captures are in `evidence/screenshots/{320,360,390,767,768,1440}x-authenticated-simulation.png`.

This simulation does **not** establish server-side tenant authorization (tenant switching is mocked), live Bell data/read behavior, real SSE delivery, or non-production runtime acceptance. The Settings route and Bell CTA are exercised in-browser against mocked APIs; no live preferences API or notification read was called. Existing focused Bell, Settings, attention reducer, localization and reduced-motion tests remain supporting component evidence. No Requirement Ledger row is closed from this simulation alone.

## Command and result

```text
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3189 \
  pnpm --filter @smartspec/web exec playwright test \
  tests/e2e/spec-308-dual-surface.spec.ts --project=chromium
Result: 9 passed, 0 failed
```

Exact source SHA tested: `91f52f0726d02e447c5ce85f736c38ab451263b7` (PR #399 head at execution). Result: 9 passed, 0 failed. The browser test and screenshot evidence are included in this SHA.
