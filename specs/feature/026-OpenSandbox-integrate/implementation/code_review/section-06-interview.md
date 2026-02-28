# Section 06: Code Review Interview

## Triage Summary

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 1 | File staging/collection never called | CRITICAL | Deferred — entry point wiring in section-07/08 |
| 2 | Binary stdout corruption (text=False) | CRITICAL | **Auto-fixed** — added `text` param to `_run_in_sandbox` |
| 3 | _has_audio_stream without runner | HIGH | **Auto-fixed** — added runner to `build_ffmpeg_command_for_render` |
| 4 | _build_mp4 runner never passed | HIGH | Deferred — entry point wiring in section-07/08 |
| 5 | generate_thumbnail/extract_metadata gap | HIGH | Deferred — entry point wiring in section-07/08 |
| 6 | factory_orchestrator.run() no session | HIGH | Deferred — entry point wiring in section-07/08 |
| 7 | docker_executor drops params | MEDIUM | Deferred — section-08 (Router Modifications) |
| 8 | AUTO mode no sandbox preference | MEDIUM | Deferred — section-08 (Router Modifications) |
| 9 | Missing tests for 5 handlers | HIGH | Deferred — 31 tests cover core pattern |
| 10-12 | Various test gaps | MEDIUM | Deferred |
| 13 | asyncio.run() multiple times | MEDIUM | Let go — correct for prefork Celery |
| 14 | Hardcoded sandbox resources | LOW | Let go — infra concern |
| 15 | Filename collision | LOW | Let go — edge case |

## Interview Decision

**Q: Entry point wiring — fix now or defer?**
**A: Defer to section-07/08 (Recommended)** — User chose to keep section-06 scope focused on migrating subprocess calls. Entry point wiring (creating SandboxMediaRunner sessions at render_presentation, generate_thumbnail, factory_orchestrator.run()) fits better in router/integration sections.

## Auto-fixes Applied

### Fix 1: Binary stdout handling in sandbox path
- **File**: `app/video/sandbox_runner.py`
- **Change**: Added `text` parameter to `_run_in_sandbox()`. When `text=False`, converts string stdout/stderr from sandbox API to bytes using UTF-8 encoding.
- **Rationale**: handle_waveform_peaks passes `text=False` to get binary PCM data. Without this fix, it would receive a string and crash.

### Fix 2: Runner propagation through build_ffmpeg_command_for_render
- **File**: `app/tasks/media_job_worker.py`
- **Changes**:
  1. Added `runner=None` to `build_ffmpeg_command_for_render(spec, runner=None)`
  2. Updated `_has_audio_stream(path, runner=runner)` call inside it
  3. Updated `handle_render_mp4` call: `build_ffmpeg_command_for_render(spec, runner=runner)`
- **Rationale**: Without this, ffprobe probe for audio streams would bypass sandbox even when sandbox is enabled.
