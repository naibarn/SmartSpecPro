# SPEC-308 isolated browser simulation

## Authority and scope

- This is a deterministic Playwright simulation, not live acceptance. The test intercepts `/api/tenant/current` and tRPC calls and supplies the synthetic `spec-308-browser@smartspec.local` identity and `tenant-spec-308-browser` tenant.
- No approved non-production app/API endpoint, database/control-plane credentials, or authorized persistent test identity was available in this task worktree. No production credentials or active primary-checkout services were used.
- Browser run used the Vite client on loopback with a Playwright Chromium context; no backend requests were authorized by the test fixture.

## Browser checks

The isolated spec `apps/web/tests/e2e/spec-308-dual-surface.spec.ts` passed 7 tests:

1. Synthetic authenticated identity resolves through mocked APIs.
2. Launcher uses the mascot renderer and keeps the existing dialog entry point.
3. AI Chat and Feedback tabs remain reachable.
4. Unsaved feedback title survives tab changes.
5. Unsaved Chat draft survives Chat ↔ Task Control ↔ Chat.
6. OS reduced-motion preference is emulated while the launcher remains usable.
7. No horizontal overflow at 320, 360, 390, 767, 768, and 1440 CSS pixels.

Responsive full-page captures are in `evidence/screenshots/{320,360,390,767,768,1440}x-authenticated-simulation.png`.

This simulation does **not** establish server-side tenant authorization, live Bell data/read behavior, a production-like Settings flow, real SSE delivery, or non-production runtime acceptance. Existing focused Bell, Settings, attention reducer, localization and reduced-motion tests remain unit/component evidence. No Requirement Ledger row is closed from this simulation alone.

## Command and result

```text
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3189 \
  pnpm --filter @smartspec/web exec playwright test \
  tests/e2e/spec-308-dual-surface.spec.ts --project=chromium
Result: 7 passed, 0 failed
```

The run was performed against the SPEC-308 source at PR head `5cfa6e0987934163389187b8a515f11d47035942`, with the isolated E2E spec and screenshots uncommitted in that same worktree. After recording the next commit, this evidence will be rebound to its exact SHA.
