# Feature 133 — TDD Plan (Phase 1)

Mirrors `claude-plan.md` section-by-section with the tests to write **first**.
Conventions are fixed by `claude-research.md` Part B (Vitest; node env for
`server/**`/`shared/**`; run single test with
`JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run <path> -t "<name>"`).
No enforced coverage gate — write one `it` per branch, assert exact
call-counts/key-sets. Real ffmpeg/storage lives only in the script harness, never
Vitest.

Test-tier legend: **PURE** (no mocks, `Schema.parse` builders), **ARGV**
(pure argv assertions, never execute ffmpeg), **DI** (injected effects object of
`vi.fn()`), **TRPC** (mocked `_core/trpc` + mocked `db` chain + `ctx()` factory),
**FIX** (JSON golden fixtures in `__fixtures__/`), **HARNESS** (tsx script,
real deps).

---

## Section 1 — Schemas, audio layer, compiler

`shared/videoIntelligence/__tests__/projectSchemas.test.ts` — **PURE/FIX**
```
it("parses a minimal valid VideoProjectDocument")
it("rejects a document with zero scenes")
it("rejects an unknown platformPreset")
it("accepts scene layers that reuse RemotionLayerSchema variants")
it("round-trips a golden fixture deterministically")  // normalize() stability
```

`shared/remotion/__tests__/layerTemplateSchemas.audio.test.ts` — **PURE**
```
it("parses the new audio layer variant with defaults")
it("rejects audio.volume outside 0..1")
it("still parses every pre-existing layer variant")  // regression: no break
```
(Existing `remotionTemplateService.test.ts` must stay green — run it.)

`server/services/__tests__/videoProjectCompiler.test.ts` — **PURE**
```
it("compiles a single-scene layers document to a schema-valid RemotionTemplateConfig")
it("expands a template scene via the registry into layers")
it("emits caption text layers from captionCues when burnIn is false")
it("skips caption text layers when captions.burnIn is true")   // → ass_burn path
it("offsets scene-relative startFrame to absolute frames")
it("emits audio layers from audioTracks (narration/music/sfx)")
it("splits into segmented parts when >40 layers")
it("throws VideoProjectCompileError on an unknown templateId")
it("throws on an unresolved asset reference")
it("throws BrandLockViolationError when a locked color is violated")
it("passes brand tokens through when not locked")
it("output always validates against RemotionTemplateConfigSchema")
```

`server/remotion/__tests__/genericTemplateComposition.audio.test.tsx` — jsdom
(only if a render-shape assertion is feasible without a real browser; otherwise
cover audio via `remotionTemplateService` inputProps passthrough).

---

## Section 2 — Motion Template Registry

`server/remotion/templates/__tests__/registry.test.ts` — **PURE**
```
it("registry keys exactly match MOTION_TEMPLATE_IDS")   // assertRegistryMatchesIds
it("every template declares a strict paramsSchema and brandTokens")
```
Per-template (one file each, e.g. `product_hero.test.ts`) — **PURE**
```
it("builds only whitelisted layer types")               // no scene3d in Phase 1
it("respects maxItems / duration bounds")
it("consumes brand tokens from ctx.brandKit")
it("rejects invalid params via paramsSchema")
```
`shared/videoIntelligence/__tests__/cost.test.ts` — **PURE**
```
it("scores cost = Σ layers × frames × class-weight")
it("flags recommendPreRender only above budget")
it("clamps/handles empty layer sets")
```
`selectTemplatesFor` — **PURE**: filters by category/duration/aspect; returns []
on no match.

---

## Section 3 — Worker contract + golden fixtures

`shared/__tests__/remotionRenderVideoWorkerInput.test.ts` — **FIX/PURE**
```
it("accepts remotionRenderVideoWorkerInput-valid.json")               // safeParse success + field checks
it("rejects remotionRenderVideoWorkerInput-invalid.json with a stable error")
it("embeds a schema-valid RemotionTemplateConfig")
it("requires a non-empty capabilityFamilies-relevant contract (compositionId literal)")
it("normalizes deterministically")                                    // JSON.stringify(normalize) stable
```
Fixtures live in `shared/__fixtures__/`. (Rust parse test = Phase 6; the JSON is
the shared anchor.)

`server/services/__tests__/assertRuntimeSpecificJobEventContract.remotion.test.ts`
— **PURE** (call the consumer path, or a thin exported test seam)
```
it("accepts a progress event whose stage ∈ REMOTION_RENDER_VIDEO_PROGRESS_STAGES")
it("rejects an off-contract stage")
it("accepts a failure event whose code ∈ REMOTION_RENDER_VIDEO_FAILURE_CODES")
it("rejects a blanket/unknown failure code")
```

---

## Section 4 — Queue + Lane A worker

`server/services/__tests__/queueRemotionRenderVideoJob.test.ts` — **TRPC-style
mocked repo/deps**
```
it("parses input and inserts a job with jobType=remotion_render_video")
it("sets capabilityFamilies=REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES (non-empty)")
it("a hyperframes-only worker's hints do NOT match this job")   // workerJobMatchesSelection false
it("a remotion-render worker's hints DO match")
it("reserves credits before insert")
it("is idempotent on (projectId,revision,profile)")
it("rejects a second queued preview for the same user")         // preview cap
it("prioritizes final (40) over preview (20)")
```

Post-pass argv — **ARGV**
`server/services/__tests__/remotionPostPassArgs.test.ts`
```
it("buildLoudnormPassArgs emits loudnorm=I=-16:TP=-1.5:LRA=11")
it("ass_burn argv references the built .ass file and subtitle filter")
it("segment_concat reuses buildConcatFfmpegArgs for the segmentPlan")
it("no post-passes → passthrough (no ffmpeg args)")             // no-op lock
```

Lane A stage sequence — **DI** (inject `FfmpegRunner` + stub `executeRemotionRender`)
`server/workers/__tests__/remotionRenderVideoDispatch.test.ts`
```
it("emits progress events in REMOTION_RENDER_VIDEO_PROGRESS_STAGES order")
it("fails with contract_version_unsupported on an unknown platformContractVersion")
it("fails with a specific failure code (never blanket render_failed) on render error")
it("runs declared postPasses in order via the injected runner")
it("produces a remotion_render_mp4 artifact descriptor")
```

---

## Section 5 — DB tables + Brand Kit

`server/services/__tests__/videoProjectRepo.test.ts` — **TRPC-style mocked db**
```
it("inserts a video_projects row scoped to tenant+user")
it("writes a video_project_revisions row on saveDocument")
it("restoreRevision copies document back and bumps revision")
```
Migration is validated by the Database Safety Protocol steps (backup → push →
row-count verify), not a Vitest test. Optionally an opt-in
`*.integration.test.ts` (gated by `RUN_DB_INTEGRATION_TESTS`) round-trips a
`video_projects` insert/select against the guarded test DB (research B7).

Brand-kit lock enforcement is covered by the compiler test (Section 1).

---

## Section 6 — Claim validation + QA loop

`server/services/__tests__/validateProjectClaims.test.ts` — **PURE**
```
it("maps narration statements to claim records")
it("flags an unmapped product statement")
it("flags a prohibited claim")
it("returns empty result for a catalog-less (Motion) project")
```
`server/services/__tests__/videoProjectQualityLoop.test.ts` — **DI**
```
it("runs exactly one review round in MVP (maxLoops=1)")
it("returns scorecard + issues with an exact key-set")
it("passes deterministic metrics into runReview")
it("persists the review via the injected effect")
```
Metrics helpers (duration-vs-narration, caption cps, safe-area, claim coverage)
— **PURE** input→output, incl. edge/empty. Cost helper — **PURE**
`expect(estimate(x,y)).toBe(n)`.

---

## Section 7 — Router + async queue + harness

`server/routers/__tests__/videoProjects.crud.test.ts` — **TRPC**
```
it("create/get/list are tenant+owner scoped")
it("saveDocument rejects a stale baseRevision with CONFLICT")
it("saveDocument bumps revision and writes a revision row")
it("emits zero extra db.select when a flag is off")        // exact call-count lock
it("delete is owner-checked")
```
`server/routers/__tests__/videoProjects.render.test.ts` — **TRPC**
```
it("compileProject returns config + cost with no side effects")
it("queueRender(preview) downscales to ≤540×960/fps≤15 before queueing")
it("queueRender wires assetManifest from buildAssetManifest into the payload")
it("exportCaptions returns SRT and VTT via the reused renderers")
```
`server/services/__tests__/videoProjectAssetResolver.test.ts` — **TRPC-style
mocked db**
```
it("resolves mediaAssets/libraryItems ids to storage-proxy URLs")
it("refuses a foreign-tenant asset")                       // owner check
it("buildAssetManifest walks layer src + audio assets")
```
Narration stage: mock `ttsService.synthesize`; assert it stores a mediaAssets row
and sets `scene.narrationAudioAssetId`.
`video_intelligence_jobs` queue: unit-test the submit→jobId→status contract with a
mocked queue (mirror VD story-jobs tests).

Render smoke — **HARNESS** `scripts/video-intelligence-render-smoke.ts`
(`pnpm` script): synthesize fixture project → compile → real Lane-A render →
ffprobe asserts duration/resolution/audio-track presence → cleanup in `finally`.
Not part of `pnpm test`.

---

## Section 8 — Studios & UI

Client tests (jsdom, `client/src/**/*.test.tsx`) — keep light in Phase 1:
```
VideoStudioListPage: renders create actions gated by flags
VideoStudioWorkspacePage: stage rail advances; render button calls queueRender
@remotion/player preview: mounts GenericTemplateComposition from a compiled config
```
`RenderJobsPage`: a test asserting the new jobType renders with its Thai label and
`sceneIndex/sceneTotal` progress mapping.

E2E (Playwright, existing harness): one happy-path — Catalog Video Studio → render
→ `/render-jobs` completed row → library item. Runs in the E2E suite, not unit.

---

## Cross-cutting test rules

- Every new `db` query path is asserted with exact `db.select`/`insert` call
  counts (research B4) — locks "no extra queries when flag off".
- Every new failure path asserts a **specific** error/failure code, never a
  blanket one.
- `pnpm check` (tsc) is part of the gate — type-level contracts (e.g. the QA
  effects interface having no media-generation member) count as tests.
- Run the full existing suite after each section; the frozen contracts
  (RemotionTemplateConfig, VD render graph, worker domain) must stay green.
