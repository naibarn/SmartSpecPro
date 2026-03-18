"""Virtual Admin (System Guardian) internal endpoints."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/internal/virtual-admin")
logger = logging.getLogger(__name__)


@router.get("/celery-health")
async def celery_health() -> dict[str, Any]:
    """Return Celery worker health status for the System Guardian sensor."""
    try:
        from app.core.celery_app import celery_app
        import redis as redis_lib

        # Get active workers
        inspect = celery_app.control.inspect(timeout=3)
        active = inspect.active() or {}
        stats = inspect.stats() or {}
        worker_count = len(stats)
        active_tasks = sum(len(tasks) for tasks in active.values())

        # Get queue lengths from Redis
        queue_lengths: dict[str, int] = {}
        broker_url = celery_app.conf.broker_url
        if broker_url:
            try:
                r = redis_lib.from_url(str(broker_url))
                for queue_name in ["celery", "media", "video", "audio", "presentation"]:
                    length = r.llen(queue_name)
                    if length > 0:
                        queue_lengths[queue_name] = length
                r.close()
            except Exception as e:
                logger.warning(f"Failed to read queue lengths: {e}")

        return {
            "workers": worker_count,
            "activeTasks": active_tasks,
            "queueLengths": queue_lengths,
            "healthy": worker_count > 0,
        }
    except Exception as e:
        logger.error(f"Celery health check failed: {e}")
        return {
            "workers": 0,
            "activeTasks": 0,
            "queueLengths": {},
            "healthy": False,
            "error": "health check unavailable",
        }


@router.post("/restart-worker")
async def restart_worker(request: Request) -> dict[str, Any]:
    """Send shutdown signal to a Celery worker (supervisor/systemd auto-restarts)."""
    try:
        body = await request.json()
        worker_name = body.get("worker_name")
        from app.core.celery_app import celery_app

        if worker_name:
            celery_app.control.broadcast("shutdown", destination=[worker_name])
        else:
            celery_app.control.broadcast("shutdown")
        return {"success": True, "message": f"Shutdown signal sent to {worker_name or 'all workers'}"}
    except Exception as e:
        logger.error(f"Worker restart failed: {e}")
        return {"success": False, "error": "restart failed"}


@router.post("/revoke-task")
async def revoke_task(request: Request) -> dict[str, Any]:
    """Revoke/terminate a stuck Celery task."""
    try:
        body = await request.json()
        task_id = body.get("task_id")
        terminate = body.get("terminate", False)
        if not task_id:
            return {"success": False, "error": "task_id required"}
        from app.core.celery_app import celery_app

        celery_app.control.revoke(task_id, terminate=terminate)
        return {"success": True, "message": f"Task {task_id} revoked (terminate={terminate})"}
    except Exception as e:
        logger.error(f"Task revoke failed: {e}")
        return {"success": False, "error": "revoke failed"}
