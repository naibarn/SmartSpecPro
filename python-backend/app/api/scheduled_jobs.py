"""Internal monitoring endpoints for worker_jobs scheduled work."""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.core.config import settings

router = APIRouter(prefix="/api/v1/scheduled-jobs", tags=["Scheduled Jobs"])


async def _verify_internal_token(x_internal_token: Optional[str] = Header(None)) -> bool:
    expected = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
    if not expected:
        raise HTTPException(status_code=500, detail="Gateway token not configured")
    if not x_internal_token:
        raise HTTPException(status_code=401, detail="Missing X-Internal-Token")
    if not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid token")
    return True


@router.get("/schedule", dependencies=[Depends(_verify_internal_token)])
async def get_worker_job_schedule():
    """List actual schedules observed in the canonical occurrence ledger."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    query = text('''
        SELECT DISTINCT ON (occ."scheduleId")
          occ."scheduleId", occ."scheduleVersion", job."jobType", job.status,
          occ."occurrenceKey", occ."createdAt"
        FROM worker_job_schedule_occurrences occ
        JOIN worker_jobs job ON job.id = occ."workerJobId"
        ORDER BY occ."scheduleId", occ."createdAt" DESC
    ''')
    async with AsyncSessionLocal() as session:
        result = await session.execute(query)
        tasks = [
            {
                "name": row[0],
                "scheduleVersion": row[1],
                "task": row[2],
                "status": row[3],
                "lastOccurrence": row[4],
                "lastCreatedAt": row[5].isoformat() if row[5] else None,
                "enabled": True,
            }
            for row in result.fetchall()
        ]
    return {"runtime": "worker_jobs", "tasks": tasks, "total": len(tasks)}


@router.get("/runs", dependencies=[Depends(_verify_internal_token)])
async def get_job_runs(
    task_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Return scheduled occurrence executions from worker_jobs."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    filters: list[str] = []
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if task_name:
        filters.append('(occ."scheduleId" = :task_name OR job."jobType" = :task_name)')
        params["task_name"] = task_name
    if status:
        filters.append("job.status = :status")
        params["status"] = status
    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    async with AsyncSessionLocal() as session:
        rows = await session.execute(text(f'''
            SELECT occ.id, occ."scheduleId", occ."workerJobId", job.status,
                   job."startedAt", job."finishedAt", job."errorMessage", job.attempt,
                   job."createdAt", job."jobType"
            FROM worker_job_schedule_occurrences occ
            JOIN worker_jobs job ON job.id = occ."workerJobId"
            {where}
            ORDER BY job."createdAt" DESC
            LIMIT :limit OFFSET :offset
        '''), params)
        runs = [
            {
                "id": row[0], "taskName": row[1], "taskId": row[2], "status": row[3],
                "startedAt": row[4].isoformat() if row[4] else None,
                "completedAt": row[5].isoformat() if row[5] else None,
                "durationMs": None, "result": None,
                "errorMessage": row[6][:500] if row[6] else None,
                "retryCount": max(0, int(row[7]) - 1), "createdAt": row[8].isoformat() if row[8] else None,
                "jobType": row[9],
            }
            for row in rows.fetchall()
        ]
        count = await session.execute(text(f'''
            SELECT count(*) FROM worker_job_schedule_occurrences occ
            JOIN worker_jobs job ON job.id = occ."workerJobId" {where}
        '''), {key: value for key, value in params.items() if key not in {"limit", "offset"}})
        total = int(count.scalar() or 0)
    return {"runs": runs, "total": total}


@router.get("/stats", dependencies=[Depends(_verify_internal_token)])
async def get_job_stats():
    """Aggregate scheduled execution outcomes from worker_jobs for seven days."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        result = await session.execute(text('''
            SELECT job."jobType", count(*) AS total_runs,
                   count(*) FILTER (WHERE job.status = 'succeeded') AS success_count,
                   count(*) FILTER (WHERE job.status IN ('failed', 'expired')) AS failure_count,
                   max(job."createdAt") AS last_run_at
            FROM worker_job_schedule_occurrences occ
            JOIN worker_jobs job ON job.id = occ."workerJobId"
            WHERE job."createdAt" > NOW() - INTERVAL '7 days'
            GROUP BY job."jobType" ORDER BY job."jobType"
        '''))
        stats = [
            {
                "taskName": row[0], "totalRuns": row[1], "successCount": row[2],
                "failureCount": row[3], "avgDurationMs": None,
                "lastRunAt": row[4].isoformat() if row[4] else None,
                "successRate": round(row[2] / row[1] * 100, 1) if row[1] else 0,
            }
            for row in result.fetchall()
        ]
    return {"runtime": "worker_jobs", "stats": stats}
