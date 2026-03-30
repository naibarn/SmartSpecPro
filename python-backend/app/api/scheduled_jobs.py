"""Internal API for Celery Beat scheduled job monitoring.

Exposes beat schedule configuration and run history for admin dashboard.
"""

from __future__ import annotations

import os
import secrets
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Depends, Query
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/scheduled-jobs", tags=["Scheduled Jobs"])


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
) -> bool:
    expected = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
    if not expected:
        raise HTTPException(status_code=500, detail="Gateway token not configured")
    if not x_internal_token:
        raise HTTPException(status_code=401, detail="Missing X-Internal-Token")
    if not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid token")
    return True


_DOW_NAMES = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}


def _parse_schedule(sched) -> tuple[str, str, int | None]:
    """Parse a Celery schedule into (type, human_label, interval_seconds).

    Returns:
        ("crontab", "Daily at 03:00 UTC", None)
        ("interval", "Every 15 minutes", 900)
    """
    if sched is None:
        return ("unknown", "Unknown", None)

    # Handle crontab
    if hasattr(sched, "hour") and hasattr(sched, "minute"):
        try:
            # Extract values from crontab fields
            minute = _crontab_field_value(sched.minute)
            hour = _crontab_field_value(sched.hour)
            dow = _crontab_field_value(getattr(sched, "day_of_week", None))

            minute_str = f"{minute:02d}" if isinstance(minute, int) else str(minute)
            hour_str = f"{hour:02d}" if isinstance(hour, int) else str(hour)

            if dow is not None and dow != "*":
                dow_name = _DOW_NAMES.get(dow, str(dow)) if isinstance(dow, int) else str(dow)
                return ("crontab", f"Weekly {dow_name} at {hour_str}:{minute_str} UTC", None)
            elif hour != "*" and isinstance(hour, int):
                return ("crontab", f"Daily at {hour_str}:{minute_str} UTC", None)
            else:
                return ("crontab", f"Cron: {minute_str} {hour_str} UTC", None)
        except Exception:
            return ("crontab", str(sched), None)

    # Handle interval (timedelta or seconds)
    if isinstance(sched, (int, float)):
        return ("interval", _interval_label(sched), int(sched))

    if hasattr(sched, "total_seconds"):
        seconds = int(sched.total_seconds())
        return ("interval", _interval_label(seconds), seconds)

    return ("unknown", str(sched)[:50], None)


def _crontab_field_value(field):
    """Extract a single int from a crontab field, or '*' for wildcards."""
    if field is None:
        return "*"
    # celery crontab fields are sets like {0, 15, 30, 45}
    if hasattr(field, "__iter__") and not isinstance(field, str):
        items = list(field)
        if len(items) == 1:
            return items[0]
        # Check if it's "every" (all values present)
        if len(items) >= 24 or len(items) >= 60:
            return "*"
        # For small sets (e.g., hour={0, 6, 12, 18}), pick first
        return items[0] if items else "*"
    try:
        return int(field)
    except (TypeError, ValueError):
        return "*"


def _interval_label(seconds: float) -> str:
    """Convert seconds to human-readable interval."""
    s = int(seconds)
    if s < 60:
        return f"Every {s} seconds"
    if s < 3600:
        m = s // 60
        return f"Every {m} minute{'s' if m != 1 else ''}"
    if s < 86400:
        h = s // 3600
        return f"Every {h} hour{'s' if h != 1 else ''}"
    d = s // 86400
    return f"Every {d} day{'s' if d != 1 else ''}"


@router.get("/schedule", dependencies=[Depends(_verify_internal_token)])
async def get_beat_schedule():
    """Return all Celery Beat scheduled tasks with their schedule configuration."""
    from app.core.celery_app import celery_app

    schedule = celery_app.conf.beat_schedule or {}
    tasks = []
    for name, config in schedule.items():
        sched = config.get("schedule")
        schedule_type, human_label, interval_seconds = _parse_schedule(sched)

        tasks.append({
            "name": name,
            "task": config.get("task", ""),
            "scheduleType": schedule_type,
            "scheduleLabel": human_label,
            "intervalSeconds": interval_seconds,
            "enabled": True,
        })

    # Sort: crontab first (daily/weekly), then intervals by frequency
    tasks.sort(key=lambda t: (0 if t["scheduleType"] == "crontab" else 1, t.get("intervalSeconds") or 0))
    return {"tasks": tasks, "total": len(tasks)}


@router.get("/runs", dependencies=[Depends(_verify_internal_token)])
async def get_job_runs(
    task_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Return execution history for scheduled jobs."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    conditions = []
    params: dict = {"limit": limit, "offset": offset}

    if task_name:
        conditions.append('"taskName" = :task_name')
        params["task_name"] = task_name
    if status:
        conditions.append("status = :status")
        params["status"] = status

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    async with AsyncSessionLocal() as session:
        # Get runs
        result = await session.execute(
            text(
                f'SELECT id, "taskName", "taskId", status, "startedAt", "completedAt", '
                f'"durationMs", result, "errorMessage", "retryCount" '
                f'FROM scheduled_job_runs {where_clause} '
                f'ORDER BY "startedAt" DESC LIMIT :limit OFFSET :offset'
            ),
            params,
        )
        runs = [
            {
                "id": r[0], "taskName": r[1], "taskId": r[2], "status": r[3],
                "startedAt": r[4].isoformat() if r[4] else None,
                "completedAt": r[5].isoformat() if r[5] else None,
                "durationMs": r[6], "result": r[7][:500] if r[7] else None,
                "errorMessage": r[8][:500] if r[8] else None,
                "retryCount": r[9],
            }
            for r in result.fetchall()
        ]

        # Get total count
        count_result = await session.execute(
            text(f'SELECT count(*) FROM scheduled_job_runs {where_clause}'),
            {k: v for k, v in params.items() if k not in ("limit", "offset")},
        )
        total = count_result.scalar() or 0

    return {"runs": runs, "total": total}


@router.get("/stats", dependencies=[Depends(_verify_internal_token)])
async def get_job_stats():
    """Return aggregated stats for each scheduled task (last 7 days)."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(
                'SELECT "taskName", '
                'count(*) as total_runs, '
                'count(*) FILTER (WHERE status = \'success\') as success_count, '
                'count(*) FILTER (WHERE status = \'failure\') as failure_count, '
                'avg("durationMs") FILTER (WHERE status = \'success\') as avg_duration_ms, '
                'max("startedAt") as last_run_at '
                'FROM scheduled_job_runs '
                'WHERE "startedAt" > NOW() - INTERVAL \'7 days\' '
                'GROUP BY "taskName" '
                'ORDER BY "taskName"'
            ),
        )

        stats = [
            {
                "taskName": r[0],
                "totalRuns": r[1],
                "successCount": r[2],
                "failureCount": r[3],
                "avgDurationMs": round(float(r[4])) if r[4] else None,
                "lastRunAt": r[5].isoformat() if r[5] else None,
                "successRate": round(r[2] / r[1] * 100, 1) if r[1] > 0 else 0,
            }
            for r in result.fetchall()
        ]

    return {"stats": stats}
