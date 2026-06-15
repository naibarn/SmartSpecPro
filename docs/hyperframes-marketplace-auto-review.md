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
- Storyboard Review final composite opens with the HyperFrames settings panel
  collapsed by default so unavailable or secondary tools do not interrupt the
  review workflow. If no completed MP4/video shot exists, render stays disabled
  and the visible status explains that images/storyboard frames are not valid
  final-render source video, shows detected image/pending-video counts, and
  tells the user to create or import at least one MP4 shot.
- When expanded, the user can inspect and edit the full HyperFrames render
  prompt, hook copy, per-shot overlays, subtitles, audio choices, and a JSON
  payload preview before creating the final official HyperFrames render job.
  Payload JSON, audio event map, and text layout preview are collapsible
  secondary sections. The prompt is a complete product-video instruction, not a
  short style brief: it includes product context, headline/subheadline,
  evidence-backed feature callouts, price/trust text when available,
  storytelling beats, animation timing, subtitle/audio policy, and MP4 export
  requirements.
- Auto Storyboard Review may use the `hyperframes-render-prompt` skill when
  deterministic product/spec extraction is not enough. The skill rewrites raw
  product facts into concise, premium Thai overlay copy and a complete
  HyperFrames render prompt while preserving product-truth constraints.

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

- `Marketplace HyperFrames` -> `marketplaceHyperframesEnabled`
- `HyperFrames Worker Queue` -> `marketplaceHyperframesWorkerEnabled`
- `HyperFrames Library Save` -> `marketplaceHyperframesLibrarySaveEnabled`
- `HyperFrames Operator Controls` -> `marketplaceHyperframesOperatorEnabled`

The Admin Tenant UI shows the friendly label first and the internal `Key: ...`
line underneath each flag. Searching by either label or key should find the same
tenant toggle.

HyperFrames rollout and user-visible behavior are controlled from Admin Tenant
Feature Flags only, not by editing environment variables. The runtime verifies
the installed official CLI/browser package directly; legacy HyperFrames env
flags are ignored by the app runtime.

## Dependency Status

Production render output must use the official HyperFrames CLI,
`@hyperframes/producer`, or producer server in a dedicated worker. SmartSpecPro
must not expand the previous local Playwright/FFmpeg smoke renderer into a
production-equivalent renderer.

Package installation remains gated until exact package names, pinned versions,
license/provenance, native/postinstall behavior, Chrome, FFmpeg, fonts, and
worker-image compatibility are approved.

Diagnostic smoke rendering may verify worker plumbing, fixtures, browser
evidence, and MediaStudio-to-Library handoff, but it cannot mark a user-facing
HyperFrames render complete, reserve/consume credits, or unlock producer-only
creative features.
`hyperframes:doctor` must prove the runtime satisfies the SmartSpecPro Node
engine range, HyperFrames CLI/producer availability, browser/FFmpeg/FFprobe
availability, temp workspace cleanup, storage access, and Thai-capable render
fonts before reporting official runtime readiness.
`hyperframes:fixture-render` renders a compatibility fixture with the pinned
official HyperFrames CLI and writes `officialRuntime: true` evidence; diagnostic
Playwright/FFmpeg manifests are no longer accepted as final fixture proof.
`hyperframes:official-compatibility` compares pinned `hyperframes` and
`@hyperframes/producer` versions with npm latest, runs the official fixture when
Node >=22.22 is available, and writes the maintenance report used before canary
promotion.

The web bundle must not import `@hyperframes/*`.

The production rollout gate reports official runtime readiness modes:

- `runtimeMode: "official_runtime_blocked"` means only contracts, queue state,
  disabled UI, and diagnostics are allowed.
- `runtimeMode: "official_cli_ready"` means a dedicated worker can render with
  the HyperFrames CLI.
- `runtimeMode: "official_producer_ready"` means package, supply-chain,
  worker-image, Chrome, FFmpeg, seeded-route E2E, and golden snapshot evidence
  all passed for `@hyperframes/producer` or producer server.
- `runtimeMode: "canary"` means a candidate pinned HyperFrames version is
  limited to selected tenants/jobs.
- `runtimeMode: "rollback"` means new jobs use the previous pinned official
  runtime while existing artifacts remain readable.

`installCommandAllowed` must be `true` before running any package install command
for `@hyperframes/producer` or `hyperframes`. When the gate is blocked,
`requiredEvidence` lists the exact missing approvals or runtime checks.
`officialRuntimeReady` is true only when the web bundle excludes
`@hyperframes/*`, the worker image owns the runtime dependency, and fresh seeded
route E2E evidence proves Product Detail Auto-first first-viewport ordering plus
Storyboard Review, MediaStudio, Library, Media History, and Video Editor
handoffs.

## Version Maintenance

HyperFrames package and CLI versions are pinned in the runtime registry. A
read-only update detector may check GitHub/npm for newer releases, but it must
open an update report or PR instead of changing production behavior directly.

Every candidate update must run:

- dependency audit and doctor;
- official runtime fixture render;
- snapshot/golden comparison;
- compatibility suite for overlays, Thai captions, CTA/disclosures,
  evidence-bound price/spec/rating copy, transitions, generated-clip
  composites, music/SFX, source-audio preservation, and overflow inspection;
- seeded route E2E and Library/Media History handoff checks;
- canary rollout and rollback proof.

Every render job records the HyperFrames CLI/package versions, Node,
Chrome/headless-shell, FFmpeg/FFprobe, font profile, worker image digest,
template hash, composition hash, and runtime mode used to create the output.

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
npm --prefix apps/web run hyperframes:official-compatibility
npm --prefix apps/web run hyperframes:rollback-drill
npm --prefix apps/web run hyperframes:production-rollout-gate
```

`hyperframes:doctor` exits non-zero when Node, HyperFrames CLI/producer,
browser, FFmpeg/FFprobe, fonts, storage, or temp workspace evidence is missing.
`hyperframes:dependency-audit`, `hyperframes:doctor`,
`hyperframes:fixture-render`, `hyperframes:snapshot-test`,
`hyperframes:official-compatibility`, `hyperframes:rollback-drill`, and the
browser E2E write dated evidence under
`apps/web/test-results/marketplace-hyperframes`. `hyperframes:production-rollout-gate`
reads those artifacts and exits non-zero while official runtime rollout is
blocked. Diagnostic-only environments remain blocked for user-facing completion
until dependency, worker-image, font, Chrome, FFmpeg, seeded-route,
official-fixture, golden-baseline, compatibility, and rollback proof are fresh
and hash-consistent.

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
The official fixture render gate also requires source-video preservation,
multi-scene transitions, native-audio policy, and music/SFX event-map coverage
from assets consumed by the pinned HyperFrames CLI.
The rollout gate only accepts seeded route evidence generated within the
freshness window. The default window is 24 hours and can be overridden with
`MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS`. The CLI gate does not let
manual seeded-route env flags bypass missing or stale route evidence.

For local evidence refreshes, the Playwright config defaults to port 3017 and
does not stop port 3000. To test an existing server, set
`PLAYWRIGHT_SKIP_WEB_SERVER=1` with `PLAYWRIGHT_BASE_URL`.

A seeded authenticated route journey remains a production-rollout gate before
enabling official HyperFrames execution. The
`hyperframes:production-rollout-gate` command is expected to stay `blocked`
until exact package versions, license, provenance, native postinstall scripts,
worker image, fonts, Chrome, FFmpeg, and golden snapshots are approved. Fresh
seeded route E2E evidence satisfies the seeded-route gate only when it runs
before `hyperframes:production-rollout-gate` and remains inside the configured
freshness window.
FFmpeg readiness must be provided explicitly with
`MARKETPLACE_HYPERFRAMES_FFMPEG_READY=true`; missing evidence is treated as
`ffmpeg_not_ready`, keeps `productionRuntimePrerequisitesReady` false, and keeps
the production rollout gate blocked.
