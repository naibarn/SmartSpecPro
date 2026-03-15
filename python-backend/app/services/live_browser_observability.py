"""Telemetry helpers for live-browser rollout operations."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from app.services.library_observability import emit_metric, log_observability_event

ALLOWED_ORIGIN_SURFACES = {"automation", "chat", "agency", "workflow"}
ALLOWED_REASON_CATEGORIES = {
    "policy",
    "step_up",
    "state",
    "navigation",
    "render",
    "legacy_fallback",
    "unknown",
}


def _freeze_labels(labels: dict[str, str]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted(labels.items()))


def _emit_metric_count(name: str, value: int, labels: dict[str, str]) -> None:
    for _ in range(max(value, 0)):
        emit_metric(name, **labels)


def _emit_incident_event(
    *,
    kind: str,
    owner: str,
    severity: str,
    session_id: str | None,
    details: dict[str, Any],
) -> None:
    emit_metric(
        "live_browser_incidents_total",
        kind=kind,
        owner=owner,
        severity=severity,
    )
    log_observability_event(
        "live_browser_incident",
        kind=kind,
        owner=owner,
        severity=severity,
        session_id=session_id,
        details=details,
    )


def emit_rollout_metric(
    name: str,
    *,
    origin_surface: str,
    reason_category: str | None = None,
    value: int = 1,
) -> None:
    if origin_surface not in ALLOWED_ORIGIN_SURFACES:
        raise ValueError(f"Unsupported origin_surface: {origin_surface}")
    if reason_category is not None and reason_category not in ALLOWED_REASON_CATEGORIES:
        raise ValueError(f"Unsupported reason_category: {reason_category}")

    labels = {"origin_surface": origin_surface}
    if reason_category is not None:
        labels["reason_category"] = reason_category
    _emit_metric_count(name, value, labels)


class LiveBrowserTelemetry(Protocol):
    def increment(self, name: str, value: int = 1, **labels: str) -> None: ...

    def record_incident(
        self,
        *,
        kind: str,
        owner: str,
        severity: str = "warning",
        session_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None: ...


@dataclass(slots=True)
class LiveBrowserIncident:
    kind: str
    owner: str
    severity: str
    session_id: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


class InMemoryLiveBrowserTelemetry:
    def __init__(self) -> None:
        self._counts: dict[tuple[str, tuple[tuple[str, str], ...]], int] = {}
        self.incidents: list[LiveBrowserIncident] = []

    def increment(self, name: str, value: int = 1, **labels: str) -> None:
        key = (name, _freeze_labels(labels))
        self._counts[key] = self._counts.get(key, 0) + value
        _emit_metric_count(name, value, labels)

    def get_count(self, name: str, **labels: str) -> int:
        return self._counts.get((name, _freeze_labels(labels)), 0)

    def record_incident(
        self,
        *,
        kind: str,
        owner: str,
        severity: str = "warning",
        session_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        incident_details = dict(details or {})
        self.incidents.append(
            LiveBrowserIncident(
                kind=kind,
                owner=owner,
                severity=severity,
                session_id=session_id,
                details=incident_details,
            )
        )
        _emit_incident_event(
            kind=kind,
            owner=owner,
            severity=severity,
            session_id=session_id,
            details=incident_details,
        )


class RedisBackedLiveBrowserTelemetry:
    """Durable Redis-backed counters and incident storage for rollout operations."""

    def __init__(
        self,
        redis_client: Any,
        *,
        key_prefix: str = "live_browser:telemetry",
        ttl_seconds: int = 7 * 24 * 60 * 60,
    ) -> None:
        self._redis = redis_client
        self._key_prefix = key_prefix
        self._ttl_seconds = ttl_seconds

    def _counts_key(self, name: str) -> str:
        return f"{self._key_prefix}:counts:{name}"

    def _incidents_key(self) -> str:
        return f"{self._key_prefix}:incidents"

    def increment(self, name: str, value: int = 1, **labels: str) -> None:
        field_name = json.dumps(sorted(labels.items()))
        key = self._counts_key(name)
        self._redis.hincrby(key, field_name, value)
        self._redis.expire(key, self._ttl_seconds)
        _emit_metric_count(name, value, labels)

    def get_count(self, name: str, **labels: str) -> int:
        field_name = json.dumps(sorted(labels.items()))
        raw = self._redis.hget(self._counts_key(name), field_name)
        return int(raw or 0)

    def record_incident(
        self,
        *,
        kind: str,
        owner: str,
        severity: str = "warning",
        session_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        incident_details = dict(details or {})
        payload = {
            "kind": kind,
            "owner": owner,
            "severity": severity,
            "session_id": session_id,
            "details": incident_details,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        key = self._incidents_key()
        self._redis.rpush(key, json.dumps(payload))
        self._redis.expire(key, self._ttl_seconds)
        _emit_incident_event(
            kind=kind,
            owner=owner,
            severity=severity,
            session_id=session_id,
            details=incident_details,
        )

    def get_incidents(self) -> list[dict[str, Any]]:
        raw = self._redis.lrange(self._incidents_key(), 0, -1)
        return [json.loads(item) for item in raw]
