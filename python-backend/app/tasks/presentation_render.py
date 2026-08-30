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

# Polling config for window.__slideReady / window.__slideReadyState
_SLIDE_READY_POLL_INTERVAL_MS = 200
_SLIDE_READY_POLL_ATTEMPTS = 40  # 40 × 200ms = 8000ms hard timeout budget
_SLIDE_READY_SOFT_WAIT_MS = 5000
_SLIDE_READY_RETRY_DELAYS_MS = (750, 750)
_SLIDE_READY_HARD_TIMEOUT_MS = 8000
_SLIDE_READY_FAIL_CODE = "E_SLIDE_READY_TIMEOUT"


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
    max_retries=2,               # Retry up to 2× for transient Playwright/FFmpeg failures
    autoretry_for=(OSError, TimeoutError, subprocess.SubprocessError),
    retry_backoff=30,            # 30s, 60s exponential backoff
    retry_backoff_max=120,
    retry_jitter=True,
    queue="presentation_export",
)
def render_presentation(
    self,
    render_spec: dict,
    quality: str,
    format: str,
    render_auth: dict[str, Any] | None = None,
) -> dict:
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
    if render_auth is None:
        embedded_render_auth = render_spec.pop("__presentation_render_auth", None)
        if isinstance(embedded_render_auth, dict):
            render_auth = embedded_render_auth

    if "deckId" not in render_spec:
        raise ValueError("render_spec missing required field: deckId")
    if "slides" not in render_spec:
        raise ValueError("render_spec missing required field: slides")

    deck_id = render_spec.get("deckId")
    tmp_dir = tempfile.mkdtemp(prefix="pres_render_")
    try:
        dynamic_video_mode = format == "mp4" and bool(render_spec.get("hasDynamicVideo"))
        if dynamic_video_mode:
            # Stage 1: Record each slide as a clip when the deck contains video elements.
            video_clip_segments = _render_slides_to_video_clips(
                self, render_spec, tmp_dir, render_auth
            )
            # Stage 2: MP4 encode from dynamic clips (75–90%)
            output_path = _build_mp4_from_clips(render_spec, quality, video_clip_segments, tmp_dir)
            self.update_state(
                state="PROGRESS",
                meta={"percent": 90, "stage": "Uploading"},
            )
        else:
            # Stage 1: Screenshots (0–75%)
            screenshot_paths = _render_slides_to_screenshots(
                self, render_spec, tmp_dir, render_auth
            )
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


def _make_slide_token(
    deck_id: int,
    slide_index: int,
    render_auth: dict[str, Any] | None = None,
) -> str:
    """Generate a short-lived JWT for a single slide render request (5-minute TTL)."""
    secret = os.getenv("JWT_SECRET") or settings.JWT_SECRET
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured for presentation export worker")
    claims: dict[str, Any] = {
        "sub": "internal-render",
        "scopes": ["internal:slide-render"],
        "deckId": deck_id,
        "slideIndex": slide_index,
        "exp": int(time.time()) + 300,
    }
    if render_auth:
        claims.update({
            "userId": int(render_auth["user_id"]),
            "tenantId": str(render_auth["tenant_id"]),
        })
    return jwt.encode(
        claims,
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


def _read_slide_ready_state(page) -> dict[str, Any] | None:
    """Read optional readiness metadata emitted by the slide-render route."""
    try:
        raw_state = page.evaluate("() => window.__slideReadyState || null")
    except Exception:
        return None
    if isinstance(raw_state, dict):
        return raw_state
    return None


def _poll_slide_ready(page, deck_id: int, slide_index: int, mode: str) -> dict[str, Any]:
    """
    Poll `window.__slideReady` and consume route-side readiness metadata.

    Returns:
      {
        "ready": bool,
        "elapsed_ms": int,
        "state": dict | None,
      }

    Raises:
      RuntimeError when route reports structural timeout failure (`E_SLIDE_READY_TIMEOUT`).
    """
    started_at = time.monotonic()
    ready = False
    retry_attempt = 0
    next_retry_at_ms = _SLIDE_READY_SOFT_WAIT_MS
    state: dict[str, Any] | None = None

    for attempt in range(_SLIDE_READY_POLL_ATTEMPTS):
        ready = bool(page.evaluate("() => window.__slideReady === true"))
        if ready:
            state = _read_slide_ready_state(page)
            break

        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        if (
            retry_attempt < len(_SLIDE_READY_RETRY_DELAYS_MS)
            and elapsed_ms >= next_retry_at_ms
        ):
            retry_attempt += 1
            logger.info(
                "slide_ready_retry_wait",
                deck_id=deck_id,
                slide_index=slide_index,
                mode=mode,
                retry_attempt=retry_attempt,
                retry_delay_ms=_SLIDE_READY_RETRY_DELAYS_MS[retry_attempt - 1],
            )
            next_retry_at_ms += _SLIDE_READY_RETRY_DELAYS_MS[retry_attempt - 1]

        if attempt < _SLIDE_READY_POLL_ATTEMPTS - 1:
            page.wait_for_timeout(_SLIDE_READY_POLL_INTERVAL_MS)

    elapsed_ms = int((time.monotonic() - started_at) * 1000)
    if state is None:
        state = _read_slide_ready_state(page)

    status = str((state or {}).get("status", "")).strip().lower()
    code = str((state or {}).get("code", "")).strip()
    reason = str((state or {}).get("reason", "")).strip()
    if status == "failed" and code == _SLIDE_READY_FAIL_CODE:
        raise RuntimeError(
            f"{_SLIDE_READY_FAIL_CODE}: deck {deck_id} slide {slide_index} "
            f"reported structural ready-gate failure ({reason or 'unknown_reason'})"
        )

    return {
        "ready": ready,
        "elapsed_ms": min(elapsed_ms, _SLIDE_READY_HARD_TIMEOUT_MS),
        "state": state,
    }


def _wait_for_slide_paint(page) -> None:
    """Wait for decoded images and two compositor frames before capture."""
    try:
        page.evaluate(
            """async () => {
                const images = Array.from(document.querySelectorAll('img'));
                await Promise.all(images.map(async (image) => {
                    if (image.naturalWidth <= 0 || typeof image.decode !== 'function') return;
                    try { await image.decode(); } catch (_) {}
                }));
                await new Promise((resolve) => requestAnimationFrame(() =>
                    requestAnimationFrame(resolve)
                ));
            }"""
        )
    except Exception as exc:
        # The ready gate remains authoritative; this is only a final compositor
        # settle step and must not hide a useful readiness error.
        logger.warning("slide_paint_settle_failed", error=str(exc))


def _validate_png_file(path: str, slide_index: int) -> None:
    """Reject missing, truncated, or non-PNG screenshots before packaging."""
    if not os.path.isfile(path) or os.path.getsize(path) <= 0:
        raise RuntimeError(
            f"E_PNG_SCREENSHOT_INVALID: slide {slide_index} screenshot is missing or empty"
        )

    try:
        with PillowImage.open(path) as image:
            if image.format != "PNG" or image.width <= 0 or image.height <= 0:
                raise ValueError("invalid PNG format or dimensions")
            image.verify()
        # verify() does not decode pixel data; load it in a fresh handle so a
        # truncated IDAT stream cannot pass validation.
        with PillowImage.open(path) as image:
            image.load()
    except Exception as exc:
        raise RuntimeError(
            f"E_PNG_SCREENSHOT_INVALID: slide {slide_index} screenshot cannot be decoded"
        ) from exc


def _render_slides_to_screenshots(
    task_self,
    render_spec: dict,
    tmp_dir: str,
    render_auth: dict[str, Any] | None = None,
) -> list[str]:
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
                    token = _make_slide_token(deck_id, idx, render_auth)
                    url = f"{base_url}/internal/slide-render/{deck_id}/{idx}"

                    page = context.new_page()
                    headers = {"X-Internal-Token": token}
                    if render_auth:
                        headers["Authorization"] = f"Bearer {token}"
                    page.set_extra_http_headers(headers)
                    response = page.goto(url, wait_until="domcontentloaded")
                    if response is not None:
                        response_status = response.status()
                        if isinstance(response_status, int) and not 200 <= response_status < 300:
                            raise RuntimeError(
                                f"E_SLIDE_RENDER_HTTP_{response_status}: "
                                f"slide-render route rejected deck {deck_id} slide {idx}"
                            )

                    ready_result = _poll_slide_ready(page, deck_id, idx, mode="screenshot")
                    ready = bool(ready_result["ready"])
                    state = ready_result.get("state") if isinstance(ready_result, dict) else None
                    state_status = str((state or {}).get("status", "")).strip().lower()
                    state_code = str((state or {}).get("code", "")).strip()
                    if bool((state or {}).get("mediaDegraded")):
                        raise RuntimeError(
                            "E_SLIDE_MEDIA_DEGRADED: "
                            f"deck {deck_id} slide {idx} has media that failed to load"
                        )
                    if not ready:
                        logger.warning("slide_ready_timeout", deck_id=deck_id, slide_index=idx)
                    elif state_status == "degraded":
                        logger.warning(
                            "slide_ready_degraded",
                            deck_id=deck_id,
                            slide_index=idx,
                            code=state_code or "W_SLIDE_READY_TIMEOUT",
                        )

                    out_path = os.path.join(tmp_dir, f"slide_{idx:04d}.png")
                    _wait_for_slide_paint(page)
                    page.screenshot(
                        path=out_path,
                        clip={"x": 0, "y": 0, "width": width, "height": height},
                        animations="disabled",
                    )
                    _validate_png_file(out_path, idx)
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


def _render_slides_to_video_clips(
    task_self,
    render_spec: dict,
    tmp_dir: str,
    render_auth: dict[str, Any] | None = None,
) -> list[dict]:
    """
    Record each slide as a short video clip for dynamic MP4 exports.

    Unlike screenshot mode, this keeps `<video>` elements playing so exported MP4
    contains real motion rather than a static first frame.
    """
    deck_id = render_spec["deckId"]
    slides = render_spec["slides"]
    width = render_spec.get("width", 1920)
    height = render_spec.get("height", 1080)
    total = len(slides)
    base_url = os.getenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")
    clip_segments: list[dict] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ])
        try:
            context = browser.new_context(
                viewport={"width": width, "height": height},
                record_video_dir=tmp_dir,
                record_video_size={"width": width, "height": height},
            )
            try:
                for idx, slide in enumerate(slides):
                    token = _make_slide_token(deck_id, idx, render_auth)
                    url = f"{base_url}/internal/slide-render/{deck_id}/{idx}?mode=record"

                    page = context.new_page()
                    headers = {"X-Internal-Token": token}
                    if render_auth:
                        headers["Authorization"] = f"Bearer {token}"
                    page.set_extra_http_headers(headers)
                    navigation_started_at = time.monotonic()
                    response = page.goto(url, wait_until="domcontentloaded")
                    if response is not None:
                        response_status = response.status()
                        if isinstance(response_status, int) and not 200 <= response_status < 300:
                            raise RuntimeError(
                                f"E_SLIDE_RENDER_HTTP_{response_status}: "
                                f"slide-render route rejected deck {deck_id} slide {idx}"
                            )

                    ready_result = _poll_slide_ready(page, deck_id, idx, mode="record")
                    ready = bool(ready_result["ready"])
                    state = ready_result.get("state") if isinstance(ready_result, dict) else None
                    state_status = str((state or {}).get("status", "")).strip().lower()
                    state_code = str((state or {}).get("code", "")).strip()
                    if bool((state or {}).get("mediaDegraded")):
                        raise RuntimeError(
                            "E_SLIDE_MEDIA_DEGRADED: "
                            f"deck {deck_id} slide {idx} has media that failed to load"
                        )
                    if not ready:
                        logger.warning("slide_ready_timeout_record_mode", deck_id=deck_id, slide_index=idx)
                    elif state_status == "degraded":
                        logger.warning(
                            "slide_ready_degraded_record_mode",
                            deck_id=deck_id,
                            slide_index=idx,
                            code=state_code or "W_SLIDE_READY_TIMEOUT",
                        )

                    duration_ms = max(250, int(slide.get("durationMs", 3000)))
                    ready_elapsed_ms = int(ready_result.get("elapsed_ms", 0))
                    if ready_elapsed_ms <= 0:
                        ready_elapsed_ms = max(0, int((time.monotonic() - navigation_started_at) * 1000))
                    page.wait_for_timeout(duration_ms)

                    recorded_video = page.video
                    page.close()

                    if not recorded_video:
                        raise RuntimeError(
                            f"Playwright video recording unavailable for deck {deck_id} slide {idx}"
                        )

                    raw_path = recorded_video.path()
                    clip_path = os.path.join(tmp_dir, f"slide_{idx:04d}.webm")
                    if os.path.abspath(raw_path) != os.path.abspath(clip_path):
                        if os.path.exists(clip_path):
                            os.remove(clip_path)
                        shutil.move(raw_path, clip_path)
                    clip_segments.append(
                        {
                            "path": clip_path,
                            "trim_start_ms": ready_elapsed_ms if ready else 0,
                            "duration_ms": duration_ms,
                        }
                    )

                    percent = int((idx + 1) / total * 75)
                    task_self.update_state(
                        state="PROGRESS",
                        meta={"percent": percent, "stage": f"Rendering slide {idx + 1} of {total}"},
                    )
            finally:
                context.close()
        finally:
            browser.close()

    return clip_segments


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


def _write_clip_concat_file(clip_paths: list[str], concat_path: str) -> None:
    """Write an FFmpeg concat demuxer file for pre-trimmed slide clips."""
    lines = [f"file '{path}'" for path in clip_paths]
    with open(concat_path, "w") as f:
        f.write("\n".join(lines) + "\n")


def _trim_video_clip_segment(
    segment: dict,
    idx: int,
    fps: int,
    tmp_dir: str,
    runner=None,
) -> str:
    """
    Trim one recorded clip accurately via re-encode.

    We avoid concat `inpoint/outpoint` on WebM because keyframe seeking can leave
    visible pre-roll (white frames). Re-encoding guarantees frame-accurate trim.
    """
    input_path = str(segment.get("path", "")).strip()
    if not input_path:
        raise ValueError(f"clip segment {idx} missing path")
    trim_start_ms = max(0, int(segment.get("trim_start_ms", 0)))
    duration_ms = max(250, int(segment.get("duration_ms", 3000)))
    trimmed_path = os.path.join(tmp_dir, f"slide_trim_{idx:04d}.mp4")

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ss", f"{trim_start_ms / 1000:.3f}",
        "-t", f"{duration_ms / 1000:.3f}",
        "-vf", f"fps={fps}",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-an",
        "-preset", "veryfast",
        "-crf", "23",
        "-movflags", "+faststart",
        trimmed_path,
    ]
    if runner:
        runner.run_command_sync(cmd, check=True, timeout=540)
    else:
        subprocess.run(cmd, check=True, capture_output=True, timeout=540)
    return trimmed_path


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
    """Encode MP4 from per-slide screenshots (legacy/static export path)."""
    slides = render_spec["slides"]
    durations_ms = [s.get("durationMs", 3000) for s in slides]
    concat_path = os.path.join(tmp_dir, "concat_list.txt")
    _write_concat_file(screenshot_paths, durations_ms, concat_path)
    video_input_args = ["-f", "concat", "-safe", "0", "-i", concat_path]
    return _encode_mp4_with_optional_audio(render_spec, quality, video_input_args, tmp_dir, runner=runner)


def _build_mp4_from_clips(
    render_spec: dict,
    quality: str,
    clip_segments: list[dict],
    tmp_dir: str,
    runner=None,
) -> str:
    """Encode MP4 from recorded per-slide clips (dynamic video export path)."""
    fps = _safe_fps(render_spec.get("fps", 30))
    trimmed_paths = [
        _trim_video_clip_segment(segment, idx, fps, tmp_dir, runner=runner)
        for idx, segment in enumerate(clip_segments)
    ]
    concat_path = os.path.join(tmp_dir, "clip_concat_list.txt")
    _write_clip_concat_file(trimmed_paths, concat_path)
    video_input_args = ["-f", "concat", "-safe", "0", "-i", concat_path]
    return _encode_mp4_with_optional_audio(render_spec, quality, video_input_args, tmp_dir, runner=runner)


def _encode_mp4_with_optional_audio(
    render_spec: dict,
    quality: str,
    video_input_args: list[str],
    tmp_dir: str,
    runner=None,
) -> str:
    """
    Encode MP4 with optional project/slide audio mix.

    Video input is provided by `video_input_args` and must map to input index 0.
    """
    slides = render_spec["slides"]
    fps = _safe_fps(render_spec.get("fps", 30))
    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["standard"])
    crf = preset["crf"]
    preset_name = preset["preset"]
    output_path = os.path.join(tmp_dir, "output.mp4")

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
    slide_audio_tracks: list[dict] = []
    cumulative_ms = 0
    video_element_audio_idx = 0

    for i, slide in enumerate(slides):
        duration_ms = slide.get("durationMs", 3000)
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

        # Download audio from unmuted video elements on this slide.
        # The video files are downloaded, then FFmpeg extracts audio for mixing.
        ve_audio_specs = slide.get("videoElementAudioTracks") or []
        for ve_spec in ve_audio_specs:
            ve_url = ve_spec.get("url", "") if isinstance(ve_spec, dict) else ""
            if not ve_url:
                continue
            try:
                ve_dl_path = _download_audio(ve_url, tmp_dir, 1000 + video_element_audio_idx)
                # Extract audio stream from the video file into a separate audio file.
                ve_audio_path = os.path.join(tmp_dir, f"ve_audio_{video_element_audio_idx}.aac")
                extract_cmd = [
                    "ffmpeg", "-y",
                    "-i", ve_dl_path,
                    "-vn",
                    "-c:a", "aac", "-b:a", "192k",
                    "-t", f"{duration_ms / 1000.0:.3f}",
                    ve_audio_path,
                ]
                subprocess.run(extract_cmd, check=True, capture_output=True, timeout=120)
                slide_audio_tracks.append(
                    {
                        "path": ve_audio_path,
                        "start_ms": cumulative_ms,
                        "end_ms": None,
                        "volume": _safe_volume(ve_spec.get("volume", 1.0) if isinstance(ve_spec, dict) else 1.0),
                    }
                )
                video_element_audio_idx += 1
            except Exception as exc:
                logger.warning(
                    "audio_extract_failed_video_element",
                    slide_index=i,
                    url=ve_url[:100],
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
            *video_input_args,
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
    ffmpeg_audio_inputs: list[str] = []
    if has_project:
        ffmpeg_audio_inputs.append(project_audio_path)  # type: ignore[arg-type]
    for track in slide_audio_tracks:
        ffmpeg_audio_inputs.append(track["path"])

    # Build filter_complex parts
    filter_parts: list[str] = []
    mix_labels: list[str] = []

    audio_input_idx = 1  # 0 is the video input

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

    # Assemble inputs section: video concat + all audio files
    input_args: list[str] = list(video_input_args)
    for audio_path in ffmpeg_audio_inputs:
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
        for idx, path in enumerate(screenshot_paths):
            _validate_png_file(path, idx)
            zf.write(path, arcname=os.path.basename(path))
    with zipfile.ZipFile(output_path) as zf:
        broken_member = zf.testzip()
        if broken_member is not None:
            raise RuntimeError(f"E_PNG_ARCHIVE_CORRUPT: archive member {broken_member} failed validation")
    return output_path


def _build_jpg_zip(screenshot_paths: list[str], tmp_dir: str) -> str:
    """Convert PNG screenshots to JPEG quality=90, then zip."""
    jpg_paths: list[str] = []
    for idx, png_path in enumerate(screenshot_paths):
        _validate_png_file(png_path, idx)
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
    Upload the rendered output to S3/R2 and return the storage key.

    The Node protected storage proxy is the only playback URL. Do not return a
    presigned URL because it expires and bypasses the tenant/user cache boundary.
    H-4: deck_id is sanitized to prevent path traversal in the R2 key namespace.

    Returns: {"output_url": None, "output_storage_key": str, "output_bytes": int}
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
    try:
        r2 = get_r2_storage()
        _run_async(r2.upload_file(output_path, key, content_type=content_type))
        logger.info(
            "render_presentation_uploaded_r2",
            deck_id=deck_id_safe,
            key=key,
            output_bytes=file_size,
        )
    except Exception as exc:
        logger.error(
            "render_presentation_upload_r2_failed",
            deck_id=deck_id_safe,
            key=key,
            error=str(exc),
        )
        raise RuntimeError("Presentation export could not be stored in R2") from exc

    task_self.update_state(
        state="PROGRESS",
        meta={"percent": 100, "stage": "Done"},
    )
    return {"output_url": None, "output_storage_key": key, "output_bytes": file_size}
