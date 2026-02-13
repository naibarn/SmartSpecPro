"""
Media Job Worker — Celery task for executing FFmpeg-based media jobs.

Receives MediaJobSpec JSON from the Node.js server, dispatches to the correct
handler, and reports progress via application-owned Redis keys.
"""

import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
from typing import Any

import redis

from app.core.celery_app import celery_app
from app.core.media_job_validators import validate_job_spec_security, validate_uri_no_ssrf

# ========================================
# Redis client for progress reporting
# ========================================

_redis_url = os.getenv("CELERY_BROKER_URL", os.getenv("REDIS_URL", "redis://localhost:6379/0"))
redis_client = redis.from_url(_redis_url)

JOB_TTL = 86400  # 24h

VALID_JOB_TYPES = {
    "probe",
    "render_mp4_h264",
    "render_hls",
    "waveform_peaks",
    "thumbnails",
    "subtitles_extract",
    "subtitles_burnin",
    "concat",
    "dead_air_detect",
    "dead_air_cut",
    "generate_clip_from_api",
}


# ========================================
# Validation
# ========================================

def _validate_ffmpeg():
    """Check ffmpeg and ffprobe are available. Called at import time."""
    for binary in ("ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            import warnings
            warnings.warn(f"{binary} not found in PATH. Media jobs will fail.")


_validate_ffmpeg()

SHELL_METACHAR_RE = re.compile(r"[;|&`$(){}><]")

# Strip all ASCII control characters (0x00-0x1f, 0x7f) for safe log/error output
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")


def _to_int(val: Any, default: int = 0) -> int:
    """Safely coerce a value to int. Handles None, str, float, inf, and invalid types."""
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError, OverflowError):
        return default


def _safe_float_for_ffmpeg(val: float, precision: int = 6) -> str:
    """Safely format a float for FFmpeg filter string interpolation.

    Validates that the formatted string contains no shell metacharacters
    that could be used for filter injection attacks.

    Args:
        val: Float value to format
        precision: Decimal precision (default 6)

    Returns:
        Formatted float string safe for FFmpeg interpolation

    Raises:
        ValueError: If the formatted value contains shell metacharacters
    """
    s = f"{val:.{precision}f}"
    if SHELL_METACHAR_RE.search(s):
        raise ValueError(f"Invalid FFmpeg value (contains shell metacharacters): {s}")
    return s


def _safe_clip_id(clip: dict, max_len: int = 50) -> str:
    """Return a log-safe clip ID stripped of all control characters."""
    raw = str(clip.get("clipId", "?"))[:max_len]
    return _CONTROL_CHAR_RE.sub("", raw)


def parse_job_spec(spec_json: str) -> dict:
    """Parse and validate a MediaJobSpec JSON string."""
    spec = json.loads(spec_json)

    if "jobType" not in spec:
        raise ValueError("Missing required field: jobType")
    if "specVersion" not in spec:
        raise ValueError("Missing required field: specVersion")
    if spec["specVersion"] != "0.1":
        raise ValueError(f"Unsupported specVersion: {spec['specVersion']}")
    if spec["jobType"] not in VALID_JOB_TYPES:
        raise ValueError(f"Unknown jobType: {spec['jobType']}")

    # Validate asset URIs
    for asset in spec.get("inputs", {}).get("assets", []):
        uri = asset.get("uri", "")
        if SHELL_METACHAR_RE.search(uri):
            raise ValueError(f"Asset URI contains shell metacharacters: {uri}")

    return spec


# ========================================
# Progress reporting
# ========================================

def report_progress(
    job_id: str,
    progress: float,
    stage: str = "",
    message: str = "",
    metrics: dict | None = None,
):
    """Write progress to Redis and publish to real-time channel."""
    status_data = {
        "jobId": job_id,
        "status": "running",
        "progress": min(max(progress, 0.0), 1.0),
        "stage": stage,
        "message": message,
        "metrics": metrics or {},
    }
    redis_client.set(f"media-job:{job_id}:status", json.dumps(status_data), ex=JOB_TTL)
    redis_client.publish(f"media-job-progress:{job_id}", json.dumps(status_data))


def report_done(job_id: str, result: dict):
    """Report job completion. Skips writing if the job was already canceled."""
    # Check if job was canceled — don't overwrite cancellation
    current_raw = redis_client.get(f"media-job:{job_id}:status")
    if current_raw:
        try:
            current = json.loads(current_raw)
            if current.get("status") == "canceled":
                return  # Respect user cancellation
        except (json.JSONDecodeError, TypeError):
            pass
    redis_client.set(f"media-job:{job_id}:result", json.dumps(result), ex=JOB_TTL)
    done_status = {"jobId": job_id, "status": "done", "progress": 1.0}
    redis_client.set(f"media-job:{job_id}:status", json.dumps(done_status), ex=JOB_TTL)
    redis_client.publish(f"media-job-progress:{job_id}", json.dumps(done_status))


def report_error(job_id: str, code: str, message: str, details: dict | None = None):
    """Report job failure."""
    error_data = {"code": code, "message": message, "details": details or {}}
    redis_client.set(f"media-job:{job_id}:error", json.dumps(error_data), ex=JOB_TTL)
    error_status = {"jobId": job_id, "status": "error", "progress": 0, "message": message}
    redis_client.set(f"media-job:{job_id}:status", json.dumps(error_status), ex=JOB_TTL)
    redis_client.publish(f"media-job-progress:{job_id}", json.dumps(error_status))


# ========================================
# FFmpeg helpers
# ========================================

def _resolve_asset_path(uri: str, tmp_dir: str) -> str:
    """Resolve a URI to a local file path. Downloads remote files.

    Validates URI against SSRF before any network access.
    file:// scheme is blocked by validate_uri_no_ssrf.
    """
    validate_uri_no_ssrf(uri)
    if uri.startswith("http://") or uri.startswith("https://"):
        import urllib.request
        filename = os.path.basename(uri.split("?")[0]) or "download"
        local_path = os.path.join(tmp_dir, filename)
        urllib.request.urlretrieve(uri, local_path)
        return local_path
    return uri


def _sanitize_stderr(stderr: str, max_len: int = 1500) -> str:
    """Strip internal file paths from FFmpeg stderr to avoid leaking server structure.

    Preserves http(s) URLs so that error messages referencing remote assets remain useful.
    Uses the TAIL of stderr because FFmpeg prints the actual error after its version banner.
    """
    truncated = stderr[-max_len:] if len(stderr) > max_len else stderr
    # Temporarily replace http(s) URLs so the path regex doesn't mangle them
    url_placeholders: list[str] = []

    def _preserve_url(m: re.Match) -> str:
        url_placeholders.append(m.group(0))
        return f"__URL_{len(url_placeholders) - 1}__"

    sanitized = re.sub(r"https?://\S+", _preserve_url, truncated)
    # Unix absolute paths (e.g. /home/user/project/file.mp4)
    sanitized = re.sub(r"/(?:[^\s/:]+/)+[^\s/:]*", "<path>", sanitized)
    # Windows absolute paths (C:\Users\...)
    sanitized = re.sub(r"[A-Za-z]:\\(?:[^\\\s:]+\\)*[^\\\s:]*", "<path>", sanitized)
    # Restore preserved URLs
    for i, url in enumerate(url_placeholders):
        sanitized = sanitized.replace(f"__URL_{i}__", url)
    return sanitized


def _safe_uri_for_ffmpeg(uri: str) -> str:
    """Validate URI and return it for direct use by FFmpeg.

    Defense-in-depth: validates even though validate_job_spec_security()
    runs at task entry. FFmpeg handles http(s):// URIs natively.
    """
    validate_uri_no_ssrf(uri)
    return uri


def build_ffmpeg_command_for_probe(spec: dict) -> list[str]:
    """Build ffprobe command for probing."""
    assets = spec.get("inputs", {}).get("assets", [])
    if not assets:
        raise ValueError("No assets for probe")
    uri = assets[0]["uri"]
    path = _safe_uri_for_ffmpeg(uri)
    return ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path]


# Mapping from TransitionName (camelCase) to FFmpeg xfade transition name
XFADE_MAP: dict[str, str] = {
    "crossfade": "fade",
    "wipeLeft": "wipeleft",
    "wipeRight": "wiperight",
    "wipeUp": "wipeup",
    "wipeDown": "wipedown",
    "slideLeft": "slideleft",
    "slideRight": "slideright",
    "slideUp": "slideup",
    "slideDown": "slidedown",
    "zoomIn": "zoomin",
    "zoomOut": "fadeblack",
    "circleOpen": "circleopen",
    "circleClose": "circleclose",
    "diamondOpen": "diagtl",
    "blur": "fadeblack",
    "pixelize": "pixelize",
    "radial": "radial",
    "smoothLeft": "smoothleft",
    "smoothRight": "smoothright",
}


_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".svg"}


def _is_image_uri(uri: str) -> bool:
    """Check if URI points to an image file (no audio stream)."""
    path_part = uri.split("?")[0].split("#")[0]
    ext = os.path.splitext(path_part)[1].lower()
    return ext in _IMAGE_EXTENSIONS


def _has_audio_stream(uri: str) -> bool:
    """Probe whether an input file has at least one audio stream.

    Uses ffprobe with a short timeout. Returns False on any error
    (missing audio, network issue, etc.) so the caller generates silence.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-select_streams", "a",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                uri,
            ],
            capture_output=True, text=True, timeout=15,
        )
        return "audio" in result.stdout
    except Exception:
        return False


def build_ffmpeg_command_for_render(spec: dict) -> list[str]:
    """Build FFmpeg render command from timeline."""
    project = spec.get("inputs", {}).get("project")
    if not project:
        raise ValueError("No project/timeline for render")

    output_target = spec.get("output", {}).get("target", "/tmp/output.mp4")
    tracks = project.get("tracks", [])

    # Collect input files from assets
    assets = spec.get("inputs", {}).get("assets", [])
    asset_map = {a["assetId"]: a["uri"] for a in assets}
    asset_duration_map = {a["assetId"]: a.get("durationMs", 0) for a in assets}

    input_files: list[str] = []
    input_index: dict[str, int] = {}
    image_inputs: set[int] = set()   # Inputs that are images (need -loop 1)
    silent_inputs: set[int] = set()  # Inputs without audio (need anullsrc)

    for track in tracks:
        for clip in track.get("clips", []):
            # Coerce to int — handles None, string, and float values
            in_ms = _to_int(clip.get("inMs"))
            out_ms = _to_int(clip.get("outMs"))
            # Reject negative timing values
            if in_ms < 0 or out_ms < 0:
                raise ValueError(
                    f"Clip {_safe_clip_id(clip)}: timing values must be >= 0 (inMs={in_ms}, outMs={out_ms})"
                )
            # Validate clip duration (skip untrimmed clips where both are 0)
            if (in_ms != 0 or out_ms != 0) and out_ms <= in_ms:
                raise ValueError(
                    f"Clip {_safe_clip_id(clip)}: outMs ({out_ms}) must be > inMs ({in_ms})"
                )

            uri = asset_map.get(clip["assetId"], "")
            path = _safe_uri_for_ffmpeg(uri)
            if path not in input_index:
                idx = len(input_files)
                input_index[path] = idx
                input_files.append(path)
                if _is_image_uri(uri):
                    image_inputs.add(idx)
                    silent_inputs.add(idx)
                elif not _has_audio_stream(path):
                    # Video file without audio (e.g. AI-generated clips)
                    silent_inputs.add(idx)

    cmd = ["ffmpeg", "-y"]
    for i, f in enumerate(input_files):
        if i in image_inputs:
            # Image inputs need -loop 1 so trim can create arbitrary duration
            cmd.extend(["-loop", "1", "-i", f])
        else:
            cmd.extend(["-i", f])

    # Build filter complex
    video_clips = []
    for track in tracks:
        if track.get("type") in ("video", "overlay"):
            video_clips.extend(track.get("clips", []))

    if len(video_clips) <= 1 and len(input_files) == 1:
        # Simple case: single input (ignore transitions on single clips)
        cmd.extend([
            "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
            "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
            output_target,
        ])
    else:
        # Check if any non-first clip has an inTransition
        has_transitions = any(
            clip.get("inTransition") and clip["inTransition"].get("name", "none") != "none"
            for clip in video_clips[1:]  # Skip first clip — can't transition from nothing
        ) if len(video_clips) > 1 else False

        # Target resolution + fps for xfade (all clips must match size, fps, timebase)
        proj_w = _to_int(project.get("width")) or 1920
        proj_h = _to_int(project.get("height")) or 1080
        proj_fps = _to_int(project.get("fps")) or 30

        filters = []
        # Trim each clip (video + audio)
        for i, clip in enumerate(video_clips):
            uri = asset_map.get(clip["assetId"], "")
            path = _safe_uri_for_ffmpeg(uri)
            idx = input_index.get(path, 0)
            in_s = _to_int(clip.get("inMs")) / 1000.0
            out_s = _to_int(clip.get("outMs")) / 1000.0

            # Compute clip segment duration for silent audio generation
            if in_s > 0 or out_s > 0:
                clip_seg_dur = max(0.001, out_s - in_s)
            else:
                asset_dur_ms = _to_int(asset_duration_map.get(clip.get("assetId", ""), 0))
                clip_seg_dur = max(0.001, asset_dur_ms / 1000.0)

            # Video filter: trim + fps + scale + format
            # fps normalizes framerate AND timebase (required for xfade)
            # scale + pad ensures all clips are exactly proj_w x proj_h
            normalize_chain = (
                f"fps={proj_fps},"
                f"scale={proj_w}:{proj_h}:force_original_aspect_ratio=decrease,"
                f"pad={proj_w}:{proj_h}:(ow-iw)/2:(oh-ih)/2:color=black,"
                f"setsar=1,format=yuv420p"
            )
            if in_s > 0 or out_s > 0:
                filters.append(f"[{idx}:v]trim=start={in_s}:end={out_s},setpts=PTS-STARTPTS,{normalize_chain}[v{i}]")
            else:
                filters.append(f"[{idx}:v]setpts=PTS-STARTPTS,{normalize_chain}[v{i}]")

            # Audio filter — generate silence for inputs without audio streams
            if idx in silent_inputs:
                filters.append(
                    f"anullsrc=r=48000:cl=stereo[_sil{i}];"
                    f"[_sil{i}]atrim=0:{clip_seg_dur},asetpts=PTS-STARTPTS[a{i}]"
                )
            elif in_s > 0 or out_s > 0:
                filters.append(f"[{idx}:a]atrim=start={in_s}:end={out_s},asetpts=PTS-STARTPTS[a{i}]")
            else:
                filters.append(f"[{idx}:a]asetpts=PTS-STARTPTS[a{i}]")

        n = len(video_clips)

        if not has_transitions:
            # No transitions: simple concat
            concat_in = "".join(f"[v{i}][a{i}]" for i in range(n))
            filters.append(f"{concat_in}concat=n={n}:v=1:a=1[vout][aout]")
        else:
            # Build chained xfade (video) + acrossfade (audio)
            # Calculate clip durations in seconds (without mutating spec)
            clip_durations = []
            for clip in video_clips:
                c_in = _to_int(clip.get("inMs"))
                c_out = _to_int(clip.get("outMs"))
                if c_in > 0 or c_out > 0:
                    clip_durations.append(max(0.001, (c_out - c_in) / 1000.0))
                else:
                    # Untrimmed clip: use asset's actual duration
                    asset_dur_ms = _to_int(asset_duration_map.get(clip.get("assetId", ""), 0))
                    clip_durations.append(max(0.001, asset_dur_ms / 1000.0))

            # Chain xfade for video
            prev_v_label = "v0"
            accumulated_duration = clip_durations[0]

            for i in range(1, n):
                clip = video_clips[i]
                tr = clip.get("inTransition")
                tr_name = tr.get("name", "none") if tr else "none"
                raw_tr_dur = (_to_int(tr.get("durationMs")) / 1000.0) if tr else 0.0
                # Clamp transition to clip durations (read-only, no mutation)
                tr_dur = min(raw_tr_dur, clip_durations[i], clip_durations[i - 1]) if raw_tr_dur > 0 else 0.0

                # Enforce minimum transition of 0.04s (1 frame at 25fps) to avoid FFmpeg errors
                if tr_dur > 0 and tr_dur < 0.04:
                    tr_dur = 0.0
                if tr_name != "none" and tr_dur > 0:
                    xfade_name = XFADE_MAP.get(tr_name, "fade")
                    offset = max(0, accumulated_duration - tr_dur)
                    out_label = "vout" if i == n - 1 else f"vt{i}"
                    filters.append(
                        f"[{prev_v_label}][v{i}]xfade=transition={xfade_name}:duration={tr_dur}:offset={offset}[{out_label}]"
                    )
                    prev_v_label = out_label
                    accumulated_duration = offset + clip_durations[i]
                else:
                    # No transition between these clips: concat pair then continue
                    out_label = "vout" if i == n - 1 else f"vt{i}"
                    filters.append(
                        f"[{prev_v_label}][v{i}]xfade=transition=fade:duration=0.001:offset={accumulated_duration - 0.001}[{out_label}]"
                    )
                    prev_v_label = out_label
                    accumulated_duration = accumulated_duration + clip_durations[i] - 0.001

            # Chain acrossfade for audio
            prev_a_label = "a0"
            accumulated_duration = clip_durations[0]

            for i in range(1, n):
                clip = video_clips[i]
                tr = clip.get("inTransition")
                tr_name = tr.get("name", "none") if tr else "none"
                raw_tr_dur = (_to_int(tr.get("durationMs")) / 1000.0) if tr else 0.0
                tr_dur = min(raw_tr_dur, clip_durations[i], clip_durations[i - 1]) if raw_tr_dur > 0 else 0.0
                if tr_dur > 0 and tr_dur < 0.04:
                    tr_dur = 0.0

                out_label = "aout" if i == n - 1 else f"at{i}"

                if tr_name != "none" and tr_dur > 0:
                    filters.append(
                        f"[{prev_a_label}][a{i}]acrossfade=d={tr_dur}:c1=tri:c2=tri[{out_label}]"
                    )
                    accumulated_duration = accumulated_duration - tr_dur + clip_durations[i]
                else:
                    # Minimal crossfade as concat equivalent
                    filters.append(
                        f"[{prev_a_label}][a{i}]acrossfade=d=0.001:c1=tri:c2=tri[{out_label}]"
                    )
                    accumulated_duration = accumulated_duration + clip_durations[i] - 0.001

                prev_a_label = out_label

        cmd.extend(["-filter_complex", ";".join(filters)])
        cmd.extend(["-map", "[vout]", "-map", "[aout]"])
        cmd.extend([
            "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
            "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
            output_target,
        ])

    return cmd


def build_ffmpeg_command_for_waveform(spec: dict) -> list[str]:
    """Build command for PCM waveform extraction."""
    assets = spec.get("inputs", {}).get("assets", [])
    if not assets:
        raise ValueError("No assets for waveform")
    uri = assets[0]["uri"]
    path = _safe_uri_for_ffmpeg(uri)
    return [
        "ffmpeg", "-i", path,
        "-af", "aformat=sample_fmts=s16:channel_layouts=mono",
        "-f", "s16le", "-",
    ]


def build_ffmpeg_command_for_silence(spec: dict) -> list[str]:
    """Build command for silence detection."""
    assets = spec.get("inputs", {}).get("assets", [])
    if not assets:
        raise ValueError("No assets for silence detection")
    uri = assets[0]["uri"]
    path = _safe_uri_for_ffmpeg(uri)

    params = spec.get("params", {})
    # Cast to numeric to prevent FFmpeg filter injection via string values
    try:
        threshold_db = float(params.get("thresholdDb", -40))
    except (ValueError, TypeError):
        threshold_db = -40.0
    try:
        min_silence_ms = float(params.get("minSilenceMs", 500))
    except (ValueError, TypeError):
        min_silence_ms = 500.0
    min_duration = min_silence_ms / 1000.0

    af = f"silencedetect=noise={threshold_db}dB:d={min_duration}"
    return ["ffmpeg", "-i", path, "-af", af, "-f", "null", "-"]


def parse_ffmpeg_progress(line: str, total_duration_us: int) -> float | None:
    """Parse a single line from FFmpeg -progress pipe:1 output."""
    if line.startswith("out_time_us="):
        try:
            out_us = int(line.split("=", 1)[1])
            if total_duration_us > 0:
                return min(out_us / total_duration_us, 1.0)
        except ValueError:
            pass
    return None


def parse_silence_output(stderr: str) -> list[dict]:
    """Parse FFmpeg silencedetect filter output from stderr."""
    segments: list[dict] = []
    current_start: float | None = None

    for line in stderr.splitlines():
        if "silence_start:" in line:
            match = re.search(r"silence_start:\s*([\d.]+)", line)
            if match:
                current_start = float(match.group(1))
        elif "silence_end:" in line:
            end_match = re.search(r"silence_end:\s*([\d.]+)", line)
            dur_match = re.search(r"silence_duration:\s*([\d.]+)", line)
            if current_start is not None and end_match:
                end_val = float(end_match.group(1))
                dur_val = float(dur_match.group(1)) if dur_match else (end_val - current_start)
                segments.append({
                    "startMs": int(current_start * 1000),
                    "endMs": int(end_val * 1000),
                    "durationMs": int(dur_val * 1000),
                })
                current_start = None

    return segments


def parse_waveform_pcm(pcm_data: bytes, sample_rate: int, bucket_ms: int, max_buckets: int = 10000) -> list[float]:
    """Parse raw 16-bit signed LE PCM data into per-bucket peak values (0.0-1.0)."""
    samples_per_bucket = (sample_rate * bucket_ms) // 1000
    if samples_per_bucket == 0:
        return []

    total_samples = len(pcm_data) // 2
    num_buckets = min((total_samples + samples_per_bucket - 1) // samples_per_bucket, max_buckets)

    peaks: list[float] = []
    for bucket_idx in range(num_buckets):
        start = bucket_idx * samples_per_bucket
        end = min((bucket_idx + 1) * samples_per_bucket, total_samples)

        max_abs = 0
        for s in range(start, end):
            offset = s * 2
            if offset + 1 < len(pcm_data):
                sample = struct.unpack_from("<h", pcm_data, offset)[0]
                abs_val = abs(sample)
                if abs_val > max_abs:
                    max_abs = abs_val

        peaks.append(max_abs / 32767.0)

    return peaks


# ========================================
# Job Handlers
# ========================================

def handle_probe(spec: dict, tmp_dir: str) -> dict:
    """Probe a media file and return metadata."""
    cmd = build_ffmpeg_command_for_probe(spec)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {_sanitize_stderr(result.stderr)}")

    probe_data = json.loads(result.stdout)
    streams = probe_data.get("streams", [])
    fmt = probe_data.get("format", {})

    return {
        "artifacts": [],
        "derived": {
            "format": fmt,
            "streams": streams,
            "durationMs": int(float(fmt.get("duration", 0)) * 1000),
        },
    }


def handle_render_mp4(spec: dict, tmp_dir: str) -> dict:
    """Render MP4 from timeline."""
    job_id = spec["jobId"]
    user_id = str(spec.get("_userId", "unknown"))
    original_filename = spec.get("output", {}).get("target", "output.mp4")

    # Sanitize filename to prevent path traversal
    safe_filename = os.path.basename(original_filename)
    if not safe_filename.lower().endswith(".mp4"):
        safe_filename += ".mp4"

    # Write to media_storage/renders/{userId}/{jobId}/{filename}
    media_storage_path = os.getenv("MEDIA_STORAGE_PATH", "./media_storage")
    render_dir = os.path.join(media_storage_path, "renders", user_id, job_id)
    os.makedirs(render_dir, exist_ok=True)
    output_path = os.path.join(render_dir, safe_filename)

    # Override output target in spec so FFmpeg writes to the correct location
    spec.setdefault("output", {})["target"] = output_path

    cmd = build_ffmpeg_command_for_render(spec)

    import structlog
    _render_log = structlog.get_logger()
    _render_log.info("ffmpeg_render_cmd", job_id=job_id, cmd=" ".join(cmd))

    report_progress(job_id, 0.1, "rendering", "Starting FFmpeg render")

    process = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    _, stderr = process.communicate(timeout=1800)

    if process.returncode != 0:
        _render_log.error("ffmpeg_render_failed", job_id=job_id, returncode=process.returncode, stderr=stderr[-2000:])
        raise RuntimeError(f"FFmpeg render failed: {_sanitize_stderr(stderr)}")

    # Return serveable URL (Python backend serves this via /api/v1/media/files/renders/)
    serve_url = f"/api/v1/media/files/renders/{user_id}/{job_id}/{safe_filename}"
    return {
        "artifacts": [{"kind": "video", "uri": serve_url, "mime": "video/mp4"}],
    }


def handle_waveform_peaks(spec: dict, tmp_dir: str) -> dict:
    """Extract waveform peaks from audio."""
    job_id = spec["jobId"]
    cmd = build_ffmpeg_command_for_waveform(spec)

    report_progress(job_id, 0.1, "extracting_waveform")

    process = subprocess.run(cmd, capture_output=True, timeout=120)
    if not process.stdout:
        raise RuntimeError("No PCM data extracted")

    bucket_ms = spec.get("params", {}).get("bucketMs", 100)
    peaks = parse_waveform_pcm(process.stdout, 44100, bucket_ms)

    return {
        "artifacts": [],
        "derived": {
            "bucketMs": bucket_ms,
            "peaks": peaks,
            "durationMs": len(peaks) * bucket_ms,
        },
    }


def handle_dead_air_detect(spec: dict, tmp_dir: str) -> dict:
    """Detect silence segments in audio."""
    job_id = spec["jobId"]
    cmd = build_ffmpeg_command_for_silence(spec)

    report_progress(job_id, 0.1, "detecting_silence")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    segments = parse_silence_output(result.stderr)

    return {
        "artifacts": [],
        "derived": {"silenceSegments": segments},
    }


def handle_thumbnails(spec: dict, tmp_dir: str) -> dict:
    """Generate thumbnails at regular intervals."""
    job_id = spec["jobId"]
    assets = spec.get("inputs", {}).get("assets", [])
    if not assets:
        raise ValueError("No assets for thumbnails")

    uri = assets[0]["uri"]
    path = _safe_uri_for_ffmpeg(uri)
    interval_ms = _to_int(spec.get("params", {}).get("intervalMs", 5000), default=5000)
    if interval_ms < 500:
        raise ValueError(f"intervalMs must be >= 500, got {interval_ms}")
    if interval_ms > 60000:
        raise ValueError(f"intervalMs must be <= 60000, got {interval_ms}")
    interval_s = interval_ms / 1000.0

    report_progress(job_id, 0.1, "generating_thumbnails")

    # Probe duration first
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True, timeout=30,
    )
    duration = float(json.loads(probe.stdout).get("format", {}).get("duration", 0))
    timestamps = []
    t = 0.0
    while t < duration:
        timestamps.append(t)
        t += interval_s

    artifacts = []
    for i, ts in enumerate(timestamps):
        out_path = os.path.join(tmp_dir, f"thumb_{i:04d}.jpg")
        subprocess.run(
            ["ffmpeg", "-ss", str(ts), "-i", path, "-vframes", "1", "-q:v", "2", "-y", out_path],
            capture_output=True, timeout=30,
        )
        if os.path.exists(out_path):
            artifacts.append({"kind": "thumbnail", "uri": out_path, "mime": "image/jpeg"})
        report_progress(job_id, 0.1 + 0.9 * (i + 1) / len(timestamps), "generating_thumbnails")

    return {"artifacts": artifacts}


def handle_subtitles_extract(spec: dict, tmp_dir: str) -> dict:
    """Extract subtitles from video."""
    assets = spec.get("inputs", {}).get("assets", [])
    if not assets:
        raise ValueError("No assets for subtitle extraction")

    uri = assets[0]["uri"]
    path = _safe_uri_for_ffmpeg(uri)
    # Validate format against allowlist to prevent path traversal
    ALLOWED_SUB_FORMATS = {"srt", "vtt", "ass", "ssa"}
    fmt = spec.get("params", {}).get("format", "srt")
    if fmt not in ALLOWED_SUB_FORMATS:
        raise ValueError(f"Unsupported subtitle format: {fmt!r}. Allowed: {', '.join(sorted(ALLOWED_SUB_FORMATS))}")
    out_path = os.path.join(tmp_dir, f"subtitles.{fmt}")

    subprocess.run(
        ["ffmpeg", "-i", path, "-map", "0:s:0", "-y", out_path],
        capture_output=True, timeout=60,
    )

    return {
        "artifacts": [{"kind": "subtitle", "uri": out_path, "mime": f"text/{fmt}"}] if os.path.exists(out_path) else [],
    }


def _calculate_keep_segments(
    silence_segments: list[tuple[float, float]],
    total_duration: float,
    buffer_seconds: float = 0.0,
) -> list[tuple[float, float]]:
    """Invert silence segments to produce keep segments.

    Args:
        silence_segments: List of (start, end) tuples in seconds, sorted by start.
        total_duration: Total duration of the media file in seconds.
        buffer_seconds: Softening buffer — shrinks silence boundaries (expands keep).

    Returns:
        List of (start, end) tuples representing portions to keep.
    """
    # Sort silence segments by start time
    sorted_silence = sorted(silence_segments, key=lambda s: s[0])

    # Apply buffer: shrink each silence segment
    buffered_silence = []
    for start, end in sorted_silence:
        buffered_start = start + buffer_seconds
        buffered_end = end - buffer_seconds
        # Only keep the silence segment if it still has positive duration after buffering
        if buffered_start < buffered_end:
            buffered_silence.append((buffered_start, buffered_end))

    # Calculate keep segments as gaps between buffered silence segments
    keep_segments = []
    current_time = 0.0

    for silence_start, silence_end in buffered_silence:
        # Add the keep segment before this silence
        if current_time < silence_start:
            keep_segments.append((current_time, silence_start))
        current_time = max(current_time, silence_end)

    # Add final keep segment if there's time remaining
    if current_time < total_duration:
        keep_segments.append((current_time, total_duration))

    return keep_segments


def _probe_media_info(input_path: str) -> dict:
    """Probe a media file for duration, frame rate, and stream types.

    Returns dict with keys:
        duration_s: float
        fps: str (e.g., "30000/1001")
        has_video: bool
        has_audio: bool
        is_vfr: bool (True if variable frame rate detected)
    """
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", input_path],
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {_sanitize_stderr(result.stderr)}")

    probe_data = json.loads(result.stdout)
    fmt = probe_data.get("format", {})
    streams = probe_data.get("streams", [])

    duration_s = float(fmt.get("duration", 0))

    # Find video and audio streams
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

    has_video = video_stream is not None
    has_audio = audio_stream is not None

    fps = "30"  # default
    is_vfr = False

    if video_stream:
        r_frame_rate = video_stream.get("r_frame_rate", "30/1")
        avg_frame_rate = video_stream.get("avg_frame_rate", r_frame_rate)
        fps = r_frame_rate

        # Detect VFR: if r_frame_rate and avg_frame_rate differ significantly
        try:
            def _eval_fraction(frac: str) -> float:
                parts = frac.split("/")
                if len(parts) == 2:
                    return float(parts[0]) / float(parts[1])
                return float(frac)

            r_fps = _eval_fraction(r_frame_rate)
            avg_fps = _eval_fraction(avg_frame_rate)
            # If they differ by more than 5%, consider it VFR
            if abs(r_fps - avg_fps) > 0.05 * r_fps:
                is_vfr = True
        except (ValueError, ZeroDivisionError):
            pass

    return {
        "duration_s": duration_s,
        "fps": fps,
        "has_video": has_video,
        "has_audio": has_audio,
        "is_vfr": is_vfr,
    }


def _build_select_aselect_cmd(
    input_path: str,
    output_path: str,
    keep_segments: list[tuple[float, float]],
    fps: str,
    has_video: bool,
    has_audio: bool,
) -> list[str]:
    """Build FFmpeg command using select/aselect + setpts for clean cuts.

    Produces between() expressions for each keep segment.
    """
    # Build between() expressions (with safe float formatting to prevent injection)
    between_exprs = [f"between(t,{_safe_float_for_ffmpeg(s)},{_safe_float_for_ffmpeg(e)})" for s, e in keep_segments]
    select_expr = "+".join(between_exprs)

    cmd = ["ffmpeg", "-i", input_path]

    if has_video:
        vf = f"select='{select_expr}',setpts=N/{fps}/TB"
        cmd.extend(["-vf", vf, "-c:v", "libx264"])

    if has_audio:
        af = f"aselect='{select_expr}',asetpts=N/SR/TB"
        cmd.extend(["-af", af, "-c:a", "aac"])

    cmd.extend(["-y", output_path])
    return cmd


def _build_trim_concat_cmd(
    input_path: str,
    output_path: str,
    keep_segments: list[tuple[float, float]],
    crossfade_seconds: float,
    has_video: bool,
    has_audio: bool,
) -> list[str]:
    """Build FFmpeg command using trim/atrim + concat with acrossfade.

    Used when crossfade is enabled or when VFR source is detected.
    """
    if len(keep_segments) == 0:
        raise ValueError("Cannot build trim+concat command with zero keep segments")

    # If only one segment, use simple trim (with safe float formatting and codecs)
    if len(keep_segments) == 1:
        start, end = keep_segments[0]
        start_str = _safe_float_for_ffmpeg(start)
        end_str = _safe_float_for_ffmpeg(end)
        cmd = ["ffmpeg", "-i", input_path]
        if has_video:
            cmd.extend(["-vf", f"trim=start={start_str}:end={end_str},setpts=PTS-STARTPTS", "-c:v", "libx264"])
        if has_audio:
            cmd.extend(["-af", f"atrim=start={start_str}:end={end_str},asetpts=PTS-STARTPTS", "-c:a", "aac"])
        cmd.extend(["-y", output_path])
        return cmd

    # Multiple segments: build filter_complex (with safe float formatting)
    filter_parts = []
    video_labels = []
    audio_labels = []

    # Trim each segment
    for i, (start, end) in enumerate(keep_segments):
        start_str = _safe_float_for_ffmpeg(start)
        end_str = _safe_float_for_ffmpeg(end)
        if has_video:
            filter_parts.append(f"[0:v]trim=start={start_str}:end={end_str},setpts=PTS-STARTPTS[v{i}]")
            video_labels.append(f"[v{i}]")
        if has_audio:
            filter_parts.append(f"[0:a]atrim=start={start_str}:end={end_str},asetpts=PTS-STARTPTS[a{i}]")
            audio_labels.append(f"[a{i}]")

    # Concatenate video (simple concat, no crossfade)
    if has_video:
        concat_v = "".join(video_labels) + f"concat=n={len(keep_segments)}:v=1:a=0[vout]"
        filter_parts.append(concat_v)

    # Concatenate audio with crossfade
    if has_audio:
        if len(audio_labels) == 1:
            # Only one audio segment, just map it directly
            filter_parts.append(f"{audio_labels[0]}anull[aout]")
        else:
            # Chain acrossfade for adjacent segments
            current_label = audio_labels[0]
            for i in range(1, len(audio_labels)):
                next_label = audio_labels[i]
                # Calculate crossfade duration (limit to BOTH segment durations)
                prev_duration = keep_segments[i - 1][1] - keep_segments[i - 1][0]
                next_duration = keep_segments[i][1] - keep_segments[i][0]
                fade_dur = min(crossfade_seconds, prev_duration, next_duration)
                if fade_dur < 0.04:
                    fade_dur = 0.0  # Skip crossfade if too short

                output_label = f"[afade{i}]" if i < len(audio_labels) - 1 else "[aout]"

                if fade_dur > 0:
                    # Use acrossfade for smooth transition
                    fade_str = _safe_float_for_ffmpeg(fade_dur, precision=3)
                    filter_parts.append(f"{current_label}{next_label}acrossfade=d={fade_str}:c1=tri:c2=tri{output_label}")
                else:
                    # Hard cut using concat
                    filter_parts.append(f"{current_label}{next_label}concat=n=2:v=0:a=1{output_label}")

                current_label = output_label

    filter_complex = ";".join(filter_parts)

    cmd = ["ffmpeg", "-i", input_path, "-filter_complex", filter_complex]

    if has_video:
        cmd.extend(["-map", "[vout]", "-c:v", "libx264"])
    if has_audio:
        cmd.extend(["-map", "[aout]", "-c:a", "aac"])

    cmd.extend(["-y", output_path])
    return cmd


def handle_dead_air_cut(spec: dict, tmp_dir: str) -> dict:
    """Cut silent segments from video/audio and concatenate remaining parts.

    Reads segments to remove from spec.params.segments.
    Applies optional softening buffer and audio crossfade.
    Returns concatenated output file as artifact.
    """
    job_id = spec["jobId"]

    # Extract inputs
    assets = spec.get("inputs", {}).get("assets", [])
    if not assets:
        raise ValueError("No assets provided for dead_air_cut")

    asset_uri = assets[0]["uri"]
    input_path = _resolve_asset_path(asset_uri, tmp_dir)

    # Extract params
    params = spec.get("params", {})
    segments = params.get("segments", [])
    mode = params.get("mode", "remove")
    softening_buffer_ms = _to_int(params.get("softeningBufferMs", 0), default=0)
    crossfade = params.get("crossfade", False)

    # Validate mode
    if mode != "remove":
        raise ValueError(f"Unsupported mode: {mode!r}. Only 'remove' is supported.")

    # Validate segment count
    if len(segments) > 500:
        raise ValueError(f"Too many segments: {len(segments)}. Maximum is 500.")

    # Clamp softening buffer
    softening_buffer_ms = max(0, min(softening_buffer_ms, 5000))
    buffer_seconds = softening_buffer_ms / 1000.0

    # Validate and cast segments
    validated_segments = []
    for seg in segments:
        start_ms = _to_int(seg.get("startMs"), default=-1)
        end_ms = _to_int(seg.get("endMs"), default=-1)

        if start_ms < 0:
            raise ValueError(f"Invalid segment: startMs must be >= 0, got {start_ms}")
        if start_ms >= end_ms:
            raise ValueError(f"Invalid segment: startMs ({start_ms}) must be < endMs ({end_ms})")

        validated_segments.append((start_ms, end_ms))

    # Sort segments and check for overlaps
    validated_segments.sort(key=lambda s: s[0])
    for i in range(1, len(validated_segments)):
        prev_end = validated_segments[i - 1][1]
        curr_start = validated_segments[i][0]
        if curr_start < prev_end:
            raise ValueError(f"Overlapping segments detected: segment {i} starts at {curr_start}ms but previous ends at {prev_end}ms")

    report_progress(job_id, 0.1, "preparing", "Validating input")

    # Handle empty segments
    if len(validated_segments) == 0:
        # No segments to remove, return input as-is
        media_info = _probe_media_info(input_path)
        original_duration_ms = int(media_info["duration_s"] * 1000)
        # Determine MIME type based on streams
        if media_info["has_video"]:
            mime_type = "video/mp4"
            kind = "video"
        else:
            mime_type = "audio/mp4"
            kind = "audio"
        return {
            "artifacts": [{"path": input_path, "kind": kind, "mime": mime_type}],
            "derived": {
                "originalDurationMs": original_duration_ms,
                "outputDurationMs": original_duration_ms,
                "removedMs": 0,
                "segmentCount": 1,
            },
        }

    # Probe the source file
    media_info = _probe_media_info(input_path)
    duration_s = media_info["duration_s"]
    duration_ms = int(duration_s * 1000)

    # Validate endMs against probed duration (with 100ms tolerance)
    for start_ms, end_ms in validated_segments:
        if end_ms > duration_ms + 100:
            raise ValueError(f"Segment endMs ({end_ms}ms) exceeds file duration ({duration_ms}ms)")

    # Convert segments to seconds for calculations
    silence_segments_s = [(start_ms / 1000.0, end_ms / 1000.0) for start_ms, end_ms in validated_segments]

    # Calculate keep segments
    keep_segments = _calculate_keep_segments(silence_segments_s, duration_s, buffer_seconds)

    if len(keep_segments) == 0:
        raise ValueError("All segments cover the entire file; no content remains to keep")

    report_progress(job_id, 0.3, "building_filter", "Building FFmpeg filter")

    # Determine output path
    output_path = os.path.join(tmp_dir, "dead_air_cut_output.mp4")

    # Choose FFmpeg approach
    use_trim_concat = crossfade or media_info["is_vfr"]

    if use_trim_concat:
        # Calculate crossfade duration
        if len(keep_segments) > 1:
            shortest_keep = min(e - s for s, e in keep_segments)
            crossfade_duration = min(buffer_seconds * 2, shortest_keep)
        else:
            crossfade_duration = 0.0

        cmd = _build_trim_concat_cmd(
            input_path,
            output_path,
            keep_segments,
            crossfade_duration,
            media_info["has_video"],
            media_info["has_audio"],
        )
    else:
        cmd = _build_select_aselect_cmd(
            input_path,
            output_path,
            keep_segments,
            media_info["fps"],
            media_info["has_video"],
            media_info["has_audio"],
        )

    report_progress(job_id, 0.4, "encoding", "Running FFmpeg")

    # Run FFmpeg
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {_sanitize_stderr(result.stderr)}")

    if not os.path.exists(output_path):
        raise RuntimeError("FFmpeg succeeded but output file was not created")

    report_progress(job_id, 0.9, "finalizing", "Finalizing output")

    # Calculate derived metadata
    original_duration_ms = duration_ms
    removed_ms = sum(end_ms - start_ms for start_ms, end_ms in validated_segments)
    output_duration_ms = original_duration_ms - removed_ms

    # Determine MIME type based on streams
    if media_info["has_video"]:
        mime_type = "video/mp4"
        kind = "video"
    else:
        mime_type = "audio/mp4"
        kind = "audio"

    return {
        "artifacts": [{"path": output_path, "kind": kind, "mime": mime_type}],
        "derived": {
            "originalDurationMs": original_duration_ms,
            "outputDurationMs": output_duration_ms,
            "removedMs": removed_ms,
            "segmentCount": len(keep_segments),
        },
    }


# ========================================
# Main Celery Task
# ========================================

def _not_implemented_handler(spec: dict, tmp_dir: str) -> dict:
    """Stub handler for not-yet-implemented job types."""
    job_type = spec.get("jobType", "unknown")
    raise NotImplementedError(
        f"Job type '{job_type}' is defined in the spec but not yet implemented."
    )


HANDLER_MAP = {
    "probe": handle_probe,
    "render_mp4_h264": handle_render_mp4,
    "waveform_peaks": handle_waveform_peaks,
    "thumbnails": handle_thumbnails,
    "dead_air_detect": handle_dead_air_detect,
    "subtitles_extract": handle_subtitles_extract,
    "render_hls": _not_implemented_handler,
    "subtitles_burnin": _not_implemented_handler,
    "concat": _not_implemented_handler,
    "dead_air_cut": handle_dead_air_cut,
    "generate_clip_from_api": _not_implemented_handler,
}


# ========================================
# DB persistence for render results
# ========================================

async def _persist_render_to_db(
    job_id: str, user_id: str, spec: dict, result: dict,
) -> None:
    """Persist a completed render to media_tasks DB for permanent Media Library visibility.

    Uses the same AsyncSessionLocal + asyncio.run() pattern as media_tasks.py.
    Best-effort: caller should catch exceptions.
    """
    from app.core.database import AsyncSessionLocal
    from app.models.media_task import MediaTask
    from datetime import datetime

    artifacts = result.get("artifacts", [])
    result_url = artifacts[0]["uri"] if artifacts else None
    original_filename = spec.get("output", {}).get("target", "render")

    # DB column id is varchar(36) — strip the "mj-" prefix to fit
    db_id = job_id[3:] if job_id.startswith("mj-") else job_id
    if len(db_id) > 36:
        db_id = db_id[:36]

    async with AsyncSessionLocal() as db:
        task = MediaTask(
            id=db_id,
            user_id=int(user_id),
            media_type="video",
            status="completed",
            model="ffmpeg-render",
            prompt=f"Video Export: {os.path.basename(original_filename)}",
            parameters={"source": "video_editor", "jobType": spec.get("jobType")},
            result_url=result_url,
            result_data=result,
            credits_used=0,
            created_at=datetime.utcnow(),
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        db.add(task)
        await db.commit()


@celery_app.task(bind=True, max_retries=2, time_limit=1800, soft_time_limit=1740)
def execute_media_job(self, spec_json: str, user_id: str, job_id: str) -> dict:
    """Execute a media job based on the Media Job Spec v0.1 contract."""

    # Skip jobs that were already canceled or errored (e.g., stale queue drain)
    try:
        current_raw = redis_client.get(f"media-job:{job_id}:status")
        if current_raw:
            current = json.loads(current_raw)
            if current.get("status") in ("canceled", "error", "done"):
                return {"skipped": True, "reason": f"Job already {current['status']}"}
    except Exception:
        pass  # If Redis check fails, proceed with the job

    tmp_dir = tempfile.mkdtemp(prefix=f"mediajob_{job_id}_")

    try:
        spec = parse_job_spec(spec_json)
        validate_job_spec_security(spec)  # SSRF, path traversal, codec, limits
        job_type = spec["jobType"]

        # Make user_id available to handlers for structured output paths
        spec["_userId"] = user_id

        report_progress(job_id, 0.0, "starting", f"Dispatching {job_type}")

        handler = HANDLER_MAP.get(job_type)
        if not handler:
            raise ValueError(f"Unsupported job type: {job_type}")

        result = handler(spec, tmp_dir)
        report_done(job_id, result)

        # Persist render to media_tasks DB for permanent Media Library visibility
        if job_type == "render_mp4_h264":
            try:
                import asyncio
                asyncio.run(_persist_render_to_db(job_id, user_id, spec, result))
            except Exception as persist_err:
                # Best-effort: render already succeeded via Redis
                import structlog
                structlog.get_logger().warning(
                    "render_db_persist_failed",
                    job_id=job_id,
                    error=str(persist_err),
                )

        return result

    except Exception as e:
        report_error(job_id, "WORKER_ERROR", str(e))
        raise

    finally:
        # Cleanup temp files (best-effort)
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass
