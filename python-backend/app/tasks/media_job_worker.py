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
    """Report job completion."""
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

    input_files: list[str] = []
    input_index: dict[str, int] = {}

    for track in tracks:
        for clip in track.get("clips", []):
            uri = asset_map.get(clip["assetId"], "")
            path = _safe_uri_for_ffmpeg(uri)
            if path not in input_index:
                input_index[path] = len(input_files)
                input_files.append(path)

    cmd = ["ffmpeg", "-y"]
    for f in input_files:
        cmd.extend(["-i", f])

    # Build filter complex
    video_clips = []
    for track in tracks:
        if track.get("type") in ("video", "overlay"):
            video_clips.extend(track.get("clips", []))

    if len(video_clips) <= 1 and len(input_files) == 1:
        # Simple case: single input
        cmd.extend(["-c:v", "libx264", "-c:a", "aac", output_target])
    else:
        # Multi-clip: build filter_complex
        filters = []
        for i, clip in enumerate(video_clips):
            uri = asset_map.get(clip["assetId"], "")
            path = _safe_uri_for_ffmpeg(uri)
            idx = input_index.get(path, 0)
            in_ms = clip.get("inMs", 0)
            out_ms = clip.get("outMs", 0)
            in_s = in_ms / 1000.0
            out_s = out_ms / 1000.0

            filters.append(f"[{idx}:v]trim=start={in_s}:end={out_s},setpts=PTS-STARTPTS[v{i}]")
            filters.append(f"[{idx}:a]atrim=start={in_s}:end={out_s},asetpts=PTS-STARTPTS[a{i}]")

        n = len(video_clips)
        concat_in = "".join(f"[v{i}][a{i}]" for i in range(n))
        filters.append(f"{concat_in}concat=n={n}:v=1:a=1[vout][aout]")

        cmd.extend(["-filter_complex", ";".join(filters)])
        cmd.extend(["-map", "[vout]", "-map", "[aout]"])
        cmd.extend(["-c:v", "libx264", "-c:a", "aac", output_target])

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
    threshold_db = params.get("thresholdDb", -40)
    min_silence_ms = params.get("minSilenceMs", 500)
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
        raise RuntimeError(f"ffprobe failed: {result.stderr[:500]}")

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
    cmd = build_ffmpeg_command_for_render(spec)

    report_progress(job_id, 0.1, "rendering", "Starting FFmpeg render")

    process = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    _, stderr = process.communicate(timeout=1800)

    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg render failed: {stderr[:500]}")

    output_target = spec.get("output", {}).get("target", "/tmp/output.mp4")
    return {
        "artifacts": [{"kind": "video", "uri": output_target, "mime": "video/mp4"}],
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
    interval_ms = spec.get("params", {}).get("intervalMs", 5000)
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
    fmt = spec.get("params", {}).get("format", "srt")
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


@celery_app.task(bind=True, max_retries=2, time_limit=1800, soft_time_limit=1740)
def execute_media_job(self, spec_json: str, user_id: str, job_id: str) -> dict:
    """Execute a media job based on the Media Job Spec v0.1 contract."""
    tmp_dir = tempfile.mkdtemp(prefix=f"mediajob_{job_id}_")

    try:
        spec = parse_job_spec(spec_json)
        validate_job_spec_security(spec)  # SSRF, path traversal, codec, limits
        job_type = spec["jobType"]

        report_progress(job_id, 0.0, "starting", f"Dispatching {job_type}")

        handler = HANDLER_MAP.get(job_type)
        if not handler:
            raise ValueError(f"Unsupported job type: {job_type}")

        result = handler(spec, tmp_dir)
        report_done(job_id, result)
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
