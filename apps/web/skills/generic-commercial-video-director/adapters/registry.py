from __future__ import annotations
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = ROOT / "config" / "providers"


def load_profiles() -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for path in PROFILE_DIR.glob("*.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        result[data["id"]] = data
    return result


def capability_supported(profile: dict[str, Any], name: str, *, allow_conditional: bool = False) -> bool:
    status = profile.get("capabilities", {}).get(name, {}).get("status", "unknown")
    return status == "verified" or (allow_conditional and status == "conditional")


def direct_duration_supported(profile: dict[str, Any], seconds: float) -> bool:
    durations = profile.get("limits", {}).get("durations", {})
    allowed = durations.get("allowedSeconds")
    if allowed is not None:
        return seconds in allowed
    lo, hi = durations.get("minSeconds"), durations.get("maxSeconds")
    if lo is None or hi is None:
        return False
    return lo <= seconds <= hi


def native_multishot_supported(profile: dict[str, Any], *, allow_conditional: bool = False) -> bool:
    status = profile.get("temporalPlanning", {}).get("nativeMultiShot", {}).get("status", "unknown")
    return status == "verified" or (allow_conditional and status == "conditional")


def extension_ready(profile: dict[str, Any]) -> bool:
    """Backward-compatible readiness check for any verified continuation strategy.

    Native append requires provider cumulative limits.
    Reference-continuation creates standalone clips and therefore does not require
    a provider maxCumulativeSeconds; SmartAIHub owns the external sequence length.
    """
    ext = profile.get("temporalPlanning", {}).get("extension", {})
    if ext.get("status") != "verified":
        return False
    kind = ext.get("extensionKind") or "native_append"
    allowed = ext.get("allowedAdditionalSeconds")
    has_segment_bounds = bool(allowed) or (
        ext.get("minAdditionalSeconds") is not None
        and ext.get("maxAdditionalSeconds") is not None
    )
    if not has_segment_bounds:
        return False
    if kind == "reference_continuation":
        return (
            ext.get("sourceReferenceRole") == "reference_video"
            and ext.get("requiresExternalAssembly") is True
            and ext.get("referenceTailMinSeconds") is not None
            and ext.get("referenceTailMaxSeconds") is not None
        )
    return ext.get("maxCumulativeSeconds") is not None

def native_append_ready(profile: dict[str, Any]) -> bool:
    ext = profile.get("temporalPlanning", {}).get("extension", {})
    return extension_ready(profile) and (ext.get("extensionKind") in (None, "native_append"))

def reference_continuation_ready(profile: dict[str, Any]) -> bool:
    ext = profile.get("temporalPlanning", {}).get("extension", {})
    return extension_ready(profile) and ext.get("extensionKind") == "reference_continuation"


def multi_turn_native_append_ready(profile: dict[str, Any]) -> bool:
    ext = profile.get("temporalPlanning", {}).get("extension", {})
    if not native_append_ready(profile):
        return False
    if ext.get("maxExtensionTurns") == 1:
        return False
    return ext.get("supportsGeneratedVideoMultiTurn") is not False
