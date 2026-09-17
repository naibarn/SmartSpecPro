"""Durable background processing for governed Vectorize cutover backfills."""

from __future__ import annotations

import os

import structlog

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.services.job_control_plane import dispatch_python_task
from app.services.library_backfill_service import run_backfill_campaign_batch
from app.tasks.media_tasks import _run_async

logger = structlog.get_logger()

MAX_BATCHES_PER_RUN = 100
BACKFILL_BATCH_SIZE = 100
BACKFILL_MAX_ENQUEUE = 25
RESCHEDULE_SECONDS = 10


@celery_app.task(
    bind=True,
    name="app.tasks.vector_db_backfill_tasks.run_vector_db_backfill_campaign",
    queue="media",
    max_retries=3,
)
def run_vector_db_backfill_campaign(self, campaign_id: int):
    """Process bounded campaign batches and reschedule until complete."""
    try:
        return _run_async(_run_campaign(int(campaign_id)))
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "vector_db_backfill_campaign_failed",
            campaign_id=campaign_id,
            error=str(exc),
        )
        raise self.retry(exc=exc, countdown=RESCHEDULE_SECONDS * 3)


async def _run_campaign(campaign_id: int) -> dict:
    async with AsyncSessionLocal() as db:
        last_result: dict = {"campaign_id": campaign_id, "status": "unknown"}
        for _ in range(MAX_BATCHES_PER_RUN):
            last_result = await run_backfill_campaign_batch(
                db,
                campaign_id=campaign_id,
                batch_size=BACKFILL_BATCH_SIZE,
                max_enqueue=BACKFILL_MAX_ENQUEUE,
                dry_run=False,
                paused=False,
            )
            if str(last_result.get("status") or "").lower() == "completed":
                logger.info(
                    "vector_db_backfill_campaign_completed",
                    campaign_id=campaign_id,
                    counters=last_result.get("counters"),
                )
                return {"status": "completed", **last_result}

        next_cursor = last_result.get("next_cursor") or last_result.get("cursor") or 0
        dispatch_python_task(
            run_vector_db_backfill_campaign.name,
            args=[campaign_id],
            tenant_id=os.getenv("FEATURE_186_SYSTEM_TENANT_ID"),
            idempotency_key=f"vectorize:backfill:campaign:{campaign_id}:cursor:{int(next_cursor)}",
            countdown=RESCHEDULE_SECONDS,
            correlation_id=f"vectorize:backfill:{campaign_id}",
            legacy_task=run_vector_db_backfill_campaign,
        )
        return {
            "status": "rescheduled",
            "campaign_id": campaign_id,
            "last_batch": last_result,
        }
