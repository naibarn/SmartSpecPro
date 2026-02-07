# TDD Plan: Media Job System & Video Editor v0.1

Companion to `claude-plan.md`. Defines test stubs to write BEFORE implementing each phase.

## Testing Infrastructure

- **TypeScript**: Vitest (`pnpm test` in `apps/web/`)
- **Python**: pytest (`pytest` in `python-backend/`)
- **Rust**: Built-in test framework (`cargo test` in `apps/tauri-shell/`)

---

## Phase 1: Job Spec Type System

**File**: `apps/web/client/src/types/__tests__/mediaJob.test.ts`

```
# Test: validateJobSpec accepts valid probe job spec
# Test: validateJobSpec accepts valid render_mp4_h264 job spec
# Test: validateJobSpec rejects missing jobType
# Test: validateJobSpec rejects missing specVersion
# Test: validateJobSpec rejects outMs <= inMs on clip
# Test: validateJobSpec rejects bucketMs outside 10-500 range
# Test: validateJobSpec rejects unknown jobType
# Test: validateJobSpec rejects invalid URI format (contains shell chars)
# Test: projectToTimeline converts seconds to ms correctly
# Test: timelineToProject converts ms to seconds correctly
# Test: projectToTimeline preserves all track/clip data
# Test: msToSeconds and secondsToMs are inverse operations
```

---

## Phase 2: MediaJobClient & Adapter Interface

**File**: `apps/web/client/src/services/__tests__/mediaJobClient.test.ts`

```
# Test: MediaJobClient routes to TauriEngineAdapter when window.__TAURI__ exists
# Test: MediaJobClient routes to WebEngineAdapter when not in Tauri
# Test: submitJob calls adapter.submitJob with correct spec
# Test: waitForCompletion resolves when status is 'done'
# Test: waitForCompletion rejects when status is 'error'
# Test: waitForCompletion calls onProgress callback with each progress event
# Test: cancelJob calls adapter.cancelJob
# Test: probe convenience method builds correct job spec
# Test: renderMp4 convenience method builds correct job spec with timeline
# Test: getWaveformPeaks convenience method builds correct job spec with bucketMs
# Test: detectDeadAir convenience method builds correct job spec with threshold params
```

---

## Phase 3: Desktop Engine Adapter (Rust)

**File**: `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher_tests.rs`

```
# Test: dispatch_job routes probe jobType to probe handler
# Test: dispatch_job routes render_mp4_h264 jobType to render handler
# Test: dispatch_job rejects unknown jobType with error
# Test: dispatch_job validates spec before dispatching
```

**File**: `apps/tauri-shell/src-tauri/src/video_editor/render_tests.rs`

```
# Test: build_filter_complex generates correct trim+setpts for single clip
# Test: build_filter_complex generates trim+concat for two clips on same track
# Test: build_filter_complex generates correct audio atrim+asetpts
# Test: build_filter_complex handles playbackRate != 1.0 (video setpts)
# Test: build_filter_complex handles playbackRate != 1.0 (audio atempo)
# Test: build_filter_complex handles volume != 1.0 per clip
# Test: build_filter_complex handles clips from different input files
# Test: build_filter_complex returns empty string for empty timeline
# Test: build_filter_complex sanitizes all numeric values
# Test: generate_ffmpeg_command includes correct codec and bitrate args
```

**File**: `apps/tauri-shell/src-tauri/src/video_editor/ffmpeg_tests.rs`

```
# Test: parse_waveform_pcm returns correct peak values from raw PCM data
# Test: parse_waveform_pcm normalizes peaks to 0.0-1.0 range
# Test: parse_waveform_pcm respects bucketMs parameter
# Test: parse_waveform_pcm handles mono audio
# Test: parse_silence_detect_output parses silence_start/silence_end from FFmpeg stderr
# Test: parse_silence_detect_output returns empty list for no silence
# Test: parse_silence_detect_output handles overlapping regions
# Test: compute_keep_segments inverts silence segments with padding
# Test: compute_keep_segments merges adjacent keep segments within padding threshold
```

---

## Phase 4: Web Engine Adapter (Python/Node.js)

**File**: `python-backend/tests/test_media_job_worker.py`

```
# Test: parse_job_spec accepts valid probe spec
# Test: parse_job_spec rejects invalid spec (missing fields)
# Test: build_ffmpeg_command_for_probe generates correct ffprobe args
# Test: build_ffmpeg_command_for_render generates correct filter_complex for trim+concat
# Test: build_ffmpeg_command_for_waveform generates correct PCM extraction args
# Test: build_ffmpeg_command_for_silence generates correct silencedetect args
# Test: parse_ffmpeg_progress extracts progress percentage from output
# Test: parse_silence_output extracts silence regions from stderr
# Test: handle_probe returns correct MediaAsset structure
# Test: handle_render_mp4 returns artifact with output path
# Test: handle_waveform_peaks returns peaks array with correct length
```

**File**: `apps/web/server/routers/__tests__/mediaJobs.test.ts`

```
# Test: POST /api/media-jobs validates job spec and returns jobId
# Test: POST /api/media-jobs rejects invalid spec with 400
# Test: GET /api/media-jobs/:id returns job status
# Test: GET /api/media-jobs/:id returns 404 for unknown job
# Test: DELETE /api/media-jobs/:id cancels running job
# Test: SSE endpoint streams progress events
# Test: POST /api/media-jobs/upload accepts file and returns URI
```

---

## Phase 5: Frontend Consolidation & Web UI

**File**: `apps/web/client/src/components/videoeditor/__tests__/VideoEditor.test.tsx`

```
# Test: VideoEditor renders without crashing
# Test: VideoEditor detects platform and uses correct adapter
# Test: MediaLibraryPanel shows upload button on web
# Test: MediaLibraryPanel shows generated media from backend
# Test: ExportDialog triggers download on web platform
# Test: ExportDialog triggers save dialog on desktop platform
# Test: WaveformCanvas renders peaks from waveform_peaks job result
# Test: SilenceDetectionPanel calls detectDeadAir on analyze button click
# Test: SilenceDetectionPanel displays detected silence regions
# Test: SilenceDetectionPanel calls cutDeadAir on remove button click
# Test: PreviewPlayer uses HTML5 video on web
```

**File**: `apps/web/client/src/services/__tests__/webAssetResolver.test.ts`

```
# Test: uploadAsset sends file to upload endpoint and returns URI
# Test: resolveAsset returns https URL for web assets
# Test: resolveAsset caches resolved URLs
```

**File**: `apps/web/client/src/services/__tests__/webProjectManager.test.ts`

```
# Test: saveProject stores project JSON to API
# Test: loadProject retrieves project JSON from API
# Test: exportProject triggers browser download of .videoproj file
# Test: importProject reads .videoproj file from browser file input
```

---

## Phase 6: FFmpeg Bundling

```
# Test (manual/CI): FFmpeg sidecar resolves on macOS
# Test (manual/CI): FFmpeg sidecar resolves on Windows
# Test (manual/CI): Linux gracefully returns error instead of panic
# Test: ffmpeg_version returns valid version string via sidecar
```

---

## Phase 7: Validation & Security

**File**: `apps/web/client/src/types/__tests__/mediaJobValidation.test.ts`

```
# Test: validateJobSpec rejects localhost URI on web backend
# Test: validateJobSpec rejects internal IP URIs (10.x, 172.x, 192.168.x)
# Test: validateJobSpec rejects paths with traversal (..)
# Test: validateJobSpec rejects unknown codecs
# Test: validateJobSpec enforces bitrate limits
# Test: validateJobSpec enforces resolution limits
```

**File**: `python-backend/tests/test_media_job_security.py`

```
# Test: worker rejects job spec with path traversal in URI
# Test: worker rejects job spec with SSRF-prone URI
# Test: worker enforces FFmpeg timeout
# Test: worker enforces max output file size
```
