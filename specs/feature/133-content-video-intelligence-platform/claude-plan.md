# Feature 133 — Implementation Plan (Phase 1 / MVP)

Status: Draft for /deep-implement
Scope: Phase 1 of the Content & Video Intelligence Platform (see
`claude-spec.md`; full platform in `spec.md`).
Reader assumption: a SmartSpecPro engineer or an implementing LLM with NO prior
session context. Everything needed is here or cited by exact path/signature.

---

## 0. What we are building and why

SmartSpecPro can already render video two ways: the frozen Marketplace
Auto-Review composition and a **general, backend-only, data-driven Remotion
multi-layer engine** (the "GenericTemplate" — image/video/text/svg/motionGraphic/
scene3d layers, one timeline, React-driven, parameterised entirely through
props). That engine has **no product surface, no durable job, and no way for a
user to produce a video with it.**

Phase 1 gives it one. We add a **Neutral Project Schema** (a renderer-agnostic
JSON document a user authors), a **compiler** that turns it into the frozen
`RemotionTemplateConfig` the engine already consumes, a **durable
`remotion_render_video` worker job** that renders it and shows up on the existing
`/render-jobs` page, and **two thin studio UIs** (Catalog Video Studio, Motion
Studio) to author projects. Narration (TTS), captions, a minimal brand kit with
enforced locks, product-claim validation, and a single QA review round round out
a genuinely useful MVP.

The one subtle, high-risk area is the **render job contract between the web
server and the desktop Worker App**. The Worker App is a Rust/Tauri client
hardwired to a single job type; it claims jobs the server hands it and re-parses
payloads by hand. If we introduce `remotion_render_video` carelessly, a
hyperframes-only worker will claim it and fail it, or a field-name drift will
mis-render. So Phase 1 ships the **full contract from day one** (shared Zod
schema, capability-family claim gating, per-job-type event/failure enums,
version fields, a golden-fixture round-trip test) even though only the
**server-side in-process worker (Lane A)** executes it this phase. The Worker App
fleet (Lane B) is Phase 6 and will drop into the same contract.

**Reuse is mandatory.** We do not rebuild the Remotion engine, the ffmpeg
builders, TTS, transcription, the worker fabric, storage, or feature flags. We
extend them with additive schema variants, new exported constants + one consumer
branch, new pure services, and new tables. See §12 for the reuse contract.

---

## 1. Architecture at a glance

```
Studios (React)                 tRPC videoProjects router          BullMQ
 ├ Catalog Video Studio  ──────▶  create/get/list/saveDocument  ──▶ video_intelligence_jobs
 └ Motion Studio (thin)          runScenePlan / runNarration        (async LLM/TTS stages)
        │  @remotion/player         runQualityReview
        │  preview (compiled cfg)   compileProject / queueRender
        ▼                               │
 video_projects (jsonb document, revisioned)  ── compileVideoProject() ─▶ RemotionTemplateConfig
        │                                                                    (frozen contract)
        ▼                                                                    │
 queueRemotionRenderVideoJob() ─▶ worker_jobs (jobType="remotion_render_video",
   Zod-validated payload            capabilityFamilies=["remotion-render",…])
   + credit reservation)                     │ claim (only remotion-render workers)
                                             ▼
                             Lane A: hyperframesRenderWorker branch
                               → executeRemotionRender(payload.remotionTemplate)
                               → post-passes (loudnorm / ASS burn / concat) via FfmpegRunner
                               → ffprobe + sha256 → artifact → storage → libraryItems
                                             │
                                             ▼
                                   /render-jobs page (existing, automatic)
```

Dependency order for implementation (also the section order in §11):
schemas → compiler → worker contract → queue/worker dispatch → DB tables →
router → studios/UI → QA → tests/harness.

---

## 2. Neutral Project Schema + `audio` layer

### 2.1 New file `apps/web/shared/videoIntelligence/projectSchemas.ts`

Zod `.strict()` schemas + inferred types for the authoring document. Shapes
(fields only — see `spec.md` §5.2 for the annotated example):

```
VideoProjectDocumentSchema
  schemaVersion: literal(1)
  format: { width, height, fps, durationMs }
  content: { topic?, audience?, language, platformPreset }
  brandKitId: string | null
  scenes: SceneSchema[]           // ≥1
  audioTracks: AudioTrackSchema[]
  captions: { presetId: CaptionPresetId, burnIn: bool, language }
  claims: ClaimRecordSchema[]     // §7
  qa: { targetScore: number, maxLoops: number }

SceneSchema
  sceneId, startMs, endMs
  narration: string | null
  narrationAudioAssetId: number | null    // mediaAssets.id (bigint)
  visual: { kind: "template" | "layers",
            templateId?: string,          // Motion Template Registry id (§4)
            params?: record }
  layers: RemotionLayer[]                 // reuse RemotionLayerSchema verbatim, scene-relative startFrame
  motion: { intensity, camera }
  captionCues: { startMs, endMs, text }[]

AudioTrackSchema (discriminated on kind)
  narration: { kind, assetRefs: number[], gainDb }
  music:     { kind, assetRefs: number[], gainDb, ducking }
  sfx:       { kind, events: { assetRef: number, atMs }[] }

ClaimRecordSchema  // §7
  claim: string, source: string, status: "approved"|"needs_review"|"unsupported"|"prohibited"
```

Design notes / constraints:
- `SceneSchema.layers` imports `RemotionLayerSchema` from
  `shared/remotion/layerTemplateSchemas.ts` — no re-declaration (research A1).
- `CaptionPresetId` reuses the existing shared preset id type
  (`CaptionPresetId` inferred from `HyperframesFinalCompositeSubtitlePresetSchema`
  — research A9); do NOT invent a new preset enum.
- Asset references are numeric `mediaAssets.id` / `libraryItems.id` (or a
  storage-proxy URL string where a raw URL is unavoidable), never arbitrary
  external URLs (spec §17.3).
- `platformPreset` is a small enum of safe-area presets
  (`tiktok_9_16`, `reels_9_16`, `youtube_16_9`, `square_1_1`) driving
  width/height defaults.

### 2.2 Additive `audio` layer variant

Extend `RemotionLayerSchema` in `shared/remotion/layerTemplateSchemas.ts` with a
new discriminated-union member (additive — every existing variant/test stays
green):

```
audio: type:"audio", src(url≤4096), trimStartSec(≥0 =0),
       volume(0..1 =1), loop(bool =false), fadeInMs(≥0 =0), fadeOutMs(≥0 =0)
```

Render it in `apps/web/server/remotion/GenericTemplateComposition.tsx` as a
Remotion `<Audio src trimBefore volume>` inside the existing per-layer
`<Sequence>` (frame-driven; volume/fade computed from `useCurrentFrame()` like
the other layers). This closes the Phase-7 "no audio layer" gap. `<Audio>` has
no visual box, so it ignores x/y/width/height (document that in a comment).

Verification: existing `remotionTemplateService.test.ts` must still pass; add
cases for the audio variant (parse + inputProps passthrough).

### 2.3 Compiler `apps/web/server/services/videoProjectCompiler.ts`

```
compileVideoProject(
  document: VideoProjectDocument,
  ctx: TemplateBuildContext
): CompileResult

// Single build context, shared by the compiler and every template builder (§4.1)
type TemplateBuildContext = {
  format: { width, height, fps, durationMs }
  brandKit: BrandKit | null
  assetResolver: AssetResolver          // wraps a ResolvedAssetMap (§9.1a)
}
type AssetResolver = { url(assetId: number|string): string; sha256(assetId): string | undefined }

type CompileResult =
  | { kind: "single", config: RemotionTemplateConfig, cost: RenderCostEstimate }
  | { kind: "segmented", parts: RemotionTemplateConfig[], concat: SegmentPlan, cost: RenderCostEstimate }
```

Pure function (no I/O — assets already resolved into `ctx.assetResolver` by the
caller). Steps (spec §5.6):
1. `VideoProjectDocumentSchema.parse(document)`.
2. Expand each `visual.kind==="template"` scene via the Motion Template Registry
   (§4): `template.build(params, ctx)` → `RemotionLayer[]`; validate `params`
   against the template's own Zod schema; apply brand-kit token resolution
   (§6.3).
3. **Caption cues → text layers:** for each scene, unless `captions.burnIn` is
   set (then captions are handled by the `ass_burn` post-pass §5.2), emit a
   Remotion `text` layer per `captionCues` entry, styled from
   `captions.presetId`, timed by the cue's start/end.
4. Offset scene-relative `startFrame` to absolute frames (using `format.fps` and
   scene `startMs`); merge scene `layers` + template-expanded layers + caption
   layers; emit `audio` layers from `audioTracks`.
5. Flatten to one `layers[]` sorted by `zIndex`; if `>40` layers, split into
   per-scene-chunk configs and return `kind:"segmented"` with a `SegmentPlan`
   (part order + concat instruction). (40 = the frozen
   `RemotionTemplateConfigSchema` max — research A1.)
6. Validate every emitted config with `RemotionTemplateConfigSchema.parse`
   before returning — invalid → throw `VideoProjectCompileError` (maps to
   `VI_DOCUMENT_INVALID` / `VI_TEMPLATE_UNKNOWN` / `VI_ASSET_UNRESOLVED`).
7. Compute `RenderCostEstimate` (§4.3).

Brand-lock enforcement (spec §10.3): if the brand kit has locked colors/fonts
and any resolved layer uses a different value, throw
`BrandLockViolationError` (deterministic check — a fact, not a judgment). This is
part of compile, so a locked-brand violation can never reach a render.

Tests (research B2): golden document → expected config; frame-offset math;
40-layer split path; brand-token resolution; lock violation throws; unknown
template id throws; unresolved asset throws.

---

## 3. Render job contract (shared, server-authoritative)

This is the spec §6 contract made concrete. All new symbols go in the **existing**
`apps/web/shared/workerRuntime.ts` beside the sibling job contracts (research A5)
— NOT a new file — so server enqueue validation and event validation share one
source of truth.

### 3.1 New exported constants

```
REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES =
  ["remotion-render","chromium-render","ffmpeg-probe"] as const

REMOTION_RENDER_VIDEO_PROGRESS_STAGES =
  ["resolve_inputs","stage_assets","bundle_composition","select_composition",
   "render_frames","run_post_passes","verify_outputs","upload_artifacts",
   "server_verify_artifacts","publish_artifacts"] as const

REMOTION_RENDER_VIDEO_FAILURE_CODES =
  ["contract_version_unsupported","asset_stage_failed","bundle_failed",
   "composition_select_failed","chromium_launch_failed","render_failed",
   "post_pass_failed","artifact_upload_failed","server_verification_failed"] as const

REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION = "2026-07-12"
REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION = "remotion-1"
```

### 3.2 `remotionRenderVideoWorkerInputSchema` (Zod `.strict()`)

Mirror `hyperframesFinalCompositeWorkerInputSchema` structure (research A5).
Fields (see `spec.md` §6.2 for the annotated example):

```
kind: literal("remotion_render_video")
schemaVersion: literal(1)
platformContractVersion / rendererPolicyVersion: string(1..120)
videoProjectId: string
projectRevision: int
traceId: string
renderProfile: { profile: "preview"|"final", width, height, fps,
                 codec: literal("h264"), loudnessNormalize: bool, burnInAssCaptions: bool }
remotionTemplate: RemotionTemplateConfigSchema     // embedded verbatim (research A1)
compositionId: literal("GenericTemplate")          // === GENERIC_TEMPLATE_COMPOSITION_ID
assetManifest: { sources: { role:"video"|"image"|"audio"|"font", url, sha256 }[] }
postPasses: array(enum("loudnorm","ass_burn","segment_concat"))
segmentPlan: SegmentPlanSchema | null
remotionTemplateHash: string          // sha256 of remotionTemplate
durationInFrames: int                 // authoritative; worker must not recompute
```

Export the inferred type `RemotionRenderVideoWorkerInput`.

### 3.3 Event contract enforcement

Add a `remotion_render_video` branch to the private ternary in
`assertRuntimeSpecificJobEventContract` (`workerRegistryService.ts`, research A7)
selecting `{ progressStages: REMOTION_RENDER_VIDEO_PROGRESS_STAGES,
failureCodes: REMOTION_RENDER_VIDEO_FAILURE_CODES }`. This makes the server
reject any off-contract `stage`/`failureCode` a worker emits — the guarantee
that Lane A and (later) Lane B stay honest.

### 3.4 Golden-fixture round-trip test (the mismatch guard)

Put canonical payload JSON under `apps/web/shared/__fixtures__/`:
- `remotionRenderVideoWorkerInput-valid.json` (a full, realistic 2-scene payload)
- `remotionRenderVideoWorkerInput-invalid.json` (e.g. unknown layer type / >40
  layers / missing capability-relevant field)

Contract test (research B6): valid → `safeParse` success + field assertions;
invalid → failure + stable error; a determinism check on normalized JSON. A
field rename breaks this test until the fixture is updated — the cross-language
guard that the Rust worker (Phase 6) will also assert against.

---

## 4. Motion Template Registry (2D `layer_pack` only)

### 4.1 New files

- `apps/web/shared/videoIntelligence/motionTemplates.ts` — registry metadata +
  ids (metadata style mirrors `shared/hyperframes/templates.ts`, research):
  ```
  MotionTemplateMeta
    id, kind: "layer_pack",           // no scene3d in Phase 1
    categories: string[], minDurationMs, maxDurationMs, maxItems,
    renderCost: "low"|"medium"|"high",
    supportedAspectRatios: ("16:9"|"9:16"|"1:1")[],
    paramsSchema: ZodType, brandTokens: string[]
  MOTION_TEMPLATE_IDS = [...] as const
  ```
- `apps/web/server/remotion/templates/` — one file per template, each exporting
  a pure builder using the same `TemplateBuildContext` the compiler builds (§2.3):
  ```
  build(params: <template params>, ctx: TemplateBuildContext): RemotionLayer[]
  ```
- `apps/web/server/remotion/templates/index.ts` — `MOTION_TEMPLATE_REGISTRY:
  Record<MotionTemplateId, MotionTemplate>` + an `assertRegistryMatchesIds()`
  load-time check (mirror the scene-registry pattern that already guards
  `REMOTION_SCENE_IDS`).

### 4.2 The 10 MVP templates (spec §7.2)

`product_hero`, `glass_feature_cards`, `how_to_steps`, `comparison_stage`,
`review_highlight`, `kinetic_typography`, `floating_gallery`, `luxury_end_card`,
`data_flow`, `animated_chart_basic`. Each builder composes only the existing 2D
layer types (image/video/text/svg/motionGraphic/audio) — no new rendering
primitives. Each has a `.strict()` `paramsSchema` and declares `brandTokens` it
consumes (primaryColor/accentColor/font/captionStyle).

### 4.3 Cost model

`estimateRenderCost(config: RemotionTemplateConfig): RenderCostEstimate` — a pure
function summing `layers.length × durationInFrames × cost-class-weight`;
`RenderCostEstimate = { score, cls: "low"|"medium"|"high", recommendPreRender:
bool }`. In Phase 1 `recommendPreRender` is informational (no scene3d to
pre-render yet). Test as plain input→output (research B5 cost-model template).

### 4.4 Template selection

Phase 1 exposes templates for **manual pick** in the UI + a simple metadata
filter helper `selectTemplatesFor({ categories, durationMs, aspectRatio }):
MotionTemplateMeta[]`. The LLM "Motion Director" skill is Phase-2+; Phase 1 must
not hardcode template-id routing in TS beyond metadata filtering (respects the
repo's no-hardcode-skills rule).

---

## 5. Queue function + Lane A worker execution

### 5.1 `queueRemotionRenderVideoJob` (`workerSchedulerService.ts`)

Model on `queueDesktopHyperframesFinalCompositeJob` (research A6):

```
queueRemotionRenderVideoJob(
  rawInput: QueueRemotionRenderVideoJobInput,
  deps?: { repo?: WorkerSchedulerRepository; reserveCredits?: typeof reserveWorkerJobCredits }
): Promise<{ created: boolean; job: WorkerJobRecord }>

QueueRemotionRenderVideoJobInput extends RemotionRenderVideoWorkerInput + {
  tenantId, teamId?, requestedByUserId?, workflowRunId?, priority?,
  timeoutSeconds?, idempotencyKey?, reservedCredits?
}
```

Behavior:
- `remotionRenderVideoWorkerInputSchema.parse(rawInput)` (server-side single
  source of truth).
- Idempotency check via `repo.findJobByIdempotencyKey` (key =
  hash(projectId, revision, profile)).
- `reserveWorkerJobCredits({ userId, tenantId, requestedCredits })` (research A6;
  credits proportional to durationMs × resolution-class × cost-class, spec
  §18.4).
- `repo.insertJob({ tenantId, runtimeType: DESKTOP_RUNTIME_TYPE, workerId: null,
  jobType: "remotion_render_video", status: "queued",
  priority: profile==="final" ? 40 : 20,
  resourceProfile: "cpu_heavy",
  capabilityRequirementsJson: { capabilityFamilies: REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES },
  inputJson: parsedInput,
  instructionsJson: { requiredProgressStages: REMOTION_RENDER_VIDEO_PROGRESS_STAGES },
  timeoutSeconds: timeoutSeconds ?? scaleFromDuration(durationInFrames, fps),  // floor 900
  retryPolicyJson: { maxAttempts: 2, backoffSeconds: 120 },
  idempotencyKey })`.
- Gated by `isDesktopWorkerDispatchEnabled()` + feature flag F133B.

**Capability gating (spec §6.3):** `capabilityFamilies` is required and
non-empty; because `workerJobMatchesSelection` matches-all on an empty family
list (research A6), the non-empty list is what stops a hyperframes-only worker
from claiming this job. Add a defense-in-depth assertion at claim time that the
claiming worker advertises `remotion-render` for this jobType.

**Preview concurrency (spec §18.2):** before inserting a `profile:"preview"` job,
reject if the user already has a queued/running preview job (1-concurrent-preview
cap); `final` jobs are not capped but take priority (40 vs 20). The `assetManifest`
embedded in `inputJson` is the one built by `buildAssetManifest` (§9.1a) — the
queue function does not re-walk assets.

### 5.2 Lane A dispatch (`hyperframesRenderWorker.ts`)

Add a `remotion_render_video` branch (research A8). Because the render is
Remotion-native, it does NOT go through `resolveVideoRenderEngine`/`executeVideoRender`
(which carry the HyperFrames fallback) — it calls `executeRemotionRender`
directly. Sketch:

```
executeRemotionRenderVideoJob(input: {
  tenantId?, runId, renderJobId, payload: RemotionRenderVideoWorkerInput, runtimeEnv?
}): Promise<Record<string, unknown>>
```

Steps (emit a progress event per stage — §3.1 stage names):
1. `resolve_inputs` — validate `payload` (schema already parsed at enqueue;
   re-assert `platformContractVersion` supported, else fail
   `contract_version_unsupported`).
2. `stage_assets` — pre-stage every `assetManifest.sources` URL + checksum
   (reuse `stageRemotionShotSourceVideos` / `startLocalAssetServer` /
   `resolveAndStageRenderFont` from `remotionRuntimeAdapter.ts`, research A2).
3. `bundle_composition` + `select_composition` + `render_frames` — one call to
   `executeRemotionRender({ workspace, outputPath, payload, env })` (research
   A2); map `sceneIndex/sceneTotal` progress onto events (same shape the page
   reads for `shotIndex/shotTotal`).
4. `run_post_passes` — for each `postPasses` entry, build argv with a pure
   function and run via `defaultFfmpegRunner` (research A9):
   - `loudnorm` → new pure `buildLoudnormPassArgs(inPath, outPath)` reusing the
     VD filter string `loudnorm=I=-16:TP=-1.5:LRA=11` (do NOT import the private
     `buildAudioFilterGraph`; factor a fresh helper — research C2).
   - `ass_burn` → reuse `buildAssSubtitleFile` + a subtitle-filter argv.
   - `segment_concat` → reuse `buildConcatFfmpegArgs` for the `segmentPlan`.
5. `verify_outputs` — `probeDurationSeconds` + `ftyp`/min-bytes MP4 check +
   sha256 (same posture as hyperframes).
6. `upload_artifacts` + `server_verify_artifacts` + `publish_artifacts` — Lane A
   is in-process, so it writes the artifact via the existing return-path +
   `storagePutFromPath` (research A15) and lets the worker-registry insert the
   `worker_artifacts` row + publish to `libraryItems`. `artifactType:
   "remotion_render_mp4"` (+ `remotion_render_manifest`, `_log`, `_probe_report`).

Any failure emits `job.failed` with a **specific**
`REMOTION_RENDER_VIDEO_FAILURE_CODES` value (never a blanket `render_failed`).

Tests: post-pass argv builders as pure-fn argv assertions (research B3);
a stage-sequence unit test with an injected `FfmpegRunner` + a stub
`executeRemotionRender`; the real render is exercised by the script harness
(§9), not a Vitest test.

---

## 6. Data model + Brand Kit

Follow the Database Safety Protocol (backup affected tables → `pnpm db:push` →
verify row counts → complete the migration cycle). All new tables are additive.

### 6.1 `video_projects` (spec §14.1)

`pgTable("video_projects", …)` — style per `verticalDramaEpisodes` (research
A14):
```
id bigserial(number) PK
tenantId varchar(36) NN
userId integer NN → users.id (cascade)
studioType varchar(20) NN   // "catalog"|"motion"|"content"|"review_remix"|"imported"
name varchar(200) NN
status varchar(30) NN default "brief"   // brief|content|narration|scenes|motion|assets|captions|qa|ready|rendering|completed|failed
automationMode varchar(10) NN default "guided"  // auto|guided|expert
brief jsonb
document jsonb              // VideoProjectDocument
revision integer NN default 1
brandKitId bigint → brand_kits.id (nullable)
sourceRefs jsonb           // { productIds?, sourceVideoAssetId?, storyboardReviewId?, presentationDeckId?, verticalDramaEpisodeId?, articleLibraryItemId? }
qaLedger jsonb             // append-only review records
renderJobId varchar(36)    // worker_jobs.id
previewJobId varchar(36)
resultLibraryItemId integer → library_items.id (nullable)
videoEditorProjectId ...   // nullable, Expert bridge (unused Phase 1)
createdAt / updatedAt
indexes: (tenantId,userId,status), (tenantId,studioType)
```

### 6.2 `video_project_revisions` (lean history — spec §14.1)

```
id bigserial PK, projectId bigint NN → video_projects.id (cascade),
revision integer NN, document jsonb NN, createdBy integer, reason varchar(200), createdAt
unique (projectId, revision)
```
Restore = copy `document` back + bump `video_projects.revision`.

### 6.3 `brand_kits` (spec §14.2, interview Q3 = minimal + locks)

```
id bigserial PK, tenantId varchar(36) NN, userId integer NN → users.id,
name varchar(200) NN,
logoAssetId bigint → media_assets.id (nullable),
colors jsonb,        // { primary, secondary?, accent? }
fonts jsonb,         // { heading?, body? }
captionPresetId varchar(...),
locks jsonb,         // { colors: bool, fonts: bool }  (Phase-1 minimal set)
createdAt / updatedAt
index (tenantId, userId)
```
Advanced fields (motionPersonality/transitionStyle/musicStyle/ctaStyle/
cameraBehavior) are columns we add later — leave them out of the Phase-1
migration.

No new render-job table (uses `worker_jobs`), no motion-template table (code
registry §4), no claim-evidence table (reuses `marketplaceCaptureInsights`, §7).
`media_clip_index` is Phase 4 — not in this migration.

Migration hygiene: generate the `.sql` + journal entry, run
`drizzle-kit migrate`, confirm applied; if it fails, apply SQL manually + seed
the hash (per CLAUDE.md migration rules).

---

## 7. Product claim & compliance (Catalog Video Studio)

- The compiler-adjacent claim step reads a project's `document.claims[]`. In
  Catalog Video Studio those are seeded from
  `marketplaceCaptureInsights.claimResolutionsJson` + product fields (research
  A13) — the catalog is the source of truth; the generator prompt receives only
  resolved facts.
- A pure `validateProjectClaims(document, resolvedCatalog): ClaimValidationResult`
  computes the **deterministic** join: which narration/on-screen statements map
  to a claim record, and each claim's status. This computed fact is fed to the
  QA judge (§8) — the skill decides naturalness/prohibited-category judgment;
  TS never hardcodes the creative gate (skill-first rule, memory
  `feedback_skill_first_authoring`).
- `final` render is blocked when a `prohibited` claim or an unmapped product
  statement is present (`VI_CLAIM_VIOLATION`, spec §20). Motion Studio projects
  with no product source skip claim validation.
- Prices/promotions resolve from the latest product fields at generation time,
  stamped with `resolvedAt`.

---

## 8. QA loop (single round, MVP)

- New `apps/web/server/services/videoProjectQualityLoop.ts` mirroring the VD DI
  shape (research A10):
  ```
  runVideoProjectQualityLoop({ projectId, policy, initialReview, effects }): Promise<QualityLoopState>
  VideoProjectQualityLoopEffects = { runReview, repairStage, persistReview, recomputeMetrics }
  ```
  Phase 1 runs **one** review round (maxLoops defaulted to 1); the bounded
  auto-improve multi-round loop is Phase 3. Keep the effects interface identical
  so Phase 3 is a policy change, not a rewrite.
- Deterministic metrics fed INTO the review (never replacing judgment): per-scene
  duration vs narration length, caption chars/sec, layer counts, safe-area
  bounding-box checks, claim-source join coverage (§7), estimated render cost
  (§4.3). Pure functions, unit-tested.
- New skill folder `apps/web/skills/video-project-quality-review/` (skill.md +
  schemas). The judge rubric + prohibited-claim categories live in skill.md
  (skill-first); TS supplies facts only.
- `estimateVideoProjectQualityLoopCredits(perRound, maxRounds)` pure cost helper
  (research A10 template).
- Tests: DI-effect mocks (research B5) — single-round returns scorecard+issues;
  metric functions as input→output.

---

## 9. tRPC router + async jobs + render smoke harness

### 9.1 `apps/web/server/routers/videoProjects.ts` (spec §15)

All `protectedProcedure`, tenant+owner checks (research B4 / spec §17.1), Zod
input, rate limits (spec §18.5), gated by F133A.

- CRUD: `create`, `get`, `list`, `updateBrief`,
  `saveDocument({ projectId, baseRevision, document })` — validates the document,
  **optimistic concurrency**: reject with `CONFLICT` if `baseRevision !==` the
  current `video_projects.revision` (two-tab clobber guard, mirroring the
  presentation autosave precedent); on success bump revision + write a
  `video_project_revisions` row. `listRevisions`, `restoreRevision`, `delete`.
- Stage runners (async, §9.2): `runScenePlanStage`, `runNarrationStage` (TTS via
  `ttsService.synthesize` → stores narration audio as a `mediaAssets` row →
  sets `scene.narrationAudioAssetId`, **and deterministically populates
  `scene.captionCues`** from the narration text — chunk the text into
  caption-sized lines and time them proportionally across the scene's
  `[startMs,endMs]` so a narrated video ships with captions without an extra
  transcription round-trip; Whisper-based cue-timing refinement is deferred to
  Phase 2), `runQualityReview`, `applyQualityRepairs`.
- Approvals (Guided mode): `approveStage`, `rejectStage`.
- Captions: `exportCaptions({ projectId, format: "srt"|"vtt" })` → builds cues
  from the document's `captionCues` and returns text via the reused
  `renderTranscriptCuesAsSrt/Vtt` (research A11).
- Render: `compileProject` (resolves assets §9.1a → `compileVideoProject` →
  returns compiled config + cost, no side effects),
  `queueRender({ projectId, profile })` → resolves assets, compiles, derives
  `assetManifest` (§9.1a), calls `queueRemotionRenderVideoJob` → `{ workerJobId }`;
  for `profile:"preview"` it downscales the compiled config to ≤540×960 / fps≤15
  (spec §18.2) before queueing. `getRenderCostEstimate`. Status/detail/cancel
  reuse the existing `workerJobs` router — do NOT duplicate.
- Brand kits: `brandKits.{create,list,get,update,delete}` (own sub-router or
  namespaced procedures).
- Register the router in `server/routers.ts`.

### 9.1a Asset resolution + manifest (`videoProjectAssetResolver.ts`, new)

The compiler is pure, so the router resolves assets first:
```
resolveProjectAssets(document, auth): Promise<AssetResolver>
  // owner-checked lookups over mediaAssets (bigint id) + libraryItems (int id);
  // returns storage-proxy URLs (never raw external URLs, spec §17.3) + sha256 where known.

buildAssetManifest(config: RemotionTemplateConfig, resolver): AssetManifest
  // walks compiled layer `src` values + audio-track assets → { sources: [{role,url,sha256}] }
```
`queueRender` passes the resulting `assetManifest` into the job payload (§3.2) so
the worker pre-stages + checksum-verifies before launching Chromium (spec §6.2).

### 9.2 Async generation queue (spec §15.3)

New BullMQ queue `video_intelligence_jobs` following the
`vertical_drama_story_jobs` pattern (research; submit → `{jobId}` → poll
`getGenerationJobStatus`/`getActiveGenerationJob` → resume-on-mount). Long LLM/TTS
stages run here; the tRPC stage runners enqueue and return a jobId.

### 9.3 Render smoke harness (real render, not Vitest)

New `apps/web/scripts/video-intelligence-render-smoke.ts` (npm script), modeled
on `scripts/remotion-parity-test.ts` (research B7): synthesize a tiny fixture
project → compile → run the Lane-A render path end-to-end with real ffmpeg +
storage → ffprobe assertions → cleanup in `finally`. This is the Phase-1
"it really renders" gate; keep it out of the Vitest suite.

### 9.4 Observability & audit logging (spec §19 — MANDATORY per CLAUDE.md)

The repo's LLM & Media Debugging Protocol requires that render/media issues be
diagnosable from the audit log alone. A single `traceId` is minted when a project
stage or render is initiated and threaded through every event and the job payload
(`inputJson.traceId`, §3.2), so one grep reconstructs the whole flow.

- **Stage runners (section 07):** emit a `video_project_stage` audit-JSONL event
  (`{ stage, projectId, jobId?, traceId }`) at each stage start/finish; TTS and
  any image calls go through the existing `media_request`/`media_response` audit
  events (reuse the platform's audit logger — do not invent one). The scene-plan
  LLM call rides the normal provider-usage/audit path (OpenRouter primary).
- **Worker (section 04, Lane A):** emit `remotion_render.{queued,started,
  post_pass,completed,failed}` to `logs/audit/` JSONL **in addition to** the
  `worker_job_events` rows (the events drive the UI; the JSONL drives debugging),
  both carrying the same `traceId`. On failure, capture the ffmpeg/Remotion
  stderr tail in the event so a failed render is reproducible from the embedded
  compiled config (spec §19).
- **No secrets in any audit line** (CLAUDE.md secret-exposure rule): log ids and
  key names, never decrypted values or asset credentials.

---

## 10. Studios + UI (spec §16)

### 10.1 Feature flags (research A16)

Add to `shared/featureFlags.ts` (3 edits each): `videoIntelligencePlatformEnabled`
(F133A), `remotionRenderVideoJobEnabled` (F133B),
`videoIntelligenceCatalogStudioEnabled` (F133C),
`videoIntelligenceMotionStudioEnabled` (F133-motion). All default `false`.

### 10.2 Routes + pages

- `client/src/App.tsx`: lazy routes `/video-studio` (list+create) and
  `/video-studio/:id` (workspace), `RequireAuth`-gated + flag-gated.
- `VideoStudioListPage.tsx` — project list + "New from product" (Catalog) / "New
  blank project" (Motion) create actions.
- `VideoStudioWorkspacePage.tsx` — stage rail (Brief→Content→Narration→Scenes→
  Motion→Captions→QA→Render), per-stage panels, `@remotion/player` preview
  (renders `GenericTemplateComposition` from the compiled config — 2D only, no
  poster fallback needed this phase), QA scorecard panel, Preview/Final render
  buttons. Reuse Media Studio production-director layout + storyboard-review
  crop/drag-drop + presentation-editor property-panel patterns (do not reinvent —
  memory `feedback_reuse_existing_ui_patterns`).
- Catalog Video Studio create flow reads `marketplaceCapture.getProduct` /
  `listProductImages` / `listInsightsByProduct` (research A13) to seed
  `sourceRefs.productIds`, assets, and `document.claims`.
- Add `@remotion/player` to `apps/web/package.json` (verify company-scale
  license per spec §24 open question before shipping to prod).
- `RenderJobsPage.tsx`: optional Thai label "เรนเดอร์วิดีโอ Remotion" for the new
  jobType + progress uses the existing `sceneIndex/sceneTotal`↔`shotIndex/shotTotal`
  mapping (no structural change).
- i18n: Thai-first labels + English fallback (Feature 062 namespaces).

### 10.3 Sidebar

Add a "Video Studio" group (Catalog Video Studio, Motion Studio) in the existing
menu config; Production links point at existing `/render-jobs`, `/video-editor`,
Media History (no new render-queue UI).

---

## 11. Implementation sections (dependency-ordered)

1. **Schemas & audio layer** — `projectSchemas.ts`, `audio` variant + composition
   render, compiler (incl. caption-cue→text-layer) + brand-lock + cost model.
   (§2, §4.3)
2. **Motion Template Registry** — metadata + 10 layer_pack builders + registry
   guard + selection helper. (§4)
3. **Worker contract** — `shared/workerRuntime.ts` consts + schema + event-contract
   branch + golden fixtures/test. (§3)
4. **Queue + Lane A worker** — F133 feature flags (created here, §10.1),
   `queueRemotionRenderVideoJob` (+ render rate limit), dispatch branch,
   post-pass argv builders, staging reuse, audit-JSONL observability +
   1-render-per-process concurrency (§9.4). (§5)
5. **DB tables + Brand Kit** — migration for `video_projects`,
   `video_project_revisions`, `brand_kits`. (§6)
6. **Claim validation + QA loop** — `validateProjectClaims`,
   `videoProjectQualityLoop`, judge skill, metrics. (§7, §8)
7. **Router + async queue** — `videoProjects` router (+ CRUD rate limit,
   `traceId` + `video_project_stage` audit events §9.4), asset resolver +
   manifest builder (§9.1a), `video_intelligence_jobs` queue, TTS narration
   stage (+ caption-cue derivation), caption export, render smoke harness. (§9)
8. **Studios & UI** — flags, routes, list/workspace pages, Catalog + Motion
   flows, `@remotion/player` preview, sidebar. (§10)

Sections 1–3 are the foundation (no UI). 4–7 build the pipeline. 8 is the
surface. Within TDD, each section writes tests first per the tier in
`claude-research.md` Part B.

---

## 12. Reuse contract (do NOT rebuild — spec §2)

| Need | Reuse exactly | Never do |
|---|---|---|
| Composition engine | `executeRemotionRender`, `GenericTemplateComposition`, `RemotionTemplateConfigSchema` | fork the composition or its schema (only additive `audio` variant) |
| ffmpeg | `buildAssSubtitleFile`, `buildConcatFfmpegArgs`, `defaultFfmpegRunner`, factor `buildLoudnormPassArgs` | import private `buildAudioFilterGraph`; shell out ad-hoc |
| Worker fabric | `worker_jobs`, claim/event/artifact APIs, `RenderJobsPage`, `queueDesktop*` pattern, `assertRuntimeSpecificJobEventContract` branch | new job table / new render-queue UI / new claim API |
| TTS / subtitles | `ttsService.synthesize`, `renderTranscriptCuesAsVtt/Srt` | new TTS or subtitle engine |
| Catalog | `getMarketplaceProductWithAccess` + insights `claimResolutionsJson` | duplicate product tables |
| Storage / flags | `storagePutFromPath`, feature-flag 3-edit pattern | new storage layer |

---

## 13. Risks & mitigations

- **Mis-claim by a hyperframes-only worker** → non-empty capability families +
  claim-time assertion (§5.1). Test asserts the negative match.
- **Server⇄worker field drift** → shared Zod schema + golden fixtures (§3.4);
  Rust side asserts the same fixture in Phase 6.
- **Brand drift** → locks enforced at compile, deterministically (§2.3).
- **Over-40-layer configs** → compiler segment-split + concat (§2.3, §5.2).
- **@remotion/player license** at company scale → verify before prod (spec §24);
  fall back to poster+low-res preview render if blocked.
- **Migration data loss** → Database Safety Protocol (§6).
- **Scope creep into scene3d/Content/Review** → explicitly out of Phase 1 (§3 of
  claude-spec); flags keep everything off by default.
