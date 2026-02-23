I now have all the context needed. Let me generate the section content:

# Section 07: Python Celery Render Task

## Overview

This section implements the core server-side presentation rendering logic: a Celery task that orchestrates headless Chromium screenshots via Playwright, format-specific post-processing (MP4/PDF/PNG/JPG), S3/R2 upload, and progress reporting.

**Dependencies (must be complete before starting this section):**
- Section 05 (Slide Render Route) — the `GET /internal/slide-render/:deckId/:slideIndex` Express route must be running, as the Playwright browser navigates to it
- Section 06 (Python FastAPI Export API) — `presentations_export.py` creates the Celery task via `render_presentation.delay(...)`, so the task must exist in the import path
- Section 14 (Infrastructure) — the Docker image must have Playwright, PyJWT, pypdf, and Pillow installed; `INTERNAL_RENDER_BASE_URL` and `JWT_SECRET` env vars must be available; the `presentation_export` queue must be declared in `celery_app.py`

---

## Tests First

Create `/home/dev/projects/SmartSpecPro/python-backend/tests/test_presentation_render_task.py`.

All unit tests must mock Playwright so they run without a real browser. The mock pattern is:

```python
from unittest.mock import MagicMock, patch, call
import pytest

# Mock screenshot bytes: a minimal valid 1x1 white PNG
MOCK_PNG_BYTES = b'\x89PNG\r\n\x1a\n...'  # Use a real 1x1 white PNG fixture
```

### Unit Tests (`@pytest.mark.unit`)

```python
@pytest.mark.unit
class TestRenderPresentationProgress:
    """update_state is called with monotonically increasing percent."""

    def test_progress_increases_per_slide(self, mock_playwright, sample_render_spec):
        """update_state percent rises from 0 to 75 across all slides."""
        ...

    def test_progress_reaches_75_after_all_slides(self, mock_playwright, sample_render_spec):
        """After all screenshots, update_state is called with percent=75."""
        ...

    def test_progress_reaches_90_after_format_processing(self, mock_playwright, sample_render_spec):
        """After MP4 encoding step, update_state is called with percent=90."""
        ...

    def test_progress_reaches_100_after_upload(self, mock_playwright, mock_storage, sample_render_spec):
        """After S3 upload, update_state is called with percent=100."""
        ...


@pytest.mark.unit
class TestTempDirCleanup:
    """Temp directory is always cleaned up, even on failure."""

    def test_cleanup_on_success(self, mock_playwright, mock_storage, sample_render_spec, tmp_path):
        """Temp directory is removed in finally block on successful completion."""
        ...

    def test_cleanup_on_soft_time_limit(self, mock_playwright, sample_render_spec):
        """Temp directory is removed when SoftTimeLimitExceeded is raised."""
        from celery.exceptions import SoftTimeLimitExceeded
        ...

    def test_cleanup_on_generic_exception(self, mock_playwright, sample_render_spec):
        """Temp directory is removed when a generic Exception is raised mid-task."""
        ...


@pytest.mark.unit
class TestJWTHeaderSecurity:
    """Internal render JWT is passed as a header, not a query parameter."""

    def test_token_in_x_internal_token_header(self, mock_playwright, sample_render_spec):
        """Playwright set_extra_http_headers is called with X-Internal-Token."""
        ...

    def test_token_not_in_url(self, mock_playwright, sample_render_spec):
        """The URL passed to page.goto does not contain a token query parameter."""
        ...

    def test_internal_render_base_url_env_var(self, monkeypatch, mock_playwright, sample_render_spec):
        """INTERNAL_RENDER_BASE_URL controls the base URL used in Playwright navigation."""
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://custom-host:3001")
        ...


@pytest.mark.unit
class TestSlideReadyTimeout:
    """window.__slideReady timeout logs a warning but does not abort."""

    def test_timeout_logs_warning_and_continues(self, mock_playwright, sample_render_spec, caplog):
        """When __slideReady polling times out, a warning is logged but screenshot is still taken."""
        ...


@pytest.mark.unit
class TestFFmpegConcatFile:
    """FFmpeg concat demuxer file format is correct."""

    def test_concat_file_has_one_entry_per_slide(self, tmp_path, sample_render_spec):
        """Concat file has exactly N entries for N slides."""
        ...

    def test_concat_file_duration_from_duration_ms(self, tmp_path, sample_render_spec):
        """Each concat entry's duration is durationMs / 1000."""
        ...

    def test_concat_file_fps_30(self, mock_playwright, mock_ffmpeg, sample_render_spec):
        """FFmpeg is invoked with r=30."""
        ...

    def test_quality_presets(self, mock_playwright, mock_ffmpeg, sample_render_spec):
        """Draft uses CRF28/veryfast, standard CRF23/medium, high CRF18/slow."""
        ...


@pytest.mark.unit
class TestOutputFormats:
    """PNG and JPG output formats."""

    def test_png_output_is_zip(self, mock_playwright, mock_storage, sample_render_spec):
        """PNG format produces a zip file containing slide_0000.png, slide_0001.png, etc."""
        ...

    def test_jpg_output_converts_to_jpeg_quality_90(self, mock_playwright, mock_storage, sample_render_spec):
        """JPG format converts PNG screenshots to JPEG quality=90 before zipping."""
        ...

    def test_pdf_output_uses_pypdf_writer(self, mock_playwright, mock_storage, sample_render_spec):
        """PDF format calls pypdf.PdfWriter to merge per-slide PDFs."""
        ...
```

### Slow Tests (`@pytest.mark.slow`)

```python
@pytest.mark.slow
class TestEndToEndRenderPipeline:
    """End-to-end render pipeline with mocked Playwright screenshots."""

    def test_3_slide_png_zip(self, mock_playwright_screenshot, mock_storage, three_slide_render_spec):
        """Render 3-slide deck to PNG zip; zip contains 3 files named slide_000N.png."""
        ...

    def test_concat_file_valid_ffmpeg_format(self, tmp_path, three_slide_render_spec):
        """Concat file is valid FFmpeg concat demuxer format: `file '...'` + `duration N.NNN`."""
        ...

    def test_audio_tracks_in_ffmpeg_inputs(self, mock_playwright_screenshot, mock_ffmpeg, audio_render_spec):
        """Audio tracks from render_spec are included as -i inputs in FFmpeg command."""
        ...

    def test_project_audio_stream_loop(self, mock_playwright_screenshot, mock_ffmpeg, project_audio_render_spec):
        """Project audio with loop=true uses stream_loop=-1 in FFmpeg args."""
        ...
```

### Test Fixtures (`conftest.py` additions)

Add to `/home/dev/projects/SmartSpecPro/python-backend/tests/conftest.py`:

```python
@pytest.fixture
def sample_render_spec():
    """Minimal 2-slide render spec for unit tests."""
    return {
        "deckId": 1,
        "slides": [
            {"slideId": 1, "orderIndex": 0, "durationMs": 3000, "title": "Slide 1", "audioTrack": None},
            {"slideId": 2, "orderIndex": 1, "durationMs": 4000, "title": "Slide 2", "audioTrack": None},
        ],
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "format": "mp4",
        "quality": "standard",
        "projectAudioTrack": None,
    }

@pytest.fixture
def three_slide_render_spec():
    """3-slide render spec with varied durations."""
    ...

@pytest.fixture
def audio_render_spec(sample_render_spec):
    """Render spec with per-slide audio tracks."""
    ...

@pytest.fixture
def project_audio_render_spec(sample_render_spec):
    """Render spec with project-wide looping audio."""
    ...

@pytest.fixture
def mock_playwright(monkeypatch):
    """Mock playwright.sync_api.sync_playwright to return fake screenshots."""
    with patch("playwright.sync_api.sync_playwright") as mock_pw:
        mock_page = MagicMock()
        mock_page.screenshot.return_value = b"<fake-png-bytes>"
        mock_page.evaluate.return_value = True  # __slideReady = true immediately
        mock_context = MagicMock()
        mock_context.new_page.return_value = mock_page
        mock_browser = MagicMock()
        mock_browser.new_context.return_value = mock_context
        mock_pw.return_value.__enter__.return_value.chromium.launch.return_value = mock_browser
        yield mock_pw

@pytest.fixture
def mock_storage(monkeypatch):
    """Mock S3/R2 upload and presign operations."""
    ...

@pytest.fixture
def mock_ffmpeg(monkeypatch):
    """Mock subprocess.run for FFmpeg calls."""
    ...
```

---

## Implementation

### File to Create

`/home/dev/projects/SmartSpecPro/python-backend/app/tasks/presentation_render.py`

### File to Modify

`/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`

---

### 7.1 celery_app.py Changes

Add the `presentation_export` queue and task route to the existing Celery configuration in `celery_app.py`. Two changes are required:

**In `task_queues` list:**
```python
task_queues=[
    Queue("celery"),
    Queue("video"),
    Queue("media"),
    Queue("presentation_export"),   # <-- ADD THIS
],
```

**In `task_routes` dict:**
```python
task_routes={
    # ... existing routes ...
    # Presentation headless rendering (CPU + Playwright + FFmpeg)
    "app.tasks.presentation_render.render_presentation": {"queue": "presentation_export"},
},
```

**Also update `REQUIRED_QUEUES`** at the top of the file:
```python
REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export"]
```

Worker startup command (document in `run-services.sh` operational notes):
```bash
celery -A app.core.celery_app worker \
    -Q presentation_export \
    -c 2 \
    --hostname=presentation@%h
```

Concurrency is capped at 2 to prevent OOM from simultaneous Playwright browser instances.

---

### 7.2 Task Module Structure

`presentation_render.py` has four main sections:

1. **Imports and constants** — all dependencies, quality presets, env var reads
2. **Task definition** with `@celery_app.task` decorator
3. **Stage 1 helper** `_render_slides_to_screenshots(...)` — Playwright orchestration
4. **Stage 2 helpers** per format — `_build_mp4(...)`, `_build_pdf(...)`, `_build_png_zip(...)`, `_build_jpg_zip(...)`
5. **Stage 3 helper** `_upload_output(...)` — S3/R2 upload

### 7.3 Task Signature and Decorator

```python
from celery.exceptions import SoftTimeLimitExceeded
from app.core.celery_app import celery_app
import structlog

logger = structlog.get_logger()

@celery_app.task(
    bind=True,
    soft_time_limit=660,         # 11 min: raises SoftTimeLimitExceeded
    time_limit=720,              # 12 min: SIGKILL
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=0,               # No retries — renders are deterministic; retry = new job
    queue="presentation_export",
)
def render_presentation(self, render_spec: dict, quality: str, format: str) -> dict:
    """
    Render a presentation deck to the requested output format.

    Stages:
      1. Playwright screenshots of each slide (0–75%)
      2. Format-specific processing: MP4/PDF/PNG zip/JPG zip (75–90%)
      3. S3/R2 upload + presigned URL (90–100%)

    Args:
        render_spec: Full PresentationRenderSpec dict from Node.js (with resolved audio URLs).
        quality: "draft" | "standard" | "high"
        format: "mp4" | "pdf" | "png" | "jpg"

    Returns:
        {"output_url": str, "output_bytes": int}

    Raises:
        SoftTimeLimitExceeded: Cleaned up and re-raised after temp dir removal.
        Exception: Cleaned up and let Celery mark task as FAILURE.
    """
```

### 7.4 Orchestration Body

The task body uses a single `try/finally` for temp dir cleanup:

```python
import tempfile, os, shutil

tmp_dir = tempfile.mkdtemp(prefix="pres_render_")
try:
    # Stage 1: Screenshots
    screenshot_paths = _render_slides_to_screenshots(self, render_spec, tmp_dir)

    # Stage 2: Format processing
    output_path = _process_format(self, render_spec, format, quality, screenshot_paths, tmp_dir)

    # Stage 3: Upload
    result = _upload_output(self, output_path, render_spec, format)

    return result

except SoftTimeLimitExceeded:
    logger.warning("render_presentation_soft_time_limit_exceeded",
                   deck_id=render_spec.get("deckId"))
    raise
except Exception as exc:
    logger.error("render_presentation_failed",
                 deck_id=render_spec.get("deckId"),
                 error=str(exc))
    raise
finally:
    shutil.rmtree(tmp_dir, ignore_errors=True)
    logger.info("render_presentation_tmp_cleaned", tmp_dir=tmp_dir)
```

### 7.5 Stage 1: Playwright Screenshot Rendering

```python
def _render_slides_to_screenshots(task_self, render_spec: dict, tmp_dir: str) -> list[str]:
    """
    Navigate Playwright to each slide's internal render URL and capture screenshots.

    Returns list of absolute paths to PNG screenshot files (slide_0000.png, etc.)

    Security:
    - JWT token passed via X-Internal-Token header ONLY (never in URL query string)
    - 5-minute token TTL (sufficient for one screenshot call)
    - Per-slide token includes deckId + slideIndex claims for server-side validation

    Environment:
    - INTERNAL_RENDER_BASE_URL defaults to http://localhost:3000
    - JWT_SECRET must match apps/web/.env JWT_SECRET
    """
```

Key implementation details for this helper:

**JWT generation** (one token per slide, 5-minute TTL):
```python
import jwt, time, os

def _make_slide_token(deck_id: int, slide_index: int) -> str:
    """Generate a short-lived JWT for a single slide render request."""
    return jwt.encode(
        {
            "sub": "internal-render",
            "scopes": ["internal:slide-render"],
            "deckId": deck_id,
            "slideIndex": slide_index,
            "exp": int(time.time()) + 300,
        },
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )
```

**Playwright browser launch** (one context for all slides, then close):
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(args=[
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
    ])
    context = browser.new_context(viewport={"width": width, "height": height})
    # ... screenshot loop ...
    context.close()
    browser.close()
```

**Per-slide screenshot loop**:
```python
base_url = os.getenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
deck_id = render_spec["deckId"]
slides = render_spec["slides"]
total = len(slides)
screenshot_paths = []

for idx, slide in enumerate(slides):
    token = _make_slide_token(deck_id, idx)
    url = f"{base_url}/internal/slide-render/{deck_id}/{idx}"

    page = context.new_page()
    page.set_extra_http_headers({"X-Internal-Token": token})
    page.goto(url, wait_until="domcontentloaded")

    # Poll window.__slideReady (up to 10 seconds, 100ms intervals)
    ready = False
    for _ in range(100):
        ready = page.evaluate("() => window.__slideReady === true")
        if ready:
            break
        page.wait_for_timeout(100)
    if not ready:
        logger.warning("slide_ready_timeout", deck_id=deck_id, slide_index=idx)

    out_path = os.path.join(tmp_dir, f"slide_{idx:04d}.png")
    page.screenshot(
        path=out_path,
        clip={"x": 0, "y": 0, "width": width, "height": height},
        animations="disabled",
    )
    page.close()
    screenshot_paths.append(out_path)

    percent = int((idx + 1) / total * 75)
    task_self.update_state(
        state="PROGRESS",
        meta={"percent": percent, "stage": f"Rendering slide {idx + 1} of {total}"},
    )
```

### 7.6 Stage 2: Format-Specific Processing

**Quality presets** (module-level constants):
```python
QUALITY_PRESETS = {
    "draft":    {"crf": 28, "preset": "veryfast"},
    "standard": {"crf": 23, "preset": "medium"},
    "high":     {"crf": 18, "preset": "slow"},
}
```

**MP4 via FFmpeg:**

Build a concat demuxer input file where each entry specifies the slide image and its duration in seconds:

```
# concat_list.txt format:
file '/tmp/pres_render_XXX/slide_0000.png'
duration 3.000
file '/tmp/pres_render_XXX/slide_0001.png'
duration 4.000
```

The last slide entry does not need a `duration` line per FFmpeg concat demuxer docs, but including it is harmless.

FFmpeg command structure (no audio):
```python
import subprocess

concat_path = os.path.join(tmp_dir, "concat_list.txt")
output_path = os.path.join(tmp_dir, "output.mp4")
preset = QUALITY_PRESETS[quality]

cmd = [
    "ffmpeg", "-y",
    "-f", "concat", "-safe", "0", "-i", concat_path,
    "-vf", f"fps={fps}",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", str(preset["crf"]),
    "-preset", preset["preset"],
    "-movflags", "+faststart",
    "-r", "30",
    output_path,
]
subprocess.run(cmd, check=True, capture_output=True)
```

When audio is present, add per-slide audio clips and project audio as `-i` inputs with an `amix` filter graph. Audio inputs use `-i {url}` (presigned HTTP URLs resolved by Node.js). Per-slide audio uses `atrim`/`afade` with fade-out at the slide boundary. Project audio uses `stream_loop=-1` if `loop=true`.

**PDF via Playwright + pypdf:**

For each slide, open the screenshot PNG in a new Playwright page and call `page.pdf()`. Then merge with `pypdf.PdfWriter`:

```python
import pypdf

writer = pypdf.PdfWriter()
for idx in range(len(slides)):
    slide_pdf_path = os.path.join(tmp_dir, f"slide_{idx:04d}.pdf")
    # ... capture slide as PDF using Playwright page.pdf() ...
    reader = pypdf.PdfReader(slide_pdf_path)
    writer.add_page(reader.pages[0])

output_path = os.path.join(tmp_dir, "output.pdf")
with open(output_path, "wb") as f:
    writer.write(f)
```

**PNG zip:**

The screenshots from Stage 1 are already PNG. Zip them:
```python
import zipfile

output_path = os.path.join(tmp_dir, "output.zip")
with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in screenshot_paths:
        zf.write(path, arcname=os.path.basename(path))
```

**JPG zip:**

Convert each PNG to JPEG quality=90 using Pillow, then zip:
```python
from PIL import Image

jpg_paths = []
for png_path in screenshot_paths:
    jpg_path = png_path.replace(".png", ".jpg")
    with Image.open(png_path) as img:
        img.convert("RGB").save(jpg_path, "JPEG", quality=90)
    jpg_paths.append(jpg_path)

output_path = os.path.join(tmp_dir, "output.zip")
with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in jpg_paths:
        zf.write(path, arcname=os.path.basename(path))
```

After Stage 2 completes:
```python
task_self.update_state(
    state="PROGRESS",
    meta={"percent": 90, "stage": "Uploading"},
)
```

### 7.7 Stage 3: Upload and Return

Use the existing `R2StorageService` (from `app.services.r2_storage_service`) or the `app.services.generation.r2_storage` module — check which pattern is used by `media_job_worker.py` for consistency. The upload should:

1. Open the output file
2. Upload with a key like `presentation-exports/{deck_id}/{task_id}.{ext}`
3. Generate a 48-hour presigned GET URL
4. Return `{"output_url": url, "output_bytes": file_size}`

```python
def _upload_output(task_self, output_path: str, render_spec: dict, format: str) -> dict:
    """
    Upload the rendered output to S3/R2 and return a presigned download URL.

    Returns: {"output_url": str, "output_bytes": int}
    """
    ...
    task_self.update_state(
        state="PROGRESS",
        meta={"percent": 100, "stage": "Done"},
    )
    return {"output_url": presigned_url, "output_bytes": file_size}
```

Note: `_upload_output` must use `_run_async()` (the same async-in-Celery helper used in `media_tasks.py`) since `R2StorageService.upload()` is an async method. Import `_run_async` from `app.tasks.media_tasks` or copy the pattern — do not use `asyncio.run()` which closes the event loop.

---

## `_process_format` Dispatcher

This is the internal router that calls the right Stage 2 function and emits the progress update at 90%:

```python
def _process_format(
    task_self,
    render_spec: dict,
    format: str,
    quality: str,
    screenshot_paths: list[str],
    tmp_dir: str,
) -> str:
    """Route to the correct format processor and return the output file path."""
    if format == "mp4":
        output_path = _build_mp4(render_spec, quality, screenshot_paths, tmp_dir)
    elif format == "pdf":
        output_path = _build_pdf(render_spec, screenshot_paths, tmp_dir)
    elif format == "png":
        output_path = _build_png_zip(screenshot_paths, tmp_dir)
    elif format == "jpg":
        output_path = _build_jpg_zip(screenshot_paths, tmp_dir)
    else:
        raise ValueError(f"Unsupported format: {format}")

    task_self.update_state(
        state="PROGRESS",
        meta={"percent": 90, "stage": "Uploading"},
    )
    return output_path
```

---

## Environment Variables Required

The Celery worker process must have these variables set:

| Variable | Value | Source |
|---|---|---|
| `JWT_SECRET` | Same as `apps/web/.env` `JWT_SECRET` | Shared secret |
| `INTERNAL_RENDER_BASE_URL` | `http://localhost:3000` (local) or `http://host.docker.internal:3000` (Docker) | Worker env |

When running inside Docker (as the `presentation_export` worker typically does), `localhost` refers to the container itself — use `http://host.docker.internal:3000` to reach the Node.js web app on the Docker host.

---

## New Dependencies Required

Add to `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` (if not already present):

```
playwright>=1.40.0
pypdf>=4.0.0
Pillow>=10.0.0
```

`PyJWT` is already at version 2.8.0 in `requirements.txt`.

After adding, rebuild the Docker image per Section 14's instructions.

---

## Worker Startup Documentation

Document the worker startup command for the operations team. Add to `run-services.sh` or the operational runbook:

```bash
# Presentation export worker (dedicated, limited concurrency to avoid OOM)
# Must be started AFTER the Docker image has been rebuilt with Playwright
celery -A app.core.celery_app worker \
    -Q presentation_export \
    -c 2 \
    --hostname=presentation@%h \
    --loglevel=info
```

This worker should be kept separate from the `media` and `video` workers because:
- Playwright browser instances are memory-intensive (~500MB each)
- Concurrency of 2 limits peak memory to ~1GB for this worker process
- It must not compete with existing media task workers

---

## Checklist

- [x] Add `presentation_export` queue to `celery_app.py` (`task_queues`, `task_routes`, `REQUIRED_QUEUES`)
- [x] Create `python-backend/app/tasks/presentation_render.py`
- [x] Implement `render_presentation` task with `@celery_app.task` decorator and correct time limits
- [x] Implement `_make_slide_token()` — JWT with deckId, slideIndex, 5-min TTL, `X-Internal-Token` header
- [x] Implement `_render_slides_to_screenshots()` — Playwright loop, `__slideReady` polling, warn-and-continue on timeout
- [x] Implement `_build_mp4()` — concat demuxer file + FFmpeg with quality presets
- [x] Implement `_build_pdf()` — Playwright PDF per slide + pypdf merge
- [x] Implement `_build_png_zip()` — zip screenshots
- [x] Implement `_build_jpg_zip()` — Pillow JPEG conversion + zip
- [x] Implement `_upload_output()` — S3/R2 upload + 48-hour presigned URL
- [x] `try/finally` in task body ensures `shutil.rmtree(tmp_dir)` always runs
- [x] `SoftTimeLimitExceeded` is caught, logs warning, cleans up, and re-raises
- [x] Update `requirements.txt` with `playwright`, `pypdf`, `Pillow`
- [x] Write all unit tests in `test_presentation_render_task.py`
- [x] Verify Python coverage stays at or above 80%: `cd python-backend && uv run pytest --cov`

---

## Implementation Results

**Status:** COMPLETE (committed)

### Files Created/Modified

- `python-backend/app/tasks/presentation_render.py` — full task implementation (created)
- `python-backend/tests/test_presentation_render_task.py` — 35 unit tests (created)
- `python-backend/app/core/celery_app.py` — added `presentation_export` queue (modified)
- `python-backend/requirements.txt` — added playwright, pypdf, Pillow (modified)

### Deviations from Plan (Code Review Fixes)

1. **H-1: PDF via Playwright page.pdf()** — Initial implementation used Pillow rasterization (simpler). User approved per-spec Playwright approach. `_build_pdf` launches Playwright, navigates to each PNG via `file://` URL, calls `page.pdf()`, then merges with `pypdf.PdfWriter`.

2. **H-2: 48-hour presigned URL** — Initial implementation returned the permanent public URL from `r2.upload_file()`. Fixed: `_upload_output` now calls `r2.generate_presigned_url(key, expires_in=172800)` after upload and returns the presigned URL.

3. **H-3: _run_async import** — Local copy of `_run_async` was incomplete (missing `asyncio.get_running_loop()` deadlock guard). Fixed: replaced with `from app.tasks.media_tasks import _run_async`.

4. **H-4: deck_id sanitization** — R2 key `deck_id` was unsanitized (path traversal risk). Fixed: `str(int(deck_id))` coercion with fallback to `"0"` for malformed values.

5. **M-1: Browser try/finally** — Browser and context close were only reached on happy path. Fixed: nested `try/finally` ensures `context.close()` and `browser.close()` are called unconditionally.

6. **M-2: FFmpeg timeout** — `subprocess.run` had no timeout. Fixed: `timeout=540` added.

7. **M-3: Audio silently dropped** — User accepted silent drop behavior; audio mixing deferred.

8. **M-4: Removed hardcoded -r 30** — Conflicting fps directive removed; fps now controlled exclusively by `-vf fps={fps}`.

9. **M-5: TestBuildPdf added** — `TestBuildPdf` class with 3 tests covering PDF file creation, `page.pdf()` call count, and `pypdf.PdfWriter.add_page` invocation.

10. **M-6: render_spec validation** — `ValueError` raised at task entry for missing `deckId` or `slides` fields. `TestRenderSpecValidation` class added.

11. **L-3: assert == 75** — Fixed loose assertion from `<= 75` to `== 75`.

### Test Count

- **35 tests**, **35/35 passing**
- `app/tasks/presentation_render.py`: **94% coverage**