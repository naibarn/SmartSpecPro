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
- Users may open Advanced Auto overrides as an optional add-on for useful
  choices such as platform format, quality, image model, audio policy, text
  policy, shot count, and frame evidence strategy. Template and render engine
  selection stay backend-managed.
- Standard Order remains visible and uses the existing
  `marketplaceCapture.startAutoReview` flow for `storyboard_images` and
  `full_video`.
- Advanced Auto overrides are optional and resettable with `Use auto plan`.
- Storyboard Review links created from Auto Review runs carry
  `hyperframesRenderJobId`, `productId`, and `runId` when a HyperFrames preview
  is queued, so the review page opens with the automatic preview status instead
  of requiring manual render setup.

## Runtime APIs

New additive `marketplaceCapture` procedures:

- `getAutoStoryboardReviewPlan`
- `startAutoStoryboardReview`
- `createHyperframesPreview`
- `getHyperframesRenderJob`
- `repairHyperframesRenderJob`
- `listHyperframesTemplates`
- `cancelHyperframesRenderJob`
- `saveHyperframesRenderToLibrary`

Existing Standard procedures remain unchanged.

`createHyperframesPreview` is scoped to supported preview requests in this
slice: `renderIntent=preview` and
`compositionMode=storyboard_motion_preview`. Unsupported final/variant/manual
render requests are rejected instead of being silently coerced to preview.

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
the tenant flag `marketplaceHyperframesOperatorEnabled`.

## Feature Flags

Tenant rollout is controlled from the existing Admin Tenant Feature Flags UI:
`Admin -> Tenants -> Edit Tenant -> Feature Flags -> Media Production &
HyperFrames`. Admins should not edit environment files to enable a tenant.

All Marketplace HyperFrames tenant flags default off:

- `marketplaceHyperframesEnabled`
- `marketplaceHyperframesWorkerEnabled`
- `marketplaceHyperframesLibrarySaveEnabled`
- `marketplaceHyperframesOperatorEnabled`

Environment variables are reserved for global safety/runtime readiness, not
normal tenant rollout. Explicit false values for legacy HyperFrames env flags
act as kill switches; `MARKETPLACE_HYPERFRAMES_TEMPLATE_ALLOWLIST` remains an
infra-level template restriction.

## Dependency Status

Package installation is intentionally deferred in this implementation slice.
The audit gate records `partial` until exact package names, pinned versions,
license/provenance, native/postinstall behavior, Chrome, FFmpeg, fonts, and
worker-image compatibility are approved.

The MVP smoke renderer uses the existing Playwright Chromium and FFmpeg runtime
to verify worker execution, fixtures, snapshots, browser evidence, and
MediaStudio-to-Library handoff without importing `@hyperframes/*`.
`hyperframes:doctor` must still prove the local runtime satisfies the
SmartSpecPro Node engine range, browser/FFmpeg/FFprobe availability, temp
workspace cleanup, and Thai-capable render fonts before it reports
`mvp_smoke_ready`.

The web bundle must not import `@hyperframes/*`.

The production rollout gate reports two distinct readiness modes:

- `runtimeMode: "smoke_only"` means the MVP smoke renderer is allowed, but
  `@hyperframes/*` producer execution remains blocked.
- `runtimeMode: "producer_ready"` means package, supply-chain, worker-image,
  Chrome, FFmpeg, seeded-route E2E, and golden snapshot evidence all passed.

`installCommandAllowed` must be `true` before running any package install command
for `@hyperframes/producer` or `@hyperframes/cli`. When the gate is blocked,
`requiredEvidence` lists the exact missing approvals or runtime checks.
`mvpSmokeReady` is true only when the web bundle excludes `@hyperframes/*` and
fresh seeded route E2E evidence proves the smoke flow, including Product Detail
Auto-first first-viewport ordering. `productionRuntimePrerequisitesReady`
reports the separate Chrome and FFmpeg readiness proof required before producer
execution.
Producer execution is separately gated by `HYPERFRAMES_RUNTIME_MODE=producer`
and `HYPERFRAMES_PRODUCTION_RUNTIME_READY=1`; do not set those until the
production rollout gate has passed.

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

Client polling must honor backend `polling` guidance and stop on terminal,
unavailable, or user-blocked render projections. This prevents disabled or
unauthorized HyperFrames surfaces from refetching indefinitely.

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

`hyperframes:doctor` exits non-zero when Node, browser, FFmpeg/FFprobe, fonts,
or temp workspace evidence is missing. `hyperframes:production-rollout-gate`
also exits non-zero while producer rollout is blocked; in MVP smoke-only
environments this is the expected safe result until external dependency,
worker-image, font, Chrome, FFmpeg, and golden-snapshot proof is approved.

Browser evidence gate:

```bash
PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes
```

The current browser gate includes fixture-backed responsive evidence for Auto,
Standard Order preservation, Storyboard Review, MediaStudio handoff, Library,
Media History, and Video Editor handoff. It covers mobile/tablet/desktop,
light/dark schemes, reduced motion, keyboard focus, and axe checks.
Route-level evidence covers Product Detail, Storyboard Review, MediaStudio,
Media History by source context, Media History by product/run-only context,
Document Management, and Video Editor handoff.
Route-level evidence must have no uncontained horizontal overflow elements;
intentional dense-tool controls may use internal horizontal scroll containers.
Product Detail route evidence must also prove the Auto Storyboard Review first
action, Auto CTA, and Standard Order entry remain inside the first viewport,
with the Auto first action appearing before Product Summary. This keeps the
Marketplace capture UX genuinely auto-first while preserving the standard
ordering path.
The rollout gate only accepts seeded route evidence generated within the
freshness window. The default window is 24 hours and can be overridden with
`MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS`. The CLI gate does not let
manual seeded-route env flags bypass missing or stale route evidence.

For local evidence refreshes, the Playwright config defaults to port 3017 and
does not stop port 3000. To test an existing server, set
`PLAYWRIGHT_SKIP_WEB_SERVER=1` with `PLAYWRIGHT_BASE_URL`.

A seeded authenticated route journey remains a production-rollout gate before
enabling `@hyperframes/*` execution. The `hyperframes:production-rollout-gate`
command is expected to stay `blocked` until exact package versions, license,
provenance, native postinstall scripts, worker image, fonts, Chrome, FFmpeg,
and golden snapshots are approved. Fresh seeded route E2E evidence satisfies the
seeded-route gate only when it runs before `hyperframes:production-rollout-gate`
and remains inside the configured freshness window.
FFmpeg readiness must be provided explicitly with
`MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true`; missing evidence is treated as
`ffmpeg_not_ready`, keeps `productionRuntimePrerequisitesReady` false, and keeps
the production rollout gate blocked.
