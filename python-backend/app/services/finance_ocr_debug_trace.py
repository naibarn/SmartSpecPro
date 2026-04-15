"""
Finance OCR debug trace writer.

Writes compact JSONL diagnostics for the finance OCR pipeline so failures can
be correlated across:
- upload pipeline routing
- gateway model selection
- OCR fallback behavior
- extracted text availability

The trace is intentionally opt-in and avoids writing raw OCR text. Callers
should log lengths, flags, and short error summaries instead of document
content.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
from typing import Any, Optional

from app.core.config import settings


_WRITE_LOCK = threading.Lock()


def _parse_bool(value: str | None) -> bool:
    if value is None:
        return False
    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _is_enabled() -> bool:
    raw = os.getenv("FINANCE_OCR_DEBUG_TRACE")
    if raw is not None:
        return _parse_bool(raw)
    return bool(getattr(settings, "DEBUG", False) or getattr(settings, "ENVIRONMENT", "") == "development")


def _default_debug_dir() -> Path:
    # app/services/finance_ocr_debug_trace.py -> python-backend/app/services
    project_root = Path(__file__).resolve().parents[2]
    return project_root / "logs" / "finance-ocr-debug"


def _resolve_debug_dir() -> Path:
    configured = os.getenv("FINANCE_OCR_DEBUG_TRACE_DIR")
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
    if isinstance(value, (bytes, bytearray)):
        return f"<bytes:{len(value)}>"
    return str(value)


def write_finance_ocr_debug_event(event: str, payload: dict[str, Any]) -> Optional[str]:
    """
    Append a single JSON line finance OCR debug record.
    Returns absolute log file path on success, otherwise None.
    """
    if not event or not _is_enabled():
        return None

    try:
        now = datetime.now(timezone.utc)
        debug_dir = _resolve_debug_dir()
        debug_dir.mkdir(parents=True, exist_ok=True)
        filename = f"finance-ocr-{now.strftime('%Y-%m-%d')}.jsonl"
        file_path = debug_dir / filename

        record = {
            "ts": now.isoformat(),
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
