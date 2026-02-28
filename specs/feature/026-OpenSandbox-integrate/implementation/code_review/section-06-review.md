# Section 06: Media Pipeline Migration — Code Review

## CRITICAL ISSUES

### 1. File staging/collection never called — sandbox commands will fail (CRITICAL)
The `stage_files()` and `collect_files()` methods exist in sandbox_runner.py but are NEVER called. FFmpeg commands reference LOCAL file paths that won't exist inside the sandbox container.

### 2. Binary stdout corruption in handle_waveform_peaks (CRITICAL)
`run_command_sync()` passes `text=False` but sandbox path returns string stdout. PCM binary data will be corrupted.

### 3. _has_audio_stream called without runner in build_ffmpeg_command_for_render (HIGH)
Line 783 of media_job_worker.py calls `_has_audio_stream(path)` without runner — un-sandboxed ffprobe runs even when sandbox enabled.

### 4. _build_mp4 runner never passed from call chain (HIGH)
`_process_format()` and `render_presentation` don't accept or pass runner. Runner parameter on `_build_mp4` is dead code.

### 5. generate_thumbnail and extract_metadata missing runner propagation (HIGH)
Public API functions in media_pipeline.py don't accept runner. Internal helpers have runner param but it's unreachable.

### 6. factory_orchestrator.run() never creates sandbox session (HIGH)
`self._runner = None` is set but never assigned a SandboxMediaRunner. The `_run_cmd` will always use subprocess fallback.

### 7. docker_executor sandbox branch drops cwd, env, user params (MEDIUM)
Sandbox branch ignores cwd/env/user/capture_output parameters that HOST/DOCKER branches pass through.

### 8. docker_executor AUTO mode doesn't prefer SANDBOX (MEDIUM)
Auto-detect doesn't check OPENSANDBOX_ENABLED feature flag.

## TEST COVERAGE GAPS

### 9. Missing tests for 5 of 12 handlers (HIGH)
No tests for: handle_render_mp4, handle_waveform_peaks, handle_thumbnails, handle_transcode_h264, handle_extract_audio, handle_dead_air_cut.

### 10-12. Various test gaps (MEDIUM)
- No test for execute_media_job session creation
- No test for stage_files/collect_files
- Tests bypass __aenter__ flow

## DESIGN CONCERNS

### 13. asyncio.run() called multiple times per session (MEDIUM)
Each command creates/destroys an event loop. Wasteful but functionally correct for prefork Celery.

### 14. Hardcoded sandbox image and resources (LOW)
Profile name stored as string label but actual limits are hardcoded.

### 15. stage_files filename collision (LOW)
Same-basename files from different directories would collide in sandbox.
