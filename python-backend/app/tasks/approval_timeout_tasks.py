"""Canonical worker job for expiring durable approval requests."""

import asyncio

import structlog

from app.core.job_task_registry import job_task_registry
from app.tasks.unified_job_task import HardTaskRetryRequested

logger = structlog.get_logger(__name__)


@job_task_registry.task(
    name="app.tasks.approval_timeout_tasks.check_expired_approvals",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def check_expired_approvals(self):
    """Check for expired approval requests and auto-reject them.

    The canonical worker_jobs scheduler invokes this to mark durable approval
    rows expired. Legacy LangGraph interrupt records are not resumed here.
    """
    try:
        asyncio.run(_check_expired_approvals_async())
    except Exception as exc:
        logger.exception("check_expired_approvals task failed; canonical worker_jobs will retry")
        raise HardTaskRetryRequested() from exc


# ---------------------------------------------------------------------------
# Async implementation
# ---------------------------------------------------------------------------


async def _check_expired_approvals_async():
    """Mark expired durable approval requests as terminal."""
    expired_count = await _expire_db_requests()
    if expired_count:
        logger.info(
            "Expired approvals check complete",
            db_expired=expired_count,
        )
    else:
        logger.debug("No expired approvals found")


# ---------------------------------------------------------------------------
# Phase 1 -- Database cleanup
# ---------------------------------------------------------------------------


async def _expire_db_requests() -> int:
    """Mark expired pending approval requests as EXPIRED in the database.

    Uses ApprovalDBService.cleanup_expired_requests() which finds rows where
    expires_at < now() OR created_at is older than the fallback timeout.

    Returns:
        Number of requests marked as expired.
    """
    from app.core.database import get_db_context
    from app.services.approval_db_service import ApprovalDBService

    try:
        async with get_db_context() as session:
            service = ApprovalDBService(session)
            count = await service.cleanup_expired_requests()

            if count:
                logger.info("approval_db_expired", count=count)

            return count

    except Exception:
        logger.exception("Failed to expire DB approval requests")
        return 0
