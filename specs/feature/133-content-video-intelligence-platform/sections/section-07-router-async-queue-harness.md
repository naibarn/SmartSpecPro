No sibling section files exist yet, so I'll reference their interfaces as defined in the plan/index. Writing the section now.

The output below is the complete section content.

<br>

<!-- SECTION: section-07-router-async-queue-harness -->

# Section 07 — tRPC Router, Asset Resolver/Manifest, Async Queue & Render Smoke Harness

> Plan refs: `claude-plan.md` §9 (+ §5.1, §7, §8 for the functions this section
> wires). Spec refs: `spec.md` §15 (API surface), §17 (security), §18
> (performance/rate limits), §20 (failure codes). TDD ref:
> `claude-plan-tdd.md` Section 7. Research refs: `claude-research.md`
> A6, A10, A11, A12, A13, A14, A15, B4, B7.

Work directory root for all code: `/home/dev/projects/SmartSpecPro/apps/web`
(pnpm workspace). Follow the repo TDD + Database Safety protocols. Run the full
existing suite after this section; frozen contracts must stay green, and
`pnpm check` (tsc) is part of the gate.

---

## 1. What this section builds (the integrator)

This is the **integrator** section: it is the product-facing tRPC surface that
ties together everything sections 01–06 produced. It creates no new rendering
primitives, no new DB tables, and no new worker contract — it *composes* them.

Deliverables (all under `apps/web`):

1. **`server/services/videoProjectAssetResolver.ts`** (new) — owner-checked asset
   resolution (`resolveProjectAssets`) + compiled-config walker
   (`buildAssetManifest`). The compiler (section 01) is pure, so the router must
   resolve assets *before* compiling and derive the worker `assetManifest`
   *after* compiling.
2. **`server/routers/videoProjects.ts`** (new) — the `videoProjects` tRPC router:
   CRUD with optimistic concurrency, stage runners (incl. TTS narration),
   caption export, `compileProject` / `queueRender` / `getRenderCostEstimate`,
   and a `brandKits` sub-surface. All `protectedProcedure`, tenant+owner scoped,
   gated by feature flag **F133A** (`videoIntelligencePlatformEnabled`).
3. **`server/services/videoIntelligenceJobs.ts`** (new) — the
   `video_intelligence_jobs` BullMQ queue plumbing (submit → `{jobId}` → poll),
   modeled 1:1 on `verticalDramaStoryJobs.ts`. Long LLM/TTS stages run here; the
   router's stage runners enqueue and return a `jobId`.
4. **`server/routers.ts`** (modify) — register the new router.
5. **`scripts/video-intelligence-render-smoke.ts`** (new) + a `package.json`
   script — the real-render "it actually renders" gate (HARNESS, not Vitest).

This section **depends on** (do not re-implement — import from the artifacts
those sections created):

| Symbol / artifact | From section | Path |
|---|---|---|
| `VideoProjectDocument`, `VideoProjectDocumentSchema`, `AssetResolver`, `TemplateBuildContext` | 01 | `shared/videoIntelligence/projectSchemas.ts` (types); `AssetResolver`/`TemplateBuildContext` defined alongside the compiler |
| `compileVideoProject(document, ctx): CompileResult`, `estimateRenderCost`, `VideoProjectCompileError`, `BrandLockViolationError` | 01 | `server/services/videoProjectCompiler.ts` |
| `RemotionTemplateConfig`, `RemotionTemplateConfigSchema` | (frozen, existing) | `shared/remotion/layerTemplateSchemas.ts` |
| `MOTION_TEMPLATE_REGISTRY`, `selectTemplatesFor`, `MotionTemplateMeta` | 02 | `shared/videoIntelligence/motionTemplates.ts`, `server/remotion/templates/index.ts` |
| `remotionRenderVideoWorkerInputSchema`, `RemotionRenderVideoWorkerInput`, `REMOTION_RENDER_VIDEO_*` consts | 03 | `shared/workerRuntime.ts` |
| `queueRemotionRenderVideoJob(rawInput, deps?)`, `executeRemotionRenderVideoJob` (Lane A) | 04 | `server/services/workerSchedulerService.ts`, `server/workers/hyperframesRenderWorker.ts` |
| `video_projects`, `video_project_revisions`, `brand_kits` tables | 05 | `drizzle/schema.ts` |
| `validateProjectClaims`, `runVideoProjectQualityLoop`, `estimateVideoProjectQualityLoopCredits` | 06 | `server/services/validateProjectClaims.ts`, `server/services/videoProjectQualityLoop.ts` |

Reused existing platform functions (never rebuild — `claude-plan.md` §12):

- `ttsService.synthesize(text, opts)` + `calculateTTSCredits(chars)` —
  `server/services/ttsService.ts` (research A12).
- `renderTranscriptCuesAsSrt(cues)` / `renderTranscriptCuesAsVtt(cues)` +
  `HyperframesTranscriptCue` — `server/services/hyperframesTranscriptionService.ts`
  (research A11).
- `getMarketplaceProductWithAccess`, `listMarketplaceProductImagesForMediaStudio`,
  `listMarketplaceInsightsByProduct` — `server/routers/marketplaceCapture.ts` /
  its services (research A13).
- `storagePutFromPath` — `server/storage.ts` (⚠ NOT `server/services/storage.ts`,
  research A15).
- Storage proxy URL shape: `/api/storage/files/…` or `/uploads/…` (paths starting
  with `/`), the only asset-ref shape the render staging accepts (spec §17.3).
- `requireFeatureFlag` / `getTenantFeatureFlags` — the flag-gating helpers used by
  every existing flag-gated router (see `verticalDramaEpisodes.ts` for the exact
  import + usage; research B4).
- The existing `workerJobs` router for render-job **status/detail/cancel** — do
  NOT duplicate it here (spec §15.2).

---

## 2. Tests first (write these before any implementation)

Conventions are fixed by `claude-research.md` Part B. Vitest, **node env** for
`server/**` (config already routes it). Single test:
`JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run <path> -t "<name>"`.
No coverage gate — one `it` per branch, assert **exact** `db.select`/`insert`
call counts and key-sets. Real ffmpeg/storage lives only in the script harness,
never Vitest.

### 2.1 `server/routers/__tests__/videoProjects.crud.test.ts` — TRPC

Follow the router-test exemplar `verticalDramaEpisodes.textOverlayPlan.test.ts`
(research B4): `vi.mock("../../_core/trpc")` so `protectedProcedure.query(fn)`
returns `fn`; call handlers directly with a local `ctx()` factory
(`{ tenantId, user: { id }, … }`); `vi.mock("../../db")` with `vi.fn()`
select/insert/update returning a thenable chain; stub `requireFeatureFlag` +
`getTenantFeatureFlags`.

```
it("create/get/list are tenant+owner scoped")            // every query filters tenantId + userId
it("saveDocument rejects a stale baseRevision with CONFLICT")  // optimistic concurrency guard
it("saveDocument bumps revision and writes a revision row")    // exact insert into video_project_revisions
it("emits zero extra db.select when the F133A flag is off")    // exact call-count lock: 0 queries
it("delete is owner-checked")                            // rejects a foreign-owner project id
```

Error assertions use `.rejects.toMatchObject({ code, message: stringContaining("VI_") })`
where a `VI_*` code applies (spec §20); optimistic-concurrency conflict uses
tRPC `code: "CONFLICT"`.

### 2.2 `server/routers/__tests__/videoProjects.render.test.ts` — TRPC

Mock `compileVideoProject`, `queueRemotionRenderVideoJob`, and the asset resolver
with `vi.fn()`s so the router's *wiring* is under test, not the compiler.

```
it("compileProject returns config + cost with no side effects")   // no db.insert, no queue call
it("queueRender(preview) downscales to ≤540×960 / fps≤15 before queueing")  // asserts the mutated config passed to queue
it("queueRender wires assetManifest from buildAssetManifest into the payload")  // manifest identity into queueRemotionRenderVideoJob input
it("queueRender(final) is blocked by a prohibited/unmapped claim (VI_CLAIM_VIOLATION)")  // §7 gate
it("exportCaptions returns SRT and VTT via the reused renderers")  // asserts renderTranscriptCuesAsSrt/Vtt called with cue objects
```

### 2.3 `server/services/__tests__/videoProjectAssetResolver.test.ts` — TRPC-style mocked db

```
it("resolves mediaAssets/libraryItems ids to storage-proxy URLs")   // returns "/api/storage/files/…" or "/uploads/…", never a raw external URL
it("refuses a foreign-tenant asset")                                // owner check → throws VI_ASSET_UNRESOLVED (lists offending ids)
it("buildAssetManifest walks compiled layer src + audio-track assets")  // { sources: [{ role, url, sha256 }] } shape; sha256 undefined where unknown
```

### 2.4 Narration stage — TRPC (in `videoProjects.crud.test.ts` or a dedicated file)

Mock `ttsService.synthesize`.

```
it("runNarrationStage stores a mediaAssets row for the synthesized audio")
it("runNarrationStage sets scene.narrationAudioAssetId on the saved document")
it("runNarrationStage charges TTS credits via calculateTTSCredits(chars)")
```

### 2.5 `server/services/__tests__/videoIntelligenceJobs.test.ts` — mocked queue

Mirror `verticalDramaStoryJobs.test.ts`: mock the lazy `bullmq` import + the
Redis record store; assert the submit→jobId→status contract.

```
it("enqueue returns a jobId and writes a queued record")
it("getGenerationJobStatus reads the record by jobId (owner-scoped)")
it("getActiveGenerationJob returns the active job for a project (dedupe pointer)")
it("clears the active pointer on terminal outcome")   // finally-guarded, only its own jobId
```

### 2.6 Render smoke — HARNESS (NOT part of `pnpm test`)

`scripts/video-intelligence-render-smoke.ts`, run via a new `pnpm` script.
Modeled on `scripts/remotion-parity-test.ts` (research B7). Not a Vitest file —
it does real ffmpeg + storage I/O.

```
synthesize a tiny fixture project (2 scenes, 1 audio track, ≥1 caption cue)
→ resolveProjectAssets → compileVideoProject → buildAssetManifest
→ run the Lane-A executeRemotionRenderVideoJob path end-to-end (real ffmpeg + storage)
→ ffprobe asserts: duration ≈ document.format.durationMs, resolution matches,
  ≥1 audio track present
→ cleanup in finally (tmpdir + any uploaded fixture assets)
```

---

## 3. `videoProjectAssetResolver.ts` — resolution + manifest

**File:** `apps/web/server/services/videoProjectAssetResolver.ts` (new).

The compiler is a pure function (no I/O). The router therefore resolves assets
first, hands the compiler an `AssetResolver`, and — after compiling — walks the
compiled config to build the worker `assetManifest`.

```
resolveProjectAssets(
  document: VideoProjectDocument,
  auth: { tenantId: string; userId: number }
): Promise<AssetResolver>
```

Behavior:
- Collect every asset id referenced by the document: `scene.narrationAudioAssetId`,
  `audioTracks[*].assetRefs` / `sfx.events[*].assetRef`, and any layer `src` that
  is a numeric id reference. `mediaAssets.id` is **bigint** (mode number);
  `libraryItems.id` is **integer** (research A14/C4 — get the column types right).
- Owner-checked lookups: every `mediaAssets` / `libraryItems` query filters
  `tenantId` + owner (`userId`) exactly like
  `workerJobMonitorService.listUserJobs` (spec §17.1). A referenced id that does
  not resolve for this owner → throw `VideoProjectCompileError` mapped to
  `VI_ASSET_UNRESOLVED`, listing the offending ids (spec §20).
- Produce URLs as **storage-proxy paths only** (`/api/storage/files/…` or
  `/uploads/…`) — never a raw external URL (spec §17.3 SSRF allowlist). If the
  document carries a raw URL string where a proxy path is unavoidable, it must
  already be a storage-proxy path; reject other hosts.
- Return the `AssetResolver` shape section 01 defined:
  `{ url(assetId): string; sha256(assetId): string | undefined }`. `sha256` is
  best-effort (present when the row stores a checksum; `undefined` otherwise) —
  the manifest carries it through for worker-side verification.

Exact `db.select` call counts are asserted by the test — batch the lookups (one
select per table, `inArray(ids)`), do not N+1.

```
buildAssetManifest(
  config: RemotionTemplateConfig,
  resolver: AssetResolver
): AssetManifest   // { sources: { role: "video"|"image"|"audio"|"font", url, sha256 }[] }
```

Behavior:
- Walk the **compiled** config's `layers[*].src` (image/video/audio variants) and
  any font references, mapping each to a `sources` entry with the correct `role`
  and the resolver's `url` + `sha256`. Dedupe by url.
- The `role` must match the worker contract enum (section 03:
  `"video"|"image"|"audio"|"font"`).
- This is the manifest the worker pre-stages + checksum-verifies before launching
  Chromium (spec §6.2). The queue function does **not** re-walk assets — the
  router passes this manifest into the job payload.

`AssetManifest` should reuse the `assetManifest` shape declared inside
`remotionRenderVideoWorkerInputSchema` (section 03) — import the inferred type,
do not re-declare the field shape.

---

## 4. `videoProjects.ts` — the tRPC router

**File:** `apps/web/server/routers/videoProjects.ts` (new). All procedures:
`protectedProcedure`, Zod input, tenant+owner checks (spec §17.1), rate limits
(spec §18.5), gated by F133A. Every handler first calls the flag guard; the
"flag off → 0 extra db.select" test locks that the guard runs before any query.

Use the `verticalDramaEpisodes.ts` router as the structural template (imports,
`ctx` usage, flag guard, owner-scoped query helpers, Zod input patterns).

**Rate limits (spec §18.5)** enforced server-side via the existing Bottleneck/
BullMQ limiter (admin ×5): CRUD procedures ≤60/min per user; generation-stage
runners ≤20/min (§5); render submissions ≤6/min are enforced in the queue
function (section-04). Over-limit → a specific rate-limit error.

**Observability (spec §19 — MANDATORY, CLAUDE.md).** Mint a `traceId` at each
stage-runner / `queueRender` entry and thread it into the async job record, the
render payload (`inputJson.traceId`, section-03), and a `video_project_stage`
audit-JSONL event (`{ stage, projectId, jobId?, traceId }`) at stage start/finish.
TTS/image calls in `runNarrationStage` go through the platform's existing
`media_request`/`media_response` audit events; the scene-plan LLM call rides the
normal provider-usage/audit path. Reuse the existing audit logger — never invent
one — and log ids/key-names only (no secrets).

### 4.1 CRUD + optimistic concurrency

- `create({ studioType, name, brief?, brandKitId? })` → inserts a `video_projects`
  row scoped to `{ tenantId, userId }`, `status: "brief"`, `revision: 1`. Returns
  the row.
- `get({ projectId })` / `list({ studioType?, status? })` — owner-scoped selects.
- `updateBrief({ projectId, brief })` — owner-checked update of the `brief` jsonb.
- `saveDocument({ projectId, baseRevision, document })`:
  1. `VideoProjectDocumentSchema.parse(document)` — invalid → `VI_DOCUMENT_INVALID`
     (400, never reaches a worker; spec §20).
  2. **Optimistic concurrency:** load the current `video_projects.revision`; if
     `baseRevision !== current`, reject with tRPC `code: "CONFLICT"` (two-tab
     clobber guard — mirrors the presentation-autosave precedent). Do NOT write.
  3. On success: write a `video_project_revisions` row
     (`{ projectId, revision: current, document: <previous>, createdBy, reason }`)
     capturing history, then update `video_projects` with the new `document` and
     `revision = current + 1`. The test asserts exactly one insert into
     `video_project_revisions`.
- `listRevisions({ projectId })` / `restoreRevision({ projectId, revision })` —
  restore copies the stored `document` back into `video_projects` and bumps
  `revision` (a restore is itself a new revision; §6.2 of the plan).
- `delete({ projectId })` — owner-checked hard/soft delete per repo convention.

### 4.2 Stage runners (async — enqueue and return a jobId)

Long LLM/TTS work runs on the `video_intelligence_jobs` queue (§5 below). Each
stage runner validates ownership, enqueues a job, and returns `{ jobId }`. The
client polls `getGenerationJobStatus` / `getActiveGenerationJob`.

- `runScenePlanStage({ projectId })` — enqueues scene-planning LLM work
  (Phase-1: metadata-driven; do NOT hardcode template-id routing in TS — respects
  the no-hardcode-skills rule, plan §4.4).
- `runNarrationStage({ projectId, sceneIds? })` — **TTS** narration:
  - For each target scene with `narration` text, call
    `ttsService.synthesize(narration, { format: "mp3", provider: "openai", … })`
    (research A12; default provider/voice are fine for Phase 1).
  - Persist the returned `audioBuffer` as a **`mediaAssets` row** (via
    `storagePutFromPath` + a `mediaAssets` insert), owner-scoped.
  - Set `scene.narrationAudioAssetId` on the document and `saveDocument` it (new
    revision). The test asserts both the `mediaAssets` insert and the field set.
  - **Populate `scene.captionCues`** deterministically from the narration text
    (plan-vs-spec completeness fix): a small pure helper
    `deriveCaptionCues(narration, sceneStartMs, sceneEndMs): CaptionCue[]` chunks
    the text into caption-sized lines (≈ 1–2 short lines/screen) and times them
    proportionally across the scene window, so a narrated video ships with
    captions without an extra transcription round-trip. Skip when the scene
    already has author-provided cues. Unit-test the helper (pure input→output:
    chunking + proportional timing + empty-narration edge). Whisper-based
    cue-timing refinement (transcribing the TTS audio) is explicitly deferred to
    Phase 2 — do not add a transcription call here.
  - Charge credits via `calculateTTSCredits(chars)` (research A12; existing
    5-credits/1000-chars path, spec §18.4).
- `runQualityReview({ projectId })` / `applyQualityRepairs({ projectId, … })` —
  delegate to `runVideoProjectQualityLoop` (section 06, single-round in MVP).
- `approveStage` / `rejectStage` (Guided mode) — advance/hold the
  `video_projects.status` state machine.

### 4.3 Captions

- `exportCaptions({ projectId, format: "srt" | "vtt" })`:
  - Build `HyperframesTranscriptCue[]` from the document's per-scene `captionCues`
    (offset scene-relative `startMs`/`endMs` to absolute; `index` 1-based; `text`
    from the cue).
  - Return text via `renderTranscriptCuesAsSrt(cues)` /
    `renderTranscriptCuesAsVtt(cues)` (research A11) — reuse, do not re-implement a
    subtitle serializer.

### 4.4 Render

- `getRenderCostEstimate({ projectId })` — resolve assets, compile, return
  `estimateRenderCost(config)` (section 01/02). No side effects.
- `compileProject({ projectId })` — **no side effects**:
  `resolveProjectAssets` → build `TemplateBuildContext` (`{ format, brandKit,
  assetResolver }`) → `compileVideoProject(document, ctx)` → return
  `{ config | parts, cost }`. Compile errors surface as `VI_*` codes
  (`VI_DOCUMENT_INVALID` / `VI_TEMPLATE_UNKNOWN` / `VI_ASSET_UNRESOLVED` /
  brand-lock → `VI_*`, spec §20). The test asserts **zero** `db.insert` and zero
  queue calls.
- `queueRender({ projectId, profile: "preview" | "final" })`:
  1. Resolve assets + compile (as `compileProject`).
  2. **Claim gate (§7 of the plan / spec §11):** for `profile: "final"` on a
     catalog project, first **resolve `ResolvedCatalogFacts`** (cross-consistency
     resolution #5): load `listMarketplaceInsightsByProduct` for
     `sourceRefs.productIds` (`claimResolutionsJson`) + the latest product price
     facts (stamped `resolvedAt`), shape them into the `ResolvedCatalogFacts`
     type section-06 defines. Then run
     `validateProjectClaims(document, resolvedCatalog)` (section 06); if a
     `prohibited` claim or an unmapped product statement is present, reject with
     `VI_CLAIM_VIOLATION` (blocks final until resolved). Motion-Studio projects
     (no `productIds`) pass `resolvedCatalog = null` and skip the gate.
  3. For `profile: "preview"`, **downscale** the compiled config to ≤540×960 and
     `fps ≤ 15` before queueing (spec §18.2). Do this on a copy of the config —
     the test asserts the mutated config reaches the queue.
  4. `buildAssetManifest(config, resolver)` (§3) → derive the worker
     `assetManifest`.
  5. Assemble a `RemotionRenderVideoWorkerInput` (section 03 schema:
     `remotionTemplate`, `compositionId: "GenericTemplate"`, `assetManifest`,
     `renderProfile`, `postPasses`, `segmentPlan`, `remotionTemplateHash`,
     `durationInFrames`, version fields, `videoProjectId`, `projectRevision`,
     `traceId`) and call `queueRemotionRenderVideoJob(input, …)` (section 04).
  6. Persist the returned worker job id onto the project
     (`renderJobId` for final, `previewJobId` for preview) and return
     `{ workerJobId }`.
  - Status/detail/cancel are **not** here — the client uses the existing
    `workerJobs` router (spec §15.2). Do not duplicate.
- The preview-concurrency cap (1 queued/running preview per user) and the
  credit reservation live inside `queueRemotionRenderVideoJob` (section 04) — the
  router does not re-implement them; it surfaces the resulting error.

### 4.5 Brand kits

`brandKits.{create,list,get,update,delete}` (own sub-router or namespaced
procedures under `videoProjects`), owner-scoped over the `brand_kits` table
(section 05). Minimal Phase-1 fields only (`name`, `logoAssetId`, `colors`,
`fonts`, `captionPresetId`, `locks`). Locks are enforced deterministically at
**compile** time (section 01's `BrandLockViolationError`), not here.

### 4.6 Motion template listing

`listMotionTemplates({ categories?, durationMs?, aspectRatio? })` → returns
`selectTemplatesFor(...)` metadata (section 02). Metadata filter only — no
LLM/template-id routing in Phase 1 (plan §4.4).

---

## 5. `video_intelligence_jobs` async queue

**File:** `apps/web/server/services/videoIntelligenceJobs.ts` (new).

Mirror `server/services/verticalDramaStoryJobs.ts` **exactly** (it is the
in-repo submit→jobId→poll precedent; read it before writing):

- `export const VIDEO_INTELLIGENCE_JOBS_QUEUE = "video_intelligence_jobs";`
- Lazy `await import("bullmq")` `Queue` + `Worker` pair with best-effort init
  that degrades to "job stays queued until a worker comes up" when Redis/BullMQ
  is unreachable; `init*Queue()` / `close*Queue()` registered in
  `_core/index.ts`'s bootstrap/shutdown (same as the VD story queue).
- Job records (`status`/`progress`/`result`/`error`) are a small Redis-JSON blob
  per `jobId` with a TTL — **not** a new DB table/column (matches the VD
  precedent; `drizzle/schema.ts` is section 05's owned surface, additive-only).
- Per-project exclusivity via a separate Redis active-pointer key (dedupe: return
  the existing `jobId` instead of double-submitting; `finally`-guarded clear that
  only clears its own jobId). Queue-wide worker concurrency > 1 is fine.
- A generic, kind-agnostic executor signature; the router owns the kind-specific
  logic (scene-plan / narration / quality-review), passing an executor +
  `onProgress` fire-and-forget callback.
- Public read surface consumed by the router (names per spec §15.3):
  `getGenerationJobStatus(jobId, owner)` and `getActiveGenerationJob(projectId,
  owner)` — both owner-scoped.

Rate limit generation-stage submissions to ≤20/min per user (spec §18.5) using
the existing Bottleneck/BullMQ limiter infrastructure.

---

## 6. Router registration

**File:** `apps/web/server/routers.ts` (modify).

Add `videoProjects: videoProjectsRouter` to the merged app router (and its type
entry, following the two-part pattern already used for `verticalDramaEpisodes` at
the `typeof …Router` interface line and the router-object line). Place it near
the Feature-131/132 block with a `// Feature 133 — Video Intelligence Platform
(flag-gated, default off)` comment. Import at top with the sibling router
imports.

---

## 7. Render smoke harness (real render — the Phase-1 "it renders" gate)

**File:** `apps/web/scripts/video-intelligence-render-smoke.ts` (new, tsx). Add a
`package.json` script, e.g.:

```
"video-intelligence:render-smoke": "tsx scripts/video-intelligence-render-smoke.ts"
```

Model on `scripts/remotion-parity-test.ts` (research B7 / it imports real
`server/services/*` TS modules; that is why it is `.ts` run via tsx, not `.mjs`).
Key points carried over from that script:

- **Asset strategy:** synthesize a couple of tiny local MP4/audio fixtures with
  `ffmpeg`, upload them through the app's own `storagePutFromPath`
  (`server/storage.ts`) so the returned `/api/storage/files/…` (or `/uploads/…`)
  path passes the render staging's SSRF safety policy. Do **not** try to serve
  fixtures from a throwaway `http://127.0.0.1:<port>` server — plain `http:` and
  localhost hosts are rejected by the asset-ref safety check by design.
- Flow: build a tiny `VideoProjectDocument` (2 scenes, 1 audio track, ≥1 caption
  cue) → `resolveProjectAssets` → `compileVideoProject` → `buildAssetManifest`
  → drive the Lane-A `executeRemotionRenderVideoJob` path (section 04) with real
  ffmpeg + storage.
- Assertions via ffprobe: output duration ≈ `document.format.durationMs`,
  resolution matches the compiled config, ≥1 audio track present.
- Cleanup in a `finally`: remove the tmp workspace and any uploaded fixture
  assets. Keep this **out of the Vitest suite** — it is a manual/CI gate, not
  `pnpm test`.

---

## 8. Security, correctness & verification gate

- **Tenant + owner isolation on every query** (spec §17.1): all `video_projects`,
  `video_project_revisions`, `brand_kits`, `mediaAssets`, `libraryItems` reads
  filter `tenantId` + `userId`. Foreign-owner access → `VI_ASSET_UNRESOLVED` (for
  assets) or a not-found error (for projects). The router tests lock this.
- **No raw external URLs in payloads** (spec §17.3): the resolver emits only
  storage-proxy paths; `buildAssetManifest` carries those through unchanged.
- **Fail-fast on invalid documents** (spec §20): `VI_DOCUMENT_INVALID` at
  save/compile — an invalid project never reaches a worker.
- **Specific failure codes only** (cross-cutting TDD rule): every new failure
  path asserts a specific `VI_*` / tRPC code, never a blanket one.
- **Exact db call-count locks** (research B4): the "flag off → 0 extra db.select"
  test and the "saveDocument writes exactly one revision row" test both assert
  precise call counts.
- **Type-level contracts count as tests:** `pnpm check` (tsc) must pass — e.g. the
  router must consume `RemotionRenderVideoWorkerInput` (section 03) so a field
  drift is a compile error here too.
- **Run the full existing suite** after this section; the frozen contracts
  (`RemotionTemplateConfig`, VD render graph, worker domain) must stay green.
  Then run the smoke harness once manually to confirm a real render.

Section 08 (Studios UI) consumes this router — keep procedure names and input
shapes stable with §15 of the spec so the UI wiring matches.

<br>

---

Files written/referenced for this task (all absolute):

- Section written to: `/home/dev/projects/SmartSpecPro/specs/feature/133-content-video-intelligence-platform/sections/section-07-router-async-queue-harness.md` (content above — the SubagentStop hook extracts and writes it).
- Primary planning inputs read: `/home/dev/projects/SmartSpecPro/specs/feature/133-content-video-intelligence-platform/claude-plan.md` (§9, §5.1, §7, §8), `/home/dev/projects/SmartSpecPro/specs/feature/133-content-video-intelligence-platform/claude-plan-tdd.md` (Section 7), `/home/dev/projects/SmartSpecPro/specs/feature/133-content-video-intelligence-platform/claude-research.md` (A6/A10–A16, B4/B7), `/home/dev/projects/SmartSpecPro/specs/feature/133-content-video-intelligence-platform/spec.md` (§15, §17, §18, §20), and `/home/dev/projects/SmartSpecPro/specs/feature/133-content-video-intelligence-platform/sections/index.md`.
- Code precedents referenced for exact patterns: `/home/dev/projects/SmartSpecPro/apps/web/server/services/verticalDramaStoryJobs.ts` (async queue), `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` (registration), `/home/dev/projects/SmartSpecPro/apps/web/scripts/remotion-parity-test.ts` (harness), `/home/dev/projects/SmartSpecPro/apps/web/package.json` (script slot).