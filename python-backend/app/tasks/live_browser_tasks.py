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


def _readiness_ttl_seconds() -> int:
    return int(settings.LIVE_BROWSER_READINESS_TTL_SECONDS)


def _readiness_publisher() -> str:
    return settings.LIVE_BROWSER_READINESS_PUBLISHER


def _readiness_owner() -> str:
    return settings.LIVE_BROWSER_READINESS_OWNER


def _readiness_runbook_url() -> str:
    return settings.LIVE_BROWSER_READINESS_RUNBOOK_URL


def _readiness_publish_interval_seconds() -> int:
    return int(settings.LIVE_BROWSER_READINESS_PUBLISH_INTERVAL_SECONDS)


def _readiness_max_age_seconds() -> int:
    return int(settings.LIVE_BROWSER_READINESS_MAX_AGE_SECONDS)


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
    telemetry=None,
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

    if telemetry is not None:
        telemetry.increment(
            "live_browser_runtime_readiness_checks_total",
            ready=str(runtime_ready).lower(),
        )
        if not runtime_ready:
            telemetry.record_incident(
                kind="runtime_readiness_failed",
                owner="python",
                severity="error",
                details={"failures": list(runtime_failures), "details": dict(runtime_details)},
            )

    provider_readiness = assess_live_browser_provider_readiness(adapter, telemetry=telemetry)
    provider_details.update(provider_readiness.details)

    return {
        "runtimeReady": runtime_ready,
        "providerReady": provider_readiness.ready,
        "runtimeFailures": runtime_failures,
        "providerFailures": list(provider_readiness.failures),
        "runtimeDetails": runtime_details,
        "providerDetails": provider_details,
        "publisher": _readiness_publisher(),
        "owner": _readiness_owner(),
        "runbookUrl": _readiness_runbook_url(),
        "publishIntervalSeconds": _readiness_publish_interval_seconds(),
        "maxAgeSeconds": _readiness_max_age_seconds(),
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


def inspect_live_browser_readiness_snapshot(
    *,
    redis_client=None,
    telemetry=None,
    now: datetime | None = None,
) -> dict[str, Any]:
    redis_client = redis_client or _get_sync_redis()
    telemetry = telemetry or RedisBackedLiveBrowserTelemetry(redis_client)
    timestamp = now or datetime.now(UTC)
    raw = redis_client.get(LIVE_BROWSER_READINESS_KEY)

    result = {
        "healthy": True,
        "reason": "ok",
        "checkedAt": None,
        "publisher": None,
        "owner": None,
        "runbookUrl": None,
        "publishIntervalSeconds": None,
        "maxAgeSeconds": None,
    }

    if raw is None:
        telemetry.increment("live_browser_readiness_watchdog_checks_total", healthy="false", reason="missing")
        telemetry.record_incident(
            kind="readiness_snapshot_missing",
            owner="python",
            severity="error",
            details={"key": LIVE_BROWSER_READINESS_KEY},
        )
        return {
            **result,
            "healthy": False,
            "reason": "missing",
        }

    try:
        snapshot = json.loads(raw)
    except json.JSONDecodeError:
        telemetry.increment("live_browser_readiness_watchdog_checks_total", healthy="false", reason="invalid")
        telemetry.record_incident(
            kind="readiness_snapshot_invalid",
            owner="python",
            severity="error",
            details={"key": LIVE_BROWSER_READINESS_KEY},
        )
        return {
            **result,
            "healthy": False,
            "reason": "invalid",
        }

    checked_at = snapshot.get("checkedAt")
    publisher = snapshot.get("publisher")
    owner = snapshot.get("owner")
    runbook_url = snapshot.get("runbookUrl")
    publish_interval_seconds = snapshot.get("publishIntervalSeconds")
    max_age_seconds = snapshot.get("maxAgeSeconds")
    parsed_checked_at: datetime | None = None
    if isinstance(checked_at, str) and checked_at:
        try:
            parsed_checked_at = datetime.fromisoformat(checked_at)
            if parsed_checked_at.tzinfo is None:
                parsed_checked_at = parsed_checked_at.replace(tzinfo=UTC)
            else:
                parsed_checked_at = parsed_checked_at.astimezone(UTC)
        except ValueError:
            parsed_checked_at = None

    if parsed_checked_at is None:
        telemetry.increment(
            "live_browser_readiness_watchdog_checks_total",
            healthy="false",
            reason="invalid_checked_at",
        )
        telemetry.record_incident(
            kind="readiness_snapshot_invalid",
            owner="python",
            severity="error",
            details={"key": LIVE_BROWSER_READINESS_KEY, "publisher": publisher, "checkedAt": checked_at},
        )
        return {
            **result,
            "healthy": False,
            "reason": "invalid_checked_at",
            "publisher": publisher,
            "owner": owner if isinstance(owner, str) else None,
            "runbookUrl": runbook_url if isinstance(runbook_url, str) else None,
            "publishIntervalSeconds": int(publish_interval_seconds)
            if isinstance(publish_interval_seconds, (int, float)) and publish_interval_seconds > 0
            else None,
            "maxAgeSeconds": int(max_age_seconds)
            if isinstance(max_age_seconds, (int, float)) and max_age_seconds > 0
            else None,
        }

    missing_metadata: list[str] = []
    if not isinstance(publisher, str) or not publisher.strip():
        missing_metadata.append("publisher")
    if not isinstance(owner, str) or not owner.strip():
        missing_metadata.append("owner")
    if not isinstance(runbook_url, str) or not runbook_url.strip():
        missing_metadata.append("runbookUrl")
    if not isinstance(publish_interval_seconds, (int, float)) or publish_interval_seconds <= 0:
        missing_metadata.append("publishIntervalSeconds")
    if not isinstance(max_age_seconds, (int, float)) or max_age_seconds <= 0:
        missing_metadata.append("maxAgeSeconds")

    if missing_metadata:
        telemetry.increment(
            "live_browser_readiness_watchdog_checks_total",
            healthy="false",
            reason="metadata_missing",
        )
        telemetry.record_incident(
            kind="readiness_snapshot_metadata_missing",
            owner="python",
            severity="error",
            details={
                "key": LIVE_BROWSER_READINESS_KEY,
                "checkedAt": parsed_checked_at.isoformat(),
                "missing": missing_metadata,
                "publisher": publisher if isinstance(publisher, str) else None,
                "owner": owner if isinstance(owner, str) else None,
                "runbookUrl": runbook_url if isinstance(runbook_url, str) else None,
                "publishIntervalSeconds": int(publish_interval_seconds)
                if isinstance(publish_interval_seconds, (int, float)) and publish_interval_seconds > 0
                else None,
                "maxAgeSeconds": int(max_age_seconds)
                if isinstance(max_age_seconds, (int, float)) and max_age_seconds > 0
                else None,
            },
        )
        return {
            **result,
            "healthy": False,
            "reason": "metadata_missing",
            "checkedAt": parsed_checked_at.isoformat(),
            "publisher": publisher if isinstance(publisher, str) else None,
            "owner": owner if isinstance(owner, str) else None,
            "runbookUrl": runbook_url if isinstance(runbook_url, str) else None,
            "publishIntervalSeconds": int(publish_interval_seconds)
            if isinstance(publish_interval_seconds, (int, float)) and publish_interval_seconds > 0
            else None,
            "maxAgeSeconds": int(max_age_seconds)
            if isinstance(max_age_seconds, (int, float)) and max_age_seconds > 0
            else None,
        }

    stale_after_seconds = (
        int(max_age_seconds)
        if isinstance(max_age_seconds, (int, float)) and max_age_seconds > 0
        else _readiness_max_age_seconds()
    )
    age_seconds = (timestamp - parsed_checked_at).total_seconds()
    if age_seconds > stale_after_seconds:
        telemetry.increment("live_browser_readiness_watchdog_checks_total", healthy="false", reason="stale")
        telemetry.record_incident(
            kind="readiness_snapshot_stale",
            owner="python",
            severity="error",
            details={
                "publisher": publisher,
                "checkedAt": parsed_checked_at.isoformat(),
                "ageSeconds": age_seconds,
            },
        )
        return {
            **result,
            "healthy": False,
            "reason": "stale",
            "checkedAt": parsed_checked_at.isoformat(),
            "publisher": publisher,
            "owner": owner if isinstance(owner, str) else None,
            "runbookUrl": runbook_url if isinstance(runbook_url, str) else None,
            "publishIntervalSeconds": int(publish_interval_seconds)
            if isinstance(publish_interval_seconds, (int, float)) and publish_interval_seconds > 0
            else None,
            "maxAgeSeconds": stale_after_seconds,
        }

    telemetry.increment("live_browser_readiness_watchdog_checks_total", healthy="true", reason="ok")
    return {
        **result,
        "checkedAt": parsed_checked_at.isoformat(),
        "publisher": publisher if isinstance(publisher, str) else None,
        "owner": owner if isinstance(owner, str) else None,
        "runbookUrl": runbook_url if isinstance(runbook_url, str) else None,
        "publishIntervalSeconds": int(publish_interval_seconds)
        if isinstance(publish_interval_seconds, (int, float)) and publish_interval_seconds > 0
        else None,
        "maxAgeSeconds": stale_after_seconds,
    }


@celery_app.task(name="app.tasks.live_browser_tasks.publish_live_browser_readiness_snapshot")
def publish_live_browser_readiness_snapshot() -> dict[str, Any]:
    redis_client = _get_sync_redis()
    telemetry = RedisBackedLiveBrowserTelemetry(redis_client)
    snapshot = build_live_browser_readiness_snapshot(telemetry=telemetry)

    try:
        redis_client.setex(
            LIVE_BROWSER_READINESS_KEY,
            _readiness_ttl_seconds(),
            json.dumps(snapshot),
        )
    except Exception as exc:
        telemetry.increment("live_browser_readiness_publish_failures_total")
        telemetry.record_incident(
            kind="readiness_snapshot_publish_failed",
            owner="python",
            severity="error",
            details={"error": str(exc)},
        )
        logger.exception("live_browser_readiness_snapshot_publish_failed", extra={"error": str(exc)})
        raise

    telemetry.increment(
        "live_browser_readiness_published_total",
        ready=str(snapshot["runtimeReady"] and snapshot["providerReady"]).lower(),
    )
    if not snapshot["runtimeReady"] or not snapshot["providerReady"]:
        telemetry.record_incident(
            kind="readiness_snapshot_unready",
            owner="python",
            severity="warning",
            details={
                "runtimeFailures": list(snapshot["runtimeFailures"]),
                "providerFailures": list(snapshot["providerFailures"]),
            },
        )

    logger.info("live_browser_readiness_snapshot_published", extra=snapshot)
    return snapshot


@celery_app.task(name="app.tasks.live_browser_tasks.run_live_browser_maintenance")
def run_live_browser_maintenance_task() -> dict[str, int]:
    result = run_live_browser_maintenance_job()
    logger.info("live_browser_maintenance_completed", extra=result)
    return result


@celery_app.task(name="app.tasks.live_browser_tasks.watch_live_browser_readiness_snapshot")
def watch_live_browser_readiness_snapshot() -> dict[str, Any]:
    result = inspect_live_browser_readiness_snapshot()
    if result["healthy"]:
        logger.info("live_browser_readiness_watchdog_ok", extra=result)
    else:
        logger.warning("live_browser_readiness_watchdog_unhealthy", extra=result)
    return result
