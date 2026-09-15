"""Capability-aware Face + Activity evidence contract for Feature 191.

The module is deliberately dependency-light. Runtime-specific detectors can
feed normalized samples into :func:`build_evidence`; the durable output is
bounded metadata and track points, never raw frames or credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
import hashlib
import json
from typing import Any, Iterable

CONTRACT_VERSION = "feature-191.v1"
MAX_POINTS = 256
MAX_INTERVALS = 256


@dataclass(frozen=True)
class TrackPoint:
    time_ms: int
    x: float
    y: float
    confidence: float
    kind: str
    width: float | None = None
    height: float | None = None
    track_id: str | None = None


@dataclass(frozen=True)
class ActivityInterval:
    start_ms: int
    end_ms: int
    score: float
    kind: str = "motion"


def _clamp(value: Any, low: float, high: float, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number != number or number in (float("inf"), float("-inf")):
        return fallback
    return max(low, min(high, number))


def normalize_point(raw: dict[str, Any]) -> TrackPoint | None:
    try:
        time_ms = max(0, int(raw.get("timeMs", raw.get("time_ms", 0))))
    except (TypeError, ValueError):
        return None
    kind = str(raw.get("kind", "activity"))
    if kind not in {"face", "person", "hand", "object", "activity"}:
        kind = "activity"
    return TrackPoint(
        time_ms=time_ms,
        x=_clamp(raw.get("x", raw.get("normalizedX")), 0, 1, 0.5),
        y=_clamp(raw.get("y", raw.get("normalizedY")), 0, 1, 0.5),
        confidence=_clamp(raw.get("confidence"), 0, 1, 0),
        kind=kind,
        width=_clamp(raw.get("width"), 0, 1, 0) if raw.get("width") is not None else None,
        height=_clamp(raw.get("height"), 0, 1, 0) if raw.get("height") is not None else None,
        track_id=str(raw["trackId"])[:128] if raw.get("trackId") else None,
    )


def normalize_interval(raw: dict[str, Any]) -> ActivityInterval | None:
    try:
        start = max(0, int(raw.get("startMs", raw.get("start_ms", 0))))
        end = max(start, int(raw.get("endMs", raw.get("end_ms", start))))
    except (TypeError, ValueError):
        return None
    return ActivityInterval(
        start_ms=start,
        end_ms=end,
        score=_clamp(raw.get("score"), 0, 1, 0),
        kind=str(raw.get("kind", "motion"))[:64],
    )


def build_evidence(
    samples: Iterable[dict[str, Any]],
    intervals: Iterable[dict[str, Any]],
    *,
    analysis_mode: str,
    source_fingerprint: str,
    mark_revision: int,
    policy_fingerprint: str,
    capability_profile_fingerprint: str,
    trim_range: dict[str, int] | None = None,
    aspect_profile: str = "source",
    interaction_capability_available: bool = False,
    evidence_ref: str | None = None,
) -> dict[str, Any]:
    if analysis_mode not in {"quick", "full_scan"}:
        raise ValueError("composition_scan_analysis_mode_invalid")
    points = [point for point in (normalize_point(item) for item in samples) if point]
    points.sort(key=lambda point: point.time_ms)
    bounded_points = points[:MAX_POINTS]
    activity = [interval for interval in (normalize_interval(item) for item in intervals) if interval]
    bounded_activity = activity[:MAX_INTERVALS]
    payload = {
        "contractVersion": CONTRACT_VERSION,
        "analysisMode": analysis_mode,
        # Face/motion samples alone cannot claim the Face + Activity contract.
        # Approval is opt-in only after a hand/object interaction capability
        # has supplied evidence; absent that capability the result is truthful
        # degraded evidence even when face points are plentiful.
        "status": "approved" if interaction_capability_available and (bounded_points or bounded_activity) else "degraded",
        "sourceFingerprint": str(source_fingerprint)[:256],
        "markRevision": max(0, int(mark_revision)),
        "policyFingerprint": str(policy_fingerprint)[:256],
        "capabilityProfileFingerprint": str(capability_profile_fingerprint)[:256],
        "trimRange": {
            "startMs": max(0, int((trim_range or {}).get("startMs", 0))),
            "endMs": max(0, int((trim_range or {}).get("endMs", 0))),
        },
        "aspectProfile": str(aspect_profile)[:80],
        "evidenceRef": evidence_ref or "evidence-" + hashlib.sha256(
            json.dumps([asdict(point) for point in bounded_points], sort_keys=True).encode()
        ).hexdigest()[:24],
        "trackPoints": [asdict(point) for point in bounded_points],
        "activityIntervals": [asdict(interval) for interval in bounded_activity],
    }
    return payload


def checkpoint_key(
    job_id: str,
    source_fingerprint: str,
    mark_revision: int,
    policy_fingerprint: str,
    capability_profile_fingerprint: str = "",
    trim_range: dict[str, int] | None = None,
    aspect_profile: str = "source",
    analysis_mode: str = "full_scan",
) -> str:
    trim = trim_range or {"startMs": 0, "endMs": 0}
    return ":".join((
        "composition-scan", str(job_id), str(source_fingerprint),
        f"{int(trim.get('startMs', 0))}-{int(trim.get('endMs', 0))}",
        str(aspect_profile), str(mark_revision), str(analysis_mode),
        str(policy_fingerprint), str(capability_profile_fingerprint),
    ))


def can_promote(checkpoint: dict[str, Any], current: dict[str, Any], evidence_ref: str) -> bool:
    fields = (
        "jobId", "sourceFingerprint", "markRevision", "policyFingerprint",
        "capabilityProfileFingerprint", "trimRange", "aspectProfile",
        "analysisMode",
    )
    return all(checkpoint.get(field) == current.get(field) for field in fields) and checkpoint.get("status") in {"approved", "degraded"} and checkpoint.get("evidenceRef") == evidence_ref


__all__ = ["ActivityInterval", "TrackPoint", "build_evidence", "can_promote", "checkpoint_key", "normalize_interval", "normalize_point"]
