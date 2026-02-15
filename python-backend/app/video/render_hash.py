"""Deterministic render hash computation.

Produces a SHA-256 digest from the project timeline, asset keys, and profile.
The hash is used for idempotent rendering: if a render with the same hash
already exists in R2, skip re-rendering.
"""
import hashlib
import json


# Fields to exclude from hash computation (non-deterministic / UI-only)
_EXCLUDED_PROJECT_FIELDS = {"name", "createdAt", "modifiedAt"}
_EXCLUDED_TIMELINE_FIELDS = {"selectedClipIds", "hoveredClipId", "zoom", "scrollLeft", "playbackState", "loopRegion"}


def _canonicalize_clips(clips: list[dict]) -> list[dict]:
    """Sort clips by startTime and extract deterministic fields."""
    sorted_clips = sorted(clips, key=lambda c: c.get("startTime", c.get("startMs", 0)))
    result = []
    for clip in sorted_clips:
        canonical = {
            "assetId": clip.get("assetId"),
            "startTime": clip.get("startTime", clip.get("startMs", 0)),
            "duration": clip.get("duration", clip.get("durationMs", 0)),
            "trimIn": clip.get("trimIn", clip.get("inMs", 0)),
            "trimOut": clip.get("trimOut", clip.get("outMs", 0)),
            "volume": clip.get("volume", 1.0),
            "speed": clip.get("speed", 1.0),
            "effects": clip.get("effects", []),
        }
        if clip.get("inTransition"):
            canonical["inTransition"] = clip["inTransition"]
        if clip.get("transform"):
            canonical["transform"] = clip["transform"]
        if clip.get("textConfig"):
            canonical["textConfig"] = clip["textConfig"]
        if clip.get("transitions"):
            canonical["transitions"] = clip["transitions"]
        result.append(canonical)
    return result


def _canonicalize_tracks(tracks: list[dict]) -> list[dict]:
    """Extract deterministic track data."""
    result = []
    for track in tracks:
        result.append({
            "type": track.get("type"),
            "name": track.get("name"),
            "clips": _canonicalize_clips(track.get("clips", [])),
            "muted": track.get("muted", False),
        })
    return result


def compute_render_hash(
    project: dict,
    input_asset_keys: dict[str, str],
    profile: str,
) -> str:
    """Compute a deterministic render hash from the project timeline, asset keys, and profile.

    The hash includes:
    - All clip timings, ordering, transitions, and effects
    - All asset references (by R2 object key, not by local path or URL)
    - Project settings (resolution, fps, sample rate)
    - Render profile name

    The hash excludes:
    - Timestamps (createdAt, modifiedAt)
    - UI state (selectedClipIds, hoveredClipId, zoom, scroll)
    - Project name

    Returns a hex-encoded SHA-256 digest.
    """
    settings = project.get("settings", {})
    timeline = project.get("timeline", {})

    canonical = {
        "settings": {
            "width": settings.get("width", 1920),
            "height": settings.get("height", 1080),
            "fps": settings.get("fps", 30),
            "sampleRate": settings.get("sampleRate", 48000),
        },
        "tracks": _canonicalize_tracks(timeline.get("tracks", [])),
        "assetKeys": dict(sorted(input_asset_keys.items())),
        "profile": profile,
    }

    json_str = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()
