# Research Findings: Video Editor System Audit

## 1. Codebase Analysis

### 1.1 Frontend Components (23 files)

Located in `apps/web/client/src/components/videoeditor/`:

| Component | Purpose | Status |
|-----------|---------|--------|
| `VideoEditor.tsx` | Phase 0 root — media library + basic layout | Basic implementation |
| `VideoEditorPhase1.tsx` | Phase 1 variant — likely timeline-focused | Exists |
| `VideoEditorPhase2.tsx` | Phase 2 variant — likely preview + render | Exists |
| `VideoEditorPhase3.tsx` | Phase 3 variant — likely full feature set | Exists |
| `Timeline.tsx` | Multi-track timeline visualization | Exists |
| `TimelineClip.tsx` | Individual clip rendering on timeline | Exists |
| `PreviewPlayer.tsx` | Video preview with playback controls | Exists |
| `MediaLibraryPanel.tsx` | Browse/import generated media assets | Exists |
| `Toolbar.tsx` | Editor toolbar (trim, split, etc.) | Exists |
| `ExportDialog.tsx` | Export settings + codec selection | Exists |
| `RenderProgressDialog.tsx` | Render job progress tracking | Exists |
| `AudioDuckingPanel.tsx` | Audio ducking configuration UI | Exists |
| `WaveformCanvas.tsx` | Audio waveform visualization | Exists |
| `SilenceDetectionPanel.tsx` | Silence detection + dead air removal | Exists |
| `SilenceDetectionPanel.css` | Styles for silence detection | Exists |
| `TransitionsPanel.tsx` | Transition effects between clips | Exists |
| `OverlayPanel.tsx` | Overlay track management (text, images) | Exists |
| `AspectRatioSelector.tsx` | Project resolution/aspect ratio picker | Exists |
| `HistoryPanel.tsx` | Undo/redo history | Exists |
| `KeyboardShortcutsOverlay.tsx` | Keyboard shortcut help overlay | Exists |
| `Toast.tsx` | Notification toasts | Exists |
| `ConfirmDialog.tsx` | Confirmation dialogs | Exists |
| `ErrorBoundary.tsx` | React error boundary for editor | Exists |

### 1.2 Type System (446 lines)

File: `apps/web/client/src/types/videoEditor.ts`

**Core Types:**
- `VideoEditorProject` — top-level project container
- `ProjectSettings` — width, height, fps, sampleRate, duration
- `Timeline` → `Track[]` → `Clip[]` — multi-track timeline model
- `Asset` — video/audio/image with metadata, paths, thumbnails, waveformData
- `AudioMixing` → `DuckingConfig` — ducking with threshold, ratio, attack, release, makeupGain, backgroundGain
- `ExportSettings` — codec, bitrate, audioCodec, audioBitrate
- `Effect` — fadeIn, fadeOut, transition, speed, filter
- `ClipTransform` — x, y, scaleX, scaleY, rotation, opacity (for overlays)
- `TransformKeyframe` — animated transform with easing
- `SilentRegion` + `SilenceDetectionConfig` + `SilenceDetectionResult` — silence detection model
- `TimelineState` — currentTime, zoom, scrollLeft, selectedClipIds, playbackState, loopRegion
- `EditorState` — project + timeline state + undo history
- `HistoryEntry` — action + timestamp + full project snapshot
- `RenderJob` — id, status, progress, error
- `MediaLibraryAsset` — generated media from backend

**Helper Functions:**
- `createEmptyProject()` — creates project with V1 video + A1 audio tracks
- `generateId()` — timestamp + random suffix
- `formatTime()` — seconds → MM:SS.ms
- `calculateProjectDuration()` — max clip end time
- `addAssetToProject()` — register asset in project
- `addClipToTrack()` — add clip, sort by startTime
- `findTrackByType()` — find unlocked, unmuted track
- `validateProject()` — check clips exist, assets referenced, duration > 0

### 1.3 Service Layer

**`videoEditorService.ts`:**
- `VideoEditorMediaLibrary` class:
  - `fetchGeneratedVideos()` — list completed video tasks from backend
  - `fetchGeneratedAudio()` — list completed audio tasks from backend
  - `fetchAllGeneratedMedia()` — parallel fetch both
  - `downloadToWorkspace()` — download media file to local Tauri workspace via `save_blob_to_file`
  - `generateThumbnail()` — invoke `ffmpeg_generate_thumbnail`
  - `probeMediaFile()` — invoke `ffmpeg_probe_file`
  - `detectEncoders()` — invoke `ffmpeg_detect_encoders`
  - `getFFmpegVersion()` — invoke `ffmpeg_version`
  - `listWorkspaceFiles()` — invoke `list_workspace_files`
  - `cleanupWorkspace()` — invoke `cleanup_workspace`
  - `deleteFile()` — invoke `delete_file`

- `VideoEditorRenderService` class:
  - `startRender()` — invoke `start_render` with project JSON
  - `getRenderStatus()` — poll job status
  - `cancelRender()` — kill render job
  - `listRenderJobs()` — list all jobs
  - `pollRenderJob()` — poll with progress callback until done

**`projectManager.ts`:**
- `ProjectManager` class:
  - `saveProject()` — Tauri dialog + writeTextFile (`.videoproj` format)
  - `loadProject()` — Tauri dialog + readTextFile + validation
  - `newProject()` — reset state
  - `getRecentProjects()` — localStorage-based recent projects
  - `addToRecent()` — add to recent list
  - `autoSave()` / `loadAutoSave()` / `deleteAutoSave()` — auto-recovery
  - `exportMetadata()` — project stats export
  - `validateProjectStructure()` — thorough security validation (types, ranges, path traversal, XSS)

### 1.4 Routing

The video editor is at route `/video-editor` and is **desktop-only** (Tauri).

---

## 2. Backend Analysis (Rust / Tauri)

### 2.1 FFmpeg Module (`ffmpeg.rs`)

| Command | Status | Notes |
|---------|--------|-------|
| `ffmpeg_probe_file` | **WORKING** | Full ffprobe JSON parsing |
| `ffmpeg_generate_thumbnail` | **WORKING** | Scale to 320px width |
| `ffmpeg_detect_encoders` | **WORKING** | H.264 HW encoder detection |
| `ffmpeg_version` | **WORKING** | Version string extraction |
| `ffmpeg_extract_waveform` | **STUB** | Returns `vec![0.5; samples]` — dummy data. The FFmpeg command runs `showwavespic` filter but result isn't parsed |

**Platform Support:**
- Windows: `resources/ffmpeg/win/ffmpeg.exe`
- macOS: `../Resources/ffmpeg/mac/ffmpeg`
- Linux: **`panic!("Unsupported platform")`** — will crash on Linux

### 2.2 Render Engine (`render.rs`)

| Feature | Status | Notes |
|---------|--------|-------|
| `start_render` | **WORKING** | Spawns async FFmpeg job |
| `get_render_status` | **WORKING** | Poll job status |
| `cancel_render` | **WORKING** | Kill FFmpeg process |
| `list_render_jobs` | **WORKING** | List all jobs |
| `build_filter_complex` | **STUB** | Only does `[0:v]scale=W:H[vout];[0:a]aresample=SR[aout]` |
| Resource limits | **WORKING** | MAX_CLIPS=1000, MAX_DURATION=3600s, MAX_BITRATE=50Mbps, MAX_RESOLUTION=4K |
| Job management | **WORKING** | MAX_CONCURRENT=5, MAX_STORED=100, cleanup threshold=80 |
| Security | **GOOD** | Path sanitization, codec whitelist, numeric validation |

**`build_filter_complex` CRITICAL GAP:**
- Only handles single input (first video + first audio)
- No trim/setpts for individual clips
- No concat for multi-clip timelines
- No volume adjustment per clip
- No speed change (atempo/setpts)
- No fade in/out effects
- No audio ducking (sidechaincompress)
- No overlay support
- DuckingConfig struct exists but is completely unused in filter generation

### 2.3 Workspace (`workspace.rs`)

- All file operations working with security validation
- Path traversal prevention
- File extension whitelisting

---

## 3. Gap Analysis Summary

### CRITICAL (System fundamentally broken without these)

1. **`build_filter_complex` is a stub** — Can only render single-input passthrough. Multi-clip editing, the entire point of a video editor, doesn't work.

2. **`ffmpeg_extract_waveform` returns dummy data** — Audio visualization shows flat line, making audio editing unusable.

3. **Linux not supported** — `get_ffmpeg_path()` panics on Linux. Should either bundle FFmpeg or use system `ffmpeg`.

### HIGH (Important features defined in types but not connected)

4. **Audio ducking not connected** — `DuckingConfig` and `AudioDuckingPanel` exist, but `build_filter_complex` ignores ducking entirely. Need `sidechaincompress` filter.

5. **Clip trimming not rendered** — `Clip.trimIn`/`trimOut` fields exist but `build_filter_complex` doesn't emit `trim` + `setpts` filters.

6. **Speed changes not rendered** — `Clip.speed` field exists but not used in FFmpeg filter generation. Need `setpts=PTS/speed` + `atempo` for audio.

7. **Volume per-clip not rendered** — `Clip.volume` field exists but filter doesn't apply per-clip `volume` filter.

8. **Fade effects not rendered** — `Clip.transitions.fadeIn/fadeOut` exist but not in filter generation.

9. **Overlay tracks not rendered** — `ClipTransform` (position, scale, rotation, opacity, keyframes) defined but `build_filter_complex` doesn't handle overlay tracks.

10. **Silence detection frontend-only** — `SilenceDetectionConfig/Result/SilentRegion` types exist, `SilenceDetectionPanel.tsx` exists, but no backend command for silence detection.

### MEDIUM (Quality of life / production readiness)

11. **No progress tracking during render** — FFmpeg stderr is discarded (`Stdio::null()`), so progress can't be parsed. Progress always 0 until complete.

12. **No tests** — Only 1 trivial test (`test_parse_fps`). No integration tests for render pipeline, project validation, or workspace operations.

13. **Phased components may be inconsistent** — `VideoEditor.tsx`, `VideoEditorPhase1.tsx`, `Phase2.tsx`, `Phase3.tsx` — unclear which is the active version and whether they're in sync.

14. **FFmpeg bundling strategy unclear** — Currently relies on pre-placed binaries in `resources/ffmpeg/`. No build script or CI pipeline to bundle FFmpeg. Tauri 2 sidecar support via `externalBin` config not used.

---

## 4. Web Research: FFmpeg filter_complex Patterns

### 4.1 Multi-clip trim + concat

```
# Trim clip from input 0 (2s to 8s)
[0:v]trim=start=2:end=8,setpts=PTS-STARTPTS[v0];
[0:a]atrim=start=2:end=8,asetpts=PTS-STARTPTS[a0];

# Trim clip from input 1 (0s to 5s)
[1:v]trim=start=0:end=5,setpts=PTS-STARTPTS[v1];
[1:a]atrim=start=0:end=5,asetpts=PTS-STARTPTS[a1];

# Concat all clips
[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]
```

### 4.2 Per-clip volume + speed

```
# Volume adjustment (0.0-2.0)
[0:a]volume=0.7[a0];

# Speed change (video)
[0:v]setpts=PTS/2.0[v_fast];   # 2x speed

# Speed change (audio) — atempo supports 0.5-100.0
[0:a]atempo=2.0[a_fast];        # 2x speed
# For >2x: chain: atempo=2.0,atempo=1.5 for 3x
```

### 4.3 Audio ducking via sidechaincompress

```
# Voiceover on input 1, background music on input 0
[0:a][1:a]sidechaincompress=threshold=0.03:ratio=6:attack=10:release=300:makeup=0:level_sc=1[ducked];
```

### 4.4 Overlay positioning

```
# Overlay input 1 on input 0 at position (100,50) from t=2s to t=7s
[0:v][1:v]overlay=x=100:y=50:enable='between(t,2,7)'[vout]
```

### 4.5 Fade effects

```
# Fade in first 1 second, fade out last 1 second (5s clip)
[0:v]fade=t=in:st=0:d=1,fade=t=out:st=4:d=1[vfaded];
[0:a]afade=t=in:st=0:d=1,afade=t=out:st=4:d=1[afaded];
```

---

## 5. Web Research: Tauri 2 FFmpeg Bundling

### Sidecar Approach (Recommended)

Tauri 2 supports external binaries via `externalBin` in `tauri.conf.json`:

```json
{
  "bundle": {
    "externalBin": [
      "binaries/ffmpeg",
      "binaries/ffprobe"
    ]
  }
}
```

Binary naming convention:
- `binaries/ffmpeg-x86_64-pc-windows-msvc.exe`
- `binaries/ffmpeg-aarch64-apple-darwin`
- `binaries/ffmpeg-x86_64-unknown-linux-gnu`

Access in Rust via `tauri::api::process::sidecar`:
```rust
use tauri_plugin_shell::ShellExt;
let sidecar = app.shell().sidecar("ffmpeg").unwrap();
let (mut rx, child) = sidecar.args(["-version"]).spawn().unwrap();
```

### Static FFmpeg Builds

- **Windows**: https://www.gyan.dev/ffmpeg/builds/ (GPL or LGPL)
- **macOS**: https://evermeet.cx/ffmpeg/ (static universal binary)
- **Linux**: https://johnvansickle.com/ffmpeg/ (static builds, x86_64 and arm64)

### Current vs Recommended

Current approach uses `std::process::Command` with hardcoded paths. The recommended Tauri 2 approach uses the sidecar system which handles path resolution, sandboxing, and cross-platform concerns automatically.

---

## 6. Web Research: React Timeline Editor Libraries

### Options Considered

1. **react-konva** — Canvas-based, good for custom timeline rendering
2. **wavesurfer.js** — Audio waveform visualization, widely used
3. **Remotion** — React-based video composition (different use case — rendering, not editing)
4. **Custom Canvas** — Most editors use custom canvas for precise control

### Current Implementation

The project uses custom React components (`Timeline.tsx`, `TimelineClip.tsx`, `WaveformCanvas.tsx`) rather than third-party libraries. This is a reasonable approach for a specialized editor but requires more implementation work.

### Waveform Visualization

`wavesurfer.js` could replace the dummy waveform data by processing audio client-side, but the better approach is to fix the FFmpeg backend to return real waveform data and render it on the `WaveformCanvas.tsx` component.

---

## 7. Media Job Spec (v0.1) — User-Provided Architecture Document

The user provided a comprehensive **platform-agnostic Media Job Spec** that defines the contract between UI and Media Engine. This fundamentally changes the architecture from "fix current Tauri FFmpeg calls" to "build a job-based abstraction layer."

### 7.1 Key Architecture Decisions

1. **Platform-agnostic**: UI sends JSON Job Specs, never raw FFmpeg commands
2. **Engine adapters**: Desktop sidecar (FFmpeg), Web backend (worker), Web light (WASM)
3. **Deterministic & cacheable**: spec + inputs → same outputs (content hash)
4. **Progress-first**: All jobs report progress/eta/logs
5. **Composable**: Jobs can chain (probe → analyze → render)

### 7.2 Job Types Defined (v0.1)

| Job Type | Purpose | Priority for v0.1 |
|----------|---------|-------------------|
| `probe` | Extract metadata/streams/duration | Core |
| `render_mp4_h264` | Render timeline/clip to MP4 (H.264+AAC) | Core |
| `render_hls` | Create HLS VOD (m3u8 + segments) | Core |
| `waveform_peaks` | Waveform data for timeline visualization | Core |
| `thumbnails` | Thumbnail scrub/preview generation | Core |
| `subtitles_extract` | Extract subtitle tracks to SRT/VTT | Core |
| `subtitles_burnin` | Burn subtitles into video (re-encode) | Core |
| `concat` | Combine clips (copy/reencode/filter_complex) | Core |
| `dead_air_detect` | Detect silence regions | Core |
| `dead_air_cut` | Remove/compress silence regions | Core |
| `generate_clip_from_api` | Call external API to generate media | Core |

### 7.3 Key Models

**Asset Model**: Kind (video/audio/image/subtitle), URI (file/https/asset://), MIME, streams info, duration
**Timeline/Project**: Tracks (video/audio/subtitle), Clips with inMs/outMs/startMs/playbackRate/volume
**Job Envelope**: specVersion, jobId, jobType, inputs, output, engine strategy, cache, telemetry
**Progress Events**: status (queued/running/done/error/canceled), progress %, ETA, stage, speed metrics

### 7.4 Impact on Current Codebase

The current codebase uses direct Tauri `invoke()` calls to FFmpeg commands. The Job Spec architecture requires:

1. **New abstraction layer**: `MediaJobClient` that submits Job Specs
2. **Engine adapters**:
   - Desktop: Tauri sidecar adapter (translates Job Spec → FFmpeg commands)
   - Web: Backend API adapter (submits to worker queue)
3. **Current types need alignment**: Existing `VideoEditorProject` uses seconds, Job Spec uses milliseconds
4. **URI system**: Replace direct file paths with `file://`, `https://`, `asset://` URIs
5. **Progress system**: Replace polling with event-based progress (SSE/WebSocket for web, Tauri events for desktop)
6. **Caching**: Content hash-based caching for waveforms, thumbnails, probes

### 7.5 Web Backend Implications

The spec defines a web API pattern:
- `POST /jobs` — submit job spec
- `GET /jobs/{id}` — get status/result
- `GET /jobs/{id}/events` — SSE/WebSocket for live progress
- Storage: pre-signed URLs for uploads, object storage + CDN for outputs
- Worker queue (BullMQ already in codebase) for job processing

### 7.6 v0.2 Roadmap (deferred)

- Transitions (crossfade, fade in/out)
- Overlays (picture-in-picture, text)
- Color correction LUT
- Multi-audio tracks mixing
- EDL import/export
- Multi-bitrate HLS ladder + DRM
