"""
Celery task for rendering presentation decks to video, PDF, or image archives.

Stages:
  1. Playwright screenshots of each slide              (0–75%)
  2. Format-specific post-processing (MP4/PDF/PNG/JPG) (75–90%)
  3. S3/R2 upload + presigned URL                     (90–100%)

Worker startup (limited concurrency to prevent OOM from Playwright):
  celery -A app.core.celery_app worker -Q presentation_export -c 2 --hostname=presentation@%h

Environment variables required on the worker:
  JWT_SECRET              — must match apps/web JWT_SECRET
  INTERNAL_RENDER_BASE_URL — http://localhost:3000 or http://host.docker.internal:3000
"""

import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from typing import Any

import jwt
import pypdf
import structlog
from celery.exceptions import SoftTimeLimitExceeded
from PIL import Image as PillowImage
from playwright.sync_api import sync_playwright

from app.core.celery_app import celery_app
from app.services.generation.r2_storage import get_r2_storage
from app.tasks.media_tasks import _run_async  # H-3: import canonical implementation

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

QUALITY_PRESETS: dict[str, dict[str, Any]] = {
    "draft":    {"crf": 28, "preset": "veryfast"},
    "standard": {"crf": 23, "preset": "medium"},
    "high":     {"crf": 18, "preset": "slow"},
}

# Polling config for window.__slideReady
_SLIDE_READY_POLL_ATTEMPTS = 100   # 100 × 100ms = 10s maximum wait
_SLIDE_READY_POLL_INTERVAL_MS = 100


# ---------------------------------------------------------------------------
# Task definition
# ---------------------------------------------------------------------------


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

    Args:
        render_spec: Full PresentationRenderSpec dict from Node.js.
        quality: "draft" | "standard" | "high"
        format: "mp4" | "pdf" | "png" | "jpg"

    Returns:
        {"output_url": str, "output_bytes": int}
    """
    # M-6: Validate required fields at entry point with descriptive errors
    if "deckId" not in render_spec:
        raise ValueError("render_spec missing required field: deckId")
    if "slides" not in render_spec:
        raise ValueError("render_spec missing required field: slides")

    deck_id = render_spec.get("deckId")
    tmp_dir = tempfile.mkdtemp(prefix="pres_render_")
    try:
        # Stage 1: Screenshots (0–75%)
        screenshot_paths = _render_slides_to_screenshots(self, render_spec, tmp_dir)

        # Stage 2: Format processing (75–90%)
        output_path = _process_format(self, render_spec, format, quality, screenshot_paths, tmp_dir)

        # Stage 3: Upload (90–100%)
        result = _upload_output(self, output_path, render_spec, format)

        logger.info(
            "render_presentation_complete",
            deck_id=deck_id,
            format=format,
            quality=quality,
            output_url=result.get("output_url"),
            output_bytes=result.get("output_bytes"),
        )
        return result

    except SoftTimeLimitExceeded:
        logger.warning("render_presentation_soft_time_limit_exceeded", deck_id=deck_id)
        raise
    except Exception as exc:
        logger.error("render_presentation_failed", deck_id=deck_id, error=str(exc))
        raise
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        logger.info("render_presentation_tmp_cleaned", tmp_dir=tmp_dir)


# ---------------------------------------------------------------------------
# Stage 1: Playwright screenshot rendering
# ---------------------------------------------------------------------------


def _make_slide_token(deck_id: int, slide_index: int) -> str:
    """Generate a short-lived JWT for a single slide render request (5-minute TTL)."""
    secret = os.environ["JWT_SECRET"]
    return jwt.encode(
        {
            "sub": "internal-render",
            "scopes": ["internal:slide-render"],
            "deckId": deck_id,
            "slideIndex": slide_index,
            "exp": int(time.time()) + 300,
        },
        secret,
        algorithm="HS256",
    )


def _render_slides_to_screenshots(task_self, render_spec: dict, tmp_dir: str) -> list[str]:
    """
    Navigate Playwright to each slide's internal render URL and capture screenshots.

    Security:
    - JWT token passed via X-Internal-Token header ONLY (never in URL query string)
    - 5-minute token TTL (sufficient for one screenshot call)
    - Per-slide token includes deckId + slideIndex claims for server-side validation

    Returns list of absolute paths to PNG screenshot files (slide_0000.png, etc.)
    """
    deck_id = render_spec["deckId"]
    slides = render_spec["slides"]
    width = render_spec.get("width", 1920)
    height = render_spec.get("height", 1080)
    total = len(slides)
    base_url = os.getenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
    screenshot_paths: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ])
        # M-1: try/finally guarantees browser and context are closed even on exception
        try:
            context = browser.new_context(viewport={"width": width, "height": height})
            try:
                for idx, _slide in enumerate(slides):
                    token = _make_slide_token(deck_id, idx)
                    url = f"{base_url}/internal/slide-render/{deck_id}/{idx}"

                    page = context.new_page()
                    page.set_extra_http_headers({"X-Internal-Token": token})
                    page.goto(url, wait_until="domcontentloaded")

                    # Poll window.__slideReady (up to _SLIDE_READY_POLL_ATTEMPTS × 100ms)
                    ready = False
                    for _ in range(_SLIDE_READY_POLL_ATTEMPTS):
                        ready = page.evaluate("() => window.__slideReady === true")
                        if ready:
                            break
                        page.wait_for_timeout(_SLIDE_READY_POLL_INTERVAL_MS)

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
            finally:
                context.close()
        finally:
            browser.close()

    return screenshot_paths


# ---------------------------------------------------------------------------
# Stage 2: Format-specific processing
# ---------------------------------------------------------------------------


def _process_format(
    task_self,
    render_spec: dict,
    format: str,
    quality: str,
    screenshot_paths: list[str],
    tmp_dir: str,
) -> str:
    """Route to the correct format processor and emit the 90% progress update."""
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


def _write_concat_file(screenshot_paths: list[str], durations_ms: list[int], concat_path: str) -> None:
    """Write an FFmpeg concat demuxer file from slide paths and durations."""
    lines: list[str] = []
    for path, dur_ms in zip(screenshot_paths, durations_ms):
        lines.append(f"file '{path}'")
        lines.append(f"duration {dur_ms / 1000:.3f}")
    with open(concat_path, "w") as f:
        f.write("\n".join(lines) + "\n")


def _build_mp4(render_spec: dict, quality: str, screenshot_paths: list[str], tmp_dir: str) -> str:
    """Encode slides to MP4 using FFmpeg concat demuxer."""
    slides = render_spec["slides"]
    fps = render_spec.get("fps", 30)
    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["standard"])

    durations_ms = [s.get("durationMs", 3000) for s in slides]
    concat_path = os.path.join(tmp_dir, "concat_list.txt")
    output_path = os.path.join(tmp_dir, "output.mp4")

    _write_concat_file(screenshot_paths, durations_ms, concat_path)

    # M-4: fps controlled by -vf filter only; removed duplicate hardcoded -r 30
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", concat_path,
        "-vf", f"fps={fps}",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", str(preset["crf"]),
        "-preset", preset["preset"],
        "-movflags", "+faststart",
        output_path,
    ]
    # M-2: timeout prevents subprocess blocking past Celery SoftTimeLimitExceeded
    subprocess.run(cmd, check=True, capture_output=True, timeout=540)
    return output_path


def _build_pdf(render_spec: dict, screenshot_paths: list[str], tmp_dir: str) -> str:
    """
    Merge per-slide PNGs into a single PDF via Playwright page.pdf() + pypdf.

    H-1: Uses Playwright page.pdf() per spec (instead of Pillow rasterization) so that
    each slide PDF is produced by a proper PDF engine.
    """
    output_path = os.path.join(tmp_dir, "output.pdf")
    writer = pypdf.PdfWriter()

    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ])
        try:
            context = browser.new_context()
            try:
                for idx, png_path in enumerate(screenshot_paths):
                    slide_pdf_path = os.path.join(tmp_dir, f"slide_{idx:04d}.pdf")
                    page = context.new_page()
                    try:
                        # Open screenshot PNG in Playwright and export as PDF
                        page.goto(f"file://{png_path}", wait_until="load")
                        page.pdf(path=slide_pdf_path)
                        reader = pypdf.PdfReader(slide_pdf_path)
                        writer.add_page(reader.pages[0])
                    finally:
                        page.close()
            finally:
                context.close()
        finally:
            browser.close()

    with open(output_path, "wb") as f:
        writer.write(f)
    return output_path


def _build_png_zip(screenshot_paths: list[str], tmp_dir: str) -> str:
    """Zip all PNG screenshots into a single archive."""
    output_path = os.path.join(tmp_dir, "output.zip")
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in screenshot_paths:
            zf.write(path, arcname=os.path.basename(path))
    return output_path


def _build_jpg_zip(screenshot_paths: list[str], tmp_dir: str) -> str:
    """Convert PNG screenshots to JPEG quality=90, then zip."""
    jpg_paths: list[str] = []
    for png_path in screenshot_paths:
        jpg_path = png_path.replace(".png", ".jpg")
        with PillowImage.open(png_path) as img:
            img.convert("RGB").save(jpg_path, "JPEG", quality=90)
        jpg_paths.append(jpg_path)

    output_path = os.path.join(tmp_dir, "output.zip")
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in jpg_paths:
            zf.write(path, arcname=os.path.basename(path))
    return output_path


# ---------------------------------------------------------------------------
# Stage 3: Upload
# ---------------------------------------------------------------------------


def _upload_output(task_self, output_path: str, render_spec: dict, format: str) -> dict:
    """
    Upload the rendered output to S3/R2 and return a 48-hour presigned download URL.

    H-2: Returns a time-limited presigned URL (not a permanent public URL).
    H-4: deck_id is sanitized to prevent path traversal in the R2 key namespace.

    Returns: {"output_url": str, "output_bytes": int}
    """
    deck_id = render_spec.get("deckId", "unknown")
    # H-4: Sanitize deck_id — coerce to integer string to prevent path traversal
    try:
        deck_id_safe = str(int(deck_id))
    except (ValueError, TypeError):
        deck_id_safe = "0"

    task_id = getattr(task_self.request, "id", "unknown") or "unknown"
    ext_map = {"mp4": "mp4", "pdf": "pdf", "png": "zip", "jpg": "zip"}
    ext = ext_map.get(format, format)
    key = f"presentation-exports/{deck_id_safe}/{task_id}.{ext}"

    content_type_map = {
        "mp4": "video/mp4",
        "pdf": "application/pdf",
        "png": "application/zip",
        "jpg": "application/zip",
    }
    content_type = content_type_map.get(format, "application/octet-stream")

    file_size = os.path.getsize(output_path)
    r2 = get_r2_storage()
    _run_async(r2.upload_file(output_path, key, content_type=content_type))

    # H-2: Generate 48-hour presigned URL (172800 seconds) — not permanent public URL
    presigned_url = _run_async(r2.generate_presigned_url(key, expires_in=172800))

    if not presigned_url:
        raise RuntimeError(f"R2 presigned URL generation returned no URL for key={key}")

    logger.info("render_presentation_uploaded", deck_id=deck_id_safe, key=key, output_bytes=file_size)

    task_self.update_state(
        state="PROGRESS",
        meta={"percent": 100, "stage": "Done"},
    )
    return {"output_url": presigned_url, "output_bytes": file_size}
