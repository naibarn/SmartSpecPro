No existing sections yet. Now I have complete context. Let me produce the section content.

# Section 03: Desktop Engine Adapter (Tauri Sidecar)

## Overview

This section implements the Tauri-side engine adapter that translates Media Job Specs into FFmpeg sidecar commands. It encompasses both the TypeScript `TauriEngineAdapter` (frontend) and the Rust `job_dispatcher` module (backend), plus rebuilding the `build_filter_complex` function, implementing real waveform extraction, silence detection, and fixing the process-tracking bug in render cancellation.

## Dependencies

- **section-01-job-spec-types**: The `MediaJobSpec`, `MediaTimeline`, `MediaClip`, `MediaAsset`, `MediaJobProgress`, `MediaJobResult`, `MediaJobError`, and `MediaJobStatus` types must exist in `apps/web/shared/types/mediaJob.ts`.
- **section-02-media-job-client**: The `IEngineAdapter` interface and `MediaJobClient` class must exist in `apps/web/client/src/services/mediaJobClient.ts`.

## Existing Code Inventory

Before implementing, the following files already exist and must be understood:

### Rust files (all under `apps/tauri-shell/src-tauri/src/video_editor/`)

- **`mod.rs`** -- Module declaration. Currently exports `ffmpeg`, `workspace`, and `render` sub-modules. Must be updated to also export the new `job_dispatcher` module.
- **`ffmpeg.rs`** -- Contains `get_ffmpeg_path()`, `get_ffprobe_path()`, `ffmpeg_probe_file`, `ffmpeg_generate_thumbnail`, `ffmpeg_detect_encoders`, `ffmpeg_version`, and `ffmpeg_extract_waveform`. Key issues:
  - `get_ffmpeg_path()` panics on Linux (`panic!("Unsupported platform for bundled FFmpeg")`)
  - `ffmpeg_extract_waveform` returns dummy data (`vec![0.5; samples]`) instead of real PCM peaks
- **`render.rs`** -- Contains the `RenderEngine`, `build_filter_complex` (stub -- only does scale+resample), `generate_ffmpeg_command`, `start_render`, `cancel_render`, `sanitize_path`, `sanitize_codec`, `sanitize_numeric`, and project types (`VideoEditorProject`, `Clip`, `Track`, `Asset`, etc.). Key issues:
  - `build_filter_complex` is a stub (Phase 0) that only outputs `[0:v]scale=W:H[vout];[0:a]aresample=SR[aout]`
  - `cancel_render` cannot find the FFmpeg process because the child is never inserted into `self.processes` after spawn
  - `sanitize_path` only allows `mp4|mov|avi|mkv|mp3|wav|aac` extensions -- needs `.srt`, `.vtt`, `.jpg`, `.png`, `.webp`, `.json`
  - stderr is `Stdio::null()` so no progress reporting is possible
- **`workspace.rs`** -- Workspace file management. Not modified in this section.

### TypeScript (frontend)

- **`apps/web/client/src/services/tauriEngineAdapter.ts`** -- Does NOT exist yet. Must be created.

### Configuration

- **`apps/tauri-shell/src-tauri/tauri.conf.json`** -- Currently has no `externalBin` entry. Does not include `tauri-plugin-shell`.
- **`apps/tauri-shell/src-tauri/Cargo.toml`** -- Does not list `tauri-plugin-shell`, `uuid`, or `dirs` as dependencies (though `uuid` and `dirs` are used in existing code, suggesting they come in transitively or the code does not compile yet).

---

## Tests FIRST

All tests should be written before implementation. The tests below are stubs -- write the test signatures and docstrings, then implement the production code to make them pass.

### Rust Tests: Job Dispatcher

**File**: `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher_tests.rs`

```
Test: dispatch_job routes probe jobType to probe handler
  - Create a valid MediaJobSpec JSON with jobType "probe" and a dummy asset URI
  - Call dispatch_job with the JSON string
  - Verify the result is routed to the probe handler (may need to mock FFmpeg)

Test: dispatch_job routes render_mp4_h264 jobType to render handler
  - Create a valid MediaJobSpec JSON with jobType "render_mp4_h264", a MediaTimeline, and assets
  - Call dispatch_job with the JSON string
  - Verify the result is routed to the render handler

Test: dispatch_job rejects unknown jobType with error
  - Create a MediaJobSpec JSON with jobType "unknown_type"
  - Call dispatch_job
  - Verify it returns an error containing "unknown" or "unsupported"

Test: dispatch_job validates spec before dispatching
  - Create a MediaJobSpec JSON missing required fields (e.g., no specVersion)
  - Call dispatch_job
  - Verify it returns a validation error before reaching any handler
```

### Rust Tests: Rebuilt build_filter_complex

**File**: `apps/tauri-shell/src-tauri/src/video_editor/render_tests.rs`

```
Test: build_filter_complex generates correct trim+setpts for single clip
  - Create a MediaTimeline with one video track, one clip (inMs=1000, outMs=5000)
  - Call build_filter_complex
  - Verify output contains: [0:v]trim=start=1.0:end=5.0,setpts=PTS-STARTPTS,scale=W:H[v0]
  - Verify output contains: [0:a]atrim=start=1.0:end=5.0,asetpts=PTS-STARTPTS[a0]

Test: build_filter_complex generates trim+concat for two clips on same track
  - Create a MediaTimeline with one video track containing two clips from different assets
  - Call build_filter_complex
  - Verify the output includes a concat=n=2:v=1:a=1[vout][aout] segment

Test: build_filter_complex generates correct audio atrim+asetpts
  - Create a timeline with an audio-only clip
  - Verify output includes atrim and asetpts operations

Test: build_filter_complex handles playbackRate != 1.0 (video setpts)
  - Create a clip with playbackRate=2.0
  - Verify output includes setpts=PTS/2.0 before scale

Test: build_filter_complex handles playbackRate != 1.0 (audio atempo)
  - Create a clip with playbackRate=2.0
  - Verify output includes atempo=2.0
  - Also test playbackRate=4.0 to verify chained atempo (atempo=2.0,atempo=2.0)

Test: build_filter_complex handles volume != 1.0 per clip
  - Create a clip with volume=0.5
  - Verify output includes volume=0.5 in the audio filter chain

Test: build_filter_complex handles clips from different input files
  - Two clips referencing different assets (different input indices)
  - Verify trim operations reference correct input indices [0:v], [1:v], etc.

Test: build_filter_complex returns empty string for empty timeline
  - Timeline with no tracks or no clips
  - Verify returns empty string (falls through to simple mapping)

Test: build_filter_complex sanitizes all numeric values
  - Verify all numeric values in the output are passed through sanitize_numeric
  - Attempt injection via a crafted playbackRate or volume value

Test: generate_ffmpeg_command includes correct codec and bitrate args
  - Create a full project with export settings
  - Verify the output args include -c:v, -b:v, -c:a, -b:a with correct values
```

### Rust Tests: Waveform and Silence Detection

**File**: `apps/tauri-shell/src-tauri/src/video_editor/ffmpeg_tests.rs`

```
Test: parse_waveform_pcm returns correct peak values from raw PCM data
  - Provide a buffer of raw 16-bit signed PCM samples
  - Call the bucketing function
  - Verify peaks are computed as max(abs(sample)) per bucket

Test: parse_waveform_pcm normalizes peaks to 0.0-1.0 range
  - Provide PCM data with known max amplitude (e.g., i16::MAX)
  - Verify the peak for that bucket is 1.0

Test: parse_waveform_pcm respects bucketMs parameter
  - Provide PCM data at 44100 Hz sample rate, bucketMs=100
  - Verify the number of buckets equals ceil(durationMs / bucketMs)

Test: parse_waveform_pcm handles mono audio
  - Provide single-channel PCM data
  - Verify it processes correctly without panicking

Test: parse_silence_detect_output parses silence_start/silence_end from FFmpeg stderr
  - Provide sample FFmpeg stderr containing:
    [silencedetect @ 0x...] silence_start: 1.234
    [silencedetect @ 0x...] silence_end: 3.456 | silence_duration: 2.222
  - Verify output is [{ startMs: 1234, endMs: 3456, durationMs: 2222 }]

Test: parse_silence_detect_output returns empty list for no silence
  - Provide stderr with no silencedetect lines
  - Verify returns empty vec

Test: parse_silence_detect_output handles overlapping regions
  - Provide stderr with multiple silence regions
  - Verify all are parsed and returned in order

Test: compute_keep_segments inverts silence segments with padding
  - Given total duration 10000ms and silence at [2000, 4000]
  - With padding 200ms
  - Verify keep segments are [0, 2200] and [3800, 10000]

Test: compute_keep_segments merges adjacent keep segments within padding threshold
  - Given two silence segments very close together
  - Verify the two resulting keep segments are merged into one
```

### TypeScript Tests: TauriEngineAdapter

**File**: `apps/web/client/src/services/__tests__/tauriEngineAdapter.test.ts`

These tests run in Vitest. Since `window.__TAURI__` and `invoke`/`listen` are Tauri APIs, they must be mocked.

```
Test: submitJob calls invoke("submit_media_job") with serialized spec JSON
  - Mock window.__TAURI_INTERNALS__.invoke
  - Create a valid MediaJobSpec
  - Call adapter.submitJob(spec)
  - Verify invoke was called with "submit_media_job" and { specJson: JSON.stringify(spec) }
  - Verify it returns the jobId from the invoke result

Test: getStatus calls invoke("get_media_job_status") with jobId
  - Mock invoke to return a MediaJobProgress object
  - Call adapter.getStatus("test-id")
  - Verify invoke called with correct args and result is properly typed

Test: cancelJob calls invoke("cancel_media_job") with jobId
  - Mock invoke
  - Call adapter.cancelJob("test-id")
  - Verify invoke was called with "cancel_media_job" and { jobId: "test-id" }

Test: onProgress subscribes to "media-job-progress" Tauri event and filters by jobId
  - Mock the Tauri listen function
  - Call adapter.onProgress("job-123", callback)
  - Simulate an event with jobId "job-123" and one with "job-456"
  - Verify callback was called only for "job-123"
  - Verify the returned unsubscribe function calls unlisten
```

---

## Implementation Details

### 3.1 Add `tauri-plugin-shell` Dependency

**File to modify**: `apps/tauri-shell/src-tauri/Cargo.toml`

Add `tauri-plugin-shell` to the `[dependencies]` section:

```toml
tauri-plugin-shell = "2"
```

Also add `uuid` and `dirs` if they are not already transitively available (they are used in `ffmpeg.rs` and `workspace.rs`):

```toml
uuid = { version = "1", features = ["v4"] }
dirs = "5"
```

**File to modify**: `apps/tauri-shell/src-tauri/src/lib.rs`

Register the shell plugin in the Tauri builder:

```rust
.plugin(tauri_plugin_shell::init())
```

Also register the new `submit_media_job`, `get_media_job_status`, and `cancel_media_job` Tauri commands in the `invoke_handler`.

### 3.2 Rust Job Dispatcher Module

**File to create**: `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher.rs`

This module is the central entry point for all media job execution on the desktop. It:

1. Receives a JSON string (the serialized `MediaJobSpec`)
2. Deserializes it into Rust structs (define `MediaJobSpec`, `MediaTimeline`, `MediaClip`, `MediaAsset` as Rust `serde::Deserialize` structs matching the TypeScript types from section-01)
3. Validates the spec (required fields, valid jobType, numeric ranges)
4. Dispatches to the appropriate handler function based on `jobType`

**Rust struct definitions** needed (mirror the TypeScript types):

- `MediaJobSpec` with fields: `spec_version`, `job_id`, `job_type` (as enum), `priority`, `inputs`, `params`, `output`, `engine`, `cache`, `telemetry`
- `MediaJobInputs` with fields: `assets` (optional Vec), `project` (optional `MediaTimeline`)
- `MediaTimeline` with fields: `project_id`, `fps`, `width`, `height`, `tracks`
- `MediaTrack` with fields: `track_id`, `track_type`, `clips`
- `MediaClip` with fields: `clip_id`, `asset_id`, `in_ms`, `out_ms`, `start_ms`, `playback_rate`, `volume`, `mute`
- `MediaAsset` with fields: `asset_id`, `kind`, `uri`, `mime`, `label`, `duration_ms`, `streams`, `content_hash`
- `MediaJobOutput` with fields: `mode`, `target`, `overwrite`

**Job type dispatch table**:

| `jobType` | Handler | Source |
|-----------|---------|--------|
| `probe` | Wraps existing `ffmpeg_probe_file` logic | `ffmpeg.rs` |
| `render_mp4_h264` | New `render_mp4` using rebuilt `build_filter_complex` | `render.rs` |
| `waveform_peaks` | New `extract_waveform_peaks` (real FFmpeg PCM data) | `ffmpeg.rs` |
| `thumbnails` | Wraps existing `ffmpeg_generate_thumbnail` logic | `ffmpeg.rs` |
| `dead_air_detect` | New `detect_silence` function | New in `ffmpeg.rs` |
| `dead_air_cut` | New `cut_silence` function | New in `ffmpeg.rs` |
| `concat` | New `concat_clips` function | New in `render.rs` |
| `subtitles_extract` | New `extract_subtitles` function | New in `ffmpeg.rs` |

**Tauri command** to expose:

```rust
#[tauri::command]
pub async fn submit_media_job(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
    spec_json: String
) -> Result<String, String> {
    // Parse, validate, dispatch
    // Return job_id
}
```

The command should:
- Deserialize `spec_json` into `MediaJobSpec`
- Validate the spec
- Generate a `job_id` if not provided
- Spawn a tokio task to execute the job asynchronously
- Emit `media-job-progress` Tauri events during execution
- Return the `job_id` immediately

### 3.3 Rebuild `build_filter_complex`

**File to modify**: `apps/tauri-shell/src-tauri/src/video_editor/render.rs`

Replace the stub `build_filter_complex` with a real filter graph generator. The new function signature should accept a `MediaTimeline` (from the job spec types) plus a list of resolved assets with their stream metadata.

**Algorithm (trim + concat for v0.1)**:

1. **Probe inputs first**: For each unique input asset, determine whether it has video streams, audio streams, or both. This prevents invalid filter graph errors.

2. **For each clip** in the timeline:
   - **Video+Audio asset**: Emit both video trim and audio atrim filter segments
   - **Video-only asset**: Emit video trim; generate silent audio via `anullsrc=r=48000:cl=stereo` for concat compatibility
   - **Audio-only asset**: Emit audio atrim; generate black video via `color=c=black:s=WxH:r=fps` for concat compatibility

3. **Video filter chain per clip**:
   ```
   [{idx}:v]trim=start={inMs/1000}:end={outMs/1000},setpts=PTS-STARTPTS
   ```
   - If `playbackRate != 1.0`: insert `,setpts=PTS/{rate}` before scale
   - Append `,scale={width}:{height}[v{n}]`

4. **Audio filter chain per clip**:
   ```
   [{idx}:a]atrim=start={inMs/1000}:end={outMs/1000},asetpts=PTS-STARTPTS
   ```
   - If `playbackRate != 1.0`: append `,atempo={rate}`. For rates > 2.0, chain multiple `atempo` filters (each maxes at 2.0). For rates < 0.5, chain multiple atempo filters (each mins at 0.5).
   - If `volume != 1.0`: append `,volume={vol}`
   - Label: `[a{n}]`

5. **Concat or passthrough**:
   - Multiple clips: `[v0][a0][v1][a1]...concat=n={N}:v=1:a=1[vout][aout]`
   - Single clip: Map `[v0]` directly to `[vout]`, `[a0]` to `[aout]` (avoids unnecessary concat filter)

6. **All numeric values** must pass through the existing `sanitize_numeric()` function. All paths through `sanitize_path()`.

### 3.4 Fix `sanitize_path` Extension Allowlist

**File to modify**: `apps/tauri-shell/src-tauri/src/video_editor/render.rs`

The current `sanitize_path` function only allows: `mp4|mov|avi|mkv|mp3|wav|aac`.

Extend the allowlist to include:
- Subtitle formats: `srt`, `vtt`
- Image formats: `jpg`, `jpeg`, `png`, `webp`
- Data formats: `json`
- Additional video: `webm`, `flv`, `ts`

This is needed because waveform output may be JSON, thumbnail output is JPG/PNG, and subtitle extraction produces SRT/VTT.

### 3.5 Fix Process Tracking Bug in `cancel_render`

**File to modify**: `apps/tauri-shell/src-tauri/src/video_editor/render.rs`

**Bug**: In `execute_render`, after `Command::new(&ffmpeg_path).spawn()` succeeds, the `Child` process is used locally to `child.wait()` but is **never inserted** into `self.processes`. When `cancel_render` tries to find and kill the process via `processes.remove(&job_id)`, it always finds nothing.

**Fix**: After a successful `spawn()`, immediately insert the child process into the processes HashMap:

```rust
let child = Command::new(&ffmpeg_path)
    .args(&ffmpeg_cmd)
    .stdout(Stdio::piped())   // changed from null for progress
    .stderr(Stdio::piped())   // changed from null for progress
    .spawn()
    .map_err(|e| ...)?;

// INSERT CHILD INTO PROCESSES MAP
{
    let mut procs = processes.lock().unwrap();
    procs.insert(job_id.clone(), child);
}

// Wait for completion using the processes map
// ...retrieve from map to call wait()...
```

The tricky part is that `child.wait()` takes `&mut self`, so the child must be retrieved from the map for waiting. One approach: store the child, then take it out for `wait()`. Another: use `child.try_wait()` in a loop, checking for cancellation between iterations.

### 3.6 Real Waveform Extraction

**File to modify**: `apps/tauri-shell/src-tauri/src/video_editor/ffmpeg.rs`

Replace the dummy data in `ffmpeg_extract_waveform` with real PCM extraction.

**FFmpeg command to extract raw PCM**:
```
ffmpeg -i input.mp4 -af "aformat=sample_fmts=s16:channel_layouts=mono" -f s16le -
```

This outputs raw signed 16-bit little-endian mono PCM to stdout.

**Processing algorithm** (new function `parse_waveform_pcm`):
1. Read raw bytes from stdout
2. Interpret as `i16` samples (2 bytes each, little-endian)
3. Determine samples per bucket: `sample_rate * bucket_ms / 1000`
4. For each bucket, compute peak: `max(abs(sample))` across all samples in bucket
5. Normalize: divide each peak by `i16::MAX` (32767) to get 0.0-1.0 range
6. Return `{ bucketMs, peaks: Vec<f32>, durationMs }`

The `bucketMs` parameter replaces the old `samples` parameter. If the caller provides `bucketMs=50` (default), and the audio is 10 seconds at 44100 Hz, there will be 200 buckets.

**Resource limit**: Keep the existing `MAX_WAVEFORM_SAMPLES` cap (10000), but apply it to the bucket count, not raw sample count.

### 3.7 Silence Detection

**File to modify**: `apps/tauri-shell/src-tauri/src/video_editor/ffmpeg.rs`

Add two new functions:

**`detect_silence`** -- Uses FFmpeg's `silencedetect` filter:
```
ffmpeg -i input.mp4 -af "silencedetect=noise={thresholdDb}dB:d={minSilenceMs/1000}" -f null -
```

Parse stderr for lines matching:
```
[silencedetect @ 0x...] silence_start: {float}
[silencedetect @ 0x...] silence_end: {float} | silence_duration: {float}
```

New function `parse_silence_detect_output(stderr: &str) -> Vec<SilenceSegment>`:
- Use regex or string parsing to extract `silence_start` and `silence_end` values
- Convert from seconds to milliseconds
- Return a `Vec<SilenceSegment>` where each segment has `start_ms`, `end_ms`, `duration_ms`

**`compute_keep_segments`** -- Inverts silence segments to get "keep" regions:
- Takes `silence_segments`, `total_duration_ms`, and `padding_ms`
- Returns the inverse: audio-active regions with optional padding around boundaries
- Merges adjacent keep segments that are closer together than `padding_ms * 2`

**`cut_silence`** -- Uses the keep segments to build a trim+concat filter:
- Mode `"remove"`: Cut out silence entirely
- Mode `"compress"`: Speed up silence regions (e.g., 8x speed)
- Both modes build an FFmpeg filter graph using the same `build_filter_complex` patterns (trim per segment, concat all)

### 3.8 Progress Reporting

**File to modify**: `apps/tauri-shell/src-tauri/src/video_editor/render.rs`

Currently FFmpeg is spawned with `Stdio::null()` for both stdout and stderr, making progress tracking impossible.

**Change**: Use FFmpeg's `-progress pipe:1` flag, which outputs structured progress data to stdout:

```
out_time_us=1234567
speed=2.5x
progress=continue
```

Implementation:
1. Add `-progress pipe:1` to the FFmpeg args
2. Spawn with `stdout: Stdio::piped()`, `stderr: Stdio::piped()`
3. Read stdout line by line in a loop
4. Parse `out_time_us` (divide by 1_000_000 to get seconds, then by total duration for 0.0-1.0 progress)
5. Parse `speed` for display
6. Emit Tauri event on each update:
   ```rust
   app.emit("media-job-progress", MediaJobProgress {
       job_id: job_id.clone(),
       status: "running",
       progress: computed_progress,
       eta_ms: computed_eta,
       stage: Some("encoding".to_string()),
       message: None,
       metrics: Some(Metrics { speed, out_time_ms }),
   });
   ```
7. When `progress=end` is received, the job is complete

**Important**: Read stderr in a separate thread to prevent pipe buffer deadlocks. FFmpeg outputs diagnostic info to stderr which can fill the OS pipe buffer (typically 64KB), blocking the process if not consumed.

### 3.9 TypeScript TauriEngineAdapter

**File to create**: `apps/web/client/src/services/tauriEngineAdapter.ts`

Implements the `IEngineAdapter` interface from section-02.

```typescript
import type {
  IEngineAdapter,
  MediaJobSpec,
  MediaJobProgress,
} from "./mediaJobClient";

export class TauriEngineAdapter implements IEngineAdapter {
  /**
   * Submit a job by invoking the Rust command via Tauri IPC.
   * Serializes the spec to JSON and passes to submit_media_job.
   * Returns the jobId assigned by the Rust dispatcher.
   */
  async submitJob(spec: MediaJobSpec): Promise<string> {
    // Use invoke("submit_media_job", { specJson: JSON.stringify(spec) })
  }

  /**
   * Get current status of a running job.
   * Calls invoke("get_media_job_status", { jobId })
   */
  async getStatus(jobId: string): Promise<MediaJobProgress> {
    // Use invoke("get_media_job_status", { jobId })
  }

  /**
   * Cancel a running job.
   * Calls invoke("cancel_media_job", { jobId })
   */
  async cancelJob(jobId: string): Promise<void> {
    // Use invoke("cancel_media_job", { jobId })
  }

  /**
   * Subscribe to real-time progress events for a specific job.
   * Listens to the "media-job-progress" Tauri event, filters by jobId.
   * Returns an unsubscribe function.
   */
  onProgress(
    jobId: string,
    callback: (progress: MediaJobProgress) => void
  ): () => void {
    // Use listen("media-job-progress", handler) from @tauri-apps/api/event
    // Filter events by jobId match
    // Return the unlisten function
  }
}
```

The Tauri APIs to use:
- `invoke` from `@tauri-apps/api/core` (Tauri 2)
- `listen` from `@tauri-apps/api/event` (Tauri 2)

### 3.10 Register New Commands in lib.rs

**File to modify**: `apps/tauri-shell/src-tauri/src/lib.rs`

Add to `invoke_handler`:
```rust
video_editor::job_dispatcher::submit_media_job,
video_editor::job_dispatcher::get_media_job_status,
video_editor::job_dispatcher::cancel_media_job,
```

### 3.11 Update Module Declarations

**File to modify**: `apps/tauri-shell/src-tauri/src/video_editor/mod.rs`

Add the new module:
```rust
pub mod job_dispatcher;
```

---

## File Summary

### New Files

| File | Description |
|------|-------------|
| `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher.rs` | Rust job dispatcher: deserialize, validate, route to handlers |
| `apps/tauri-shell/src-tauri/src/video_editor/job_dispatcher_tests.rs` | Unit tests for dispatcher routing and validation |
| `apps/tauri-shell/src-tauri/src/video_editor/render_tests.rs` | Unit tests for rebuilt build_filter_complex |
| `apps/tauri-shell/src-tauri/src/video_editor/ffmpeg_tests.rs` | Unit tests for waveform parsing, silence detection |
| `apps/web/client/src/services/tauriEngineAdapter.ts` | TypeScript adapter implementing IEngineAdapter for Tauri IPC |
| `apps/web/client/src/services/__tests__/tauriEngineAdapter.test.ts` | Vitest tests for TauriEngineAdapter |

### Modified Files

| File | Changes |
|------|---------|
| `apps/tauri-shell/src-tauri/Cargo.toml` | Add `tauri-plugin-shell`, `uuid`, `dirs` dependencies |
| `apps/tauri-shell/src-tauri/src/lib.rs` | Register shell plugin, add new Tauri commands to invoke_handler |
| `apps/tauri-shell/src-tauri/src/video_editor/mod.rs` | Add `pub mod job_dispatcher;` |
| `apps/tauri-shell/src-tauri/src/video_editor/render.rs` | Rebuild `build_filter_complex`, fix process tracking bug, add progress reporting, extend `sanitize_path` |
| `apps/tauri-shell/src-tauri/src/video_editor/ffmpeg.rs` | Replace waveform stub with real PCM extraction, add silence detection functions |

---

## Implementation Checklist

1. Write all test stubs (Rust: job_dispatcher_tests, render_tests, ffmpeg_tests; TypeScript: tauriEngineAdapter.test.ts)
2. Add `tauri-plugin-shell` to `Cargo.toml` and register plugin in `lib.rs`
3. Define Rust serde structs for MediaJobSpec and related types in `job_dispatcher.rs`
4. Implement `dispatch_job` routing function and `submit_media_job` Tauri command
5. Extend `sanitize_path` extension allowlist in `render.rs`
6. Rebuild `build_filter_complex` in `render.rs` with trim+concat algorithm
7. Fix process tracking bug: insert child into `processes` HashMap after spawn
8. Implement progress reporting with `-progress pipe:1` and Tauri event emission
9. Implement real waveform extraction (`parse_waveform_pcm`) in `ffmpeg.rs`
10. Implement silence detection (`parse_silence_detect_output`, `compute_keep_segments`, `detect_silence`, `cut_silence`) in `ffmpeg.rs`
11. Create `TauriEngineAdapter` TypeScript class in `tauriEngineAdapter.ts`
12. Update `mod.rs` to export `job_dispatcher`
13. Register new commands in `lib.rs` invoke_handler
14. Run `cargo test` in `apps/tauri-shell/src-tauri/` to verify Rust tests pass
15. Run `pnpm test` in `apps/web/` to verify TypeScript tests pass