# Feature 119: HyperFrames Marketplace Auto Review Render Adapter

Version: 1.1.0
Date: 2026-06-13
Status: Proposed - direction updated to official HyperFrames runtime platform
Depends-on:
- Feature 113 Marketplace Capture Extension
- Feature 117 Production Director Agents SDK Auto Storyboard And Video
- Feature 118 Marketplace Auto Review Create Storyboard And Video Review Auto
- Existing Marketplace Capture product records, evidence, product image attachments, and product detail UI
- Existing Marketplace Auto Review run/stage persistence and background job
- Existing Storyboard Review, Video Editor, Media Library, storage, media job, credit, audit, and tenant access systems
External references:
- HyperFrames GitHub README: https://github.com/heygen-com/hyperframes/blob/main/README.md
- HyperFrames docs introduction: https://hyperframes.heygen.com/introduction
- HyperFrames CLI docs: https://hyperframes.heygen.com/packages/cli
- HyperFrames producer docs: https://hyperframes.heygen.com/packages/producer
- HyperFrames engine docs: https://hyperframes.heygen.com/packages/engine
- HyperFrames render platform design: `docs/portable-skill-pack/specs/2026-06-13-hyperframes-render-platform-design.md`
Audience: Marketplace Capture, Marketplace Auto Review, Media Studio, Storyboard Review, Video Editor, Media Library, Node Backend, Render Workers, Security, QA, DevOps, Product

---

## 1. Executive Summary

Add a HyperFrames-based deterministic HTML-to-video composition layer to SmartSpecPro Marketplace Auto Review.

This feature does not replace Marketplace Capture, product evidence extraction, product truth, Agents SDK planning, provider video generation, Storyboard Review, Video Editor, or Media Library. It adds a render/composition adapter that can turn approved Marketplace Auto Review artifacts into deterministic motion previews, captioned product explainers, branded social variants, and final overlay/composite renders using official HyperFrames composition and render runtimes.

The approved direction is a centralized HyperFrames Render Platform, not a
parallel SmartSpecPro-owned renderer. SmartSpecPro should generate safe
HyperFrames composition projects and render them with the official HyperFrames
CLI, `@hyperframes/producer`, or producer server in an isolated worker. Bespoke
Playwright/FFmpeg render code may remain only as a health-check, fixture, or
break-glass diagnostic fallback and must not be treated as a feature-complete
production renderer.

The target product behavior is:

```text
Marketplace captured product
  -> Product truth, selected product references, storyboard plan, and optional generated clips
  -> HyperFrames composition input envelope
  -> Safe HyperFrames project: index.html, assets, manifest, runtime profile
  -> Official HyperFrames lint / inspect / snapshot / render
  -> Storyboard Review, Video Editor, or Media Library output with provenance
```

The value is highest where deterministic composition is stronger than prompt-only video generation:

- product cards with accurate price/spec/rating/source context
- 9-shot storyboard motion previews before expensive video generation
- captions, lower thirds, CTA, disclaimers, warning labels, affiliate disclosure, and brand overlays
- multi-platform social exports such as 9:16, 1:1, and 16:9 variants
- deterministic visual regression testing and golden frame QA
- agent-friendly generated composition code where layout must be controllable

The implementation must preserve the existing SmartSpecPro source of truth:

- Marketplace Capture remains the source for product/evidence data.
- Marketplace Auto Review run/stage rows remain the workflow source of truth.
- Feature 117 Agents runtime, when implemented, remains responsible for creative concept, storyboard, prompt, QA, and repair decisions.
- HyperFrames receives approved, sanitized, structured inputs and renders them. It must not invent product facts, bypass evidence review, or mutate product records.

---

## 2. Product Problem

Feature 118 can already create storyboard images and full review videos from captured marketplace products. Feature 117 proposes a stronger Agents SDK runtime for creative planning, direct media execution, QA, and repair.

The remaining gap is deterministic composition.

AI image/video providers are useful for cinematic scenes, product-in-use shots, character shots, and atmospheric motion. They are weaker when the output needs exact text, exact price display, exact CTA layout, exact subtitles, deterministic brand templates, precise safe-area placement, repeatable thumbnails, or low-cost motion previews.

Marketplace product review videos often need both:

1. Generative media for visual richness.
2. Deterministic layout/composition for commercial correctness.

HyperFrames is a good fit for the second half because it renders plain HTML/CSS/JS compositions into deterministic MP4 output. It is especially relevant for automated pipelines because its CLI and packages are agent-friendly, non-interactive, and designed around frame-accurate rendering.

SmartSpecPro should therefore use HyperFrames as a controlled composition renderer, not as a crawler, product parser, product truth engine, or full production runtime.

### 2.1 Current SmartSpecPro Baseline

Current implemented Marketplace Auto Review behavior is captured in Feature 118:

- Entry point: `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- API surface: `apps/web/server/routers/marketplaceCapture.ts`
- Durable service: `apps/web/server/services/marketplaceAutoReviewService.ts`
- Background advancement: `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
- Tables: `marketplace_auto_review_runs`, `marketplace_auto_review_stages`
- Output modes: `storyboard_images`, `full_video`
- Frame strategies: `storyboard_3x3_split`, `video_shot_start_stop`
- Audio strategies: `auto`, `native_video_audio`, `separate_tts_voiceover`, `silent`
- Downstream surfaces: Storyboard Review, Video Editor, render, Media Library

Feature 117 then proposes replacing deterministic planning with an Agents SDK production runtime while preserving the same durable run/stage shell.

Feature 119 must fit into that shell.

### 2.2 HyperFrames Baseline

As of the external documentation reviewed on 2026-06-04:

- HyperFrames turns HTML, CSS, media, and seekable animations into deterministic MP4 videos.
- Compositions are plain HTML documents with timing/layout metadata.
- Rendering seeks each frame independently in headless Chrome and encodes with FFmpeg.
- The CLI supports scaffold, preview, lint, inspect, snapshot, capture, doctor, and render.
- `@hyperframes/producer` provides programmatic Node.js rendering from composition directories to MP4/WebM.
- `@hyperframes/engine` exposes lower-level frame capture through Chrome BeginFrame and FFmpeg utilities.
- `@hyperframes/player` can embed composition preview in a browser.
- HyperFrames includes a catalog of reusable blocks/components and the `frame.md` concept for translating design systems into video-specific guidance.

Important product interpretation:

- Use HyperFrames for deterministic composition and render.
- Use the CLI for local development, diagnostics, scaffolding, compatibility-first worker execution, and official runtime fallback.
- Use `@hyperframes/producer` or producer server for production-grade programmatic rendering when the worker needs direct Node integration.
- Do not recreate HyperFrames rendering behavior as a production path with bespoke Playwright frame capture, FFmpeg filters, ASS overlays, or template-specific render code. Those paths are diagnostic/fallback only.
- User prompts and custom overlay requests must be converted into HyperFrames composition projects, not passed to a custom renderer.
- Avoid using `hyperframes capture` against authenticated third-party marketplace pages as a server-side crawler. Marketplace Capture already has a safer user-assisted capture model.

---

## 3. Goals

### 3.1 Primary Goals

1. Add a deterministic HyperFrames composition/render path for Marketplace Auto Review outputs.
2. Let a user create a fast motion storyboard preview from a captured product and approved storyboard plan.
3. Let a user create a product card/explainer video using product images, evidence-backed claims, captions, overlays, and CTA.
4. Let full-video runs optionally use HyperFrames to compose generated clips, captions, audio, overlays, disclaimers, and social-safe export variants.
5. Preserve product truth, evidence provenance, tenant isolation, credit safety, and run/stage traceability.
6. Keep HyperFrames integration isolated behind an adapter so it can be disabled, replaced, or moved to a separate render worker without breaking Marketplace Auto Review.
7. Add deterministic QA around text overflow, clipped containers, safe areas, exact duration, playable output, missing assets, and visual regression frames.
8. Centralize HyperFrames runtime versioning, compatibility gates, and update maintenance so upstream HyperFrames releases can be adopted safely.

### 3.2 Secondary Goals

1. Introduce reusable product-review composition templates for 9:16, 1:1, and 16:9.
2. Add a SmartSpecPro video design profile inspired by HyperFrames `frame.md`, derived from existing product UI/design tokens but tuned for video.
3. Create a clear migration path from existing FFmpeg timeline render to HyperFrames composition render for overlay-heavy videos.
4. Support future agent-generated HTML compositions while keeping production renders template-sandboxed and sanitized.
5. Support golden frame tests for product templates so UI/design regressions are caught before shipping.
6. Support a compatibility fixture suite that proves text overlays, Thai captions, CTA/disclosure layout, audio/SFX, transitions, and generated-clip composites across pinned and candidate HyperFrames versions.

### 3.3 Non-Goals

This feature must not:

- Replace Marketplace Capture extension flows.
- Crawl Shopee, TikTok Shop, or any authenticated marketplace page server-side.
- Capture marketplace cookies or automate marketplace login.
- Treat arbitrary captured HTML as trusted HTML.
- Allow user-supplied JavaScript or HTML to execute in SmartSpecPro origin.
- Replace Feature 117 Agents SDK planning.
- Replace provider image/video generation where cinematic scenes are needed.
- Replace existing Media Library, Storyboard Review, Video Editor, credit ledger, or audit systems.
- Add a generic website-to-video product for arbitrary URLs in the first release.
- Promote final renders to public publishing without the publishable package, disclosure, subtitle, CTA, and platform metadata checks described by Feature 117.
- Build or expand a production-equivalent custom renderer that bypasses the official HyperFrames CLI/producer path.

---

## 4. Recommended Architecture

### 4.1 Positioning

HyperFrames should be a render adapter under Marketplace Auto Review, not a new top-level automation source.

```text
Marketplace Auto Review Run
  -> product_preflight
  -> production_project
  -> concept_story
  -> prompt_plan
  -> image_generation
  -> storyboard_review
  -> video_generation
  -> audio_generation
  -> video_edit
  -> render
       -> existing FFmpeg render path
       -> HyperFrames render adapter path
  -> library_finalize
```

V1 should attach HyperFrames as an alternative render engine inside the `render` stage and as a preview sub-action from `storyboard_review`. Avoid adding a new mandatory durable stage until the product proves the need. Store HyperFrames details in stage `outputJson`, run `metadataJson`, render job rows, and Media Library metadata.

V2 may add an explicit `composition_render` stage if HyperFrames becomes a first-class mandatory step for some output modes.

### 4.2 Integration Modes

#### Mode A: Storyboard Motion Preview

Input:

- captured product
- product truth
- approved 7-9 shot storyboard plan
- selected product images
- optional generated storyboard frames
- voiceover script or caption beats

Output:

- previewable HyperFrames composition
- optional MP4 motion preview
- output link attached to Marketplace Auto Review timeline
- optional Storyboard Review clip preview

Use when:

- user wants to inspect story flow before expensive video generation
- storyboard frames are static but need motion, timing, and captions
- product details need accurate on-screen text

#### Mode B: Product Card Explainer

Input:

- captured product details
- product images
- evidence-backed claims
- price/spec/rating signals
- CTA and disclosure policy

Output:

- 15-45 second product explainer video
- can be storyboard-only or direct final MP4
- saved to Media Library after QA

Use when:

- user wants a low-cost product promo without cinematic generated video
- product has good images and strong factual copy
- exact text/spec layout matters more than generative motion

#### Mode C: Captioned Final Composite

Input:

- generated video clips from Auto Review
- approved audio or TTS
- transcript/subtitles
- captions/on-screen text plan
- product truth and CTA metadata
- disclosure/warning overlays

Output:

- final composited MP4
- optional platform variants
- Library item with traceability

Use when:

- full-video mode already generated clips
- deterministic captions, overlays, intro/outro, and CTA are needed
- final render needs visual QA and safe-area compliance

#### Mode D: Template QA Snapshot

Input:

- composition template
- product fixture
- platform profile

Output:

- PNG snapshots at key frames
- inspect/lint reports
- golden baselines for tests

Use when:

- validating templates in CI
- checking overflow/clipping/safe-area issues
- preventing visual regressions before provider spend

### 4.3 Render Engine Choice

Add render engine support behind feature flags, but do not make manual render
engine selection the primary Marketplace Capture UX. The product behavior should
remain auto-first: once the tenant feature is enabled, the backend resolves the
best render engine, composition mode, template, platform profile, text policy,
and preview/final intent from the run context.

```ts
type MarketplaceAutoReviewRenderEngine =
  | "existing_ffmpeg_timeline"
  | "hyperframes_composition";

type MarketplaceAutoReviewCompositionMode =
  | "storyboard_motion_preview"
  | "product_card_explainer"
  | "captioned_final_composite"
  | "social_variant_package";
```

V1 default:

- Existing behavior remains default.
- HyperFrames is opt-in through feature flag and tenant allowlist, but should be
  auto-selected by the backend for eligible Storyboard Review Auto runs instead
  of requiring the user to manually pick HyperFrames.
- Product Detail should support two usable launch modes:
  - `Auto Storyboard Review`: recommended auto-first path with one primary CTA
    and backend-selected defaults;
  - `Standard Order` / `Custom`: existing/manual ordering path that preserves the
    current output mode, frame strategy, image model, shot count, audio strategy,
    overlay text, anchor readiness, active-run dedupe, status summary, timeline,
    credit summary, and output links.
- Auto mode must not replace, disable, or make the Standard Order mode hard to
  use. It must not force template/render engine/platform customization before
  starting a normal auto run.
- Production uses disabled-by-default tenant allowlist until worker hardening is complete.

V2 default:

- `storyboard_motion_preview` should become the default automatic preview for
  storyboard-only review when render cost and reliability are acceptable.
- `captioned_final_composite` can become default for final overlay-heavy full-video exports.

---

## 5. User Experience Requirements

### 5.1 Marketplace Product Detail

On `MarketplaceCaptureProductDetail`, add a HyperFrames-aware creation area
without overwhelming the existing Auto Review controls. The UX rule is:
Storyboard Review Auto must feel automatic. Users should start from one primary
action and only customize when they explicitly open advanced options or when the
system finds a blocker that truly needs user input.

Dual-mode launch requirement:

- provide a clear way to switch between `Auto Storyboard Review` and
  `Standard Order` / `กำหนดรูปแบบเอง`;
- Auto can be the recommended/default view when the feature is enabled, but
  Standard Order must remain directly usable and must not be buried behind an
  operator-only or rarely discoverable path;
- Standard Order must keep the existing Marketplace Auto Review controls and
  semantics for `storyboard_images`, `full_video`, frame strategy, image model,
  shot count, audio strategy, overlay text, product anchors, active-run dedupe,
  status summary, history toggle, timeline, credit summary, and output links;
- Standard Order can optionally expose HyperFrames as a render/composition
  choice when allowed, but must still allow the existing non-HyperFrames render
  path;
- switching modes must not discard unsaved choices without confirmation and must
  show which mode created or resumed the active run;
- tests must prove both modes can start/resume runs independently without
  cross-contaminating idempotency keys, credit refs, or output metadata.

Primary auto action:

- show one prominent CTA such as `Create Auto Storyboard Review` / `สร้างรีวิว
  Storyboard อัตโนมัติ`;
- clicking it should start or resume the active auto run with backend-selected
  defaults;
- if a matching active run already exists, the CTA should resume/show progress
  instead of asking the user to configure another run;
- after storyboard assets are ready, eligible HyperFrames motion preview work
  should be queued automatically or marked pending by worker capacity, without
  requiring the user to press a separate `Render Motion Preview` button;
- if the system cannot safely continue, show the smallest required fix, not a
  full manual configuration form.

Backend-selected auto decisions:

- output mode: storyboard-only or full video according to CTA/run intent;
- frame strategy: `auto`, resolved into 3x3 storyboard split or start/stop frames
  from available assets and provider capability;
- audio strategy: `auto`, resolved to silent, native audio, or TTS according to
  output mode and approved script/audio availability;
- render engine: existing timeline or HyperFrames according to feature access,
  worker readiness, cost/quota, template availability, and output intent;
- composition mode: `storyboard_motion_preview` for storyboard review preview,
  `captioned_final_composite` for final overlay-heavy full-video render, or no
  HyperFrames render when not useful;
- template: best built-in template for product category, media quality, language,
  text length, platform preset, and compliance/disclosure needs;
- platform profile: launch-safe default such as 9:16 for mobile social review
  unless the run or tenant policy explicitly requests another preset;
- text overlay policy: evidence-backed captions/disclosures only when allowed by
  product truth and compliance plan;
- product images/media refs: select from product-attached images and eligible
  generated storyboard frames using current anchor/evidence rules.

Required visible UI in the normal path:

- auto plan summary: output type, selected media/assets count, platform profile,
  estimated time/cost, and whether preview/final Library save is expected;
- status/progress: current stage, worker readiness, render progress, and one
  safe next action if blocked;
- output: storyboard review link, motion preview link, snapshot comparison link,
  Video Editor/Library handoff links when available;
- concise reason chips when the backend selected or skipped HyperFrames, for
  example `Auto-selected HyperFrames preview`, `Using existing render path`, or
  `Preview skipped: worker unavailable`.

Auto-mode overrides:

- render engine, composition mode, template, platform profile, preview/final
  intent, text overlay policy, shot count, image model, frame strategy, and audio
  strategy may exist in a collapsed `Advanced` / `ปรับแต่งขั้นสูง` area inside
  Auto mode;
- advanced overrides must never be required for the happy path;
- opening advanced options should preserve the current auto plan and show what
  will change before queueing paid or long-running work;
- override choices must be stored in run metadata with actor, timestamp, reason
  or source, and must affect idempotency/hash inputs where relevant;
- if an override creates policy, credit, template, or asset blockers, the UI must
  explain the blocker and offer `กลับไปใช้ Auto` / `Use auto plan` as the safest
  recovery action.

Legacy/custom controls that already exist can remain for compatibility, but must
not be degraded into a broken or unavailable path. They should live in the
Standard Order mode or the Auto mode's advanced override area. If space is
limited in Auto mode, prefer an auto plan summary and progress card over exposed
selectors; Standard Order can show the normal selector workflow.

Available Standard Order / Custom controls:

- Output type:
  - Create Storyboard Images
  - Create Full Review Video
  - Create Motion Preview
  - Create Product Explainer
- Render engine:
  - Auto
  - Existing video render
  - HyperFrames composition
- Template:
  - Product review 9:16
  - Product card explainer 9:16
  - Comparison/spec card 1:1
  - Full-video caption overlay 9:16
- Text overlay policy:
  - No text
  - Evidence-backed text only
  - Captions and disclosures
- Platform profile:
  - TikTok/Reels/Shorts 9:16
  - Square social 1:1
  - Landscape 16:9

Even when advanced controls are collapsed, the user should see:

- estimated render cost/time
- whether this path uses provider video generation or deterministic composition only
- whether product text/disclosures will appear
- whether the output is preview-only or saveable to Library
- blockers such as missing product images, missing evidence, unsupported product category, missing FFmpeg/Chrome worker, or disabled tenant feature flag

### 5.2 Storyboard Review

Storyboard Review should be review-first, not configuration-first. When a
Marketplace Auto Review run reaches Storyboard Review with valid provenance, the
page should open with the latest auto-generated storyboard, auto-selected motion
preview status, and safe next action already resolved.

Auto behavior:

- if HyperFrames preview is eligible and not yet queued, the backend should queue
  it automatically when the storyboard review stage becomes ready, or return a
  pending/blocked projection explaining why it is not queued;
- if preview output is ready, the page should show it inline or one click away,
  without requiring template/platform/render-engine selection;
- if snapshots are ready, comparison should default to the recommended key
  frames and show differences/QA findings automatically;
- if final QA passes and tenant policy allows Library save, the page may offer
  a clear `Save to Library` action, but should not force the user to rebuild
  render settings;
- if a safe auto-repair exists for stale hash, missing snapshot, retryable worker
  error, or minor layout warning, the system should attempt or offer that repair
  as the primary next action before asking the user to customize.

Allowed user actions:

- Open HyperFrames Preview
- Render Motion Preview only as a retry/manual fallback when auto queueing was
  skipped, blocked, or explicitly cancelled
- Compare storyboard frames vs composition frames
- Download preview MP4 when allowed
- Send preview to Video Editor
- Save preview to Library only when output passes final metadata/disclosure QA

The UI must label this clearly as deterministic composition preview when no provider-generated clips are used.

The UI must not present template, render engine, platform profile, or text policy
selection as mandatory steps before reviewing the storyboard. These controls
belong behind advanced override affordances and should be hidden for users who
only want the auto review result.

### 5.3 Video Editor

Video Editor should be able to receive:

- HyperFrames MP4 output as a normal video asset
- source composition metadata as provenance
- optional individual scene/segment boundaries
- subtitle/transcript artifacts
- thumbnail/cover frames

Video Editor must not need to understand arbitrary HyperFrames HTML internals for V1.

### 5.4 Media Library

Library items saved from HyperFrames renders must include:

- source type: `marketplace_auto_review_hyperframes_render`
- render engine: `hyperframes`
- composition mode
- template ID and version
- composition input hash
- composition HTML hash
- render job ID
- marketplace product ID
- product ID
- production run ID
- auto review run ID
- concept ID
- shot IDs/order
- product source URL
- selected variant hash/snapshot ref when present
- product truth hash
- evidence refs
- claim/evidence map refs
- CTA/disclosure refs
- subtitle/transcript refs
- thumbnail refs
- output checksums
- HyperFrames package/version
- FFmpeg/Chrome/runtime version summary
- QA summary
- credit/render cost summary

### 5.4.1 Library And Media History UX Details

Finalized HyperFrames media must feel like a normal SmartSpecPro video asset
while still exposing enough provenance for audit and reuse decisions.

Required Library and Media History behavior:

- show source label as `Marketplace Auto Review · HyperFrames` or localized
  equivalent, not generic `video_editor_render`;
- show template ID/version, platform preset, render intent, composition mode,
  output duration, resolution, fps, and final QA status in the item detail or
  metadata/provenance panel;
- expose thumbnail, MP4, subtitle sidecar, transcript, and manifest download
  links only when the user has access and the artifact is Library-owned;
- show expired preview artifacts as unavailable preview history, not as broken
  media cards;
- prevent normal users from downloading raw composition HTML, worker logs, or
  private storage paths;
- when deleting a Library-owned HyperFrames item, delete or quarantine the Library
  item according to existing Library rules and leave preview/audit artifact
  cleanup to the HyperFrames retention job;
- when purge has removed preview artifacts, keep hash/template/provenance metadata
  visible enough to explain historical timeline state;
- product-filtered Media Panel results must include finalized HyperFrames videos
  through product/run metadata and must not include unrelated tenant/global
  renders;
- source labels and provenance must work in both `/media-history` and any Library
  detail/search/card components touched during implementation.

### 5.5 Existing UI Surface Coverage

The implementation must adapt the existing SmartSpecPro UI surfaces instead of
creating a parallel HyperFrames-only workspace. Codebase inspection shows the
current implemented entry and handoff surfaces are:

| Surface | Current role | HyperFrames adaptation requirement |
| --- | --- | --- |
| `MarketplaceCaptureProductDetail.tsx` Auto Review action area | primary Marketplace Auto Review start surface with output mode, frame strategy, image model, shot count, audio, overlay text, anchor readiness, active-run dedupe, status summary, timeline, credit summary, and output links | support both launch modes: Auto Storyboard Review shows one primary CTA, backend-derived auto plan summary, start/resume behavior, progress, cost/readiness, and blockers; Standard Order preserves the existing explicit selector workflow and can still start `storyboard_images` or `full_video`; move Auto-mode render/template/platform overrides into collapsed advanced controls; preserve existing start actions when flag is off and when flag is on |
| `MarketplaceCaptureProductDetail.tsx` timeline panel | renders backend `MarketplaceAutoReviewTimelineProjection`, `statusDetail`, stage-level evidence/QA/repair refs, credit, and output links | project HyperFrames status through the same timeline contract; attach render/snapshot/subtitle/manifest/Library links on the correct stage; show sanitized `safeMessage` and one next action; support dead-letter, stale-input-hash, template-disabled, and operator-replay-available states |
| `MarketplaceCaptureProductDetail.tsx` Media Panel | History/Library/Product source tabs with image/video/audio tabs, product filter, Product Images attachment, and Library delete | make HyperFrames MP4/thumbnail/subtitle/manifest-derived Library items discoverable under the existing Library/History filtering; support product-filter search through metadata; do not expose raw composition HTML or private signed URLs in cards |
| Product Images / anchor selection | product, character, and environment anchors gate current Auto Review start | require HyperFrames preview/final actions to reuse the selected product anchor and current run evidence; show missing assets as the same user-facing blocker family instead of creating a new hidden preflight |
| `MediaStudio.tsx` Storyboard Review handoff | can create Storyboard Review projects, compound selected clips, track render-to-library sessions in local storage, and save completed render jobs to Library | expose HyperFrames motion preview/final composite as a composition render source when it is tied to the active production run; preserve session resume and fallback metadata semantics; separate composition/render cost from provider image/video generation cost |
| `MediaStudio.tsx` Video Shot workspace | compounds generated shot videos and saves completed render to Library with traceability metadata | allow HyperFrames final composite outputs to be referenced as normal video assets and traceability metadata; avoid duplicate Library saves when a composition render already belongs to the same run/intent/output hash |
| `StoryboardReviewPage.tsx` standalone route | supports `/storyboard-review` and `/storyboard-review/:reviewId`, clip selection, compound render, Video Editor project creation, RenderProgressDialog, and Library save fallback metadata | show the auto-generated storyboard, auto-selected motion preview status/output, and snapshot comparison by default when the review has a Marketplace Auto Review provenance envelope; provide "Render Motion Preview" only as retry/manual fallback; keep existing compound render path intact |
| `/video-editor` handoff | receives saved video editor projects and normal video media | consume completed HyperFrames MP4 as a normal asset/project media reference; show provenance metadata where existing asset detail patterns allow it; do not require Video Editor to parse HyperFrames HTML |
| `/media-history` and Library search surfaces | expose media and Library items created by generation/render workflows | index HyperFrames final renders with `source_type=marketplace_auto_review_hyperframes_render`, product/run IDs, template refs, subtitle/manifest refs, and output checksums so existing search/filter UX can find them |
| Admin/operator surfaces, if implemented for this feature | no dedicated HyperFrames UI exists today | add diagnostics/replay/template-disable/purge controls only to authorized operator surfaces; normal user UI must show only sanitized state and whether user action is required |
| App routes | current related routes include `/media-studio`, `/storyboard-review`, `/storyboard-review/:reviewId`, `/media-history`, and product detail routes under `/marketplace-capture` | do not add a new top-level `/marketplace` route; MVP should deep-link from existing product/detail/review surfaces, with optional protected query params for run/render IDs |

UI architecture decision:

- Product Detail remains the source of truth for starting and tracking Marketplace
  Auto Review plus HyperFrames preview/final render. It must expose both Auto
  Storyboard Review and Standard Order. Auto uses one CTA plus a summary;
  Standard keeps the explicit selector workflow.
- Storyboard Review is the human review and comparison surface for automatically
  generated storyboard motion previews, not a setup wizard.
- MediaStudio and Video Editor remain handoff/edit/render surfaces.
- Library and Media History remain the durable discovery surfaces after final save.
- HyperFrames should add components that can be embedded in these surfaces rather
  than a separate standalone app shell for MVP.

### 5.6 UI Completeness, Accessibility, And State Requirements

All UI additions must match existing dense workflow UI patterns and cover:

- loading state while feature flags, worker diagnostics, templates, or render job
  projection are loading;
- empty state when no HyperFrames render exists for a run;
- disabled state when the feature flag, tenant allowlist, worker capability,
  template approval, product anchor, evidence, credit, or policy gate is missing;
- error/blocked state with sanitized `safeMessage` and exactly one primary
  `nextAction`;
- success state with output links, final QA summary, Library save status, and
  traceability metadata summary;
- cancelled and dead-letter states that preserve previous output links where safe;
- mobile vertical timeline layout with no horizontal overflow;
- keyboard-accessible primary auto CTA, resume action, reset-to-auto action, and
  collapsed advanced selectors/actions using `aria-pressed`, `aria-selected`, or
  accessible names consistent with existing controls;
- focus management for preview dialogs, render progress dialogs, and comparison
  modals;
- no raw debug text, raw HTML, signed URLs, private storage keys, or full worker
  logs in normal user UI.

---

## 6. Data Contracts

### 6.1 Composition Input Envelope

All HyperFrames composition generation must start from a typed, sanitized JSON envelope.

```ts
export type HyperframesCompositionInput = {
  schemaVersion: 1;
  tenantId: string;
  userId: number;
  runId: string;
  productId: string;
  productionRunId?: string | null;
  conceptId?: string | null;
  compositionMode:
    | "storyboard_motion_preview"
    | "product_card_explainer"
    | "captioned_final_composite"
    | "social_variant_package";
  renderIntent: "preview" | "draft" | "final" | "variant";
  platformProfile: HyperframesPlatformProfile;
  productTruth: HyperframesProductTruthView;
  shots: HyperframesShotView[];
  media: HyperframesMediaRefs;
  copy: HyperframesCopyPlan;
  brand: HyperframesBrandFrameProfile;
  subtitles?: HyperframesSubtitlePlan | null;
  audioSync?: HyperframesAudioSyncPlan | null;
  compliance: HyperframesCompliancePlan;
  provenance: HyperframesProvenanceEnvelope;
};
```

### 6.1.1 Platform Profile Presets

Platform profiles are not only aspect-ratio labels. They define render limits,
safe areas, subtitle/disclosure placement, thumbnail behavior, and whether the
output is only an internal preview or a publishable package candidate.

```ts
export type HyperframesPlatformProfile = {
  id: "vertical_9_16" | "square_1_1" | "landscape_16_9";
  presetId:
    | "generic_vertical_9_16"
    | "tiktok_reels_shorts_9_16"
    | "instagram_feed_square_1_1"
    | "youtube_landscape_16_9";
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  maxDurationSeconds: number;
  safeArea: {
    topPx: number;
    rightPx: number;
    bottomPx: number;
    leftPx: number;
  };
  subtitlePlacement: {
    preferredAnchor: "bottom" | "top" | "center";
    avoidZones: Array<"top_ui" | "bottom_ui" | "cta" | "product_hero">;
    maxLines: number;
  };
  disclosurePlacement: {
    required: boolean;
    anchor: "top" | "bottom" | "end_card";
    minimumVisibleSeconds: number;
  };
  thumbnailPolicy: {
    required: boolean;
    source: "render_frame" | "generated_frame" | "user_selected";
    mustPreserveProductIdentity: boolean;
  };
  publishableCandidate: boolean;
};
```

Initial presets:

| Preset | Size | Max duration | Subtitle placement | Disclosure placement | Thumbnail policy |
| --- | --- | --- | --- | --- | --- |
| `generic_vertical_9_16` | 1080x1920 | 60s | bottom, avoid CTA/product hero | end card unless required earlier | optional render frame |
| `tiktok_reels_shorts_9_16` | 1080x1920 | 60s MVP, configurable later | bottom with top/bottom UI avoidance | bottom or end card, visible >= 3s when required | required for Library/publishable package |
| `instagram_feed_square_1_1` | 1080x1080 | 60s | bottom, max 2 lines | end card | required when saved as social variant |
| `youtube_landscape_16_9` | 1920x1080 | 60s MVP, configurable later | bottom, wider line length | end card or lower third | required for publishable package |

Profile rules:

- MVP launch should use `generic_vertical_9_16` and
  `tiktok_reels_shorts_9_16` only.
- Platform presets must be versioned in the template registry or shared
  contract so safe-area changes do not silently alter old renders.
- Final Library metadata must include `presetId`, dimensions, fps, duration,
  and disclosure/subtitle policy summary.
- If a preset claims `publishableCandidate: true`, final QA must also verify
  thumbnail, disclosure, subtitle/transcript, CTA, manifest, and checksum
  readiness.

### 6.2 Product Truth View

HyperFrames may render only approved product facts.

```ts
export type HyperframesProductTruthView = {
  productName: string;
  brand?: string | null;
  shopName?: string | null;
  platform: "shopee" | "tiktok_shop" | "manual" | string;
  sourceUrl?: string | null;
  affiliateUrl?: string | null;
  price?: {
    current?: string | null;
    original?: string | null;
    currency?: string | null;
    capturedAt?: string | null;
    volatility: "stable" | "volatile" | "expired" | "unknown";
  };
  rating?: {
    value?: string | null;
    reviewCount?: string | null;
    soldCount?: string | null;
    capturedAt?: string | null;
    volatility: "stable" | "volatile" | "expired" | "unknown";
  };
  claims: Array<{
    id: string;
    text: string;
    evidenceRefIds: string[];
    risk: "low" | "medium" | "high" | "blocked";
    renderAllowed: boolean;
  }>;
  warnings: string[];
  visualIdentityLock: {
    productReferenceAssetPackId?: string | null;
    allowedImageIds: string[];
    blockedImageIds: string[];
    mustNotAlter: string[];
  };
};
```

### 6.3 Shot View

```ts
export type HyperframesShotView = {
  id: string;
  order: number;
  title: string;
  durationSeconds: number;
  beat: string;
  caption?: string | null;
  voiceover?: string | null;
  productUsage: "hero" | "detail" | "proof" | "usage" | "result" | "cta" | "none";
  frameUrl?: string | null;
  startFrameUrl?: string | null;
  stopFrameUrl?: string | null;
  videoClipUrl?: string | null;
  thumbnailUrl?: string | null;
  evidenceRefs: string[];
  qaStatus: "accepted" | "accepted_with_warnings" | "blocked" | "pending";
};
```

### 6.4 Media Refs

```ts
export type HyperframesMediaRefs = {
  productImages: Array<{
    id: string;
    url: string;
    role: "cover" | "main" | "detail" | "description" | "reference";
    source: "marketplace_capture" | "library" | "upload" | "generated";
    hash?: string | null;
    storageKey?: string | null;
    evidenceRefIds: string[];
  }>;
  generatedFrames: Array<{
    shotId: string;
    url: string;
    role: "storyboard_frame" | "start_frame" | "stop_frame";
    qaStatus: "accepted" | "accepted_with_warnings";
  }>;
  videoClips: Array<{
    shotId: string;
    url: string;
    durationSeconds: number;
    hasNativeAudio: boolean;
    qaStatus: "accepted" | "accepted_with_warnings";
  }>;
  audio?: {
    url?: string | null;
    voiceoverScript?: string | null;
    transcriptRefId?: string | null;
    source: "native_video_audio" | "tts" | "uploaded" | "silent";
  } | null;
};
```

### 6.5 Copy Plan

Text is the biggest commercial risk in deterministic render. Every rendered text item must be explainable.

```ts
export type HyperframesCopyPlan = {
  title: {
    text: string;
    source: "product_truth" | "agent_plan" | "user_edit";
    evidenceRefs: string[];
  };
  captions: Array<{
    shotId: string;
    text: string;
    startSeconds: number;
    endSeconds: number;
    source: "voiceover" | "agent_plan" | "user_edit";
    evidenceRefs: string[];
  }>;
  badges: Array<{
    text: string;
    kind: "price" | "discount" | "spec" | "warning" | "disclosure" | "cta";
    startSeconds: number;
    endSeconds: number;
    evidenceRefs: string[];
    renderAllowed: boolean;
  }>;
  cta?: {
    text: string;
    targetUrl?: string | null;
    evidenceRefs: string[];
    integrityStatus: "passed" | "warning" | "blocked" | "not_checked";
  } | null;
};
```

### 6.6 Brand Frame Profile

Create a SmartSpecPro video-oriented design profile inspired by the HyperFrames `frame.md` concept.

```ts
export type HyperframesBrandFrameProfile = {
  schemaVersion: 1;
  profileId: string;
  profileVersion: string;
  palette: {
    background: string;
    foreground: string;
    accent: string;
    warning: string;
    muted: string;
  };
  typography: {
    headingFamily: string;
    bodyFamily: string;
    captionFamily: string;
  };
  motion: {
    defaultTransition: "cut" | "fade" | "slide" | "push" | "zoom";
    maxMotionIntensity: "low" | "medium" | "high";
    reducedMotionCompatible: boolean;
  };
  safeAreaRules: {
    minTextPaddingPx: number;
    maxCaptionLines: number;
    maxBadgeCharacters: number;
  };
};
```

### 6.7 Subtitle And Audio Sync Plans

Captioned final composites need a stricter contract than generic text overlays.
Subtitles and audio alignment must be derived from approved voiceover/script,
TTS alignment, verified ASR, or explicit user edits. They must not come from
visual prompts, hidden policy notes, raw agent reasoning, or marketplace DOM
instruction text.

```ts
export type HyperframesSubtitlePlan = {
  schemaVersion: 1;
  mode: "none" | "burn_in" | "soft_sidecar" | "both";
  source:
    | "approved_voiceover_script"
    | "tts_alignment"
    | "verified_asr"
    | "user_edit"
    | "none";
  language: "th" | "en" | string;
  sidecarFormat?: "srt" | "vtt" | null;
  transcriptRefId?: string | null;
  cues: Array<{
    id: string;
    shotId?: string | null;
    text: string;
    startSeconds: number;
    endSeconds: number;
    sourceRefIds: string[];
    confidence: number;
    renderAllowed: boolean;
    qaStatus:
      | "pending"
      | "accepted"
      | "accepted_with_warnings"
      | "blocked";
  }>;
  burnInStyle: {
    maxLines: number;
    maxCharactersPerLine: number;
    safeAreaAnchor: "bottom" | "top" | "center";
    minimumContrastRatio: number;
  };
  timingToleranceMs: number;
  policyRefs: string[];
};

export type HyperframesAudioSyncPlan = {
  schemaVersion: 1;
  source: "native_video_audio" | "tts" | "uploaded" | "silent";
  audioUrl?: string | null;
  expectedDurationSeconds: number;
  measuredDurationSeconds?: number | null;
  driftToleranceMs: number;
  silencePolicy: {
    allowSilentOutput: boolean;
    maxUnexpectedSilenceSeconds: number;
    requireVoiceoverForFinal: boolean;
  };
  mixPolicy: {
    targetLufs?: number | null;
    duckMusicUnderVoiceover: boolean;
    preventClipping: boolean;
  };
  qaStatus: "pending" | "accepted" | "accepted_with_warnings" | "blocked";
  evidenceRefs: string[];
};
```

Subtitle/audio acceptance rules:

- every cue must fit within the composition duration and must not overlap invalidly
  with another cue on the same track;
- burn-in subtitles must pass safe-area, contrast, line-count, and overflow
  checks before final render can be saved to Library;
- soft subtitles must be stored as sidecar artifacts with checksums and linked
  to Library metadata;
- final composite render must verify rendered audio duration against the
  expected composition duration before `library_finalize`;
- if audio is `silent`, the Library metadata must say that intentionally and
  final QA must not treat silence as a missing-audio failure.

### 6.8 Compliance Plan

```ts
export type HyperframesCompliancePlan = {
  schemaVersion: 1;
  renderApprovalState:
    | "not_required"
    | "preflight_passed"
    | "passed_with_warnings"
    | "blocked"
    | "requires_human_review";
  policyProfileIds: string[];
  advertisingRulePackRefs: string[];
  disclosureRequirements: Array<{
    id: string;
    kind:
      | "affiliate"
      | "synthetic_media"
      | "material_connection"
      | "price_volatility"
      | "regulated_category"
      | "safety_warning"
      | "cta_landing";
    required: boolean;
    rendered: boolean;
    text?: string | null;
    evidenceRefs: string[];
  }>;
  blockedClaims: Array<{
    claimId: string;
    reason: string;
    evidenceRefs: string[];
  }>;
  warningRefs: string[];
  humanReviewRef?: string | null;
  finalRenderAllowed: boolean;
  librarySaveAllowed: boolean;
};
```

Compliance rules:

- `finalRenderAllowed` must be false if any required disclosure is missing;
- `librarySaveAllowed` must be false if final QA, CTA integrity, subtitle
  readiness, or product-truth checks are blocked;
- user accepted warnings may allow a draft/preview render, but must not allow
  final Library save when a hard compliance blocker remains;
- compliance details returned to normal users must be sanitized and must not
  include hidden policy reasoning or private evidence.

### 6.9 Provenance Envelope

```ts
export type HyperframesProvenanceEnvelope = {
  schemaVersion: 1;
  sourceFeature: "marketplace_auto_review";
  marketplaceProductId: string;
  productId: string;
  runId: string;
  productionRunId?: string | null;
  conceptId?: string | null;
  storyboardReviewId?: string | null;
  videoEditorProjectId?: string | null;
  productTruthHash: string;
  inputSnapshotHash: string;
  compositionInputHash: string;
  templateRef: {
    templateId: string;
    templateVersion: string;
    templateSource: "built_in" | "tenant_custom" | "system_generated";
  };
  artifactRefs: string[];
  evidenceRefs: string[];
  qaVerdictRefs: string[];
  creditRefs: string[];
  policyRefs: string[];
  lineageRefs: Array<{
    sourceRef: string;
    targetRef: string;
    relationship:
      | "rendered_from"
      | "captioned_from"
      | "derived_thumbnail_from"
      | "saved_to_library"
      | "sent_to_video_editor";
  }>;
};
```

The provenance envelope must be copied into render job output, stage completion
evidence, Storyboard Review/Video Editor projection metadata where applicable,
and the final Library item metadata.

### 6.10 Render Job Envelope

```ts
export type HyperframesRenderJob = {
  id: string;
  tenantId: string;
  userId: number;
  runId: string;
  stageKey: "storyboard_review" | "render" | "library_finalize";
  compositionMode: HyperframesCompositionInput["compositionMode"];
  renderIntent: HyperframesCompositionInput["renderIntent"];
  templateId: string;
  templateVersion: string;
  compositionInputHash: string;
  compositionHtmlHash: string;
  status:
    | "queued"
    | "staging_assets"
    | "linting"
    | "rendering"
    | "inspecting"
    | "completed"
    | "dead_lettered"
    | "failed"
    | "cancelled";
  retry: {
    attempts: number;
    maxAttempts: number;
    lastFailureClass?:
      | "transient_worker"
      | "transient_storage"
      | "transient_dependency"
      | "permanent_input"
      | "permanent_policy"
      | "permanent_template"
      | "cancelled"
      | null;
    nextRetryAt?: string | null;
  };
  output: {
    mp4Url?: string | null;
    webmUrl?: string | null;
    thumbnailUrl?: string | null;
    snapshotUrls?: string[];
    manifestUrl?: string | null;
  };
  diagnostics: {
    hyperframesVersion?: string | null;
    nodeVersion?: string | null;
    chromeVersion?: string | null;
    ffmpegVersion?: string | null;
    renderDurationMs?: number | null;
    frameCount?: number | null;
    lintWarnings?: string[];
    inspectWarnings?: string[];
    errorMessage?: string | null;
  };
};
```

### 6.11 User-Facing Render Status Projection

HyperFrames must not make the Product Detail UI infer render state from raw worker
payloads. Add a sanitized projection that can be embedded in the existing
Marketplace Auto Review API projection and stage output JSON.

```ts
export type HyperframesRenderUserStatus =
  | "not_available"
  | "queued"
  | "staging_assets"
  | "linting"
  | "rendering"
  | "inspecting"
  | "ready_for_review"
  | "completed"
  | "saved_to_library"
  | "blocked_needs_user"
  | "compliance_blocked"
  | "template_disabled"
  | "stale_input_hash"
  | "dead_lettered"
  | "failed"
  | "cancelled";

export type HyperframesRepairAction = {
  action:
    | "regenerate_from_current_plan"
    | "recreate_snapshot"
    | "retry_worker_step"
    | "rerun_layout_inspect";
  source:
    | "stale_input_hash"
    | "missing_snapshot"
    | "retryable_worker_error"
    | "minor_layout_warning";
  safeMessage: string;
  primary: boolean;
  requiresUserConfirmation: boolean;
  auditReasonCode: string;
  blockedReasonCodes: string[];
};

export type HyperframesPollingGuidance = {
  recommendedIntervalMs: number;
  maxIntervalMs: number;
  stopWhenStatus: HyperframesRenderUserStatus[];
  backoffAfterMs?: number;
};

export type HyperframesRenderStatusProjection = {
  schemaVersion: 1;
  renderJobId: string;
  runId: string;
  stageKey: "storyboard_review" | "render" | "library_finalize";
  compositionMode: HyperframesCompositionInput["compositionMode"];
  renderIntent: HyperframesCompositionInput["renderIntent"];
  template: {
    templateId: string;
    templateVersion: string;
    templateSource: "built_in" | "tenant_custom" | "system_generated";
    approvalStatus: "active" | "disabled" | "archived" | "candidate";
  };
  platformPresetId: HyperframesPlatformProfile["presetId"];
  status: HyperframesRenderUserStatus;
  failureClass?:
    | "transient_worker"
    | "transient_storage"
    | "transient_dependency"
    | "permanent_input"
    | "permanent_policy"
    | "permanent_template"
    | "cancelled"
    | null;
  progressPercent: number;
  statusDetail: {
    severity: "info" | "success" | "warning" | "error" | "blocked";
    safeMessage: string;
    nextAction?: string | null;
    userActionRequired: boolean;
    operatorActionAvailable: boolean;
    retryable: boolean;
    reasonCodes: string[];
    technicalRef?: string | null;
  };
  repairActions: HyperframesRepairAction[];
  creditEstimate?: HyperframesCreditEstimate | null;
  retentionSummary?: {
    previewExpiresAt?: string | null;
    libraryOwned: boolean;
    purgeEligible: boolean;
  };
  outputLinks: Array<{
    kind:
      | "hyperframes_preview"
      | "hyperframes_render"
      | "thumbnail"
      | "snapshot"
      | "subtitle"
      | "metadata_manifest"
      | "library_item"
      | "video_editor";
    label: string;
    url: string;
    safeForUser: true;
    stageKey: "storyboard_review" | "render" | "library_finalize";
    artifactRef?: string | null;
  }>;
  redaction: {
    rawCompositionHtmlHidden: true;
    rawSignedUrlsHidden: true;
    workerLogsHidden: true;
    privateStorageKeysHidden: true;
    privateEvidenceHidden: true;
  };
};
```

Projection placement:

- extend `MarketplaceAutoReviewOutputLinkSchema.kind` to include
  `hyperframes_preview`, `hyperframes_render`, and `hyperframes_snapshot` if the
  implementation needs labels more specific than existing `render`, `thumbnail`,
  `subtitle`, and `metadata_manifest` kinds;
- copy the projection into the relevant
  `marketplace_auto_review_stages.outputJson.hyperframesRender`;
- add safe HyperFrames output links through the existing
  `MarketplaceAutoReviewOutputLinkSchema` so Product Detail can render them in the
  current timeline/output link UI;
- copy the current render summary into `run.metadataJson.hyperframes.renderJobs`
  for resume and history views;
- expose operator-only diagnostics through a separate authorized API, not through
  this user projection.
- `repairActions` must always be present as an array. It is empty when no safe
  repair exists. UI pages must not derive repair availability by parsing
  `statusDetail.safeMessage`.
- repair actions are allowed only for stale input hash, missing snapshot,
  retryable worker/dependency/storage error, and minor layout warning cases that
  can be recovered without unsafe user customization.

### 6.11.1 Feature Access Projection

The UI must not independently re-evaluate every flag, worker diagnostic, template,
credit, quota, and Library permission. Add one backend-derived access projection
for Product Detail, Storyboard Review, and MediaStudio.

```ts
export type HyperframesFeatureAccessProjection = {
  schemaVersion: 1;
  tenantId: string;
  userId: number;
  productId?: string | null;
  runId?: string | null;
  enabled: boolean;
  visibility: "hidden" | "visible_disabled" | "visible_enabled";
  reasons: Array<{
    code:
      | "feature_flag_disabled"
      | "tenant_not_allowlisted"
      | "worker_unavailable"
      | "template_unavailable"
      | "product_anchor_missing"
      | "evidence_missing"
      | "credit_authorization_required"
      | "quota_blocked"
      | "library_save_disabled"
      | "permission_denied"
      | "policy_blocked";
    severity: "info" | "warning" | "blocked";
    safeMessage: string;
    nextAction?: string | null;
  }>;
  capabilities: {
    canCreatePreview: boolean;
    canCreateFinalRender: boolean;
    canSaveToLibrary: boolean;
    canSendToVideoEditor: boolean;
    canViewDiagnostics: boolean;
    canReplayDeadLetter: boolean;
  };
  workerReadiness: {
    status: "unknown" | "ready" | "degraded" | "unavailable";
    checkedAt?: string | null;
    missingCapabilities: string[];
  };
  templateAvailability: {
    activeTemplateCount: number;
    defaultTemplateId?: string | null;
    blockedTemplateRefs: string[];
  };
  creditAndQuota: {
    estimate?: HyperframesCreditEstimate | null;
    freePreviewRemaining: number;
    quotaDecision:
      | "allowed"
      | "free_preview_allowed"
      | "needs_authorization"
      | "quota_blocked"
      | "credit_blocked";
  };
};
```

Projection rules:

- `visibility=hidden` when tenant feature access is completely unavailable;
- `visible_disabled` when the user should see why HyperFrames cannot be used;
- all user-visible blockers must use sanitized `safeMessage`;
- Product Detail controls must disable from this projection, not from ad hoc
  client-side flag checks;
- operator-only capabilities must be false for normal users even when a dead
  letter exists.

### 6.11.2 Auto Storyboard Review Plan Projection

Marketplace Capture must expose one backend-derived auto plan for Storyboard
Review Auto. The plan is the source of truth for default decisions, visible
summary copy, auto queueing, and advanced override comparison.

```ts
export type MarketplaceAutoReviewLaunchMode =
  | "auto_storyboard_review"
  | "standard_order";

export type HyperframesAutoDecisionSource =
  | "backend_default"
  | "tenant_policy"
  | "product_truth"
  | "asset_quality"
  | "compliance_policy"
  | "worker_capability"
  | "credit_policy"
  | "user_override";

export type HyperframesAutoPlanStatus =
  | "ready"
  | "queued"
  | "running"
  | "blocked"
  | "needs_user_fix"
  | "completed"
  | "skipped";

export type HyperframesAutoPlanDecision<T extends string = string> = {
  value: T;
  labelKey: string;
  source: HyperframesAutoDecisionSource;
  reasonCode: string;
  safeReason: string;
  overriddenByUser: boolean;
};

export type HyperframesAutoStoryboardReviewPlan = {
  schemaVersion: "1.0";
  launchMode: "auto_storyboard_review";
  tenantId: string;
  productId: string;
  runId: string;
  status: HyperframesAutoPlanStatus;
  autoStartAllowed: boolean;
  autoQueuePreviewAllowed: boolean;
  autoRepairAllowed: boolean;
  decisions: {
    outputMode: HyperframesAutoPlanDecision<"storyboard_images" | "full_video">;
    frameStrategy: HyperframesAutoPlanDecision<
      "auto" | "storyboard_3x3_split" | "video_shot_start_stop"
    >;
    audioStrategy: HyperframesAutoPlanDecision<
      "auto" | "native_video_audio" | "separate_tts_voiceover" | "silent"
    >;
    renderEngine: HyperframesAutoPlanDecision<
      "existing_ffmpeg_timeline" | "hyperframes_composition"
    >;
    compositionMode: HyperframesAutoPlanDecision<
      | "none"
      | "storyboard_motion_preview"
      | "product_card_explainer"
      | "captioned_final_composite"
      | "social_variant_package"
    >;
    templateId: HyperframesAutoPlanDecision<string>;
    platformPresetId: HyperframesAutoPlanDecision<string>;
    textOverlayPolicy: HyperframesAutoPlanDecision<
      "none" | "evidence_backed" | "captions_and_disclosures"
    >;
  };
  summary: {
    title: string;
    safeDescription: string;
    selectedAssetCount: number;
    estimatedDurationSeconds?: number;
    estimatedCostLabel?: string;
    estimatedReadyInLabel?: string;
    primaryNextAction:
      | "start"
      | "resume"
      | "wait"
      | "fix_assets"
      | "open_output"
      | "use_auto_plan";
  };
  blockers: Array<{
    code: string;
    severity: "info" | "warning" | "blocking";
    safeMessage: string;
    requiredUserAction?: string;
  }>;
  overrideState: {
    advancedOverridesAvailable: boolean;
    hasUserOverrides: boolean;
    overrideSummary: string[];
    canResetToAuto: boolean;
  };
  idempotencyPreview: {
    compositionInputHash: string;
    effectiveDecisionHash: string;
  };
};
```

Auto plan requirements:

- every Marketplace Capture and Storyboard Review page must render auto defaults
  from this projection instead of recomputing decisions client-side;
- the auto plan applies only to `launchMode="auto_storyboard_review"` and must
  not silently rewrite Standard Order selections;
- Standard Order must continue to use the existing Marketplace Auto Review
  contracts for explicit output mode/frame/audio/model/shot choices, with
  HyperFrames fields added only when the user explicitly selects or permits them;
- if `autoStartAllowed` is true, the primary CTA should start/resume without
  requiring any selector interaction;
- if `autoQueuePreviewAllowed` is true, HyperFrames preview should be queued by
  backend progression after storyboard readiness, not by a required user click;
- manual customization is represented as `user_override` decisions and must be
  visible as a diff from the auto plan;
- `canResetToAuto` must be available whenever user overrides create a blocker or
  when the user wants to return to the recommended path;
- the auto plan summary must not expose raw template internals, private URLs,
  raw HTML, worker logs, or policy reasoning.

### 6.12 Outbox-To-UI Status Mapping

The MVP outbox worker state must map deterministically into the user projection.

| Outbox/job condition | Failure class | Artifact condition | User status | UI next action |
| --- | --- | --- | --- | --- |
| queued and not locked | none | none | `queued` | wait for worker |
| running `hyperframes_asset_stage` | none | staged manifest pending | `staging_assets` | wait for asset staging |
| running `hyperframes_lint` | none | composition HTML ready | `linting` | wait for template checks |
| running `hyperframes_snapshot` | none | snapshots pending | `inspecting` | wait for visual checks |
| running `hyperframes_render` | none | MP4/WebM pending | `rendering` | wait for render |
| running `hyperframes_inspect` | none | output exists, QA pending | `inspecting` | wait for final QA |
| completed `hyperframes_render` or `hyperframes_finalize` | none | MP4 and manifest ready | `completed` or `ready_for_review` according to intent | open preview or save to Library |
| completed `hyperframes_finalize` plus Library item ID | none | Library metadata linked | `saved_to_library` | open Library |
| failed but retry attempts remain | transient worker/storage/dependency | partial artifacts allowed | previous active status with warning | wait for retry |
| failed and retry attempts exhausted | transient worker/storage/dependency | sanitized log ready | `dead_lettered` | operator can replay after diagnosis |
| failed | permanent input | input/provenance hash invalid | `blocked_needs_user` | create a new render after fixing product/run inputs |
| failed | permanent policy | compliance blocker | `compliance_blocked` | resolve disclosure/policy blocker |
| failed | permanent template | disabled/schema-mismatched template | `template_disabled` | choose another active template |
| any retry/replay with mismatched current hash | any | old artifacts only | `stale_input_hash` | create a new render request |
| cancelled by user/operator | cancelled | partial artifacts may exist | `cancelled` | start a new render if needed |

Mapping rules:

- transient failures may auto-retry only while `attempts < maxAttempts`;
- permanent failures must not auto-retry;
- dead-letter replay is operator-only and must check input hash, template version,
  platform preset version, and security-disable state before queueing;
- normal users may see `operatorActionAvailable: true` but must not see replay
  controls unless authorized;
- every mapped state must provide a sanitized `safeMessage` and one `nextAction`.

### 6.12.1 Status Copy And I18n Matrix

Every `HyperframesRenderUserStatus` must have a centralized Thai/English label,
safe message, and next action. UI components may override layout, but not invent
new status wording per page.

| Status | Thai label | English label | Default safe message | Default next action |
| --- | --- | --- | --- | --- |
| `not_available` | ยังไม่พร้อมใช้ | Not available | HyperFrames is not available for this product or tenant. | Check feature access. |
| `queued` | รอคิวเรนเดอร์ | Queued | The composition render is queued. | Wait for the worker. |
| `staging_assets` | เตรียมไฟล์สื่อ | Staging assets | The worker is preparing product media and render assets. | Wait for asset staging. |
| `linting` | ตรวจเทมเพลต | Checking template | The composition template is being validated. | Wait for template checks. |
| `rendering` | กำลังเรนเดอร์ | Rendering | HyperFrames is rendering the video. | Wait for render completion. |
| `inspecting` | ตรวจวิดีโอ | Inspecting | The output is being checked for layout, media, and policy readiness. | Wait for final QA. |
| `ready_for_review` | พร้อมตรวจ | Ready for review | The preview is ready for review. | Open preview or compare snapshots. |
| `completed` | เรนเดอร์เสร็จ | Completed | The render is complete and ready for the next step. | Open output or save to Library. |
| `saved_to_library` | บันทึกเข้า Library แล้ว | Saved to Library | The final render is saved to Library. | Open Library item. |
| `blocked_needs_user` | ต้องแก้ข้อมูลก่อน | Needs user input | The render is blocked by missing or changed user/product inputs. | Fix inputs and create a new render. |
| `compliance_blocked` | ติดนโยบาย | Compliance blocked | The render is blocked by policy, disclosure, or CTA requirements. | Resolve the listed blocker. |
| `template_disabled` | เทมเพลตถูกปิด | Template disabled | This template cannot be used for new renders. | Choose another active template. |
| `stale_input_hash` | ข้อมูลเปลี่ยนแล้ว | Inputs changed | The render input no longer matches the current product/run state. | Create a new render request. |
| `dead_lettered` | รอผู้ดูแลตรวจ | Needs operator review | The worker exhausted retries and stored sanitized diagnostics. | Contact an operator or wait for replay. |
| `failed` | ล้มเหลว | Failed | The render failed and cannot continue automatically. | Review the safe error and retry if allowed. |
| `cancelled` | ยกเลิกแล้ว | Cancelled | The render was cancelled. | Start a new render if needed. |

Copy requirements:

- labels and messages must live in the shared UI/i18n layer used by the touched
  pages;
- Thai copy is required because Marketplace Auto Review currently uses Thai
  workflow copy heavily;
- `safeMessage` from the backend may replace the default message, but cannot
  include raw logs, signed URLs, storage keys, or private evidence;
- each status should have at most one primary `nextAction` in the UI.

### 6.13 Deterministic Hash Inputs

The composition input hash and render output hash are billing, idempotency,
provenance, and stale-replay guards. The hash builder must use canonical JSON
with stable key ordering and must include at least:

| Hash input | Why it matters |
| --- | --- |
| `schemaVersion` and contract version | prevents cross-version replay ambiguity |
| tenant, user, run, product, production run, concept, and storyboard review IDs | preserves ownership and lineage |
| render intent and composition mode | separates preview, draft, final, and variant jobs |
| template ID, template version, template source, and template content hash | makes template changes rerender intentionally |
| platform preset ID, preset version, width, height, fps, duration, safe area, subtitle/disclosure placement, and thumbnail policy | prevents wrong-platform cache reuse |
| product truth hash, selected variant hash, evidence manifest hash, and claim/evidence map hash | prevents stale product facts and unsupported claims |
| selected product/character/environment anchor refs and hashes | preserves current anchor locks |
| storyboard shot IDs/order, storyboard frame hashes, generated clip hashes, audio refs, subtitle plan hash, and audio sync plan hash | preserves media/timing correctness |
| copy plan hash, compliance plan hash, disclosure refs, CTA/landing refs, and policy pack refs | prevents unsafe text or disclosure drift |
| brand frame profile hash and runtime render profile | preserves layout/motion choices |
| asset staging manifest hash and font/runtime capability profile | prevents replay when staged inputs differ |

`compositionHtmlHash` must be derived from the generated HTML/CSS/JS bundle after
sanitization. `outputHash` must be derived from the final uploaded media bytes or
a trusted storage checksum. The render job must store all three hashes:

- `compositionInputHash`
- `compositionHtmlHash`
- `outputHash` when media output exists

---

## 7. Storage And Data Model

### 7.1 MVP Persistence

For the first implementation, avoid unnecessary schema churn where possible:

- Store run-level composition decisions in `marketplace_auto_review_runs.metadataJson`.
- Store stage-level render output in `marketplace_auto_review_stages.outputJson`.
- Store final media in existing storage and Media Library.
- Store render-to-library traceability in the existing Library metadata envelope.

This keeps the first version small and reversible.

### 7.2 MVP Runtime State Decision

MVP should reuse the existing Marketplace Auto Review runtime tables instead of
creating a second queue/artifact system.

Use existing tables:

- `marketplace_auto_review_outbox_jobs`
  - enqueue HyperFrames work with job types such as:
    - `hyperframes_asset_stage`
    - `hyperframes_lint`
    - `hyperframes_snapshot`
    - `hyperframes_render`
    - `hyperframes_inspect`
    - `hyperframes_finalize`
  - store `compositionInputHash`, `compositionHtmlHash`, `templateId`,
    `templateVersion`, `templateContentHash`, `platformPresetId`,
    `platformPresetVersion`, `renderIntent`, `compositionMode`, and
    `runtimeProfileHash` in `payloadJson`;
  - use `idempotencyKey` format:
    `hyperframes:{tenantId}:{runId}:{templateId}:{templateVersion}:{platformPresetId}:{renderIntent}:{compositionInputHash}`;
  - use existing `status`, `attempts`, `maxAttempts`, `lockedBy`,
    `lockedUntil`, `scheduledAt`, and `lastError` fields for worker state;
  - use the existing scheduled job or a focused HyperFrames worker consumer,
    but keep idempotency and stale-lock recovery semantics compatible with the
    current outbox contract.

- `marketplace_auto_review_artifacts`
  - store HyperFrames input JSON, composition HTML, snapshots, MP4/WebM,
    thumbnails, sidecar subtitles, manifests, and sanitized logs as artifact
    rows;
  - use `artifactKind` values such as:
    - `hyperframes_input_json`
    - `hyperframes_composition_html`
    - `hyperframes_snapshot`
    - `hyperframes_render_mp4`
    - `hyperframes_render_webm`
    - `hyperframes_subtitle_vtt`
    - `hyperframes_manifest`
    - `hyperframes_sanitized_log`
  - use `contentHash` to dedupe retries and resumptions;
  - store retention class, checksum details, and template/runtime diagnostics
    in `metadataJson`.

This reuse decision prevents Marketplace Auto Review from having two competing
job ledgers during the first release. HyperFrames-specific tables are a later
promotion step, not an MVP requirement.

### 7.2.1 Library Save Idempotency

Current Marketplace Auto Review final render Library save dedupes mostly by
`auto_review_run_id` plus `source_type`. HyperFrames can legitimately create more
than one output for the same run when the user renders a preview, final composite,
or platform variant. Add a more specific Library idempotency contract.

Required Library idempotency key:

```text
hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}
```

Library finalize request:

```ts
export type HyperframesLibraryMetadata = {
  source_type: "marketplace_auto_review_hyperframes_render";
  render_engine: "hyperframes";
  marketplace_product_id: string;
  product_id: string;
  production_run_id?: string | null;
  auto_review_run_id: string;
  storyboard_review_id?: string | null;
  video_editor_project_id?: string | null;
  render_job_id: string;
  render_intent: "preview" | "draft" | "final" | "variant";
  composition_mode: HyperframesCompositionInput["compositionMode"];
  template_id: string;
  template_version: string;
  template_content_hash: string;
  platform_preset_id: HyperframesPlatformProfile["presetId"];
  platform_preset_version: string;
  composition_input_hash: string;
  composition_html_hash: string;
  output_hash: string;
  subtitle_refs: string[];
  transcript_refs: string[];
  manifest_refs: string[];
  qa_refs: string[];
  credit_refs: string[];
  provenance: HyperframesProvenanceEnvelope;
};

export type HyperframesLibraryFinalizeRequest = {
  schemaVersion: 1;
  tenantId: string;
  userId: number;
  runId: string;
  renderJobId: string;
  renderIntent: "preview" | "draft" | "final" | "variant";
  compositionMode: HyperframesCompositionInput["compositionMode"];
  compositionInputHash: string;
  compositionHtmlHash: string;
  outputHash: string;
  idempotencyKey: string;
  sourceType: "marketplace_auto_review_hyperframes_render";
  title: string;
  sourceUrl: string;
  thumbnailUrl?: string | null;
  metadata: HyperframesLibraryMetadata;
};
```

Duplicate behavior:

- if the key already exists, return the existing Library item ID and `created:
  false`;
- refresh metadata only when the new metadata has the same
  `compositionInputHash`, `compositionHtmlHash`, `outputHash`, template ref,
  platform preset, and tenant/user/run ownership;
- never create a second Library item for the same idempotency key;
- never overwrite a finalized item with a stale input hash, different template
  version, different platform preset, or lower QA status;
- include the idempotency key in Library metadata and audit events.

### 7.3 Retention And Purge Policy

HyperFrames artifacts have different privacy, storage, and audit needs. Retention
must be explicit per artifact class, and purge jobs must be idempotent.

MVP retention defaults:

| Artifact kind | Retention class | Default retention | Purge behavior |
| --- | --- | --- | --- |
| `hyperframes_input_json` | `review` | 30 days for unconfirmed preview, retained with Library item if finalized | purge raw product/evidence details after expiry unless referenced by final Library provenance |
| `hyperframes_composition_html` | `review` | 7 days for preview, 30 days for draft, retained only as hash/manifest for final Library | purge HTML body; keep hash/template/version metadata |
| `hyperframes_snapshot` | `temporary` or `review` | 7 days for preview, 30 days for failed QA, retained for golden fixtures only when explicitly marked | purge files and mark artifact row deleted/expired |
| `hyperframes_render_mp4` / `hyperframes_render_webm` | `review` or `library` | 7 days for preview-only, retained by Library policy after save | preview files purge after expiry; Library files follow Library retention/deletion rules |
| `hyperframes_subtitle_vtt` / subtitle sidecar | `review` or `library` | same as paired render | purge with paired render unless saved to Library |
| `hyperframes_manifest` | `audit` | 90 days for failed/preview, retained with Library item for finalized output | redact private URLs before long retention |
| `hyperframes_sanitized_log` | `audit` | 30 days for normal failures, 90 days for dead-letter/operator replay | keep sanitized text only; never retain signed URLs |

Purge requirements:

- purge by tenant/run/artifact kind and retention class;
- never delete a Library-owned artifact through preview cleanup;
- mark artifact metadata as purged before deleting storage when the DB supports
  the state, or write a sanitized audit event when DB status cannot be changed;
- preserve content hashes, template refs, product/run IDs, and manifest refs
  needed for provenance even when raw HTML/input/log bodies are deleted;
- skip purge when a render job is active, locked, or within retry grace period;
- retry purge on transient storage failures and dead-letter purge failures for
  operator review;
- include purge coverage in rollout gate and operator runbook.

### 7.4 Migration Promotion Criteria

Do not add `hyperframes_*` durable tables for MVP unless at least one of these
conditions is true during implementation:

- existing outbox `payloadJson` cannot express render lifecycle state without
  unsafe denormalized blobs;
- workers need independent scheduling, queue depth, retry policy, or lease
  semantics that would make `marketplace_auto_review_outbox_jobs` ambiguous;
- render jobs must be listed/searched independently of Marketplace Auto Review
  runs;
- artifact retention, billing, or admin reporting requires query patterns that
  are inefficient or unclear on `marketplace_auto_review_artifacts`;
- the team needs tenant custom template lifecycle management before launch;
- cancellation/replay/dead-letter operations need render-job-level status that
  cannot be projected safely from outbox plus artifact rows;
- expected production volume exceeds the outbox/artifact table's operational
  envelope and needs separate indexes or sharding.

If a migration is needed, implement it as a separate phase with:

- dry-run migration and rollback SQL;
- backfill script from existing outbox/artifact rows to new HyperFrames rows;
- idempotency preservation from the old key format;
- dual-read compatibility during rollout;
- a clear cutover flag;
- cleanup plan for stale preview artifacts.

### 7.5 Recommended Durable Tables

If HyperFrames becomes more than an experimental render path, add dedicated tables.

#### `hyperframes_composition_templates`

Purpose: version controlled template registry.

Columns:

- `id` varchar primary key
- `tenantId` nullable varchar
- `templateKey` varchar
- `version` varchar
- `status` varchar: `draft`, `active`, `disabled`, `archived`
- `compositionMode` varchar
- `platformProfile` varchar
- `sourceType` varchar: `built_in`, `tenant_custom`, `system_generated`
- `templateManifestJson` jsonb
- `frameProfileJson` jsonb
- `createdByUserId` nullable integer
- `createdAt`, `updatedAt`, `archivedAt`

Indexes:

- unique active template by `(tenantId, templateKey, version)`
- lookup by `(tenantId, status, compositionMode)`

#### `hyperframes_render_jobs`

Purpose: durable render state, idempotency, diagnostics, and output refs.

Columns:

- `id` varchar primary key
- `tenantId` varchar
- `userId` integer
- `marketplaceAutoReviewRunId` nullable varchar
- `productId` nullable varchar
- `productionRunId` nullable varchar
- `compositionMode` varchar
- `renderIntent` varchar
- `templateId` varchar
- `templateVersion` varchar
- `compositionInputHash` varchar
- `compositionHtmlHash` varchar
- `status` varchar
- `priority` integer
- `attempts` integer
- `lockedBy` nullable varchar
- `lockedUntil` nullable timestamptz
- `inputJson` jsonb
- `outputJson` jsonb
- `diagnosticsJson` jsonb
- `errorMessage` text
- `createdAt`, `updatedAt`, `completedAt`

Indexes:

- unique idempotency by `(tenantId, compositionInputHash, templateId, templateVersion, renderIntent)`
- run lookup by `(marketplaceAutoReviewRunId, createdAt)`
- worker lookup by `(status, priority, updatedAt)`

#### `hyperframes_render_artifacts`

Purpose: artifact lineage and cleanup.

Columns:

- `id` bigserial primary key
- `renderJobId` varchar
- `tenantId` varchar
- `artifactType` varchar: `composition_html`, `input_json`, `mp4`, `webm`, `thumbnail`, `snapshot`, `manifest`, `logs`
- `storageKey` text
- `url` text nullable
- `sha256` varchar nullable
- `sizeBytes` bigint nullable
- `metadataJson` jsonb
- `retentionClass` varchar: `temporary`, `review`, `library`, `audit`
- `createdAt`, `expiresAt`, `deletedAt`

### 7.6 Storage Paths

Use tenant/run scoped paths:

```text
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/input.json
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/composition/index.html
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/composition/assets/...
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/snapshots/frame-000.png
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/output.mp4
marketplace-auto-review/{tenantId}/{runId}/hyperframes/{renderJobId}/manifest.json
```

Final Library copies may move to existing Library paths after `library_finalize`.

---

## 8. Service Boundaries

### 8.1 Node Backend Services

Add focused services instead of growing `marketplaceAutoReviewService.ts` further.

Recommended files:

- `apps/web/server/services/hyperframesCompositionService.ts`
- `apps/web/server/services/hyperframesTemplateRegistry.ts`
- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesAssetStagingService.ts`
- `apps/web/server/services/hyperframesCompositionSanitizer.ts`
- `apps/web/server/services/hyperframesQaService.ts`
- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/templates.ts`

Responsibilities:

- build composition input envelope from approved Marketplace Auto Review state
- validate product truth and evidence refs
- select template and platform profile
- generate sanitized template props
- produce static `index.html` and local asset manifest
- submit render job
- poll/reconcile render worker output
- attach output links to Auto Review timeline
- save final output to Library when QA passes

### 8.2 Render Worker

HyperFrames rendering should run outside the main web request path.

Recommended worker modes:

1. Local development:
   - use `npx hyperframes doctor`, `lint`, `inspect`, `snapshot`, and `render`
   - useful for template development, fixture evidence, and CI compatibility checks

2. Production V1:
   - dedicated official HyperFrames worker using either the CLI or
     `@hyperframes/producer`/producer server
   - worker image includes Node 22+, FFmpeg, FFprobe, Chrome/chrome-headless-shell, fonts, and storage credentials
   - MVP worker claims HyperFrames job types from
     `marketplace_auto_review_outbox_jobs`;
   - worker stages assets locally, renders, uploads artifacts, and updates
     outbox/artifact rows;
   - render output is accepted only when produced by an official HyperFrames
     runtime and accompanied by runtime/version diagnostics;
   - bespoke FFmpeg/Playwright smoke output may verify worker plumbing but must
     not unlock user-facing custom overlay, caption, transition, audio/SFX, or
     final render features;
   - if migration promotion criteria are met, a later worker can claim
     dedicated `hyperframes_render_jobs` rows instead

3. Production V2:
   - dedicated Cloud Run Job, external queue, or HyperFrames AWS Lambda adapter
   - choose only after V1 metrics show render duration and concurrency needs

The worker must not execute arbitrary user code. It renders built-in or tenant-approved templates with escaped/sanitized data.

Runtime mode names should be capability-oriented:

- `official_runtime_blocked`: only disabled UI, queue projections, and
  diagnostics are allowed.
- `official_cli_ready`: the isolated worker can render with HyperFrames CLI.
- `official_producer_ready`: the isolated worker can render with
  `@hyperframes/producer` or producer server.
- `canary`: a candidate pinned HyperFrames version is limited to selected
  tenants/jobs.
- `rollback`: new jobs use the previous pinned official runtime.

Legacy labels such as `smoke_only` may remain for migration compatibility, but
new implementation must not treat smoke output as production-ready.

### 8.3 Worker Retry, Dead-Letter, And Replay Policy

HyperFrames workers must use deterministic retry classification. Retrying must
never create duplicate Library items, duplicate render charges, or duplicate
accepted artifacts.

Failure classes:

- `transient_worker`
  - worker process crash, Chrome startup failure, temporary CPU/memory pressure;
  - retry with exponential backoff until `maxAttempts`;
  - retain staged artifacts only if checksums match the current input hash.
- `transient_storage`
  - temporary storage upload/download/presign failure;
  - retry after backoff;
  - do not regenerate composition HTML unless input hash changed.
- `transient_dependency`
  - temporary FFmpeg/Chrome/HyperFrames CLI/producer invocation failure that
    diagnostics classify as environment-recoverable;
  - retry after diagnostics snapshot is persisted.
- `permanent_input`
  - invalid composition input, missing required product truth, missing approved
    media refs, invalid duration/fps/resolution, or stale product snapshot;
  - fail without retry and show a user-action blocker.
- `permanent_policy`
  - missing required disclosure, blocked claim, CTA failure, rights/privacy
    blocker, or tenant feature flag denial;
  - fail without retry and route to user/human review where applicable.
- `permanent_template`
  - template schema mismatch, disabled template version, unsafe template,
    repeatable lint failure, or fixture gate failure;
  - fail without retry and notify operator/admin surfaces.

Outbox behavior:

- queued jobs claim with a lease and must heartbeat or release the lease before
  long renders exceed `lockedUntil`;
- stale locked jobs can be returned to `retry` only when the input hash and
  template version still match the latest run state;
- exhausted transient jobs become `dead_lettered`/`failed` with sanitized
  diagnostics and an operator replay path;
- permanent failures become terminal blockers and must not auto-retry;
- replay requires a new outbox row only when the input hash, template version,
  render intent, or operator replay token changes;
- replaying the same idempotency key must return the existing terminal result
  or resume the existing retryable job, not enqueue duplicate render work.

Dead-letter records must include:

- run ID, tenant ID, user ID, stage key, job type, idempotency key;
- failure class, sanitized error, attempt count, worker ID, runtime versions;
- composition input hash, template ID/version, render intent;
- artifact refs produced before failure;
- recommended next action: user fix, admin retry, template rollback, worker
  repair, or no action.

### 8.4 Runtime API

Add tRPC procedures under `marketplaceCapture` or a new focused router.

Recommended procedures:

- `getAutoStoryboardReviewPlan`
  - input: `productId`, optional `runId`
  - output: backend-selected auto plan, access projection, current run/render
    summary, and blockers
- `startAutoStoryboardReview`
  - input: `productId`, optional `runId`, optional advanced override payload
  - output: active/resumed run, auto plan, timeline projection, and render
    status when preview was queued
- `createHyperframesPreview`
  - input: `runId`, optional advanced override fields, or explicit render fields
    only when called from advanced/manual fallback
  - output: render job projection and preview link
- `getHyperframesRenderJob`
  - input: `renderJobId`
  - output: redacted job status, diagnostics, output links
- `listHyperframesTemplates`
  - input: optional `compositionMode`, `platformProfile`
  - output: active templates
- `cancelHyperframesRenderJob`
  - best effort cancellation
- `saveHyperframesRenderToLibrary`
  - allowed only after final QA passes or user has accepted warnings

Required input/output contract:

```ts
export type CreateHyperframesPreviewInput = {
  runId: string;
  compositionMode?: HyperframesCompositionInput["compositionMode"];
  renderIntent?: "preview" | "draft" | "final" | "variant";
  templateId?: string | null;
  platformPresetId?: HyperframesPlatformProfile["presetId"] | null;
  requestedOutputMode?: "preview_html" | "snapshot" | "mp4" | "all";
  idempotencyKey?: string | null;
  advancedOverrideReason?: string | null;
};

export type HyperframesChargeSummary = {
  creditEstimate?: HyperframesCreditEstimate | null;
  quotaDecision?:
    | "allowed"
    | "free_preview_allowed"
    | "needs_authorization"
    | "quota_blocked"
    | "credit_blocked"
    | null;
  noChargeReason?:
    | "free_preview"
    | "duplicate_free_preview"
    | "duplicate_library_finalize"
    | "preview_only"
    | "already_charged"
    | "policy_exempt"
    | "not_billable"
    | null;
};

export type CreateHyperframesPreviewOutput = {
  access: HyperframesFeatureAccessProjection;
  autoPlan: HyperframesAutoStoryboardReviewPlan;
  render: HyperframesRenderStatusProjection;
  charge: HyperframesChargeSummary;
  timelinePatch: {
    runId: string;
    stageKey: "storyboard_review" | "render" | "library_finalize";
    outputLinks: HyperframesRenderStatusProjection["outputLinks"];
  };
  polling: HyperframesPollingGuidance;
};

export type GetAutoStoryboardReviewPlanInput = {
  productId: string;
  runId?: string | null;
};

export type GetAutoStoryboardReviewPlanOutput = {
  access: HyperframesFeatureAccessProjection;
  autoPlan: HyperframesAutoStoryboardReviewPlan;
  activeRunId?: string | null;
  render?: HyperframesRenderStatusProjection | null;
};

export type StartAutoStoryboardReviewInput = {
  productId: string;
  runId?: string | null;
  launchMode?: "auto_storyboard_review";
  advancedOverrides?: Partial<{
    outputMode: "storyboard_images" | "full_video";
    frameStrategy: "auto" | "storyboard_3x3_split" | "video_shot_start_stop";
    audioStrategy:
      | "auto"
      | "native_video_audio"
      | "separate_tts_voiceover"
      | "silent";
    renderEngine: "existing_ffmpeg_timeline" | "hyperframes_composition";
    compositionMode: HyperframesCompositionInput["compositionMode"];
    templateId: string;
    platformPresetId: HyperframesPlatformProfile["presetId"];
    textOverlayPolicy: "none" | "evidence_backed" | "captions_and_disclosures";
  }> | null;
};

export type StartAutoStoryboardReviewOutput = {
  access: HyperframesFeatureAccessProjection;
  autoPlan: HyperframesAutoStoryboardReviewPlan;
  runId: string;
  resumedExistingRun: boolean;
  render?: HyperframesRenderStatusProjection | null;
  charge: HyperframesChargeSummary;
  timelinePatch?: CreateHyperframesPreviewOutput["timelinePatch"] | null;
  polling?: CreateHyperframesPreviewOutput["polling"] | null;
};

export type GetHyperframesRenderJobInput = {
  renderJobId?: string;
  runId?: string;
  includeAccess?: boolean;
};

export type GetHyperframesRenderJobOutput = {
  access?: HyperframesFeatureAccessProjection;
  render: HyperframesRenderStatusProjection;
  cache: {
    etag: string;
    staleAfterMs: number;
  };
};

export type SaveHyperframesRenderToLibraryInput = {
  renderJobId: string;
  idempotencyKey: string;
  acceptedWarningRefs?: string[];
};

export type SaveHyperframesRenderToLibraryOutput = {
  libraryItemId: number;
  created: boolean;
  render: HyperframesRenderStatusProjection;
  charge: HyperframesChargeSummary;
  outputLinks: HyperframesRenderStatusProjection["outputLinks"];
};
```

Required API behavior:

- `getAutoStoryboardReviewPlan` must be safe to call on Product Detail page load
  and must return enough summary data to render the normal auto path without
  opening advanced selectors;
- `startAutoStoryboardReview` must start or resume the active run, resolve all
  default decisions server-side, and queue eligible HyperFrames preview work
  automatically after storyboard readiness;
- `startAutoStoryboardReview` must not replace the existing Standard Order start
  procedure. Standard Order must still accept explicit `storyboard_images` and
  `full_video` choices and should not auto-queue HyperFrames preview unless the
  user selected a HyperFrames-capable standard option or tenant policy explicitly
  treats that standard option as HyperFrames-compatible;
- advanced overrides must be optional, audited, included in deterministic hashes
  where they affect output, and resettable to the backend auto plan;
- `createHyperframesPreview` must return an existing render when the same
  idempotency key or deterministic input hash already has an active/completed job;
- `getHyperframesRenderJob` must allow lookup by render job ID or current run ID,
  but never return another tenant/user's render;
- `saveHyperframesRenderToLibrary` must use the Library idempotency key and must
  return `created: false` for duplicates;
- start, preview, and Library finalize outputs must include `charge` with either
  `creditEstimate`, `quotaDecision`, or `noChargeReason`; UI must not infer
  billing state from render status alone;
- `cancelHyperframesRenderJob` must be idempotent and return the latest sanitized
  projection even when the job was already completed/cancelled;
- all procedures must return backend-derived `HyperframesFeatureAccessProjection`
  when UI gating can change after refresh;
- Product Detail should poll active HyperFrames renders at 5-15 seconds, back off
  to 30 seconds for long queue waits, and stop polling on terminal statuses;
- successful start/save/cancel must invalidate or refetch
  `listAutoReviewRuns`, `getProduct`, `getHyperframesRenderJob`, Library search,
  and Media Panel queries that depend on product/run/source metadata.

Required error mapping:

| Condition | tRPC code | User status | Notes |
| --- | --- | --- | --- |
| feature flag or tenant allowlist disabled | `FORBIDDEN` | `not_available` | return safe reason through access projection where possible |
| user lacks product/run/render permission | `FORBIDDEN` | `blocked_needs_user` | never reveal whether another tenant's job exists |
| run or render job not found | `NOT_FOUND` | `not_available` | safe generic message |
| active incompatible render exists | `CONFLICT` | existing projection status | return existing render projection and next action |
| worker unavailable | `SERVICE_UNAVAILABLE` | `queued` or `blocked_needs_user` | queue only if policy allows degraded worker state |
| credit authorization required | `PAYMENT_REQUIRED` or project equivalent | `blocked_needs_user` | preserve estimate refs |
| quota exceeded | `BAD_REQUEST` | `blocked_needs_user` | include quota-safe message |
| stale input hash | `CONFLICT` | `stale_input_hash` | require new render request |
| compliance blocker | `BAD_REQUEST` | `compliance_blocked` | include sanitized blocker refs |
| template disabled/security-blocked | `BAD_REQUEST` | `template_disabled` | never allow normal user override |
| final QA not passed | `BAD_REQUEST` | `inspecting` or `failed` | Library save must remain disabled |

Avoid exposing raw composition HTML, raw signed URLs, raw worker logs, private storage keys, or raw prompt/product evidence to normal clients.

### 8.5 Admin And Operator APIs

Operator actions must be explicit, permission-gated, audited, and tenant-scoped.
They are not normal user actions and must not bypass product truth, compliance,
or Library finalize gates.

Recommended protected admin procedures:

- `inspectHyperframesRenderDiagnostics`
  - input: `renderJobId` or `runId` plus optional `artifactKind`;
  - permission: system admin or tenant admin with media operations permission;
  - output: sanitized status, failure class, attempts, worker/runtime versions,
    artifact refs, hashes, queue timing, and recommended next action;
  - must redact signed URLs, raw composition HTML, raw evidence, and raw logs.
- `replayHyperframesDeadLetter`
  - input: `renderJobId`/outbox job ID, replay reason, optional new
    operator replay token;
  - permission: system admin or explicitly delegated tenant operator;
  - behavior: creates a new idempotency key only when replay token or input hash
    changes; refuses replay if template is security-disabled, input hash is
    stale, tenant flag is disabled, or compliance is blocked.
- `disableHyperframesTemplate`
  - input: template ID/version, disable reason, severity
    (`security`, `quality`, `ops`, `deprecated`), tenant scope;
  - behavior: blocks new renders immediately; queued jobs continue only when
    operator-approved and disable reason is non-security.
- `enableHyperframesTemplateCandidate`
  - input: template ID/version, tenant scope, fixture gate evidence refs;
  - behavior: promotes only templates with passing contract/lint/snapshot/XSS
    gates.
- `cancelHyperframesRenderJobAdmin`
  - input: render/outbox job ID and reason;
  - behavior: cancels queued/running jobs best-effort, releases locks, records
    audit, and prevents Library finalize.
- `purgeHyperframesPreviewArtifacts`
  - input: tenant ID, run ID/product ID optional, artifact kinds, dry-run flag;
  - behavior: reports affected artifacts in dry run, then purges only
    preview/review artifacts that are not Library-owned or active retry inputs.
- `restoreHyperframesArtifactMetadata`
  - input: artifact ID and sanitized metadata patch;
  - behavior: repairs metadata refs only; never restores raw deleted files.

Operator audit requirements:

- every procedure records actor ID, tenant ID, reason, target refs, old/new
  state summary, and sanitized result;
- security-template disables and replay actions must be visible in admin audit
  views;
- operator APIs must have tests for cross-tenant denial, stale input denial,
  security-disabled template denial, dry-run purge accuracy, and audit emission.

---

## 9. Template System

### 9.1 Template Principles

Templates must be:

- deterministic
- snapshot-testable
- accessible enough for text readability
- safe-area aware
- platform-profile aware
- driven by typed JSON props
- independent from arbitrary marketplace DOM
- compatible with offline asset staging
- small enough to render reliably in headless Chrome

### 9.2 Initial Templates

#### `marketplace_storyboard_motion_9x9_v1`

Purpose:

- animate 7-9 storyboard frames with product truth captions
- create fast preview before full video generation

Scenes:

1. product title/hero frame
2. problem or user pain point
3. product appears as solution
4. proof/detail
5. usage/result
6. warning/expectation guard
7. CTA

If 9 shots exist, preserve 9-shot order. If 7 shots exist, use a 7-scene layout without fake filler.

#### `marketplace_product_card_explainer_9_16_v1`

Purpose:

- create deterministic product promo from product images and evidence-backed copy

Scenes:

1. hook/product title
2. product gallery motion
3. key evidence-backed benefits
4. spec/price/rating card with volatility labels
5. detail/usage
6. disclosure/warning/expectation guard
7. CTA

#### `marketplace_captioned_final_composite_9_16_v1`

Purpose:

- compose generated video clips with captions, overlays, intro/outro, disclosures, and audio

Rules:

- use generated clips as video layers
- use transcript as caption source
- render only approved captions/disclosures
- keep product overlays inside safe area
- include synthetic/affiliate/material-connection disclosure when required

#### `marketplace_social_variant_square_v1`

Purpose:

- square variant for feed posts or library reuse

Rules:

- reframe product/clip content to square
- do not crop product identity-critical regions
- use larger captions and fewer text badges

### 9.3 Template Governance

Every active template must define:

- template key
- semantic version
- supported composition modes
- supported platform profiles
- required props schema
- asset count limits
- text length limits
- supported fonts
- safe area behavior
- expected duration range
- snapshot test fixture
- QA checklist

Template changes must bump the template version if output can materially change.

### 9.4 Template Approval And Rollback

V1 production must use built-in templates only. Tenant custom templates are
deferred until the platform has a formal approval and sandbox gate.

Built-in template lifecycle:

- `draft`
  - editable by maintainers only;
  - can render fixture previews locally/staging;
  - cannot be selected by normal users.
- `candidate`
  - passes contract tests, lint, inspect, fixture snapshots, XSS tests, and
    safe-area tests;
  - can be enabled for internal tenants.
- `active`
  - available through template registry for allowlisted tenants;
  - immutable content for that semantic version;
  - may be disabled but not edited in place.
- `disabled`
  - unavailable for new renders;
  - existing Library items remain valid;
  - retries may continue only when an already queued render is explicitly
    operator-approved and the template was disabled for non-security reasons.
- `archived`
  - retained for provenance only.

Tenant custom template promotion, when later allowed, must require:

- tenant admin submission;
- static analysis and schema validation;
- no external scripts, remote fonts, arbitrary fetches, iframe embeds, or
  unapproved asset hosts;
- sandbox preview on fixture data;
- security review for any custom CSS/animation behavior that can affect layout
  or browser execution;
- golden snapshot baseline;
- explicit approval scope: tenant, composition modes, platform profiles,
  render intents, and expiry date;
- emergency disable and rollback controls.

Template rollback:

- disabling a template must not delete historical artifacts or Library metadata;
- render jobs queued with a now-disabled template must block unless an operator
  marks the template-disable reason as non-security and replay-safe;
- changing default template selection must not affect idempotent rerender of an
  existing composition hash unless the user intentionally creates a new render;
- final Library metadata must always include template ID, version, source, and
  content hash so rendered outputs remain explainable after rollback.

---

## 10. Security Requirements

### 10.1 Untrusted Input

Marketplace data, DOM text, product descriptions, LLM outputs, user edits, product image URLs, and affiliate URLs are untrusted.

Rules:

- Never render captured HTML as trusted HTML.
- Never concatenate raw user text into HTML without escaping.
- Never allow user-supplied JavaScript.
- Never allow arbitrary iframe/embed tags.
- Never allow `javascript:`, `data:` except approved image data in worker-local staged assets, `file:`, or private network URLs.
- Render text through structured props and escaping helpers only.
- Treat all output manifests as internal until redacted.

### 10.2 Asset Fetching And SSRF

HyperFrames compositions must use staged assets, not direct arbitrary remote URLs, in production.

Asset staging requirements:

- Accept only approved product images, generated frames, generated clips, user-uploaded assets, and Library assets that the tenant/user can access.
- Remote marketplace images must pass the same SSRF-safe validation as Marketplace Capture image mirroring.
- Reject private, loopback, link-local, metadata service, multicast, and malformed IP/host targets.
- Validate redirects.
- Limit response size and duration.
- Validate MIME and magic bytes.
- Verify decoded dimensions and reject decompression bombs.
- Store original source URL separately from staged render URL.

### 10.3 Worker Isolation

Render workers must:

- run in a dedicated container/job, not in the main web request thread
- use tenant-scoped temporary directories
- clean temporary files after completion/failure
- deny network access after asset staging when possible
- avoid mounting broad application filesystem paths
- write only under controlled work/output directories
- cap CPU, memory, duration, frame count, and output size
- redact logs before returning them to web users
- support graceful cancellation where possible

### 10.4 Browser And HTML Safety

Composition preview in the web app must:

- use a sandboxed iframe or trusted player boundary
- apply strict CSP
- avoid same-origin script execution from user-generated composition HTML
- use signed, short-lived URLs for preview assets
- prevent composition HTML from reading cookies/localStorage
- prevent composition HTML from calling SmartSpecPro APIs

Production render must:

- render from generated/staged files in worker temp storage
- avoid browser access to user session cookies
- avoid network fetches to app-private APIs unless signed asset URLs are explicitly staged and scoped

### 10.5 Tenant Isolation

Every render job, template access, asset read, output link, Library save, and cancellation must enforce:

- user ownership or shared-product access
- tenant access
- feature flag access
- storage path tenant scoping
- no cross-tenant job lookup
- no cross-tenant template leakage

### 10.5.1 Shared Product, Group, And Credit-Payer Access

Marketplace products and media assets may be shared through tenant/group/library
permissions. HyperFrames must preserve those access rules and must not silently
charge or publish under the wrong actor.

Access rules:

- the render runner must have permission to read the product, run, selected media
  refs, storyboard review, and any Library assets used in the composition;
- creating a preview/final render requires explicit write/generation permission
  for the product or current workspace, not read-only access;
- the credit payer must be resolved before queueing paid work and stored in the
  credit ledger as `payerType`, `payerUserId`, `payerGroupId`, and policy ref;
- group-owned/shared-product renders must not charge the product owner or group
  owner unless the current credit policy explicitly says so;
- Library visibility must be resolved at save time:
  - private user Library when the runner owns the output;
  - group/shared Library only when group policy permits publishing there;
  - never public/global by default;
- a different user opening a shared run/render can see only outputs and actions
  allowed by product/run/render/Library permissions;
- cancel, replay, delete, purge, and save-to-Library must re-check permissions at
  action time, not only at render creation;
- output links must degrade to a disabled/hidden state when the user can see the
  run but not the downstream Library item or Video Editor project.

Required tests:

- product owner and runner are different users;
- shared group member can view but cannot save when write permission is missing;
- group credit payer is selected only by explicit policy;
- duplicate Library save by a second authorized user returns the same item only
  when visibility and idempotency policy allow it;
- cross-tenant render ID lookup returns a generic denial.

### 10.6 Compliance And Claims

Rendered text must follow product truth and policy gates:

- price/rating/sold counts must show volatility or be omitted when stale
- discounts must not be invented
- certification/registration claims must require evidence
- before/after claims must require approved evidence and policy pass
- health/beauty/regulated claims must be blocked or require human review according to existing policy
- affiliate/material connection disclosures must appear when required
- synthetic media disclosure must appear when required
- CTA URL and landing integrity must pass before final output

---

## 11. Credit, Cost, And Quotas

HyperFrames render is not provider generation, but it still consumes compute, storage, and possibly transcription/audio processing.

Add a separate cost class:

- `composition_preview`
- `composition_render`
- `composition_variant_export`
- `composition_snapshot_qa`

### 11.1 Cost Estimate Formula

Add a typed estimate so Product Detail, Storyboard Review, and Library finalize can
show the same numbers and backend billing can reconcile them.

```ts
export type HyperframesCreditEstimate = {
  schemaVersion: 1;
  estimateRef: string;
  tenantId: string;
  userId: number;
  runId: string;
  renderIntent: "preview" | "draft" | "final" | "variant";
  compositionMode: HyperframesCompositionInput["compositionMode"];
  costClass:
    | "composition_preview"
    | "composition_render"
    | "composition_variant_export"
    | "composition_snapshot_qa";
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  estimatedFrameCount: number;
  estimatedRenderPixels: number;
  profileMultiplier: number;
  costClassMultiplier: number;
  workerComplexityMultiplier: number;
  estimatedStorageBytes: number;
  estimatedCredits: number;
  freePreviewApplied: boolean;
  quotaDecision:
    | "allowed"
    | "free_preview_allowed"
    | "needs_authorization"
    | "quota_blocked"
    | "credit_blocked";
  idempotencyKey: string;
};
```

Formula:

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

Multiplier requirements:

- `profileMultiplier` accounts for 720p/1080p/landscape/square profiles;
- `costClassMultiplier` is lower for preview/snapshot QA and higher for final or
  platform variant package renders;
- `workerComplexityMultiplier` accounts for video clip layers, subtitle burn-in,
  audio mixing, and snapshot count;
- final implementation may tune constants, but tests must prove estimates are
  deterministic for the same input.

### 11.2 Credit Ledger Contract

Use separate credit refs for estimate, reservation, charge, and refund. Do not
reuse provider image/video generation credit categories.

Required refs:

- `compositionEstimateRef`
- `compositionReservationRef`
- `compositionChargeRef`
- `compositionRefundRef`

Required idempotency key for credit operations:

```text
hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}
```

Ledger metadata must include:

- cost class, render intent, composition mode, template ID/version, platform
  preset ID/version, and runtime profile hash;
- estimate formula inputs and multiplier values;
- `compositionInputHash`, `compositionHtmlHash`, and `outputHash` when available;
- linked outbox job ID or promoted render job ID;
- linked Library idempotency key when final save occurs;
- refund reason and failure class when credit is released.

Free preview policy:

- allow at most one active free preview per
  `{tenantId}:{productId}:{runId}:{templateId}:{platformPresetId}:{compositionInputHash}`
  unless tenant policy explicitly raises the limit;
- a preview becomes "used" when a render job reaches `rendering` or output exists,
  not when a user merely opens the selector;
- duplicate free-preview requests with the same composition hash return the
  existing active/completed preview instead of consuming a new allowance;
- final renders and variant packages must not be mislabeled as free previews.

Credit requirements:

- Estimate render cost before queueing final renders.
- Free or low-cost preview can be allowed by tenant policy.
- Reserve credits for final MP4 renders if platform billing requires it.
- Refund/release credits on worker failure before meaningful output.
- Do not double-charge when saving the same idempotent render to Library.
- Label costs as render/composition costs, not provider image/video costs.

Quota requirements:

- max render duration seconds
- max fps
- max resolution
- max frame count
- max staged asset bytes
- max product images
- max video clips
- max concurrent jobs per user/tenant
- max retries per job
- max stored preview artifacts per product/run

Recommended MVP limits:

- preview: 15 seconds, 24 fps, 720x1280
- draft: 30 seconds, 24 fps, 1080x1920
- final: 60 seconds, 30 fps, 1080x1920
- product images: 8
- video clips: 9
- max staged asset bytes: 750 MB

---

## 12. QA And Verification

### 12.1 Pre-Render QA

Before queueing a render:

- validate composition input schema
- validate template schema compatibility
- validate product truth hash
- validate all text items have allowed evidence/source
- validate all required disclosures
- validate all asset URLs can be staged
- validate media dimensions/durations
- validate expected duration and frame count
- validate worker capability and feature flag
- validate credit/quota estimate

### 12.2 Template QA

For every template:

- run HyperFrames lint
- run inspect for text overflow and clipped containers when available
- capture key snapshots
- compare against golden snapshots for fixture products
- test reduced motion fallback where relevant
- test long Thai product names
- test missing price/rating/shop fields
- test stale price/rating labels
- test no product images fallback
- test regulated/high-risk claim blocking
- test 9:16, 1:1, and 16:9 safe areas

### 12.3 Render QA

After render:

- output file exists
- MP4 is playable in browser
- duration matches expected tolerance
- resolution and fps match profile
- audio presence matches strategy
- no black/blank frames at required sample points
- captions are readable and not clipped
- CTA/disclosure text is present when required
- thumbnail is not blank/misleading
- manifest includes checksums
- storage upload completed
- Library save metadata is complete

### 12.4 Visual Regression

Add deterministic snapshot tests:

- frame 0
- first product reveal
- first claim/badge scene
- CTA/disclosure scene
- final frame

For dynamic templates, compare stable layout regions and allow configurable tolerance for media content regions.

### 12.5 Fixture Matrix

Fixture coverage must prove that templates work across marketplace product shapes,
copy length, policy risk, media quality, and platform profiles before rollout.

Required fixture groups:

| Group | Cases | Required proof |
| --- | --- | --- |
| Product categories | household, electrical appliance, cosmetics/skincare, food/beverage, fashion, electronics, mother/baby, automotive, pet supplies | product truth fields map correctly and unsupported claims are blocked |
| Regulated/high-risk claims | health/beauty whitening, supplement-like wording, medical/safety claims, price/discount volatility, affiliate/material connection | disclosures render when required and blocked claims are omitted |
| Thai text stress | long Thai product title, mixed Thai/English, emoji/symbol input, long subtitle cue, narrow safe-area caption | no overflow, clipping, unreadable contrast, or negative layout shift |
| Media aspect/quality | square product image, very tall image, transparent PNG, multi-view product sheet, missing thumbnail, low-resolution frame, video clip with odd aspect ratio | product identity is preserved and fallback states are clear |
| Subtitle/audio | silent output, native video audio, TTS alignment, ASR transcript, subtitle-heavy final composite, drift beyond tolerance | subtitle/audio QA accepts or blocks correctly |
| Platform profiles | TikTok/Reels/Shorts 9:16, square feed 1:1, landscape 16:9, mobile preview viewport, desktop preview viewport | safe area, thumbnail, disclosure, and CTA placement pass |
| Failure/recovery | worker unavailable, FFmpeg missing, Chrome missing, template disabled, stale input hash, dead-letter retry exhausted | UI status projection and next action match the status matrix |
| Permissions | product owner, runner, group-shared viewer, group-shared editor, cross-tenant attempted lookup | access projection, credit payer, and output links are correct |

Fixture outputs must include:

- input envelope JSON;
- generated composition HTML hash, not raw HTML in long-lived logs;
- snapshots at required key frames;
- expected status projection;
- expected Library metadata when final save is allowed;
- expected blocked reason when final save is not allowed.

---

## 13. Observability

Add metrics:

- `hyperframes_render_jobs_total`
- `hyperframes_render_duration_ms`
- `hyperframes_render_frame_count`
- `hyperframes_render_failed_total`
- `hyperframes_render_cancelled_total`
- `hyperframes_asset_staging_duration_ms`
- `hyperframes_asset_staging_bytes`
- `hyperframes_template_lint_failures_total`
- `hyperframes_template_inspect_warnings_total`
- `hyperframes_library_saves_total`
- `hyperframes_worker_capacity_active`
- `hyperframes_worker_queue_depth`

Add correlation fields to every metric label set, log, audit event, and sanitized
diagnostic envelope where cardinality is safe:

- `traceId`
- `correlationId`
- `tenantId`
- `runId`
- `renderJobId`
- `outboxJobId`
- `artifactRef`
- `libraryItemId`
- `compositionInputHash`
- `templateId`
- `templateVersion`
- `platformPresetId`
- `creditEstimateRef`
- `creditReservationRef`

Trace rules:

- `correlationId` is created when the user requests a HyperFrames preview/final
  render and is copied through outbox job, worker, artifact rows, credit refs,
  timeline projection, Library metadata, and operator audit events;
- `traceId` may rotate per request/job attempt, but must link back to the stable
  `correlationId`;
- high-cardinality fields should be logged/audited, but only low-cardinality
  fields should become metric labels;
- normal user UI may show short technical refs, never full logs or private URLs.

Add sanitized audit events:

- render job queued
- asset staging completed/failed
- lint/inspect completed/failed
- render completed/failed/cancelled
- output saved to Library
- render deleted/purged
- template activated/disabled

Timeline detail should show:

- queued
- staging assets
- linting
- rendering
- inspecting
- ready for review
- saved to Library
- failed with sanitized reason

Do not expose:

- raw composition HTML with private URLs
- raw signed URLs
- full worker logs
- private storage keys
- unredacted product evidence
- internal policy reasoning

---

## 14. Implementation Plan

### Phase 0: Research, Feature Flags, And Environment Check

Tasks:

- Add feature flags:
  - `MARKETPLACE_HYPERFRAMES_ENABLED`
  - `MARKETPLACE_HYPERFRAMES_TENANT_ALLOWLIST`
  - `MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED`
  - `MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE`
- Add environment diagnostic script or service method:
  - Node version
  - HyperFrames package/CLI availability
  - FFmpeg/FFprobe availability
  - Chrome/headless-shell availability
  - font availability
  - Docker/worker mode availability
- Add dependency/supply-chain audit before adding HyperFrames packages:
  - license compatibility
  - package version pinning
  - lockfile reproducibility
  - transitive native/postinstall review
  - Chrome/FFmpeg/font version capture
- Decide the first official render execution path:
  - HyperFrames CLI in local/dev and compatibility-first workers
  - `@hyperframes/producer` or producer server in production worker when
    programmatic control is required
  - no production-equivalent custom renderer
- Document install and runtime requirements.

Acceptance:

- Disabled flag preserves all current Feature 118 behavior.
- Diagnostics report missing dependencies without crashing the app.

### Phase 1: Contracts And Template Registry

Tasks:

- Create `apps/web/shared/hyperframes/contracts.ts`.
- Add Zod schemas for composition input, product truth view, shot view, media refs, copy plan, brand profile, subtitle plan, audio sync plan, compliance plan, provenance, render job projection, and retry/dead-letter envelope.
- Add Zod schemas for runtime API inputs/outputs, feature access projection,
  auto storyboard review plan projection, status copy matrix, and Library
  finalize request.
- Add template registry service with built-in templates.
- Add platform profile preset registry for generic vertical and
  TikTok/Reels/Shorts 9:16 MVP.
- Add fixture product inputs for tests.
- Add schema tests for allowed/blocked inputs.

Acceptance:

- Invalid text/source/evidence combinations are rejected.
- Missing tenant/user/run/product identity is rejected.
- Missing compliance/provenance refs are rejected for final renders.
- Unsupported platform profile preset is rejected.
- Subtitle cue overlap, out-of-duration cues, and unsafe subtitle source are rejected.
- Audio sync plan blocks unexpected silence and duration drift according to render intent.
- Long Thai product names and captions are accepted but marked for layout checks.

### Phase 2: Composition Builder

Tasks:

- Add `hyperframesCompositionService.ts`.
- Build composition input from Marketplace Auto Review run state.
- Add product truth extraction view from existing product bundle.
- Add copy policy that filters unsupported claims and stale price/rating fields.
- Add asset resolver that selects product images, storyboard frames, and video clips.
- Add HTML generation from template and sanitized props.
- Add subtitle/audio sync integration for captioned composites.
- Add composition hash, manifest, and provenance envelope generation.
- Add prompt/customization intake for text overlays, captions, CTA, style,
  timing, transitions, music, SFX, aspect ratio, and output quality, and compile
  those choices into HyperFrames composition files instead of custom render
  instructions.
- Produce a worker-ready composition directory contract containing `index.html`,
  staged assets, manifest, runtime profile, template hashes, and redacted prompt
  metadata.

Acceptance:

- Composition builder never reads arbitrary marketplace HTML as executable HTML.
- All rendered text is escaped.
- Composition hash changes when product truth, template version, copy plan, subtitle plan, audio sync plan, compliance plan, or platform profile changes.
- Composition builder can produce preview HTML for fixture products.
- Prompt/custom overlay changes affect the composition hash and are visible in
  lint/inspect/snapshot evidence before render.

### Phase 3: Asset Staging

Tasks:

- Add `hyperframesAssetStagingService.ts`.
- Stage product images, generated frames, generated clips, audio, and fonts.
- Use existing storage/url safety controls.
- Produce worker-local asset manifest.
- Add size/duration/dimension guards.
- Add cleanup hooks for failed/expired preview jobs.
- Store staged render artifacts through `marketplace_auto_review_artifacts`
  for MVP, with HyperFrames-specific `artifactKind` values.

Acceptance:

- SSRF and malformed URL tests pass.
- Cross-tenant asset access is impossible.
- Missing assets produce user-visible blockers, not broken renders.

### Phase 4: Render Worker MVP

Tasks:

- Create HyperFrames render worker entrypoint.
- Support official HyperFrames `doctor`, `lint`, `snapshot`, `inspect`, and
  `render` commands or equivalent producer APIs.
- Use HyperFrames CLI as the compatibility-first worker path.
- Use `@hyperframes/producer` or producer server for programmatic production
  render when the worker image and rollout gate pass.
- Keep any Playwright/FFmpeg smoke renderer explicit, disabled for production
  feature completion, and limited to diagnostics/break-glass fallback.
- Consume `marketplace_auto_review_outbox_jobs` for MVP with HyperFrames
  job types and idempotency keys.
- Upload MP4, snapshots, manifest, and logs.
- Update render job status and diagnostics.
- Add cancellation best-effort handling.
- Add retry classification, stale-lock recovery, dead-letter, and operator
  replay hooks.
- Record HyperFrames CLI/package version, worker image digest, Node, Chrome,
  FFmpeg/FFprobe, font profile, template hash, composition hash, and runtime
  capability for every render.

Acceptance:

- Fixture composition renders to MP4.
- Worker records version diagnostics.
- User-facing completed render requires official HyperFrames runtime evidence.
- Failed render stores sanitized reason.
- Exhausted transient failure becomes dead-lettered and replayable by an
  authorized operator.
- Permanent input/policy/template failure does not auto-retry.
- Main web process never blocks on full render.

### Phase 5: Marketplace Auto Review Integration

Tasks:

- Add render engine fields to start/render request handling without breaking existing input.
- Add `getAutoStoryboardReviewPlan` and `startAutoStoryboardReview` so Product
  Detail can start/resume from a backend-selected plan without requiring manual
  selectors.
- Add `createHyperframesPreview` and `getHyperframesRenderJob` procedures.
- Add `listHyperframesTemplates`, `cancelHyperframesRenderJob`, and
  `saveHyperframesRenderToLibrary` with explicit error mapping, polling
  guidance, idempotency behavior, and query invalidation requirements.
- Add `HyperframesFeatureAccessProjection` endpoint behavior so UI controls can
  be hidden, disabled, or enabled from one backend-derived projection.
- Attach HyperFrames output links to timeline projections.
- Add Product Detail auto plan summary and status panel:
  - one primary Auto Storyboard Review CTA
  - visible Standard Order / Custom mode that preserves existing explicit
    selector workflow
  - start/resume behavior for active run dedupe
  - backend-selected output/render/template/platform/text decisions
  - reset-to-auto action when overrides are active
  - collapsed advanced override controls for render engine, composition mode,
    template, platform preset, preview/final intent, frame strategy, audio
    strategy, and text policy where allowed
  - worker readiness and feature-flag state
  - credit estimate and free-preview quota state
  - sanitized render status projection
- Add centralized Thai/English status copy for every
  `HyperframesRenderUserStatus`.
- Add Storyboard Review auto preview status, default output display, retry-only
  manual render action, and snapshot comparison panel.
- Add MediaStudio resume/session handling for HyperFrames render-to-library when
  the render is tied to the active production run.
- Add Media Panel/Library/History metadata filters so final HyperFrames renders
  are discoverable by product/run/source type.
- Attach HyperFrames artifact refs to
  `MarketplaceAutoReviewStageCompletionEvidence` where the stage claims render
  completion.
- Ensure active-run dedupe and idempotency are preserved.
- Ensure UI states are covered for hidden, empty, loading, blocked, running,
  retrying, dead-lettered, stale-input-hash, completed, saved-to-library, and
  cancelled cases.

Acceptance:

- Existing `storyboard_images` and `full_video` still work unchanged when HyperFrames flag is off.
- Existing `storyboard_images` and `full_video` Standard Order flows still work
  unchanged when HyperFrames flag is on and Auto Storyboard Review is available.
- User can create or resume Storyboard Review Auto from one primary CTA, and the
  backend selects the default plan without mandatory customization.
- Eligible HyperFrames motion preview is queued automatically after a completed
  storyboard-capable run reaches review readiness.
- Timeline shows HyperFrames render status and output link.
- Product Detail, Storyboard Review, MediaStudio, Video Editor handoff, Media
  Panel, Library, and Media History all either expose the new output safely or
  intentionally hide it with a documented disabled/unsupported state.

### Phase 6: Library Finalize And Video Editor Handoff

Tasks:

- Save completed HyperFrames MP4 to Library with required metadata.
- Allow sending HyperFrames MP4 to Video Editor as normal media.
- Add thumbnail, subtitle sidecar, transcript, and manifest handling.
- Add final QA before Library save.
- Add idempotent save behavior.
- Use Library idempotency key
  `hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}`.
- Return existing Library item for duplicate save without charging again.
- Include render, subtitle, transcript, manifest, template, platform preset,
  credit, QA, and provenance refs in Library metadata.

Acceptance:

- Render can be saved to Library once without duplicates.
- Library metadata includes product/run/template/render provenance.
- Library metadata includes subtitle/audio/disclosure state for final renders.
- Video Editor can open the rendered MP4.

### Phase 7: Product Explainer And Final Composite Templates

Tasks:

- Implement product card explainer template.
- Implement captioned final composite template.
- Support generated clip layers and captions.
- Add disclosure and CTA scene rules.
- Add platform variants.
- Add template approval state, disable behavior, rollback behavior, and
  snapshot fixture baselines.

Acceptance:

- Product card explainer can render without provider video clips.
- Captioned final composite can render with generated clips and approved audio.
- Text overlays follow evidence/disclosure policy.
- Disabled or schema-mismatched templates cannot be selected for new renders.

### Phase 8: Production Hardening

Tasks:

- Add durable render job tables only if migration promotion criteria are met.
- Add worker queue depth monitoring and alerts.
- Add concurrency/rate limiting.
- Add retention/purge jobs.
- Add admin/operator APIs for diagnostics, replay, template disable/enable,
  cancel, dry-run purge, and artifact metadata repair.
- Add golden snapshot CI gate for built-in templates.
- Add tenant allowlist rollout.
- Add operator runbook.
- Add migration dry-run/backfill/cutover plan if HyperFrames-specific tables
  are introduced.

Acceptance:

- Production flag can be enabled per tenant.
- Render worker failures do not affect core Marketplace Capture.
- Operators can diagnose stuck/failed jobs with sanitized logs.

---

## 15. Testing Requirements

### Unit Tests

- contract validation accepts valid envelopes
- contract validation rejects missing tenant/run/product identity
- product truth view blocks unsupported claims
- stale price/rating fields render with volatility labels or are omitted
- copy plan rejects unsupported text
- compliance plan rejects missing required disclosure for final renders
- provenance envelope requires product/run/template/input hashes
- subtitle plan rejects unsafe sources, invalid timing, overlapping cues, and
  overlong burn-in lines
- audio sync plan rejects blocked silence/drift conditions
- HTML escaping prevents injection
- asset staging rejects private/internal URLs
- template registry selects correct version
- template registry rejects disabled/unapproved templates
- platform profile registry applies TikTok/Reels/Shorts safe area, subtitle,
  disclosure, duration, and thumbnail policy
- composition hash is deterministic
- deterministic hash input builder changes when template content, platform preset
  version, product truth, anchors, subtitle/audio plan, compliance plan, staged
  asset manifest, or runtime profile changes
- credit estimate formula produces deterministic `HyperframesCreditEstimate`
- credit idempotency key stays stable for identical render intent/input/template
  version/platform preset and changes when any billed input changes
- outbox-to-UI status mapper returns the expected sanitized status projection for
  queued, staging, linting, rendering, inspecting, completed, saved-to-library,
  blocked, stale, dead-lettered, failed, and cancelled states
- feature access projection returns hidden/disabled/enabled capability states for
  flag-off, tenant-not-allowlisted, worker-unavailable, template-unavailable,
  credit/quota-blocked, Library-save-disabled, and permission-denied cases
- auto storyboard review plan resolves output mode, frame strategy, audio
  strategy, render engine, composition mode, template, platform preset, text
  policy, selected assets, and primary next action without client-side selectors
- launch mode contract distinguishes `auto_storyboard_review` from
  `standard_order` and prevents auto defaults from rewriting explicit Standard
  Order choices
- Thai/English status copy matrix has a label, safe message, and next action for
  every `HyperframesRenderUserStatus`
- runtime API Zod schemas reject missing identity, invalid render intent, unsafe
  template/platform selection, mismatched idempotency key, and unsupported output
  mode

### Integration Tests

- create HyperFrames preview from fixture Marketplace Auto Review run
- render job idempotency returns existing job for same hash/template/intent
- render job cannot be read by another tenant/user
- render job status attaches to timeline projection
- HyperFrames work is enqueued through the MVP outbox contract or the approved
  promoted render-job table, not both for the same job
- HyperFrames artifacts are persisted with content hashes and surfaced through
  stage completion evidence
- failed render produces sanitized timeline detail
- completed render saves to Library with full metadata
- duplicate Library save does not create duplicate item
- duplicate Library save returns existing item for
  `hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}`
- Library save refuses stale input hash, mismatched template version, mismatched
  platform preset, different output hash, or lower QA status
- subtitle sidecars and transcript refs are saved to Library metadata when
  produced
- stale input hash blocks retry/resume and requires a new render request
- operator dry-run purge reports only purge-eligible artifacts
- operator replay refuses stale input hashes and security-disabled templates
- shared product/group access resolves runner, owner, payer, Library visibility,
  and output-link permissions correctly
- runtime API error mapping returns the expected tRPC code and sanitized
  projection for feature-disabled, permission-denied, worker-unavailable,
  credit-required, quota-blocked, stale-input-hash, compliance-blocked,
  template-disabled, and final-QA-not-passed cases
- `startAutoStoryboardReview` starts or resumes the active run from an auto plan,
  preserves active-run dedupe, and records advanced overrides only when provided
- completed storyboard readiness auto-queues eligible HyperFrames preview work
  or returns a safe blocked/pending projection when auto queueing is unavailable
- Standard Order can still start `storyboard_images` and `full_video` while
  HyperFrames/Auto mode is enabled, and does not auto-queue HyperFrames preview
  unless selected by an explicit standard option or tenant policy

### Worker Tests

- doctor/diagnostic detects missing FFmpeg/Chrome
- fixture composition renders MP4
- snapshot captures key frames
- inspect detects overflowing long text
- output manifest includes checksums
- temporary workspace cleanup runs after success/failure
- cancellation is best effort and leaves consistent job state
- transient worker/storage/dependency failures retry with bounded backoff
- permanent input/policy/template failures do not auto-retry
- exhausted retry jobs become dead-lettered with sanitized diagnostics
- stale locked jobs can be recovered only when input hash and template version
  still match
- replaying the same idempotency key does not duplicate artifacts or Library
  items

### UI Tests

- HyperFrames controls hidden when feature flag is off
- controls disabled with helpful blocker when run lacks required assets
- product detail can start a motion preview
- timeline renders queued/running/completed/failed HyperFrames states
- timeline renders dead-lettered, template-disabled, stale-input-hash, and
  operator-replay-available states with sanitized next actions
- output links appear only when user has access
- Library save action appears only after final QA
- Product Detail preserves existing `storyboard_images` and `full_video` actions,
  frame strategy, image model, shot count, audio strategy, overlay text, anchor
  readiness, active-run dedupe, status summary, and history toggle when
  HyperFrames is disabled
- Product Detail preserves the same Standard Order controls and successful start
  behavior when HyperFrames is enabled and Auto Storyboard Review is visible
- switching between Auto Storyboard Review and Standard Order does not discard
  unsaved Standard choices without confirmation and clearly labels which mode
  created/resumed the active run
- Product Detail first viewport is auto-first when HyperFrames is enabled: one
  Auto Storyboard Review CTA, auto plan summary, start/resume state, credit/time
  estimate, worker readiness, and blockers are visible without requiring selector
  interaction
- render engine, composition mode, template, platform preset, preview/final
  intent, frame strategy, image model, quality, shot count, audio strategy, and
  text policy selectors are hidden in a collapsed advanced override area by
  default
- Product Detail shows `Use auto plan` / reset-to-auto when advanced overrides
  are active or create blockers
- Product Detail timeline renders `HyperframesRenderStatusProjection` through the
  existing Marketplace Auto Review timeline UI without raw HTML, signed URLs,
  worker logs, or private storage keys
- Product Detail Media Panel shows completed HyperFrames video Library items under
  product-filtered video results and does not show preview-only expired artifacts
- Storyboard Review shows HyperFrames preview/render actions only for reviews with
  Marketplace Auto Review provenance
- Storyboard Review opens as review/result-first: the auto storyboard, auto
  preview status/output, and recommended snapshot comparison are visible without
  requiring template/platform/render-engine selection
- Storyboard Review exposes manual `Render Motion Preview` only as retry/fallback
  when auto queueing is skipped, blocked, cancelled, or failed
- Storyboard Review can compare storyboard frames with HyperFrames snapshot frames
  and handles missing snapshots with an empty/disabled state
- MediaStudio resumes a pending HyperFrames render-to-library session for the
  active production run and builds fallback metadata after reload
- Video Shot and Storyboard Review compound render flows still save through their
  existing paths when HyperFrames is unavailable
- Video Editor opens a completed HyperFrames MP4 as a normal video asset/project
  reference
- Media History and Library search can discover final HyperFrames renders by
  product/run/source metadata
- mobile Product Detail and Storyboard Review layouts have no horizontal overflow
  and preserve keyboard/focus behavior for the primary auto CTA, reset-to-auto
  action, collapsed advanced selectors, preview dialogs, render progress dialogs,
  and output links
- UI uses centralized Thai/English status copy and does not hardcode divergent
  labels for the same render status across Product Detail, Storyboard Review, and
  MediaStudio
- feature access projection drives hidden/disabled/enabled controls; UI does not
  reimplement tenant/worker/template/credit gating inconsistently per page

### Security Tests

- XSS payload in product title renders as text
- HTML in product description never executes
- `javascript:` and `file:` URLs are rejected
- private IP and metadata-service URLs are rejected
- cross-tenant template/render job reads fail
- arbitrary user HTML templates are not accepted in production
- sandboxed preview cannot access app cookies/localStorage
- raw signed URLs are redacted from API responses
- custom template approval gates reject remote scripts, arbitrary fetches,
  iframes, unapproved fonts, and unapproved asset hosts
- disabled templates block new renders and preserve historical Library
  provenance
- dependency audit rejects incompatible licenses, unpinned HyperFrames versions,
  unexpected native/postinstall behavior, and missing runtime version capture
- shared product/group cases deny save/cancel/replay/delete/purge when the actor
  has view-only access
- credit payer cannot be silently switched from runner to owner/group owner
  without an explicit credit policy ref

---

## 16. Release Gates

Implementation must add or document concrete commands for these gates before
production rollout. Command names may change during implementation, but each gate
must have an executable equivalent.

### 16.1 Contract And Service Gates

Expected command group:

```bash
npm --prefix apps/web run test -- \
  apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts \
  apps/web/shared/hyperframes/__tests__/contracts.test.ts \
  apps/web/shared/hyperframes/__tests__/autoPlan.test.ts \
  apps/web/shared/hyperframes/__tests__/featureAccess.test.ts \
  apps/web/shared/hyperframes/__tests__/statusCopy.test.ts \
  apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts \
  apps/web/server/services/__tests__/hyperframesCompositionService.test.ts \
  apps/web/server/services/__tests__/hyperframesAssetStagingService.test.ts \
  apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts \
  apps/web/server/services/__tests__/hyperframesAutoPlanService.test.ts \
  apps/web/server/services/__tests__/hyperframesFeatureAccessService.test.ts \
  apps/web/server/services/__tests__/hyperframesRenderService.test.ts
```

Must prove:

- schema contracts accept/reject correctly;
- runtime API inputs/outputs reject invalid identity, stale hashes, unsafe
  template/platform choices, mismatched idempotency keys, and unsupported output
  modes;
- runtime API error mapping returns sanitized tRPC errors and status projections
  for feature flag, permission, worker readiness, credit/quota, compliance,
  template, stale hash, and final QA blockers;
- polling intervals, terminal-state stop conditions, and query invalidation
  requirements are encoded in client/server contracts or tests;
- auto storyboard review plan resolves defaults server-side and records advanced
  overrides without making the UI compute render/template/platform decisions;
- launch mode behavior keeps Auto Storyboard Review and Standard Order
  independent, including idempotency keys, credit refs, and output metadata;
- feature access projection produces one backend-derived hidden/disabled/enabled
  result for every Product Detail, Storyboard Review, MediaStudio, Library save,
  and operator action state;
- Thai/English status copy covers every `HyperframesRenderUserStatus` without
  page-specific label drift;
- composition hashes are deterministic;
- product truth, compliance, subtitles, audio sync, and provenance are enforced;
- SSRF/XSS/tenant checks pass.

### 16.2 Dependency And Supply Chain Gate

Expected command group:

```bash
npm --prefix apps/web run hyperframes:dependency-audit
npm --prefix apps/web run hyperframes:doctor
```

Must prove before adding or enabling HyperFrames dependencies:

- every added `@hyperframes/*` package version is pinned in `package-lock.json`;
- dependency license is compatible with SmartSpecPro distribution and worker
  deployment model;
- package provenance/integrity is available through the package manager lockfile
  and install is reproducible in CI;
- no unexpected transitive dependency adds native binaries or postinstall
  network fetches without explicit approval;
- Node, Chrome/headless-shell, FFmpeg, FFprobe, fonts, and HyperFrames package
  versions are recorded in diagnostics;
- worker image build uses pinned browser/FFmpeg/font packages or records exact
  resolved versions;
- security review approves any dependency that can execute browser, filesystem,
  or process-level render operations.
- floating `latest` is never used by production render jobs; it is allowed only
  in read-only update detection that produces an update report or PR;
- update reports include upstream version, changelog/release links, dependency
  changes, runtime image impact, and required compatibility evidence.

### 16.2.1 HyperFrames Version Maintenance Gate

Every upstream HyperFrames update must pass a controlled maintenance pipeline
before it can become the default runtime:

1. Detect GitHub/npm update and compare it with the pinned runtime registry.
2. Open a dependency/update PR or internal review artifact.
3. Run dependency audit, doctor, and official runtime fixture render.
4. Render the compatibility suite with both current and candidate runtimes.
5. Compare golden snapshots, MP4 playability, duration, audio, Thai text,
   captions, CTA/disclosure overlays, safe areas, manifests, and diagnostics.
6. Run seeded Product Detail, Storyboard Review, MediaStudio, Media History, and
   Library handoff evidence.
7. Promote only to canary until error rate, render duration, and output QA are
   accepted.
8. Promote to default only after rollback to the previous pinned runtime is
   verified.

The compatibility suite must include at least product intro overlays, long Thai
captions, TikTok/Reels 9:16 safe areas, CTA/disclosure text, evidence-bound
price/rating/spec copy, multi-scene transitions, generated-clip composites,
music/SFX, source audio preservation, and text overflow inspection.

### 16.3 Worker Fixture Render Gate

Expected command group:

```bash
npm --prefix apps/web run hyperframes:doctor
npm --prefix apps/web run hyperframes:fixture-render
```

Must prove:

- Node, HyperFrames, Chrome/headless-shell, FFmpeg, FFprobe, and fonts are
  available;
- fixture composition renders to MP4;
- snapshots and manifest are produced;
- output is playable and duration/resolution/fps match the profile;
- temporary workspace cleanup succeeds.

### 16.4 Visual Snapshot Gate

Expected command group:

```bash
npm --prefix apps/web run hyperframes:snapshot-test
```

Must prove:

- built-in templates match approved golden snapshots for stable layout regions;
- long Thai text, missing price, stale rating, missing image fallback, CTA scene,
  and disclosure scene do not overflow or clip;
- 9:16 safe-area checks pass.

### 16.5 Security Gate

Expected command group:

```bash
npm --prefix apps/web run test -- \
  apps/web/server/routers/__tests__/marketplaceCapture.hyperframesAccess.test.ts \
  apps/web/server/services/__tests__/hyperframesSecurity.test.ts \
  apps/web/client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx
```

Must prove:

- product/title/description XSS payloads render as text only;
- private/internal/metadata-service URLs are rejected;
- sandboxed preview cannot access app cookies/localStorage;
- raw signed URLs and raw logs are redacted;
- cross-tenant render job/template reads fail;
- shared product/group view-only access cannot save, cancel, replay, delete, or
  purge HyperFrames jobs/artifacts;
- credit payer is resolved through an explicit policy ref and cannot silently
  switch between runner, owner, or group owner.

### 16.6 Timeline And Library Gate

Expected command group:

```bash
npm --prefix apps/web run test -- \
  apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts \
  apps/web/server/services/__tests__/hyperframesLibraryFinalizeService.test.ts \
  apps/web/shared/__tests__/marketplaceAutoReviewContracts.test.ts
```

Must prove:

- HyperFrames output links appear on the correct timeline stage;
- render artifacts are linked to stage completion evidence;
- failed/dead-letter states show sanitized status detail;
- final Library save is idempotent and includes product/run/template/render,
  subtitle/audio, disclosure, QA, and checksum metadata;
- Media History and Library search resolve finalized HyperFrames renders through
  source label, product ID, run ID, output hash, and Library visibility metadata.

### 16.7 UI Surface Gate

Expected command group:

```bash
npm --prefix apps/web run test -- \
  apps/web/client/src/i18n/__tests__/marketplaceHyperframesStatusCopy.test.ts \
  apps/web/client/src/components/marketplaceCapture/__tests__/MarketplaceAutoReviewLaunchModeSwitch.test.tsx \
  apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.hyperframes.test.tsx \
  apps/web/client/src/pages/__tests__/MediaStudio.hyperframesRenderSession.test.tsx \
  apps/web/client/src/pages/__tests__/StoryboardReviewPage.hyperframes.test.tsx
npm --prefix apps/web run test:e2e -- \
  apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts
```

Browser-visible UI verification is mandatory for launch. Use the repo's existing
Playwright/visual-smoke pattern or add the focused e2e file above. Cover desktop
and mobile at minimum:

- desktop: 1280x800 or 1440x900
- mobile: 390x844 or 360x800
- light mode; dark/reduced-motion if the touched surfaces already have those
  gates available

The browser gate must capture screenshots or structured evidence for Product
Detail, Storyboard Review, and MediaStudio. Do not rely only on component tests
for this feature because the workflow spans routes, panels, dialogs, and output
links.

Must prove:

- flag-off behavior preserves existing Marketplace Auto Review controls and
  output links;
- Product Detail first viewport is auto-first: one primary Auto Storyboard Review
  CTA, auto plan summary, start/resume behavior, credit/readiness/status, and
  blockers are visible without requiring render engine/template/platform
  selection;
- Product Detail Standard Order remains visible/discoverable and can still start
  `storyboard_images` and `full_video` while Auto Storyboard Review is enabled;
- render engine/template/platform/custom policy controls are collapsed as
  advanced overrides and never mandatory for the happy path;
- Product Detail, Storyboard Review, and MediaStudio all consume
  `HyperframesFeatureAccessProjection` and
  `HyperframesAutoStoryboardReviewPlan` instead of duplicating access/default
  decisions;
- Product Detail, Storyboard Review, MediaStudio, Library cards, and Media
  History use the centralized Thai/English status copy and source labels;
- Product Detail timeline consumes the sanitized HyperFrames projection and shows
  queued, staging, rendering, inspecting, completed, saved-to-library,
  stale-input-hash, dead-lettered, template-disabled, cancelled, and failed states;
- Product Detail Media Panel and Library filters can find final HyperFrames video
  items by product/run/source metadata;
- Storyboard Review preview and snapshot comparison actions appear only with valid
  Marketplace Auto Review provenance;
- Storyboard Review displays the auto-generated storyboard, auto preview
  status/output, and recommended comparison first; manual render is retry/fallback
  only;
- MediaStudio resumes pending HyperFrames render-to-library sessions and avoids
  duplicate Library saves;
- Video Editor handoff receives HyperFrames MP4 as normal video media;
- normal user UI never renders raw HTML, signed URLs, storage keys, or full worker
  logs;
- mobile layouts avoid horizontal overflow and keyboard/focus behavior is covered
  for selectors, preview dialogs, render progress dialogs, and output links.

### 16.8 Retention And Operator Gate

Expected command group:

```bash
npm --prefix apps/web run test -- \
  apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts \
  apps/web/server/services/__tests__/hyperframesOperatorService.test.ts
```

Must prove:

- preview/review/library/audit artifact retention policies are applied by
  artifact kind;
- dry-run purge reports exactly what would be deleted;
- purge skips Library-owned, active, locked, or retry-grace artifacts;
- dead-letter replay requires authorization and refuses stale input hashes or
  security-disabled templates;
- disable-template and cancel-job procedures write sanitized audit events.

### 16.9 Rollout Gate

Before enabling for any production tenant:

- all feature flags default off;
- tenant allowlist is configured;
- worker queue depth and failure metrics are visible;
- alert routing exists for worker unavailable, dead-letter growth, render error
  rate, artifact cleanup failure, and storage quota pressure;
- rollback procedure has been tested in staging;
- operator runbook exists and includes replay, disable-template, cancel-job, and
  purge-preview-artifact steps.

---

## 17. Rollout Plan

1. Land contracts, services, and tests with all flags off.
2. Pass dependency/supply-chain gate before adding HyperFrames packages to the
   worker build.
3. Enable local/dev CLI render for maintainers.
4. Enable fixture-only render worker in staging.
5. Enable Product Detail motion preview for one internal tenant.
6. Enable Library save for internal tenant after final QA passes.
7. Enable product card explainer template.
8. Enable captioned final composite after generated clip QA and subtitle QA are reliable.
9. Expand tenant allowlist.
10. Decide whether to add explicit `composition_render` stage after usage metrics.

Rollback:

- Disable `MARKETPLACE_HYPERFRAMES_ENABLED`.
- Existing Marketplace Auto Review paths continue using Feature 118 behavior.
- Retain completed Library items; stop new render jobs.
- Cancel queued/running HyperFrames jobs where possible.
- Purge temporary preview artifacts according to retention policy.
- Disable affected templates and block operator replay when rollback is caused
  by template security or dependency supply-chain risk.

---

## 18. Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Headless Chrome/FFmpeg worker is heavy | slow renders, infra cost | separate worker, quotas, preview profiles, queue limits |
| Text overlays create unsupported claims | compliance risk | copy plan requires evidence refs and policy gates |
| Arbitrary HTML execution | XSS/security risk | built-in templates only, escaped props, sandboxed preview |
| Remote asset SSRF | infrastructure risk | asset staging with existing URL safety controls |
| Long Thai text overflows | bad output | template limits, inspect, golden snapshots |
| Duplicate renders | cost/storage waste | composition hash idempotency |
| Drift from Feature 117 pipeline | architecture confusion | keep HyperFrames as render adapter, not planner/runtime |
| Product price/rating becomes stale | misleading video | volatility labels, expiration checks, omit stale fields |
| Worker logs leak signed URLs | privacy risk | redacted diagnostics only |
| Render output saved without QA | bad Library asset | final QA gate before Library save |
| Worker retry creates duplicate outputs | cost/storage/audit risk | idempotency key, content hash dedupe, bounded retry, dead-letter |
| Custom template bypasses sandbox | security risk | built-in-only V1, approval gate, static analysis, emergency disable |
| Subtitle/audio drift | bad final video | subtitle/audio sync contracts, timing QA, render-duration checks |
| Dependency supply-chain issue | security/reproducibility risk | dependency audit, license review, version pinning, lockfile reproducibility |
| Artifact retention too loose | storage/privacy risk | per-artifact retention class, dry-run purge, Library-owned artifact protection |
| Operator action bypasses policy | data/product risk | admin API contracts, permission gates, audit events, stale-input checks |
| Platform preset mismatch | bad publish-ready output | versioned platform profiles, safe-area/subtitle/disclosure/thumbnail presets |
| UI duplicates backend access logic | inconsistent or unsafe controls | one `HyperframesFeatureAccessProjection`, component tests, e2e gate |
| Status copy diverges by page/language | confusing UX and support burden | centralized Thai/English status copy matrix and locale parity tests |
| Shared product credit payer is ambiguous | wrong billing or Library visibility | explicit credit policy refs and shared/group permission tests |
| Auto Review becomes a manual configuration form | poor UX, lower completion rate, product mismatch | backend auto plan, one primary CTA, collapsed advanced overrides, e2e first-viewport assertions |
| Advanced override accidentally changes paid output | unexpected cost/output drift | override diff, reset-to-auto action, audit metadata, idempotency hash coverage |
| Auto mode replaces Standard Order | existing users cannot use established workflow | dual launch mode contract, Standard Order regression tests, visible mode switch, no shared mutable defaults |

---

## 19. Acceptance Criteria

MVP is complete when:

- HyperFrames feature flag can be disabled without changing existing Marketplace Auto Review behavior.
- A completed or storyboard-capable Marketplace Auto Review run can create a deterministic HyperFrames motion preview.
- The preview uses only approved product truth, selected product images, storyboard frames/clips, and evidence-backed copy.
- Generated composition HTML escapes all user/product text and executes only trusted template/runtime code.
- Render worker creates MP4 and snapshot artifacts from fixture and real product inputs.
- Timeline displays HyperFrames render status and output links with redacted diagnostics.
- Product Detail UI supports HyperFrames controls, worker readiness, credit
  estimate, blocker states, status projection, output links, Library save status,
  and Media Panel discovery without regressing existing Auto Review controls.
- Storyboard Review Auto is genuinely auto-first: the normal Product Detail path
  starts/resumes from one CTA, renders a backend-derived auto plan summary, and
  does not require the user to choose render engine, template, platform, frame
  strategy, audio strategy, or text policy.
- Standard Order remains genuinely usable in parallel: users can still select
  `storyboard_images` or `full_video` and the existing frame/image/audio/shot
  controls while Auto Storyboard Review and HyperFrames are enabled.
- Advanced customization exists only as an optional collapsed override path, with
  reset-to-auto, override diff, audit metadata, and hash/idempotency coverage.
- Runtime APIs have exact schemas, sanitized error mapping, idempotency behavior,
  polling guidance, and cache invalidation coverage.
- Runtime APIs include auto plan/start procedures that select defaults
  server-side and automatically queue eligible motion preview work after
  storyboard readiness.
- Backend `HyperframesFeatureAccessProjection` drives all hidden/disabled/enabled
  UI states and operator action availability.
- Thai/English status copy and source labels are centralized and covered by
  parity tests.
- Storyboard Review supports HyperFrames preview/render actions, snapshot
  comparison, and safe Library/Video Editor handoff for Marketplace Auto Review
  provenance.
- Storyboard Review opens as review/result-first, with auto preview
  status/output and recommended snapshot comparison visible before any manual
  override controls.
- MediaStudio can resume pending HyperFrames render-to-library sessions and
  preserve fallback traceability metadata after reload.
- Video Editor, Media History, and Library surfaces treat finalized HyperFrames
  MP4 outputs as normal user-owned video assets with provenance metadata.
- Shared product, group-shared product, credit payer, and Library visibility
  cases are tested for owner, runner, group member, view-only user, and
  cross-tenant denial.
- Final render can be saved to Library with complete provenance and without duplicate saves.
- Tests cover contracts, XSS, SSRF, tenant isolation, template selection, render idempotency, subtitle/audio sync, retry/dead-letter, timeline projection, and Library finalize.
- Mandatory browser e2e evidence covers Product Detail, Storyboard Review, and
  MediaStudio on desktop and mobile.
- MVP render jobs use the existing Marketplace Auto Review outbox/artifact tables, or a documented migration decision has promoted dedicated HyperFrames tables.
- Disabled/unapproved templates cannot be selected for new renders.
- Dependency/supply-chain gate passes before HyperFrames packages are added or
  enabled in worker images.
- Preview/review/library/audit artifact retention policies are implemented and
  dry-run purge is tested.
- Admin/operator APIs are permission-gated, audited, and reject stale or
  security-disabled replay.
- Platform profile presets drive safe area, duration, subtitle, disclosure, and
  thumbnail rules for launch profiles.
- Documentation explains local/dev HyperFrames dependency setup and production worker requirements.

V1 production-ready is complete when:

- worker isolation, quotas, cleanup, observability, and alerts are in place
- official HyperFrames CLI or producer/server runtime is enabled in the
  dedicated worker with pinned versions and compatibility evidence
- final QA blocks missing disclosures, unsupported claims, clipped captions, blank frames, and unplayable output
- tenant allowlist rollout is available
- operators have a runbook for failed/stuck render jobs
- template golden snapshots are part of CI or a release gate
- HyperFrames upstream update detection, canary, promotion, and rollback
  maintenance gates are documented and tested
- release gates for contracts, worker fixture render, visual snapshots,
  security, timeline/library, UI surfaces, retention/operator,
  dependency/supply-chain, and rollout have executable commands and passing
  evidence
- any dedicated HyperFrames migration includes dry-run, rollback, backfill,
  dual-read, cutover, and cleanup proof

---

## 20. Decision Log And Open Questions

The original open questions below are resolved for MVP implementation planning.
Treat these as first-release defaults unless product/engineering updates this
section and the matching section plans before implementation changes behavior.

Resolved MVP decisions:

- Use one primary `Create Auto Storyboard Review` action on Product Detail.
  HyperFrames motion preview should be selected/queued by the backend auto plan
  when eligible; render engine/template/platform controls stay collapsed under
  advanced overrides.
- Use official HyperFrames runtimes only for production renders: CLI for
  compatibility-first worker execution and `@hyperframes/producer` or producer
  server for programmatic production control.
- Custom Playwright/FFmpeg renderer code is diagnostic/break-glass only and
  must not unlock user-facing full render features.
- Require Storyboard Review or final QA approval before Library save.
- Built-in templates only in V1.
- Preview artifacts expire after 7 days unless saved to Library.
- Use quota first, then add credit billing after render cost metrics are known.
- Keep composition source internal in V1.
- Launch with 9:16 only, then add 1:1 after e2e and snapshot evidence.
- Require user review before auto-queueing preview for regulated/high-risk claim
  categories unless compliance plan explicitly marks the run safe.
- Reuse the existing Marketplace Auto Review outbox/artifact tables for MVP.
- Launch with burn-in subtitles for preview/final composite, and add sidecar
  subtitles after Library metadata and download UX are confirmed.

Open beyond MVP:

1. Which tenants should receive 1:1 and 16:9 platform presets after 9:16 evidence
   is accepted?
2. When should quota-first accounting graduate into paid credit charging, and
   what multipliers should be configured from real render metrics?
3. What sandbox and approval process is required before tenant custom templates
   can be offered safely?
4. Which product categories should be added to the high-risk review list after
   support/compliance review of the initial rollout?
5. Should sidecar subtitles become user-downloadable after Library metadata and
   download UX are proven?
6. When should the official runtime default move from CLI worker to producer
   server for all tenants, after canary metrics and maintenance gates are stable?

---

## 21. File Inventory

Likely new files:

- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- `apps/web/shared/hyperframes/autoPlan.ts`
- `apps/web/shared/hyperframes/featureAccess.ts`
- `apps/web/shared/hyperframes/statusCopy.ts`
- `apps/web/shared/hyperframes/templates.ts`
- `apps/web/server/services/hyperframesCompositionService.ts`
- `apps/web/server/services/hyperframesTemplateRegistry.ts`
- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/hyperframesAutoPlanService.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`
- `apps/web/server/services/hyperframesLibraryFinalizeService.ts`
- `apps/web/server/services/hyperframesAssetStagingService.ts`
- `apps/web/server/services/hyperframesCompositionSanitizer.ts`
- `apps/web/server/services/hyperframesQaService.ts`
- `apps/web/server/services/hyperframesOperatorService.ts`
- `apps/web/server/services/hyperframesRetentionService.ts`
- `apps/web/server/services/hyperframesDependencyAudit.ts`
- `apps/web/server/services/__tests__/hyperframesCompositionService.test.ts`
- `apps/web/server/services/__tests__/hyperframesAssetStagingService.test.ts`
- `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- `apps/web/server/services/__tests__/hyperframesAutoPlanService.test.ts`
- `apps/web/server/services/__tests__/hyperframesFeatureAccessService.test.ts`
- `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`
- `apps/web/server/services/__tests__/hyperframesLibraryFinalizeService.test.ts`
- `apps/web/server/services/__tests__/hyperframesSecurity.test.ts`
- `apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts`
- `apps/web/server/services/__tests__/hyperframesOperatorService.test.ts`
- `apps/web/server/services/__tests__/hyperframesRetentionService.test.ts`
- `apps/web/server/services/__tests__/hyperframesDependencyAudit.test.ts`
- `apps/web/shared/hyperframes/__tests__/contracts.test.ts`
- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`
- `apps/web/shared/hyperframes/__tests__/autoPlan.test.ts`
- `apps/web/shared/hyperframes/__tests__/featureAccess.test.ts`
- `apps/web/shared/hyperframes/__tests__/statusCopy.test.ts`
- `apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts`
- `apps/web/server/routers/__tests__/marketplaceCapture.hyperframesAccess.test.ts`
- `apps/web/client/src/components/marketplaceCapture/HyperframesRenderPanel.tsx`
- `apps/web/client/src/components/marketplaceCapture/MarketplaceAutoReviewLaunchModeSwitch.tsx`
- `apps/web/client/src/components/marketplaceCapture/AutoStoryboardReviewPlanSummary.tsx`
- `apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesRenderEngineSelector.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesTemplateSelector.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesPlatformPresetSelector.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesCreditEstimate.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesStatusTimelineItem.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesOutputLinks.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesSnapshotCompareDialog.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesOperatorDiagnosticsPanel.tsx`
- `apps/web/client/src/components/marketplaceCapture/__tests__/HyperframesRenderPanel.test.tsx`
- `apps/web/client/src/components/marketplaceCapture/__tests__/MarketplaceAutoReviewLaunchModeSwitch.test.tsx`
- `apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.hyperframes.test.tsx`
- `apps/web/client/src/pages/__tests__/MediaStudio.hyperframesRenderSession.test.tsx`
- `apps/web/client/src/pages/__tests__/StoryboardReviewPage.hyperframes.test.tsx`
- `apps/web/client/src/i18n/__tests__/marketplaceHyperframesStatusCopy.test.ts`
- `apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts`
- `apps/web/server/workers/hyperframesRenderWorker.ts`
- `apps/web/scripts/hyperframes-doctor.ts`
- `apps/web/scripts/hyperframes-dependency-audit.ts`
- `apps/web/scripts/hyperframes-fixture-render.ts`
- `apps/web/scripts/hyperframes-snapshot-test.ts`
- `docs/marketplace-hyperframes-render.md`

Likely modified files:

- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
- `apps/web/shared/marketplaceAutoReview/contracts.ts`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/locales/en/marketplace.json`
- `apps/web/client/src/locales/th/marketplace.json`
- `apps/web/client/src/i18n/namespaces.ts` only if marketplace namespace loading
  needs new explicit keys or lazy-load wiring
- `apps/web/client/src/pages/MediaHistory.tsx` if existing filters/search cards
  need explicit HyperFrames source labels
- existing Library search/detail/card components if they need explicit
  `marketplace_auto_review_hyperframes_render` source labels or provenance
  display
- `apps/web/client/src/App.tsx` only if a protected deep link or query-param
  route compatibility change is required; do not add a new top-level
  `/marketplace` route for MVP
- `apps/web/drizzle/schema.ts`
- new migration only if durable HyperFrames tables are implemented after the
  promotion criteria are met
- `apps/web/package.json` only if HyperFrames package dependencies are added
- worker/container Dockerfiles only if production worker is added

Dependency policy:

- Do not add HyperFrames dependencies until Phase 0 confirms the selected execution path.
- Do not add HyperFrames dependencies until the dependency/supply-chain gate
  passes for license, provenance, pinned versions, lockfile reproducibility,
  runtime compatibility, and transitive native/postinstall behavior.
- Prefer a dedicated worker package/container dependency over adding heavy browser/render dependencies to the main web runtime.
- If adding npm dependencies, use the repo package manager and pin versions sufficiently for deterministic render behavior.

---

## 22. Definition Of Done For Implementation Planning

Before implementation begins, create section plans or tickets for:

1. Contracts and template registry
2. Composition builder and sanitizer
3. Asset staging and SSRF safety
4. Render worker and environment diagnostics
5. Backend auto storyboard review plan, auto decision rules, override diff,
   reset-to-auto, and auto preview queueing after storyboard readiness
6. Dual launch mode behavior for Auto Storyboard Review and Standard Order,
   including visible mode switching, preserved standard controls, independent
   idempotency/credit/output metadata, and regression tests
7. Runtime API schemas, router procedures, sanitized error mapping, polling
   policy, cache invalidation, and idempotency behavior
8. Marketplace Auto Review API integration and timeline projection wiring
9. Product Detail UI integration, including one primary auto CTA, start/resume,
   auto plan summary, readiness, credit estimate, timeline projection, output
   links, Media Panel discovery, Standard Order mode, collapsed Auto-mode
   advanced overrides, and mobile/accessibility states
10. Storyboard Review UI integration, including review/result-first layout,
   auto preview status/output, retry-only manual render action,
   snapshot comparison, render progress, and fallback metadata handoff
11. MediaStudio, Video Editor, Media History, and Library UI integration
12. Feature access projection across Product Detail, Storyboard Review,
   MediaStudio, Library save, and operator actions
13. Centralized Thai/English status copy, source labels, and locale parity tests
14. Shared product, group, credit payer, and Library visibility permissions
15. Library save idempotency and Video Editor handoff
16. QA, fixture matrix, visual regression, and security tests
17. Mandatory Playwright/browser UI evidence for Product Detail, Storyboard
   Review, and MediaStudio on desktop/mobile
18. Worker ops, retention, metrics, tracing/correlation, and rollout
19. Release gates and operator runbook
20. Dependency/supply-chain review and platform profile preset rollout

Each section must include tests first, target files, acceptance criteria, rollback
notes, and the exact release gate or fixture evidence that proves the section is
complete.
