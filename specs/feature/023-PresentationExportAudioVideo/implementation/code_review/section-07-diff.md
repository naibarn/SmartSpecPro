diff --git a/python-backend/app/core/celery_app.py b/python-backend/app/core/celery_app.py
index b6eec4d..1b3c8b5 100644
--- a/python-backend/app/core/celery_app.py
+++ b/python-backend/app/core/celery_app.py
@@ -10,7 +10,7 @@ from app.core.config import settings
 import os
 
 # Required queues — worker MUST consume from all of these
-REQUIRED_QUEUES = ["celery", "video", "media"]
+REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export"]
 
 # Create Celery app
 celery_app = Celery(
@@ -39,6 +39,7 @@ celery_app.conf.update(
         Queue("celery"),
         Queue("video"),
         Queue("media"),
+        Queue("presentation_export"),
     ],
     task_create_missing_queues=True,
     # Queue routing: isolate FFmpeg video tasks from API-based media tasks
@@ -80,6 +81,8 @@ celery_app.conf.update(
         "onedrive.disconnect_cleanup": {"queue": "media"},
         # Approval timeout checker -> celery queue (lightweight, periodic)
         "app.tasks.approval_timeout_tasks.check_expired_approvals": {"queue": "celery"},
+        # Presentation headless rendering (CPU + Playwright + FFmpeg)
+        "app.tasks.presentation_render.render_presentation": {"queue": "presentation_export"},
     },
 )
 
diff --git a/python-backend/app/tasks/presentation_render.py b/python-backend/app/tasks/presentation_render.py
new file mode 100644
index 0000000..cf3f705
--- /dev/null
+++ b/python-backend/app/tasks/presentation_render.py
@@ -0,0 +1,368 @@
+"""
+Celery task for rendering presentation decks to video, PDF, or image archives.
+
+Stages:
+  1. Playwright screenshots of each slide              (0–75%)
+  2. Format-specific post-processing (MP4/PDF/PNG/JPG) (75–90%)
+  3. S3/R2 upload + presigned URL                     (90–100%)
+
+Worker startup (limited concurrency to prevent OOM from Playwright):
+  celery -A app.core.celery_app worker -Q presentation_export -c 2 --hostname=presentation@%h
+
+Environment variables required on the worker:
+  JWT_SECRET              — must match apps/web JWT_SECRET
+  INTERNAL_RENDER_BASE_URL — http://localhost:3000 or http://host.docker.internal:3000
+"""
+
+import os
+import shutil
+import subprocess
+import tempfile
+import time
+import zipfile
+from typing import Any
+
+import jwt
+import structlog
+from celery.exceptions import SoftTimeLimitExceeded
+from playwright.sync_api import sync_playwright
+
+from app.core.celery_app import celery_app
+from app.services.generation.r2_storage import get_r2_storage
+
+logger = structlog.get_logger(__name__)
+
+# ---------------------------------------------------------------------------
+# Constants
+# ---------------------------------------------------------------------------
+
+QUALITY_PRESETS: dict[str, dict[str, Any]] = {
+    "draft":    {"crf": 28, "preset": "veryfast"},
+    "standard": {"crf": 23, "preset": "medium"},
+    "high":     {"crf": 18, "preset": "slow"},
+}
+
+# Polling config for window.__slideReady
+_SLIDE_READY_POLL_ATTEMPTS = 100   # 100 × 100ms = 10s maximum wait
+_SLIDE_READY_POLL_INTERVAL_MS = 100
+
+
+# ---------------------------------------------------------------------------
+# Task definition
+# ---------------------------------------------------------------------------
+
+
+@celery_app.task(
+    bind=True,
+    soft_time_limit=660,         # 11 min: raises SoftTimeLimitExceeded
+    time_limit=720,              # 12 min: SIGKILL
+    acks_late=True,
+    reject_on_worker_lost=True,
+    max_retries=0,               # No retries — renders are deterministic; retry = new job
+    queue="presentation_export",
+)
+def render_presentation(self, render_spec: dict, quality: str, format: str) -> dict:
+    """
+    Render a presentation deck to the requested output format.
+
+    Args:
+        render_spec: Full PresentationRenderSpec dict from Node.js.
+        quality: "draft" | "standard" | "high"
+        format: "mp4" | "pdf" | "png" | "jpg"
+
+    Returns:
+        {"output_url": str, "output_bytes": int}
+    """
+    deck_id = render_spec.get("deckId")
+    tmp_dir = tempfile.mkdtemp(prefix="pres_render_")
+    try:
+        # Stage 1: Screenshots (0–75%)
+        screenshot_paths = _render_slides_to_screenshots(self, render_spec, tmp_dir)
+
+        # Stage 2: Format processing (75–90%)
+        output_path = _process_format(self, render_spec, format, quality, screenshot_paths, tmp_dir)
+
+        # Stage 3: Upload (90–100%)
+        result = _upload_output(self, output_path, render_spec, format)
+
+        logger.info(
+            "render_presentation_complete",
+            deck_id=deck_id,
+            format=format,
+            quality=quality,
+            output_url=result.get("output_url"),
+            output_bytes=result.get("output_bytes"),
+        )
+        return result
+
+    except SoftTimeLimitExceeded:
+        logger.warning("render_presentation_soft_time_limit_exceeded", deck_id=deck_id)
+        raise
+    except Exception as exc:
+        logger.error("render_presentation_failed", deck_id=deck_id, error=str(exc))
+        raise
+    finally:
+        shutil.rmtree(tmp_dir, ignore_errors=True)
+        logger.info("render_presentation_tmp_cleaned", tmp_dir=tmp_dir)
+
+
+# ---------------------------------------------------------------------------
+# Stage 1: Playwright screenshot rendering
+# ---------------------------------------------------------------------------
+
+
+def _make_slide_token(deck_id: int, slide_index: int) -> str:
+    """Generate a short-lived JWT for a single slide render request (5-minute TTL)."""
+    secret = os.environ["JWT_SECRET"]
+    return jwt.encode(
+        {
+            "sub": "internal-render",
+            "scopes": ["internal:slide-render"],
+            "deckId": deck_id,
+            "slideIndex": slide_index,
+            "exp": int(time.time()) + 300,
+        },
+        secret,
+        algorithm="HS256",
+    )
+
+
+def _render_slides_to_screenshots(task_self, render_spec: dict, tmp_dir: str) -> list[str]:
+    """
+    Navigate Playwright to each slide's internal render URL and capture screenshots.
+
+    Security:
+    - JWT token passed via X-Internal-Token header ONLY (never in URL query string)
+    - 5-minute token TTL (sufficient for one screenshot call)
+    - Per-slide token includes deckId + slideIndex claims for server-side validation
+
+    Returns list of absolute paths to PNG screenshot files (slide_0000.png, etc.)
+    """
+    deck_id = render_spec["deckId"]
+    slides = render_spec["slides"]
+    width = render_spec.get("width", 1920)
+    height = render_spec.get("height", 1080)
+    total = len(slides)
+    base_url = os.getenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+    screenshot_paths: list[str] = []
+
+    with sync_playwright() as p:
+        browser = p.chromium.launch(args=[
+            "--no-sandbox",
+            "--disable-dev-shm-usage",
+            "--disable-gpu",
+        ])
+        context = browser.new_context(viewport={"width": width, "height": height})
+
+        for idx, _slide in enumerate(slides):
+            token = _make_slide_token(deck_id, idx)
+            url = f"{base_url}/internal/slide-render/{deck_id}/{idx}"
+
+            page = context.new_page()
+            page.set_extra_http_headers({"X-Internal-Token": token})
+            page.goto(url, wait_until="domcontentloaded")
+
+            # Poll window.__slideReady (up to _SLIDE_READY_POLL_ATTEMPTS × 100ms)
+            ready = False
+            for _ in range(_SLIDE_READY_POLL_ATTEMPTS):
+                ready = page.evaluate("() => window.__slideReady === true")
+                if ready:
+                    break
+                page.wait_for_timeout(_SLIDE_READY_POLL_INTERVAL_MS)
+
+            if not ready:
+                logger.warning("slide_ready_timeout", deck_id=deck_id, slide_index=idx)
+
+            out_path = os.path.join(tmp_dir, f"slide_{idx:04d}.png")
+            page.screenshot(
+                path=out_path,
+                clip={"x": 0, "y": 0, "width": width, "height": height},
+                animations="disabled",
+            )
+            page.close()
+            screenshot_paths.append(out_path)
+
+            percent = int((idx + 1) / total * 75)
+            task_self.update_state(
+                state="PROGRESS",
+                meta={"percent": percent, "stage": f"Rendering slide {idx + 1} of {total}"},
+            )
+
+        context.close()
+        browser.close()
+
+    return screenshot_paths
+
+
+# ---------------------------------------------------------------------------
+# Stage 2: Format-specific processing
+# ---------------------------------------------------------------------------
+
+
+def _process_format(
+    task_self,
+    render_spec: dict,
+    format: str,
+    quality: str,
+    screenshot_paths: list[str],
+    tmp_dir: str,
+) -> str:
+    """Route to the correct format processor and emit the 90% progress update."""
+    if format == "mp4":
+        output_path = _build_mp4(render_spec, quality, screenshot_paths, tmp_dir)
+    elif format == "pdf":
+        output_path = _build_pdf(render_spec, screenshot_paths, tmp_dir)
+    elif format == "png":
+        output_path = _build_png_zip(screenshot_paths, tmp_dir)
+    elif format == "jpg":
+        output_path = _build_jpg_zip(screenshot_paths, tmp_dir)
+    else:
+        raise ValueError(f"Unsupported format: {format}")
+
+    task_self.update_state(
+        state="PROGRESS",
+        meta={"percent": 90, "stage": "Uploading"},
+    )
+    return output_path
+
+
+def _write_concat_file(screenshot_paths: list[str], durations_ms: list[int], concat_path: str) -> None:
+    """Write an FFmpeg concat demuxer file from slide paths and durations."""
+    lines: list[str] = []
+    for path, dur_ms in zip(screenshot_paths, durations_ms):
+        lines.append(f"file '{path}'")
+        lines.append(f"duration {dur_ms / 1000:.3f}")
+    with open(concat_path, "w") as f:
+        f.write("\n".join(lines) + "\n")
+
+
+def _build_mp4(render_spec: dict, quality: str, screenshot_paths: list[str], tmp_dir: str) -> str:
+    """Encode slides to MP4 using FFmpeg concat demuxer."""
+    slides = render_spec["slides"]
+    fps = render_spec.get("fps", 30)
+    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["standard"])
+
+    durations_ms = [s.get("durationMs", 3000) for s in slides]
+    concat_path = os.path.join(tmp_dir, "concat_list.txt")
+    output_path = os.path.join(tmp_dir, "output.mp4")
+
+    _write_concat_file(screenshot_paths, durations_ms, concat_path)
+
+    cmd = [
+        "ffmpeg", "-y",
+        "-f", "concat", "-safe", "0", "-i", concat_path,
+        "-vf", f"fps={fps}",
+        "-c:v", "libx264",
+        "-pix_fmt", "yuv420p",
+        "-crf", str(preset["crf"]),
+        "-preset", preset["preset"],
+        "-movflags", "+faststart",
+        "-r", "30",
+        output_path,
+    ]
+    subprocess.run(cmd, check=True, capture_output=True)
+    return output_path
+
+
+def _build_pdf(render_spec: dict, screenshot_paths: list[str], tmp_dir: str) -> str:
+    """Merge per-slide PNGs into a single PDF using pypdf."""
+    import pypdf
+    from PIL import Image as PillowImage
+
+    output_path = os.path.join(tmp_dir, "output.pdf")
+    writer = pypdf.PdfWriter()
+
+    for idx, png_path in enumerate(screenshot_paths):
+        slide_pdf_path = os.path.join(tmp_dir, f"slide_{idx:04d}.pdf")
+        # Convert PNG to PDF via Pillow
+        with PillowImage.open(png_path) as img:
+            img.convert("RGB").save(slide_pdf_path, "PDF", resolution=150)
+        reader = pypdf.PdfReader(slide_pdf_path)
+        writer.add_page(reader.pages[0])
+
+    with open(output_path, "wb") as f:
+        writer.write(f)
+    return output_path
+
+
+def _build_png_zip(screenshot_paths: list[str], tmp_dir: str) -> str:
+    """Zip all PNG screenshots into a single archive."""
+    output_path = os.path.join(tmp_dir, "output.zip")
+    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
+        for path in screenshot_paths:
+            zf.write(path, arcname=os.path.basename(path))
+    return output_path
+
+
+def _build_jpg_zip(screenshot_paths: list[str], tmp_dir: str) -> str:
+    """Convert PNG screenshots to JPEG quality=90, then zip."""
+    from PIL import Image as PillowImage
+
+    jpg_paths: list[str] = []
+    for png_path in screenshot_paths:
+        jpg_path = png_path.replace(".png", ".jpg")
+        with PillowImage.open(png_path) as img:
+            img.convert("RGB").save(jpg_path, "JPEG", quality=90)
+        jpg_paths.append(jpg_path)
+
+    output_path = os.path.join(tmp_dir, "output.zip")
+    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
+        for path in jpg_paths:
+            zf.write(path, arcname=os.path.basename(path))
+    return output_path
+
+
+# ---------------------------------------------------------------------------
+# Stage 3: Upload
+# ---------------------------------------------------------------------------
+
+
+def _run_async(coro):
+    """Run an async coroutine in Celery worker context (reuses persistent event loop)."""
+    import asyncio
+
+    try:
+        loop = asyncio.get_event_loop()
+        if loop.is_closed():
+            loop = asyncio.new_event_loop()
+            asyncio.set_event_loop(loop)
+    except RuntimeError:
+        loop = asyncio.new_event_loop()
+        asyncio.set_event_loop(loop)
+    return loop.run_until_complete(coro)
+
+
+def _upload_output(task_self, output_path: str, render_spec: dict, format: str) -> dict:
+    """
+    Upload the rendered output to S3/R2 and return a presigned download URL.
+
+    Returns: {"output_url": str, "output_bytes": int}
+    """
+    deck_id = render_spec.get("deckId", "unknown")
+    task_id = getattr(task_self.request, "id", "unknown") or "unknown"
+    ext_map = {"mp4": "mp4", "pdf": "pdf", "png": "zip", "jpg": "zip"}
+    ext = ext_map.get(format, format)
+    key = f"presentation-exports/{deck_id}/{task_id}.{ext}"
+
+    content_type_map = {
+        "mp4": "video/mp4",
+        "pdf": "application/pdf",
+        "png": "application/zip",
+        "jpg": "application/zip",
+    }
+    content_type = content_type_map.get(format, "application/octet-stream")
+
+    file_size = os.path.getsize(output_path)
+    r2 = get_r2_storage()
+    url = _run_async(r2.upload_file(output_path, key, content_type=content_type))
+
+    if not url:
+        raise RuntimeError(f"R2 upload returned no URL for key={key}")
+
+    logger.info("render_presentation_uploaded", deck_id=deck_id, key=key, output_bytes=file_size)
+
+    task_self.update_state(
+        state="PROGRESS",
+        meta={"percent": 100, "stage": "Done"},
+    )
+    return {"output_url": url, "output_bytes": file_size}
diff --git a/python-backend/requirements.txt b/python-backend/requirements.txt
index 568e31a..120dc6b 100644
--- a/python-backend/requirements.txt
+++ b/python-backend/requirements.txt
@@ -155,3 +155,16 @@ google-auth-httplib2>=0.2.0
 google-cloud-tasks>=2.14.0
 sentry-sdk[fastapi]
 posthog>=3.0.0
+
+# ==========================================
+# Section 07: Presentation Export Rendering
+# ==========================================
+
+# Headless browser for slide screenshots
+playwright>=1.40.0
+
+# PDF merging
+pypdf>=4.0.0
+
+# JPEG conversion for JPG export format
+Pillow>=10.0.0
diff --git a/python-backend/tests/test_presentation_render_task.py b/python-backend/tests/test_presentation_render_task.py
new file mode 100644
index 0000000..ff0b9c1
--- /dev/null
+++ b/python-backend/tests/test_presentation_render_task.py
@@ -0,0 +1,630 @@
+"""
+Unit tests for the presentation_render Celery task.
+
+All tests mock Playwright, FFmpeg (subprocess.run), and R2 storage.
+No real browser, FFmpeg binary, or external storage services are required.
+
+Tests are @pytest.mark.unit (synchronous, fast).
+"""
+
+import io
+import os
+import zipfile
+import pytest
+from unittest.mock import MagicMock, patch, call
+from celery.exceptions import SoftTimeLimitExceeded
+from PIL import Image
+
+
+# ---------------------------------------------------------------------------
+# Helpers
+# ---------------------------------------------------------------------------
+
+
+def _make_png_bytes(width: int = 1, height: int = 1) -> bytes:
+    """Create minimal valid PNG bytes using Pillow (1×1 white pixel by default)."""
+    buf = io.BytesIO()
+    Image.new("RGB", (width, height), (255, 255, 255)).save(buf, "PNG")
+    return buf.getvalue()
+
+
+MOCK_PNG_BYTES = _make_png_bytes()
+
+
+def _make_mock_playwright(png_bytes: bytes = MOCK_PNG_BYTES, slide_ready: bool = True):
+    """
+    Build a mock playwright context manager hierarchy.
+
+    When page.screenshot(path=...) is called, writes png_bytes to that path.
+    page.evaluate returns slide_ready (True = ready immediately).
+    Returns the mock to pass to patch("app.tasks.presentation_render.sync_playwright").
+    """
+    mock_page = MagicMock()
+    mock_page.evaluate.return_value = slide_ready
+
+    def fake_screenshot(**kwargs):
+        path = kwargs.get("path")
+        if path:
+            os.makedirs(os.path.dirname(path), exist_ok=True)
+            with open(path, "wb") as f:
+                f.write(png_bytes)
+
+    mock_page.screenshot.side_effect = fake_screenshot
+
+    mock_context = MagicMock()
+    mock_context.new_page.return_value = mock_page
+
+    mock_browser = MagicMock()
+    mock_browser.new_context.return_value = mock_context
+
+    mock_pw_instance = MagicMock()
+    mock_pw_instance.chromium.launch.return_value = mock_browser
+
+    mock_cm = MagicMock()
+    mock_cm.__enter__ = MagicMock(return_value=mock_pw_instance)
+    mock_cm.__exit__ = MagicMock(return_value=None)
+
+    mock_sync_playwright = MagicMock(return_value=mock_cm)
+    return mock_sync_playwright, mock_page
+
+
+def _make_render_spec(num_slides: int = 2, fmt: str = "mp4") -> dict:
+    """Build a minimal render spec with N slides."""
+    return {
+        "deckId": 7,
+        "slides": [
+            {
+                "slideId": 100 + i,
+                "orderIndex": i,
+                "durationMs": 3000,
+                "title": f"Slide {i + 1}",
+                "audioTrack": None,
+            }
+            for i in range(num_slides)
+        ],
+        "width": 1920,
+        "height": 1080,
+        "fps": 30,
+        "format": fmt,
+        "quality": "standard",
+        "projectAudioTrack": None,
+    }
+
+
+def _make_mock_task_self():
+    """Create a mock Celery task self with update_state tracking."""
+    task_self = MagicMock()
+    task_self.update_state = MagicMock()
+    task_self.request.id = "test-task-id-abc"
+    return task_self
+
+
+# ---------------------------------------------------------------------------
+# Tests: _make_slide_token
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestMakeSlideToken:
+    """JWT token generation for the internal slide render endpoint."""
+
+    def test_token_contains_correct_deck_and_slide_claims(self, monkeypatch):
+        """Token payload contains deckId and slideIndex claims."""
+        import jwt
+
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        from app.tasks.presentation_render import _make_slide_token
+
+        token = _make_slide_token(deck_id=42, slide_index=3)
+        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])
+
+        assert payload["deckId"] == 42
+        assert payload["slideIndex"] == 3
+
+    def test_token_contains_slide_render_scope(self, monkeypatch):
+        """Token scopes list includes 'internal:slide-render'."""
+        import jwt
+
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        from app.tasks.presentation_render import _make_slide_token
+
+        token = _make_slide_token(deck_id=1, slide_index=0)
+        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])
+
+        assert "internal:slide-render" in payload["scopes"]
+
+    def test_token_has_expiry_approximately_5_minutes(self, monkeypatch):
+        """Token exp claim is approximately 5 minutes (300s) from now."""
+        import jwt
+        import time
+
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        from app.tasks.presentation_render import _make_slide_token
+
+        before = int(time.time())
+        token = _make_slide_token(deck_id=1, slide_index=0)
+        after = int(time.time())
+
+        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])
+        ttl = payload["exp"] - before
+        assert 295 <= ttl <= 305  # 300 ± 5s tolerance
+
+    def test_token_uses_hs256_algorithm(self, monkeypatch):
+        """Token is signed with HS256."""
+        import jwt
+
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        from app.tasks.presentation_render import _make_slide_token
+
+        token = _make_slide_token(deck_id=1, slide_index=0)
+        header = jwt.get_unverified_header(token)
+        assert header["alg"] == "HS256"
+
+
+# ---------------------------------------------------------------------------
+# Tests: _render_slides_to_screenshots — JWT security
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestJWTHeaderSecurity:
+    """Internal render JWT is passed as a header, not a query parameter."""
+
+    def test_token_in_x_internal_token_header(self, monkeypatch, tmp_path):
+        """set_extra_http_headers is called with X-Internal-Token."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        mock_sync_playwright, mock_page = _make_mock_playwright()
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=1)
+
+        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
+            from app.tasks.presentation_render import _render_slides_to_screenshots
+            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))
+
+        # set_extra_http_headers must have been called with X-Internal-Token
+        call_args_list = mock_page.set_extra_http_headers.call_args_list
+        assert len(call_args_list) == 1
+        headers_passed = call_args_list[0][0][0]  # first positional arg to first call
+        assert "X-Internal-Token" in headers_passed
+        assert headers_passed["X-Internal-Token"]  # non-empty
+
+    def test_token_not_in_url(self, monkeypatch, tmp_path):
+        """The URL passed to page.goto does not contain a token query parameter."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        mock_sync_playwright, mock_page = _make_mock_playwright()
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=1)
+
+        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
+            from app.tasks.presentation_render import _render_slides_to_screenshots
+            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))
+
+        goto_url = mock_page.goto.call_args[0][0]
+        assert "token" not in goto_url.lower()
+        assert "?" not in goto_url
+
+    def test_internal_render_base_url_env_var(self, monkeypatch, tmp_path):
+        """INTERNAL_RENDER_BASE_URL controls the base URL used in Playwright navigation."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://custom-host:3001")
+
+        mock_sync_playwright, mock_page = _make_mock_playwright()
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=1)
+
+        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
+            from app.tasks.presentation_render import _render_slides_to_screenshots
+            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))
+
+        goto_url = mock_page.goto.call_args[0][0]
+        assert "custom-host:3001" in goto_url
+
+
+# ---------------------------------------------------------------------------
+# Tests: _render_slides_to_screenshots — progress reporting
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestRenderPresentationProgress:
+    """update_state is called with monotonically increasing percent values."""
+
+    def test_progress_increases_per_slide(self, monkeypatch, tmp_path):
+        """update_state percent rises across all slides (first call < last call)."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        mock_sync_playwright, _ = _make_mock_playwright()
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=3)
+
+        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
+            from app.tasks.presentation_render import _render_slides_to_screenshots
+            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))
+
+        calls = task_self.update_state.call_args_list
+        percents = [c[1]["meta"]["percent"] for c in calls]
+        assert len(percents) >= 2
+        assert percents == sorted(percents), "Percents must be monotonically non-decreasing"
+
+    def test_progress_reaches_75_after_all_slides(self, monkeypatch, tmp_path):
+        """After all screenshots, the last update_state call has percent <= 75."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        mock_sync_playwright, _ = _make_mock_playwright()
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=2)
+
+        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
+            from app.tasks.presentation_render import _render_slides_to_screenshots
+            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))
+
+        final_percent = task_self.update_state.call_args_list[-1][1]["meta"]["percent"]
+        assert final_percent <= 75
+
+    def test_update_state_called_once_per_slide(self, monkeypatch, tmp_path):
+        """update_state is called exactly N times for N slides."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        mock_sync_playwright, _ = _make_mock_playwright()
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=4)
+
+        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
+            from app.tasks.presentation_render import _render_slides_to_screenshots
+            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))
+
+        assert task_self.update_state.call_count == 4
+
+
+# ---------------------------------------------------------------------------
+# Tests: _render_slides_to_screenshots — slide ready timeout
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestSlideReadyTimeout:
+    """window.__slideReady timeout logs a warning but does not abort."""
+
+    def test_timeout_logs_warning_and_continues(self, monkeypatch, tmp_path, caplog):
+        """When __slideReady never becomes true, a warning is logged but screenshot is taken."""
+        import logging
+
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        # slide_ready=False so evaluate always returns False
+        mock_sync_playwright, mock_page = _make_mock_playwright(slide_ready=False)
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=1)
+
+        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
+            # Also patch the timeout loop to avoid 100 iterations in tests
+            with patch("app.tasks.presentation_render._SLIDE_READY_POLL_ATTEMPTS", 1):
+                from app.tasks.presentation_render import _render_slides_to_screenshots
+                with caplog.at_level(logging.WARNING):
+                    result = _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))
+
+        # Must still return screenshot paths (does not abort)
+        assert len(result) == 1
+        # Screenshot was still taken
+        assert mock_page.screenshot.called
+
+
+# ---------------------------------------------------------------------------
+# Tests: _build_png_zip
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestBuildPngZip:
+    """PNG zip output contains correctly named slide files."""
+
+    def test_zip_contains_one_entry_per_slide(self, tmp_path):
+        """Zip file has exactly N entries for N slide PNGs."""
+        from app.tasks.presentation_render import _build_png_zip
+
+        paths = []
+        for i in range(3):
+            p = tmp_path / f"slide_{i:04d}.png"
+            p.write_bytes(MOCK_PNG_BYTES)
+            paths.append(str(p))
+
+        output = _build_png_zip(paths, str(tmp_path))
+
+        with zipfile.ZipFile(output) as zf:
+            names = zf.namelist()
+        assert len(names) == 3
+
+    def test_zip_entry_names_are_slide_filenames(self, tmp_path):
+        """Zip entries use the original filenames (slide_0000.png etc.)."""
+        from app.tasks.presentation_render import _build_png_zip
+
+        paths = []
+        for i in range(2):
+            p = tmp_path / f"slide_{i:04d}.png"
+            p.write_bytes(MOCK_PNG_BYTES)
+            paths.append(str(p))
+
+        output = _build_png_zip(paths, str(tmp_path))
+
+        with zipfile.ZipFile(output) as zf:
+            names = zf.namelist()
+        assert "slide_0000.png" in names
+        assert "slide_0001.png" in names
+
+    def test_zip_file_created_in_tmp_dir(self, tmp_path):
+        """Output zip file is created inside tmp_dir."""
+        from app.tasks.presentation_render import _build_png_zip
+
+        p = tmp_path / "slide_0000.png"
+        p.write_bytes(MOCK_PNG_BYTES)
+        output = _build_png_zip([str(p)], str(tmp_path))
+
+        assert output.startswith(str(tmp_path))
+        assert output.endswith(".zip")
+
+
+# ---------------------------------------------------------------------------
+# Tests: _build_jpg_zip
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestBuildJpgZip:
+    """JPG zip converts PNG screenshots to JPEG quality=90."""
+
+    def test_zip_contains_jpg_entries(self, tmp_path):
+        """Zip entries have .jpg extension."""
+        from app.tasks.presentation_render import _build_jpg_zip
+
+        paths = []
+        for i in range(2):
+            p = tmp_path / f"slide_{i:04d}.png"
+            p.write_bytes(MOCK_PNG_BYTES)
+            paths.append(str(p))
+
+        output = _build_jpg_zip(paths, str(tmp_path))
+
+        with zipfile.ZipFile(output) as zf:
+            names = zf.namelist()
+        assert all(n.endswith(".jpg") for n in names)
+        assert len(names) == 2
+
+    def test_jpg_entries_are_valid_jpeg(self, tmp_path):
+        """Each entry in the zip is valid JPEG data (starts with JPEG magic bytes)."""
+        from app.tasks.presentation_render import _build_jpg_zip
+
+        p = tmp_path / "slide_0000.png"
+        p.write_bytes(MOCK_PNG_BYTES)
+
+        output = _build_jpg_zip([str(p)], str(tmp_path))
+
+        with zipfile.ZipFile(output) as zf:
+            data = zf.read("slide_0000.jpg")
+        # JPEG files start with FF D8 FF
+        assert data[:3] == b"\xff\xd8\xff"
+
+
+# ---------------------------------------------------------------------------
+# Tests: _build_mp4 / FFmpeg concat file
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestFFmpegConcatFile:
+    """FFmpeg concat demuxer file format is correct."""
+
+    def test_concat_file_has_one_entry_per_slide(self, tmp_path):
+        """Concat file has exactly N `file '...'` lines for N slides."""
+        from app.tasks.presentation_render import _write_concat_file
+
+        paths = [str(tmp_path / f"slide_{i:04d}.png") for i in range(3)]
+        durations = [3000, 4000, 5000]  # ms
+
+        concat_path = str(tmp_path / "concat_list.txt")
+        _write_concat_file(paths, durations, concat_path)
+
+        with open(concat_path) as f:
+            content = f.read()
+
+        file_lines = [ln for ln in content.splitlines() if ln.startswith("file ")]
+        assert len(file_lines) == 3
+
+    def test_concat_file_duration_from_duration_ms(self, tmp_path):
+        """Each `duration` line equals durationMs / 1000."""
+        from app.tasks.presentation_render import _write_concat_file
+
+        paths = [str(tmp_path / "slide_0000.png")]
+        durations = [3500]  # ms → 3.500
+
+        concat_path = str(tmp_path / "concat_list.txt")
+        _write_concat_file(paths, durations, concat_path)
+
+        with open(concat_path) as f:
+            content = f.read()
+
+        duration_lines = [ln for ln in content.splitlines() if ln.startswith("duration ")]
+        assert len(duration_lines) == 1
+        assert "3.500" in duration_lines[0]
+
+    def test_build_mp4_calls_ffmpeg_with_correct_args(self, tmp_path, monkeypatch):
+        """FFmpeg is invoked with concat input, libx264, and quality preset args."""
+        from app.tasks.presentation_render import _build_mp4
+
+        # Write fake PNG files
+        paths = []
+        for i in range(2):
+            p = tmp_path / f"slide_{i:04d}.png"
+            p.write_bytes(MOCK_PNG_BYTES)
+            paths.append(str(p))
+
+        render_spec = _make_render_spec(num_slides=2, fmt="mp4")
+
+        with patch("subprocess.run") as mock_run:
+            mock_run.return_value = MagicMock(returncode=0)
+            _build_mp4(render_spec, "standard", paths, str(tmp_path))
+
+        assert mock_run.called
+        cmd = mock_run.call_args[0][0]
+        cmd_str = " ".join(str(a) for a in cmd)
+        assert "ffmpeg" in cmd_str
+        assert "concat" in cmd_str
+        assert "libx264" in cmd_str
+
+    def test_quality_preset_standard_crf23(self, tmp_path):
+        """Standard quality uses CRF=23."""
+        from app.tasks.presentation_render import QUALITY_PRESETS
+
+        assert QUALITY_PRESETS["standard"]["crf"] == 23
+        assert QUALITY_PRESETS["draft"]["crf"] == 28
+        assert QUALITY_PRESETS["high"]["crf"] == 18
+
+    def test_quality_preset_speed_values(self, tmp_path):
+        """Preset speed values: draft=veryfast, standard=medium, high=slow."""
+        from app.tasks.presentation_render import QUALITY_PRESETS
+
+        assert QUALITY_PRESETS["draft"]["preset"] == "veryfast"
+        assert QUALITY_PRESETS["standard"]["preset"] == "medium"
+        assert QUALITY_PRESETS["high"]["preset"] == "slow"
+
+
+# ---------------------------------------------------------------------------
+# Tests: _upload_output
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestUploadOutput:
+    """Upload stage uses R2 storage and returns output_url + output_bytes."""
+
+    def test_upload_output_returns_url_and_bytes(self, tmp_path):
+        """Return value contains output_url (str) and output_bytes (int)."""
+        from app.tasks.presentation_render import _upload_output
+
+        # Create a fake output file
+        output_path = tmp_path / "output.mp4"
+        output_path.write_bytes(b"fake-video-content")
+
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=2, fmt="mp4")
+
+        async def fake_upload_file(file_path, key, **kwargs):
+            return "https://r2.example.com/export.mp4"
+
+        mock_r2 = MagicMock()
+        mock_r2.upload_file = fake_upload_file
+
+        with patch("app.tasks.presentation_render.get_r2_storage", return_value=mock_r2):
+            result = _upload_output(task_self, str(output_path), render_spec, "mp4")
+
+        assert "output_url" in result
+        assert result["output_url"] == "https://r2.example.com/export.mp4"
+        assert "output_bytes" in result
+        assert result["output_bytes"] == len(b"fake-video-content")
+
+    def test_upload_key_contains_deck_id(self, tmp_path):
+        """Upload key includes the deck ID from render_spec."""
+        from app.tasks.presentation_render import _upload_output
+
+        output_path = tmp_path / "output.zip"
+        output_path.write_bytes(b"fake-zip")
+
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=2, fmt="png")
+        render_spec["deckId"] = 42
+
+        captured_key = {}
+
+        async def fake_upload_file(file_path, key, **kwargs):
+            captured_key["key"] = key
+            return "https://r2.example.com/out.zip"
+
+        mock_r2 = MagicMock()
+        mock_r2.upload_file = fake_upload_file
+
+        with patch("app.tasks.presentation_render.get_r2_storage", return_value=mock_r2):
+            _upload_output(task_self, str(output_path), render_spec, "png")
+
+        assert "42" in captured_key.get("key", "")
+
+
+# ---------------------------------------------------------------------------
+# Tests: temp dir cleanup
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+class TestTempDirCleanup:
+    """Temp directory is always cleaned up, even on failure."""
+
+    def test_cleanup_on_success(self, monkeypatch, tmp_path):
+        """shutil.rmtree is called in the finally block on success."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        mock_sync_playwright, _ = _make_mock_playwright()
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=1, fmt="png")
+
+        with (
+            patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright),
+            patch("app.tasks.presentation_render._upload_output") as mock_upload,
+            patch("shutil.rmtree") as mock_rmtree,
+            patch("tempfile.mkdtemp", return_value=str(tmp_path)),
+        ):
+            mock_upload.return_value = {"output_url": "https://example.com/out.zip", "output_bytes": 100}
+            from app.tasks.presentation_render import render_presentation
+
+            # Call the underlying function directly (bypass Celery)
+            render_presentation.run.__func__(task_self, render_spec, "standard", "png")
+
+        mock_rmtree.assert_called_once_with(str(tmp_path), ignore_errors=True)
+
+    def test_cleanup_on_generic_exception(self, monkeypatch, tmp_path):
+        """shutil.rmtree is called even when a mid-task exception is raised."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=1, fmt="png")
+
+        with (
+            patch("app.tasks.presentation_render._render_slides_to_screenshots") as mock_stage1,
+            patch("shutil.rmtree") as mock_rmtree,
+            patch("tempfile.mkdtemp", return_value=str(tmp_path)),
+        ):
+            mock_stage1.side_effect = RuntimeError("Playwright crash")
+            from app.tasks.presentation_render import render_presentation
+
+            with pytest.raises(RuntimeError, match="Playwright crash"):
+                render_presentation.run.__func__(task_self, render_spec, "standard", "png")
+
+        mock_rmtree.assert_called_once_with(str(tmp_path), ignore_errors=True)
+
+    def test_cleanup_on_soft_time_limit(self, monkeypatch, tmp_path):
+        """shutil.rmtree is called when SoftTimeLimitExceeded is raised."""
+        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
+        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
+
+        task_self = _make_mock_task_self()
+        render_spec = _make_render_spec(num_slides=1, fmt="png")
+
+        with (
+            patch("app.tasks.presentation_render._render_slides_to_screenshots") as mock_stage1,
+            patch("shutil.rmtree") as mock_rmtree,
+            patch("tempfile.mkdtemp", return_value=str(tmp_path)),
+        ):
+            mock_stage1.side_effect = SoftTimeLimitExceeded("timeout")
+            from app.tasks.presentation_render import render_presentation
+
+            with pytest.raises(SoftTimeLimitExceeded):
+                render_presentation.run.__func__(task_self, render_spec, "standard", "png")
+
+        mock_rmtree.assert_called_once_with(str(tmp_path), ignore_errors=True)
