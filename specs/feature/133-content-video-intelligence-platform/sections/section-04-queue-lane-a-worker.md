# section-04-queue-lane-a-worker — Queue Function + Lane A In-Process Render Worker

> Phase 1 / MVP. Source of truth: `../claude-plan.md` §5 (+ §12 reuse table, §13
> risks), `../claude-plan-tdd.md` Section 4, `../claude-research.md` Part A
> (A2, A5, A6, A7, A8, A9, A15) + Part C. Work directory root for all code:
> `/home/dev/projects/SmartSpecPro/apps/web`. Follow the repo TDD protocol
> (tests first) and run the full existing suite after the section.

## 1. Purpose and scope

This section wires the `remotion_render_video` job type into the **existing worker
fabric** so a compiled `RemotionTemplateConfig` becomes a durable render job that
executes **in-process on the server (Lane A)** and surfaces automatically on
`/render-jobs`. It delivers three things:

1. `queueRemotionRenderVideoJob(...)` — the enqueue function (capability gating,
   preview-concurrency cap, credit reservation, idempotency) added to the
   **existing** `server/services/workerSchedulerService.ts`.
2. A `remotion_render_video` **dispatch branch** in the **existing**
   `server/workers/hyperframesRenderWorker.ts` that calls `executeRemotionRender`
   directly (Remotion-native — it does NOT go through the HyperFrames fallback
   wrapper), emits the per-stage progress contract, runs post-passes, verifies the
   output, and writes the artifact.
3. Pure ffmpeg **argv builders** for the post-passes (`buildLoudnormPassArgs` +
   reuse of `buildAssSubtitleFile` / `buildConcatFfmpegArgs`).

**Out of scope here** (owned by other sections, referenced only): the neutral
schema + compiler + `audio` layer (section-01); the worker **contract constants +
Zod schema + event-contract branch + golden fixtures** (section-03); the DB
tables (section-05); the tRPC router, asset resolver, `buildAssetManifest`, the
`video_intelligence_jobs` queue, and the render smoke **harness script**
(section-07). The `queueRemotionRenderVideoJob` function is authored here but is
**called by** `videoProjects.queueRender` in section-07.

## 2. Dependencies and what they hand this section

- **section-01** provides `compileVideoProject(...)`, `RemotionTemplateConfig`,
  and the additive `audio` layer. This section never calls the compiler directly
  (section-07 does); it consumes an already-compiled `RemotionTemplateConfig`
  embedded in the job payload.
- **section-03** provides, in `apps/web/shared/workerRuntime.ts`:
  - `remotionRenderVideoWorkerInputSchema` (Zod `.strict()`) +
    `RemotionRenderVideoWorkerInput` (inferred type).
  - `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES`,
    `REMOTION_RENDER_VIDEO_PROGRESS_STAGES`,
    `REMOTION_RENDER_VIDEO_FAILURE_CODES`,
    `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`,
    `REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION`.
  - The `remotion_render_video` branch in
    `assertRuntimeSpecificJobEventContract` (so events emitted below are
    contract-checked when recorded).

**Do not re-declare any of the above.** Import them from
`../../shared/workerRuntime` (server) exactly as the sibling `hyperframes_*`
consts are imported. If section-03 is not yet merged when you start, stub the
imports against the names above — they are frozen by section-03's fixtures.

## 3. Reuse map (exact signatures — do NOT rebuild)

All verified in the repo on 2026-07-12 (research Part A). Private symbols must NOT
be imported cross-module — the new code lives in the same file (scheduler / worker
branches) or factors a fresh pure helper.

| Need | Reuse (exported unless noted) | File |
|---|---|---|
| Render entry | `executeRemotionRender(input: VideoRenderInput): Promise<VideoRenderResult>` — branches to GenericTemplate when `input.payload.remotionTemplate` is an object | `server/services/remotionRuntimeAdapter.ts` |
| Asset staging | `stageRemotionShotSourceVideos`, `startLocalAssetServer(rootDir): {port, close}`, `rewriteStagedShotUrlsToLocalServer`, `resolveAndStageRenderFont`, `resolveRemotionBrowserExecutable` | `server/services/remotionRuntimeAdapter.ts` |
| Render input/result types | `VideoRenderInput = { workspace, outputPath, payload: Record<string,unknown>, env? }`; `VideoRenderResult = { engine, outputPath, inputPath, result }` | `server/services/videoRenderer.ts` |
| Composition id | `GENERIC_TEMPLATE_COMPOSITION_ID = "GenericTemplate"` | `server/remotion/Root.tsx` |
| Job creation template | `queueDesktopHyperframesFinalCompositeJob(rawInput, deps?)`; `WorkerSchedulerRepository = {findJobByIdempotencyKey, findWorkerById, insertJob}`; `workerJobMatchesSelection(job, workerId, capabilityHints)`; `isDesktopWorkerDispatchEnabled()`; **private** `DESKTOP_RUNTIME_TYPE = "desktop_zeroclaw_managed"` (same-file) | `server/services/workerSchedulerService.ts` |
| Credits | `reserveWorkerJobCredits(input:{userId, tenantId?, requestedCredits?, metadata?}, deps?): Promise<{reservationId, reservedCredits, sourceType}>` | `server/services/workerBillingService.ts` |
| Dispatch host | `executeLocalHyperframesSmokeRender({tenantId?, runId, renderJobId, payload, runtimeEnv?})` (exported sibling); **private** `HYPERFRAMES_WORKER_JOB_TYPES` + private `executeHyperframesWorkerJob` switch (same-file) | `server/workers/hyperframesRenderWorker.ts` |
| ffmpeg builders | `buildAssSubtitleFile(lines, preset, opts, overlays?): string`; `buildConcatFfmpegArgs(spec): string[]`; `FfmpegRunner = (args: string[]) => Promise<{code, stderr}>`; `defaultFfmpegRunner`; `probeDurationSeconds(filePath)`; `resolveFfBinary`; `isFfmpegAvailable`. **Private** `buildAudioFilterGraph` (loudnorm branch `loudnorm=I=-16:TP=-1.5:LRA=11`) — **do NOT import**; factor a fresh `buildLoudnormPassArgs` | `server/services/verticalDramaFinalRenderGraph.ts` (+ `verticalDramaEpisodeVideoAssembly.ts`) |
| Storage | `storagePutFromPath(relKey, sourcePath, contentType?): Promise<{key, url}>` (Lane A is in-process — call directly; `storagePresignPut` returns `null` off-S3) | `server/storage.ts` (⚠ not `server/services/storage.ts`) |

Critical constraint (research A3, C1): the `remotion_render_video` path is
Remotion-native and must **not** reuse `resolveVideoRenderEngine` /
`executeVideoRender` (those carry the HyperFrames `UnsupportedPresetError`
fallback used by the marketplace path). Call `executeRemotionRender` directly.

## 4. Tests first (author before implementation)

Conventions: Vitest, node env for `server/**`; single test via
`JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run <path> -t "<name>"`.
No coverage gate — one `it` per branch, assert exact call-counts / key-sets.
Never execute real ffmpeg or a real render in Vitest (research B3, B7); the real
render is exercised only by the section-07 harness script.

### 4.1 `server/services/__tests__/queueRemotionRenderVideoJob.test.ts` — TRPC-style mocked repo/deps

Inject a fake `WorkerSchedulerRepository` (each method a `vi.fn()`) and a fake
`reserveCredits` via the `deps` param — do not hit the DB.

```
it("parses input and inserts a job with jobType=remotion_render_video")
it("sets capabilityFamilies=REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES (non-empty)")
it("a hyperframes-only worker's hints do NOT match this job")   // workerJobMatchesSelection === false
it("a remotion-render worker's hints DO match")                 // workerJobMatchesSelection === true
it("reserves credits before insert")                            // assert call order: reserveCredits before repo.insertJob
it("is idempotent on (projectId,revision,profile)")             // findJobByIdempotencyKey hit → {created:false}, no insert
it("rejects a second queued preview for the same user")         // preview-concurrency cap
it("prioritizes final (40) over preview (20)")                  // assert priority in insertJob arg
```

Notes: the negative-match test is the primary risk mitigation (§13 of the plan) —
build a job record from the `insertJob` arg and assert
`workerJobMatchesSelection(job, "hf-worker", { capabilityFamilies:
HYPERFRAMES_FINAL_COMPOSITE_CAPABILITY_FAMILIES })` is `false`, and that the same
job with a `remotion-render`-advertising worker is `true`. Assert credit
reservation happens **before** `insertJob` (order via `mock.invocationCallOrder`
or a shared spy). Invalid input → `.rejects` with a specific error (schema parse),
never a blanket message.

### 4.2 `server/services/__tests__/remotionPostPassArgs.test.ts` — ARGV (pure, never execute ffmpeg)

```
it("buildLoudnormPassArgs emits loudnorm=I=-16:TP=-1.5:LRA=11")   // exact filter substring
it("ass_burn argv references the built .ass file and subtitle filter")
it("segment_concat reuses buildConcatFfmpegArgs for the segmentPlan")  // byte-identical no-op lock: toEqual(buildConcatFfmpegArgs(spec))
it("no post-passes → passthrough (no ffmpeg args)")                // planPostPasses([]) → [] (no-op lock)
```

Assert on the string array (`indexOf` for `-filter_complex` / `-i` / `-map`
ordering; `toEqual` for the concat no-op lock). Exemplar:
`verticalDramaFinalRenderGraph.test.ts`.

### 4.3 `server/workers/__tests__/remotionRenderVideoDispatch.test.ts` — DI (inject FfmpegRunner + stub executeRemotionRender)

```
it("emits progress events in REMOTION_RENDER_VIDEO_PROGRESS_STAGES order")
it("fails with contract_version_unsupported on an unknown platformContractVersion")
it("fails with a specific failure code (never blanket render_failed) on render error")
it("runs declared postPasses in order via the injected runner")
it("produces a remotion_render_mp4 artifact descriptor")
```

The dispatch function must accept its side-effecting collaborators via an
injectable deps object (default = real ones) so the test can pass a stub
`executeRemotionRender`, a `vi.fn()` `FfmpegRunner`, a spy `emitEvent`, and a stub
`storagePutFromPath`. Assert the ordered `emitEvent` calls carry `stage` values
that are a prefix-ordered subset of `REMOTION_RENDER_VIDEO_PROGRESS_STAGES`, and
that every failure emits a **specific** `REMOTION_RENDER_VIDEO_FAILURE_CODES`
value.

`pnpm check` (tsc) is part of the gate. Run the full existing suite afterward —
`hyperframesRenderWorker` and `workerSchedulerService` sibling contracts must stay
green.

## 5. Implementation guidance

### 5.1 `queueRemotionRenderVideoJob` — in `server/services/workerSchedulerService.ts`

Add to the **existing** file (so it can use the private `DESKTOP_RUNTIME_TYPE`).
Model exactly on `queueDesktopHyperframesFinalCompositeJob`. Signature (do not
add full body here):

```
queueRemotionRenderVideoJob(
  rawInput: QueueRemotionRenderVideoJobInput,
  deps?: { repo?: WorkerSchedulerRepository; reserveCredits?: typeof reserveWorkerJobCredits }
): Promise<{ created: boolean; job: WorkerJobRecord }>

type QueueRemotionRenderVideoJobInput = RemotionRenderVideoWorkerInput & {
  tenantId: string; teamId?: string; requestedByUserId?: number;
  workflowRunId?: string; priority?: number; timeoutSeconds?: number;
  idempotencyKey?: string; reservedCredits?: number;
}
```

**Feature flags — create them FIRST (cross-consistency resolution #2).** Before
the queue logic, add the four F133 flags to `shared/featureFlags.ts` using the
3-edit pattern (research A16): `videoIntelligencePlatformEnabled` (F133A),
`remotionRenderVideoJobEnabled` (F133B), `videoIntelligenceCatalogStudioEnabled`
(F133C), `videoIntelligenceMotionStudioEnabled` (F133-motion), all default
`false`. Section-04/07 (batch 1) consume F133A/B before section-08 runs, so they
are created here; section-08 grep-guards and completes/verifies all four (never
double-declares — a duplicate object key is a tsc error).

Behavior (plan §5.1):

1. **Parse** `remotionRenderVideoWorkerInputSchema.parse(rawInput)` — server is the
   single source of truth (client-provided fields are re-validated).
   **Render-submission rate limit (spec §18.5):** enforce ≤6 render-job
   submissions/min per user (admin ×5) via the existing Bottleneck/BullMQ limiter
   before reserving credits; over-limit → a specific rate-limit error, never a
   silent drop.
2. **Idempotency** — key = a stable hash of `(videoProjectId, projectRevision,
   renderProfile.profile)`; `repo.findJobByIdempotencyKey(key)` → if found return
   `{ created: false, job }` with **no** insert and **no** credit reservation.
3. **Preview cap** (spec §18.2) — when `renderProfile.profile === "preview"`,
   reject with a specific error if the requesting user already has a
   queued/running preview `remotion_render_video` job (1-concurrent-preview cap).
   Prefer a repo lookup method for this; if the repo lacks one, add a narrow
   method to `WorkerSchedulerRepository` (keep it minimal, mirror existing repo
   shape). `final` jobs are **not** capped.
4. **Reserve credits** — `reserveWorkerJobCredits({ userId: requestedByUserId,
   tenantId, requestedCredits })` where credits are proportional to
   `durationMs × resolution-class × cost-class` (spec §18.4). Reservation happens
   **before** insert (tested in §4.1).
5. **Insert** via `repo.insertJob({...})`:
   - `runtimeType: DESKTOP_RUNTIME_TYPE`, `workerId: null`,
     `jobType: "remotion_render_video"`, `status: "queued"`.
   - `priority: renderProfile.profile === "final" ? 40 : 20`.
   - `resourceProfile: "cpu_heavy"`.
   - `capabilityRequirementsJson: { capabilityFamilies:
     REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES }` — **must be non-empty**
     (research A6: `workerJobMatchesSelection` matches-all on an empty family
     list; the non-empty list is what stops a hyperframes-only worker claiming
     this job).
   - `inputJson: parsedInput` (contains the `assetManifest` built by
     `buildAssetManifest` in section-07 — the queue function does **not** re-walk
     assets).
   - `instructionsJson: { requiredProgressStages:
     REMOTION_RENDER_VIDEO_PROGRESS_STAGES }`.
   - `timeoutSeconds: timeoutSeconds ?? scaleFromDuration(durationInFrames, fps)`
     with a floor of `900`.
   - `retryPolicyJson: { maxAttempts: 2, backoffSeconds: 120 }`, `idempotencyKey`.
6. **Gating** — early-return / no-op when
   `!isDesktopWorkerDispatchEnabled()` or the F133B feature flag
   (`remotionRenderVideoJobEnabled`, section-08) is off for the tenant.
7. **Defense-in-depth (spec §6.3):** add a claim-time assertion that the claiming
   worker advertises `remotion-render` for this `jobType`. If the claim path lives
   in a sibling function, add the assertion there guarded by `jobType ===
   "remotion_render_video"`; otherwise document the assertion point so section-07
   can enforce it in the router.

Return `{ created: true, job }`.

### 5.2 Post-pass argv builders — new pure module `server/services/remotionPostPassArgs.ts`

Pure, no I/O, unit-tested as argv arrays (§4.2). Factor a fresh `buildLoudnormPassArgs`
— do **not** import the private `buildAudioFilterGraph` (research A9, C2), but
reuse its exact filter string.

```
buildLoudnormPassArgs(inPath: string, outPath: string): string[]
  // ffmpeg -i <inPath> ... -af loudnorm=I=-16:TP=-1.5:LRA=11 ... <outPath>

buildAssBurnPassArgs(inPath: string, assFilePath: string, outPath: string): string[]
  // references the .ass file produced by buildAssSubtitleFile via a subtitles/ass filter

// segment_concat: reuse buildConcatFfmpegArgs(spec) directly for the segmentPlan —
// do NOT re-implement concat argv.

planPostPasses(payload: RemotionRenderVideoWorkerInput, paths: {...}): PostPassStep[]
  // maps payload.postPasses[] (enum "loudnorm"|"ass_burn"|"segment_concat") to
  // ordered { code, argv } steps; empty postPasses → [] (no-op passthrough lock).
```

`ass_burn` consumes the burn-in captions produced when `captions.burnIn` is true
(section-01 skips inline caption text layers in that case, deferring to this
post-pass). Build the `.ass` file with `buildAssSubtitleFile(lines, preset, opts)`
before constructing the argv.

### 5.3 Lane A dispatch — branch in `server/workers/hyperframesRenderWorker.ts`

Add a `remotion_render_video` case to the existing private dispatch (the
`executeHyperframesWorkerJob` switch). Because `HYPERFRAMES_WORKER_JOB_TYPES` is a
private const, keep the new branch and its executor **in this same file**. Extract
the executor as an injectable-deps function so §4.3 can unit-test it:

```
executeRemotionRenderVideoJob(
  input: { tenantId?: string; runId: string; renderJobId: string;
           payload: RemotionRenderVideoWorkerInput; runtimeEnv?: HyperframesRuntimeAdapterEnv },
  deps?: {
    render?: typeof executeRemotionRender;
    ffmpeg?: FfmpegRunner;               // default defaultFfmpegRunner
    storagePut?: typeof storagePutFromPath;
    emitEvent?: (e: { stage: string; ... }) => Promise<void> | void;
    stageAssets?: /* staging helpers */;
  }
): Promise<Record<string, unknown>>
```

Steps — **emit one progress event per stage**, using the exact stage names from
`REMOTION_RENDER_VIDEO_PROGRESS_STAGES` (section-03) so
`assertRuntimeSpecificJobEventContract` accepts them:

1. **`resolve_inputs`** — schema was parsed at enqueue; re-assert
   `payload.platformContractVersion` and `payload.rendererPolicyVersion` are
   supported (compare against `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION` /
   `REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION`). Unsupported → fail
   `contract_version_unsupported`.
2. **`stage_assets`** — pre-stage every `payload.assetManifest.sources` URL and
   verify each `sha256`, using the exported staging helpers
   (`stageRemotionShotSourceVideos`, `startLocalAssetServer`,
   `rewriteStagedShotUrlsToLocalServer`, `resolveAndStageRenderFont`,
   `resolveRemotionBrowserExecutable`). Failure → `asset_stage_failed`.
3. **`bundle_composition` + `select_composition` + `render_frames`** — a single
   call to `executeRemotionRender({ workspace, outputPath, payload, env })`.
   Assert `payload.compositionId === GENERIC_TEMPLATE_COMPOSITION_ID`. Map any
   `sceneIndex/sceneTotal` progress reported by the render onto progress events
   using the same field shape the page already reads for `shotIndex/shotTotal`
   (no structural change to the events). Bundle/select/render failures map to
   `bundle_failed` / `composition_select_failed` / `chromium_launch_failed` /
   `render_failed` respectively — pick the **specific** code, never a blanket
   `render_failed` for a launch or bundle error.
4. **`run_post_passes`** — for each step from `planPostPasses(payload, paths)`,
   run its argv via the injected `ffmpeg` runner (default `defaultFfmpegRunner`),
   in order. Any non-zero exit → `post_pass_failed`.
5. **`verify_outputs`** — `probeDurationSeconds(outPath)` + an `ftyp`/min-bytes
   MP4 sanity check + compute the output `sha256` (same posture as hyperframes).
   Mismatch/invalid → `server_verification_failed`.
6. **`upload_artifacts` + `server_verify_artifacts` + `publish_artifacts`** —
   Lane A is in-process (research C1): write the artifact via `storagePutFromPath`
   and return the artifact descriptor(s) on the existing return-path so the
   worker-registry inserts the `worker_artifacts` row and publishes to
   `libraryItems`. Emit artifacts with `artifactType: "remotion_render_mp4"`
   (primary) plus `remotion_render_manifest`, `remotion_render_log`,
   `remotion_render_probe_report`.

**Failure contract:** any thrown error must be surfaced as a `job.failed` event
carrying a **specific** `REMOTION_RENDER_VIDEO_FAILURE_CODES` value chosen for the
stage that failed. Never emit a stage or failure code outside the section-03
enums — `assertRuntimeSpecificJobEventContract` will reject it (that is the
intended guardrail).

**Observability (spec §19 — MANDATORY, CLAUDE.md LLM & Media Debugging
Protocol).** In addition to the `worker_job_events` rows above (which drive the
`/render-jobs` UI), emit `remotion_render.{queued,started,post_pass,completed,
failed}` to the platform audit JSONL (`logs/audit/`, reuse the existing audit
logger — do not invent one), each carrying the same `payload.traceId` so one grep
reconstructs the whole render. On failure, capture the ffmpeg/Remotion **stderr
tail** in the failed event so the render is reproducible from the embedded
compiled config. Log ids/key-names only — never a decrypted value or asset
credential (secret-exposure rule).

**Concurrency (spec §18.6).** A worker process runs **one** Remotion render at a
time (Chromium memory); serialize in-process renders (a simple module-level
mutex/in-flight guard is sufficient for Lane A). Reuse the memoized bundle
(`getBundleLocation()` inside `executeRemotionRender`) and clean the temp
workspace + `startLocalAssetServer` handle in a `finally`.

**Cleanup:** create a temp workspace like the sibling smoke render and remove it
(and close `startLocalAssetServer`) in a `finally`.

## 6. Files touched

Create:
- `apps/web/server/services/remotionPostPassArgs.ts` (pure argv builders +
  `planPostPasses`).
- Tests: `server/services/__tests__/queueRemotionRenderVideoJob.test.ts`,
  `server/services/__tests__/remotionPostPassArgs.test.ts`,
  `server/workers/__tests__/remotionRenderVideoDispatch.test.ts`.

Modify (additive branches only — keep every existing test green):
- `apps/web/server/services/workerSchedulerService.ts` — add
  `queueRemotionRenderVideoJob` (+ `QueueRemotionRenderVideoJobInput` type; a
  narrow preview-lookup repo method if needed).
- `apps/web/server/workers/hyperframesRenderWorker.ts` — add the
  `remotion_render_video` dispatch branch + `executeRemotionRenderVideoJob`.

Do **not** touch: the frozen `RemotionTemplateConfigSchema`, the marketplace
`executeVideoRender` fallback path, or the `hyperframes_*` job contracts.

## 7. Definition of done

- All §4 tests pass; `pnpm check` clean.
- Full existing suite green (worker fabric + VD render graph contracts unchanged).
- A hyperframes-only worker provably cannot claim a `remotion_render_video` job
  (negative-match test), and a `remotion-render` worker can.
- Every failure path emits a specific `REMOTION_RENDER_VIDEO_FAILURE_CODES` value;
  every progress event uses a `REMOTION_RENDER_VIDEO_PROGRESS_STAGES` stage.
- Post-pass argv is pure and tested; no ffmpeg or real render runs inside Vitest.
- `queueRemotionRenderVideoJob` is exported and ready for section-07's
  `videoProjects.queueRender` to call; the real end-to-end render is validated by
  the section-07 harness script, not here.