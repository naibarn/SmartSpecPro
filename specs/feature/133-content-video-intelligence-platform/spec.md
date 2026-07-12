# Feature 133: Content & Video Intelligence Platform (Remotion Hybrid Composition)

Version: 0.1
Date: 2026-07-12
Status: Proposed
Owner: Media Studio / Render Platform / Marketplace / Vertical Drama / Presentations / Skill Runtime / Worker Fabric / Data
Depends-on: 111-presentation-builder-split-layer-video-editor, 112-storyboard-studio-skill-based-prompt-generation-qa-loop, 119-hyperframes-marketplace-auto-review-render-adapter, 122-video-segment-planner-multi-shot-storyboard-review, 124-smart-ai-hub-worker-app, 127-article-to-storyboard-video-project, 131-vertical-drama-series-storyboard-video-flow, 132-vertical-drama-story-character-quality-engine
Builds-on (shipped, NOT re-specified here): `planning/remotion-migration/plan.md` Phases 1–3, 6, 7 — the Remotion render engine, engine-selection/fallback layer, and the generalized multi-layer template system are already on disk; this spec gives them a product surface
Source brief: user-provided "SmartSpecPro Content & Video Intelligence Platform" comprehensive design document (2026-07-12) — see §25 traceability

> This spec is a **new feature file continuing the existing spec chain in
> `specs/feature/`**. It does NOT modify Features 111/112/119/122/131/132 —
> those remain the systems-of-record for their shipped pipelines. Feature 133
> layers a **platform** on top: it takes the Remotion multi-layer composition
> capability that already exists as backend-only code (remotion-migration
> Phase 7), gives it a Neutral Project Schema, a durable `remotion_render_video`
> worker job type surfaced on the existing `/render-jobs` page, and a set of
> Studios (AI Content, Catalog Video, Review Remix, AI Motion) that **reuse**
> the storyboard-review, presentations, marketplace-catalog, and
> vertical-drama subsystems instead of duplicating them.

---

## 0. Changelog

### [0.1] - 2026-07-12

Initial proposal. Grounded in a 5-way codebase research pass (render-jobs
system, existing Remotion code, vertical-drama render pipeline,
storyboard/presentations/catalog integration surfaces, and the Smart AI Hub
Worker App render contract). Key ground-truth findings that shaped this spec
are recorded in §3; the worker-app findings (§3.5) drove a full rework of §6
into an explicit, mutually-understood server⇄worker contract (single shared
Zod schema, capability-family claim gating, per-jobType event/failure enums,
version gates, golden-fixture round-trip) so a Remotion job can never be
claimed-and-mis-rendered by a hyperframes-only worker.

---

## 1. Goal & Product Framing

### 1.1 The core loop

The platform lets a user start from any one of: a topic, an article, a spoken
script, an audio file, images, an existing video, a review video, a product
(or several products) from the Marketplace Capture catalog, a vertical-drama
script, or a knowledge source — and end with rendered video output:

```text
Input
→ Content Intelligence   (article / script / narration)
→ Visual Planning        (storyboard / scene plan)
→ Motion Planning        (motion templates / camera / 3D scenes)
→ Media Composition      (Neutral Project Schema → Remotion timeline)
→ Quality Control        (skill-judged QA loop with auto-repair)
→ Render                 (remotion_render_video worker job)
→ Export                 (library item / download / campaign package)
```

Outputs: article, spoken script, narration audio, storyboard, product video,
review video, short video, explainer, luxury 3D motion video, multi-version
campaign, SRT/VTT subtitles, a reusable timeline project, and the final MP4.

### 1.2 What the user sees

The user-facing workflow must stay simple regardless of internal machinery:

```text
เลือกเนื้อหา → เลือกสไตล์ → ตรวจ Storyboard → สร้างวิดีโอ
```

Three automation modes (§8.6): **Auto** (one input, system does everything),
**Guided** (approve each stage), **Expert** (full timeline/scene/camera
editing).

### 1.3 What Feature 133 is NOT

- Not a rewrite of Vertical Drama (131/132) — its ffmpeg concat pipeline,
  skills, and QA loop stay untouched; 133 only *borrows* its pure builders
  and patterns (§3.3) and later offers an optional export adapter (§8.5).
- Not a replacement for the Marketplace Auto-Review flow (119) — the
  `HyperframesFinalCompositeConfigSchema` contract stays frozen (per the
  remotion-migration plan); Catalog Video Studio composes a *new* flow next
  to it using the same product/insight data (§8.2).
- Not a new render-job infrastructure — it plugs a new `jobType` string into
  the existing `worker_jobs` queue and `/render-jobs` page (§6).
- Not an open code-execution surface — R3F scenes remain a **vetted
  registry**; arbitrary user/LLM-authored Three.js or React code is never
  accepted (§17.2).

---

## 2. Anti-Duplication Contract (reuse-first matrix)

This is the governing table for every implementation decision in this
feature. "Build" is only allowed where the Reuse column is empty.

| Capability | Reuse (exists today) | Net-new in 133 |
|---|---|---|
| Multi-layer video composition | `apps/web/shared/remotion/layerTemplateSchemas.ts` (`RemotionTemplateConfig`, 6 layer types), `apps/web/server/remotion/GenericTemplateComposition.tsx` | Scene-grouped Neutral Project Schema that **compiles down** to `RemotionTemplateConfig` (§5) |
| R3F / Three.js 3D scenes | `apps/web/server/remotion/scenes/` vetted registry + `@remotion/three` (`orbiting-product` scene) | More vetted scenes + template metadata (§7) |
| Render engine + fallback | `videoRenderer.ts` (`resolveVideoRenderEngine`, `executeVideoRender`), `remotionRuntimeAdapter.ts` (bundle → selectComposition → renderMedia, local asset server, Thai font staging, browser resolution) | Nothing — reused as-is |
| Durable render jobs + UI | `worker_jobs` table (free-form `jobType` varchar), worker claim/events/artifacts HTTP API (`server/routes/workerRuntime.ts`), `RenderJobsPage.tsx` (jobType-agnostic), `workerSchedulerService.ts` queue functions, `reserveWorkerJobCredits`, per-jobType Zod input + event contracts in `shared/workerRuntime.ts` | `remotionRenderVideoWorkerInputSchema` (embeds `RemotionTemplateConfigSchema`) + progress/failure enums + capability family in the **same** `shared/workerRuntime.ts`; one queue function + one server-lane dispatch branch (§6.2-6.4) |
| Worker fleet execution | Smart AI Hub Worker App (124) claim/heartbeat/artifact-upload + device-proof signing; `hyperframesRenderWorker.ts` server dispatch loop; runtime-pack sidecar model | Capability-family gating so hyperframes-only workers never claim Remotion jobs (§6.3); Lane-B Rust dispatch + Remotion runtime-pack reusing the bundled Chrome/ffmpeg (§6.5-6.6, deferred Phase 6) |
| Audio mixdown + loudness | `verticalDramaFinalRenderGraph.ts` `buildAudioFilterGraph` (adelay/volume/amix/loudnorm), injectable `FfmpegRunner` in `verticalDramaEpisodeVideoAssembly.ts` | Audio layer type in the template schema for simple cases; ffmpeg post-mix pass reused for loudness-normalized final output (§5.4) |
| Subtitle burn-in / captions | `buildAssSubtitleFile` + 10 caption preset ids (`VD_CAPTION_PRESET_ASS_STYLES`, ported from `hyperframesRenderWorker.ts`); VTT/SRT rendering in `hyperframesTranscriptionService.ts` | Caption layer rendering inside Remotion for preview; ASS burn stays available as ffmpeg post-pass (§5.5) |
| Transcription (media intelligence) | `hyperframesTranscriptionService.ts` (Whisper, word tokens → cues, VTT/SRT), `storyboardReviewTranscriptionJobs.ts` | Clip-index metadata persistence + semantic tagging (§9) |
| Silence / dead-air detection | Video Editor `SilenceDetectionConfig`/`SilenceTimeline.tsx` (`FEATURE_SILENCE_DETECTION.md`) | Server-side reuse for Review Remix auto-cut (§8.3) |
| Storyboard structure + QA | `mediaStudioStoryboardReviews.reviewData` (+ `videoEditorProjectId` handoff), prompt-package repair, spec-112 QA loop | Studio flows write/read these tables; no new storyboard table (§8) |
| Product catalog (source of truth) | `marketplaceProducts` (+Images/PriceSnapshots/AffiliateLinks), `marketplaceCaptureInsights` (incl. `claimResolutionsJson`, `storytellingReadiness`), `marketplaceCapture.*` tRPC | Claim Registry projection + Catalog Video Studio flow (§8.2, §11) |
| Product → video join model | `marketplaceAutoReviewRuns` (`storyboardReviewId`, `videoEditorProjectId`, `renderJobId`, `resultLibraryItemId`) | `video_projects` generalizes this join for non-product studios (§14.1) |
| Template registries | `hyperframesTemplateRegistry.ts` + `shared/hyperframes/templates.ts` (metadata: templateId/category/copy slots/asset slots) | Motion Template Registry for Remotion templates, same metadata style (§7) |
| Content generation | `presentationArticleGenerator`/`aiPresentationService` (topic → article → layout), `marketplaceContentGenerator.ts`, article-to-storyboard (127) | Content Studio orchestration skill; no new article engine (§8.1) |
| TTS / narration | `ttsService.ts` (elevenlabs/openai/omnivoice, cloning, credit calc), `falGeminiTts.ts`, VD dialogue-audio planner | Narration adapter step in Content Studio (§8.1) |
| QA loop engineering | `verticalDramaQualityLoop.ts` DI pattern (runReview/repairStage/persistReview/recompute; bounded rounds, regression detection, keep-best) + `episodeQualityReview` judge skill pattern | Generalized `videoProjectQualityLoop` with the same DI shape + a new judge skill (§12) |
| Skills engine | `apps/web/skills/*` + `skillRegistry.ts` auto-sync | 5 new skill folders (§13) |
| Media library / history | `libraryItems`, `mediaAssets`, `mediaLibraryService.ts` | Render outputs publish through `worker_artifacts.publishedItemId` → `libraryItems`, as today |
| Storage | `storage.ts` (R2/S3/local, presign, proxy URLs), `buildArtifactStorageRef` key layout | Nothing |
| Brand kit | — (confirmed absent; only `brandingSanitizer.ts` text sanitizer exists) | `brand_kits` table + resolution into templates (§10) |
| Video timeline editor (expert mode) | `client/src/types/videoEditor.ts` project/track/clip/keyframe model + `components/videoeditor/*` | Bidirectional mapping Video Editor ⇄ Neutral Project Schema, phase-gated (§8.6) |

---

## 3. Ground Truth: What Already Exists (research findings, 2026-07-12)

Implementers MUST read this section before touching code; it prevents
re-building shipped capability.

### 3.1 Remotion engine (remotion-migration Phases 1–3, 6, 7 — shipped)

- Deps pinned: `remotion`/`@remotion/{bundler,renderer,three,transitions}`
  `^4.0.488`; `@react-three/fiber` `^9.6.1`, `three` `^0.185.1`.
  **`@remotion/player` is NOT installed** — client preview needs it (§8.6).
- Compositions registered in `apps/web/server/remotion/Root.tsx`:
  `MarketplaceAutoReview` (frozen HyperFrames-schema port, default presets
  only, throws `UnsupportedPresetError` otherwise → per-job fallback to
  HyperFrames) and `GenericTemplate` (Phase 7).
- `GenericTemplate` renders 6 layer types from
  `RemotionTemplateConfigSchema` (`.strict()` Zod): `image`, `video`,
  `text`, `svg` (validated by `isSafeInlineSvgMarkup` — rejects `<script`,
  `on*=`, `javascript:`), `motionGraphic` (declarative shape + loop
  animation), `scene3d` (`sceneId: z.enum(REMOTION_SCENE_IDS)` — closed
  registry, currently only `orbiting-product`). Common layer fields:
  start/duration in frames, percent-of-canvas x/y/width/height, rotationDeg,
  opacity, zIndex. Max 40 layers. Scenes are frame-driven
  (`useCurrentFrame()`), never `useFrame()`.
- Render adapter `remotionRuntimeAdapter.ts` branches on payload:
  `payload.remotionTemplate` → GenericTemplate; else HyperFrames-config
  path. Handles asset staging (Remotion only fetches http/https, so a
  per-render local static server on `127.0.0.1` serves staged files), Thai
  font resolution (`fc-match`, `REMOTION_THAI_FONT_PATH`), Chromium
  discovery (Chrome/Playwright/Puppeteer paths).
- Engine selection: env `RENDERER_ENGINE` kill-switch >
  `marketplaceHyperframesRendererForced` (F132K) >
  `marketplaceRemotionRendererEnabled` (F132J) > default **remotion**.
- Known gaps (Phase 7 backlog): no audio layer type, no template
  library/authoring UI, no Lottie ingestion, one R3F scene, no tRPC/product
  surface, worker-app packaging (Phase 4) and HyperFrames decommission
  (Phase 5) not started, parity gate near-green but not green.

### 3.2 Render-jobs system (Feature 124 worker fabric)

- `worker_jobs` (drizzle/schema.ts:14002): **`jobType` is a free-form
  varchar(100)** — a new job type requires **no DB migration**. Status enum:
  `queued|claimed|preparing|running|uploading|publishing|indexing|completed|failed|canceled|expired`.
  Resource profiles incl. `cpu_heavy`, `gpu_required`. `inputJson` /
  `outputJson` jsonb payloads, `idempotencyKey`, lease columns, retry policy.
- Progress = `worker_job_events` rows; outputs = `worker_artifacts`
  (`storageRef`, `publishedItemId` → libraryItems).
- `/render-jobs` page (`RenderJobsPage.tsx`, route in App.tsx:655) is
  **jobType-agnostic**: it lists via `trpc.workerJobs.list` and prints
  `job.jobType` verbatim; per-shot progress driven by event payload fields
  (`shotIndex`, `shotTotal`, `sidecarEventType`). A new job type appears
  automatically.
- Worker lifecycle: `POST /api/workers/:id/jobs/claim` →
  events → `artifacts/init-upload` (presigned PUT, key
  `worker-artifacts/<tenantId>/<jobId>/<sha>-<file>`) →
  `artifacts/complete` → status `completed`.
- Job creation pattern: `workerSchedulerService.ts` queue functions (e.g.
  `queueDesktopHyperframesFinalCompositeJob` :1412) with
  `reserveWorkerJobCredits`, `capabilityRequirementsJson.capabilityFamilies`
  matching against worker `capabilityHints`, and
  `isDesktopWorkerDispatchEnabled()` gating.
- Server-side worker dispatch: `hyperframesRenderWorker.ts`
  (`HYPERFRAMES_WORKER_JOB_TYPES` list + `switch(jobType)` :1463) already
  calls `executeVideoRender` → Remotion by default.

### 3.3 Vertical Drama render pipeline (131/132 — reusable pure builders)

- Final render is a Node in-process ffmpeg pipeline, split into a **pure
  argv/`.ass` builder** (`verticalDramaFinalRenderGraph.ts`:
  `buildFinalRenderFfmpegArgs`, `buildAssSubtitleFile`,
  `buildAudioFilterGraph`, banner/watermark overlay chain — DB-free,
  unit-testable) and a staging/exec orchestrator
  (`verticalDramaEpisodeVideoAssembly.ts`: injectable `FfmpegRunner`,
  `probeDurationSeconds`, `downloadClipToFile`, storage upload).
- VD final render is **fire-and-forget in-process**, not durable — §6 fixes
  this class of problem for 133 by using `worker_jobs` from day one.
- QA loop: `verticalDramaQualityLoop.ts` — DI effects
  (`runReview`/`repairStage`/`persistReview`/`recomputeDensityMetrics`),
  bounded rounds, regression detection, keep-best. This is the pattern §12
  generalizes.
- BullMQ precedent: `vertical_drama_story_jobs` queue for long LLM stage
  jobs (submit → jobId → poll → resume-on-mount). 133's generation stages
  follow the same pattern (§15.3).

### 3.4 Storyboard / Presentations / Catalog integration surfaces

- Storyboard-review: `mediaStudioStoryboardReviews.reviewData` json is the
  canonical shot/prompt payload; `videoEditorProjectId` links to the NLE
  timeline. Procedures live in `videoEditorProjects` router.
- Presentations: `shared/presentation/contracts.ts`
  (`presentationRenderSpecSchema` — png|jpg|pdf|mp4 export),
  `componentRecipes`/`layoutDsl` (slot-binding template system),
  `mediaMotion.ts` (Ken-Burns presets), `presentationExports` job table,
  Python Celery `presentation_render.py`. AI layout + article generation
  procedures (`generateArticle`, `generateDraft`, `generateSlideAudioFromNote`).
- Catalog: `marketplaceProducts` (+Images, price snapshots, affiliate
  links), `marketplaceCaptureInsights.claimResolutionsJson` +
  `storytellingReadiness` (claim evidence lives here today),
  `marketplaceAutoReviewRuns` join chain product → storyboardReviewId →
  videoEditorProjectId → renderJobId → resultLibraryItemId.
- TTS: `ttsService.synthesize` (3 providers + reference-audio cloning,
  5 credits/1000 chars); STT `sttService.ts`.
- **Brand kit does not exist anywhere** — net-new (§10).

### 3.5 Smart AI Hub Worker App (Feature 124) — render contract ground truth

Research on `apps/worker-app` (Rust/Tauri) established the exact constraints
that §6 must satisfy. These are load-bearing:

- **Single-jobType, no dispatch table.** The worker is hardwired to
  `hyperframes_final_composite`
  (`control_plane.rs::HYPERFRAMES_CAPABILITY`, `worker_executor.rs::HYPERFRAMES_JOB_TYPE`).
  `worker_loop.rs::worker_loop_tick` (~:437) calls `execute_hyperframes_job`
  for **every** claimed job; `prepare_hyperframes_execution_plan` rejects any
  other jobType (~:323) → `job.failed / render_failed`. There is **no
  Remotion code in the worker app** (`grep -rin remotion apps/worker-app` is
  empty).
- **Claim is NOT jobType-scoped server-side.** `listClaimableJobs`
  (`workerRegistryService.ts` ~:845) filters by `tenantId`/`runtimeType`
  (`desktop_zeroclaw_managed`)/status/team only.
  `workerJobMatchesSelection` (`workerSchedulerService.ts` ~:236-259) matches
  `capabilityRequirementsJson.capabilityFamilies` ∩ claim `capabilityHints`
  **but returns `true` when the job declares no families** — so a job without
  a capability family can be claimed by any desktop worker. Hence §6.3.
- **Input validation is duplicated, not shared.** The server validates with
  Zod (`shared/workerRuntime.ts`, e.g.
  `hyperframesFinalCompositeWorkerInputSchema.parse` at
  `workerSchedulerService.ts:1419`); the worker **re-parses `input_json`
  ad-hoc in Rust** and does not import the shared schema. Field-name drift is
  unprotected — hence the golden-fixture round-trip mandate (§6.7).
- **Contract-version machinery exists and is reusable.** Protocol
  `WORKER_RUNTIME_PROTOCOL_VERSION = "2026-04-06"` (exact-match rejected by
  `assertRuntimeCompatibility`); payload-level `templateVersion`/
  `platformContractVersion`/`rendererPolicyVersion` + stable hashes;
  runtime-pack `manifest.json.supportedContractVersions`. §6.7 reuses all
  three layers.
- **Event/artifact envelopes are fixed.** Events
  `{ eventType, payloadJson, sequenceNumber, leaseOwnerToken,
  assignmentAttempt }` via `POST /api/worker-jobs/{id}/events`; artifacts via
  3-step `init-upload` (presigned) → PUT → `complete` with
  `{ artifactType, storageRef, checksumSha256, sizeBytes, contentType,
  metadataJson, … }`; MP4 validated by `ftyp` box + min-bytes. Device-proof
  signing headers on every request. §6.4 conforms to these verbatim.
- **Runtime pack model.** `runtime-pack/manifest.json` bundles Node,
  ffmpeg/ffprobe, Chrome-for-Testing + libs, Thai fonts, and a
  jobType-specific sidecar (`hyperframes-sidecar/render.mjs`), delivered via
  `GET /api/workers/runtime-pack/{manifest,download/:file}` (allowlisted).
  §6.6 adds a Remotion sidecar reusing the shared binaries.

Consequence: the current spec's **server-side in-process worker (Lane A) is
the correct Phase-1 default**, and the worker-app fleet (Lane B) is a genuine
new execution path — but BOTH must honor the identical contract in §6 from
day one so switching lanes never changes render behavior.

---

## 4. Architecture Overview

```text
                         ┌────────────────────────────────────────────┐
                         │        Studios (product surfaces, §8)       │
                         │  AI Content · Catalog Video · Review Remix  │
                         │  AI Motion · (Vertical Drama = adapter only)│
                         └───────────────┬────────────────────────────┘
                                         │ tRPC videoProjects router (§15)
                 ┌───────────────────────┼───────────────────────────┐
                 ▼                       ▼                           ▼
   AI Intelligence Layer          video_projects (§14)        QA Loop (§12)
   skills (§13) + BullMQ          Neutral Project Schema      videoProjectQualityLoop
   video_intelligence_jobs        VideoProjectDocument         judge skill + repair
   (script/scene/motion plan)     jsonb, revisioned            stages, keep-best
                 │                       │
                 │                       ▼  compile (§5.6)
                 │              videoProjectCompiler.ts
                 │              → RemotionTemplateConfig (frozen Phase 7 contract)
                 │                       │
                 ▼                       ▼
        Media Intelligence (§9)   Render dispatch (§6)
        transcription · silence   queueRemotionRenderVideoJob (Zod-validated) →
        clip index · tags         worker_jobs jobType="remotion_render_video"
                                    capabilityFamilies=["remotion-render",…] (§6.3 gate)
                                         │ claim — only workers advertising remotion-render
                                         ▼
                              Lane A: server in-process worker (Phase 1)
                              Lane B: apps/worker-app fleet (Phase 6) — same contract
                              → executeRemotionRender (existing adapter)
                              Remotion GenericTemplate + R3F scene registry
                              [+ ffmpeg post-pass: loudnorm / ASS burn / concat]
                                         │
                                         ▼
                              worker_artifacts → storage (R2/S3) → libraryItems
                                         │
                                         ▼
                              /render-jobs page (existing, automatic)
```

Renderer routing policy (which engine does what — normative, §5.7):

- **FFmpeg direct** (reuse VD/HyperFrames builders): trim, concat, resize,
  audio mix/loudnorm, codec conversion, proxy generation, ASS subtitle
  burn-in, simple watermark/banner overlay.
- **Remotion** (`GenericTemplate`): caption animation, multi-layer
  image/video/text/SVG composition, motion-graphic templates, data-driven
  props videos, timeline logic.
- **R3F inside Remotion** (`scene3d` layers): 3D product stage, orbital/
  network/particle scenes, camera fly-through, 3D charts/logo.
- **Pre-render**: heavy 3D backgrounds and reusable scenes render once to
  MP4 (their own `remotion_render_video` job), then re-enter compositions
  as `video` layers.

---

## 5. Neutral Video Project Schema

### 5.1 Design rule

Projects are **never stored as React code**. The persisted document is a
neutral, Zod-validated JSON schema; renderers consume it through adapters.
The already-shipped `RemotionTemplateConfig` is the **compilation target**,
not the authoring format — it stays frozen so Phase 7 code is untouched.

### 5.2 `VideoProjectDocument` (new, `apps/web/shared/videoIntelligence/projectSchemas.ts`)

```jsonc
{
  "schemaVersion": 1,
  "format": { "width": 1080, "height": 1920, "fps": 30, "durationMs": 45000 },
  "content": {
    "topic": "AI Agent",            // optional provenance
    "audience": "general",
    "language": "th",
    "platformPreset": "tiktok_9_16" // safe-area preset id
  },
  "brandKitId": "bk-001",           // nullable (§10)
  "scenes": [
    {
      "sceneId": "SC-001",
      "startMs": 0,
      "endMs": 5000,
      "narration": "AI Agent คือผู้ช่วยที่ลงมือทำงานแทนเราได้",
      "narrationAudioAssetId": "ma-123",   // nullable until TTS runs
      "visual": {
        "kind": "template",                 // template | layers
        "templateId": "orbital-core",       // Motion Template Registry id (§7)
        "params": { "items": ["icon-ai", "icon-document", "icon-search"] }
      },
      "layers": [ /* RemotionLayer[], used when kind = "layers" or as template overlay */ ],
      "motion": { "intensity": "medium", "camera": "push-in" },
      "captionCues": [ { "startMs": 0, "endMs": 2200, "text": "..." } ]
    }
  ],
  "audioTracks": [
    { "kind": "narration", "assetRefs": ["ma-123"], "gainDb": 0 },
    { "kind": "music", "assetRefs": ["ma-200"], "gainDb": -14, "ducking": true },
    { "kind": "sfx", "events": [ { "assetRef": "ma-301", "atMs": 4800 } ] }
  ],
  "captions": { "presetId": "classic_box", "burnIn": true, "language": "th" },
  "claims": [ /* claim records used by this project, §11 */ ],
  "qa": { "targetScore": 8, "maxLoops": 5 }
}
```

Rules:

- Scene `layers` reuse **`RemotionLayerSchema` verbatim** (import from
  `shared/remotion/layerTemplateSchemas.ts`) with scene-relative
  `startFrame`; the compiler offsets to absolute frames.
- `visual.kind = "template"` scenes expand via the Motion Template Registry
  (§7) into layers at compile time; params are validated against the
  template's own Zod param schema.
- All asset references are `mediaAssets`/`libraryItems` ids or storage-proxy
  URLs — never arbitrary external URLs (§17.3).
- Caption preset ids reuse the shared 10-preset enum already used by
  HyperFrames + Vertical Drama.

### 5.3 New layer type: `audio`

Extend `RemotionLayerSchema` (additive, backward-compatible — existing
configs unaffected) with:

```text
audio: { src(url), trimStartSec, volume(0-1), loop(bool), fadeInMs, fadeOutMs }
```

Rendered as Remotion `<Audio>` inside `GenericTemplateComposition`. This
closes the Phase 7 "no audio layer" gap for narration/music/SFX in preview
and simple finals.

### 5.4 Audio finishing (ffmpeg post-pass, optional)

When `renderProfile.loudnessNormalize = true` (default for `final`), the
worker runs one ffmpeg pass over the Remotion output reusing
`buildAudioFilterGraph`'s `loudnorm` stage from
`verticalDramaFinalRenderGraph.ts`. No new audio engine.

### 5.5 Captions

- **Preview + default final**: captions render as Remotion text layers
  (animated, part of the composition) generated from `captionCues`.
- **`captions.burnIn` with ASS fidelity** (karaoke, libass styles): worker
  post-pass reuses `buildAssSubtitleFile` + subtitle filter, identical to
  VD final render. SRT/VTT export reuses
  `renderTranscriptCuesAsVtt/Srt` from `hyperframesTranscriptionService.ts`.

### 5.6 Compiler (`apps/web/server/services/videoProjectCompiler.ts`, new)

Pure function `compileVideoProject(document, resolvedAssets): RemotionTemplateConfig`:

1. Validates the document (Zod, `.strict()`).
2. Expands `template` scenes via the registry (§7) — template params →
   layers, brand-kit tokens resolved (§10.3).
3. Offsets scene-relative frames to absolute; flattens to one `layers[]`
   sorted by zIndex; emits `audio` layers from `audioTracks`.
4. Enforces limits (≤40 layers per compiled config — if exceeded, the
   compiler splits into per-scene-chunk configs and emits a **segment plan**
   whose parts are rendered as separate jobs and ffmpeg-concatenated by the
   worker, reusing `buildConcatFfmpegArgs`).
5. Output validates against `RemotionTemplateConfigSchema` before any job is
   queued — invalid projects fail fast at save/compile, never in a worker.

### 5.7 Adapters

```text
VideoProjectDocument
├─ Remotion Adapter  = videoProjectCompiler → payload.remotionTemplate (§6)
├─ FFmpeg Adapter    = concat/trim/mix/burn post-passes (existing builders)
├─ R3F Adapter       = scene3d layers → vetted scene registry
└─ Future renderers  = new compile targets; the document never changes
```

---

## 6. Render Jobs: `remotion_render_video`

> **§6 is the mutually-understood render contract.** A 2026-07-12 research
> pass on `apps/worker-app` (Rust/Tauri, Feature 124) found it is **hardwired
> to a single jobType `hyperframes_final_composite`**, has **no per-jobType
> dispatch** (it routes every claimed job to the hyperframes executor and
> fails anything else with `render_failed`), the server **does not gate
> claims by jobType** (`workerJobMatchesSelection` returns `true` when a job
> declares no capability families), and the worker **re-parses `inputJson`
> ad-hoc in Rust** rather than sharing the server's Zod schema (§3.5). Every
> subsection below exists to make server and worker agree on one contract so
> a Remotion job can never be claimed-and-mis-rendered by a hyperframes-only
> worker, and a compiled config can never be silently misread. These are
> **normative MUSTs**, not suggestions.

### 6.1 Job type

New `jobType` string **`remotion_render_video`** on `worker_jobs`. No
schema migration (free-form varchar, §3.2). One idempotencyKey per
(projectId, revision, renderProfile).

### 6.2 Single source of truth for the payload contract

The payload schema lives **once**, in
`apps/web/shared/workerRuntime.ts` (the same file that already holds
`hyperframesFinalCompositeWorkerInputSchema` and the other desktop-jobType
contracts) — NOT in a separate `videoIntelligence/` file — so it sits beside
its sibling worker contracts and the server validates every job against it
at enqueue AND every event against the per-jobType stage/failure enums. It
**embeds `RemotionTemplateConfigSchema` verbatim** (imported from
`shared/remotion/layerTemplateSchemas.ts`); layer shapes are never
re-declared.

```jsonc
// remotionRenderVideoWorkerInputSchema (Zod, .strict())  — inputJson
{
  "kind": "remotion_render_video",
  "schemaVersion": 1,                            // payload schema version (§6.7)
  "platformContractVersion": "2026-07-12",       // bumped on any breaking payload change
  "rendererPolicyVersion": "remotion-1",         // renderer behavior contract
  "videoProjectId": "vp-001",
  "projectRevision": 7,
  "traceId": "trc-…",                            // shared across audit JSONL + events (§19)
  "renderProfile": {
    "profile": "preview" | "final",
    "width": 1080, "height": 1920, "fps": 30,    // preview may downscale (§18.2)
    "codec": "h264",
    "loudnessNormalize": true,
    "burnInAssCaptions": false
  },
  "remotionTemplate": { /* compiled RemotionTemplateConfig — self-contained */ },
  "compositionId": "GenericTemplate",            // must equal GENERIC_TEMPLATE_COMPOSITION_ID
  "assetManifest": {                             // every http/https asset the render fetches
    "sources": [ { "role": "video"|"image"|"audio"|"font", "url": "/api/storage/files/…", "sha256": "…" } ]
  },
  "postPasses": [ "loudnorm" ],                  // ordered; ∈ loudnorm|ass_burn|segment_concat
  "segmentPlan": null,                           // or { parts: [...] } per §5.6
  "remotionTemplateHash": "sha256:…",            // stable hash of remotionTemplate (dedupe + tamper check)
  "durationInFrames": 1350                        // authoritative; worker must not recompute
}
```

The payload embeds the **compiled, self-contained** template (the worker
never needs DB access to project tables), plus ids/hashes for traceability
and integrity. `assetManifest` lists every URL the render will fetch so the
worker can pre-stage and checksum-verify assets before launching Chromium
(no surprise fetches mid-render). `outputJson.outputRefs` follows the
existing shape so `RenderJobsPage.tsx` renders download / editor /
media-history links unchanged.

### 6.3 Capability-family gating (THE safety mechanism)

Because the server does not filter claims by jobType (§3.5), the **only**
thing preventing a hyperframes-only worker from grabbing a Remotion job and
failing it is capability-family intersection. This is mandatory on both
sides:

- Server: the queue function sets
  `capabilityRequirementsJson.capabilityFamilies =
  REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` (new export in
  `shared/workerRuntime.ts`, value `["remotion-render", "chromium-render",
  "ffmpeg-probe"]`). This is **required and non-empty** — a Remotion job MUST
  NOT be enqueued without it, else `workerJobMatchesSelection` matches any
  worker.
- Worker (both lanes, §6.5): a worker MUST advertise `remotion-render` in
  its registration `capabilities_json` AND send it in the claim
  `capabilityHints` to be eligible. Hyperframes-only workers advertise only
  `hyperframes-final-composite` and therefore never match — and vice-versa.
- Server hardening (defense in depth): add a jobType→required-family
  assertion so that even if a future worker over-advertises, the claim path
  double-checks the claiming worker advertises `remotion-render` for a
  `remotion_render_video` job (small addition alongside
  `workerJobMatchesSelection`).

### 6.4 Queue function

`queueRemotionRenderVideoJob(...)` in `workerSchedulerService.ts`, modeled
on the hyperframes queue function (`queueDesktopHyperframesFinalCompositeJob`
~:1412, and the shared-schema `.parse()` at :1419):

- Validates `inputJson` with `remotionRenderVideoWorkerInputSchema.parse(...)`
  before insert (server-side single source of truth).
- `jobType: "remotion_render_video"`, `runtimeType: DESKTOP_RUNTIME_TYPE`
  (`desktop_zeroclaw_managed`), `resourceProfile: "cpu_heavy"`
  (scene3d-containing jobs request `gpu_required`), `timeoutSeconds` scaled
  from durationMs (floor 900s), `capabilityRequirementsJson.capabilityFamilies`
  = `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` (§6.3), `priority` (final >
  preview), `idempotencyKey` = hash(projectId, revision, profile).
- Registers `requiredProgressStages = REMOTION_RENDER_VIDEO_PROGRESS_STAGES`
  and `failureCodes = REMOTION_RENDER_VIDEO_FAILURE_CODES` in
  `assertRuntimeSpecificJobEventContract` (workerRegistryService.ts ~:647-668,
  new `remotion_render_video` branch) so the server rejects any event whose
  `stage`/`failureCode` is off-contract.
- Credits reserved via `reserveWorkerJobCredits` before insert; released or
  settled on completion/failure like existing job types (§18.4 pricing).

Event/artifact contract the worker MUST emit (mirrors the hyperframes
envelope so `RenderJobsPage.tsx` and the server validators work unchanged):

- Event envelope: `{ eventType, payloadJson, sequenceNumber,
  leaseOwnerToken, assignmentAttempt }`; `eventType ∈ job.progress |
  job.completed | job.failed` (echo `leaseOwnerToken`/`assignmentAttempt`
  from claim on every call).
- `REMOTION_RENDER_VIDEO_PROGRESS_STAGES` (ordered):
  `resolve_inputs, stage_assets, bundle_composition, select_composition,
  render_frames, run_post_passes, verify_outputs, upload_artifacts,
  server_verify_artifacts, publish_artifacts`. Terminal `publish_artifacts`
  → `job.completed`.
- progress `payloadJson`: `{ stage, percent, message }`; per-scene render
  events add `{ sceneIndex, sceneTotal }` (deliberately the same *shape* the
  page already reads for `shotIndex`/`shotTotal` — the page maps both).
- Artifact: `artifactType: "remotion_render_mp4"` (video/mp4, `final.mp4`)
  plus `remotion_render_manifest`, `remotion_render_log`,
  `remotion_probe_report`; init/complete payload fields
  `{ artifactType, fileName, contentType, sizeBytes, checksumSha256,
  storageRef, metadataJson, leaseOwnerToken, assignmentAttempt }`; MP4
  validated by `ftyp` box + min-bytes (same check as hyperframes).

Engine note: this job type is **Remotion-native** — it does NOT go through
`resolveVideoRenderEngine` and has no HyperFrames fallback
(`UnsupportedPresetError` cannot occur on the GenericTemplate path; any
failure is a real error and must surface, §20).

### 6.5 Two execution lanes — same contract, different host

Both lanes claim/execute/report through the identical §6.4 contract; they
differ only in where the render runs. A job does not know or care which lane
takes it.

- **Lane A — server-side in-process worker (Phase 1, ships first).** Extend
  `hyperframesRenderWorker.ts`: add `"remotion_render_video"` to its
  job-type list and a dispatch branch that calls `executeRemotionRender`
  (existing adapter — already parses `payload.remotionTemplate` via
  `RemotionTemplateConfigSchema`, stages assets on a local `127.0.0.1`
  server, resolves Thai fonts + Chromium), then runs declared `postPasses`
  via the injectable `FfmpegRunner`, ffprobe + SHA-256, and uploads via
  `initWorkerArtifactUpload`/`completeWorkerArtifact`. This lane reuses the
  machine class that renders HyperFrames jobs today. It advertises
  `remotion-render` so §6.3 gating holds even within one process.
- **Lane B — desktop Worker App fleet (Phase 6, `apps/worker-app`).** New
  Rust dispatch: a jobType branch in `worker_loop.rs::worker_loop_tick`
  (~:437, which today calls `execute_hyperframes_job` unconditionally)
  routing `remotion_render_video` → a new `execute_remotion_job`
  (module analogous to `worker_executor.rs`), plus `"remotion-render"` added
  to `capability_hints` (~:413) and to `build_registration_payload`
  (`control_plane.rs` ~:109). See §6.6 for its runtime pack.

Neither lane goes through the marketplace `RENDERER_ENGINE` env switch —
that governs only the frozen `MarketplaceAutoReview` composition.

### 6.6 Worker App runtime pack (Lane B packaging)

The shipped runtime pack (`apps/worker-app/runtime-pack/`) bundles the
HyperFrames CLI, not Remotion. Lane B adds a **Remotion runtime pack**
reusing what already ships and adding only what's missing:

- Reuse (already in the pack): bundled `node`, static `ffmpeg`/`ffprobe`
  (7.0.2), `browser/chrome` (Chrome-for-Testing) + `browser-libs`, Thai
  fonts.
- Add: `runtime-pack/remotion-sidecar/render.mjs` (entrypoint analogous to
  the existing `hyperframes-sidecar/render.mjs`) that invokes
  `@remotion/bundler` + `@remotion/renderer` against the compiled
  `server/remotion/Root.tsx` composition bundle; `@remotion/{renderer,bundler}`
  node_modules; the pre-built composition bundle.
- `manifest.json` extended: new `rendererKind: "remotion_official"`,
  `remotionVersion`, `sidecarScriptPath`, `sidecarSha256`, and
  `supportedContractVersions` advertising `platformContractVersion`
  `"2026-07-12"` so **old workers whose pack does not list it will not claim
  new jobs** (version gate, §6.7).
- Server download allowlist in `workerRuntime.ts` (~:456-482) widened for the
  new sidecar/module globs.
- Env for the sidecar mirrors the hyperframes launcher: `FFMPEG_PATH`,
  `FFPROBE_PATH`, `BROWSER_PATH`/`CHROME_PATH`/`PUPPETEER_EXECUTABLE_PATH`,
  `REMOTION_THAI_FONT_PATH`.

Because scheduler matching is already capability-based, enabling Lane B is a
worker-pack + Rust-dispatch change only; the server contract (§6.2–6.4) is
identical to Lane A, written once.

### 6.7 Versioning & compatibility (server ⇄ worker)

Three independent version gates, all reusing the existing mechanism:

1. **Protocol version** — `WORKER_RUNTIME_PROTOCOL_VERSION` (`2026-04-06`,
   exact-match rejected by `assertRuntimeCompatibility`). Unchanged; Remotion
   rides the existing protocol.
2. **Payload contract version** — `platformContractVersion` in the payload
   (§6.2). The worker checks it and refuses (clear `job.failed /
   contract_version_unsupported`) rather than mis-rendering an unknown shape.
3. **Runtime-pack support list** — `manifest.json.supportedContractVersions`
   must include the job's `platformContractVersion` for a worker to be
   eligible; enforced so a stale pack cannot claim a newer job.

Cross-language drift protection (server Zod ⇄ Rust hand-parse): a
**mandated golden-fixture round-trip test** (§23) — canonical
`remotionRenderVideoWorkerInput` JSON fixtures committed under
`apps/web/shared/__fixtures__/`, asserted by BOTH the TS schema test and a
Rust parse test — is the guard the shared schema alone cannot provide. Any
field rename must update the fixture, failing both suites until both sides
match.

### 6.8 Render-jobs page

No structural change (jobType-agnostic). Two optional cosmetic additions to
`RenderJobsPage.tsx`: a Thai display label for `remotion_render_video`
("เรนเดอร์วิดีโอ Remotion") and a jobType filter chip. Progress uses the
existing `sceneIndex`/`sceneTotal`↔`shotIndex`/`shotTotal` mapping; status
labels and `outputRefs` work as-is.

---

## 7. Motion Template Registry

### 7.1 Model

Code-based registry (like `hyperframesTemplateRegistry` +
`shared/hyperframes/templates.ts` — NOT a DB table), at
`apps/web/shared/videoIntelligence/motionTemplates.ts` +
`apps/web/server/remotion/templates/`:

```jsonc
{
  "id": "glass-orbital-ecosystem",
  "kind": "layer_pack" | "scene3d",
  "categories": ["technology", "platform", "integration", "network"],
  "minDurationMs": 3500,
  "maxDurationMs": 9000,
  "maxItems": 8,
  "renderCost": "low" | "medium" | "high",   // drives preview policy + pre-render advice (§18)
  "supportedAspectRatios": ["16:9", "9:16", "1:1"],
  "paramsSchema": { /* Zod, per template */ },
  "brandTokens": ["primaryColor", "font", "captionStyle"]   // consumed from Brand Kit (§10)
}
```

- `layer_pack` templates are pure functions
  `(params, ctx) => RemotionLayer[]` — deterministic, no I/O, unit-tested.
- `scene3d` templates map to vetted R3F registry ids; adding one ALWAYS
  means adding a reviewed component to `server/remotion/scenes/` +
  `REMOTION_SCENE_IDS` (the existing `assertRegistryMatchesIds()` load-time
  check keeps them in sync).

### 7.2 Starter template set (MVP → Phase 5)

MVP (`layer_pack`, 2D): `product_hero`, `glass_feature_cards`,
`how_to_steps`, `comparison_stage`, `review_highlight`, `kinetic_typography`,
`floating_gallery`, `luxury_end_card`, `data_flow`, `animated_chart_basic`.

Phase 5 (`scene3d`): `orbital_core` (extends shipped `orbiting-product`),
`network_tunnel`, `product_turntable`, `product_pedestal`,
`logo_particle_reveal`, `floating_cards_3d`, `media_wall`, `timeline_3d`.

### 7.3 Selection intelligence

The Motion Director skill (§13.4) selects templates by matching narration
semantics against `categories`, duration against min/max, and platform
against `supportedAspectRatios` — metadata-driven, **no hardcoded
template-id routing in TS** (per the established no-hardcode-skills rule).
TS validates the skill's selections against the registry and rejects
unknown ids (fail-closed, same posture as `scene3d.sceneId`).

---

## 8. Studios (product surfaces)

All studios produce/edit the same `video_projects` row; they differ in
input source and orchestration skill. Navigation: a "Video Studio" section
in the existing sidebar; each studio is a page + wizard, reusing existing
page patterns (Media Studio production-director layout).

### 8.1 AI Content Studio (topic/article → video)

Flow: Brief (topic, goal, audience, platform, duration, aspect, language,
tone, CTA, sources, depth) → **Content** (outline/article/key points/hook/
CTA — reuse `presentationArticleGenerator` + Feature 127's
article-to-storyboard machinery) → **Narration** (spoken-script adaptation
with pause/emphasis markers; duration estimate from chars-per-second table;
TTS via `ttsService.synthesize`) → **Scene Plan** (Content-to-Video skill
§13.1 emits `VideoProjectDocument.scenes` with per-scene visual concepts) →
Motion (template selection §7.3) → QA (§12) → Render (§6).

Content sources may include library knowledge items (`libraryItems` /
`libraryChunks` retrieval) — citations carried into the document's
provenance for claim checks.

### 8.2 Catalog Video Studio (product → video)

- Input: one or more `marketplaceProducts` ids + video goal
  (explainer/review/tutorial/feature/comparison/collection/launch/promotion/
  short-series/campaign) + duration + platform.
- Data resolution reuses `marketplaceCapture.getProduct` /
  `listProductImages` / `listInsightsByProduct` — the catalog is the
  **source of truth**. The generation prompt receives ONLY resolved catalog
  facts + approved claims (§11); the skill is forbidden from inventing
  properties, ingredients, prices, promotions, warranties, results,
  reviews, or medical claims.
- Run linkage: a `video_projects` row with
  `sourceRefs.productIds`; the existing `marketplaceAutoReviewRuns` flow is
  untouched — Catalog Video Studio is a **sibling** flow that can also
  hand off to storyboard-review (`storyboardReviewId`) when the user wants
  shot-by-shot review before render.
- Campaign mode: N variants (problem-first / how-to / results / promotion /
  review-quote) = N documents sharing resolved assets + claims; batch
  render = N `remotion_render_video` jobs.

### 8.3 Review Remix Studio (existing video → new videos)

- Input: an uploaded/library video (e.g. a 4-minute review) + target output
  count/duration/platform.
- Analysis (Media Intelligence §9): transcription
  (`hyperframesTranscriptionService`), silence/dead-air detection (reuse
  Video Editor silence detection server-side), filler-word cut candidates
  (from word-level tokens), clip segmentation + usefulness scoring, product
  visibility flags (Phase 4 vision pass).
- Remix skill (§13.3) picks hooks/best clips, writes a remix
  `VideoProjectDocument`: `video` layers with `trimStartSec` windows over
  the source, product-image inserts from the catalog, caption cues from
  the transcript, motion overlays, CTA end-card; 16:9→9:16 via safe-crop
  params on the `video` layer (`fit` + focal-point crop, additive schema
  field).
- Output: multiple 30s variants as separate projects/render jobs.

### 8.4 AI Motion Studio (narration/style → motion graphics)

Direct authoring surface over the Neutral Project Schema: pick/preview
motion templates, edit params, per-scene narration, brand kit application.
Workflow: narration → semantic segmentation → visual metaphor → template →
assets → timeline (all via the Motion Director skill with user override in
Guided/Expert modes).

### 8.5 Vertical Drama Studio (adapter only — 131/132 unchanged)

No changes to the VD pipeline. Two optional, flag-gated integration points:

- **Export adapter**: `verticalDramaEpisodes` compiled episodes can be
  imported as a `VideoProjectDocument` (clips as `video` layers + dialogue
  audio + caption cues) for re-styling/remixing in Motion Studio.
- **Shared caption/watermark presets**: 133 consumes the same 10 caption
  preset ids and ad-banner placement enums; no forked enums.

### 8.6 Project Workspace, automation modes, and Expert timeline

- Central workflow per project: Brief → Content → Script → Storyboard →
  Motion → Assets → Timeline → Captions → QA → Render — persisted as stage
  status on `video_projects` (mirrors VD stage-payload JSONB pattern).
- **Auto mode**: single input → all stages run via BullMQ generation jobs →
  render. **Guided mode**: approval gate per stage (approval columns on the
  project row; pattern from `mediaProductionApprovals`). **Expert mode**:
  opens the project in the existing Video Editor via a bidirectional
  mapping `VideoProjectDocument ⇄ videoEditorProjects.projectData`
  (phase-gated; lossy fields are round-trip-tested and documented).
- **Client preview**: add `@remotion/player` and render
  `GenericTemplateComposition` in-browser from the compiled config (same
  component, same props — true WYSIWYG with the worker render). Heavy
  `scene3d`/high-cost templates fall back to poster frames + a low-res
  preview render job (§18.2).

---

## 9. Media Intelligence

Incremental, reuse-first:

| Capability | Source |
|---|---|
| Transcription + word timestamps + VTT/SRT | existing `hyperframesTranscriptionService.ts` (Whisper) |
| Async transcription jobs | existing `storyboardReviewTranscriptionJobs.ts` pattern |
| Silence / dead-air | existing silence detection, moved callable server-side |
| Duration/codec/aspect probing | existing `probeDurationSeconds` / ffprobe helpers |
| Thumbnails / proxies | ffmpeg direct (FFmpeg adapter) |
| Clip indexing + usefulness score + semantic tags | **new**: `media_clip_index` table (§14.3) populated by an analysis skill + deterministic probes |
| Product visibility / face visibility / action detection | **Phase 4**: vision-LLM pass per keyframe via existing media provider gateway; stored on `media_clip_index` |
| Semantic clip search ("หาช่วงที่เห็นเนื้อผลิตภัณฑ์ชัด") | **Phase 4**: embedding search over clip metadata (reuse pgvector infra from Feature 050/055) |
| Duplicate detection | existing `mediaAssets.perceptualHash` |

Clip metadata shape follows the brief:

```json
{ "clipId": "clip-018", "startMs": 3200, "endMs": 6800,
  "action": "product-demo", "productVisible": true, "faceVisible": true,
  "qualityScore": 0.91, "usableAs": ["hook", "demo", "b-roll"] }
```

---

## 10. Brand Kit (net-new)

### 10.1 Table `brand_kits` (§14.2)

Stores: logo asset ref, primary/secondary/accent colors, fonts, caption
style preset, motion personality, icon style, transition style, music
style, CTA style, camera behavior, and **locks** (lock colors / typography /
icon style / motion intensity / CTA / product fidelity).

### 10.2 Example

```json
{ "brand": "SmartSpecPro", "motionPersonality": "premium-technology",
  "camera": "slow-cinematic", "transition": "clean-glass",
  "glow": "subtle", "caption": "modern-bold" }
```

### 10.3 Resolution

The compiler (§5.6) resolves template `brandTokens` against the project's
brand kit; locked tokens are **hard constraints** — the QA repair loop and
skills receive them as non-negotiable context, and TS rejects compiled
output that violates a locked color/font (deterministic check — this is a
fact-check, not creative judgment, so a TS gate is appropriate here).

---

## 11. Product Claim & Compliance

- **Claim Registry**: per-project `claims[]` records
  `{ claim, source, status }` with `status ∈ approved | needs_review |
  unsupported | prohibited`. Sources are catalog fields
  (`catalog.description`, `specsJson`, price snapshot, capture-insight
  claim resolutions) — reusing `marketplaceCaptureInsights.claimResolutionsJson`
  as the evidence backbone rather than a new evidence store.
- Every product statement in a generated script must map to a claim record;
  the Claim Validator step (part of the QA judge skill, §12) flags unmapped
  statements. `prohibited` categories (medical results, exaggerated
  efficacy, fake reviews/testimonials, false prices, expired promotions,
  nonexistent warranties) are enumerated in the skill definition (skill-first:
  the rules live in skill.md; TS only computes the deterministic joins —
  which statements have a source — as review input).
- Price/promotion facts always resolve from the latest
  `marketplaceProductPriceSnapshots` at generation time and are stamped
  with `resolvedAt` so stale prices are detectable at QA time.

---

## 12. Quality Control & Loop Engineering

Generalize the proven VD pattern — new
`server/services/videoProjectQualityLoop.ts` with the identical DI shape
(`runReview` / `repairStage(stage, instruction)` / `persistReview` /
`recompute deterministic metrics`), bounded rounds, regression detection,
keep-best-version:

```text
Generate → Evaluate (judge skill) → Score → Improve (stage-scoped repair)
→ Preview render (low-res, optional) → Evaluate again → Keep best
Default: targetScore ≥ 8/10, maxLoops ≤ 5
```

- Review dimensions (judge skill §13.5): content accuracy & flow, hook/CTA
  clarity, length fit, natural spoken language; product claim compliance
  (§11), product color/logo/price fidelity; visual-narration match, scene
  variety, motion clutter, text overflow, caption readability, safe-area
  compliance; technical (missing assets, oversized textures, render-cost
  budget §18.3, font availability).
- Deterministic facts computed in TS and fed INTO the review (never
  replacing LLM judgment, per the skill-first rule): per-scene durations vs
  narration length, caption chars-per-second, layer counts, safe-area
  bounding-box checks, claim-source join coverage, estimated render cost.
- Repair stages: `content`, `narration`, `scenes`, `motion`, `captions`,
  `claims` — each maps to a scoped regeneration path; reviews persist to an
  append-only ledger on the project (JSONB, VD pattern).

---

## 13. Skills (new, `apps/web/skills/`)

All follow the standard skill folder layout (skill.md + schemas/) and the
skill-first authoring rule: creative/prompt rules live in skill.md and are
enforced by the review/apply loop; TS computes facts only.

| # | Skill folder | Input → Output |
|---|---|---|
| 13.1 | `video-content-to-video` | topic/brief → article → narration → scene plan (`scenes[]` draft) |
| 13.2 | `video-catalog-to-video` | product ids + goal → product script + visual plan + asset selection (claims-constrained) |
| 13.3 | `video-review-remix` | source video clip index + transcript → best clips + remix document(s) |
| 13.4 | `video-motion-director` | narration + style + registry metadata → template selections + params + camera plan |
| 13.5 | `video-project-quality-review` | project document + deterministic metrics → scorecard + issues + repair instructions (incl. claim validation) |

Skill detection/routing stays metadata-driven via `skillRegistry.ts` — no
hardcoded skill ids in the chat flow.

---

## 14. Data Model (new tables — Drizzle, `drizzle/schema.ts`)

Following the Database Safety Protocol: additive-only migration, backups of
affected tables before `pnpm db:push`, row-count verification.

### 14.1 `video_projects`

`id` (uuid PK), `tenantId`, `userId`, `studioType`
(`content|catalog|review_remix|motion|imported`), `name`, `status`
(stage machine: `brief|content|narration|scenes|motion|assets|captions|qa|
ready|rendering|completed|failed`), `automationMode` (`auto|guided|expert`),
`brief` jsonb, **`document` jsonb** (`VideoProjectDocument`), `revision`
int, `brandKitId` FK nullable, `sourceRefs` jsonb (`productIds[]`,
`sourceVideoAssetId`, `storyboardReviewId`, `presentationDeckId`,
`verticalDramaEpisodeId`, `articleLibraryItemId`), `qaLedger` jsonb
(append-only reviews), `renderJobId` (worker_jobs id), `previewJobId`,
`resultLibraryItemId` FK, `videoEditorProjectId` FK nullable (Expert mode),
timestamps. Indexes: `(tenantId, userId, status)`, `(tenantId, studioType)`.

Revisions: a lean `video_project_revisions` table (`projectId`, `revision`,
`document` jsonb, `createdBy`, `reason`) — restore = copy back (pattern
from `agencyVersions`).

### 14.2 `brand_kits`

`id`, `tenantId`, `userId`, `name`, `logoAssetId` FK mediaAssets,
`colors` jsonb, `fonts` jsonb, `captionPresetId`, `motionPersonality`,
`transitionStyle`, `musicStyle`, `ctaStyle`, `cameraBehavior`,
`locks` jsonb, timestamps. Tenant-scoped listing; user-owned rows.

### 14.3 `media_clip_index`

`id`, `tenantId`, `mediaAssetId` FK, `startMs`, `endMs`, `action`,
`productVisible` bool nullable, `faceVisible` bool nullable,
`qualityScore` real, `usableAs` jsonb, `transcriptText`, `tags` jsonb,
`embedding` vector nullable (Phase 4), `analyzedAt`. Unique
`(mediaAssetId, startMs, endMs)`.

No new render-job table (uses `worker_jobs`), no motion-template table
(code registry §7), no claim-evidence table (reuses capture insights §11).

---

## 15. API Surface (tRPC `videoProjects` router, new)

### 15.1 Project CRUD & stages

`create`, `get`, `list`, `updateBrief`, `saveDocument` (validates + bumps
revision), `listRevisions`, `restoreRevision`, `delete`; stage runners:
`runContentStage`, `runNarrationStage` (incl. TTS), `runScenePlanStage`,
`runMotionStage`, `runQualityReview`, `applyQualityRepairs` — each
long-running stage is async (§15.3). Approval procedures for Guided mode:
`approveStage`, `rejectStage`.

### 15.2 Render

`compileProject` (returns compiled config + cost estimate, no side
effects), `queueRender` (`profile: preview|final`) →
`queueRemotionRenderVideoJob` → `{ workerJobId }`; status/detail/cancel via
the existing `workerJobs` router (no duplication). `getRenderCostEstimate`.

### 15.3 Async generation jobs

Long LLM stages run on a new BullMQ queue **`video_intelligence_jobs`**
(exact pattern of `vertical_drama_story_jobs`: submit → `{jobId}` → poll
`getGenerationJobStatus` / `getActiveGenerationJob` → resume-on-mount).

### 15.4 Brand kits & media intelligence

`brandKits.{create,list,get,update,delete}`;
`mediaIntelligence.{analyzeAsset, getClipIndex, searchClips}` (searchClips
Phase 4).

All procedures: `protectedProcedure`, tenant + owner checks (§17.1), Zod
input validation, rate limits (§18.5).

---

## 16. UI / UX

- Sidebar: **Studios** group (AI Content Studio, Catalog Video Studio,
  Review Remix Studio, AI Motion Studio — Vertical Drama Studio keeps its
  existing entry) + **Production** group links to existing pages
  (`/video-editor`, `/render-jobs`, Media History) — no new render-queue UI.
- New pages: `/video-studio` (project list + create), `/video-studio/:id`
  (workspace: stage rail Brief→…→Render, per-stage panels, Remotion Player
  preview, QA scorecard panel, render buttons Preview/Final).
- Reuse existing UI patterns per project convention: Media Studio
  production-director layout, storyboard-review crop/drag-drop/prompt-preview
  interactions, presentation editor property panels. i18n: Thai-first labels
  with English fallback (Feature 062 namespaces).

---

## 17. Security Requirements

### 17.1 Tenant & ownership isolation

Every `video_projects` / `brand_kits` / `media_clip_index` query filters by
`tenantId` + owner (`userId`) exactly like `workerJobMonitorService.listUserJobs`.
Render job payloads embed no cross-tenant asset URLs; compile resolves
assets through owner-checked `mediaAssets`/`libraryItems` lookups.

### 17.2 Code-execution surface (unchanged posture, restated as normative)

- R3F scenes: **closed registry only** (`REMOTION_SCENE_IDS` +
  `assertRegistryMatchesIds()`), no user/LLM-submitted component code, ever.
- SVG layers: `isSafeInlineSvgMarkup` reject-don't-strip validation stays
  mandatory for all new SVG-emitting templates.
- Template `layer_pack` functions are first-party code, reviewed like any
  server code; skills emit **parameters**, never code.

### 17.3 SSRF / asset fetching

Layer `src` URLs must resolve to the storage proxy (`/api/storage/files/…`)
or staged local-asset-server URLs; the compiler rejects other hosts
(allowlist), mirroring the staging model already in
`remotionRuntimeAdapter.ts`. Worker-side fetches go through the existing
staging + local server path only.

### 17.4 Threat model (STRIDE summary)

| Threat | Vector | Mitigation |
|---|---|---|
| Spoofing | worker claiming jobs | existing bearer worker tokens + scopes (`workers:claim/report`), lease tokens |
| Tampering | job payload mutation | payload compiled server-side, Zod-validated at claim; artifact checksums (SHA-256) |
| Repudiation | who rendered/what changed | `worker_job_events` + project revision history + audit JSONL (§19) |
| Information disclosure | cross-tenant assets in payloads / logs | §17.1 resolution rules; log key names not values; no secrets in prompts (project rule) |
| DoS | render-job flooding, oversized configs | credit reservation, per-user rate limits (§18.5), 40-layer/duration caps, timeoutSeconds, renderCost budget gate (§18.3) |
| Elevation | skills emitting unregistered scene/template ids | fail-closed enum validation at schema layer |

### 17.5 Content compliance

Claim Registry (§11) gates product statements; prohibited-claim categories
enforced in the QA judge; brand locks (§10.3) prevent identity tampering.
No secrets/API keys ever enter skill prompts (existing platform rule).

---

## 18. Performance & Render-Cost Requirements

### 18.1 Targets

| Metric | Target |
|---|---|
| Compile (document → config) | < 500 ms p95 (pure function) |
| Preview render (45s video, 540×960@15fps, no scene3d) | < 90 s p95 on the server worker |
| Final render (45s, 1080×1920@30fps, 2D layers) | < 6 min p95 |
| Final render with scene3d layers | < 12 min p95; above budget → pre-render advice (§18.3) |
| Queue wait (final, normal load) | < 2 min p95 (priority over preview) |
| tRPC CRUD procedures | < 300 ms p95 |
| Generation stage jobs (LLM) | async only; UI poll interval ≥ 2 s |

### 18.2 Preview profile

`preview` renders at ≤ 540×960, fps ≤ 15, CRF-relaxed; capped at 1
concurrent preview job per user. Client-side `@remotion/player` preview is
free (no job) for non-scene3d compositions.

### 18.3 Render-cost model

Each template carries `renderCost`; the compiler sums a cost score
(layers × duration × cost class). Over-budget compositions trigger the
**pre-render path**: heavy scene3d/background segments are rendered once as
child `remotion_render_video` jobs, cached by content hash (reuse
`renderHash.ts` pattern), and swapped in as `video` layers.

### 18.4 Credits

Render jobs reserve credits via `reserveWorkerJobCredits` proportional to
durationMs × resolution class × renderCost class; TTS uses the existing
5-credits/1000-chars; LLM stages billed through the normal provider-usage
path (OpenRouter primary, per platform policy).

### 18.5 Rate limiting

Per user: ≤ 6 render-job submissions/min, ≤ 20 generation-stage
submissions/min, ≤ 60 CRUD requests/min — enforced with the existing
Bottleneck/BullMQ limiter infrastructure; admin tier ×5.

### 18.6 Concurrency & resources

Worker: 1 Remotion render at a time per worker process (Chromium memory);
`resourceProfile` steers heavy jobs to `cpu_heavy`/`gpu_required` workers;
bundle memoization (`getBundleLocation()`) reused; staged assets cleaned in
`finally` (existing tmpdir hygiene).

---

## 19. Observability & Audit Logging

- Reuse the JSONL audit log (`logs/audit/`): events `video_project_stage`
  (stage, jobId, traceId), `skill_execute` (existing), `media_request`/
  `media_response` for TTS/image calls, `remotion_render.{queued,started,
  post_pass,completed,failed}` mirrored into both `worker_job_events` (UI)
  and audit JSONL (debugging) with a shared `traceId`.
- Every render job's `inputJson` records `videoProjectId`/`revision` so a
  failed render is reproducible byte-for-byte from the embedded compiled
  config (per the LLM & Media Debugging Protocol: the audit trail must
  answer "what was actually sent").
- Metrics worth counters/log-derived dashboards: renders by profile/status,
  p95 render duration, fallback-to-preview rate, QA loop rounds
  distribution, claim-violation flags per studio.

---

## 20. Error Handling & Failure Codes

Failure codes on `worker_jobs.failureReason` / stage errors (prefix `VI_`):

| Code | Meaning | Handling |
|---|---|---|
| `VI_DOCUMENT_INVALID` | document fails Zod at save/compile | 400 to client, never reaches a worker |
| `VI_TEMPLATE_UNKNOWN` | skill selected unregistered template/scene id | fail-closed; QA repair re-runs motion stage |
| `VI_ASSET_UNRESOLVED` | referenced asset missing/foreign | compile-time error listing offending layer ids |
| `VI_RENDER_FAILED` | Remotion render error | no silent fallback (§6.4); stderr tail captured in events; retry per `retryPolicyJson` (max 2) |
| `VI_POST_PASS_FAILED` | ffmpeg loudnorm/burn/concat failure | artifact of the pre-pass kept for diagnosis; job failed |
| `VI_COST_BUDGET_EXCEEDED` | compiled cost over budget without pre-render consent | surfaced in UI with pre-render suggestion |
| `VI_CLAIM_VIOLATION` | unmapped/prohibited claim at QA gate | blocks `final` render until resolved (Guided/Auto); Expert may override for `needs_review` only, audited |

Worker-emitted `REMOTION_RENDER_VIDEO_FAILURE_CODES` (validated by the
server's per-jobType event contract, §6.4 — the worker MUST emit a specific
code, not a blanket `render_failed`): `contract_version_unsupported`,
`asset_stage_failed`, `bundle_failed`, `composition_select_failed`,
`chromium_launch_failed`, `render_failed`, `post_pass_failed`,
`artifact_upload_failed`, `server_verification_failed`. The server maps
these onto the `VI_*` client-facing set for display.

Timeouts: lease expiry re-queues per existing worker-registry semantics;
`timeoutSeconds` scaled to duration (§6.4).

---

## 21. Feature Flags & Rollout

| Flag | Gates | Default |
|---|---|---|
| `videoIntelligencePlatformEnabled` (F133A) | all studio routes + router | off |
| `remotionRenderVideoJobEnabled` (F133B) | queue function accepts jobs | off |
| `videoIntelligenceCatalogStudioEnabled` (F133C) | Catalog Video Studio | off |
| `videoIntelligenceReviewRemixEnabled` (F133D) | Review Remix Studio (needs media-intelligence pass) | off |
| `videoIntelligenceScene3dTemplatesEnabled` (F133E) | scene3d template selection (2D-only until parity/perf proven) | off |
| `videoIntelligenceExpertEditorBridgeEnabled` (F133F) | Video Editor ⇄ document mapping | off |

Env kill-switch `RENDERER_ENGINE` continues to govern the marketplace
engine only; `remotion_render_video` is Remotion-native and instead honors
F133B as its kill-switch (jobs already queued still complete; new
submissions are rejected with a clear message).

---

## 22. Phased Roadmap & MVP

### Phase 1 — Core platform (MVP)

Neutral schema + compiler (§5); `remotion_render_video` job type end-to-end
on **Lane A only** (§6.5, server-side worker) but with the **full contract
in place from day one** — `remotionRenderVideoWorkerInputSchema` +
capability-family gating (§6.3) + per-jobType event/failure enums (§6.4) +
the golden-fixture round-trip test (§6.7) — so Lane B later needs no contract
change; `video_projects` + revisions (§14.1), tRPC router core
(§15.1–15.2), audio layer type (§5.3) + loudnorm post-pass, caption cues →
Remotion text layers + SRT/VTT export, ~10 `layer_pack` MVP templates
(§7.2), **Catalog Video Studio** first (§8.2 — highest value: catalog data +
claims + templates), Brand Kit minimal (colors/font/logo/caption preset +
locks), basic QA (single review round, deterministic metrics + judge skill),
`@remotion/player` preview.

MVP user flow (matches the brief §17):

```text
เลือกสินค้า → เลือกประเภทวิดีโอ + ความยาว + แพลตฟอร์ม
→ Generate Script → Generate Storyboard/Scenes → เลือกภาพ/วิดีโอ
→ Generate Motion → Preview → Render (→ /render-jobs) → Library
```

### Phase 2 — AI Content-to-Video

AI Content Studio (§8.1): article generator reuse, narration adapter, TTS
integration, scene planner skill, guided approvals.

### Phase 3 — QA Loop & Automation

Full `videoProjectQualityLoop` (bounded auto-improve, §12), Auto mode,
campaign multi-version generation, claim registry hard gate.

### Phase 4 — Media Intelligence & Review Remix

`media_clip_index` + analysis pipeline (§9), silence/filler auto-cut,
Review Remix Studio (§8.3), semantic clip search (pgvector).

### Phase 5 — Advanced Motion (R3F)

scene3d template set (§7.2), pre-render + content-hash caching (§18.3),
F133E on; luxury/3D presets; Motion Studio full surface.

### Phase 6 — Fleet (Lane B) & Expert

Worker App Remotion execution (§6.5 Lane B): Rust jobType dispatch +
`execute_remotion_job` + `remotion-render` capability advertisement + the
Remotion runtime pack (§6.6, reusing bundled Chrome/ffmpeg;
remotion-migration Phase 4). The server contract is unchanged from Phase 1 —
Lane B must pass the same golden-fixture round-trip test (§6.7) on the Rust
side before it is allowed to advertise the capability. Also: Expert mode
Video Editor bridge (F133F), Vertical Drama export adapter (§8.5).

---

## 23. Testing Strategy

- **Unit**: compiler (document → config golden tests incl. frame-offset,
  40-layer split, brand token resolution, allowlist rejection); template
  `layer_pack` functions (deterministic snapshots); claim-join computation;
  cost model.
- **Contract (server ⇄ worker — the mismatch guard)**: compiled output
  always validates against `RemotionTemplateConfigSchema`;
  `remotionRenderVideoWorkerInputSchema` round-trips; **golden-fixture
  round-trip (§6.7)** — canonical payload JSON in
  `apps/web/shared/__fixtures__/` asserted by BOTH the TS schema test and
  (for Lane B) a Rust parse test, so a field rename fails both suites until
  both sides match; capability-family gating asserted (a hyperframes-only
  worker's hints do NOT match a `remotion_render_video` job, and vice-versa);
  worker event `stage`/`failureCode` values validated against
  `REMOTION_RENDER_VIDEO_PROGRESS_STAGES`/`_FAILURE_CODES`; event payloads
  match the page's `sceneIndex`/`sceneTotal` progress contract.
- **Integration**: queue → claim → render → artifact happy path with a tiny
  2-scene fixture (extend the existing parity-harness approach: synthesize
  fixture media with ffmpeg, upload via real `storagePutFromPath`, render
  via the real worker path, ffprobe assertions on duration/resolution/audio
  presence). Negative: `VI_RENDER_FAILED` propagation (no silent fallback),
  idempotencyKey dedupe.
- **QA-loop**: DI-mocked `runReview`/`repairStage` (VD test pattern) —
  regression detection, keep-best, loop bounds.
- **E2E (Playwright)**: MVP flow through Catalog Video Studio to a
  completed `/render-jobs` row and library item.
- Existing suites must stay green: remotion parity harness, VD render graph
  tests, hyperframes worker tests.

---

## 24. Open Questions

1. Music library sourcing (licensed tracks vs user uploads only) — MVP:
   user uploads/library assets only.
2. `@remotion/player` licensing check for company scale (Remotion license
   is source-available with company-size terms) — verify before Phase 1
   ships to production.
3. Should Expert-mode edits write back to `document` (single source of
   truth) or fork into `videoEditorProjects` (current NLE behavior)?
   Leaning: document remains canonical; bridge is import/export until
   round-trip fidelity is proven (F133F).
4. GPU workers for scene3d (`gpu_required` profile) — availability on the
   current fleet unknown; Phase 5 dependency.
5. Whether Catalog campaign packages need a `campaigns` grouping table or
   `sourceRefs.campaignId` on projects suffices (MVP: the latter).

---

## 25. Traceability to Source Brief

| Brief section | Spec section |
|---|---|
| 1 เป้าหมายหลัก / core loop | §1 |
| 2 ชื่อระบบ + Studios | §1.2, §8, §16 |
| 3 ภาพรวมสถาปัตยกรรม | §4 |
| 4.1 AI Content Studio | §8.1 |
| 4.2 Catalog Video Studio + source-of-truth rules | §8.2, §11 |
| 4.3 Review Remix Studio | §8.3 |
| 4.4 AI Motion Studio | §8.4, §7 |
| 4.5 Media Intelligence | §9, §14.3 |
| 4.6 Hybrid Video Composer (layer mixing patterns) | §5, §3.1 (existing 6 layer types + new audio), §7 |
| 4.7 QC & Loop Engineering | §12 |
| 5 Project Workspace stages | §8.6, §14.1 status machine |
| 6 UI/UX menu | §16 |
| 7 Automation modes | §8.6 |
| 8 Skills (5 master skills) | §13 |
| 9 Neutral Project Schema + adapters | §5 |
| 10 Render architecture (FFmpeg/Remotion/R3F/pre-render) | §4 routing policy, §18.3 |
| 11 R3F usage boundaries | §7.1, §17.2 |
| 12 Motion Template Registry + metadata | §7 |
| 13 Brand & Consistency (Brand Kit + locks) | §10 |
| 14 Claim & Compliance registry | §11, §20 (`VI_CLAIM_VIOLATION`) |
| 15 รูปแบบวิดีโอที่สร้างได้ | §1.1, §8 (per studio) |
| 16 Roadmap 6 phases | §22 (re-sequenced to put Catalog before Content per MVP value) |
| 17 MVP แนะนำ | §22 Phase 1 |
| 18 สุดท้ายจะกลายเป็นอะไร | §1, §2 |
| 19 ข้อสรุปหลัก (Hybrid system) | §2, §4 |
| Remotion ควบคู่ + job รอ render ที่หน้า render-jobs + type ใหม่ | §6 |
| เชื่อมโยง Vertical Drama / storyboard-review / presentations ไม่ซ้ำซ้อน | §2, §3.3–3.4, §8.5 |

---

## Appendix A. Glossary

- **Neutral Project Schema / `VideoProjectDocument`** — renderer-agnostic
  persisted project JSON (§5.2).
- **`RemotionTemplateConfig`** — shipped Phase 7 multi-layer config; 133's
  compilation target, contract frozen.
- **Studio** — a product surface that authors `video_projects` from a
  specific input class.
- **`remotion_render_video`** — new `worker_jobs.jobType` for Remotion
  renders (§6).
- **Motion Template Registry** — code-based catalog of parameterized
  `layer_pack` / `scene3d` templates (§7).
- **Claim Registry** — per-project claim→source→status records gating
  product statements (§11).
- **Pre-render** — rendering a heavy segment to MP4 once and re-using it as
  a `video` layer (§18.3).

## Appendix B. Version History

- 0.1 (2026-07-12) — initial proposal, research-grounded.
