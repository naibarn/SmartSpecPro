"""
Media debug trace writer.

Writes compact JSONL diagnostics for media generation routing/failures so
investigations can correlate:
- internal task_id
- trace_id
- selected model/provider route
- failure reason
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
from typing import Any, Optional


_WRITE_LOCK = threading.Lock()


def _default_debug_dir() -> Path:
    # app/services/media_debug_trace.py -> python-backend/app/services
    project_root = Path(__file__).resolve().parents[2]
    return project_root / "logs" / "media-debug"


def _resolve_debug_dir() -> Path:
    configured = os.getenv("MEDIA_DEBUG_TRACE_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return _default_debug_dir()


def _jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    return str(value)


def write_media_debug_event(event: str, payload: dict[str, Any]) -> Optional[str]:
    """
    Append a single JSON line media debug record.
    Returns absolute log file path on success, otherwise None.
    """
    if not event:
        return None

    try:
        debug_dir = _resolve_debug_dir()
        debug_dir.mkdir(parents=True, exist_ok=True)
        filename = f"media-routing-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl"
        file_path = debug_dir / filename

        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": event,
            "payload": _jsonable(payload),
        }

        line = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        with _WRITE_LOCK:
            with file_path.open("a", encoding="utf-8") as fp:
                fp.write(line + "\n")
        return str(file_path)
    except Exception:
        return None
