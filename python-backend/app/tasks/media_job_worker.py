"""
Media Job Worker — Celery task for executing FFmpeg-based media jobs.

Receives MediaJobSpec JSON from the Node.js server, dispatches to the correct
handler, and reports progress via application-owned Redis keys.
"""

import json
import asyncio
import os
import re
import shutil
import struct
import subprocess
import tempfile
from typing import Any
from urllib.parse import urlparse

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
    "transcode_h264",
    "extract_audio",
}


# ========================================
# Validation
# ========================================

def _resolve_media_binary(binary: str) -> str | None:
    resolved = shutil.which(binary)
    if resolved:
        return resolved

    for candidate in (
        f"/usr/bin/{binary}",
        f"/usr/local/bin/{binary}",
        f"/opt/homebrew/bin/{binary}",
        f"/home/dev/.local/bin/{binary}",
        f"/home/appuser/.local/bin/{binary}",
    ):
        if os.path.exists(candidate):
            bin_dir = os.path.dirname(candidate)
            os.environ["PATH"] = f"{bin_dir}:{os.environ.get('PATH', '')}"
            return candidate
    return None


def _validate_ffmpeg():
    """Check ffmpeg and ffprobe are available. Called at import time."""
    for binary in ("ffmpeg", "ffprobe"):
        if not _resolve_media_binary(binary):
            import warnings
            warnings.warn(f"{binary} not found in PATH. Media jobs will fail.")


_validate_ffmpeg()

SHELL_METACHAR_RE = re.compile(r"[;|&`$(){}><]")
URI_QUERY_SHELL_METACHAR_RE = re.compile(r"[;|`$(){}><]")

# Strip all ASCII control characters (0x00-0x1f, 0x7f) for safe log/error output
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")
_HEX_COLOR_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")


def _safe_storage_component(value: str, field: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(value).strip())
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError(f"{field} is required for durable media storage")
    return cleaned[:128]


def _store_final_output_in_r2(
    spec: dict,
    output_path: str,
    artifact_kind: str,
    content_type: str,
    extension: str,
) -> tuple[str, str]:
    """Upload a completed worker output and return the protected Node proxy URL.

    Local disk is used only as FFmpeg's working area. A completed artifact is
    never published as a Python FileResponse URL.
    """
    tenant_id = str(spec.get("tenantId") or spec.get("tenant_id") or "").strip()
    user_id = str(spec.get("_userId") or "").strip()
    job_id = str(spec.get("jobId") or "").strip()
    if not tenant_id or not user_id or not job_id:
        raise ValueError("tenantId, userId and jobId are required for durable media storage")
    from app.services.generation.r2_storage import get_r2_storage

    key = "/".join([
        "media-jobs",
        _safe_storage_component(tenant_id, "tenantId"),
        _safe_storage_component(user_id, "userId"),
        _safe_storage_component(job_id, "jobId"),
        f"{_safe_storage_component(artifact_kind, 'artifactKind')}{extension}",
    ])
    asyncio.run(get_r2_storage().upload_file(output_path, key, content_type=content_type))
    return f"/api/storage/files/{key}", key

_RENDER_FONT_WHITELIST = {
    "Noto Sans": "Noto Sans",
    "Noto Sans Thai": "Noto Sans Thai",
    "Roboto": "Roboto",
    "Open Sans": "Open Sans",
    "Lato": "Lato",
    "Montserrat": "Montserrat",
    "Poppins": "Poppins",
    "Ubuntu": "Ubuntu",
}


def _uri_contains_unsafe_shell_metacharacters(uri: str) -> bool:
    """Allow signed URL query delimiters while still blocking shell syntax."""
    parsed = urlparse(uri)
    shell_checked_uri = parsed._replace(query="").geturl()
    return bool(
        SHELL_METACHAR_RE.search(shell_checked_uri)
        or URI_QUERY_SHELL_METACHAR_RE.search(parsed.query)
    )


_DEFAULT_RENDER_FONT = "Noto Sans"
_EDGE_BLEED_CROP_FILTER = "crop=trunc(iw*0.988/2)*2:trunc(ih*0.988/2)*2:(iw-ow)/2:(ih-oh)/2"


def _to_int(val: Any, default: int = 0) -> int:
    """Safely coerce a value to int. Handles None, str, float, inf, and invalid types."""
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError, OverflowError):
        return default


def _to_float(val: Any, default: float = 0.0) -> float:
    """Safely coerce a value to float. Handles None, str, and invalid types."""
    if val is None:
        return default
    try:
        num = float(val)
        if num != num:  # NaN
            return default
        return num
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


def _resolve_clip_transform(clip: dict) -> tuple[float, float, float, float]:
    """Read clip-level static transform with safe defaults and clamps.

    Returns:
        (x, y, scale_x, scale_y)
    """
    transform = clip.get("transform") or {}
    x = min(1.0, max(0.0, _to_float(transform.get("x"), 0.5)))
    y = min(1.0, max(0.0, _to_float(transform.get("y"), 0.5)))
    scale_x = min(5.0, max(0.1, _to_float(transform.get("scaleX"), 1.0)))
    scale_y = min(5.0, max(0.1, _to_float(transform.get("scaleY"), 1.0)))
    return x, y, scale_x, scale_y


def _clip_has_non_default_transform(clip: dict, eps: float = 1e-3) -> bool:
    """Whether the clip has a non-default static transform or keyframes."""
    transform = clip.get("transform")
    if not isinstance(transform, dict):
        return False

    keyframes = transform.get("keyframes")
    if isinstance(keyframes, list) and len(keyframes) > 0:
        return True

    x, y, scale_x, scale_y = _resolve_clip_transform(clip)
    return (
        abs(x - 0.5) > eps
        or abs(y - 0.5) > eps
        or abs(scale_x - 1.0) > eps
        or abs(scale_y - 1.0) > eps
    )


def _clip_playback_rate(clip: dict) -> float:
    """Resolve a safe clip playback rate for preview/render parity."""
    rate = _to_float(clip.get("playbackRate"), 1.0)
    if rate <= 0:
        rate = 1.0
    return min(2.0, max(0.5, rate))


def _clip_volume(clip: dict) -> float:
    """Resolve a safe clip volume for preview/render parity."""
    if bool(clip.get("mute")):
        return 0.0
    volume = _to_float(clip.get("volume"), 1.0)
    return min(2.0, max(0.0, volume))


def _clip_source_duration_seconds(clip: dict, asset_duration_map: dict[str, Any]) -> float:
    """Duration consumed from source media before playback speed is applied."""
    in_ms = _to_int(clip.get("inMs"))
    out_ms = _to_int(clip.get("outMs"))
    if in_ms != 0 or out_ms != 0:
        return max(0.001, (out_ms - in_ms) / 1000.0)

    asset_dur_ms = _to_int(asset_duration_map.get(clip.get("assetId", ""), 0))
    if asset_dur_ms > 0:
        return max(0.001, asset_dur_ms / 1000.0)

    duration_ms = _to_int(clip.get("durationMs"))
    if duration_ms > 0:
        return max(0.001, (duration_ms / 1000.0) * _clip_playback_rate(clip))

    return 0.001


def _clip_timeline_duration_seconds(clip: dict, asset_duration_map: dict[str, Any]) -> float:
    """Visible timeline duration after playback speed is applied."""
    duration_ms = _to_int(clip.get("durationMs"))
    if duration_ms > 0:
        return max(0.001, duration_ms / 1000.0)
    return max(0.001, _clip_source_duration_seconds(clip, asset_duration_map) / _clip_playback_rate(clip))


def _project_timeline_duration_seconds(tracks: list[dict], asset_duration_map: dict[str, Any]) -> float:
    """Return the max end time across all timeline clips."""
    max_end = 0.001
    for track in tracks:
        for clip in track.get("clips", []):
            start_s = _to_int(clip.get("startMs"), default=0) / 1000.0
            duration_s = _clip_timeline_duration_seconds(clip, asset_duration_map)
            max_end = max(max_end, start_s + duration_s)
    return max_end


def _atempo_filter_chain(rate: float) -> str:
    """Build a safe FFmpeg atempo chain for playback speed changes."""
    if abs(rate - 1.0) < 1e-3:
        return ""

    parts: list[str] = []
    remaining = rate
    while remaining > 2.0:
        parts.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5:
        parts.append("atempo=0.5")
        remaining /= 0.5

    parts.append(f"atempo={_safe_float_for_ffmpeg(remaining)}")
    return ",".join(parts)


def _safe_clip_id(clip: dict, max_len: int = 50) -> str:
    """Return a log-safe clip ID stripped of all control characters."""
    raw = str(clip.get("clipId", "?"))[:max_len]
    return _CONTROL_CHAR_RE.sub("", raw)


def _resolve_render_font_family(font_family: str | None) -> tuple[str, bool]:
    """Resolve to strict whitelist for deterministic render parity."""
    if isinstance(font_family, str) and font_family in _RENDER_FONT_WHITELIST:
        return _RENDER_FONT_WHITELIST[font_family], False
    return _DEFAULT_RENDER_FONT, True


def _ass_escape_text(text: str) -> str:
    """Escape ASS dialogue text safely."""
    return (
        text.replace("\\", "\\\\")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace(",", r"\,")
        .replace("\r", "")
        .replace("\n", r"\N")
    )


def _drawtext_escape_text(text: str) -> str:
    """Escape drawtext text value safely."""
    return (
        text.replace("\\", r"\\")
        .replace(":", r"\:")
        .replace("'", r"\'")
        .replace("[", r"\[")
        .replace("]", r"\]")
        .replace("%", r"\%")
        .replace("\r", "")
        .replace("\n", r"\n")
    )


def _ass_color_from_hex(hex_color: str | None) -> str:
    """Convert #RRGGBB to ASS BGR format (&H00BBGGRR)."""
    if not isinstance(hex_color, str):
        return "&H00FFFFFF"
    m = _HEX_COLOR_RE.match(hex_color)
    if not m:
        return "&H00FFFFFF"
    raw = m.group(1)
    r = int(raw[0:2], 16)
    g = int(raw[2:4], 16)
    b = int(raw[4:6], 16)
    return f"&H00{b:02X}{g:02X}{r:02X}"


def _resolve_drawtext_color(hex_color: Any) -> str:
    """Resolve drawtext color to strict #RRGGBB format."""
    if not isinstance(hex_color, str):
        return "#FFFFFF"
    match = _HEX_COLOR_RE.match(hex_color)
    if not match:
        return "#FFFFFF"
    return f"#{match.group(1).upper()}"


def _seconds_to_ass_timestamp(seconds: float) -> str:
    """Format seconds as H:MM:SS.CS for ASS."""
    cs_total = max(0, int(round(seconds * 100)))
    h = cs_total // 360000
    rem = cs_total % 360000
    m = rem // 6000
    rem = rem % 6000
    s = rem // 100
    cs = rem % 100
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _extract_text_clips_for_render(project: dict) -> list[dict]:
    """Extract ordered text clips from subtitle/text-capable tracks."""
    tracks = project.get("tracks", []) if isinstance(project, dict) else []
    ordered: list[tuple[int, int, int, dict]] = []
    for track_idx, track in enumerate(tracks):
        track_type = track.get("type")
        if track_type not in ("subtitle", "text", "video", "overlay"):
            continue
        clips = track.get("clips", [])
        for clip_idx, clip in enumerate(clips):
            if not isinstance(clip.get("textConfig"), dict):
                continue
            start_ms = _to_int(clip.get("startMs"), default=0)
            out_ms = _to_int(clip.get("outMs"), default=0)
            z_order = _to_int(clip.get("zOrder"), default=clip_idx)
            normalized = dict(clip)
            normalized["startMs"] = max(0, start_ms)
            normalized["outMs"] = max(normalized["startMs"] + 1, out_ms)
            ordered.append((normalized["startMs"], z_order, track_idx * 100000 + clip_idx, normalized))
    ordered.sort(key=lambda item: (item[0], item[1], item[2]))
    return [item[3] for item in ordered]


def _evaluate_drawtext_fast_path(text_clips: list[dict]) -> dict[str, Any]:
    """Strict equivalence gate for drawtext fast-path."""
    if not text_clips:
        return {"eligible": False, "reason": "no_text_clips"}

    for clip in text_clips:
        config = clip.get("textConfig")
        if not isinstance(config, dict):
            return {"eligible": False, "reason": "missing_text_config"}

        text = str(config.get("text", ""))
        if "\n" in text or "\r" in text:
            return {"eligible": False, "reason": "multiline_text"}

        if config.get("effect", "none") != "none":
            return {"eligible": False, "reason": "unsupported_effect"}

        _font, used_fallback = _resolve_render_font_family(config.get("fontFamily"))
        if used_fallback:
            return {"eligible": False, "reason": "font_unresolved"}

        transform = clip.get("transform") or {}
        keyframes = transform.get("keyframes")
        if isinstance(keyframes, list) and len(keyframes) > 0:
            return {"eligible": False, "reason": "animated_transform"}

        scale_x = _to_float(transform.get("scaleX"), 1.0)
        scale_y = _to_float(transform.get("scaleY"), 1.0)
        rotation = _to_float(transform.get("rotation"), 0.0)
        opacity = _to_float(transform.get("opacity"), 1.0)
        if abs(scale_x - 1.0) > 1e-3 or abs(scale_y - 1.0) > 1e-3:
            return {"eligible": False, "reason": "unsupported_scale"}
        if abs(rotation) > 1e-3:
            return {"eligible": False, "reason": "unsupported_rotation"}
        if opacity < 0.999:
            return {"eligible": False, "reason": "unsupported_opacity"}

        background_color = str(config.get("backgroundColor", "transparent")).lower()
        if background_color not in ("transparent", "none", ""):
            return {"eligible": False, "reason": "unsupported_background"}

    return {"eligible": True, "reason": "accepted_equivalent"}


def _generate_ass_document(text_clips: list[dict], width: int, height: int) -> str:
    """Generate deterministic ASS content for canonical text render path."""
    header = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        f"PlayResX: {max(1, width)}",
        f"PlayResY: {max(1, height)}",
        "",
        "[V4+ Styles]",
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
        "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,"
        "Alignment,MarginL,MarginR,MarginV,Encoding",
    ]

    styles: list[str] = []
    dialogues: list[str] = []

    for idx, clip in enumerate(text_clips):
        cfg = clip.get("textConfig", {})
        transform = clip.get("transform") or {}
        font_name, _ = _resolve_render_font_family(cfg.get("fontFamily"))
        style_name = f"Style{idx}"
        font_size = max(8, min(256, _to_int(cfg.get("fontSize"), default=48)))
        bold = 1 if _to_int(cfg.get("fontWeight"), default=400) >= 600 else 0
        italic = 1 if str(cfg.get("fontStyle", "normal")).lower() == "italic" else 0
        primary = _ass_color_from_hex(cfg.get("color"))
        effect = str(cfg.get("effect", "none"))
        custom_stroke = str(cfg.get("textStroke", "") or "")
        custom_shadow = str(cfg.get("textShadow", "") or "")
        if custom_stroke:
            outline = 3
            shadow = 0
        elif effect == "outline":
            outline = 2
            shadow = 0
        elif effect == "shadow":
            outline = 1
            shadow = 2
        elif effect == "glow" or (custom_shadow and custom_shadow.lower() != "none"):
            outline = 1
            shadow = 3
        else:
            outline = 0
            shadow = 0
        align_map = {"left": 1, "center": 2, "right": 3}
        alignment = align_map.get(str(cfg.get("textAlign", "center")).lower(), 2)
        styles.append(
            f"Style: {style_name},{font_name},{font_size},{primary},{primary},&H00000000,&H00000000,"
            f"{bold},{italic},0,0,100,100,{_to_float(cfg.get('letterSpacing'), 0.0)},0,1,{outline},{shadow},{alignment},20,20,20,1"
        )

        start_s = _to_int(clip.get("startMs"), default=0) / 1000.0
        end_s = _to_int(clip.get("outMs"), default=0) / 1000.0
        if end_s <= start_s:
            end_s = start_s + 0.001
        start_ts = _seconds_to_ass_timestamp(start_s)
        end_ts = _seconds_to_ass_timestamp(end_s)
        x = int(round(max(0.0, min(1.0, _to_float(transform.get("x"), 0.5))) * width))
        y = int(round(max(0.0, min(1.0, _to_float(transform.get("y"), 0.5))) * height))
        text = _ass_escape_text(str(cfg.get("text", "")))
        dialogues.append(
            f"Dialogue: 0,{start_ts},{end_ts},{style_name},,0,0,0,,{{\\pos({x},{y})}}{text}"
        )

    event_header = [
        "",
        "[Events]",
        "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ]
    return "\n".join(header + styles + event_header + dialogues) + "\n"


def _build_drawtext_filter(text_clips: list[dict], width: int, height: int) -> str:
    """Build deterministic drawtext filter chain for strict fast-path inputs."""
    filters: list[str] = []
    for clip in text_clips:
        cfg = clip.get("textConfig", {})
        transform = clip.get("transform") or {}
        font_name, _ = _resolve_render_font_family(cfg.get("fontFamily"))
        text = _drawtext_escape_text(str(cfg.get("text", "")))
        start_s = _to_int(clip.get("startMs"), default=0) / 1000.0
        end_s = _to_int(clip.get("outMs"), default=0) / 1000.0
        if end_s <= start_s:
            end_s = start_s + 0.001
        x = int(round(max(0.0, min(1.0, _to_float(transform.get("x"), 0.5))) * width))
        y = int(round(max(0.0, min(1.0, _to_float(transform.get("y"), 0.5))) * height))
        size = max(8, min(256, _to_int(cfg.get("fontSize"), default=48)))
        color = _resolve_drawtext_color(cfg.get("color"))
        filters.append(
            "drawtext="
            f"font='{font_name}':"
            f"text='{text}':"
            f"x={x}:y={y}:"
            f"fontsize={size}:"
            f"fontcolor={color}:"
            f"enable='between(t,{start_s:.1f},{end_s:.1f})'"
        )
    return ",".join(filters)


def _build_subtitles_filter(ass_path: str) -> str:
    """Build subtitles filter with ffmpeg-safe path escaping."""
    escaped = ass_path.replace("\\", r"\\").replace(":", r"\:").replace("'", r"\'")
    return f"subtitles='{escaped}'"


def _parse_major_version(version: str | None) -> int | None:
    if not isinstance(version, str):
        return None
    major_raw = version.split(".", 1)[0]
    try:
        parsed = int(major_raw)
        if parsed < 0:
            return None
        return parsed
    except (TypeError, ValueError):
        return None


def _resolve_version_policy_outcome(project: dict, text_clip_count: int) -> str:
    """Resolve compatibility telemetry outcome for render diagnostics."""
    contract_version = str(project.get("contractVersion", "1.0"))
    policy = (
        project.get("compatibilityPolicy", {}).get("unsupportedContractPolicy")
        if isinstance(project.get("compatibilityPolicy"), dict)
        else "reject_with_clear_error"
    ) or "reject_with_clear_error"
    requested_major = _parse_major_version(contract_version)
    supported_major = 1

    if requested_major is None:
        return "invalid_contract_version"
    if requested_major <= supported_major:
        return "supported"
    if policy == "gated_downgrade" and text_clip_count == 0:
        return "gated_downgrade_no_text"
    if policy == "gated_downgrade" and text_clip_count > 0:
        return "unsupported_with_text_rejected"
    return "unsupported_rejected"


def _build_text_render_telemetry(
    project: dict,
    text_clips: list[dict],
    strategy: str,
    fast_path: dict[str, Any],
    job_id: str,
) -> dict[str, Any]:
    """Build deterministic render telemetry for text-font and version policy outcomes."""
    font_resolution: list[dict[str, Any]] = []
    fallback_count = 0
    for clip in text_clips:
        cfg = clip.get("textConfig", {})
        requested = cfg.get("fontFamily") if isinstance(cfg.get("fontFamily"), str) else ""
        resolved, fallback = _resolve_render_font_family(requested)
        if fallback:
            fallback_count += 1
        font_resolution.append(
            {
                "clipId": str(clip.get("clipId", "")),
                "requested": requested,
                "resolved": resolved,
                "fallback": fallback,
            }
        )

    return {
        "jobId": job_id,
        "strategy": strategy,
        "assApplied": strategy == "ass",
        "fastPathEligible": bool(fast_path.get("eligible")),
        "fastPathReason": str(fast_path.get("reason", "unknown")),
        "fontFallbackCount": fallback_count,
        "fontResolution": font_resolution,
        "textClipCount": len(text_clips),
        "versionPolicyOutcome": _resolve_version_policy_outcome(project, len(text_clips)),
    }


def _evaluate_text_render_alerts(window: dict[str, Any]) -> dict[str, Any]:
    """Evaluate text-render alert triggers for a 15-minute observability window."""
    def _read_env_float(name: str, default: float, minimum: float = 0.0) -> float:
        raw = os.getenv(name)
        if raw is None:
            return default
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return default
        if value < minimum:
            return default
        return value

    def _read_env_int(name: str, default: int, minimum: int = 0) -> int:
        raw = os.getenv(name)
        if raw is None:
            return default
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return default
        if value < minimum:
            return default
        return value

    thresholds = {
        "failureRate15m": _read_env_float("TEXT_RENDER_ALERT_FAILURE_RATE_15M", 0.005),
        "parityErrorRate15m": _read_env_float("TEXT_RENDER_ALERT_PARITY_ERROR_RATE_15M", 0.005),
        "fastPathMisclassificationCount15m": _read_env_int(
            "TEXT_RENDER_ALERT_FASTPATH_MISCLASSIFICATION_COUNT_15M", 3
        ),
    }

    failure_rate = float(window.get("failureRate15m", 0.0) or 0.0)
    parity_error_rate = float(window.get("parityErrorRate15m", 0.0) or 0.0)
    misclassification_count = int(window.get("fastPathMisclassificationCount15m", 0) or 0)

    alerts: list[str] = []
    if failure_rate > thresholds["failureRate15m"]:
        alerts.append("text_render_failure_rate_above_slo")
    if parity_error_rate > thresholds["parityErrorRate15m"]:
        alerts.append("text_render_parity_budget_exceeded")
    if misclassification_count >= thresholds["fastPathMisclassificationCount15m"]:
        alerts.append("text_render_fast_path_misclassification_spike")

    return {
        "triggered": len(alerts) > 0,
        "alerts": alerts,
        "window": {
            "failureRate15m": failure_rate,
            "parityErrorRate15m": parity_error_rate,
            "fastPathMisclassificationCount15m": misclassification_count,
        },
        "thresholds": thresholds,
    }


def _evaluate_text_rollback_health(indicators: dict[str, Any]) -> dict[str, Any]:
    """Validate rollback checklist indicators for text-render incidents."""
    checks = {
        "legacy_projects_load_save_ok": bool(indicators.get("legacyProjectsLoadSaveOk")),
        "non_text_render_success_rate_ok": bool(indicators.get("nonTextRenderSuccessRateOk")),
        "text_feature_disabled": bool(indicators.get("textFeatureDisabled")),
    }
    return {
        "healthy": all(checks.values()),
        "checks": checks,
    }


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
        if _uri_contains_unsafe_shell_metacharacters(uri):
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
    done_status = {"jobId": job_id, "status": "done", "progress": 1.0, "result": result}
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
    validate_uri_no_ssrf(uri, allow_query_metacharacters=True)
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
    validate_uri_no_ssrf(uri, allow_query_metacharacters=True)
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


def _has_audio_stream(uri: str, runner=None) -> bool:
    """Probe whether an input file has at least one audio stream.

    Uses ffprobe with a short timeout. Returns False on any error
    (missing audio, network issue, etc.) so the caller generates silence.
    """
    try:
        cmd = [
            "ffprobe", "-v", "quiet",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            uri,
        ]
        if runner:
            result = runner.run_command_sync(cmd, timeout=15)
        else:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return "audio" in result.stdout
    except Exception:
        return False


def _probe_video_size(uri: str) -> tuple[int, int] | None:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0:s=x",
                uri,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            return None
        match = re.match(r"^\s*(\d+)x(\d+)\s*$", result.stdout.strip())
        if not match:
            return None
        return int(match.group(1)), int(match.group(2))
    except Exception:
        return None


def _detect_letterbox_crop_filter(uri: str, runner=None) -> str | None:
    """Detect embedded matte borders and return an FFmpeg crop filter.

    Provider-generated vertical clips can be 9:16 at the container level while
    still carrying matte bars inside the frame. The editor render step should
    remove those source bars before scale/pad so the final export fills the
    vertical canvas.
    """
    if runner is not None:
        # Remote/abstract runners may not support binary rawvideo capture.
        return None

    size = _probe_video_size(uri)
    if not size:
        return None
    width, height = size
    if width <= 0 or height <= 0:
        return None

    sample_w, sample_h = 72, 128
    raw_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".gray", delete=False) as tmp:
            raw_path = tmp.name
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-ss", "4",
                "-i", uri,
                "-frames:v", "1",
                "-vf", f"scale={sample_w}:{sample_h},format=gray",
                "-f", "rawvideo",
                raw_path,
            ],
            capture_output=True,
            timeout=20,
        )
        if result.returncode != 0:
            return None
        with open(raw_path, "rb") as fh:
            frame = fh.read()
        if len(frame) < sample_w * sample_h:
            return None

        def is_matte_pixel(value: int) -> bool:
            return value < 24 or value > 232

        def matte_fraction(values) -> float:
            values_list = list(values)
            if not values_list:
                return 0.0
            return sum(1 for value in values_list if is_matte_pixel(value)) / len(values_list)

        rows = [
            matte_fraction(frame[row * sample_w:(row + 1) * sample_w])
            for row in range(sample_h)
        ]
        cols = [
            matte_fraction(frame[row * sample_w + col] for row in range(sample_h))
            for col in range(sample_w)
        ]

        def is_matte_edge(value: float) -> bool:
            return value >= 0.88

        top_rows = 0
        while top_rows < sample_h and is_matte_edge(rows[top_rows]):
            top_rows += 1
        bottom_rows = 0
        while bottom_rows < sample_h and is_matte_edge(rows[sample_h - 1 - bottom_rows]):
            bottom_rows += 1
        left_cols = 0
        while left_cols < sample_w and is_matte_edge(cols[left_cols]):
            left_cols += 1
        right_cols = 0
        while right_cols < sample_w and is_matte_edge(cols[sample_w - 1 - right_cols]):
            right_cols += 1

        top_px = int(round((top_rows / sample_h) * height))
        bottom_px = int(round((bottom_rows / sample_h) * height))
        left_px = int(round((left_cols / sample_w) * width))
        right_px = int(round((right_cols / sample_w) * width))
        # Keep crop dimensions even for yuv420p compatibility.
        top_px -= top_px % 2
        bottom_px -= bottom_px % 2
        left_px -= left_px % 2
        right_px -= right_px % 2
        if top_px + bottom_px < max(2, int(height * 0.003)):
            top_px = 0
            bottom_px = 0
        if left_px + right_px < max(2, int(width * 0.003)):
            left_px = 0
            right_px = 0

        if top_px + bottom_px == 0 and left_px + right_px == 0:
            return None

        crop_w = width - left_px - right_px
        crop_h = height - top_px - bottom_px
        if crop_w <= 0 or crop_w < int(width * 0.65):
            return None
        if crop_h <= 0 or crop_h < int(height * 0.65):
            return None
        crop_w -= crop_w % 2
        crop_h -= crop_h % 2
        crop_w_expr = "iw" if left_px == 0 and right_px == 0 else str(crop_w)
        crop_h_expr = "ih" if top_px == 0 and bottom_px == 0 else str(crop_h)
        return f"crop={crop_w_expr}:{crop_h_expr}:{left_px}:{top_px}"
    except Exception:
        return None
    finally:
        if raw_path:
            try:
                os.unlink(raw_path)
            except OSError:
                pass


def _build_cover_normalize_filter(
    width: int,
    height: int,
    fps: int,
    source_crop_filter: str | None = None,
) -> str:
    """Normalize every source clip to the exact output canvas without padding."""
    prefix = f"{source_crop_filter}," if source_crop_filter else ""
    guard_px = max(6, min(16, int(round(min(width, height) * 0.01))))
    guard_px += guard_px % 2
    guard_w = max(2, width - (guard_px * 2))
    guard_h = max(2, height - (guard_px * 2))
    guard_w -= guard_w % 2
    guard_h -= guard_h % 2
    return (
        prefix
        + _EDGE_BLEED_CROP_FILTER + ","
        + f"fps={fps},"
        + f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        + f"crop={width}:{height}:(iw-{width})/2:(ih-{height})/2,"
        + f"crop={guard_w}:{guard_h}:{guard_px}:{guard_px},"
        + f"scale={width}:{height},"
        + "setsar=1,format=yuv420p"
    )


def build_ffmpeg_command_for_render(spec: dict, runner=None) -> list[str]:
    """Build FFmpeg render command from timeline."""
    project = spec.get("inputs", {}).get("project")
    if not project:
        raise ValueError("No project/timeline for render")

    output_target = spec.get("output", {}).get("target", "/tmp/output.mp4")
    tracks = project.get("tracks", [])

    # Collect input files from assets
    assets = spec.get("inputs", {}).get("assets", [])
    asset_map = {a["assetId"]: a["uri"] for a in assets}
    asset_kind_map = {a["assetId"]: a.get("kind", "") for a in assets}
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
                if asset_kind_map.get(clip["assetId"]) == "image" or _is_image_uri(uri):
                    image_inputs.add(idx)
                    silent_inputs.add(idx)
                elif not _has_audio_stream(path, runner=runner):
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
    audio_clips = []
    for track in tracks:
        if track.get("type") in ("video", "overlay"):
            video_clips.extend(track.get("clips", []))
        elif track.get("type") == "audio":
            audio_clips.extend(track.get("clips", []))
    if not video_clips:
        raise ValueError("No video clips found for render")

    if video_clips:
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
        video_audio_output_label = "aoutv" if audio_clips else "aout"
        # Trim each clip (video + audio)
        for i, clip in enumerate(video_clips):
            uri = asset_map.get(clip["assetId"], "")
            path = _safe_uri_for_ffmpeg(uri)
            idx = input_index.get(path, 0)
            in_s = _to_int(clip.get("inMs")) / 1000.0
            out_s = _to_int(clip.get("outMs")) / 1000.0
            rate = _clip_playback_rate(clip)
            rate_s = _safe_float_for_ffmpeg(rate)
            timing_setpts = f"setpts=(PTS-STARTPTS)/{rate_s}" if abs(rate - 1.0) > 1e-3 else "setpts=PTS-STARTPTS"
            atempo_chain = _atempo_filter_chain(rate)
            clip_source_dur = _clip_source_duration_seconds(clip, asset_duration_map)
            clip_timeline_dur = _clip_timeline_duration_seconds(clip, asset_duration_map)
            clip_timeline_dur_s = _safe_float_for_ffmpeg(clip_timeline_dur)
            has_source_trim = in_s > 0 or out_s > 0
            has_source_duration_bound = (
                _to_int(asset_duration_map.get(clip.get("assetId", ""), 0)) > 0
                or _to_int(clip.get("durationMs")) > 0
            )

            # Video filter: trim + fps + cover-normalize + format
            # fps normalizes framerate AND timebase (required for xfade)
            # cover-normalize fills the exact canvas so no letterbox/pillarbox is generated.
            source_crop_filter = _detect_letterbox_crop_filter(path, runner=runner)
            normalize_chain = _build_cover_normalize_filter(
                proj_w,
                proj_h,
                proj_fps,
                source_crop_filter,
            )
            if has_source_trim:
                video_chain = f"[{idx}:v]trim=start={in_s}:end={out_s},{timing_setpts}"
            elif has_source_duration_bound:
                video_chain = f"[{idx}:v]trim=start=0:end={clip_source_dur},{timing_setpts}"
            else:
                video_chain = f"[{idx}:v]{timing_setpts}"
            filters.append(
                f"{video_chain},{normalize_chain},"
                f"trim=0:{clip_timeline_dur_s},setpts=PTS-STARTPTS[vnorm{i}]"
            )

            # Audio filter — generate silence for muted clips or inputs without audio streams
            volume = _clip_volume(clip)
            if volume <= 1e-6 or idx in silent_inputs:
                filters.append(
                    f"anullsrc=r=48000:cl=stereo[_sil{i}];"
                    f"[_sil{i}]atrim=0:{clip_timeline_dur_s},asetpts=PTS-STARTPTS[a{i}]"
                )
            elif has_source_trim:
                audio_chain = f"[{idx}:a]atrim=start={in_s}:end={out_s},asetpts=PTS-STARTPTS"
                if atempo_chain:
                    audio_chain += f",{atempo_chain}"
                if abs(volume - 1.0) > 1e-3:
                    audio_chain += f",volume={_safe_float_for_ffmpeg(volume)}"
                filters.append(
                    f"{audio_chain},apad,atrim=0:{clip_timeline_dur_s},"
                    f"asetpts=PTS-STARTPTS[a{i}]"
                )
            elif has_source_duration_bound:
                audio_chain = f"[{idx}:a]atrim=start=0:end={clip_source_dur},asetpts=PTS-STARTPTS"
                if atempo_chain:
                    audio_chain += f",{atempo_chain}"
                if abs(volume - 1.0) > 1e-3:
                    audio_chain += f",volume={_safe_float_for_ffmpeg(volume)}"
                filters.append(
                    f"{audio_chain},apad,atrim=0:{clip_timeline_dur_s},"
                    f"asetpts=PTS-STARTPTS[a{i}]"
                )
            else:
                audio_chain = f"[{idx}:a]asetpts=PTS-STARTPTS"
                if atempo_chain:
                    audio_chain += f",{atempo_chain}"
                if abs(volume - 1.0) > 1e-3:
                    audio_chain += f",volume={_safe_float_for_ffmpeg(volume)}"
                filters.append(
                    f"{audio_chain},apad,atrim=0:{clip_timeline_dur_s},"
                    f"asetpts=PTS-STARTPTS[a{i}]"
                )

            # Clip transform (static pan/zoom per clip)
            # 1) Scale normalized clip by user zoom.
            # 2) Composite onto a black frame at user-selected center position.
            x, y, scale_x, scale_y = _resolve_clip_transform(clip)
            scaled_w = max(2, int(round(proj_w * scale_x)))
            scaled_h = max(2, int(round(proj_h * scale_y)))
            x_s = _safe_float_for_ffmpeg(x)
            y_s = _safe_float_for_ffmpeg(y)
            d_s = _safe_float_for_ffmpeg(clip_timeline_dur)

            filters.append(f"[vnorm{i}]scale={scaled_w}:{scaled_h}[vscaled{i}]")
            filters.append(f"color=c=black:s={proj_w}x{proj_h}:d={d_s}[vbg{i}]")
            filters.append(
                f"[vbg{i}][vscaled{i}]overlay="
                f"x=(main_w*{x_s})-(overlay_w/2):"
                f"y=(main_h*{y_s})-(overlay_h/2):"
                f"eof_action=pass,format=yuv420p[v{i}]"
            )

        n = len(video_clips)

        if not has_transitions:
            # No transitions: simple concat
            concat_in = "".join(f"[v{i}][a{i}]" for i in range(n))
            filters.append(f"{concat_in}concat=n={n}:v=1:a=1[vout][{video_audio_output_label}]")
        else:
            # Build chained xfade (video) + acrossfade (audio)
            # Calculate clip durations in seconds (without mutating spec)
            clip_durations = []
            for clip in video_clips:
                clip_durations.append(_clip_timeline_duration_seconds(clip, asset_duration_map))

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

                out_label = video_audio_output_label if i == n - 1 else f"at{i}"

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

        if audio_clips:
            project_duration_s = _safe_float_for_ffmpeg(
                _project_timeline_duration_seconds(tracks, asset_duration_map)
            )
            audio_mix_labels = [video_audio_output_label]

            for j, clip in enumerate(audio_clips):
                volume = _clip_volume(clip)
                if volume <= 1e-6:
                    continue

                uri = asset_map.get(clip["assetId"], "")
                path = _safe_uri_for_ffmpeg(uri)
                idx = input_index.get(path, 0)
                in_s = _to_int(clip.get("inMs")) / 1000.0
                out_s = _to_int(clip.get("outMs")) / 1000.0
                rate = _clip_playback_rate(clip)
                atempo_chain = _atempo_filter_chain(rate)
                clip_source_dur = _clip_source_duration_seconds(clip, asset_duration_map)
                clip_timeline_dur = _clip_timeline_duration_seconds(clip, asset_duration_map)
                clip_timeline_dur_s = _safe_float_for_ffmpeg(clip_timeline_dur)
                delay_ms = max(0, _to_int(clip.get("startMs"), default=0))
                out_label = f"exta{j}"
                has_source_trim = in_s > 0 or out_s > 0
                has_source_duration_bound = (
                    _to_int(asset_duration_map.get(clip.get("assetId", ""), 0)) > 0
                    or _to_int(clip.get("durationMs")) > 0
                )

                if idx in silent_inputs:
                    filters.append(
                        f"anullsrc=r=48000:cl=stereo[_extsil{j}];"
                        f"[_extsil{j}]atrim=0:{clip_timeline_dur_s},asetpts=PTS-STARTPTS,"
                        f"adelay={delay_ms}|{delay_ms}[{out_label}]"
                    )
                else:
                    if has_source_trim:
                        audio_chain = f"[{idx}:a]atrim=start={in_s}:end={out_s},asetpts=PTS-STARTPTS"
                    elif has_source_duration_bound:
                        audio_chain = f"[{idx}:a]atrim=start=0:end={clip_source_dur},asetpts=PTS-STARTPTS"
                    else:
                        audio_chain = f"[{idx}:a]asetpts=PTS-STARTPTS"
                    if atempo_chain:
                        audio_chain += f",{atempo_chain}"
                    if abs(volume - 1.0) > 1e-3:
                        audio_chain += f",volume={_safe_float_for_ffmpeg(volume)}"
                    filters.append(
                        f"{audio_chain},apad,atrim=0:{clip_timeline_dur_s},asetpts=PTS-STARTPTS,"
                        f"adelay={delay_ms}|{delay_ms}[{out_label}]"
                    )
                audio_mix_labels.append(out_label)

            if len(audio_mix_labels) == 1:
                filters.append(f"[{audio_mix_labels[0]}]atrim=0:{project_duration_s},asetpts=PTS-STARTPTS[aout]")
            else:
                mix_inputs = "".join(f"[{label}]" for label in audio_mix_labels)
                filters.append(
                    f"{mix_inputs}amix=inputs={len(audio_mix_labels)}:duration=longest:dropout_transition=0,"
                    f"atrim=0:{project_duration_s},asetpts=PTS-STARTPTS[aout]"
                )

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
        threshold_db = float(params.get("thresholdDb", -30))
    except (ValueError, TypeError):
        threshold_db = -30.0
    try:
        min_silence_ms = float(params.get("minSilenceMs", 300))
    except (ValueError, TypeError):
        min_silence_ms = 300.0
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

def handle_probe(spec: dict, tmp_dir: str, runner=None) -> dict:
    """Probe a media file and return metadata."""
    cmd = build_ffmpeg_command_for_probe(spec)
    if runner:
        result = runner.run_command_sync(cmd, timeout=30)
    else:
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


def handle_render_mp4(spec: dict, tmp_dir: str, runner=None) -> dict:
    """Render MP4 from timeline."""
    job_id = spec["jobId"]
    user_id = str(spec.get("_userId", "unknown"))
    original_filename = spec.get("output", {}).get("target", "output.mp4")

    # Sanitize filename to prevent path traversal
    safe_filename = os.path.basename(original_filename)
    if not safe_filename.lower().endswith(".mp4"):
        safe_filename += ".mp4"

    # FFmpeg working files are temporary only. The completed artifact is
    # uploaded by `_store_final_output_in_r2`; never persist media output on
    # the Python server filesystem.
    render_dir = os.path.join(tmp_dir, "render")
    os.makedirs(render_dir, exist_ok=True)
    output_path = os.path.join(render_dir, safe_filename)

    project = spec.get("inputs", {}).get("project") or {}
    text_clips = _extract_text_clips_for_render(project)
    base_output_path = output_path
    if text_clips:
        base_output_path = os.path.join(
            render_dir,
            f"{os.path.splitext(safe_filename)[0]}_base.mp4",
        )

    # Override output target in spec so FFmpeg writes to the correct location
    spec.setdefault("output", {})["target"] = base_output_path

    cmd = build_ffmpeg_command_for_render(spec, runner=runner)

    import structlog
    _render_log = structlog.get_logger()
    _render_log.info("ffmpeg_render_cmd", job_id=job_id, cmd=" ".join(cmd))

    report_progress(job_id, 0.1, "rendering", "Starting FFmpeg render")

    if runner:
        _render_result = runner.run_command_sync(cmd, timeout=1800)
        stderr = _render_result.stderr or ""
        _returncode = _render_result.returncode
    else:
        process = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        _, stderr = process.communicate(timeout=1800)
        _returncode = process.returncode

    if _returncode != 0:
        _render_log.error("ffmpeg_render_failed", job_id=job_id, returncode=_returncode, stderr=stderr[-2000:])
        raise RuntimeError(f"FFmpeg render failed: {_sanitize_stderr(stderr)}")

    text_render_derived: dict[str, Any] | None = None
    if text_clips:
        report_progress(job_id, 0.75, "text_burnin", "Applying text overlay")
        proj_w = _to_int(project.get("width"), default=1920) or 1920
        proj_h = _to_int(project.get("height"), default=1080) or 1080
        fast_path = _evaluate_drawtext_fast_path(text_clips)
        drawtext_result = None
        strategy = "ass"
        fallback_reason = fast_path["reason"]

        if fast_path["eligible"]:
            drawtext_filter = _build_drawtext_filter(text_clips, proj_w, proj_h)
            drawtext_cmd = [
                "ffmpeg",
                "-y",
                "-i",
                base_output_path,
                "-vf",
                drawtext_filter,
                "-c:v",
                "libx264",
                "-profile:v",
                "high",
                "-level",
                "4.0",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "18",
                "-movflags",
                "+faststart",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-ar",
                "48000",
                output_path,
            ]
            _render_log.info("ffmpeg_text_fastpath_cmd", job_id=job_id, cmd=" ".join(drawtext_cmd))
            if runner:
                drawtext_result = runner.run_command_sync(drawtext_cmd, timeout=1800)
            else:
                drawtext_result = subprocess.run(
                    drawtext_cmd,
                    capture_output=True,
                    text=True,
                    timeout=1800,
                )
            if drawtext_result.returncode == 0:
                strategy = "drawtext"
                fallback_reason = "accepted_equivalent"
            else:
                fallback_reason = "drawtext_runtime_fallback"
                _render_log.warning(
                    "ffmpeg_text_fastpath_fallback",
                    job_id=job_id,
                    reason=fallback_reason,
                    stderr=(drawtext_result.stderr or "")[-1500:],
                )

        if strategy != "drawtext":
            ass_path = os.path.join(render_dir, "text_overlay.ass")
            ass_doc = _generate_ass_document(text_clips, proj_w, proj_h)
            with open(ass_path, "w", encoding="utf-8") as fh:
                fh.write(ass_doc)
            ass_cmd = [
                "ffmpeg",
                "-y",
                "-i",
                base_output_path,
                "-vf",
                _build_subtitles_filter(ass_path),
                "-c:v",
                "libx264",
                "-profile:v",
                "high",
                "-level",
                "4.0",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "18",
                "-movflags",
                "+faststart",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-ar",
                "48000",
                output_path,
            ]
            _render_log.info("ffmpeg_text_ass_cmd", job_id=job_id, cmd=" ".join(ass_cmd))
            if runner:
                ass_result = runner.run_command_sync(ass_cmd, timeout=1800)
            else:
                ass_result = subprocess.run(
                    ass_cmd,
                    capture_output=True,
                    text=True,
                    timeout=1800,
                )
            if ass_result.returncode != 0:
                _render_log.error(
                    "ffmpeg_text_ass_failed",
                    job_id=job_id,
                    reason=fallback_reason,
                    stderr=(ass_result.stderr or "")[-2000:],
                )
                raise RuntimeError(
                    f"FFmpeg text burn-in failed: {_sanitize_stderr(ass_result.stderr or '')}"
                )

        text_render_derived = _build_text_render_telemetry(
            project,
            text_clips,
            strategy=strategy,
            fast_path={"eligible": fast_path["eligible"], "reason": fallback_reason},
            job_id=job_id,
        )

    serve_url, storage_key = _store_final_output_in_r2(
        spec,
        output_path,
        "render",
        "video/mp4",
        ".mp4",
    )
    result: dict[str, Any] = {
        "artifacts": [{"kind": "video", "uri": serve_url, "storageKey": storage_key, "mime": "video/mp4"}],
    }
    if text_render_derived:
        result["derived"] = {"textRender": text_render_derived}
    return result


def handle_waveform_peaks(spec: dict, tmp_dir: str, runner=None) -> dict:
    """Extract waveform peaks from audio."""
    job_id = spec["jobId"]
    cmd = build_ffmpeg_command_for_waveform(spec)

    report_progress(job_id, 0.1, "extracting_waveform")

    if runner:
        process = runner.run_command_sync(cmd, timeout=120, text=False, capture_output=True)
    else:
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


def handle_dead_air_detect(spec: dict, tmp_dir: str, runner=None) -> dict:
    """Detect silence segments in audio."""
    import structlog

    logger = structlog.get_logger()
    job_id = spec["jobId"]
    cmd = build_ffmpeg_command_for_silence(spec)

    logger.info("silence_detect_start", job_id=job_id, cmd=" ".join(cmd))
    report_progress(job_id, 0.1, "detecting_silence")

    if runner:
        result = runner.run_command_sync(cmd, timeout=120)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        logger.error(
            "silence_detect_ffmpeg_error",
            job_id=job_id,
            returncode=result.returncode,
            stderr=result.stderr[:2000],
        )
        raise RuntimeError(
            f"FFmpeg silencedetect failed (exit {result.returncode}): "
            + result.stderr[:500]
        )

    segments = parse_silence_output(result.stderr)
    logger.info(
        "silence_detect_done",
        job_id=job_id,
        segments_found=len(segments),
        stderr_lines=result.stderr.count("\n"),
    )

    return {
        "artifacts": [],
        "derived": {"silenceSegments": segments},
    }


def handle_thumbnails(spec: dict, tmp_dir: str, runner=None) -> dict:
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
    probe_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path]
    if runner:
        probe = runner.run_command_sync(probe_cmd, timeout=30)
    else:
        probe = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
    duration = float(json.loads(probe.stdout).get("format", {}).get("duration", 0))
    timestamps = []
    t = 0.0
    while t < duration:
        timestamps.append(t)
        t += interval_s

    artifacts = []
    for i, ts in enumerate(timestamps):
        out_path = os.path.join(tmp_dir, f"thumb_{i:04d}.jpg")
        thumb_cmd = ["ffmpeg", "-ss", str(ts), "-i", path, "-vframes", "1", "-q:v", "2", "-y", out_path]
        if runner:
            runner.run_command_sync(thumb_cmd, timeout=30)
        else:
            subprocess.run(thumb_cmd, capture_output=True, timeout=30)
        if os.path.exists(out_path):
            artifacts.append({"kind": "thumbnail", "uri": out_path, "mime": "image/jpeg"})
        report_progress(job_id, 0.1 + 0.9 * (i + 1) / len(timestamps), "generating_thumbnails")

    return {"artifacts": artifacts}


def handle_subtitles_extract(spec: dict, tmp_dir: str, runner=None) -> dict:
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

    sub_cmd = ["ffmpeg", "-i", path, "-map", "0:s:0", "-y", out_path]
    if runner:
        runner.run_command_sync(sub_cmd, timeout=60)
    else:
        subprocess.run(sub_cmd, capture_output=True, timeout=60)

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


def _probe_media_info(input_path: str, runner=None) -> dict:
    """Probe a media file for duration, frame rate, and stream types.

    Returns dict with keys:
        duration_s: float
        fps: str (e.g., "30000/1001")
        has_video: bool
        has_audio: bool
        is_vfr: bool (True if variable frame rate detected)
    """
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", input_path]
    if runner:
        result = runner.run_command_sync(cmd, timeout=30)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

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


def handle_dead_air_cut(spec: dict, tmp_dir: str, runner=None) -> dict:
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
        media_info = _probe_media_info(input_path, runner=runner)
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
    media_info = _probe_media_info(input_path, runner=runner)
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
    if runner:
        result = runner.run_command_sync(cmd, timeout=1800)
    else:
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
# Transcode to H.264 (browser-compatible)
# ========================================

# Codecs that browsers can play natively in <video> elements
_BROWSER_COMPATIBLE_VIDEO_CODECS = {"h264", "vp8", "vp9", "av1"}


def _detect_video_codec(uri: str, runner=None) -> str | None:
    """Probe a file and return its video codec name (lowercase), or None."""
    try:
        cmd = ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
               "-show_entries", "stream=codec_name", "-of", "csv=p=0", uri]
        if runner:
            result = runner.run_command_sync(cmd, timeout=30)
        else:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        codec = result.stdout.strip().lower()
        return codec if codec else None
    except Exception:
        return None


def handle_transcode_h264(spec: dict, tmp_dir: str, runner=None) -> dict:
    """Transcode a video file to H.264/AAC MP4 for browser playback.

    Probes the input first — if already H.264, returns the original URI
    without re-encoding (no quality loss). Otherwise, transcodes to
    H.264 High profile with CRF 23 (good quality/size balance).

    Output is stored in a tenant-scoped directory when tenant metadata is present.
    """
    job_id = spec["jobId"]
    user_id = str(spec.get("_userId", "unknown"))

    assets = spec.get("inputs", {}).get("assets", [])
    if not assets:
        raise ValueError("No assets provided for transcode_h264")

    asset_uri = assets[0]["uri"]
    report_progress(job_id, 0.05, "probing", "Checking video codec")

    # Probe codec to decide if transcoding is needed
    codec = _detect_video_codec(asset_uri, runner=runner)

    if codec and codec in _BROWSER_COMPATIBLE_VIDEO_CODECS:
        # Keep the no-reencode optimization, but still make the final output
        # durable. Provider/local input URLs must never become the playback
        # contract for a completed media job.
        report_progress(job_id, 0.1, "downloading", "Preparing input file")
        input_path = _resolve_asset_path(asset_uri, tmp_dir)
        serve_url, storage_key = _store_final_output_in_r2(
            spec,
            input_path,
            "transcoded",
            "video/mp4",
            ".mp4",
        )
        report_progress(job_id, 1.0, "done", f"Already {codec} — stored in R2")
        return {
            "artifacts": [{"kind": "video", "uri": serve_url, "storageKey": storage_key, "mime": "video/mp4"}],
            "derived": {"transcoded": False, "originalCodec": codec},
        }

    report_progress(job_id, 0.1, "downloading", "Preparing input file")

    # Download remote file to tmp
    input_path = _resolve_asset_path(asset_uri, tmp_dir)

    # Probe media info for progress reporting
    media_info = _probe_media_info(input_path, runner=runner)
    total_duration_us = int(media_info["duration_s"] * 1_000_000)

    # FFmpeg working files are temporary only; final output is copied to R2.
    transcode_dir = os.path.join(tmp_dir, "transcoded")
    os.makedirs(transcode_dir, exist_ok=True)

    # Use original filename with _h264 suffix
    original_name = os.path.splitext(os.path.basename(input_path))[0]
    output_filename = f"{original_name}_h264.mp4"
    output_path = os.path.join(transcode_dir, output_filename)

    # Build FFmpeg transcode command
    params = spec.get("params", {}) or {}
    crf = str(max(18, min(int(params.get("crf", 23)), 35)))
    preset = params.get("preset", "medium")
    if preset not in ("ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"):
        preset = "medium"

    cmd = [
        "ffmpeg", "-i", input_path,
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
        "-pix_fmt", "yuv420p",
        "-crf", crf, "-preset", preset,
        "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
        "-progress", "pipe:1",
        "-y", output_path,
    ]

    report_progress(job_id, 0.15, "transcoding", f"Transcoding from {codec or 'unknown'} to H.264")

    if runner:
        # Sandbox mode: no progress streaming, single batch execution
        report_progress(job_id, 0.5, "transcoding", "Transcoding in sandbox...")
        _tc_result = runner.run_command_sync(cmd, timeout=1800)
        stderr = _tc_result.stderr or ""
        _tc_returncode = _tc_result.returncode
    else:
        process = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

        # Parse progress from FFmpeg stdout
        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                pct = parse_ffmpeg_progress(line, total_duration_us)
                if pct is not None:
                    # Map 0-1 range into 0.15-0.90 for UI
                    mapped = 0.15 + pct * 0.75
                    report_progress(job_id, mapped, "transcoding", f"Transcoding: {int(pct * 100)}%")

        _, stderr = process.communicate(timeout=1800)
        _tc_returncode = process.returncode

    if _tc_returncode != 0:
        raise RuntimeError(f"Transcode failed: {_sanitize_stderr(stderr)}")

    if not os.path.exists(output_path):
        raise RuntimeError("Transcode succeeded but output file was not created")

    report_progress(job_id, 0.95, "finalizing", "Finalizing transcoded file")

    serve_url, storage_key = _store_final_output_in_r2(
        spec,
        output_path,
        "transcoded",
        "video/mp4",
        ".mp4",
    )
    return {
        "artifacts": [{"kind": "video", "uri": serve_url, "storageKey": storage_key, "mime": "video/mp4"}],
        "derived": {
            "transcoded": True,
            "originalCodec": codec or "unknown",
            "outputCodec": "h264",
        },
    }


# ========================================
# Extract Audio from Video
# ========================================


def handle_extract_audio(spec: dict, tmp_dir: str, runner=None) -> dict:
    """Extract audio track from a video file to AAC/M4A.

    Uses FFmpeg to copy or re-encode the audio stream without the video.
    Output is stored in a tenant-scoped directory when tenant metadata is present.
    """
    job_id = spec["jobId"]
    user_id = str(spec.get("_userId", "unknown"))

    assets = spec.get("inputs", {}).get("assets", [])
    if not assets:
        raise ValueError("No assets provided for extract_audio")

    asset_uri = assets[0]["uri"]
    report_progress(job_id, 0.05, "downloading", "Preparing input file")

    # Download remote file to tmp
    input_path = _resolve_asset_path(asset_uri, tmp_dir)

    # Probe media info
    media_info = _probe_media_info(input_path, runner=runner)
    if not media_info["has_audio"]:
        raise ValueError("Input file has no audio stream to extract")

    report_progress(job_id, 0.2, "extracting", "Extracting audio stream")

    # FFmpeg working files are temporary only; final output is copied to R2.
    extract_dir = os.path.join(tmp_dir, "audio_extracts")
    os.makedirs(extract_dir, exist_ok=True)
    output_filename = "audio.m4a"
    output_path = os.path.join(extract_dir, output_filename)

    # FFmpeg: extract audio, re-encode to AAC
    cmd = [
        "ffmpeg", "-i", input_path,
        "-vn",
        "-acodec", "aac", "-b:a", "192k", "-ar", "48000",
        "-y", output_path,
    ]

    if runner:
        result = runner.run_command_sync(cmd, timeout=600)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    if result.returncode != 0:
        raise RuntimeError(f"Audio extraction failed: {_sanitize_stderr(result.stderr)}")

    if not os.path.exists(output_path):
        raise RuntimeError("Audio extraction succeeded but output file was not created")

    report_progress(job_id, 0.8, "probing", "Probing output duration")

    # Probe output for duration
    probe_out_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", output_path]
    if runner:
        probe_result = runner.run_command_sync(probe_out_cmd, timeout=30)
    else:
        probe_result = subprocess.run(probe_out_cmd, capture_output=True, text=True, timeout=30)
    output_duration = 0.0
    if probe_result.returncode == 0:
        try:
            probe_data = json.loads(probe_result.stdout)
            output_duration = float(probe_data.get("format", {}).get("duration", 0))
        except (json.JSONDecodeError, ValueError):
            pass

    report_progress(job_id, 0.95, "finalizing", "Finalizing extracted audio")

    serve_url, storage_key = _store_final_output_in_r2(
        spec,
        output_path,
        "audio",
        "audio/mp4",
        ".m4a",
    )
    return {
        "artifacts": [{"kind": "audio", "uri": serve_url, "storageKey": storage_key, "mime": "audio/mp4"}],
        "derived": {
            "duration": output_duration,
            "format": "m4a",
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
    "transcode_h264": handle_transcode_h264,
    "extract_audio": handle_extract_audio,
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
    from app.models.vision import MediaAsset
    from sqlalchemy import select
    from datetime import datetime

    artifacts = result.get("artifacts", [])
    result_url = artifacts[0]["uri"] if artifacts else None
    storage_key = artifacts[0].get("storageKey") if artifacts else None
    original_filename = spec.get("output", {}).get("target", "render")

    # DB column id is varchar(36) — strip the "mj-" prefix to fit
    db_id = job_id[3:] if job_id.startswith("mj-") else job_id
    if len(db_id) > 36:
        db_id = db_id[:36]

    async with AsyncSessionLocal() as db:
        if storage_key:
            existing_asset = await db.scalar(
                select(MediaAsset).where(
                    MediaAsset.tenantId == str(spec.get("tenantId") or spec.get("tenant_id") or ""),
                    MediaAsset.userId == int(user_id),
                    MediaAsset.storageKey == storage_key,
                ).limit(1)
            )
            if existing_asset:
                result.setdefault("mediaAssetId", existing_asset.id)
            else:
                asset = MediaAsset(
                    tenantId=str(spec.get("tenantId") or spec.get("tenant_id") or ""),
                    userId=int(user_id),
                    sourceType="video_editor_render",
                    status="ready",
                    storageKey=storage_key,
                    originalUrl=result_url,
                    mimeType="video/mp4",
                )
                db.add(asset)
                await db.flush()
                result["mediaAssetId"] = asset.id
        task = MediaTask(
            id=db_id,
            user_id=int(user_id),
            tenant_id=spec.get("tenantId") or spec.get("tenant_id"),
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

        # Route through sandbox when enabled
        from app.integrations.opensandbox.config import opensandbox_settings as _osb_settings
        if _osb_settings.is_enabled:
            from app.video.sandbox_runner import SandboxMediaRunner
            with SandboxMediaRunner.session(profile="media-processing", job_id=job_id) as runner:
                result = handler(spec, tmp_dir, runner=runner)
        else:
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
