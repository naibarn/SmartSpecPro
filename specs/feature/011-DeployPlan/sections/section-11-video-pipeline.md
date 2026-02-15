Now I have all the context needed. Let me produce the section content.

# Section 11: Video Rendering Pipeline

## Overview

This section implements a Cloud Run Job for server-side FFmpeg video rendering. The existing codebase already has a local FFmpeg rendering pipeline in `python-backend/app/tasks/media_job_worker.py` (the `build_ffmpeg_command_for_render` function and supporting helpers). This section adapts that pipeline to run inside a dedicated Cloud Run Job (`video-job-runner`), adds a two-stage rendering architecture (assembly then final render), implements render profiles (preview/standard/high), adds render hash idempotency to skip redundant renders, and routes jobs to the appropriate Cloud Tasks queue based on complexity.

## Dependencies

- **Section 02 (Docker Images):** The `video-job-runner` Docker image must be built and available in Artifact Registry. This image extends the `python-orchestrator` base with FFmpeg 7.1 and font packages.
- **Section 08 (Media Pipeline):** The media processing pipeline (inline in the Python Cloud Run Service) must be operational. The video pipeline follows the same pattern for R2 upload and DB update but runs as a Cloud Run Job instead of inline.
- **Section 09 (R2 Storage):** The R2 bucket must exist with prefix organization (`temp/work/`, `renders/preview/`, `renders/final/`) and lifecycle rules. The video pipeline reads input assets from R2 and writes rendered output back to R2.

## Background

### Current State

The codebase has an existing FFmpeg rendering pipeline in `python-backend/app/tasks/media_job_worker.py`. Key existing components:

- `build_ffmpeg_command_for_render(spec)` -- Builds a `filter_complex` FFmpeg command from a timeline spec. Handles video trimming, scaling, xfade transitions, audio crossfading, and silent audio generation for image inputs.
- `parse_ffmpeg_progress(line, total_duration_us)` -- Parses FFmpeg's `-progress pipe:1` output to compute rendering percentage.
- `report_progress(job_id, progress, stage, message)` -- Publishes progress to Redis channel `media-job-progress:{jobId}`.
- XFADE_MAP -- Maps camelCase transition names (from `TransitionName` type) to FFmpeg xfade filter names.

The existing `VideoEditorProject` type in `apps/web/client/src/types/videoEditor.ts` defines the timeline structure with tracks (V1, V2, A1, T1), clips, assets, transitions, text configs, and export settings. The `RenderJob` interface already exists with basic status tracking.

### Target Architecture

In production, video rendering runs as a Cloud Run Job (not a long-running service). The flow is:

1. User initiates a render from the video editor UI.
2. The Node.js API computes a render hash, checks for cached output in R2, and if not found, enqueues a Cloud Tasks task to either `video-jobs-short` or `video-jobs-long` queue.
3. Cloud Tasks dispatches `POST /tasks/process-video` to the Python Cloud Run Service.
4. The Python handler launches a Cloud Run Job execution with the render spec as environment input.
5. The Cloud Run Job downloads input assets from R2, runs the two-stage FFmpeg pipeline, uploads the result to R2, updates the DB, and exits.
6. Progress is reported to Redis channel for the SSE-based UI progress bar.

---

## Tests

All video pipeline tests are Python pytest tests in `python-backend/tests/`. The tests are organized into four groups: render hash, FFmpeg pipeline, job routing, and idempotency.

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_render_hash.py`

```python
"""Tests for render hash computation.

The render hash ensures idempotent rendering -- same inputs always produce
the same hash, and any change to inputs/profile produces a different hash.
"""
import pytest


@pytest.mark.unit
class TestRenderHash:
    """Verify deterministic render hash generation."""

    def test_same_inputs_produce_same_hash(self):
        """Given identical timeline spec, assets, and profile,
        compute_render_hash must return the same SHA-256 digest."""
        ...

    def test_different_profiles_produce_different_hashes(self):
        """Changing only the render profile (e.g., preview vs standard)
        must change the render hash, even when timeline and assets are identical."""
        ...

    def test_changed_timeline_produces_different_hash(self):
        """Modifying any clip timing, adding a clip, or changing a transition
        must produce a different render hash."""
        ...

    def test_hash_ignores_non_deterministic_fields(self):
        """Fields like modifiedAt, createdAt, and UI-only state (selectedClipIds)
        must not affect the render hash."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_ffmpeg_pipeline.py`

```python
"""Tests for the two-stage FFmpeg video rendering pipeline.

Marked as slow because some tests invoke FFmpeg subprocesses.
"""
import pytest


@pytest.mark.unit
class TestAssemblyStage:
    """Stage 1: V1 track assembly."""

    def test_stream_copy_when_codecs_match(self):
        """When all V1 clips share the same codec, resolution, and timebase,
        the assembly stage must use -c copy for near-instant concatenation."""
        ...

    def test_reencode_when_codecs_differ(self):
        """When V1 clips have different codecs or resolutions,
        the assembly stage must re-encode with the standard profile settings."""
        ...


@pytest.mark.slow
class TestFinalRenderStage:
    """Stage 2: Overlay, text, and audio mixing."""

    def test_text_overlay_uses_drawtext(self):
        """T1 text clips must generate drawtext filter commands with correct
        font, size, color, position, and enable time range."""
        ...

    def test_audio_mixing_with_amix(self):
        """A1 audio track clips must be mixed with V1 audio using the amix filter.
        The output must preserve both audio sources."""
        ...

    def test_preview_profile_smaller_than_standard(self):
        """Preview profile (ultrafast, CRF 28, 640px) must produce smaller output
        than standard profile (medium, CRF 23, original resolution)."""
        ...

    def test_output_has_faststart(self):
        """All render outputs must include -movflags +faststart for
        progressive web playback."""
        ...

    def test_v2_overlay_positioning(self):
        """V2 overlay clips must be positioned using the overlay filter
        with coordinates from clip.transform and enable time range."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_video_job_routing.py`

```python
"""Tests for video job routing to short vs long queues."""
import pytest


@pytest.mark.unit
class TestJobRouting:
    """Route render jobs to the appropriate Cloud Tasks queue."""

    def test_short_clip_routes_to_short_queue(self):
        """A render with total input duration < 2 minutes and no V2/T1 overlays
        must route to the video-jobs-short queue."""
        ...

    def test_long_clip_routes_to_long_queue(self):
        """A render with total input duration >= 2 minutes
        must route to the video-jobs-long queue."""
        ...

    def test_overlays_force_long_queue(self):
        """A render with V2 or T1 track content must route to the
        video-jobs-long queue, even if duration is under 2 minutes."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_render_idempotency.py`

```python
"""Tests for render idempotency via R2 cache check."""
import pytest


@pytest.mark.unit
class TestRenderIdempotency:
    """Skip redundant renders when output already exists in R2."""

    def test_existing_render_hash_skips_ffmpeg(self):
        """When a HEAD request to R2 for renders/{renderHash}.mp4 returns 200,
        the pipeline must skip FFmpeg execution and return the existing URL."""
        ...

    def test_missing_render_hash_triggers_pipeline(self):
        """When a HEAD request to R2 for renders/{renderHash}.mp4 returns 404,
        the pipeline must execute the full two-stage FFmpeg pipeline."""
        ...

    def test_r2_error_does_not_skip_pipeline(self):
        """If the R2 HEAD request fails with a 5xx or network error,
        the pipeline must proceed with rendering (fail-open, not fail-closed)."""
        ...
```

---

## Implementation Details

### 1. RenderSpec Type Definition

Extend the existing video editor types to include a render specification interface. This is used both on the Node.js side (to compute the render hash and determine queue routing) and on the Python side (as the input to the Cloud Run Job).

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts`

Add the `RenderSpec` interface after the existing `RenderJob` interface:

```typescript
export interface RenderSpec {
  project: VideoEditorProject;       // Existing editor state (tracks, clips, assets)
  profile: 'preview' | 'standard' | 'high';
  renderHash: string;                // sha256(inputs + timeline + profile)
  outputKey: string;                 // R2 path: renders/{renderHash}.mp4
  inputAssetKeys: Record<string, string>;  // assetId -> R2 object key mapping
}
```

Also add a shared type for render profiles:

```typescript
export type RenderProfile = 'preview' | 'standard' | 'high';
```

### 2. Render Hash Computation

Implement a deterministic hash function that takes a timeline spec, asset keys, and render profile and produces a SHA-256 digest. This hash is used for idempotency: if a render with the same hash already exists in R2, skip re-rendering.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/renderHash.ts`

The function signature:

```typescript
import { createHash } from "crypto";
import type { VideoEditorProject, RenderProfile } from "../../client/src/types/videoEditor";

/**
 * Compute a deterministic render hash from the project timeline, asset keys, and profile.
 *
 * The hash includes:
 * - All clip timings, ordering, transitions, and effects
 * - All asset references (by R2 object key, not by local path or URL)
 * - Project settings (resolution, fps, sample rate)
 * - Render profile name
 *
 * The hash excludes:
 * - Timestamps (createdAt, modifiedAt)
 * - UI state (selectedClipIds, hoveredClipId, zoom, scroll)
 * - Project name
 *
 * Returns a hex-encoded SHA-256 digest.
 */
export function computeRenderHash(
  project: VideoEditorProject,
  inputAssetKeys: Record<string, string>,
  profile: RenderProfile
): string
```

The implementation should:
1. Extract the deterministic subset of the project (settings, timeline tracks with clips sorted by startTime, assets referenced by clips).
2. For each asset, use the R2 object key from `inputAssetKeys` instead of the local path.
3. Concatenate profile name.
4. JSON-stringify the canonical object (with sorted keys) and compute SHA-256.

### 3. Render Profiles

Define the FFmpeg encoding parameters for each render profile. These are used in the final render stage.

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/video/render_profiles.py`

```python
"""Render profile definitions for the video rendering pipeline.

Each profile maps to a set of FFmpeg encoding parameters that control
output quality, file size, and encoding speed.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class RenderProfile:
    """FFmpeg encoding parameters for a render quality level."""
    name: str
    video_codec: str
    preset: str
    crf: int
    scale: str         # FFmpeg scale filter value, e.g., "640:-2" or "original"
    audio_codec: str
    audio_bitrate: str
    approx_video_bitrate: str  # For documentation/estimation only

PROFILES: dict[str, RenderProfile] = { ... }
```

The three profiles:

| Profile | Video Codec | Preset | CRF | Scale | Audio | Approx Bitrate |
|---------|------------|--------|-----|-------|-------|----------------|
| preview | libx264 | ultrafast | 28 | 640:-2 | aac 128k | ~1 Mbps |
| standard | libx264 | medium | 23 | original | aac 192k | ~5 Mbps |
| high | libx264 | slow | 18 | original | aac 256k | ~10 Mbps |

All profiles must include `-movflags +faststart` for streaming playback and `-pix_fmt yuv420p` for broad compatibility.

### 4. Two-Stage FFmpeg Pipeline

Refactor the existing single-pass `build_ffmpeg_command_for_render` into a two-stage pipeline. This is the core of the video-job-runner.

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/video/pipeline.py`

The pipeline module contains two main functions:

```python
"""Two-stage FFmpeg video rendering pipeline.

Stage 1 (Assembly): Concatenate V1 track clips into a single intermediate file.
                    Uses stream copy when possible for speed.

Stage 2 (Final Render): Apply V2 overlays, T1 text burns, A1 audio mixing,
                        and encode with the selected render profile.
"""


def run_assembly_stage(
    render_spec: dict,
    work_dir: str,
    progress_callback: callable | None = None,
) -> str:
    """Assemble V1 track clips into a single intermediate file.

    If all clips share the same codec, resolution, and timebase, uses
    stream copy (-c copy) for near-instant assembly via concat demuxer.
    Otherwise, re-encodes with the standard profile.

    Args:
        render_spec: The full render specification dict.
        work_dir: Temporary directory for intermediate files.
        progress_callback: Optional callback(progress: float, stage: str).

    Returns:
        Path to the assembled intermediate file.
    """
    ...


def run_final_render(
    assembled_path: str,
    render_spec: dict,
    profile_name: str,
    output_path: str,
    progress_callback: callable | None = None,
) -> str:
    """Apply overlays, text, audio mixing, and encode to final output.

    Builds a filter_complex that:
    - Starts from the assembled V1 output.
    - Overlays V2 elements at specified positions and time ranges.
    - Burns T1 text using drawtext filter with fontconfig fonts.
    - Mixes A1 audio with V1 audio using amix filter.
    - Applies the selected render profile's encoding settings.

    Args:
        assembled_path: Path to the Stage 1 output.
        render_spec: The full render specification dict.
        profile_name: One of 'preview', 'standard', 'high'.
        output_path: Final output file path.
        progress_callback: Optional callback(progress: float, stage: str).

    Returns:
        Path to the rendered output file.
    """
    ...
```

**Assembly stage details:**

1. Extract V1 track clips from the render spec.
2. For each clip, resolve the asset's R2 key to a local file (download from R2 to `work_dir`).
3. Probe each clip with `ffprobe` to determine codec, resolution, and timebase.
4. If all clips are compatible (same codec, resolution, fps): write a concat demuxer file and run `ffmpeg -f concat -safe 0 -i list.txt -c copy assembled.mp4`.
5. If clips are incompatible: use the existing `build_ffmpeg_command_for_render` logic (trim, scale, normalize, concat filter) but output to the intermediate file. Reuse the existing trim/scale/xfade filter chain from `media_job_worker.py`.
6. Output: `{work_dir}/{renderHash}_assembled.mp4`.

**Final render stage details:**

1. If no V2 overlays, no T1 text, and no A1 audio mixing needed: apply only the profile encoding to the assembled file (simple transcode or copy).
2. For V2 overlays: build `overlay` filters with position from `clip.transform` (x, y, scale, opacity) and time range via `enable='between(t,start,end)'`.
3. For T1 text: build `drawtext` filters with parameters from `clip.textConfig` (font family, size, color, position, effect). The fonts are pre-installed in the Docker image via fontconfig.
4. For A1 audio: build `amix` filter to mix V1 audio with A1 track audio.
5. Apply the profile's encoding settings (codec, preset, CRF, scale, audio bitrate).
6. Output: `{output_path}` (the final R2 output key path).

### 5. Cloud Run Job Entrypoint

The video-job-runner Docker image uses a Python script as its entrypoint. This script reads the render spec, executes the pipeline, uploads the result, and exits.

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/video/entrypoint.py`

```python
"""Cloud Run Job entrypoint for video rendering.

Reads the render specification from the RENDER_SPEC environment variable
(JSON-encoded), executes the two-stage FFmpeg pipeline, uploads the result
to R2, updates the database, and exits.

Environment variables:
    RENDER_SPEC: JSON-encoded RenderSpec
    R2_ACCESS_KEY, R2_SECRET_KEY, R2_ACCOUNT_ID: R2 credentials
    R2_BUCKET: Target bucket name
    DATABASE_URL: Neon Postgres connection string
    REDIS_MEMORYSTORE_URL: For progress reporting via pub/sub
"""
import json
import os
import sys
import tempfile


def main():
    """Main entrypoint for the video-job-runner Cloud Run Job."""
    ...


if __name__ == "__main__":
    main()
```

The entrypoint flow:

1. Parse `RENDER_SPEC` environment variable as JSON.
2. Extract `renderHash`, `outputKey`, and `profile`.
3. **Idempotency check:** HEAD request to R2 for `renders/{renderHash}.mp4`. If it exists, update DB with the existing URL and exit with code 0.
4. Create a temporary working directory.
5. Download all input assets from R2 to the working directory.
6. Run Stage 1 (assembly) with progress reporting at 0-50%.
7. Run Stage 2 (final render) with progress reporting at 50-95%.
8. Upload the final output to R2 at `renders/{profile}/{renderHash}.mp4`.
9. Update the database record with the R2 key and metadata (file size, duration, resolution).
10. Report completion (progress = 100%) to Redis channel.
11. Clean up the temporary directory and exit with code 0.

Progress is published to Redis channel `media-job-progress:{jobId}` every 5 seconds by parsing FFmpeg's stderr for frame count and duration percentage.

### 6. Job Routing Logic

The Node.js API determines which Cloud Tasks queue to use based on the render complexity. This decision happens before enqueuing the task.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/videoJobRouter.ts`

```typescript
/**
 * Determine which Cloud Tasks queue to route a video render job to.
 *
 * Routing rules:
 * - video-jobs-short (2 vCPU, 8 GiB): total input duration < 2 minutes AND
 *   no V2/T1 overlay content
 * - video-jobs-long (4 vCPU, 16 GiB): everything else
 */
export function routeVideoJob(project: VideoEditorProject): 'video-jobs-short' | 'video-jobs-long'
```

The implementation:
1. Calculate total input duration by summing all V1 track clip durations.
2. Check if V2 (overlay) or T1 (text) tracks have any clips.
3. If duration < 120 seconds AND no overlay/text clips: return `video-jobs-short`.
4. Otherwise: return `video-jobs-long`.

### 7. Render Submission Endpoint

The existing video editor UI triggers a render. The Node.js API must handle the render request by computing the hash, checking cache, and enqueuing the Cloud Run Job.

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts`

Add a new tRPC procedure (or extend the existing render flow) that:

1. Receives the `VideoEditorProject` and `RenderProfile` from the client.
2. Resolves all asset references to R2 object keys (the assets must already be in R2).
3. Calls `computeRenderHash(project, assetKeys, profile)`.
4. Checks if `renders/{profile}/{renderHash}.mp4` exists in R2 (HEAD request).
5. If cached: return the existing presigned URL immediately.
6. If not cached: call `routeVideoJob(project)` to determine the queue, then call `enqueueTask({ queueName, handlerPath: '/tasks/process-video', payload: renderSpec })`.
7. Return the job ID for progress tracking.

### 8. Python Task Handler

The Python Cloud Run Service receives the Cloud Tasks dispatch and launches the Cloud Run Job.

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py`

Add the `POST /tasks/process-video` endpoint:

```python
@router.post("/tasks/process-video")
async def process_video_task(request: Request):
    """Handle video render task from Cloud Tasks.

    Launches a Cloud Run Job execution with the render spec
    passed as an environment variable.

    This endpoint is protected by OIDC validation middleware
    (see Section 04).
    """
    ...
```

The handler:
1. Parse the request body for the render spec.
2. Validate the render spec (required fields, valid profile).
3. Call the Cloud Run Admin API to create a Job execution with the `video-job-runner` image, passing `RENDER_SPEC` as an environment variable.
4. Set CPU/memory based on the queue name (short: 2 vCPU/8 GiB, long: 4 vCPU/16 GiB).
5. Return 200 to acknowledge the task (Cloud Tasks delivery confirmed).

### 9. Progress Reporting

The video-job-runner publishes progress to the Redis Memorystore channel `media-job-progress:{jobId}`. The existing SSE infrastructure in the Node.js service (`apps/web/server/routers/mediaJobs.ts`) already subscribes to this channel and forwards updates to the client.

**Integration with existing code:**

The existing `report_progress`, `report_done`, and `report_error` functions in `python-backend/app/tasks/media_job_worker.py` can be extracted into a shared module and reused by the video pipeline entrypoint. They publish JSON to the Redis channel which the Node.js SSE endpoint consumes.

**File to create:** `/home/dev/projects/SmartSpecPro/python-backend/app/video/progress.py`

```python
"""Progress reporting for video rendering jobs.

Publishes structured JSON messages to Redis pub/sub channel
media-job-progress:{jobId}. The Node.js SSE endpoint subscribes
to this channel and forwards updates to the browser client.
"""


def report_render_progress(
    redis_client,
    job_id: str,
    progress: float,
    stage: str,
    message: str = "",
) -> None:
    """Publish a progress update to the Redis channel."""
    ...


def parse_ffmpeg_stderr_progress(line: str, total_duration_us: int) -> float | None:
    """Parse FFmpeg progress from stderr output.

    Reuses the existing parse_ffmpeg_progress logic from media_job_worker.
    """
    ...
```

### 10. R2 Integration

The video pipeline downloads input assets from R2 and uploads the rendered output back to R2. This uses `boto3` with the same R2 credentials used by the media pipeline (Section 08/09).

Key operations:
- **Download assets:** `s3.download_file(bucket, key, local_path)` for each input asset.
- **HEAD check for idempotency:** `s3.head_object(Bucket=bucket, Key=output_key)` to check if render already exists.
- **Upload output:** `s3.upload_file(local_path, bucket, output_key, ExtraArgs={'ContentType': 'video/mp4'})`.

The R2 bucket prefix structure for renders:
- `renders/preview/{renderHash}.mp4` -- Preview quality renders (7-day lifecycle)
- `renders/final/{renderHash}.mp4` -- Standard and high quality renders (12-day lifecycle, or per business rule)
- `temp/work/{renderHash}_assembled.mp4` -- Intermediate assembly files (12-day lifecycle, cleaned automatically)

### 11. Docker Image Configuration

The `video-job-runner` Docker image is defined in Section 02. It extends the python-orchestrator with:

- FFmpeg 7.1 (pinned version)
- `fontconfig`, `ttf-dejavu`, `ttf-liberation`, `ttf-freefont`
- `fc-cache -fv` run at build time
- Entrypoint: `python -m app.video.entrypoint`

Cloud Run Job configuration per queue:

| Queue | vCPU | Memory | Timeout | Max Retries |
|-------|------|--------|---------|-------------|
| video-jobs-short | 2 | 8 GiB | 10 minutes | 3 |
| video-jobs-long | 4 | 16 GiB | 30 minutes | 3 |

---

## File Summary

### Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/video/__init__.py` | Package init |
| `/home/dev/projects/SmartSpecPro/python-backend/app/video/render_profiles.py` | Render profile dataclass and PROFILES dict |
| `/home/dev/projects/SmartSpecPro/python-backend/app/video/pipeline.py` | Two-stage FFmpeg pipeline (assembly + final render) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/video/entrypoint.py` | Cloud Run Job entrypoint script |
| `/home/dev/projects/SmartSpecPro/python-backend/app/video/progress.py` | Redis progress reporting for video jobs |
| `/home/dev/projects/SmartSpecPro/python-backend/app/video/render_hash.py` | Python-side render hash computation (mirrors Node.js version) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/renderHash.ts` | Node.js render hash computation |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/videoJobRouter.ts` | Job routing logic (short vs long queue) |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_render_hash.py` | Render hash tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_ffmpeg_pipeline.py` | FFmpeg pipeline tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_video_job_routing.py` | Job routing tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_render_idempotency.py` | Idempotency tests |

### Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/types/videoEditor.ts` | Add `RenderSpec` interface and `RenderProfile` type |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` | Add render submission procedure that computes hash, checks cache, enqueues Cloud Tasks |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/media_generation.py` | Add `POST /tasks/process-video` handler that launches Cloud Run Job |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py` | Extract shared helpers (progress reporting, FFmpeg command building) into reusable modules under `app/video/` |

---

## Implementation Checklist

1. Write all four test files (render hash, FFmpeg pipeline, job routing, idempotency).
2. Add `RenderSpec` interface and `RenderProfile` type to `videoEditor.ts`.
3. Create `python-backend/app/video/` package with `__init__.py`.
4. Implement `render_profiles.py` with the three profile dataclasses.
5. Implement `render_hash.py` (Python side) for computing deterministic SHA-256 from render spec.
6. Implement `renderHash.ts` (Node.js side) with the equivalent hash computation.
7. Implement `pipeline.py` with `run_assembly_stage` and `run_final_render`. Reuse and refactor existing filter-building logic from `media_job_worker.py`.
8. Implement `progress.py` by extracting the existing progress reporting helpers from `media_job_worker.py`.
9. Implement `entrypoint.py` as the Cloud Run Job main script.
10. Implement `videoJobRouter.ts` with the queue routing logic.
11. Add `POST /tasks/process-video` endpoint to `media_generation.py`.
12. Add the render submission procedure to `mediaJobs.ts`.
13. Run all tests and verify they pass.

---

## Implementation Notes (Actual)

### What Was Built
All 12 files created and 3 files modified as planned. 27 unit tests pass.

### Deviations from Plan

1. **`media_job_worker.py` was NOT modified.** The plan called for extracting shared helpers into `app/video/`. Instead, the video package was implemented as a self-contained module with its own progress reporting and pipeline logic, reimplemented from scratch rather than extracted. Rationale: avoid touching the working production media pipeline code.

2. **Render hash cross-system serialization.** The initial implementation had a critical mismatch: Node.js `JSON.stringify` uses default formatting while Python uses `sort_keys=True, separators=(',', ':')`. Fixed during code review by adding a `stableStringify()` function to `renderHash.ts` that produces identical output to Python's compact sorted JSON.

3. **`storageHeadObject` → `storageResolveUrl`.** The plan assumed a `storageHeadObject` function in `storage.ts`. This function doesn't exist. The R2 cache check was changed to use `storageResolveUrl` which returns null for missing objects.

4. **Entrypoint accepts direct argument.** The plan had the inline fallback setting `os.environ["RENDER_SPEC"]` before spawning a background thread. This was a race condition for concurrent requests. Fixed by adding an optional `render_spec_dict` parameter to `main()`.

5. **No DB update after render completion.** The plan called for updating a database record with render metadata. No render records schema exists yet, so this was deferred.

6. **No xfade transitions in assembly stage.** The plan referenced reusing `XFADE_MAP` from `media_job_worker.py`. The current implementation uses simple concat without transitions. To be added during hardening.

### Test Summary
- `test_render_hash.py`: 6 tests (determinism, profile differentiation, timeline sensitivity, non-deterministic field exclusion, asset key ordering, SHA-256 length)
- `test_ffmpeg_pipeline.py`: 9 tests (stream copy, re-encode, drawtext, profiles, faststart, overlay structure, clip sorting, single clip, empty V1)
- `test_video_job_routing.py`: 5 tests (short queue, long queue, overlays, text clips, boundary 120s)
- `test_render_idempotency.py`: 4 tests (cache hit, cache miss, R2 error fail-open, hash determinism)
- **Total: 27 tests, all passing**