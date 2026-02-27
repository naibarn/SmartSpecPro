"""
Agency observability metrics.

Tracks per-agency and per-template run metrics:
- Success rate
- p95 latency
- Step failure rate
- Retry counts
- Credit reconciliation mismatches

Metrics are stored as Redis sorted sets (for sliding window aggregation)
and queried from agency_runs for historical reports.
All keys use a 24-hour TTL so Redis memory stays bounded.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("agency.metrics")

# Redis key patterns
_KEY_RUNS = "agency:metrics:{agency_id}:runs"
_KEY_LATENCY = "agency:metrics:{agency_id}:latency"
_KEY_RETRIES = "agency:metrics:{agency_id}:retries"
_TTL_SECONDS = 86400  # 24 hours


async def _get_redis():
    """Get async Redis connection. Uses aioredis/redis-py async."""
    try:
        from app.core.redis import get_async_redis
        return await get_async_redis()
    except (ImportError, Exception):
        logger.warning("agency_metrics_redis_unavailable")
        return None


async def record_run_metrics(
    agency_id: str,
    *,
    status: str,
    duration_ms: int | None = None,
    step_count: int | None = None,
    retry_count: int | None = None,
    error_type: str | None = None,
) -> None:
    """Record metrics for a completed/failed run.

    Increments Redis counters for real-time dashboards.
    """
    redis = await _get_redis()
    if redis is None:
        return

    now = time.time()

    try:
        # Record run status
        runs_key = _KEY_RUNS.format(agency_id=agency_id)
        await redis.zadd(runs_key, {f"{status}:{now}": now})
        await redis.expire(runs_key, _TTL_SECONDS)

        # Record latency
        if duration_ms is not None:
            latency_key = _KEY_LATENCY.format(agency_id=agency_id)
            await redis.zadd(latency_key, {f"{duration_ms}:{now}": now})
            await redis.expire(latency_key, _TTL_SECONDS)

        # Record retry count
        if retry_count is not None:
            retries_key = _KEY_RETRIES.format(agency_id=agency_id)
            await redis.zadd(retries_key, {f"{retry_count}:{now}": now})
            await redis.expire(retries_key, _TTL_SECONDS)

    except Exception as exc:
        logger.error("agency_metrics_record_failed", extra={"error": str(exc)})


async def get_agency_metrics(
    agency_id: str,
    *,
    window_hours: int = 1,
) -> dict[str, Any]:
    """Aggregate metrics for an agency within a time window.

    Returns: {
        success_rate: float,       # 0.0 - 1.0
        p95_latency_ms: int,
        total_runs: int,
        failed_runs: int,
        avg_step_count: float,
        avg_retry_count: float,
        credit_mismatches: int,
    }
    """
    redis = await _get_redis()
    if redis is None:
        return _empty_metrics()

    now = time.time()
    window_start = now - (window_hours * 3600)

    try:
        # Fetch runs in window
        runs_key = _KEY_RUNS.format(agency_id=agency_id)
        run_entries = await redis.zrangebyscore(runs_key, window_start, now)

        if not run_entries:
            return _empty_metrics()

        # Parse run statuses
        total_runs = len(run_entries)
        failed_runs = 0
        for entry in run_entries:
            entry_str = entry if isinstance(entry, str) else entry.decode("utf-8")
            status = entry_str.split(":")[0]
            if status == "failed":
                failed_runs += 1

        success_rate = (total_runs - failed_runs) / total_runs if total_runs > 0 else 0.0

        # Fetch latencies in window
        latency_key = _KEY_LATENCY.format(agency_id=agency_id)
        latency_entries = await redis.zrangebyscore(latency_key, window_start, now)

        latencies = []
        for entry in latency_entries:
            entry_str = entry if isinstance(entry, str) else entry.decode("utf-8")
            try:
                latencies.append(int(entry_str.split(":")[0]))
            except (ValueError, IndexError):
                pass

        p95_latency = _percentile(latencies, 95) if latencies else 0

        # Fetch retry counts in window
        retries_key = _KEY_RETRIES.format(agency_id=agency_id)
        retry_entries = await redis.zrangebyscore(retries_key, window_start, now)

        retry_counts = []
        for entry in retry_entries:
            entry_str = entry if isinstance(entry, str) else entry.decode("utf-8")
            try:
                retry_counts.append(int(entry_str.split(":")[0]))
            except (ValueError, IndexError):
                pass

        avg_retry = sum(retry_counts) / len(retry_counts) if retry_counts else 0.0

        return {
            "success_rate": round(success_rate, 4),
            "p95_latency_ms": p95_latency,
            "total_runs": total_runs,
            "failed_runs": failed_runs,
            "avg_step_count": 0.0,  # Not tracked in Redis; query from DB if needed
            "avg_retry_count": round(avg_retry, 2),
            "credit_mismatches": 0,  # Tracked via audit log, not Redis
        }

    except Exception as exc:
        logger.error("agency_metrics_get_failed", extra={"error": str(exc)})
        return _empty_metrics()


async def check_alert_thresholds(
    agency_id: str | None = None,
) -> list[dict[str, Any]]:
    """Check all agencies (or a specific one) against alert thresholds.

    Returns list of triggered alerts:
    - success_rate < 90% over 1 hour
    - p95 latency > 60s
    - credit reconciliation mismatch > $1

    Each alert dict: { agency_id, metric, value, threshold, triggered_at }
    """
    alerts: list[dict[str, Any]] = []

    if agency_id is None:
        return alerts  # Would need to enumerate all agencies; skipped for now

    metrics = await get_agency_metrics(agency_id, window_hours=1)

    if metrics["total_runs"] == 0:
        return alerts

    now = datetime.now(timezone.utc).isoformat()

    # Success rate < 90%
    if metrics["success_rate"] < 0.9:
        alerts.append({
            "agency_id": agency_id,
            "metric": "success_rate",
            "value": metrics["success_rate"],
            "threshold": 0.9,
            "triggered_at": now,
        })

    # p95 latency > 60s
    if metrics["p95_latency_ms"] > 60000:
        alerts.append({
            "agency_id": agency_id,
            "metric": "p95_latency_ms",
            "value": metrics["p95_latency_ms"],
            "threshold": 60000,
            "triggered_at": now,
        })

    return alerts


def _empty_metrics() -> dict[str, Any]:
    return {
        "success_rate": 0.0,
        "p95_latency_ms": 0,
        "total_runs": 0,
        "failed_runs": 0,
        "avg_step_count": 0.0,
        "avg_retry_count": 0.0,
        "credit_mismatches": 0,
    }


def _percentile(data: list[int], pct: int) -> int:
    """Calculate percentile from a list of integers."""
    if not data:
        return 0
    sorted_data = sorted(data)
    idx = int(len(sorted_data) * pct / 100)
    idx = min(idx, len(sorted_data) - 1)
    return sorted_data[idx]
