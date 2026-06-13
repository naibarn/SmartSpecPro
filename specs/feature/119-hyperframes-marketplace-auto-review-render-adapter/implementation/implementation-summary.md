# Feature 119 Implementation Summary

Date: 2026-06-04

## Completed Sections

Implemented all planned sections as an additive MVP slice:

1. Shared HyperFrames contracts, runtime API schemas, status copy, templates,
   auto plan, feature access, idempotency helpers, and contract tests.
2. Backend feature access, auto plan, template registry, composition builder,
   sanitizer, asset staging, QA, render state, worker policy, runtime API,
   Library finalize, operator, retention, dependency audit, and doctor services.
3. Additive `marketplaceCapture` tRPC procedures:
   `getAutoStoryboardReviewPlan`, `startAutoStoryboardReview`,
   `createHyperframesPreview`, `getHyperframesRenderJob`,
   `listHyperframesTemplates`, `cancelHyperframesRenderJob`, and
   `saveHyperframesRenderToLibrary`.
4. Product Detail dual-mode UI with Auto-first panel, backend plan summary,
   advanced override disclosure, render panel, and preserved Standard Order
   controls.
5. Storyboard Review HyperFrames preview/result panel entry point via render
   query context, with safe repair/fallback UI.
6. MediaStudio render-to-Library session source extension for
   `marketplace_auto_review_hyperframes_render`.
7. Fixture matrix, Playwright browser evidence gate, dependency/doctor,
   fixture-render, snapshot scripts, docs, and rollback runbook.
8. Follow-up hardening for Library/Media History/Video Editor surface
   projection, operator audit/metrics/dead-letter replay guard, destructive
   retention purge adapter, expanded accessibility/responsive evidence, and a
   production rollout gate for pinned `@hyperframes/*` package execution.
9. Production hardening for operator procedures: delegated operator guard,
   explicit tRPC output schemas, replay token/hash/template/access checks,
   persisted sanitized audit events, and mounted admin diagnostics UI.

## Dependency Decision

HyperFrames runtime package installation was deferred in the original MVP
slice. That MVP used a local Playwright Chromium + FFmpeg smoke renderer for
worker, fixture, snapshot, and handoff gates without importing `@hyperframes/*`
into the web app bundle.

Direction update on 2026-06-13: the smoke renderer is diagnostic-only and must
not be expanded into a production-equivalent renderer. Future production
HyperFrames output must be produced by official HyperFrames CLI,
`@hyperframes/producer`, or producer server in a dedicated worker. Production
execution remains gated by dependency audit, doctor, production rollout, seeded
route E2E, worker-image, font, Chrome, FFmpeg, golden snapshot evidence, and
the version-maintenance/canary/rollback pipeline documented in the updated
Feature 119 spec and
`docs/portable-skill-pack/specs/2026-06-13-hyperframes-render-platform-design.md`.

## Verification

Passed smoke and implementation gates:

```bash
npm --prefix apps/web run test -- client/src/components/marketplaceCapture server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts shared/hyperframes server/services/__tests__/hyperframes
npm --prefix apps/web run check
npm --prefix apps/web run hyperframes:dependency-audit
npm --prefix apps/web run hyperframes:doctor
npm --prefix apps/web run hyperframes:fixture-render
npm --prefix apps/web run hyperframes:snapshot-test
npm --prefix apps/web run e2e:marketplace-hyperframes
```

Expected blocked production-readiness gate until external runtime proof is
approved:

```bash
npm --prefix apps/web run hyperframes:production-rollout-gate
```

Notes:

- The Playwright gate covers fixture-matrix assertions plus responsive browser
  evidence for Auto, preserved Standard Order, Storyboard Review, and
  MediaStudio Library handoff states. The evidence now includes 360x800,
  390x844, 768x1024, 1024x768, and 1440x900 viewports, light/dark color
  schemes, reduced motion, keyboard focus, axe checks, Library/Media History,
  and Video Editor handoff affordances.
- The dependency audit gate reports `partial` by design until official
  HyperFrames runtime packages are pinned and approved for the worker image.
- The doctor reports diagnostic smoke readiness only for worker plumbing. It
  must also prove HyperFrames CLI/producer availability before any user-facing
  render can be marked complete.
- The production rollout gate remains `blocked` until pinned versions, license,
  provenance, native postinstall review, worker image, fonts, Chrome, FFmpeg,
  golden snapshots, compatibility fixtures, canary, and rollback proof pass.
  Diagnostic smoke readiness cannot unlock custom overlay/caption/audio/SFX
  production features. Fresh seeded route E2E evidence clears the seeded-route
  gate only when the route suite runs before the rollout gate and the generated
  evidence is inside the configured freshness window
  (`MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS`, default 24 hours).
  Manual seeded-route env flags cannot bypass missing or stale route evidence
  in the CLI gate.
- Browser evidence refreshes use a no-kill Playwright lane by default:
  `PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes`.
  Port 3000 does not need to be stopped or restarted. To validate a specific
  already-running server, pass `PLAYWRIGHT_SKIP_WEB_SERVER=1` and
  `PLAYWRIGHT_BASE_URL`.
- Tenant rollout is controlled through the existing Admin Tenant Feature Flags
  UI, not by editing environment files. Enable the tenant flags
  `marketplaceHyperframesEnabled`, `marketplaceHyperframesWorkerEnabled`,
  `marketplaceHyperframesLibrarySaveEnabled`, and
  `marketplaceHyperframesOperatorEnabled` from `Admin -> Tenants -> Edit Tenant
  -> Feature Flags -> Media Production & HyperFrames`. Environment values remain
  global safety/runtime guards only.
- Auto remains one-click by default, while Advanced Auto overrides now provide
  optional user controls for platform format, quality, image model, audio
  policy, text policy, shot count, and frame evidence strategy. The advanced
  controls are collapsed by default, resettable with `Use auto plan`, and do not
  expose template or render-engine selection.

## Git Workflow Note

No section commits were created because the repository worktree already contained
many unrelated dirty/untracked Feature 117/119 files. Changes were kept additive
and verified without reverting unrelated work.
