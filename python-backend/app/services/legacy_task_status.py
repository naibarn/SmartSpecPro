"""Compatibility-only status reader for legacy Celery task identifiers.

Feature 186 business/API modules must not read the Celery result backend
directly.  This small adapter is intentionally the only place that may do so
while a rollback or legacy drain is active.  Canonical jobs use the
PostgreSQL control-plane client instead.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class LegacyTaskStatus:
    _result_backend: Any

    @property
    def state(self) -> str:
        return str(self._result_backend.state or "PENDING")

    @property
    def result(self) -> Any:
        return self._result_backend.result

    @property
    def info(self) -> Any:
        return self._result_backend.info


def read_legacy_task_status(task_id: str, *, app: Any = None) -> LegacyTaskStatus:
    """Read a legacy result observation without making it canonical state."""
    from celery.result import AsyncResult

    result = AsyncResult(task_id, app=app) if app is not None else AsyncResult(task_id)
    return LegacyTaskStatus(_result_backend=result)
