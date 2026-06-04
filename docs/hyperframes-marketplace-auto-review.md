# HyperFrames Marketplace Auto Review

## Purpose

Feature 119 adds a HyperFrames composition adapter to Marketplace Auto Review.
It creates deterministic storyboard motion previews, product explainers, final
caption composites, snapshots, and Library-ready metadata from approved
Marketplace Auto Review state.

HyperFrames is additive. It does not replace Marketplace Capture, Standard
Order, Storyboard Review, Video Editor, Media Library, credits, or audit.

## User Behavior

- Auto Storyboard Review is auto-first on Product Detail.
- The normal Auto path uses one primary CTA and backend-selected defaults.
- Users do not need to choose template, platform, render engine, frame strategy,
  shot count, audio strategy, or text policy before starting Auto.
- Standard Order remains visible and uses the existing
  `marketplaceCapture.startAutoReview` flow for `storyboard_images` and
  `full_video`.
- Advanced Auto overrides are optional and resettable.

## Runtime APIs

New additive `marketplaceCapture` procedures:

- `getAutoStoryboardReviewPlan`
- `startAutoStoryboardReview`
- `createHyperframesPreview`
- `getHyperframesRenderJob`
- `listHyperframesTemplates`
- `cancelHyperframesRenderJob`
- `saveHyperframesRenderToLibrary`

Existing Standard procedures remain unchanged.

Admin/operator procedures:

- `inspectHyperframesRenderDiagnostics`
- `cancelHyperframesRenderJobAsOperator`
- `replayHyperframesDeadLetter`
- `disableHyperframesTemplate`
- `enableHyperframesTemplate`

The reusable admin UI surface is
`HyperframesOperatorDiagnosticsPanel`; it must be mounted only in admin/operator
contexts and only displays sanitized diagnostics. Admin/system-agent users can
access these controls directly; delegated owner/operator/support users require
`MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED`.

## Feature Flags

All flags default to safe non-running behavior:

- `MARKETPLACE_HYPERFRAMES_ENABLED`
- `MARKETPLACE_HYPERFRAMES_TENANT_ALLOWLIST`
- `MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED`
- `MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE`
- `MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED`
- `MARKETPLACE_HYPERFRAMES_TEMPLATE_ALLOWLIST`

## Dependency Status

Package installation is intentionally deferred in this implementation slice.
The audit gate records `partial` until exact package names, pinned versions,
license/provenance, native/postinstall behavior, Chrome, FFmpeg, fonts, and
worker-image compatibility are approved.

The MVP smoke renderer uses the existing Playwright Chromium and FFmpeg runtime
to verify worker execution, fixtures, snapshots, browser evidence, and
MediaStudio-to-Library handoff without importing `@hyperframes/*`.

The web bundle must not import `@hyperframes/*`.

## Ledger Strategy

MVP uses existing Marketplace Auto Review runtime tables:

- `marketplace_auto_review_outbox_jobs`
- `marketplace_auto_review_artifacts`

Dedicated HyperFrames tables are deferred until query volume, operator history,
retention, billing, or render-level indexing requires them.

## Storage Paths

Tenant/run scoped paths:

```text
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/input.json
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/composition/index.html
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/composition/assets/...
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/snapshots/frame-000.png
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/output.mp4
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/manifest.json
```

Normal user UI must not expose raw HTML, signed URLs, local paths, storage keys,
or full worker logs.

## Release Gates

Focused gates:

```bash
npm --prefix apps/web run test -- shared/hyperframes
npm --prefix apps/web run test -- server/services/__tests__/hyperframes
npm --prefix apps/web run test -- server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts
npm --prefix apps/web run test -- client/src/components/marketplaceCapture
npm --prefix apps/web run check
npm --prefix apps/web run hyperframes:dependency-audit
npm --prefix apps/web run hyperframes:doctor
npm --prefix apps/web run hyperframes:fixture-render
npm --prefix apps/web run hyperframes:snapshot-test
npm --prefix apps/web run hyperframes:production-rollout-gate
```

Browser evidence gate:

```bash
npm --prefix apps/web run e2e:marketplace-hyperframes
```

The current browser gate includes fixture-backed responsive evidence for Auto,
Standard Order preservation, Storyboard Review, MediaStudio handoff, Library,
Media History, and Video Editor handoff. It covers mobile/tablet/desktop,
light/dark schemes, reduced motion, keyboard focus, and axe checks.

A seeded authenticated route journey remains a production-rollout gate before
enabling `@hyperframes/*` execution. The `hyperframes:production-rollout-gate`
command is expected to stay `blocked` until exact package versions, license,
provenance, native postinstall scripts, worker image, fonts, Chrome, seeded
route E2E, and golden snapshots are approved.
