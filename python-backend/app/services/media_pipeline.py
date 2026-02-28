"""Media pipeline service for processing Kie AI media results.

Downloads media from Kie AI result URLs, generates thumbnails,
extracts metadata, and uploads to R2 storage.
"""

import asyncio
import mimetypes
import os
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

import httpx
import structlog
from PIL import Image

logger = structlog.get_logger()

# Thumbnail settings
IMAGE_THUMB_WIDTH = 300
VIDEO_THUMB_POSITION_RATIO = 0.25  # Frame at 25% of duration


class MediaPipelineError(Exception):
    """Permanent error in the media pipeline (should not retry)."""

    pass


async def download_media(
    result_url: str,
    tmp_dir: str,
) -> tuple[str, int, str]:
    """Download media from Kie AI result URL.

    Args:
        result_url: URL to download from.
        tmp_dir: Temporary directory to store the file.

    Returns:
        Tuple of (local_file_path, file_size_bytes, content_type).

    Raises:
        httpx.TimeoutException: On network timeout (transient, should retry).
        httpx.HTTPStatusError: On HTTP error (4xx = permanent, 5xx = transient).
        MediaPipelineError: On SSRF-blocked URL (permanent).
    """
    # Validate URL against SSRF (block internal IPs, metadata endpoints)
    from app.core.media_job_validators import validate_uri_no_ssrf

    try:
        validate_uri_no_ssrf(result_url)
    except ValueError as e:
        raise MediaPipelineError(f"Blocked URL: {e}") from e

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(300.0, connect=10.0),
        follow_redirects=True,
    ) as client:
        response = await client.get(result_url)
        response.raise_for_status()

    content_type = response.headers.get("content-type", "application/octet-stream")
    ext = _guess_extension(content_type, result_url)
    file_path = os.path.join(tmp_dir, f"result{ext}")

    with open(file_path, "wb") as f:
        f.write(response.content)

    file_size = len(response.content)
    logger.info(
        "media_downloaded",
        url=result_url,
        size=file_size,
        content_type=content_type,
    )
    return file_path, file_size, content_type


async def generate_thumbnail(
    file_path: str,
    media_type: str,
    tmp_dir: str,
) -> str | None:
    """Generate a thumbnail for the downloaded media.

    Args:
        file_path: Path to the downloaded media file.
        media_type: One of 'image', 'video', 'audio'.
        tmp_dir: Temporary directory for output.

    Returns:
        Path to the thumbnail file, or None for audio.
    """
    if media_type == "audio":
        return None

    thumb_path = os.path.join(tmp_dir, "thumb.jpg")

    if media_type == "image":
        await _generate_image_thumbnail(file_path, thumb_path)
    elif media_type == "video":
        await _generate_video_thumbnail(file_path, thumb_path)

    if os.path.exists(thumb_path):
        return thumb_path
    return None


async def extract_metadata(
    file_path: str,
    media_type: str,
) -> dict:
    """Extract metadata from the downloaded media file.

    Returns dict with keys like file_size_bytes, width, height,
    duration_seconds, format, mime_type.
    """
    file_size = os.path.getsize(file_path)
    content_type, _ = mimetypes.guess_type(file_path)
    metadata = {
        "file_size_bytes": file_size,
        "mime_type": content_type or "application/octet-stream",
    }

    if media_type == "image":
        try:
            img = await asyncio.to_thread(Image.open, file_path)
            metadata["width"] = img.width
            metadata["height"] = img.height
            metadata["format"] = img.format or "unknown"
            img.close()
        except Exception as e:
            logger.warning("metadata_image_extract_failed", error=str(e))

    elif media_type in ("video", "audio"):
        try:
            probe_result = await asyncio.to_thread(
                _ffprobe_metadata, file_path
            )
            metadata.update(probe_result)
        except Exception as e:
            logger.warning("metadata_ffprobe_failed", error=str(e))

    return metadata


async def upload_to_r2(
    user_id: str,
    job_id: str,
    result_path: str,
    thumbnail_path: str | None,
    media_type: str,
) -> dict:
    """Upload result and thumbnail to R2.

    Returns dict with r2_keys and public URLs.
    """
    from app.services.generation.r2_storage import get_r2_storage, StoragePath

    r2 = get_r2_storage()
    ext = Path(result_path).suffix.lstrip(".")

    # Determine storage key based on media type
    if media_type == "video":
        result_key = StoragePath.video_generated(user_id, job_id, ext or "mp4")
    elif media_type == "audio":
        result_key = StoragePath.audio_generated(user_id, job_id, ext or "mp3")
    else:
        result_key = StoragePath.image_generated(user_id, job_id, ext or "png")

    result_url = await r2.upload_file(result_path, result_key)

    r2_info = {
        "result_key": result_key,
        "result_url": result_url,
        "thumbnail_key": None,
        "thumbnail_url": None,
    }

    if thumbnail_path and os.path.exists(thumbnail_path):
        if media_type == "video":
            thumb_key = StoragePath.video_thumbnail(job_id)
        else:
            thumb_key = StoragePath.image_thumbnail(job_id, size="300")
        thumb_url = await r2.upload_file(thumbnail_path, thumb_key, content_type="image/jpeg")
        r2_info["thumbnail_key"] = thumb_key
        r2_info["thumbnail_url"] = thumb_url

    logger.info("media_uploaded_to_r2", job_id=job_id, result_key=result_key)
    return r2_info


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _guess_extension(content_type: str, url: str) -> str:
    """Guess file extension from content type or URL."""
    ext = mimetypes.guess_extension(content_type)
    if ext:
        return ext
    # Fallback: extract from URL path
    url_path = url.split("?")[0]
    if "." in url_path.split("/")[-1]:
        return "." + url_path.split("/")[-1].rsplit(".", 1)[-1]
    return ".bin"


async def _generate_image_thumbnail(input_path: str, output_path: str) -> None:
    """Generate a 300px-wide thumbnail using Pillow."""

    def _do_thumbnail():
        img = Image.open(input_path)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        ratio = IMAGE_THUMB_WIDTH / img.width
        new_height = int(img.height * ratio)
        img = img.resize((IMAGE_THUMB_WIDTH, new_height), Image.Resampling.LANCZOS)
        img.save(output_path, "JPEG", quality=85)
        img.close()

    await asyncio.to_thread(_do_thumbnail)


async def _generate_video_thumbnail(input_path: str, output_path: str, runner=None) -> None:
    """Extract a frame at 25% of video duration using FFmpeg."""
    # Get duration via ffprobe
    duration = 0.0
    probe_cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_path,
    ]
    try:
        if runner:
            probe = await runner.run_command(probe_cmd, timeout=30)
        else:
            probe = await asyncio.to_thread(
                subprocess.run, probe_cmd,
                capture_output=True, text=True, timeout=30,
            )
        duration = float(probe.stdout.strip() or "0")
    except Exception:
        pass

    seek_time = duration * VIDEO_THUMB_POSITION_RATIO if duration > 0 else 0

    thumb_cmd = [
        "ffmpeg", "-y", "-ss", str(seek_time),
        "-i", input_path,
        "-frames:v", "1",
        "-q:v", "3",
        output_path,
    ]
    if runner:
        await runner.run_command(thumb_cmd, timeout=30)
    else:
        await asyncio.to_thread(
            subprocess.run, thumb_cmd,
            capture_output=True, timeout=30,
        )


def _ffprobe_metadata(file_path: str, runner=None) -> dict:
    """Extract video/audio metadata via ffprobe (sync)."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration,format_name:stream=width,height,codec_name",
        "-of", "json",
        file_path,
    ]
    if runner:
        result = runner.run_command_sync(cmd, timeout=30)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    import json as _json

    metadata = {}
    try:
        data = _json.loads(result.stdout)
        fmt = data.get("format", {})
        if "duration" in fmt:
            metadata["duration_seconds"] = float(fmt["duration"])
        if "format_name" in fmt:
            metadata["format"] = fmt["format_name"]

        for stream in data.get("streams", []):
            if "width" in stream:
                metadata["width"] = stream["width"]
            if "height" in stream:
                metadata["height"] = stream["height"]
            if "codec_name" in stream:
                metadata["codec"] = stream["codec_name"]
    except Exception:
        pass

    return metadata
