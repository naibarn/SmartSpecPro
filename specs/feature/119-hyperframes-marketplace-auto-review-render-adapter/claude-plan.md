# Implementation Plan: Feature 119 HyperFrames Marketplace Auto Review Render Adapter

## 1. Objective

Build a HyperFrames render adapter for Marketplace Auto Review that can produce deterministic motion previews and final composition renders from approved product truth, storyboard frames, generated clips, captions, and disclosures.

The first release is not a rewrite. It preserves existing Feature 118 Marketplace Auto Review behavior and adds a dual-mode Product Detail experience:

- Auto Storyboard Review: recommended auto-first path with backend-selected defaults.
- Standard Order / Custom: existing explicit selector workflow for `storyboard_images` and `full_video`.

The implementation must keep HyperFrames behind feature flags and tenant allowlist until worker, dependency, security, and UI gates pass.

## 2. Baseline To Preserve

Preserve these current behaviors:

- `marketplaceCapture.startAutoReview`, `getAutoReviewRun`, `listAutoReviewRuns`, `advanceAutoReviewRun`, and `cancelAutoReviewRun`.
- `storyboard_images` and `full_video`.
- `storyboard_3x3_split` and `video_shot_start_stop`.
- `auto`, `native_video_audio`, `separate_tts_voiceover`, and `silent`.
- existing product/character/environment anchor requirements.
- active-run dedupe and background advancement.
- current run/stage persistence and timeline projection.
- Storyboard Review, MediaStudio, Video Editor, Library, and Media Panel handoffs.
- Standard Order visibility and successful start behavior while Auto mode is enabled.

## 3. High-Level Architecture

Target flow:

```text
Product Detail
  -> getAutoStoryboardReviewPlan
  -> startAutoStoryboardReview or existing startAutoReview
  -> existing Marketplace Auto Review run/stage progression
  -> storyboard_review ready
  -> HyperFrames preview job queued when eligible
  -> render worker stages assets, lints, snapshots, inspects, renders
  -> sanitized status projection on timeline
  -> Storyboard Review / MediaStudio / Video Editor / Library handoff
```

Add these boundaries:

- Shared contracts in `apps/web/shared/hyperframes/*`.
- Backend services in `apps/web/server/services/hyperframes*`.
- tRPC procedures on `marketplaceCapture`.
- Worker entrypoint in `apps/web/server/workers/hyperframesRenderWorker.ts`.
- UI components under `apps/web/client/src/components/marketplaceCapture/*`.

## 3.1 Supported Composition Modes

Implement the spec's four integration modes as explicit composition/render intents, even if only the first modes are enabled by rollout flags:

| Mode | Composition mode / intent | First-release behavior |
|---|---|---|
| Storyboard Motion Preview | `storyboard_motion_preview` / `preview` | Auto Storyboard Review default when storyboard evidence is ready |
| Product Card Explainer | `product_card_explainer` / `draft` or `final` | backend-selectable low-cost product explainer using product images and evidence-backed copy |
| Captioned Final Composite | `captioned_final_composite` / `final` or `variant` | compose generated clips, subtitles, audio, disclosures, CTA, and overlays after full-video assets exist |
| Template QA Snapshot | `template_qa_snapshot` / `snapshot` | fixture/golden-frame QA for built-in templates and platform profiles |

Product Card Explainer and Captioned Final Composite must be represented in contracts, template compatibility, fixtures, and Library metadata from the start, even if broader tenant rollout initially enables only Storyboard Motion Preview.

## 4. Shared Contract Layer

Create:

- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- `apps/web/shared/hyperframes/autoPlan.ts`
- `apps/web/shared/hyperframes/featureAccess.ts`
- `apps/web/shared/hyperframes/statusCopy.ts`
- `apps/web/shared/hyperframes/templates.ts`

Define field-only TypeScript/Zod contracts for:

- `MarketplaceAutoReviewLaunchMode`
- `HyperframesAutoStoryboardReviewPlan`
- `HyperframesFeatureAccessProjection`
- `HyperframesRenderStatusProjection`
- `HyperframesCompositionInput`
- `HyperframesProductTruthView`
- `HyperframesShotView`
- media refs, copy plan, brand profile, subtitles, audio sync, compliance, provenance
- runtime API inputs/outputs
- Library finalize metadata

The contract layer owns shared enums and status copy so UI pages cannot invent divergent labels.

## 5. Auto Plan and Feature Access Services

Add:

- `hyperframesAutoPlanService.ts`
- `hyperframesFeatureAccessService.ts`

The auto plan service resolves backend defaults for Auto Storyboard Review:

- output mode;
- frame strategy;
- audio strategy;
- render engine;
- composition mode;
- template;
- platform profile;
- text overlay policy;
- selected asset count;
- primary next action;
- blockers;
- reset-to-auto state.

The feature access service resolves:

- feature flags;
- tenant allowlist;
- worker readiness;
- template availability;
- product anchor/evidence readiness;
- credit/quota state;
- Library save permission;
- operator capabilities.

The auto plan must never silently rewrite Standard Order choices. Standard Order continues through the existing `startAutoReview` path unless the user explicitly chooses a HyperFrames-compatible standard option.

## 5.1 Credit, Cost, and Quota Contract

HyperFrames has its own composition/render cost class. Do not classify it as provider image/video generation.

Required cost classes:

- `composition_preview`
- `composition_render`
- `composition_variant_export`
- `composition_snapshot_qa`

Every backend auto plan and render queue decision should include a deterministic `HyperframesCreditEstimate` projection with:

- estimate ref, tenant/user/run IDs, render intent, composition mode, cost class;
- width, height, fps, duration, frame count, render pixels, storage estimate;
- profile, cost-class, and worker-complexity multipliers;
- `estimatedCredits`, `freePreviewApplied`, and quota decision;
- credit operation idempotency key: `hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}`.

Estimate formula:

```text
estimatedFrameCount = ceil(durationSeconds * fps)
estimatedRenderPixels = width * height * estimatedFrameCount
rawComputeUnits = estimatedRenderPixels / 1_000_000
estimatedStorageBytes =
  estimatedVideoBytes(width, height, fps, durationSeconds, renderProfile)
  + estimatedSnapshotBytes
  + estimatedManifestAndSidecarBytes
estimatedCredits =
  ceil(rawComputeUnits * profileMultiplier * costClassMultiplier * workerComplexityMultiplier)
```

Credit refs must stay separate:

- `compositionEstimateRef`
- `compositionReservationRef`
- `compositionChargeRef`
- `compositionRefundRef`

MVP limits:

| Render intent | Duration | FPS | Resolution |
|---|---:|---:|---|
| preview | 15s | 24 | 720x1280 |
| draft | 30s | 24 | 1080x1920 |
| final | 60s | 30 | 1080x1920 |

MVP quota caps also include 8 product images, 9 video clips, 750 MB staged assets, max concurrent jobs per user/tenant, max retries per job, and max stored preview artifacts per product/run.

Free preview policy:

- allow at most one active free preview per `{tenantId}:{productId}:{runId}:{templateId}:{platformPresetId}:{compositionInputHash}` unless tenant policy raises the limit;
- a preview is consumed when rendering starts or output exists, not when the user opens controls;
- duplicate free-preview requests return existing active/completed preview;
- final renders and variants must never be marked as free preview.

## 6. Template Registry and Composition Builder

Add:

- `hyperframesTemplateRegistry.ts`
- `hyperframesCompositionService.ts`
- `hyperframesCompositionSanitizer.ts`

V1 uses built-in templates only. The registry provides active template metadata, schema compatibility, platform profiles, and rollback/disable state.

Initial built-in templates:

| Template ID | Purpose |
|---|---|
| `marketplace_storyboard_motion_9x9_v1` | animate 7-9 storyboard frames with product truth captions |
| `marketplace_product_card_explainer_9_16_v1` | deterministic product promo from product images and evidence-backed copy |
| `marketplace_captioned_final_composite_9_16_v1` | generated clips plus captions, overlays, disclosures, CTA, and audio |
| `marketplace_social_variant_square_v1` | square variant for feed posts or Library reuse |

Template governance:

- lifecycle states: `draft`, `active`, `disabled`, `archived`;
- built-in templates only in V1;
- material output changes must bump template version;
- activation requires schema tests, fixture render, golden snapshots, security review, and rollback metadata;
- emergency disable must prevent new renders while preserving historical Library items;
- tenant custom templates remain out of scope until a formal sandbox and approval gate exists.

Initial platform profile presets:

| Preset ID | Size | MVP rollout | Notes |
|---|---:|---|---|
| `generic_vertical_9_16` | 1080x1920 | enabled first | default internal preview profile |
| `tiktok_reels_shorts_9_16` | 1080x1920 | allowlisted after e2e/snapshot evidence | publishable-candidate profile with stricter subtitle/disclosure/thumbnail QA |
| `instagram_feed_square_1_1` | 1080x1080 | defined but disabled in first rollout | enabled after 1:1 evidence |
| `youtube_landscape_16_9` | 1920x1080 | defined but disabled in first rollout | enabled after landscape evidence |

Every preset must carry a version, safe-area bounds, duration/fps limits, subtitle/disclosure placement, thumbnail policy, and `publishableCandidate` QA requirements.

The composition builder transforms approved Marketplace Auto Review state into sanitized HyperFrames input:

- product truth;
- selected product images;
- storyboard frames;
- generated clips;
- captions/subtitles;
- audio sync plan;
- compliance/disclosure plan;
- platform preset;
- template props;
- provenance envelope.

All user/product text must be escaped. No raw marketplace HTML is executable input.

## 7. Asset Staging, QA, and Security

Add:

- `hyperframesAssetStagingService.ts`
- `hyperframesQaService.ts`
- `hyperframesSecurity.test.ts`

Asset staging must:

- accept only allowed user/tenant/product assets;
- reject `javascript:`, `file:`, private IP, metadata-service, and malformed URLs;
- stage product images, storyboard frames, generated clips, audio, fonts, subtitles, and thumbnails;
- produce a manifest with content hashes;
- clean temporary workspaces after success/failure.

QA must cover:

- pre-render schema and product truth validation;
- template lint/inspect;
- key-frame snapshots;
- blank-frame checks;
- duration/resolution/fps checks;
- subtitle/caption safe area;
- CTA/disclosure presence;
- final Library save readiness.

## 8. Worker and Runtime State

Add:

- `apps/web/server/workers/hyperframesRenderWorker.ts`
- `hyperframesRenderService.ts`
- worker policy tests
- doctor/fixture/snapshot scripts

MVP uses existing Marketplace Auto Review outbox/artifact persistence where practical. Dedicated HyperFrames render tables are deferred until the promotion criteria are met.

For MVP, reuse the existing Marketplace Auto Review runtime ledgers exactly:

- `marketplace_auto_review_outbox_jobs` job types: `hyperframes_asset_stage`, `hyperframes_lint`, `hyperframes_snapshot`, `hyperframes_render`, `hyperframes_inspect`, `hyperframes_finalize`.
- outbox `payloadJson` fields: `compositionInputHash`, `compositionHtmlHash`, `templateId`, `templateVersion`, `templateContentHash`, `platformPresetId`, `platformPresetVersion`, `renderIntent`, `compositionMode`, `runtimeProfileHash`.
- idempotency key format: `hyperframes:{tenantId}:{runId}:{templateId}:{templateVersion}:{platformPresetId}:{renderIntent}:{compositionInputHash}`.
- `marketplace_auto_review_artifacts` kinds: `hyperframes_input_json`, `hyperframes_composition_html`, `hyperframes_snapshot`, `hyperframes_render_mp4`, `hyperframes_render_webm`, `hyperframes_subtitle_vtt`, `hyperframes_manifest`, `hyperframes_sanitized_log`.
- artifact `metadataJson` must store retention class, checksum details, template/runtime diagnostics, and redaction-safe diagnostics.

Tenant/run scoped storage paths:

```text
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/input.json
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/composition/index.html
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/composition/assets/...
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/snapshots/frame-000.png
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/output.mp4
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/manifest.json
```

Worker job types:

- asset staging;
- lint;
- snapshot;
- inspect;
- render;
- final QA;
- Library finalize support.

Worker behavior:

- bounded retries for transient dependency/storage/worker failures;
- no auto-retry for permanent input/policy/template failures;
- stale-lock recovery only when input hash and template version match;
- dead-letter with sanitized diagnostics;
- operator replay with permission and stale-hash checks;
- best-effort cancellation.

Worker and browser isolation:

- production rendering runs in a dedicated worker/container, never the web request thread;
- worker temp dirs are tenant/run scoped and cleaned after completion/failure;
- network access is denied after asset staging when possible;
- worker mounts only controlled work/output directories;
- CPU, memory, duration, frame count, and output size are capped;
- web preview uses a sandboxed iframe or trusted player boundary with strict CSP;
- composition HTML cannot read cookies/localStorage or call SmartSpecPro APIs.

## 9. Runtime API and Router Integration

Add tRPC procedures without removing current procedures:

- `getAutoStoryboardReviewPlan`
- `startAutoStoryboardReview`
- `createHyperframesPreview`
- `getHyperframesRenderJob`
- `listHyperframesTemplates`
- `cancelHyperframesRenderJob`
- `saveHyperframesRenderToLibrary`

Rules:

- `startAutoStoryboardReview` is Auto mode only and returns the backend auto plan.
- existing `startAutoReview` remains the Standard Order start path.
- active run dedupe is preserved.
- idempotency keys include launch mode and output-affecting overrides.
- every response returns sanitized projections.
- polling guidance is returned for active jobs.
- successful start/save/cancel invalidates `listAutoReviewRuns`, `getProduct`, `getHyperframesRenderJob`, Library search, and Media Panel queries.

Security-sensitive router changes trigger a security gate because new procedures touch tenant/product/run access.

## 10. Product Detail UI/UX Contract

### Target User / JTBD

- Role: Marketplace Capture user creating product-review media.
- Goal: start an automatic storyboard review quickly while retaining standard manual control.
- Entry point: `MarketplaceCaptureProductDetail.tsx`.
- Success outcome: user can start/resume Auto Storyboard Review or Standard Order, see status, and reach outputs without confusion.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Product Detail | `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` | dual launch mode, auto summary, status panel, standard controls |
| Media Panel | same page | include final HyperFrames video Library results |
| Timeline | same page | show sanitized HyperFrames status/output links |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Launch mode switch | `MarketplaceAutoReviewLaunchModeSwitch.tsx` | Auto vs Standard mode | launch mode state |
| Auto plan summary | `AutoStoryboardReviewPlanSummary.tsx` | auto defaults, blockers, reset-to-auto | auto plan projection |
| Advanced overrides | `AutoStoryboardAdvancedOverrides.tsx` | optional override diff | auto plan and template lists |
| Render panel | `HyperframesRenderPanel.tsx` | status/output/save/cancel | render projection |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | mode switch and skeleton summary | component test |
| empty | Auto CTA and Standard Order available | component/e2e |
| blocked | one safe next action and Standard still usable when applicable | component/e2e |
| running | progress and polling copy | component/e2e |
| completed | preview/output links and Library save status | component/e2e |
| disabled | feature unavailable copy without breaking Standard Order | component/e2e |
| focus/hover/selected | visible mode selection and keyboard path | component/e2e |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | no horizontal overflow, Auto CTA and Standard mode reachable | Playwright |
| tablet 768x1024 | panels stack without clipped controls | Playwright |
| desktop 1440x900 | dense workflow layout preserves Media Panel | Playwright |
| small-mobile 360x800 | extended check for mode switch and dialogs | Playwright |
| laptop 1024x768 | extended check for first viewport density | Playwright |

### Accessibility Acceptance

- Keyboard path reaches mode switch, Auto CTA, Standard controls, reset-to-auto, dialogs, and output links.
- Focus is trapped/restored in preview/progress/comparison dialogs.
- Controls have accessible names in Thai/English.
- No text overlap or horizontal overflow.
- Reduced motion is respected where existing surfaces support it.

### Copy Contract

- Primary languages: Thai and English.
- Tone: concise, operational, safe.
- Required labels: Auto Storyboard Review, Standard Order/Custom, Use auto plan, worker unavailable, template unavailable, credit/quota blocker, preview ready, saved to Library.
- Copy comes from shared status copy or locale files, not per-page ad hoc strings.

### Browser Evidence Required

Run focused e2e for Product Detail desktop/mobile with Auto enabled, Auto disabled, Standard Order with Auto enabled, blockers, and completed output.

## 11. Storyboard Review and MediaStudio UI

Storyboard Review is review/result-first:

- show auto storyboard and auto preview status first;
- show preview output inline or one click away;
- show recommended snapshot comparison;
- expose manual render only as retry/fallback;
- preserve existing compound render path.

MediaStudio:

- resume HyperFrames render-to-library sessions for active production run;
- preserve fallback metadata after reload;
- avoid duplicate Library saves;
- treat HyperFrames MP4 as normal video media.

## 12. Library, Media History, and Video Editor

Final HyperFrames renders are normal user-owned video assets with metadata:

- source type: `marketplace_auto_review_hyperframes_render`;
- product/run/template/platform/render refs;
- Library idempotency key: `hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}`;
- output checksum;
- subtitle/transcript/manifest refs;
- QA/disclosure state;
- credit and idempotency refs.

Preview-only artifacts are not durable Library assets and should expire according to retention policy.

Duplicate Library save must return the existing Library item when tenant/user/run ownership, composition input hash, composition HTML hash, output hash, template ref, platform preset, and QA state match. It must never create a second Library item or repeat a charge for the same idempotency key.

## 13. Observability, Retention, and Operator Tools

Every render job should carry:

- `traceId`
- `correlationId`
- tenant/user/product/run/render IDs;
- outbox job ID;
- artifact refs;
- Library item ID;
- composition input hash;
- template/platform refs;
- credit refs.

Operator APIs must be permission-gated, audited, and sanitized:

- inspect diagnostics;
- replay dead-letter;
- cancel job;
- disable/enable template;
- dry-run purge;
- repair artifact metadata.

Retention defaults:

| Artifact kind | Retention class | Default retention | Purge behavior |
|---|---|---|---|
| `hyperframes_input_json` | `review` | 30 days for unconfirmed preview; retained with Library item if finalized | purge raw product/evidence details unless final provenance needs them |
| `hyperframes_composition_html` | `review` | 7 days preview, 30 days draft, hash/manifest only for final Library | purge HTML body; keep hash/template/version metadata |
| `hyperframes_snapshot` | `temporary` or `review` | 7 days preview, 30 days failed QA, retained for golden fixtures only when marked | purge files and mark artifact row deleted/expired |
| `hyperframes_render_mp4` / `hyperframes_render_webm` | `review` or `library` | 7 days preview-only; Library policy after save | preview files purge after expiry; Library files follow Library retention/deletion rules |
| `hyperframes_subtitle_vtt` | `review` or `library` | same as paired render | purge with paired render unless saved to Library |
| `hyperframes_manifest` | `audit` | 90 days failed/preview; retained with Library item for final output | redact private URLs before long retention |
| `hyperframes_sanitized_log` | `audit` | 30 days normal failures, 90 days dead-letter/replay | keep sanitized text only; never retain signed URLs |

Purge must skip Library-owned, active, locked, or retry-grace artifacts.

## 14. Dependency and Runtime Rollout

Do not add HyperFrames packages until:

- dependency audit passes;
- license and package provenance are reviewed;
- package versions are pinned;
- Chrome/FFmpeg/font versions are captured;
- worker/container strategy is decided.

Treat this as a preflight gate before Section 05 worker execution:

- pass: worker runtime, fixture render hooks, and package install may proceed;
- partial: implement queue/status contracts and disabled-worker projections only;
- fail: keep Auto hidden/disabled and preserve Standard Order while dependency
  risk is resolved.

Recommended rollout:

1. contracts and tests with flags off;
2. local/dev CLI doctor and fixture render;
3. staging worker with fixture-only render;
4. internal tenant Auto Storyboard Review preview;
5. Library save after QA;
6. broader tenant allowlist.

MVP policy decisions:

- Product Detail uses one primary `Create Auto Storyboard Review` action.
- Auto mode backend-selects render engine, template, platform, frame/audio strategy, subtitle mode, and text policy.
- Use CLI in local/dev diagnostics and `@hyperframes/producer` in the production worker when dependency gates pass.
- Built-in templates only in V1; tenant custom templates are out of scope.
- Preview artifacts expire after 7 days unless saved to Library.
- Use quota first, then add credit billing after render cost metrics are known.
- Composition source remains internal in V1; normal users do not download raw HTML.
- Launch with 9:16 first, then enable 1:1 and 16:9 after e2e and golden snapshot evidence.
- Regulated/high-risk claim categories require user review before auto queue unless the compliance plan marks the run safe.
- Reuse Marketplace Auto Review outbox/artifact tables for MVP.
- Burn-in subtitles are the MVP subtitle mode; sidecar subtitles can follow after Library metadata and download UX are proven.

These MVP decisions resolve the first-release open questions for implementation.
Any change must update the spec decision log, Section 12, and affected tests
before implementation changes runtime behavior.

## 14.1 Polling, Charge Summary, Repair, and Migration Checkpoints

Runtime API responses must be explicit enough for UI pages to avoid guessing:

- active jobs return polling guidance with 5-15 second normal intervals,
  30-second maximum backoff, terminal `stopWhenStatus`, and cache metadata;
- start/preview/save responses return `creditEstimate`, `quotaDecision`, or
  `noChargeReason`;
- duplicate free previews and duplicate Library finalization return no-charge
  reasons and never repeat charges.

Safe auto-repair should be modeled as typed next actions before customization:

- stale input hash can regenerate from the current plan when evidence is still valid;
- missing snapshots can recreate snapshots from the same composition hash;
- retryable worker/dependency/storage failures can retry bounded worker steps;
- minor layout warnings can rerun inspect/snapshot checks.

Dedicated HyperFrames tables remain conditional. If promotion criteria are met,
implementation must add a separate migration sub-plan with dry-run SQL, rollback
SQL, backfill, dual-read, cutover flag, cleanup proof, and tests for old/new
ledger compatibility before schema changes.

## 15. Implementation Sections

This plan is split into 12 implementation sections:

1. contracts and runtime schemas;
2. auto plan and feature access;
3. template registry and composition builder;
4. asset staging, security, and QA;
5. render worker and runtime state;
6. runtime API and router integration;
7. Product Detail dual-mode UI;
8. Storyboard Review and MediaStudio handoff UI;
9. Library, Media History, and Video Editor finalize;
10. observability, retention, and operator APIs;
11. fixture, e2e, and release gates;
12. dependency, rollout, and documentation.

## 16. Quality Gates

Focused gates:

- shared contracts and schemas tests;
- service tests for auto plan, feature access, composition, staging, render, Library finalize;
- router tests for runtime APIs and tenant isolation;
- Product Detail component tests for Auto and Standard modes;
- Storyboard Review and MediaStudio tests;
- security tests for XSS, SSRF, tenant isolation, shared/group/credit payer;
- e2e browser evidence for Product Detail, Storyboard Review, MediaStudio;
- doctor/fixture/snapshot gates before dependency rollout.

HyperFrames-specific release commands to add during implementation:

- `npm --prefix apps/web run hyperframes:dependency-audit`
- `npm --prefix apps/web run hyperframes:doctor`
- `npm --prefix apps/web run hyperframes:fixture-render`
- `npm --prefix apps/web run hyperframes:snapshot-test`

## 17. Rollback

Rollback must be simple:

- disable `MARKETPLACE_HYPERFRAMES_ENABLED`;
- keep existing Standard Order paths working;
- stop new HyperFrames jobs;
- preserve completed Library items;
- cancel queued/running HyperFrames jobs where possible;
- purge preview artifacts by retention policy;
- disable affected templates when rollback is security/template driven.
