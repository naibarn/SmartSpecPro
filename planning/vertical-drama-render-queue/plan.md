# Vertical Drama Render Queue — Offload ffmpeg assembly to a worker

**Status:** IMPLEMENTED (2026-07-14) — code complete + tested; NOT yet deployed. Admin flag defaults OFF, so enabling in-server rendering requires flipping the Platform Settings toggle after deploy.
**Author:** conductor (with 5 read-only mapping agents)
**Created:** 2026-07-14
**Related:** `planning/vertical-drama-production-episodes/plan.md`, Feature 133 (`specs/feature/133-content-video-intelligence-platform/`), Feature 124 (`specs/feature/124-smart-ai-hub-worker-app/`), `memory/project_vd_episode_terminology.md`

---

## 1. Problem statement

Triggering "รวมวีดีโอ / วิดีโอรวม Sub-episode" (assemble compiled Sub-Episode video) on
`smartaihub.app/drama-series/:id/episodes/:ep` hangs the app. Root cause is that the ffmpeg
concat/re-encode runs **in-process inside the web server** as an uncapped, fire-and-forget child
process. Three concrete failures:

1. **No concurrency cap** — every "assemble" spawns a full 1080×1920 H.264 re-encode with no
   limit (`verticalDramaEpisodeVideoAssembly.ts:490`, `defaultFfmpegRunner`). A few concurrent
   renders saturate the box's CPU and the web app stops responding. *Primary cause of the hang.*
2. **Runs on the web server process** — CPU-heavy work competes with request serving.
3. **No restart recovery** — the episode row is written `status:"pending"` **before** launch; if
   the process restarts, the ffmpeg child dies but the row stays `pending` forever and the client
   polls indefinitely (the visible "กำลังประกอบวิดีโอรวม…" that never finishes).

Four VD operations share this in-process path (all pure ffmpeg, zero Remotion):
single Sub-Episode (`assembleEpisodeVideo`), Production-Episode group
(`assembleProductionEpisodes`), season batch (`assembleSeasonVideos`), and trailer
(`generateTrailer`).

## 2. Goal (agreed with user)

- **User UI** only *submits* the assemble job into the **`render-jobs` queue** (a new
  **ffmpeg-only** job type, clearly distinct from Remotion/Hyperframes jobs). No more in-process
  render on the request path.
- If no worker claims a job it **stays `queued`** until the user cancels it — the cancel function
  already exists (`workerJobs.cancelQueued`). This is acceptable and intended.
- **Admin toggle in Platform Settings**: "web server also acts as an ffmpeg render worker"
  (on/off, live). When ON, the server behaves like *just another worker* — it pulls/claims
  **only ffmpeg** jobs from the queue (never Remotion/Hyperframes) and renders them, reusing the
  existing TypeScript ffmpeg code. When OFF, the server does not claim; jobs wait for another
  worker.
- **Both** service the same queue: the in-server worker now, an external worker later.
- **Desktop worker**: document current capability and recommend the appropriate path (it does
  **not** do ffmpeg today — it only runs Hyperframes/Remotion).

## 3. Key findings from investigation (why this shape)

- **`worker_jobs` + `/render-jobs` already exist and fit.** `jobType` is a free `varchar(100)`
  (`drizzle/schema.ts:14027`) — **no DB migration** to add a type. The `/render-jobs` page
  (`client/src/pages/RenderJobsPage.tsx`, route `App.tsx:711`) lists jobs purely by
  `tenantId + requestedByUserId` — **any new jobType surfaces automatically**
  (`workerJobMonitorService.ts:159-166`). Remotion already has its own type
  (`remotion_render_video`), so "ffmpeg vs Remotion" is just a second jobType + distinct
  capability family.
- **The external desktop fleet is not a viable target today.** Exactly one worker ever
  registered; last heartbeat **2026-06-27** (17 days before this plan). Job history is only
  `hyperframes_final_composite`: **48 failed / 6 canceled / 4 completed**. There is **no TTL that
  expires an unclaimed job** — routing to a dead fleet = jobs queued forever.
- **The desktop worker-app cannot do this render.** `apps/worker-app` is a Tauri/Rust desktop app
  implementing exactly **one** job type — `hyperframes_final_composite` — via a Remotion sidecar
  (`apps/worker-app/src-tauri/src/worker_executor.rs:9,323`). It advertises only
  `hyperframes-final-composite` capabilities (`worker_loop.rs:413`), has **no ffmpeg-assembly
  executor**, and cannot run on a headless server. The generic `video_assembly` contract also
  **cannot express** VD's render (no dialogue-audio mux, loudnorm, banner/product overlays,
  age-badge, or watermark placement).
- **All VD render logic is pure TypeScript in the web repo** (`verticalDramaFinalRenderGraph.ts`,
  `verticalDramaEpisodeVideoAssembly.ts`). So an **in-server / headless-Node worker reuses it
  verbatim** — zero reimplementation, no Rust, no contract-bending. Routing to Python
  `celery-video` would require rebuilding the whole graph in the VideoStudio spec (rejected).
- **A server-side claim-and-run precedent already exists**: `dispatchLaneARemotionRenderJob`
  (`videoIntelligenceJobs.ts:415-490`) atomically claims a `worker_jobs` row via
  `UPDATE … SET status='running' WHERE id=? AND status='queued' RETURNING id` and runs the
  executor in-process. We generalize this into an interval drainer.
- **User cancel already works for queued *and* running** jobs (`workerJobs.cancelQueued` →
  `cancelQueuedJob`, `workerJobMonitorService.ts:283-308`); UI gates on `canCancel`
  (`RenderJobsPage.tsx:546`).

## 4. Design

### 4.1 New job type
`vertical_drama_ffmpeg_assembly` — `runtimeType = desktop_zeroclaw_managed`,
`resourceProfile = cpu_heavy`, distinct capability family
`["vertical-drama-ffmpeg-assembly"]` (its own family so the `.every()` superset claim gate,
`workerSchedulerService.ts:282-319`, keeps it isolated from Remotion/Hyperframes/`video_assembly`).

`inputJson` carries the **render request**, not the ffmpeg graph — the executor re-loads
everything from the DB and calls the existing `runAssemblyJob` machinery:
```
{ kind: "sub_episode" | "production_episode_group" | "season" | "trailer",
  seriesId, episodeId?, groupIndex?, renderOptions?, allowPartial?, ... }
```
Free (0 credits) — matches today's "no billing for a local re-encode of already-owned media".
Idempotency key = `sha256(kind:episodeId:clipSetHash:renderOptionsHash)` to dedupe re-submits
(DB-enforced by `worker_jobs_tenant_idempotency_key_unique`, `schema.ts:14063`).

### 4.2 Enqueue side (user UI → queue)
- New `queueVerticalDramaFfmpegAssemblyJob(...)` in `workerSchedulerService.ts` (modeled on
  `queueDesktopVideoAssemblyJob:867`): validates input, computes idempotency key, inserts the
  `worker_jobs` row with `requestedByUserId` (so it shows on `/render-jobs`).
- VD mutations stop calling `submitAssemblyJob` / `submitSequentialAssemblyJobs` /
  `submitTrailerJob` and instead **enqueue** and set
  `assemblyManifest.compiledVideo = { status:"pending", pendingJobId: <workerJobId> }`
  (unchanged client contract — client keeps polling `compiledVideo`).
- **Client contract preserved**: `VerticalDramaEpisodePage.tsx` polling of
  `assemblyManifest.compiledVideo.status/videoUrl` is untouched.

### 4.3 Server-as-worker loop (admin-toggled)
- New `server/services/inlineRenderWorker.ts` — an interval drainer modeled on
  `dispatchLaneARemotionRenderJob`:
  - Each tick: select `status='queued' AND jobType='vertical_drama_ffmpeg_assembly'`
    ordered `priority DESC, createdAt ASC`, claim atomically
    (`UPDATE … SET status='running', startedAt=now WHERE id=? AND status='queued' RETURNING id`).
  - **Concurrency cap = 1** (CPU-heavy; matches the sequential reasoning in
    `submitSequentialAssemblyJobs:1709`). Configurable.
  - Dispatch on `inputJson.kind` to the existing render functions (`runAssemblyJob`,
    `runProductionEpisodeGroupJob`, `runTrailerJob`).
  - On success: `persistCompiledVideoState({status:"ready", videoUrl, durationSeconds})`
    (`verticalDramaEpisodeVideoAssembly.ts:611`) **and** terminal
    `worker_jobs.status='completed' + outputJson` guarded `WHERE … AND status='running'`
    (so a concurrent user cancel is never clobbered).
  - On failure: `compiledVideo.status='failed'` + `worker_jobs.status='failed' + failureReason`.
    Never throw out of a tick (mirror `videoIntelligenceJobs.ts:476-489`).
  - Optional: poll the row's status mid-render to abort early on cancel.
  - Uses the guard-and-`unref` timer pattern from
    `deferredMediaRetryService.ts:265-271,463-465` so it never blocks shutdown.

### 4.4 Admin Platform Setting
- Store in `system_settings`: `category="infrastructure"`,
  `key="web_process_render_worker_enabled"`, value `"true"/"false"`, `isSensitive=false`
  (no migration; `infrastructure` is already an allowed category —
  `systemSettings.ts:44`).
- TTL-cached read helper `renderWorkerSettings.ts`
  (`getWebProcessRenderWorkerEnabled()`), modeled on `documentOcrSettings.ts:193-216`, with an
  env fallback `SMARTSPEC_INLINE_RENDER_WORKER`.
- Admin UI: a `Switch` on `AdminSettings.tsx` (Infrastructure section), wired to the existing
  `systemSettings.updateSetting` mutation exactly like `allowUserOwnLlmApiKeys`
  (`AdminSettings.tsx:3718-3736`). `adminProcedure` / `rateLimitedAdminProcedure` only.
- **Live start/stop**: in `updateSetting`'s `infrastructure` branch (mirroring the
  `document_ocr` cache-clear hook at `systemSettings.ts:742-749`) call
  `clearRenderWorkerSettingsCache()` then `startInlineRenderWorker()` /
  `stopInlineRenderWorker()`.
- **Startup wiring**: in `_core/index.ts` (alongside `startDeferredMediaRetryWorker` at `:1597`),
  guarded `if (await getWebProcessRenderWorkerEnabled()) startInlineRenderWorker();`.

### 4.5 Cancel integration (avoid post-cancel hang)
When a VD assembly `worker_job` is canceled, the linked episode's
`assemblyManifest.compiledVideo` must be reset off `pending` (to `failed`/`canceled`) so the
episode UI unblocks. Add a hook in the cancel path
(`workerJobMonitorService.cancelQueuedJob` or the router) that, for jobType
`vertical_drama_ffmpeg_assembly`, patches `compiledVideo` via `persistCompiledVideoState`.
The `/render-jobs` "queued / waiting for worker" state already renders; add a short copy hint.

### 4.6 Desktop worker — recommendation (investigate, don't build now)
The shipped desktop worker does Hyperframes/Remotion only. Two future options, **not in this
plan's build scope**:
- **(A) Teach the desktop worker ffmpeg assembly** — large: ~1k LOC new Rust executor + contract
  extension + capability advertising. Only worthwhile if an external fleet is actually deployed.
- **(B) Render VD via Remotion** so the existing Hyperframes-capable worker can do it — a larger
  creative/render redesign (the VD graph is currently ffmpeg-native).
**Recommendation:** ship the in-server worker now (this plan); treat desktop-worker ffmpeg
support as a separate future feature. Design the jobType/inputJson generically so a headless
Node worker (or future desktop worker) can claim the same queue without server changes.

## 5. Affected files

**New**
- `apps/web/server/services/inlineRenderWorker.ts` — the drainer loop.
- `apps/web/server/services/renderWorkerSettings.ts` — TTL-cached flag read.
- Tests: `inlineRenderWorker.test.ts`, `renderWorkerSettings.test.ts`,
  `queueVerticalDramaFfmpegAssemblyJob.test.ts`.

**Modified**
- `apps/web/server/services/workerSchedulerService.ts` — new queue fn + capability family +
  discriminated-union branch (`:581-613`).
- `apps/web/shared/workerRuntime.ts` — jobType constant + Zod input contract + capability-family
  const.
- `apps/web/server/routers/verticalDramaEpisodes.ts` — `assembleEpisodeVideo` enqueues instead of
  in-process launch.
- `apps/web/server/routers/verticalDramaSeries.ts` — `assembleProductionEpisodes`,
  `assembleSeasonVideos`, `generateTrailer` (phased — see §6).
- `apps/web/server/routers/systemSettings.ts` — `infrastructure` cache-clear/start-stop hook.
- `apps/web/server/routers/workerJobs.ts` or `workerJobMonitorService.ts` — cancel hook resets
  `compiledVideo`.
- `apps/web/server/_core/index.ts` — startup wiring.
- `apps/web/client/src/pages/AdminSettings.tsx` — admin Switch.
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts` +
  `RenderJobsPage.tsx` — "waiting for worker" copy hint (optional).

## 6. Scope (DECIDED)

**All four ops migrate together** (user decision 2026-07-14): `assembleEpisodeVideo`,
`assembleProductionEpisodes`, `assembleSeasonVideos`, `generateTrailer` — no in-process ffmpeg
launcher remains. Single new jobType `vertical_drama_ffmpeg_assembly` with an `inputJson.kind`
discriminator dispatched by the executor.

**Optional/future (not in this build):** desktop-worker ffmpeg support or Remotion path (§4.6).

## 7. Risk assessment

| Risk | Mitigation |
|---|---|
| No worker online → job hangs queued | User-accepted; cancel already works; cancel resets episode state; UI hint. Consider a startup warning log when the flag is OFF and no external worker seen. |
| Server-worker still on same host CPU | Concurrency cap = 1 (vs today's uncapped); runs off the request path & event loop; own timer with `unref`. Can later move to its own systemd unit / detached process reusing the same code. |
| Double-processing / race | Atomic `WHERE status='queued'` claim + terminal write guarded `WHERE status='running'`. |
| Post-cancel episode UI stuck on `pending` | §4.5 cancel hook resets `compiledVideo`. |
| Concurrent-session / other in-flight work | No schema migration; additive jobType; existing paths untouched until each is migrated. |
| Flag flip mid-render | `stopInlineRenderWorker` clears the timer but lets the in-flight tick finish; loop re-checks flag each tick before claiming. |

## 8. Verification

- Unit: queue fn (idempotency, 0 credits, capability family), `renderWorkerSettings` (TTL, env
  fallback), `inlineRenderWorker` (atomic claim, cancel-guarded terminal write, failure capture,
  concurrency cap) with an injected fake ffmpeg runner (mirror
  `verticalDramaEpisodeVideoAssembly.test.ts` DI convention — no real ffmpeg spawned).
- Integration: enqueue → row appears on `/render-jobs` → flag ON → loop claims → runs → episode
  `compiledVideo.status="ready"` + `videoUrl` set → job `completed`. Flag OFF → stays `queued` →
  user cancel → job `canceled` + episode unblocked.
- Full suite: `pnpm test` (web). Typecheck `pnpm check`.
- Manual: drive the real "รวมวีดีโอ" flow on a test episode with the flag ON and confirm the web
  app stays responsive during render.

## 9. Decisions (RESOLVED 2026-07-14)

1. **Scope** = migrate **all four** ops together (§6).
2. **Admin flag default = OFF.** On deploy no in-server rendering happens until an admin enables
   it (or an external worker appears). Consequence: jobs sit `queued` and the episode shows a
   **"waiting for a worker"** state — the UI must communicate this clearly (§4.5) so it doesn't
   look like the old hang. Admin must flip the toggle ON to render on this box.
3. **Concurrency cap = 1** (configurable via env).
