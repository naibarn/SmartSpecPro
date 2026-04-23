from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

SENSITIVE_KEYWORDS = ("token", "secret", "password", "apikey", "api_key", "authorization", "credential")
ALLOWED_ARTIFACT_ROOTS = ("out", "logs", "state")


def _normalize_relative_artifact_path(value: Any) -> str:
    raw = str(value or "").strip().replace("\\", "/")
    if not raw:
        raise ValueError("Artifact path must be non-empty.")
    if raw.startswith("/") or raw.startswith("../") or "/../" in raw or raw in {"..", "."}:
        raise ValueError("Artifact path must stay within the workspace.")
    normalized = Path(raw)
    if normalized.is_absolute() or any(part == ".." for part in normalized.parts):
        raise ValueError("Artifact path must stay within the workspace.")
    top_level = normalized.parts[0] if normalized.parts else ""
    if top_level not in ALLOWED_ARTIFACT_ROOTS:
        raise ValueError(f"Artifact path must be under one of: {', '.join(ALLOWED_ARTIFACT_ROOTS)}")
    return normalized.as_posix()


def _redact_value(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, nested in value.items():
            lowered = str(key).lower()
            if any(marker in lowered for marker in SENSITIVE_KEYWORDS):
                redacted[key] = "[redacted]"
            else:
                redacted[key] = _redact_value(nested)
        return redacted
    if isinstance(value, list):
        return [_redact_value(item) for item in value]
    return value


def redact_skill_runtime_state(state: Mapping[str, Any]) -> dict[str, Any]:
    return _redact_value(dict(state))


def build_skill_artifact_index(artifacts: Any) -> dict[str, Any]:
    artifact_list = artifacts if isinstance(artifacts, list) else []
    normalized = []
    for item in artifact_list:
        if isinstance(item, dict):
            redacted_item = _redact_value(item)
            path_value = item.get("path") or item.get("relativePath") or item.get("relative_path")
            if path_value is not None:
                redacted_item["path"] = _normalize_relative_artifact_path(path_value)
            normalized.append(redacted_item)
        else:
            normalized.append({"value": _normalize_relative_artifact_path(item)})
    return {
        "artifacts": normalized,
        "count": len(normalized),
    }


def persist_skill_runtime_state(workspace_dir: Path, state: Mapping[str, Any]) -> dict[str, Path]:
    state_dir = workspace_dir / "state"
    logs_dir = workspace_dir / "logs"
    out_dir = workspace_dir / "out"
    state_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    redacted_state = redact_skill_runtime_state(state)
    progress_path = state_dir / "progress.json"
    last_session_state_path = state_dir / "last_session_state.json"
    progress_path.write_text(json.dumps(redacted_state, ensure_ascii=False, indent=2), encoding="utf-8")
    last_session_state_path.write_text(json.dumps(redacted_state, ensure_ascii=False, indent=2), encoding="utf-8")

    phase = str(redacted_state.get("current_phase") or redacted_state.get("phase") or "unknown")
    phase_log_path = logs_dir / f"phase_{phase}.md"
    phase_log_path.write_text(
        "\n".join(
            [
                f"# Phase {phase}",
                "",
                f"- Status: {redacted_state.get('phase_status', 'unknown')}",
                f"- Last command: {redacted_state.get('last_command', 'none')}",
                f"- Resume hint: {redacted_state.get('resume_hint', 'none')}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    artifact_index_path = out_dir / "artifact_index.json"
    artifact_index_path.write_text(
        json.dumps(build_skill_artifact_index(redacted_state.get("artifacts", [])), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "progress": progress_path,
        "last_session_state": last_session_state_path,
        "phase_log": phase_log_path,
        "artifact_index": artifact_index_path,
    }


def load_persisted_skill_runtime_state(workspace_dir: Path) -> dict[str, Any] | None:
    state_path = workspace_dir / "state" / "last_session_state.json"
    if not state_path.exists():
        return None
    try:
        raw = json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return raw if isinstance(raw, dict) else None
