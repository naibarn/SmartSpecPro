"""Lightweight observability helpers for library/callback workflows."""

from __future__ import annotations

from collections import Counter
from threading import Lock
from typing import Any

import structlog

logger = structlog.get_logger()

_metric_lock = Lock()
_metric_counts: Counter[str] = Counter()

_REDACT_KEYS = {
    "authorization",
    "token",
    "api_key",
    "apikey",
    "secret",
    "password",
    "cookie",
}


def _normalize_tag_value(value: Any) -> str:
    if value is None:
        return "none"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _build_metric_key(name: str, tags: dict[str, Any]) -> str:
    if not tags:
        return name
    normalized = [f"{key}={_normalize_tag_value(tags[key])}" for key in sorted(tags)]
    return f"{name}|{'|'.join(normalized)}"


def emit_metric(name: str, **tags: Any) -> int:
    """Increment named metric counter and return current value."""
    key = _build_metric_key(name, tags)
    with _metric_lock:
        _metric_counts[key] += 1
        current = _metric_counts[key]

    logger.info(
        "library_metric_emitted",
        metric=name,
        value=current,
        tags={k: _normalize_tag_value(v) for k, v in tags.items()},
    )
    return current


def get_metric_count(name: str, **tags: Any) -> int:
    """Return metric count for exact tag set, or aggregate by name when tags omitted."""
    with _metric_lock:
        if tags:
            return _metric_counts[_build_metric_key(name, tags)]

        total = 0
        prefix = f"{name}|"
        for key, value in _metric_counts.items():
            if key == name or key.startswith(prefix):
                total += value
        return total


def reset_library_observability_metrics() -> None:
    """Reset in-memory counters used by unit tests and local diagnostics."""
    with _metric_lock:
        _metric_counts.clear()


def redact_sensitive(value: Any) -> Any:
    """Redact sensitive fields recursively from structured log payloads."""
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            lowered = key.lower()
            if any(marker in lowered for marker in _REDACT_KEYS):
                redacted[key] = "***redacted***"
            else:
                redacted[key] = redact_sensitive(item)
        return redacted

    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    return value


def log_observability_event(event: str, **fields: Any) -> None:
    """Emit structured log with redaction policy applied."""
    logger.info(event, **{key: redact_sensitive(value) for key, value in fields.items()})

