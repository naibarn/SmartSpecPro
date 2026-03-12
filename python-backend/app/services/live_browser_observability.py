"""Telemetry helpers for live-browser rollout operations."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol


def _freeze_labels(labels: dict[str, str]) -> tuple[tuple[str, str], ...]:
    return tuple(sorted(labels.items()))


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
        self.incidents.append(
            LiveBrowserIncident(
                kind=kind,
                owner=owner,
                severity=severity,
                session_id=session_id,
                details=dict(details or {}),
            )
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
        payload = {
            "kind": kind,
            "owner": owner,
            "severity": severity,
            "session_id": session_id,
            "details": dict(details or {}),
            "timestamp": datetime.now(UTC).isoformat(),
        }
        key = self._incidents_key()
        self._redis.rpush(key, json.dumps(payload))
        self._redis.expire(key, self._ttl_seconds)

    def get_incidents(self) -> list[dict[str, Any]]:
        raw = self._redis.lrange(self._incidents_key(), 0, -1)
        return [json.loads(item) for item in raw]
