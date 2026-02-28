Now I have a thorough understanding of the codebase. Let me generate the section content.

# Section 6: Media Pipeline Migration

## Overview

This section migrates all FFmpeg-based media processing from direct `subprocess.run()` / `subprocess.Popen()` calls to isolated sandbox execution via the OpenSandbox integration. The migration covers four Python source files containing a total of approximately 30 subprocess invocations used for media probing, rendering, transcoding, thumbnail generation, audio extraction, subtitle handling, and dead-air detection.

The migration follows a "sandbox session reuse" pattern: a single sandbox container is created at the start of a Celery task and reused for ALL FFmpeg commands within that task. This avoids the catastrophic latency of creating and destroying a sandbox per command. Expected cost: approximately 3 seconds one-time sandbox creation, then approximately 50ms per subsequent command execution.

**Dependencies**: This section depends on:
- **Section 03 (Python SDK Client)**: Provides `python-backend/app/integrations/opensandbox/client.py`, `lifecycle.py`, `execution.py`, `files.py`, `config.py`, `models.py`
- **Section 04 (Python Services)**: Provides `python-backend/app/services/sandbox_dispatcher.py`, `sandbox_artifacts.py`, `sandbox_audit.py`, and the `sandbox_job_worker.py` Celery task
- **Section 02 (Database Schema)**: Provides `sandbox_jobs`, `sandbox_profiles`, `sandbox_artifacts` tables and the `media-processing` profile seed data

**Blocks**: Section 09 (Hetzner Setup) and Section 12 (Production Hardening)

---

## Tests (Write FIRST)

All tests use pytest with the `sandbox` marker. Tests mock the OpenSandbox client and subprocess calls. No actual Docker or OpenSandbox containers are required for unit testing.

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_media_runner.py`

```python
"""Tests for SandboxMediaRunner — the sandbox execution wrapper for FFmpeg commands.

All tests mock the OpenSandbox client. No real sandbox containers needed.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestSandboxMediaRunner:
    """Tests for the SandboxMediaRunner class in app/video/sandbox_runner.py."""

    async def test_run_command_uses_sandbox_when_enabled(self):
        """When OPENSANDBOX_ENABLED=true, FFmpeg commands execute via sandbox.run_command()."""

    async def test_run_command_falls_back_to_subprocess_when_disabled(self):
        """When OPENSANDBOX_ENABLED=false, FFmpeg commands execute via subprocess.run()."""

    async def test_session_reuse_creates_sandbox_once(self):
        """Multiple run_command calls within a session reuse the same sandbox_id."""

    async def test_session_cleanup_destroys_sandbox(self):
        """Exiting the session context manager destroys the sandbox."""

    async def test_session_cleanup_on_exception(self):
        """Sandbox is destroyed even when an exception occurs during execution."""

    async def test_stage_input_files_uploads_to_sandbox(self):
        """Input media files are staged into the sandbox filesystem before command execution."""

    async def test_collect_output_downloads_from_sandbox(self):
        """Output files are downloaded from sandbox and placed in the local work directory."""

    async def test_sandbox_uses_media_processing_profile(self):
        """Sandbox creation requests the 'media-processing' profile (2 CPU, 4 GB, 30 min)."""

    async def test_ffmpeg_args_converted_to_shell_command_string(self):
        """Subprocess-style list args are joined into a shell command string for sandbox."""

    async def test_command_failure_raises_runtime_error(self):
        """Non-zero exit code from sandbox command raises RuntimeError with stderr excerpt."""

    async def test_command_timeout_raises_with_partial_output(self):
        """Timeout during sandbox command execution raises with partial stdout/stderr if available."""

    async def test_font_files_staged_for_subtitle_burnin(self):
        """When text/subtitle burn-in is detected, font files are staged into sandbox."""
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_job_worker_sandbox.py`

```python
"""Tests for media_job_worker.py sandbox integration.

Verifies that each handler function routes through SandboxMediaRunner
when OPENSANDBOX_ENABLED=true and falls back to subprocess when disabled.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestMediaJobWorkerSandboxRouting:
    """Verify each handler routes through sandbox when enabled."""

    def test_handle_probe_uses_sandbox(self):
        """handle_probe routes ffprobe through sandbox when enabled."""

    def test_handle_render_mp4_uses_sandbox_session(self):
        """handle_render_mp4 creates one sandbox and reuses it for all FFmpeg calls."""

    def test_handle_waveform_peaks_uses_sandbox(self):
        """handle_waveform_peaks routes ffmpeg through sandbox when enabled."""

    def test_handle_thumbnails_uses_sandbox_session(self):
        """handle_thumbnails creates one sandbox and reuses it for probe + N thumbnail commands."""

    def test_handle_dead_air_detect_uses_sandbox(self):
        """handle_dead_air_detect routes silence detection through sandbox."""

    def test_handle_dead_air_cut_uses_sandbox_session(self):
        """handle_dead_air_cut creates one sandbox and reuses for probe + cut."""

    def test_handle_transcode_h264_uses_sandbox(self):
        """handle_transcode_h264 routes transcoding through sandbox."""

    def test_handle_extract_audio_uses_sandbox(self):
        """handle_extract_audio routes audio extraction through sandbox."""

    def test_handle_subtitles_extract_uses_sandbox(self):
        """handle_subtitles_extract routes subtitle extraction through sandbox."""

    def test_legacy_subprocess_when_disabled(self):
        """All handlers fall back to subprocess.run when OPENSANDBOX_ENABLED=false."""

    def test_execute_media_job_creates_sandbox_job_record(self):
        """The main execute_media_job task creates a sandbox_jobs DB record when enabled."""
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_pipeline_sandbox.py`

```python
"""Tests for media_pipeline.py sandbox migration.

Verifies that ffprobe, ffmpeg thumbnail, and metadata extraction commands
route through sandbox when enabled.
"""
import pytest
from unittest.mock import AsyncMock, patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestMediaPipelineSandbox:
    """Verify media_pipeline.py subprocess calls route through sandbox."""

    async def test_generate_video_thumbnail_uses_sandbox(self):
        """_generate_video_thumbnail routes ffprobe + ffmpeg through sandbox."""

    async def test_ffprobe_metadata_uses_sandbox(self):
        """_ffprobe_metadata routes ffprobe through sandbox."""

    async def test_generate_image_thumbnail_unaffected(self):
        """Image thumbnails use Pillow (no subprocess), so remain unchanged."""

    async def test_legacy_subprocess_when_disabled(self):
        """All subprocess calls fall back when OPENSANDBOX_ENABLED=false."""
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_presentation_render_sandbox.py`

```python
"""Tests for presentation_render.py sandbox migration.

Verifies that FFmpeg subprocess calls in _build_mp4 route through sandbox.
Playwright (browser automation) remains in-process -- it is NOT migrated in this section.
"""
import pytest
from unittest.mock import patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestPresentationRenderSandbox:
    """Verify presentation_render.py FFmpeg calls route through sandbox."""

    def test_build_mp4_no_audio_uses_sandbox(self):
        """_build_mp4 Case A (no audio) routes ffmpeg through sandbox."""

    def test_build_mp4_with_audio_uses_sandbox(self):
        """_build_mp4 Cases B/C/D (with audio) route ffmpeg through sandbox."""

    def test_playwright_screenshots_not_migrated(self):
        """Playwright screenshot rendering stays in-process (not sandbox)."""

    def test_legacy_subprocess_when_disabled(self):
        """FFmpeg falls back to subprocess.run when OPENSANDBOX_ENABLED=false."""
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_factory_orchestrator_sandbox.py`

```python
"""Tests for factory_orchestrator.py sandbox migration.

Verifies that _run_cmd routes through sandbox when enabled.
"""
import pytest
from unittest.mock import patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestFactoryOrchestratorSandbox:
    """Verify factory_orchestrator.py subprocess calls route through sandbox."""

    def test_run_cmd_uses_sandbox_when_enabled(self):
        """_run_cmd dispatches to sandbox.run_command when enabled."""

    def test_run_cmd_uses_subprocess_when_disabled(self):
        """_run_cmd uses subprocess.run when OPENSANDBOX_ENABLED=false."""

    def test_sandbox_uses_code_default_profile(self):
        """Factory orchestrator commands use code-default profile (not media-processing)."""
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_docker_executor_sandbox.py`

```python
"""Tests for docker_executor.py sandbox migration.

Verifies that command execution routes through sandbox when enabled.
"""
import pytest
from unittest.mock import AsyncMock, patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestDockerExecutorSandbox:
    """Verify docker_executor.py routes through sandbox when enabled."""

    async def test_execute_uses_sandbox_when_enabled(self):
        """Commands dispatch to sandbox when OPENSANDBOX_ENABLED=true."""

    async def test_execute_uses_legacy_when_disabled(self):
        """Commands use asyncio.create_subprocess_exec when disabled."""

    async def test_sandbox_profile_selection_by_command_type(self):
        """Selects code-default or media-processing profile based on command."""

    async def test_docker_socket_not_accessed(self):
        """When sandbox enabled, no direct Docker socket access occurs."""
```

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_video_pipeline_sandbox.py`

```python
"""Tests for app/video/pipeline.py sandbox migration.

Verifies that run_assembly_stage and run_final_render route FFmpeg
through sandbox when enabled.
"""
import pytest
from unittest.mock import patch

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestVideoPipelineSandbox:
    """Verify video/pipeline.py subprocess calls route through sandbox."""

    def test_probe_clip_uses_sandbox(self):
        """_probe_clip routes ffprobe through sandbox when enabled."""

    def test_run_assembly_stage_uses_sandbox(self):
        """run_assembly_stage routes ffmpeg through sandbox when enabled."""

    def test_run_final_render_simple_uses_sandbox(self):
        """run_final_render (no overlays) routes ffmpeg through sandbox."""

    def test_run_final_render_complex_uses_sandbox(self):
        """run_final_render (overlays + text + audio) routes ffmpeg through sandbox."""

    def test_session_reuse_across_assembly_and_render(self):
        """A single sandbox session is shared across assembly and final render stages."""

    def test_legacy_subprocess_when_disabled(self):
        """Falls back to subprocess.run when OPENSANDBOX_ENABLED=false."""
```

---

## Implementation Details

### 6.1 Create SandboxMediaRunner

**New file**: `/home/dev/projects/SmartSpecPro/python-backend/app/video/sandbox_runner.py`

This is the central abstraction for routing FFmpeg/ffprobe commands through sandbox or subprocess. All migrated files will use this class instead of calling `subprocess.run()` directly.

```python
"""SandboxMediaRunner — routes FFmpeg/ffprobe commands through OpenSandbox or subprocess.

Usage as async context manager for session reuse:

    async with SandboxMediaRunner.session(profile="media-processing") as runner:
        result = await runner.run_command(["ffprobe", ...])
        result2 = await runner.run_command(["ffmpeg", ...])
    # sandbox destroyed on exit

Usage for single commands (creates/destroys sandbox per call):

    runner = SandboxMediaRunner()
    result = await runner.run_command(["ffmpeg", ...])
"""
```

**Key design decisions:**

1. **Context manager for session reuse**: The class implements `__aenter__` / `__aexit__` as an async context manager. Within a session, one sandbox is created and reused for all commands. The sandbox is destroyed in `__aexit__`, including on exception.

2. **Feature flag check at entry point**: The constructor reads `OPENSANDBOX_ENABLED` from the opensandbox config. If disabled, all commands delegate to `subprocess.run()` directly (the legacy path). This keeps the feature flag check at a single location.

3. **Command format conversion**: FFmpeg subprocess calls use `list[str]` arguments (e.g., `["ffmpeg", "-i", "input.mp4", ...]`). The sandbox `run_command()` API accepts a shell command string. The runner joins the list with proper shell quoting via `shlex.join()`.

4. **File staging**: Before executing commands, input files referenced in command arguments must be staged into the sandbox filesystem. The runner inspects command arguments for file paths and stages them via `files.stage_inputs()`. Output files are collected after execution via `files.collect_outputs()`.

5. **Profile selection**: The runner accepts a `profile` parameter (default: `"media-processing"`). This maps to the `media-processing` sandbox profile created in Section 02 (2 CPU, 4 GB RAM, 10 GB disk, 1800s timeout, network deny).

**Class signature:**

```python
class SandboxMediaRunner:
    def __init__(self, profile: str = "media-processing", job_id: str | None = None):
        """Initialize runner. Reads OPENSANDBOX_ENABLED from config."""

    @classmethod
    def session(cls, profile: str = "media-processing", job_id: str | None = None) -> "SandboxMediaRunner":
        """Create a runner for use as async context manager with session reuse."""

    async def __aenter__(self) -> "SandboxMediaRunner":
        """Create sandbox container (if enabled). Store sandbox_id for reuse."""

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Destroy sandbox container. Always runs, even on exception."""

    async def run_command(
        self,
        cmd: list[str],
        timeout: int = 1800,
        capture_output: bool = True,
        text: bool = True,
        check: bool = False,
        cwd: str | None = None,
    ) -> subprocess.CompletedProcess:
        """Execute command via sandbox (if enabled) or subprocess (if disabled).

        Returns a subprocess.CompletedProcess-compatible object for backward
        compatibility with existing handler code.
        """

    async def stage_files(self, file_paths: list[str]) -> dict[str, str]:
        """Stage local files into sandbox. Returns mapping of local_path -> sandbox_path."""

    async def collect_files(self, sandbox_paths: list[str], local_dir: str) -> list[str]:
        """Collect files from sandbox to local directory. Returns list of local paths."""
```

**Return type compatibility**: The `run_command` method returns a `subprocess.CompletedProcess`-compatible object regardless of whether sandbox or subprocess was used. This minimizes changes in existing handler code -- they continue to check `result.returncode`, `result.stdout`, `result.stderr` identically.

### 6.2 Migrate `media_job_worker.py`

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py`

This file has the highest density of subprocess calls (~20 total). The migration strategy is:

1. **Import the runner** at the top of the file.

2. **Wrap the main `execute_media_job` task** with a sandbox session. Since the Celery task is synchronous, use `asyncio.run()` or the existing `_run_async` helper to run the async context manager.

3. **Pass the runner to each handler function** as an optional parameter. Handlers that currently call `subprocess.run()` or `subprocess.Popen()` will instead call `await runner.run_command()`.

4. **Handler functions become async** (or use `_run_async` wrapper). Since Celery tasks are synchronous, the top-level task uses `_run_async` to bridge.

**Migration pattern for each handler:**

Current pattern (example from `handle_probe`):
```python
def handle_probe(spec: dict, tmp_dir: str) -> dict:
    cmd = build_ffmpeg_command_for_probe(spec)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {_sanitize_stderr(result.stderr)}")
    ...
```

Migrated pattern:
```python
async def handle_probe(spec: dict, tmp_dir: str, runner: SandboxMediaRunner | None = None) -> dict:
    cmd = build_ffmpeg_command_for_probe(spec)
    if runner:
        result = await runner.run_command(cmd, timeout=30)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {_sanitize_stderr(result.stderr)}")
    ...
```

The `runner` parameter is optional for backward compatibility. When `None`, the handler uses the legacy subprocess path. This allows gradual migration and testing.

**Specific handlers to migrate** (all in `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py`):

| Handler Function | Lines | subprocess calls | Notes |
|---|---|---|---|
| `_has_audio_stream` | 716-735 | 1 (ffprobe) | Utility function used by `build_ffmpeg_command_for_render` |
| `handle_probe` | 1083-1101 | 1 (ffprobe) | Single command |
| `handle_render_mp4` | 1104-1273 | 3-4 (Popen + run) | Multi-command: render, then drawtext or ASS overlay |
| `handle_waveform_peaks` | 1276-1297 | 1 (ffmpeg) | Single command, reads binary stdout |
| `handle_thumbnails` | 1339-1380 | 1+N (ffprobe + N ffmpeg) | Session reuse critical |
| `handle_dead_air_detect` | 1300-1335 | 1 (ffmpeg) | Single command |
| `handle_dead_air_cut` | ~1520-1807 | 2 (ffprobe + ffmpeg) | Probe then cut |
| `_probe_media_info` | 1452-1468 | 1 (ffprobe) | Utility function |
| `_detect_video_codec` | 1818-1829 | 1 (ffprobe) | Utility function |
| `handle_transcode_h264` | 1832-1934 | 1-2 (ffprobe + Popen) | Probe then transcode with progress |
| `handle_extract_audio` | 1942-2015 | 2 (ffmpeg + ffprobe) | Extract then probe |
| `handle_subtitles_extract` | 1383-1405 | 1 (ffmpeg) | Single command |

**Session reuse in `execute_media_job`:**

The top-level Celery task creates a single sandbox session that is passed to the handler:

```python
@celery_app.task(bind=True, max_retries=2, time_limit=1800, soft_time_limit=1740)
def execute_media_job(self, spec_json: str, user_id: str, job_id: str) -> dict:
    # ... existing validation ...

    async def _run_with_sandbox():
        async with SandboxMediaRunner.session(
            profile="media-processing", job_id=job_id
        ) as runner:
            handler = HANDLER_MAP.get(job_type)
            return await handler(spec, tmp_dir, runner=runner)

    from app.integrations.opensandbox.config import get_settings
    if get_settings().enabled:
        result = _run_async(_run_with_sandbox())
    else:
        handler = HANDLER_MAP.get(job_type)
        result = handler(spec, tmp_dir)
```

**Special case: `subprocess.Popen` with progress streaming** (used in `handle_render_mp4` and `handle_transcode_h264`): These handlers use `Popen` to stream FFmpeg progress output line-by-line. In sandbox mode, use `runner.run_command()` which returns stdout/stderr after completion -- progress streaming is not available within the sandbox. The `report_progress()` calls will emit a single update before and after the sandbox command instead of continuous streaming. This is an acceptable UX trade-off since sandbox execution is inherently batch-oriented.

### 6.3 Migrate `media_pipeline.py`

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/media_pipeline.py`

Three subprocess call sites at lines 236, 252, and 266:

1. **`_generate_video_thumbnail` (line 236, 252)**: Two `subprocess.run` calls wrapped in `asyncio.to_thread`. One is ffprobe for duration, one is ffmpeg for frame extraction.

2. **`_ffprobe_metadata` (line 266)**: Synchronous ffprobe call.

**Migration approach**: Add an optional `runner: SandboxMediaRunner | None = None` parameter. When provided, use `await runner.run_command()` instead of `asyncio.to_thread(subprocess.run, ...)`.

The async functions (`_generate_video_thumbnail`) are already async -- they just need to call `runner.run_command()` directly instead of `asyncio.to_thread(subprocess.run, ...)`.

The sync function (`_ffprobe_metadata`) needs to become async or accept a runner that handles the dispatch. Since it is already called via `asyncio.to_thread()` from `extract_metadata()`, the migration changes the call site in `extract_metadata` to use `runner.run_command()` directly when the runner is available.

**Note**: `_generate_image_thumbnail` uses Pillow (not subprocess) and is NOT affected by this migration.

### 6.4 Migrate `presentation_render.py`

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/presentation_render.py`

Two subprocess call sites at lines 397 and 475:

1. **Line 397**: `subprocess.run(cmd, check=True, capture_output=True, timeout=540)` -- FFmpeg for video-only MP4 (Case A, no audio).
2. **Line 475**: `subprocess.run(cmd, check=True, capture_output=True, timeout=540)` -- FFmpeg for video+audio MP4 (Cases B/C/D).

Both are inside the `_build_mp4` function.

**Migration approach**: Add `runner: SandboxMediaRunner | None = None` parameter to `_build_mp4`. Route the FFmpeg calls through the runner. The `check=True` behavior (raise on non-zero return) is replicated in the runner.

**Important**: Playwright browser automation (used in `_render_slides_to_screenshots`) is NOT migrated in this section. Playwright requires a real browser runtime and is conceptually different from FFmpeg command execution. Browser sandbox migration is tracked separately (deferred to a future phase per the plan's Section 5.2 rationale about PTY/browser migration).

### 6.5 Migrate `factory_orchestrator.py`

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/factory_orchestrator.py`

One subprocess call at line 29:

```python
def _run_cmd(self, cmd: List[str], cwd: str) -> subprocess.CompletedProcess:
    env = sanitize_env(dict(os.environ))
    return subprocess.run(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True, timeout=60 * 30)
```

**Migration approach**: This uses the `code-default` profile (not `media-processing`) because factory orchestrator commands are general-purpose code execution, not media processing.

Add `runner: SandboxMediaRunner | None = None` as a class attribute or inject it via constructor. In `_run_cmd`, route through the runner when available. Since the orchestrator `run()` method makes multiple `_run_cmd` calls, the sandbox session is created at the `run()` method level and reused.

### 6.6 Migrate `docker_executor.py`

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/docker_executor.py`

The `DockerExecutor.execute()` method (line 285) uses `asyncio.create_subprocess_exec` to run commands either on the host or inside a Docker container.

**Migration approach**: Add a sandbox execution path as a third mode alongside HOST and DOCKER:

```python
class DockerExecutionMode(str, Enum):
    HOST = "host"
    DOCKER = "docker"
    AUTO = "auto"
    SANDBOX = "sandbox"  # NEW: route through OpenSandbox
```

When `OPENSANDBOX_ENABLED=true`, the `get_effective_mode()` method should prefer `SANDBOX` mode. The `execute()` method adds a branch:

```python
if mode == DockerExecutionMode.SANDBOX:
    result = await self._runner.run_command(command, timeout=timeout)
    return (result.returncode, result.stdout, result.stderr)
```

The profile selection is based on command type heuristics:
- Commands containing `ffmpeg` or `ffprobe` -> `media-processing`
- All others -> `code-default`

### 6.7 Input/Output File Staging Strategy

When sandbox is enabled, files referenced in FFmpeg commands must be available inside the sandbox filesystem. The `SandboxMediaRunner` handles this transparently:

**Input staging**:
1. Before executing a command, the runner scans command arguments for file paths (absolute paths or paths relative to the working directory).
2. Detected input files are uploaded to the sandbox via `files.stage_inputs()` from the SDK client (Section 03).
3. Command arguments are rewritten to point to sandbox-internal paths (e.g., `/workspace/input.mp4`).

**Output collection**:
1. After command execution, the runner identifies output files by:
   - Scanning for `-y <output_path>` patterns in FFmpeg commands.
   - Using explicit output path declarations from the handler.
2. Output files are downloaded from the sandbox via `files.collect_outputs()`.
3. Downloaded files are placed in the local `tmp_dir` so existing post-processing logic works unchanged.

**Font file staging**: For subtitle burn-in (drawtext filter or ASS subtitles), font files must be available inside the sandbox. The runner detects font references in filter_complex strings (e.g., `font='Noto Sans'`) and stages the corresponding font files from `/usr/share/fonts/` into the sandbox's font directory.

### 6.8 Error Handling

- **Sandbox creation failure**: The runner raises a `SandboxProvisionError` (defined in Section 03). The caller catches this and falls back to legacy subprocess if `DISPATCH_MODE=optional`.
- **Command execution failure**: Non-zero exit code raises `RuntimeError` with the stderr excerpt, identical to the existing subprocess pattern.
- **Timeout**: The sandbox TTL handles overall timeout. Individual command timeouts are passed to the sandbox `run_command()` API. On timeout, partial stdout/stderr are collected if available.
- **File staging failure**: If input file upload fails, the runner raises `SandboxFileError`. If `DISPATCH_MODE=optional`, caller falls back to legacy.
- **Sandbox destruction failure**: Logged as warning. The orphan sandbox reconciler (Section 10) handles cleanup.

### 6.9 Feature Flag Integration

The migration uses the same feature flag pattern throughout:

```python
from app.integrations.opensandbox.config import get_settings

settings = get_settings()
if settings.enabled:
    # sandbox path
else:
    # legacy subprocess path
```

The feature flag check happens at the entry point of each migrated function, NOT deep inside the call chain. This means:
- `execute_media_job` in `media_job_worker.py` checks once and passes the runner to handlers
- `generate_thumbnail` / `extract_metadata` in `media_pipeline.py` check once
- `render_presentation` in `presentation_render.py` checks once and passes runner to `_build_mp4`
- `SaaSFactoryOrchestrator.run()` checks once and uses runner for all `_run_cmd` calls
- `DockerExecutor.get_effective_mode()` checks once

---

## Files to Create

| File | Description |
|---|---|
| `/home/dev/projects/SmartSpecPro/python-backend/app/video/sandbox_runner.py` | SandboxMediaRunner class |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_sandbox_media_runner.py` | Tests for SandboxMediaRunner |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_job_worker_sandbox.py` | Tests for media_job_worker sandbox routing |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_media_pipeline_sandbox.py` | Tests for media_pipeline sandbox routing |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_presentation_render_sandbox.py` | Tests for presentation_render sandbox routing |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_factory_orchestrator_sandbox.py` | Tests for factory_orchestrator sandbox routing |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_docker_executor_sandbox.py` | Tests for docker_executor sandbox routing |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_video_pipeline_sandbox.py` | Tests for video/pipeline.py sandbox routing |

## Files to Modify

| File | Changes |
|---|---|
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py` | Add runner parameter to all handlers, wrap `execute_media_job` with sandbox session, make handlers async-compatible |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/media_pipeline.py` | Add runner parameter to `_generate_video_thumbnail`, `_ffprobe_metadata`, `extract_metadata`, `generate_thumbnail` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/presentation_render.py` | Add runner parameter to `_build_mp4`, create session in `render_presentation` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/factory_orchestrator.py` | Add runner to `SaaSFactoryOrchestrator`, wrap `run()` with sandbox session |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/docker_executor.py` | Add `SANDBOX` execution mode, integrate SandboxMediaRunner |
| `/home/dev/projects/SmartSpecPro/python-backend/app/video/pipeline.py` | Add runner parameter to `_probe_clip`, `run_assembly_stage`, `run_final_render` |

---

## Implementation Checklist

1. Write all test files (stubs above) with pytest markers
2. Create `sandbox_runner.py` with `SandboxMediaRunner` class
3. Run `test_sandbox_media_runner.py` tests and verify they pass
4. Migrate `media_job_worker.py` handlers one at a time, running `test_media_job_worker_sandbox.py` after each
5. Migrate `media_pipeline.py`, run `test_media_pipeline_sandbox.py`
6. Migrate `presentation_render.py`, run `test_presentation_render_sandbox.py`
7. Migrate `factory_orchestrator.py`, run `test_factory_orchestrator_sandbox.py`
8. Migrate `docker_executor.py`, run `test_docker_executor_sandbox.py`
9. Migrate `video/pipeline.py`, run `test_video_pipeline_sandbox.py`
10. Run full existing test suite (`cd python-backend && pytest`) to verify no regressions
11. Verify all existing `test_media_job_worker.py`, `test_presentation_render_task.py`, and `test_dead_air_cut.py` tests still pass (they mock `subprocess.run` and should be unaffected when `OPENSANDBOX_ENABLED=false`)

---

## Implementation Notes (Post-Implementation)

### What Was Actually Built

**Core abstraction** (`app/video/sandbox_runner.py` — NEW, 282 lines):
- `SandboxMediaRunner` class with both async (`__aenter__`/`__aexit__`) and sync (`__enter__`/`__exit__`) context managers
- `run_command_sync()` for Celery tasks — bridges to async via `asyncio.run()` when sandbox enabled, falls back to `subprocess.run()` when disabled
- `run_command()` async version for FastAPI endpoints
- `_run_in_sandbox()` with `text` parameter to handle binary stdout (e.g., PCM waveform data)
- `stage_files()` and `collect_files()` methods defined but not yet called (deferred to section-07/08 entry point wiring)
- `SandboxMediaRunner.session()` classmethod for creating sessions with profile configuration

**Migrated files** (6 files, ~33 subprocess calls):
1. `app/tasks/media_job_worker.py` — All 12 handlers + 3 utility functions got `runner=None`. `build_ffmpeg_command_for_render` also got `runner=None` to pass to `_has_audio_stream`.
2. `app/services/media_pipeline.py` — `_generate_video_thumbnail` and `_ffprobe_metadata` internal helpers got `runner=None`.
3. `app/tasks/presentation_render.py` — `_build_mp4` got `runner=None`.
4. `app/orchestrator/factory_orchestrator.py` — `self._runner = None` attribute added, `_run_cmd` routes through runner when set.
5. `app/services/docker_executor.py` — `SANDBOX` enum value added, `get_effective_mode()` handles SANDBOX explicitly, `execute()` routes to sandbox runner.
6. `app/video/pipeline.py` — `_probe_clip`, `run_assembly_stage`, `run_final_render` got `runner=None`.

**Test coverage** (7 test files, 31 tests):
- `test_sandbox_media_runner.py` — 9 tests (core runner, session lifecycle, error handling)
- `test_media_job_worker_sandbox.py` — 7 tests (handle_probe, handle_dead_air_detect, handle_subtitles_extract, _has_audio_stream, _detect_video_codec, _probe_media_info, plus fallback)
- `test_media_pipeline_sandbox.py` — 4 tests (thumbnail + ffprobe with/without runner)
- `test_presentation_render_sandbox.py` — 2 tests (_build_mp4 with/without runner)
- `test_factory_orchestrator_sandbox.py` — 2 tests (_run_cmd with/without runner)
- `test_docker_executor_sandbox.py` — 3 tests (SANDBOX mode, HOST mode, enum check)
- `test_video_pipeline_sandbox.py` — 4 tests (probe_clip, assembly, final_render)

### Deviations from Plan

1. **Entry point wiring deferred**: The plan specified creating sandbox sessions at entry points (render_presentation, generate_thumbnail, factory_orchestrator.run()). This was deferred to section-07/08 by user decision. Section-06 focused solely on adding `runner=None` params and routing logic to internal functions.
2. **File staging/collection not wired**: `stage_files()` and `collect_files()` exist but are not called. This will be wired when entry points are connected in section-07/08.
3. **Sync bridging approach**: Used `asyncio.run()` per-call rather than maintaining a persistent event loop per session. This is correct for prefork Celery workers but wasteful. Acceptable trade-off for this iteration.
4. **Test coverage**: 31 tests cover core patterns. The plan specified ~12 more tests for complex handlers (handle_render_mp4, handle_transcode_h264, etc.) and file staging — deferred along with entry point wiring.

### Code Review Fixes Applied
- Added `text` parameter to `_run_in_sandbox()` for binary stdout handling (handle_waveform_peaks)
- Added `runner=None` to `build_ffmpeg_command_for_render()` and wired `_has_audio_stream(path, runner=runner)`