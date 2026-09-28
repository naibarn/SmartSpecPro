# Feature 133 — Research Findings (Phase 1 MVP)

> Consolidates the codebase research that backs the plan. Big-picture ground
> truth already lives in the spec (`spec.md` §3, §3.5); this file adds the
> **exact signatures** the plan will call/extend and the **test conventions**
> the TDD plan will mirror. Every symbol below was verified in the repo on
> 2026-07-12. Deviation flags (⚠) mark places where the naming in the spec or
> the obvious guess is wrong — the plan MUST use the corrected form.

Repo root for all paths: `/home/dev/projects/SmartSpecPro/apps/web`.

---

## Part A — Reuse signatures (what Phase 1 imports / extends)

### A1. Remotion layer + template schema — `shared/remotion/layerTemplateSchemas.ts`

- `RemotionLayerSchema` = `z.discriminatedUnion("type", [...])`, exported. Base
  fields (on every variant): `id (1..128)`, `startFrame (int≥0)`,
  `durationFrames (int≥1)`, `x/y/width/height (0..100 percent)`,
  `rotationDeg (=0)`, `opacity (0..1 =1)`, `zIndex (int =0)`.
- Variants (all `.strict()`): `image {src url≤4096, fit cover|contain|fill}`,
  `video {src, trimStartSec≥0, volume 0..1, muted}`,
  `text {content≤2000, fontFamily=Inter, fontSizePx>0..1000, color, textAlign, fontWeight}`,
  `svg {markup≤20000 refine isSafeInlineSvgMarkup, animation none|fadeIn|drawPath|pulse}`,
  `motionGraphic {shape circle|rect|triangle|star, color, loopAnimation spin|pulse|bounce|none}`,
  `scene3d {sceneId z.enum(REMOTION_SCENE_IDS), props record(str|num|bool)}`.
- `isSafeInlineSvgMarkup(markup: string): boolean` — rejects `<script`, `on*=`,
  `javascript:`.
- `RemotionTemplateConfigSchema` (exported `.strict()`): `id, name, width
  320..4096 =1080, height 320..4096 =1920, fps 12..60 =30, durationInFrames
  int≥1, layers: RemotionLayer[].max(40)`.
- Exported types: `RemotionLayer`, per-variant layer types, `RemotionTemplateConfig`.
- ⚠ `REMOTION_SCENE_IDS` is NOT here — it's in
  `shared/remotion/sceneRegistryIds.ts` (`["orbiting-product"] as const` +
  type `RemotionSceneId`).
- ⚠ `buildGenericTemplateInputProps(config): GenericTemplateInputProps` is NOT
  here — it's in `server/services/remotionTemplateService.ts:25`
  (`GenericTemplateInputProps extends RemotionTemplateConfig` + index sig).

**Phase 1 impact:** the new `audio` layer type (spec §5.3) is added here as an
additive discriminated-union member; the compiler emits `RemotionTemplateConfig`
which is exactly this schema (frozen contract). Adding `audio` must keep every
existing variant test green.

### A2. Render adapter — `server/services/remotionRuntimeAdapter.ts`

- `executeRemotionRender(input: VideoRenderInput): Promise<VideoRenderResult>`
  (exported) — branches: `input.payload.remotionTemplate` object →
  GenericTemplate path; else final-composite path. **This is the single entry
  the Phase-1 worker calls.**
- ⚠ `executeGenericTemplateRender` and `getBundleLocation` are **private** — do
  not import; go through `executeRemotionRender`.
- Internally: `RemotionTemplateConfigSchema.parse(payload.remotionTemplate)` →
  `buildGenericTemplateInputProps` → `selectComposition({id:
  GENERIC_TEMPLATE_COMPOSITION_ID, ...})` → `renderMedia({codec:"h264",
  outputLocation})`.
- Exported staging helpers (reusable): `stageRemotionShotSourceVideos`,
  `startLocalAssetServer(rootDir): {port, close}`,
  `rewriteStagedShotUrlsToLocalServer`, `resolveAndStageRenderFont`,
  `resolveRemotionBrowserExecutable`.

### A3. Render engine contract — `server/services/videoRenderer.ts`

- `VideoRenderInput = { workspace, outputPath, payload: Record<string,unknown>,
  env? }`; `VideoRenderResult = { engine, outputPath, inputPath, result }`.
- `resolveVideoRenderEngine({tenantId?, env?}): Promise<VideoRenderEngine>`
  (default `"remotion"`).
- `executeVideoRender(engine, input): Promise<VideoRenderResult|null>` — catches
  `UnsupportedPresetError`, falls back to HyperFrames. **Phase-1 note:** the
  `remotion_render_video` path is Remotion-native and must NOT reuse this
  fallback wrapper for its own dispatch (it calls `executeRemotionRender`
  directly); `executeVideoRender` stays the marketplace path.

### A4. Composition ids — `server/remotion/Root.tsx`

- `GENERIC_TEMPLATE_COMPOSITION_ID = "GenericTemplate"`,
  `MARKETPLACE_AUTO_REVIEW_COMPOSITION_ID = "MarketplaceAutoReview"`.
- `calculateMetadata` returns width/height/fps/durationInFrames straight from
  validated inputProps — so the compiled config's dimensions are authoritative.

### A5. Worker runtime contracts — `shared/workerRuntime.ts`

- `WORKER_RUNTIME_PROTOCOL_VERSION = "2026-04-06"` (exact-match gate).
- `hyperframesFinalCompositeWorkerInputSchema` = `z.object({...}).superRefine`
  — the template to mirror for `remotionRenderVideoWorkerInputSchema`. Carries
  `templateVersion/platformContractVersion/rendererPolicyVersion/runtimeProfileId`
  (str 1..120), stable hashes, `assetManifest`, `outputRequirements`.
- `HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES =
  ["hyperframes-final-composite","official-hyperframes-runtime","browser-render","thai-fonts","ffmpeg-probe"]`.
- `HYPERFRAMES_FINAL_COMPOSITE_PROGRESS_STAGES =
  ["resolve_inputs","stage_assets","doctor_runtime","build_composition","render_browser_css","verify_outputs","upload_artifacts","server_verify_artifacts","publish_artifacts"]`.
- Failure codes: `HYPERFRAMES_FINAL_COMPOSITE_FAILURE_CODES` (12 values incl.
  `render_failed`, `artifact_upload_failed`, `server_verification_failed`).
- ⚠ **No central per-jobType registry map.** Each jobType has its own exported
  Zod schema + `*_PROGRESS_STAGES`/`*_FAILURE_CODES` const arrays
  (`videoAssemblyJobContractSchema`, `localFolderIngestJobContractSchema`,
  `comfyImageGenerationJobContractSchema`, `comfyWorkflowRunJobContractSchema`,
  `localAiWorkerJobContractSchema`). Dispatch is by ternary/switch in the
  consumer. → Phase 1 adds `remotionRenderVideoWorkerInputSchema` +
  `REMOTION_RENDER_VIDEO_{PROGRESS_STAGES,FAILURE_CODES,CAPABILITY_FAMILIES}`
  here, then wires them into the consumer's ternary (A7).
- `minVersion` helper `isVersionWithinWindow` is **private**.

### A6. Job creation — `server/services/workerSchedulerService.ts`

- ⚠ `DESKTOP_RUNTIME_TYPE = "desktop_zeroclaw_managed"` is a **private module
  const** — the new queue fn lives in this same file so it can use it.
- `queueDesktopHyperframesFinalCompositeJob(rawInput, deps?): Promise<{created,
  job}>` — the exact template for `queueRemotionRenderVideoJob`. Flow: parse
  input schema → idempotency check → preferred-worker compat → reserve credits
  → `repo.insertJob({tenantId, runtimeType: DESKTOP_RUNTIME_TYPE, jobType,
  status:"queued", priority ?? 30, resourceProfile:"cpu_heavy",
  capabilityRequirementsJson:{capabilityFamilies, ...},
  inputJson: input, instructionsJson:{requiredProgressStages,...},
  timeoutSeconds ?? 7200, retryPolicyJson:{maxAttempts:2, backoffSeconds:120},
  idempotencyKey})`.
- `WorkerSchedulerRepository = {findJobByIdempotencyKey, findWorkerById,
  insertJob}`.
- `workerJobMatchesSelection(job, workerId, capabilityHints): boolean` — the
  gate; returns `true` when the job declares no capability families (why §6.3
  requires a non-empty family list).
- `isDesktopWorkerDispatchEnabled(): boolean` (env
  `DESKTOP_ZEROCLAW_WORKER_DISPATCH_ENABLED !== "false"`).
- ⚠ `reserveWorkerJobCredits(input:{userId, tenantId?, requestedCredits?,
  metadata?}, deps?): Promise<{reservationId, reservedCredits, sourceType}>`
  lives in `server/services/workerBillingService.ts:62`, not here.

### A7. Event/artifact contract enforcement — `server/services/workerRegistryService.ts`

- ⚠ `assertRuntimeSpecificJobEventContract(job, payload): void` is **private**.
  Structure: ternary on `job.jobType` → selects `{progressStages,failureCodes}`
  (branches for `video_assembly`, `local_folder_ingest`,
  `comfy_image_generation`, `comfy_workflow_run`, `hyperframes_final_composite`,
  else `null`). Called from `recordWorkerJobEvent`. **Add a
  `remotion_render_video` branch here** wiring the new enums (A5).
- `initWorkerArtifactUpload({auth, jobId, payload}, deps?): Promise<{key,
  method, storageRef, uploadUrl}>`.
- `completeWorkerArtifact({auth, jobId, payload}, deps?): Promise<{artifact,
  created}>`.
- ⚠ `buildArtifactStorageRef(jobId, auth, payload): string` is **private** —
  key layout `worker-artifacts/${tenantId}/${jobId}/${sha256(basis).slice(0,24)}-${sanitizedFileName}`.

### A8. Server worker dispatch — `server/workers/hyperframesRenderWorker.ts`

- ⚠ `HYPERFRAMES_WORKER_JOB_TYPES` is a **private module const**; dispatch is in
  private `executeHyperframesWorkerJob` (switch → `executeLocalHyperframesSmokeRender`
  for render/finalize, else `buildCompletedHyperframesStagePayload`).
- `executeLocalHyperframesSmokeRender({tenantId?, runId, renderJobId, payload,
  runtimeEnv?}): Promise<Record<string,unknown>>` (exported) — creates temp
  workspace, `resolveVideoRenderEngine` → `executeVideoRender`. **Phase-1
  Lane-A pattern:** add a `remotion_render_video` branch that instead calls
  `executeRemotionRender` directly (Remotion-native, no engine resolution) and
  runs post-passes.

### A9. FFmpeg builders (reuse for post-passes) — `server/services/verticalDramaFinalRenderGraph.ts` + `verticalDramaEpisodeVideoAssembly.ts`

- ⚠ `buildAudioFilterGraph(dialogueAudio?, dialogueInputIndexStart): {fragments,
  mapLabel}` is **private**. loudnorm branch:
  `loudnorm=I=-16:TP=-1.5:LRA=11`. → Phase 1 must either export it or factor a
  small pure `buildLoudnormPassArgs(input,output)` in the new service that
  reuses the same filter string (plan chooses: factor a dedicated pure helper
  to avoid widening the VD module's surface).
- `buildAssSubtitleFile(lines, preset, opts, overlays?): string` (exported) —
  reusable for the optional ASS burn post-pass.
- `FfmpegRunner = (args: string[]) => Promise<{code, stderr}>`;
  `defaultFfmpegRunner` (exported) — the injectable seam for post-pass tests.
- `buildConcatFfmpegArgs(spec): string[]` (exported) — reuse for segmentPlan
  concat.
- `probeDurationSeconds(filePath): Promise<number|undefined>`,
  `downloadClipToFile(url, dest, internalBaseUrl)`, `resolveFfBinary`,
  `isFfmpegAvailable` (all exported).

### A10. QA loop DI — `server/services/verticalDramaQualityLoop.ts`

- `runVerticalDramaQualityLoop({episodeId, policy, initialReview, effects,
  tieInEnabled?, storyLockEnabled?}): Promise<...State>`.
- `VerticalDramaQualityLoopEffects = {runReview, repairStage, persistReview,
  recomputeDensityMetrics}` — the DI shape Phase 1's `videoProjectQualityLoop`
  mirrors (single-round in MVP, same effect names).
- `estimateVerticalDramaQualityLoopCredits(perRound, maxRounds): number`
  (exported) — cost-model template.

### A11. Subtitle export — `server/services/hyperframesTranscriptionService.ts`

- `renderTranscriptCuesAsVtt(cues): string`, `renderTranscriptCuesAsSrt(cues):
  string`; `HyperframesTranscriptCue = {index, text, start, end}`. Reuse for
  the caption-cue → SRT/VTT export (spec §5.5).

### A12. TTS — `server/services/ttsService.ts`

- `synthesize(text, {format mp3|pcm16|wav, voice?, speed?, provider?
  elevenlabs|openai|omnivoice, instruct?, referenceAudio*?}): Promise<{audioBuffer,
  contentType, duration}>` (default provider openai, voice alloy, MAX_TTS_CHARS
  5000). `calculateTTSCredits(chars): number` = `max(1, ceil(chars/1000*5))`.

### A13. Marketplace product read (Catalog Video Studio source of truth)

- tRPC (`server/routers/marketplaceCapture.ts`, all protected): `getProduct`,
  `listProductImages`, `listInsightsByProduct`.
- Services: `getMarketplaceProductWithAccess(productId, {userId, tenantId?})`
  → `{product, accessType, groupShare}`;
  `listMarketplaceProductImagesForMediaStudio(auth, options?)`;
  `listMarketplaceInsightsByProduct(productId, auth)`.
- Columns (`marketplaceProducts`, PK `id varchar(64)`): `productName` (NN),
  `brand`, `priceCurrent numeric(12,2)`, `priceOriginal`, `currency varchar(16)
  ="THB"`, `discountText`, `descriptionText`, `descriptionJson jsonb`,
  `specsJson jsonb`, `coverImageAssetId`, `platform`, `affiliateUrl`.
- `marketplaceProductImages`: `productId` (NN FK), `url` (NN), `storageKey`,
  `sortOrder`, `width`, `height`.
- `marketplaceCaptureInsights`: `productId` FK, `payloadJson` (NN),
  `storytellingReadiness`, `claimResolutionsJson jsonb $type<unknown[]> =[]` —
  the claim-evidence backbone (spec §11).

### A14. DB schema conventions — `drizzle/schema.ts`

- New table style: `pgTable("snake_name", {cols}, t => [indexes/checks])`.
  jsonb-heavy exemplar `verticalDramaEpisodes` (id `bigserial mode:number`,
  `tenantId varchar(36) NN`, `userId integer NN references(users.id)`, status
  `varchar(30)`, many `jsonb(...)` payload cols).
- FK targets: `libraryItems.id` = `serial` (integer!); `mediaAssets.id` =
  `bigserial mode:number`. → `video_projects.resultLibraryItemId` is integer;
  media-asset FKs are bigint.
- Migration: `drizzle/NNNN_*.sql` + `drizzle/meta/_journal.json` +
  `NNNN_snapshot.json`. Repo convention: additive nullable jsonb sometimes via
  hand-authored `manual_*.sql` first. **Follow Database Safety Protocol**:
  backup affected tables, `pnpm db:push`, verify row counts.

### A15. Storage — `server/storage.ts` (⚠ NOT `server/services/storage.ts`)

- `storagePutFromPath(relKey, sourcePath, contentType?): Promise<{key, url}>`.
- `storagePresignPut(relKey, contentType, contentLength, expiresIn?):
  Promise<{url,key}|null>` — ⚠ returns `null` unless provider is `s3`; on R2 the
  worker uses the server-upload fallback. Lane A (in-process) can call
  `storagePutFromPath` directly.

### A16. Feature flag pattern — `shared/featureFlags.ts`

Three coordinated edits per flag (template pair:
`marketplaceRemotionRendererEnabled` / `marketplaceHyperframesRendererForced`):
(1) add field to `interface TenantFeatureFlags`; (2) add key to
`ALLOWED_FEATURE_FLAGS` set; (3) add `flag: false` to `FEATURE_FLAG_DEFAULTS`.
Default-off flags flow into curated sub-lists automatically.

---

## Part B — Test conventions (TDD stubs mirror these)

### B1. Runner & invocation

- Vitest (`vitest run`), v8 coverage, **no enforced thresholds** (coverage is
  informational — write one `it` per branch, assert exact call-counts/key-sets).
- Config `apps/web/vitest.config.ts`: node env for `server/**`, `shared/**`,
  `scripts/**`, `drizzle/**`; jsdom only for `client/src/**/*.test.tsx`. Aliases
  `@/ @shared @db @assets`.
- Single test: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx
  vitest run <path> -t "<name>"`. `pnpm check` = `tsc --noEmit` (type-level
  contracts count as tests).

### B2. Pure-service / schema tests (compiler, layer_pack templates, cost model)

Plain `import {describe, expect, it} from "vitest"`, no mocking. Local
`buildX(overrides)` builders that call `Schema.parse(...)` inside (round-trip
assertion); negatives via `expect(() => schema.parse(bad)).toThrow()` or
`.safeParse().success`. Exemplars: `remotionTemplateService.test.ts`,
`workpackCompilerService.test.ts` (compiler+safety-gate — closest model, uses
`beforeEach(resetStore)` + asserts on compiled plan + a safety predicate).

### B3. FFmpeg-argv tests (post-passes)

**Never execute ffmpeg** — factor argv construction into a pure `build...Args():
string[]` and assert on the array: byte-identical no-op lock
`expect(newBuilder(x)).toEqual(legacyBuilder(x))`, argv slices, `-filter_complex`
substring/order via `indexOf`, `-map` target indices, validation issue lists
`toContainEqual(objectContaining({code, severity}))`. Exemplar:
`verticalDramaFinalRenderGraph.test.ts`.

### B4. tRPC router tests (mocked db + ctx)

`vi.mock("../../_core/trpc")` so `protectedProcedure.query(fn)` returns `fn`;
call handlers directly with a local `ctx()` factory (`{tenantId, user:{id}, ...}`);
`vi.mock("../../db")` with `vi.fn()` select/insert/update returning thenable
chain helpers; assert **exact `db.select` call counts** (e.g. "0 extra queries
when flag off"); stub `requireFeatureFlag` + `getTenantFeatureFlags`; errors via
`.rejects.toMatchObject({code, message: stringContaining("VI_...")})`. Exemplar:
`verticalDramaEpisodes.textOverlayPlan.test.ts`; worker-domain refs
`workerJobMonitorService.test.ts`, `workerArtifactService.test.ts`.

### B5. QA-loop DI-effects tests

Inject `effects` object of `vi.fn()`s (`runReview/repairStage/persistReview/
recomputeDensityMetrics`); drive rounds with `mockResolvedValueOnce`; assert
call counts, `mock.calls[i][arg]` ordering, exact result key-set; pair a
`tsc`/typecheck guarantee that no media-effect member exists. Cost model =
plain `expect(fn(a,b)).toBe(n)` incl. clamping. Exemplar:
`verticalDramaQualityLoop.test.ts`.

### B6. Contract / golden-fixture tests (the server⇄worker mismatch guard)

JSON fixtures in `__fixtures__/` beside the test, loaded via
`readFixture(name)` (`fs.readFileSync` + `JSON.parse`). Valid fixture →
`schema.safeParse` success + field checks; invalid → failure + stable error
code; determinism via `JSON.stringify(normalize(x)) === JSON.stringify(normalize(x))`.
No `toMatchSnapshot` — explicit `.toEqual`. Exemplar:
`shared/presentation/contracts.test.ts` + `shared/presentation/__fixtures__/`.
**Phase 1:** put `remotionRenderVideoWorkerInput` golden JSON in
`shared/__fixtures__/` (or beside the contract test), asserted by the TS schema
test now; the Rust parse test is added with Lane B (Phase 6).

### B7. Integration tests (real db / real render)

- Real-DB: opt-in, gated by `RUN_DB_INTEGRATION_TESTS === "true"`,
  `*.integration.test.ts`, `describeDbSuite = flag ? describe : describe.skip`,
  `resolveTestDatabaseUrl()` guard (db name must match `/(test|ci)/`). Run via
  `pnpm test:db-integration`.
- Real render (ffmpeg/ffprobe + storage): **script-harness only**, not Vitest —
  model on `scripts/remotion-parity-test.ts` (`pnpm remotion:parity-test`,
  tsx). Phase 1's "real render smoke" is a script fixture, not a unit test.

---

## Part C — Cross-cutting notes for the plan

1. **Lane A is in-process** — it need not use the HTTP artifact API; it can
   write artifacts via the existing smoke-render return path +
   `storagePutFromPath`. The contract (event stages, failure codes, artifact
   types) is still emitted so Lane B (Phase 6) is drop-in. Golden fixtures lock
   the payload shape now.
2. **Private helpers** (`buildAudioFilterGraph`, `assertRuntimeSpecificJobEventContract`,
   `buildArtifactStorageRef`, `DESKTOP_RUNTIME_TYPE`, `HYPERFRAMES_WORKER_JOB_TYPES`)
   mean the new code either lives in the same file (schedule/registry/worker
   branches) or factors a fresh pure helper (loudnorm) — the plan must not
   import them cross-module.
3. **No central jobType registry** → the new contract is a set of exported
   consts in `shared/workerRuntime.ts` + a consumer ternary branch; mirror the
   `comfy_*` precedent exactly.
4. **DB FK types**: `libraryItems.id` integer, `mediaAssets.id` bigint — get
   the column types right in `video_projects`.
5. **Reuse-first (spec §2)**: do not touch the frozen `RemotionTemplateConfig`
   contract except the additive `audio` variant; do not rebuild ffmpeg
   builders, TTS, transcription, or the worker fabric.
