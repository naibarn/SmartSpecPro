# Orchestra Plan

## Task
Close the final HyperFrames Marketplace Auto Review production-convergence
findings and establish a finishable evidence lane that does not touch the
shared port 3000 server.

## Classification
- scope: medium
- risk: high
- affected_domains: Marketplace Capture Product Detail UI, Playwright route evidence, rollout evidence gate, runbook/docs, implementation artifacts
- chosen_route: direct-inline-waves
- dispatch_preference: codex-standard-light
- planned_agents: []

## SocratiCode Preflight
- status: green index, watcher active
- narrowed files:
  - `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
  - `apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts`
  - `apps/web/playwright.config.ts`
  - `apps/web/package.json`
  - `apps/web/scripts/hyperframes-production-rollout-gate.mjs`
  - `apps/web/scripts/__tests__/hyperframes-production-rollout-gate.test.ts`
  - `docs/hyperframes-marketplace-auto-review.md`
  - `docs/runbooks/hyperframes-marketplace-auto-review.md`
  - `specs/feature/119-hyperframes-marketplace-auto-review-render-adapter/implementation/implementation-summary.md`

## Findings To Close
- Product Detail route evidence must prove the Auto Storyboard Review first
  action, Auto CTA, and Standard Order entry all appear in the first mobile
  viewport, and that Auto appears before Product Summary.
- The browser evidence workflow must not stop, kill, or depend on the shared
  port 3000 server.
- Rollout gate readiness output must separate MVP smoke evidence from production
  Chrome/FFmpeg runtime prerequisites so a blocked producer rollout is not
  confused with a failed local smoke flow.
- Docs, runbook, review notes, and implementation summary must match the current
  no-kill evidence lane and Product Detail Auto-first proof requirements.
- Fresh route evidence must be regenerated from the updated code on an alternate
  Playwright port, then inspected and gated.

## Implementation Waves
1. Remove destructive port-3000 kill behavior from dev scripts and move
   Playwright evidence to a configurable alternate port.
2. Add Product Detail first-viewport/order evidence to the route E2E suite and
   require that proof in the rollout gate.
3. Add rollout-gate tests for missing/inverted Product Detail proof and for MVP
   smoke readiness staying true while production runtime prerequisites are
   blocked.
4. Update docs/runbook/implementation notes so future evidence refreshes use the
   no-kill lane.
5. Rebuild/check, rerun focused tests, refresh route evidence on an alternate
   port, inspect the Product Detail screenshot, and rerun rollout gates.
6. Stage all changed source, docs, and refreshed evidence artifacts needed for a
   reproducible handoff.

## Verification Plan
- `git diff --check`
- `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- Focused Vitest coverage for rollout gate, Marketplace Auto Review service,
  routers, runtime API, Product Detail/Marketplace capture components, UI state,
  Library/Media History/Video Editor helpers.
- `PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes`
- Visual inspection of
  `apps/web/test-results/marketplace-hyperframes/route-product-detail-390x844.png`.
- `npm --prefix apps/web run hyperframes:production-rollout-gate`
- stale-evidence rollout gate command with `MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS=1`
- targeted review convergence after the last code/artifact change.

## 2026-06-05 Tenant Config Enablement Addendum

## Task
Move normal Marketplace HyperFrames enablement out of environment editing and
into the existing Admin Tenant Feature Flags UI while preserving environment
values as global safety/runtime guards.

## Implementation Waves
1. Add tenant-level HyperFrames flags to the shared tenant feature flag contract,
   defaults, allowlist, Redis sync, and Admin Tenant Feature Flags grouping.
2. Route Product Detail auto-plan, runtime API, auto-preview queue, operator
   procedures, and the render worker through tenant flag access checks.
3. Preserve the Standard Order/manual Marketplace Capture path and fail closed
   when tenant flags are disabled or tenant config cannot be read.
4. Update docs/runbook/dependency audit notes so Admin Tenant Feature Flags is
   the normal rollout path and env vars are described only as safety/runtime
   guards.
5. Run focused Vitest, TypeScript, dependency audit, doctor, and rollout-gate
   verification without touching the shared port 3000 server.
