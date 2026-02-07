# Implementation Plan: Media Job System & Video Editor v0.1

## Overview

This plan transforms the SmartSpecPro video editor from a tightly-coupled Tauri/FFmpeg desktop tool into a platform-agnostic media processing system. The key architectural change is introducing a **Media Job Spec** contract — a JSON-based abstraction layer between the UI and media engines. Two engine adapters will be built: a Desktop adapter (Tauri 2 sidecar FFmpeg) and a Web adapter (Python/Celery FFmpeg worker orchestrated by Node.js).

The plan covers 9 implementation phases, ordered by dependency.

### Phase Dependency DAG

```
Phase 1 (Types) ──► Phase 2 (Client) ──► Phase 3 (Desktop Adapter) ──► Phase 6 (FFmpeg Bundling)
                                    └──► Phase 4 (Web Adapter) ──► Phase 5a (Frontend Consolidation)
                                                                  └──► Phase 5b (Web UI)
                                    └──► Phase 7 (Validation)
Phase 8 (Testing) — runs alongside all phases
```

Phases 3 and 4 can be parallelized. Phase 5b (Web UI) is independent of 5a but depends on Phase 4.

### Review Integration

This plan incorporates feedback from Opus review (iteration-1). Key changes from initial draft:
- Shared types moved from `client/src/types/` to `apps/web/shared/types/`
- Redis key schema defined for Node.js-Celery communication (not Celery internals)
- Auth/authz added to all media job endpoints
- Web UI split into separate Phase 5b
- Project format versioning (v1.0 seconds → v2.0 ms)
- Audio-only/video-only handling in filter_complex
- Audit logging integration
- Celery auto-discovery path fix
- Process tracking bug fix in render.rs

---

## Phase 1: Job Spec Type System & Shared Contract

### Goal
Define the TypeScript types for the Media Job Spec v0.1 contract. These types are the foundation that all other phases depend on.

### Location
`apps/web/shared/types/mediaJob.ts` (new file — shared between client and server via `@shared/` alias)

### Types to Define

**Asset model:**
```typescript
interface MediaAsset {
  assetId: string
  kind: "video" | "audio" | "image" | "subtitle"
  uri: string               // file:// | https:// | asset://
  mime?: string
  label?: string
  durationMs?: number
  streams?: MediaStream[]
  contentHash?: string
  extra?: Record<string, unknown>
}

interface MediaStream {
  type: "video" | "audio"
  codec: string
  // video-specific: width, height, fps
  // audio-specific: channels, sampleRate
}
```

**Timeline model (ms-based):**
```typescript
interface MediaTimeline {
  projectId: string
  fps: number
  width: number
  height: number
  tracks: MediaTrack[]
}

interface MediaTrack {
  trackId: string
  type: "video" | "audio" | "subtitle"
  clips: MediaClip[]
}

interface MediaClip {
  clipId: string
  assetId: string
  inMs?: number
  outMs?: number
  startMs: number
  playbackRate?: number
  volume?: number
  mute?: boolean
}
```

**Job envelope:**
```typescript
type MediaJobType = "probe" | "render_mp4_h264" | "render_hls" | "waveform_peaks" | "thumbnails" | "subtitles_extract" | "subtitles_burnin" | "concat" | "dead_air_detect" | "dead_air_cut" | "generate_clip_from_api"

interface MediaJobSpec {
  specVersion: "0.1"
  jobId: string
  jobType: MediaJobType
  priority?: "low" | "normal" | "high"
  inputs: { assets?: MediaAsset[]; project?: MediaTimeline | null }
  params?: Record<string, unknown>
  output: { mode: "file" | "dir" | "memory"; target: string; overwrite?: boolean }
  engine?: { strategy: "desktop_sidecar" | "web_backend" | "web_wasm"; hints?: Record<string, unknown> }
  cache?: { enabled?: boolean; key?: string }
  telemetry?: { traceId?: string }
}
```

**Progress & result:**
```typescript
type MediaJobStatus = "queued" | "running" | "done" | "error" | "canceled"

interface MediaJobProgress {
  jobId: string
  status: MediaJobStatus
  progress: number          // 0.0 - 1.0
  etaMs?: number
  stage?: string
  message?: string
  metrics?: { speed?: string; outTimeMs?: number }
}

interface MediaJobResult {
  jobId: string
  status: "done"
  artifacts: MediaArtifact[]
  derived?: Record<string, unknown>
}

interface MediaJobError {
  jobId: string
  status: "error"
  error: { code: string; message: string; details?: Record<string, unknown> }
}

interface MediaArtifact {
  kind: string
  uri: string
  mime?: string
}
```

### Migration Helpers

Add conversion functions between the existing `VideoEditorProject` types (seconds) and the new Job Spec types (milliseconds):

```typescript
function projectToTimeline(project: VideoEditorProject): MediaTimeline
function timelineToProject(timeline: MediaTimeline): VideoEditorProject
function msToSeconds(ms: number): number
function secondsToMs(s: number): number
```

### Validation

Add a `validateJobSpec(spec: MediaJobSpec): { valid: boolean; errors: string[] }` function that checks:
- Required fields present
- `outMs > inMs` for clips
- Valid job type
- URI format validation
- Numeric ranges (bucketMs 10-500, segmentSeconds 2-10, etc.)

---

## Phase 2: MediaJobClient & Engine Adapter Interface

### Goal
Create the frontend abstraction layer that routes job submissions to the correct engine.

### Location
`apps/web/client/src/services/mediaJobClient.ts` (new file)

### Interface

```typescript
interface IEngineAdapter {
  submitJob(spec: MediaJobSpec): Promise<string>  // returns jobId
  getStatus(jobId: string): Promise<MediaJobProgress>
  cancelJob(jobId: string): Promise<void>
  onProgress(jobId: string, callback: (progress: MediaJobProgress) => void): () => void  // returns unsubscribe
}

class MediaJobClient {
  constructor(adapter: IEngineAdapter)
  submitJob(spec: MediaJobSpec): Promise<string>
  waitForCompletion(jobId: string, onProgress?: (p: MediaJobProgress) => void): Promise<MediaJobResult>
  cancelJob(jobId: string): Promise<void>
}
```

### Adapter Selection

The client auto-selects adapter based on environment:
- If `window.__TAURI__` exists → `TauriEngineAdapter`
- Otherwise → `WebEngineAdapter`

### Convenience Methods

Add typed wrappers for common operations:

```typescript
class MediaJobClient {
  probe(assetUri: string): Promise<MediaAsset>
  renderMp4(project: MediaTimeline, outputTarget: string, params?: RenderParams): Promise<MediaJobResult>
  getWaveformPeaks(assetUri: string, bucketMs?: number): Promise<WaveformResult>
  getThumbnails(assetUri: string, intervalMs?: number): Promise<ThumbnailResult>
  detectDeadAir(assetUri: string, params?: DeadAirParams): Promise<DeadAirResult>
  cutDeadAir(assetUri: string, segments: SilenceSegment[], mode?: "remove" | "compress"): Promise<MediaJobResult>
  extractSubtitles(assetUri: string, format?: "srt" | "vtt"): Promise<MediaJobResult>
  concat(clips: ConcatClip[], strategy?: "concat_copy" | "concat_reencode"): Promise<MediaJobResult>
}
```

---

## Phase 3: Desktop Engine Adapter (Tauri Sidecar)

### Goal
Implement the Tauri-side adapter that translates Job Specs into FFmpeg sidecar commands.

### 3.1 FFmpeg Sidecar Setup

**Switch from manual binary paths to Tauri 2 `externalBin`:**

In `tauri.conf.json`, add:
```json
{
  "bundle": {
    "externalBin": ["binaries/ffmpeg", "binaries/ffprobe"]
  }
}
```

Binary naming: `binaries/ffmpeg-{target_triple}[.exe]`

Replace `get_ffmpeg_path()` and `get_ffprobe_path()` in `ffmpeg.rs` to use `app.shell().sidecar("ffmpeg")` from `tauri-plugin-shell`. This eliminates the Linux panic and handles cross-platform resolution automatically.

### 3.2 Rust Job Dispatcher

Create a new module `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher.rs`:

This module receives a JSON Job Spec string, deserializes it, validates it, and dispatches to the appropriate handler:

- `probe` → existing `ffmpeg_probe_file` logic (wrap)
- `render_mp4_h264` → new `render_mp4` function using rebuilt `build_filter_complex`
- `waveform_peaks` → new `extract_waveform_peaks` function (real FFmpeg data)
- `thumbnails` → existing `ffmpeg_generate_thumbnail` logic (wrap)
- `dead_air_detect` → new `detect_silence` function
- `dead_air_cut` → new `cut_silence` function
- `concat` → new `concat_clips` function
- `subtitles_extract` → new `extract_subtitles` function

### 3.3 Rebuild `build_filter_complex`

The critical fix. Replace the stub in `render.rs` with a real filter graph generator.

**Input**: `MediaTimeline` (from Job Spec) with tracks, clips, assets
**Output**: FFmpeg `-filter_complex` string + input/output mapping args

**Algorithm for v0.1 (trim + concat)**:

1. **Probe inputs first**: Determine which inputs have video streams, audio streams, or both. This prevents invalid filter graph errors for audio-only or video-only assets.

2. For each clip, check the asset's stream types:
   - **Video+Audio asset**: Emit both `[{idx}:v]trim=...` and `[{idx}:a]atrim=...`
   - **Video-only asset**: Emit `[{idx}:v]trim=...` only; generate silent audio via `anullsrc` for concat compatibility
   - **Audio-only asset**: Emit `[{idx}:a]atrim=...` only; skip video or generate black video via `color` source

3. For each video clip:
   - Emit `[{idx}:v]trim=start={inMs/1000}:end={outMs/1000},setpts=PTS-STARTPTS,scale={W}:{H}[v{n}]`
   - If `playbackRate != 1.0`: insert `,setpts=PTS/{rate}` before scale

4. For each audio clip:
   - Emit `[{idx}:a]atrim=start={inMs/1000}:end={outMs/1000},asetpts=PTS-STARTPTS[a{n}]`
   - If `playbackRate != 1.0`: append `,atempo={rate}` (chain multiple `atempo` for rates >2.0)
   - If `volume != 1.0`: append `,volume={vol}`

5. Concat: `[v0][a0][v1][a1]...concat=n={N}:v=1:a=1[vout][aout]`
6. Single clip: `[v0]` → `[vout]`, `[a0]` → `[aout]`

**Security**: All numeric values passed through `sanitize_numeric()`. All paths through `sanitize_path()`. Codec through `sanitize_codec()`.

**Bug fix**: The existing `sanitize_path()` only allows video/audio extensions. Extend the allowlist to include `.srt`, `.vtt`, `.jpg`, `.png`, `.webp`, `.json` for subtitle extraction, thumbnails, and waveform output.

**Bug fix**: The existing `cancel_render` cannot find the FFmpeg process because the child is never stored in `self.processes`. Fix by inserting the child process into the HashMap after spawn.

### 3.4 Waveform Peaks (Real Data)

Replace the stub in `ffmpeg_extract_waveform`. Use FFmpeg's `astats` or `volumedetect` filter with raw PCM output:

```
ffmpeg -i input.mp4 -af "aformat=sample_fmts=s16:channel_layouts=mono" -f s16le -
```

Read raw 16-bit PCM samples, bucket them by `bucketMs`, compute peak amplitude per bucket, normalize to 0.0-1.0 range.

Output: `{ bucketMs: number, peaks: number[], durationMs: number }`

### 3.5 Silence Detection

New FFmpeg-based silence detection using `silencedetect` filter:

```
ffmpeg -i input.mp4 -af "silencedetect=noise={thresholdDb}dB:d={minSilenceMs/1000}" -f null -
```

Parse stderr for `silence_start` and `silence_end` lines. Return:
- `silenceSegments`: `[{ startMs, endMs, durationMs }]`
- `keepSegments`: computed inverse (active audio regions with padding)

### 3.6 Progress Reporting

Replace `Stdio::null()` for stderr with `Stdio::piped()` and parse progress:

Use `-progress pipe:1` flag. Parse `out_time_us` and `speed` from stdout. Emit Tauri events:
```rust
app.emit("media-job-progress", MediaJobProgress { ... })
```

Frontend `TauriEngineAdapter` listens via `listen("media-job-progress", ...)`.

### 3.7 TypeScript Adapter

`apps/web/client/src/services/tauriEngineAdapter.ts`:

Implements `IEngineAdapter`. Uses `invoke("submit_media_job", { specJson })` for submission, `listen("media-job-progress")` for progress.

---

## Phase 4: Web Engine Adapter (Python/Celery)

### Goal
Implement the web backend that executes FFmpeg jobs via Python/Celery, orchestrated by Node.js.

### 4.1 Python Celery Worker

**Location**: `python-backend/app/workers/media_job_worker.py` (new)

New Celery task `execute_media_job(spec_json: str) -> dict`:

1. Parse and validate the Job Spec JSON
2. Resolve asset URIs (download if needed, resolve `asset://` references)
3. Dispatch to job handler based on `jobType`
4. Report progress via Celery task state updates (`self.update_state(state="PROGRESS", meta={...})`)
5. Return result JSON (artifacts, derived data)

**Job handlers** (each a function in `media_job_worker.py` or sub-modules):

| Handler | FFmpeg Pattern |
|---------|---------------|
| `handle_probe` | `ffprobe -print_format json -show_format -show_streams` |
| `handle_render_mp4` | Build filter_complex same as desktop, execute FFmpeg |
| `handle_waveform_peaks` | Extract PCM, bucket peaks |
| `handle_thumbnails` | `ffmpeg -ss {t} -i input -vframes 1 -q:v 2` per interval |
| `handle_dead_air_detect` | `silencedetect` filter parsing |
| `handle_dead_air_cut` | Build trim+concat from keep segments |
| `handle_concat` | concat demuxer or filter_complex |
| `handle_subtitles_extract` | `ffmpeg -i input -map 0:s:{idx} output.srt` |

**FFmpeg path**: Use system `ffmpeg` on web backend (not bundled). Validate it exists at startup.

**Progress**: Use `-progress pipe:1` flag, parse `out_time_us` / `speed`, update Celery state.

### 4.2 Node.js API Routes

**Location**: `apps/web/server/routers/mediaJobs.ts` (new tRPC router) or Express routes

Endpoints:

```
POST   /api/media-jobs          — Submit job spec, enqueue to Celery, return jobId
GET    /api/media-jobs/:id      — Get job status/result (poll Celery task state)
DELETE /api/media-jobs/:id      — Cancel job (revoke Celery task)
GET    /api/media-jobs/:id/events — SSE stream of progress events
```

**Communication with Celery** — Use a well-defined Redis key schema owned by the application (NOT Celery's internal keys):

```
media-job:{jobId}:status  → JSON { status, progress, etaMs, stage, message, metrics }
media-job:{jobId}:result  → JSON { artifacts, derived } (set on completion)
media-job:{jobId}:error   → JSON { code, message, details } (set on failure)
```

The Python Celery worker writes to these keys on every progress update. The Node.js API reads from them. This decouples from Celery's internal result backend format.

Additionally, the worker publishes to a Redis channel `media-job-progress:{jobId}` for real-time streaming (avoids polling).

**SSE streaming**: Node.js subscribes to the Redis pub/sub channel `media-job-progress:{jobId}` and forwards events to the SSE connection. Falls back to polling the status key every 1s if pub/sub misses events.

**SSE via Express (not tRPC)**: SSE does not work naturally with tRPC. Use Express route for SSE, tRPC procedures for CRUD. This follows the existing pattern in `apps/web/server/_core/llmRoutes.ts` for LLM streaming.

**Auth/Authz**: All media job endpoints require `protectedProcedure`. Users can only see/cancel their own jobs. Admin can see all jobs. Per-user concurrent job limit: 3 (configurable). Rate limit on job submission via existing `rateLimitedProcedure`.

**Audit logging**: Every job submission, completion, and failure produces an audit event via `auditLogger.log()` with `eventType: "media_request"` / `"media_response"`. Include traceId from the job spec's telemetry field.

**Celery auto-discovery**: Add `"app.workers"` to the `autodiscover_tasks` list in `python-backend/app/core/celery_app.py`, or place the worker at `app/tasks/media_job_worker.py`.

### 4.3 TypeScript WebEngineAdapter

`apps/web/client/src/services/webEngineAdapter.ts`:

Implements `IEngineAdapter`:
- `submitJob()`: POST to `/api/media-jobs`
- `getStatus()`: GET from `/api/media-jobs/:id`
- `cancelJob()`: DELETE `/api/media-jobs/:id`
- `onProgress()`: Connect to SSE at `/api/media-jobs/:id/events`

---

## Phase 5: Frontend Consolidation

### Goal
Merge the 4 VideoEditor component variants into a single component wired to the MediaJobClient.

### 5.1 Audit Phase Components

Read all 4 variants to determine which has the most complete UI:
- `VideoEditor.tsx` (Phase 0) — basic media library
- `VideoEditorPhase1.tsx` — timeline features
- `VideoEditorPhase2.tsx` — preview + render features
- `VideoEditorPhase3.tsx` — full feature set

Keep the most complete variant as the base, port missing features from others.

### 5.2 Wire to MediaJobClient

Replace all direct `invoke()` calls to Tauri commands with `MediaJobClient` methods:

| Current | New |
|---------|-----|
| `invoke('ffmpeg_probe_file', ...)` | `jobClient.probe(uri)` |
| `invoke('start_render', ...)` | `jobClient.renderMp4(project, output)` |
| `invoke('ffmpeg_extract_waveform', ...)` | `jobClient.getWaveformPeaks(uri)` |
| `invoke('ffmpeg_generate_thumbnail', ...)` | `jobClient.getThumbnails(uri)` |
| Direct Tauri events for progress | `jobClient.waitForCompletion(id, onProgress)` |

### 5.3 Time Unit Migration

Update `types/videoEditor.ts`:
- Rename time fields: `startTime` → `startMs`, `duration` → `durationMs`, `trimIn` → `inMs`, `trimOut` → `outMs`
- Update all component references
- **Bump project version** from `"1.0"` to `"2.0"` for ms-based projects
- **Migration on load**: When `projectManager.loadProject()` reads a file with `version: "1.0"`, automatically convert all time values from seconds to ms, update version to `"2.0"`, and save. This is deterministic — no heuristic guessing.
- Remove `@ts-nocheck` from `videoEditorService.ts` during refactor
- Eliminate duplicate type definitions (`MediaLibraryAsset` and `RenderJob` are defined in both `videoEditor.ts` and `videoEditorService.ts`) — consolidate to single source of truth
- Fix `projectManager.ts` validation bug: checks `settings.sample_rate` (snake_case) but the type uses `sampleRate` (camelCase)

### 5.4 Waveform Visualization

Update `WaveformCanvas.tsx` to receive real peak data from the `waveform_peaks` job instead of dummy `[0.5, 0.5, ...]`. The component already renders a canvas — just needs real data input.

### 5.5 Silence Detection Panel

Wire `SilenceDetectionPanel.tsx` to the `dead_air_detect` and `dead_air_cut` job types:
- "Analyze" button → `jobClient.detectDeadAir()`
- Display detected silence regions in the panel
- "Remove" / "Compress" buttons → `jobClient.cutDeadAir()`

---

## Phase 5b: Web UI Support (Enable Video Editor on Web)

### Goal
Make the video editor work in web browsers, not just the Tauri desktop app.

**The video editor is currently desktop-only** (`/video-editor` route has a Tauri guard). This phase makes it work in web browsers too, using the `WebEngineAdapter` for all FFmpeg operations.

**Route changes:**
- Remove the Tauri-only guard on `/video-editor` route
- If on web, `MediaJobClient` automatically selects `WebEngineAdapter`
- Add `/video-editor` to the navigation menu (visible on both desktop and web)

**File access adaptation:**
The desktop version uses Tauri's `invoke('save_blob_to_file')` for local file I/O. The web version needs browser-native equivalents:

| Desktop (Tauri) | Web (Browser) |
|-----------------|---------------|
| `invoke('save_blob_to_file')` | Upload to server via `POST /api/media-jobs/upload` |
| `invoke('file_exists')` | Check via API or skip |
| Tauri file dialog (`save`/`open`) | HTML `<input type="file">` + download links |
| Local workspace paths (`file://`) | Server-side temp storage (`https://` URLs) |
| `readTextFile`/`writeTextFile` | IndexedDB or server-side storage for projects |

**Create `WebAssetResolver`:**
A service that handles asset resolution for the web platform:
- Upload files via multipart upload to `POST /api/media-jobs/upload`
- Follow the existing upload pattern in the codebase (magic byte validation, extension whitelist, file size limits)
- **Max file size**: 2GB per upload (configurable)
- **Content type validation**: Validate magic bytes, not just file extension
- **Storage**: Uploaded files go to S3/R2 (existing object storage) with auto-cleanup after 24h
- Return `https://` URIs for uploaded assets
- Cache downloaded thumbnails/waveforms in browser memory

**Project save/load on web:**
- `ProjectManager` currently uses Tauri `writeTextFile`/`readTextFile`
- Create a `WebProjectManager` that uses:
  - Server-side storage (save project JSON to API endpoint)
  - Or browser IndexedDB for offline/draft support
  - Download project as `.videoproj` file (browser download)
  - Import via `<input type="file">`

**Preview player on web:**
- `PreviewPlayer.tsx` may use Tauri-specific APIs
- Web version uses standard HTML5 `<video>` element with `https://` source URLs
- Proxy media URLs through the server if needed (CORS)

**Media library on web:**
- `MediaLibraryPanel.tsx` fetches generated media from the backend
- Desktop: downloads to local workspace, then references by `file://`
- Web: references by `https://` URL directly (no local download needed)
- Add upload capability: users can upload their own media files

**UI adaptations:**
- Add "Upload Media" button (web only) alongside "From Generated" (existing)
- Export dialog: web version downloads the file instead of saving to local path
- Render progress: identical UI, but progress comes via SSE instead of Tauri events

### 5b.7 Navigation & Menu Integration

Add video editor to the app's navigation:

In `packages/shared/src/constants/menu.ts`:
```typescript
{ id: 'video-editor', label: 'Video Editor', icon: 'Film', path: '/video-editor', group: 'tools', sortOrder: 8 }
```

In `apps/web/client/src/hooks/useMenuItems.ts`:
```typescript
Film: Film,  // from lucide-react
```

In `apps/web/client/src/App.tsx`:
```tsx
<Route path="/video-editor" component={VideoEditorPage} />
```

---

## Phase 6: FFmpeg Bundling & Sidecar Setup

### Goal
Properly bundle FFmpeg/FFprobe as Tauri 2 sidecars for macOS and Windows.

### 6.1 Binary Placement

Create `apps/tauri-shell/binaries/` directory with platform-specific FFmpeg static builds:

```
binaries/
  ffmpeg-x86_64-pc-windows-msvc.exe
  ffprobe-x86_64-pc-windows-msvc.exe
  ffmpeg-aarch64-apple-darwin
  ffprobe-aarch64-apple-darwin
  ffmpeg-x86_64-apple-darwin
  ffprobe-x86_64-apple-darwin
```

### 6.2 Tauri Config

Update `tauri.conf.json`:
```json
{
  "bundle": {
    "externalBin": ["binaries/ffmpeg", "binaries/ffprobe"]
  }
}
```

### 6.3 Rust Code Migration

Replace all `get_ffmpeg_path()` / `get_ffprobe_path()` calls with sidecar resolution:

```rust
use tauri_plugin_shell::ShellExt;
let (rx, child) = app.shell().sidecar("ffmpeg")?.args(&ffmpeg_args).spawn()?;
```

The sidecar system automatically resolves the correct binary for the current platform.

### 6.4 Graceful Linux Fallback

Replace `panic!("Unsupported platform")` with a graceful error:
- Try to find system `ffmpeg` in PATH
- If found, use it (development/CI fallback)
- If not found, return clear error message

---

## Phase 7: Validation & Security Hardening

### Goal
Implement the validation rules from the Job Spec §9 and security guidance from §10.

### 7.1 Job Spec Schema Validation

Create a validation layer that runs before any engine execution:
- Validate against known job types
- Check required fields per job type
- Enforce numeric ranges (bucketMs: 10-500, segmentSeconds: 2-10)
- Validate URIs (no localhost/internal IPs on web backend — SSRF prevention)
- Validate codec/preset against allowlist

### 7.2 Desktop Sandbox

Output paths must be within the Tauri workspace directory. Validate before job execution.

### 7.3 Web Backend Isolation

- Validate incoming job specs at the API layer
- Sanitize all paths
- Celery worker runs FFmpeg with resource limits (timeout, max output size)
- No user-supplied FFmpeg args — only job-spec-derived commands

---

## Phase 8: Testing Strategy

### 8.1 Existing Testing Infrastructure

- **TypeScript**: Vitest (`pnpm test` in `apps/web/`)
- **Python**: pytest (`pytest` in `python-backend/`)
- **Rust**: Built-in test framework (`cargo test` in `apps/tauri-shell/`)

### 8.2 Test Categories

**Unit tests (TypeScript)**:
- Job Spec type validation
- `projectToTimeline` / `timelineToProject` conversion
- `validateJobSpec` edge cases
- MediaJobClient routing logic

**Unit tests (Rust)**:
- `build_filter_complex` for various timeline configurations
- Waveform peak bucketing algorithm
- Silence detection stderr parsing
- Path sanitization
- Codec validation

**Unit tests (Python)**:
- Job spec parsing and validation
- FFmpeg command generation per job type
- Waveform peak computation
- Silence segment parsing

**Integration tests**:
- Desktop: Submit job spec → sidecar executes → result returned
- Web: Submit via API → Celery processes → result via SSE
- End-to-end: Frontend submits job → progress events → final result

---

## File Change Summary

### New Files

| File | Phase | Description |
|------|-------|-------------|
| `apps/web/client/src/types/mediaJob.ts` | 1 | Job Spec type definitions |
| `apps/web/client/src/services/mediaJobClient.ts` | 2 | Frontend job client + adapter interface |
| `apps/web/client/src/services/tauriEngineAdapter.ts` | 3 | Desktop engine adapter |
| `apps/web/client/src/services/webEngineAdapter.ts` | 4 | Web engine adapter |
| `apps/web/client/src/services/webAssetResolver.ts` | 5 | Web platform asset upload/resolution |
| `apps/web/client/src/services/webProjectManager.ts` | 5 | Web platform project save/load (API + IndexedDB) |
| `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher.rs` | 3 | Rust job dispatcher |
| `python-backend/app/workers/media_job_worker.py` | 4 | Celery FFmpeg worker |
| `apps/web/server/routers/mediaJobs.ts` | 4 | Node.js job API routes (submit, status, SSE, upload) |

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `apps/tauri-shell/src-tauri/src/video_editor/ffmpeg.rs` | 3, 6 | Sidecar migration, real waveform, silence detection |
| `apps/tauri-shell/src-tauri/src/video_editor/render.rs` | 3 | Rebuild `build_filter_complex`, progress reporting |
| `apps/tauri-shell/src-tauri/src/video_editor/mod.rs` | 3 | Export new dispatcher module |
| `apps/tauri-shell/src-tauri/src/lib.rs` | 3 | Register new Tauri commands |
| `apps/tauri-shell/src-tauri/tauri.conf.json` | 6 | Add externalBin config |
| `apps/web/client/src/types/videoEditor.ts` | 5 | Migrate to ms, add migration helpers |
| `apps/web/client/src/components/videoeditor/VideoEditor.tsx` | 5 | Consolidated component, platform-aware |
| `apps/web/client/src/components/videoeditor/MediaLibraryPanel.tsx` | 5 | Add upload capability for web |
| `apps/web/client/src/components/videoeditor/ExportDialog.tsx` | 5 | Web: download file; Desktop: save dialog |
| `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx` | 5 | Web: HTML5 video with https URLs |
| `apps/web/client/src/components/videoeditor/WaveformCanvas.tsx` | 5 | Wire to real data |
| `apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx` | 5 | Wire to backend |
| `apps/web/client/src/services/videoEditorService.ts` | 5 | Refactor to use MediaJobClient |
| `apps/web/client/src/services/projectManager.ts` | 5 | Add platform detection, delegate to web/desktop |
| `apps/web/client/src/App.tsx` | 5 | Add /video-editor route (remove Tauri guard) |
| `packages/shared/src/constants/menu.ts` | 5 | Add video editor menu item |
| `apps/web/client/src/hooks/useMenuItems.ts` | 5 | Add Film icon mapping |
| `apps/web/server/routers.ts` | 4 | Mount mediaJobs router |

### Deleted Files (after consolidation)

| File | Phase | Reason |
|------|-------|--------|
| `VideoEditorPhase1.tsx` | 5 | Merged into consolidated VideoEditor |
| `VideoEditorPhase2.tsx` | 5 | Merged into consolidated VideoEditor |
| `VideoEditorPhase3.tsx` | 5 | Merged into consolidated VideoEditor |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| FFmpeg sidecar binary size (~80-100MB per platform) | Medium | Use `externalBin`, download at install time, or use git-lfs |
| Celery-Node.js communication complexity | Medium | Use Redis as shared state; keep protocol simple (task state polling) |
| Time unit migration breaks existing projects | Low | Add migration detection (check if values look like seconds vs ms) |
| Multi-clip filter_complex FFmpeg errors | High | Extensive unit tests for filter generation, test with real media files |
| Progress parsing reliability | Medium | Use `-progress pipe:1` (structured) over stderr parsing (fragile) |
