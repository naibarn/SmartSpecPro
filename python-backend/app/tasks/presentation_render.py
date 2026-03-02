"""
Celery task for rendering presentation decks to video, PDF, or image archives.

Stages:
  1. Playwright screenshots of each slide              (0–75%)
  2. Format-specific post-processing (MP4/PDF/PNG/JPG) (75–90%)
  3. S3/R2 upload + presigned URL                     (90–100%)

Worker startup (limited concurrency to prevent OOM from Playwright):
  celery -A app.core.celery_app worker -Q presentation_export -c 2 --hostname=presentation@%h

Worker configuration:
  JWT secret is resolved from `JWT_SECRET` env var, then `settings.JWT_SECRET`.
  INTERNAL_RENDER_BASE_URL should point to the web renderer
  (http://localhost:3000 or http://host.docker.internal:3000).
"""

import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
import pypdf
import structlog
from celery.exceptions import SoftTimeLimitExceeded
from PIL import Image as PillowImage
from playwright.sync_api import sync_playwright

from app.core.celery_app import celery_app
from app.core.config import settings
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
# Filter-value sanitisers — prevent FFmpeg filter_complex injection
# ---------------------------------------------------------------------------


def _safe_volume(v: object, default: float = 1.0) -> float:
    """Clamp volume to valid FFmpeg range [0.0, 2.0]."""
    try:
        return max(0.0, min(2.0, float(v)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _safe_fps(v: object, default: int = 30) -> int:
    """Clamp fps to valid range [1, 120]."""
    try:
        return max(1, min(120, int(v)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _safe_delay_ms(v: object, default: int = 0) -> int:
    """Clamp delay to non-negative integer milliseconds."""
    try:
        return max(0, int(v))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


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
    secret = os.getenv("JWT_SECRET") or settings.JWT_SECRET
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured for presentation export worker")
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


def _make_export_download_token(deck_id: str, filename: str) -> str:
    """Generate short-lived JWT for fallback local export download."""
    secret = os.getenv("JWT_SECRET") or settings.JWT_SECRET
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured for presentation export worker")
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": "presentation-export-download",
            "deck_id": deck_id,
            "filename": filename,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=48)).timestamp()),
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


def _download_audio(url: str, dest_dir: str, idx: int) -> str:
    """
    Download an audio file from a presigned URL to dest_dir/audio_{idx}.<ext>.

    The file extension is inferred from the URL path (defaulting to .mp3).
    Raises urllib.error.HTTPError on HTTP errors.

    Returns the absolute path to the downloaded file.
    """
    # Infer extension from URL path component (strip query string first)
    url_path = url.split("?")[0]
    ext = os.path.splitext(url_path)[1]
    if not ext:
        ext = ".mp3"
    dest_path = os.path.join(dest_dir, f"audio_{idx}{ext}")
    urllib.request.urlretrieve(url, dest_path)
    return dest_path


def _build_mp4(render_spec: dict, quality: str, screenshot_paths: list[str], tmp_dir: str, runner=None) -> str:
    """
    Encode slides to MP4 using FFmpeg concat demuxer.

    Audio mixing strategy:
    - Case A: No audio at all — video-only output (original behaviour).
    - Case B: Project background audio only — mix via volume+apad filters.
    - Case C: Per-slide audio tracks only — position each track with adelay/atrim, mix with amix.
    - Case D: Both project audio + per-slide audio — mix all tracks with amix.

    Audio download failures are treated as non-fatal: a warning is logged and the export
    continues without that track.
    """
    slides = render_spec["slides"]
    fps = _safe_fps(render_spec.get("fps", 30))
    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["standard"])
    crf = preset["crf"]
    preset_name = preset["preset"]

    durations_ms = [s.get("durationMs", 3000) for s in slides]
    concat_path = os.path.join(tmp_dir, "concat_list.txt")
    output_path = os.path.join(tmp_dir, "output.mp4")

    _write_concat_file(screenshot_paths, durations_ms, concat_path)

    # ------------------------------------------------------------------
    # Download project audio (background track)
    # ------------------------------------------------------------------
    project_audio_spec = render_spec.get("projectAudioTrack")
    project_audio_path: str | None = None
    project_volume: float = 1.0

    if project_audio_spec and project_audio_spec.get("url"):
        try:
            project_audio_path = _download_audio(project_audio_spec["url"], tmp_dir, 0)
            project_volume = _safe_volume(project_audio_spec.get("volume", 1.0))
        except Exception as exc:
            logger.warning(
                "audio_download_failed_project_track",
                error=str(exc),
            )
            project_audio_path = None

    # ------------------------------------------------------------------
    # Download per-slide audio tracks
    # ------------------------------------------------------------------
    # slide_audio_tracks: list of {path, start_ms, end_ms|None, volume}
    slide_audio_tracks: list[dict] = []
    cumulative_ms = 0

    for i, slide in enumerate(slides):
        duration_ms = slide.get("durationMs", 3000)
        if i < len(screenshot_paths):
            audio_spec = slide.get("audioTrack")
            if audio_spec and audio_spec.get("url"):
                start_ms = cumulative_ms + audio_spec.get("startAtMs", 0)
                end_ms_in_slide = audio_spec.get("endAtMs")
                abs_end_ms = (cumulative_ms + end_ms_in_slide) if end_ms_in_slide is not None else None
                try:
                    # Use index i+1 so it never collides with the project audio (index 0)
                    dl_path = _download_audio(audio_spec["url"], tmp_dir, i + 1)
                    slide_audio_tracks.append(
                        {
                            "path": dl_path,
                            "start_ms": start_ms,
                            "end_ms": abs_end_ms,
                            "volume": _safe_volume(audio_spec.get("volume", 1.0)),
                        }
                    )
                except Exception as exc:
                    logger.warning(
                        "audio_download_failed_slide_track",
                        slide_index=i,
                        error=str(exc),
                    )
        cumulative_ms += duration_ms

    has_project = project_audio_path is not None
    has_slide_audio = len(slide_audio_tracks) > 0

    # ------------------------------------------------------------------
    # Case A: No audio — video only
    # ------------------------------------------------------------------
    if not has_project and not has_slide_audio:
        # M-4: fps controlled by -vf filter only; removed duplicate hardcoded -r 30
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", concat_path,
            "-vf", f"fps={fps}",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", str(crf),
            "-preset", preset_name,
            "-movflags", "+faststart",
            output_path,
        ]
        # M-2: timeout prevents subprocess blocking past Celery SoftTimeLimitExceeded
        if runner:
            runner.run_command_sync(cmd, check=True, timeout=540)
        else:
            subprocess.run(cmd, check=True, capture_output=True, timeout=540)
        return output_path

    # ------------------------------------------------------------------
    # Build FFmpeg inputs and filter_complex for audio cases B / C / D
    # ------------------------------------------------------------------
    # Input 0 is always the video concat.
    # Inputs 1..N are audio files in the order: [project_audio?, *slide_audios]
    ffmpeg_inputs: list[str] = []
    if has_project:
        ffmpeg_inputs.append(project_audio_path)  # type: ignore[arg-type]
    for track in slide_audio_tracks:
        ffmpeg_inputs.append(track["path"])

    # Build filter_complex parts
    filter_parts: list[str] = []
    mix_labels: list[str] = []

    audio_input_idx = 1  # 0 is the video concat

    if has_project:
        pa_label = "[pa]"
        filter_parts.append(f"[{audio_input_idx}:a]volume={project_volume}[pa]")
        mix_labels.append(pa_label)
        audio_input_idx += 1

    for si, track in enumerate(slide_audio_tracks):
        label = f"[s{si}]"
        delay_ms = int(track["start_ms"])
        vol = _safe_volume(track["volume"])
        filter_chain = f"[{audio_input_idx}:a]adelay={delay_ms}|{delay_ms},volume={vol}"
        if track["end_ms"] is not None:
            # atrim start/end are relative to the input stream (before adelay),
            # so trim first then delay — reorder: trim → volume → delay
            filter_chain = (
                f"[{audio_input_idx}:a]"
                f"atrim=start=0:end={(track['end_ms'] - track['start_ms'] + delay_ms) / 1000.0:.3f},"
                f"adelay={delay_ms}|{delay_ms},"
                f"volume={vol}"
            )
        filter_chain += label
        filter_parts.append(filter_chain)
        mix_labels.append(label)
        audio_input_idx += 1

    total_mix_inputs = len(mix_labels)
    if total_mix_inputs == 1:
        # Single audio source — no amix needed, just use apad to extend to video length
        solo_label = mix_labels[0]
        filter_parts.append(f"{solo_label}apad[aout]")
    else:
        inputs_concat = "".join(mix_labels)
        filter_parts.append(f"{inputs_concat}amix=inputs={total_mix_inputs}:duration=longest[aout]")

    filter_complex = ";".join(filter_parts)

    # Assemble inputs section: concat video + all audio files
    input_args: list[str] = ["-f", "concat", "-safe", "0", "-i", concat_path]
    for audio_path in ffmpeg_inputs:
        input_args += ["-i", audio_path]

    cmd = [
        "ffmpeg", "-y",
        *input_args,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-vf", f"fps={fps}",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-crf", str(crf),
        "-preset", preset_name,
        "-movflags", "+faststart",
        "-shortest",
        output_path,
    ]
    # M-2: timeout prevents subprocess blocking past Celery SoftTimeLimitExceeded
    if runner:
        runner.run_command_sync(cmd, check=True, timeout=540)
    else:
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
    output_url: str | None = None
    try:
        r2 = get_r2_storage()
        _run_async(r2.upload_file(output_path, key, content_type=content_type))
        # H-2: Generate 48-hour presigned URL (172800 seconds) — not permanent public URL
        output_url = _run_async(r2.generate_presigned_url(key, expires_in=172800))
        if not output_url:
            raise RuntimeError(f"R2 presigned URL generation returned no URL for key={key}")
        logger.info(
            "render_presentation_uploaded_r2",
            deck_id=deck_id_safe,
            key=key,
            output_bytes=file_size,
        )
    except Exception as exc:
        # Dev-safe fallback: keep export usable even when R2 is misconfigured.
        media_storage_path = os.getenv("MEDIA_STORAGE_PATH", "./media_storage")
        export_dir = os.path.join(media_storage_path, "presentation_exports", deck_id_safe)
        os.makedirs(export_dir, exist_ok=True)
        fallback_name = f"{task_id}.{ext}"
        fallback_path = os.path.join(export_dir, fallback_name)
        shutil.copy2(output_path, fallback_path)
        token = _make_export_download_token(deck_id_safe, fallback_name)
        output_url = f"/api/v1/presentations/export/files/{deck_id_safe}/{fallback_name}?token={token}"
        logger.warning(
            "render_presentation_upload_fallback_local",
            deck_id=deck_id_safe,
            key=key,
            local_path=fallback_path,
            error=str(exc),
        )

    task_self.update_state(
        state="PROGRESS",
        meta={"percent": 100, "stage": "Done"},
    )
    return {"output_url": output_url, "output_bytes": file_size}
