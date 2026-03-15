"""Celery tasks for live-browser readiness publishing and maintenance."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from redis import Redis

from app.core.celery_app import celery_app
from app.core.config import settings
from app.services.live_browser_maintenance import (
    assess_live_browser_provider_readiness,
    run_live_browser_maintenance,
)
from app.services.live_browser_observability import RedisBackedLiveBrowserTelemetry
from app.services.live_browser_runtime import (
    get_live_browser_adapter,
    get_live_browser_session_manager,
)

logger = logging.getLogger(__name__)

LIVE_BROWSER_READINESS_KEY = "live-browser:readiness"
LIVE_BROWSER_READINESS_TTL_SECONDS = 5 * 60


def _get_sync_redis() -> Redis:
    return Redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )


def build_live_browser_readiness_snapshot(
    *,
    manager=None,
    adapter=None,
    now: datetime | None = None,
) -> dict[str, Any]:
    timestamp = now or datetime.now(UTC)
    runtime_ready = True
    runtime_failures: list[str] = []
    runtime_details: dict[str, Any] = {}
    provider_details: dict[str, Any] = {}

    manager = manager or get_live_browser_session_manager()
    adapter = adapter or get_live_browser_adapter()

    try:
        sessions = manager.list_sessions()
        runtime_details["sessionCount"] = len(sessions)
    except Exception as exc:
        runtime_ready = False
        runtime_failures.append("live_runtime_unready")
        runtime_details["error"] = str(exc)

    provider_readiness = assess_live_browser_provider_readiness(adapter)
    provider_details.update(provider_readiness.details)

    return {
        "runtimeReady": runtime_ready,
        "providerReady": provider_readiness.ready,
        "runtimeFailures": runtime_failures,
        "providerFailures": list(provider_readiness.failures),
        "runtimeDetails": runtime_details,
        "providerDetails": provider_details,
        "checkedAt": timestamp.isoformat(),
    }


def run_live_browser_maintenance_job(
    *,
    manager=None,
    telemetry=None,
    now: datetime | None = None,
) -> dict[str, int]:
    manager = manager or get_live_browser_session_manager()
    telemetry = telemetry or RedisBackedLiveBrowserTelemetry(_get_sync_redis())
    result = run_live_browser_maintenance(
        manager,
        now=now,
        telemetry=telemetry,
    )
    return {
        "provisioning_failed": result.provisioning_failed,
        "sessions_expired": result.sessions_expired,
        "controller_leases_expired": result.controller_leases_expired,
        "idempotency_rows_deleted": result.idempotency_rows_deleted,
    }


@celery_app.task(name="app.tasks.live_browser_tasks.publish_live_browser_readiness_snapshot")
def publish_live_browser_readiness_snapshot() -> dict[str, Any]:
    snapshot = build_live_browser_readiness_snapshot()
    redis_client = _get_sync_redis()
    redis_client.setex(
        LIVE_BROWSER_READINESS_KEY,
        LIVE_BROWSER_READINESS_TTL_SECONDS,
        json.dumps(snapshot),
    )
    logger.info("live_browser_readiness_snapshot_published", extra=snapshot)
    return snapshot


@celery_app.task(name="app.tasks.live_browser_tasks.run_live_browser_maintenance")
def run_live_browser_maintenance_task() -> dict[str, int]:
    result = run_live_browser_maintenance_job()
    logger.info("live_browser_maintenance_completed", extra=result)
    return result
