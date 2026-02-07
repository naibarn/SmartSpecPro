# Synthesized Specification: Media Job System & Video Editor Completeness

## 1. Problem Statement

SmartSpecPro's video editing system has a partially-implemented Rust/Tauri backend and a comprehensive React frontend (~23 components, 446-line type system). The render engine's core function `build_filter_complex` is a stub (only scale+resample), waveform extraction returns dummy data, and silence detection has UI but no backend. The system is desktop-only with direct FFmpeg command invocation tightly coupled to Tauri.

A new **Media Job Spec (v0.1)** architecture has been designed to decouple the UI from engine-specific concerns. The goal is to refactor the current system to use this platform-agnostic job contract, enabling both Desktop (Tauri sidecar) and Web (Python/Celery worker) engines to serve the same UI.

## 2. Scope — What We're Building

### 2.1 Core Deliverables (v0.1)

1. **Media Job Spec type system** — Shared TypeScript types matching the v0.1 JSON contract (Asset, Timeline, Job Envelope, Progress, Result, Error)

2. **MediaJobClient abstraction** — Frontend service that submits Job Specs and receives progress/results, routing to the correct engine adapter

3. **Desktop Engine Adapter (Tauri sidecar)** — Translates Job Specs into FFmpeg commands, executed via Tauri 2 `externalBin` sidecar. Replaces current direct `std::process::Command` calls.

4. **Web Engine Adapter (Python/Celery)** — New Celery tasks that execute FFmpeg jobs. Node.js API orchestrates job submission and streams progress via SSE/WebSocket.

5. **Job types implemented for v0.1**:
   - `probe` — Extract metadata (already working, needs adapter wrapping)
   - `render_mp4_h264` — Multi-clip trim+concat render to MP4
   - `waveform_peaks` — Real waveform data extraction (fix stub)
   - `thumbnails` — Thumbnail generation (already working, needs adapter wrapping)
   - `dead_air_detect` — Silence detection (new)
   - `dead_air_cut` — Silence removal/compression (new)
   - `concat` — Clip concatenation (new, part of render)
   - `subtitles_extract` — Extract subtitle tracks (new)

6. **Frontend consolidation** — Merge VideoEditor Phase0/1/2/3 into single component using Job Spec client

7. **Time unit migration** — Video editor domain uses milliseconds (ms) throughout. Other system modules untouched.

### 2.2 Deferred to v0.2

- Transitions (crossfade, fade in/out)
- Overlays (picture-in-picture, text)
- Audio ducking (sidechaincompress)
- Color correction LUT
- HLS rendering (`render_hls`)
- `subtitles_burnin`
- `generate_clip_from_api`
- Multi-bitrate HLS ladder + DRM
- WASM engine adapter

### 2.3 Out of Scope

- Linux platform support (deferred)
- Changes to existing non-video-editor modules
- Database schema changes

## 3. Architecture

### 3.1 Overall Flow

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  VideoEditor → MediaJobClient.submitJob(jobSpec)        │
│                                                          │
│  MediaJobClient routes to adapter based on environment:  │
│    - Desktop? → TauriEngineAdapter                       │
│    - Web?     → WebEngineAdapter                         │
└──────────┬──────────────────────┬────────────────────────┘
           │                      │
    ┌──────▼──────┐       ┌──────▼──────────────────┐
    │   Tauri     │       │   Node.js API            │
    │   Sidecar   │       │   POST /api/media-jobs   │
    │   (FFmpeg)  │       │   GET  /api/media-jobs/:id│
    │             │       │   SSE  /api/media-jobs/:id/events│
    └─────────────┘       └──────┬──────────────────┘
                                  │
                          ┌──────▼──────────────┐
                          │   Python/Celery      │
                          │   FFmpeg Worker      │
                          │   (media_job_worker) │
                          └──────────────────────┘
```

### 3.2 Component Responsibilities

| Component | Language | Responsibility |
|-----------|----------|---------------|
| `MediaJobClient` | TypeScript | Submit jobs, route to adapter, receive progress |
| `TauriEngineAdapter` | TypeScript + Rust | Desktop: translate Job Spec → FFmpeg sidecar commands |
| `WebEngineAdapter` | TypeScript | Web: submit to Node.js API, subscribe to SSE |
| Node.js API routes | TypeScript | Accept jobs, enqueue to Celery, stream progress |
| Celery `media_job_worker` | Python | Execute FFmpeg, report progress, return artifacts |
| Job Spec types | TypeScript (shared) | Type definitions for the contract |

### 3.3 Time Units Convention

- **Video editor domain**: All time values in **milliseconds (ms)**
- **Job Spec JSON**: All time values in **milliseconds (ms)**
- **FFmpeg commands**: Converted to seconds at the engine adapter level
- **Existing system modules**: Unchanged (keep their current units)

## 4. Platform Priorities

- **macOS + Windows**: Primary targets for v0.1
- **Linux**: Deferred (currently panics — should gracefully error instead of panic)
- **Web**: Full support via Python/Celery backend

## 5. Security Requirements

- Job Spec validation (schema check) before engine execution
- Allowlisted job types, codecs, presets
- Path sanitization (prevent traversal, injection)
- Output paths restricted to sandbox/workspace
- No raw FFmpeg args from UI
- URL validation for web backend (prevent SSRF)

## 6. Progress & Observability

- All jobs report progress events: status, progress %, ETA, stage, speed
- Desktop: Tauri events (emit from sidecar to frontend)
- Web: SSE stream from Node.js API, backed by Celery task state
- FFmpeg progress parsed from `-progress pipe:1` or stderr `time=` pattern

## 7. Caching

- Cache key: `hash(inputs) + hash(spec)`
- Applicable to: waveform_peaks, thumbnails, probe
- Desktop: file-based cache in workspace
- Web: object storage with cache headers

## 8. Existing Code to Preserve

| Component | Status | Action |
|-----------|--------|--------|
| `ffmpeg.rs` probe/thumbnail/encoders | Working | Wrap in adapter, keep logic |
| `render.rs` job management | Working | Keep job lifecycle, replace filter generation |
| `workspace.rs` | Working | Keep as-is for desktop file ops |
| `videoEditorService.ts` | Working | Refactor to use MediaJobClient |
| `projectManager.ts` | Working | Keep, update types to ms |
| All 23 React components | Mixed | Consolidate Phase0-3, wire to job client |
| `types/videoEditor.ts` | Complete | Migrate to ms, add Job Spec types |

## 9. Success Criteria

1. Multi-clip trim+concat renders correctly on macOS and Windows
2. Waveform visualization shows real audio data (not flat line)
3. Silence detection identifies dead air regions and can cut/compress them
4. Same Job Spec JSON works on both Desktop (sidecar) and Web (Celery)
5. Progress events stream to UI during render
6. Consolidated VideoEditor component replaces Phase0/1/2/3
7. No regressions in existing system modules
