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
    "dead_air_cut": _not_implemented_handler,
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
