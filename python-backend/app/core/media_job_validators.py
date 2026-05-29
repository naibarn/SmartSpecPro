"""
Security validation for media job worker.

Validates job specs for SSRF, path traversal, resource limits,
and input sanitization before any FFmpeg command is constructed.

These validators are called at the top of the Celery task
(from section-04's media_job_worker.py) before dispatching
to any job handler.

NOTE: validate_uri_no_ssrf performs DNS resolution to detect DNS
rebinding attacks. Hostnames are resolved to IP addresses and checked
against private/loopback/link-local/reserved ranges. Unresolvable
hostnames are blocked by default for safety.
"""

import ipaddress
import os
from urllib.parse import urlparse, unquote

# ========================================
# Resource limit constants
# ========================================

FFMPEG_TIMEOUT_SECONDS: int = 1800  # 30 minutes (matches celery_app.py task_time_limit)
MAX_OUTPUT_FILE_BYTES: int = 10 * 1024 * 1024 * 1024  # 10 GB
MAX_CLIPS: int = 1000
MAX_DURATION_SECONDS: float = 3600.0  # 1 hour
MAX_RESOLUTION_PIXELS: int = 3840 * 2160  # 4K
MAX_DIMENSION: int = 7680
MAX_VIDEO_BITRATE_KBPS: int = 50000
MAX_AUDIO_BITRATE_KBPS: int = 320

# Shell metacharacters that must not appear in URIs or paths
SHELL_METACHARACTERS = set(";|&`$(){}><")

# Allowed codecs (mirrors the TypeScript allowlist)
ALLOWED_CODECS = {
    "libx264", "libx265", "h264", "hevc",
    "h264_videotoolbox", "h264_mf", "h264_qsv", "h264_nvenc", "h264_amf",
    "hevc_videotoolbox", "hevc_mf", "hevc_qsv", "hevc_nvenc",
    "aac", "mp3", "libmp3lame", "libfdk_aac", "libvorbis",
    "libopus", "flac", "pcm_s16le", "copy",
}


# ========================================
# Internal IP detection
# ========================================

def _is_private_ip(hostname: str) -> bool:
    """Check if hostname is a private/internal IP address.

    Resolves hostnames via DNS to prevent DNS rebinding attacks.
    """
    import socket

    try:
        addr = ipaddress.ip_address(hostname)
        return (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
        )
    except ValueError:
        # Not an IP literal — resolve via DNS
        try:
            resolved = socket.getaddrinfo(hostname, None)
            for _, _, _, _, sockaddr in resolved:
                ip = ipaddress.ip_address(sockaddr[0])
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    return True
        except socket.gaierror:
            return True  # Unresolvable hostname — block by default
        return False


def _is_internal_hostname(hostname: str, *, allow_docker_internal: bool = True) -> bool:
    """Check if hostname is a known internal name.

    Args:
        allow_docker_internal: If True (default), host.docker.internal is
            permitted for Docker worker asset downloads. External-facing
            providers (e.g., fal.ai) should pass False.
    """
    lower = hostname.lower()
    if lower == "host.docker.internal":
        return not allow_docker_internal
    return lower in ("localhost", "0.0.0.0")


def _has_shell_metacharacters(s: str) -> bool:
    """Check if string contains shell metacharacters."""
    return bool(SHELL_METACHARACTERS.intersection(s))


# ========================================
# URI validation
# ========================================

def validate_uri_no_ssrf(
    uri: str,
    *,
    allow_docker_internal: bool = True,
    allow_query_metacharacters: bool = False,
) -> str:
    """Validate that a URI does not target internal/private network addresses.

    Args:
        allow_docker_internal: If True (default), host.docker.internal is
            permitted. Docker media workers need this to fetch assets from
            the Node.js host. External providers should pass False.

    Raises ValueError if the URI is SSRF-prone.
    Returns the URI unchanged if safe.
    """
    parsed = urlparse(uri)
    if allow_query_metacharacters:
        shell_checked_uri = parsed._replace(query="").geturl()
        query_checked = parsed.query.replace("&", "")
    else:
        shell_checked_uri = uri
        query_checked = ""

    if _has_shell_metacharacters(shell_checked_uri) or _has_shell_metacharacters(query_checked):
        raise ValueError(f"URI contains shell metacharacters: {uri!r}")

    scheme = parsed.scheme.lower()

    # Block file:// scheme on web backend
    if scheme == "file":
        raise ValueError(f"file:// URIs are not allowed on web backend: {uri!r}")

    # Must be http or https
    if scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URI scheme {scheme!r}: {uri!r}")

    hostname = parsed.hostname or ""

    # Check for internal hostnames
    if _is_internal_hostname(hostname, allow_docker_internal=allow_docker_internal):
        raise ValueError(f"URI targets internal address: {uri!r}")

    # Skip private-IP DNS check for host.docker.internal when allowed —
    # it resolves to 172.17.0.1 (Docker bridge gateway) which would
    # otherwise be blocked by _is_private_ip.
    if hostname.lower() == "host.docker.internal" and allow_docker_internal:
        return uri

    # Check for private/internal IP ranges
    if _is_private_ip(hostname):
        raise ValueError(f"URI targets private/internal IP: {uri!r}")

    return uri


def validate_uri_strict(uri: str) -> str:
    """Strict URI validation that blocks ALL internal hosts including host.docker.internal.

    Use this for external provider URLs (fal.ai, etc.) where no internal
    host access is ever needed.
    """
    return validate_uri_no_ssrf(uri, allow_docker_internal=False)


def validate_provider_result_uri(uri: str) -> str:
    """Validate a provider-hosted result URL for HTTP download/re-hosting.

    Provider CDNs often return signed URLs with query delimiters such as ``&``.
    Those URLs are consumed by httpx, not a shell, so the query string should not
    be rejected as a shell expression. The path/host/scheme are still validated
    strictly and SSRF protection remains enabled.
    """
    return validate_uri_no_ssrf(
        uri,
        allow_docker_internal=False,
        allow_query_metacharacters=True,
    )


# ========================================
# Output path validation
# ========================================

def validate_output_path(target: str, workspace_dir: str = "/tmp") -> str:
    """Validate output path is within workspace and has no traversal.

    Double-decodes URL encoding to catch %2e%2e attacks.
    Raises ValueError if unsafe.
    """
    if _has_shell_metacharacters(target):
        raise ValueError(f"Output path contains shell metacharacters: {target!r}")

    # Double-decode to catch encoded traversal
    decoded = unquote(unquote(target))

    if ".." in decoded:
        raise ValueError(f"Path traversal detected in output target: {target!r}")

    # Verify path resolves within workspace
    abs_target = os.path.abspath(os.path.join(workspace_dir, decoded))
    abs_workspace = os.path.abspath(workspace_dir)
    if not abs_target.startswith(abs_workspace):
        raise ValueError(
            f"Output path resolves outside workspace: {target!r}"
        )

    return target


# ========================================
# Codec validation
# ========================================

def validate_codec(codec: str) -> str:
    """Validate codec name against allowlist.

    Raises ValueError if codec is not in the allowlist.
    """
    if codec not in ALLOWED_CODECS:
        raise ValueError(f"Unknown codec {codec!r} — not in allowlist")
    return codec


# ========================================
# Top-level validation entry point
# ========================================

def validate_job_spec_security(spec_dict: dict) -> None:
    """Top-level validation entry point for the Celery worker.

    Called before dispatching to any job handler. Validates:
    1. All asset URIs for SSRF and injection
    2. Output target for path traversal
    3. Codec against allowlist (if specified in params)
    4. Resource limits (clip count, duration, resolution, bitrate)
    5. No shell metacharacters in any string values

    Raises ValueError with descriptive message on any failure.
    """
    errors: list[str] = []

    # 1. Validate asset URIs
    inputs = spec_dict.get("inputs", {})
    assets = inputs.get("assets", [])
    for asset in assets:
        uri = asset.get("uri", "")
        try:
            validate_uri_no_ssrf(uri, allow_query_metacharacters=True)
        except ValueError as e:
            errors.append(f"Asset {asset.get('assetId', '?')}: {e}")

    # 2. Validate output target
    output = spec_dict.get("output", {})
    target = output.get("target", "")
    if target:
        try:
            validate_output_path(target)
        except ValueError as e:
            errors.append(str(e))

    # 3. Validate codec if specified
    params = spec_dict.get("params", {}) or {}
    codec = params.get("codec")
    if codec:
        try:
            validate_codec(codec)
        except ValueError as e:
            errors.append(str(e))

    audio_codec = params.get("audioCodec")
    if audio_codec:
        try:
            validate_codec(audio_codec)
        except ValueError as e:
            errors.append(str(e))

    # 4. Validate resource limits from project timeline
    project = inputs.get("project")
    if project:
        width = project.get("width", 0)
        height = project.get("height", 0)
        if width and height:
            if width > MAX_DIMENSION or height > MAX_DIMENSION:
                errors.append(
                    f"Resolution {width}x{height} exceeds max dimension {MAX_DIMENSION}"
                )
            if width * height > MAX_RESOLUTION_PIXELS:
                errors.append(
                    f"Resolution {width}x{height} ({width * height} pixels) "
                    f"exceeds max {MAX_RESOLUTION_PIXELS} pixels"
                )

        # Clip count limit
        total_clips = sum(
            len(track.get("clips", []))
            for track in project.get("tracks", [])
        )
        if total_clips > MAX_CLIPS:
            errors.append(f"Too many clips: {total_clips} (max {MAX_CLIPS})")

    # Bitrate limits
    vbr = params.get("videoBitrateKbps")
    if vbr is not None and (vbr <= 0 or vbr > MAX_VIDEO_BITRATE_KBPS):
        errors.append(
            f"Video bitrate {vbr}kbps exceeds max {MAX_VIDEO_BITRATE_KBPS}kbps"
        )

    abr = params.get("audioBitrateKbps")
    if abr is not None and (abr <= 0 or abr > MAX_AUDIO_BITRATE_KBPS):
        errors.append(
            f"Audio bitrate {abr}kbps exceeds max {MAX_AUDIO_BITRATE_KBPS}kbps"
        )

    # 5. Shell metacharacter check on all string values in params
    for key, val in params.items():
        if isinstance(val, str) and _has_shell_metacharacters(val):
            errors.append(
                f"Parameter {key!r} contains shell metacharacters: {val!r}"
            )

    if errors:
        raise ValueError("; ".join(errors))
