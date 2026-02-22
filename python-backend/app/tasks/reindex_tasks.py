"""Celery tasks for smart re-indexing of library items."""

from __future__ import annotations

import structlog

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.tasks.media_tasks import _run_async

logger = structlog.get_logger()

BATCH_SIZE = 50


@celery_app.task(bind=True, name="smart_reindex_library_items", queue="celery")
def smart_reindex_library_items(self, tenant_id: str | None = None):
    """Re-index all library items with SmartChunker. Runs in batches of 50.

    Uses the existing indexing pipeline (which now uses SmartChunker) by
    enqueuing LibraryIndexJobs. This reuses the retry/deduplication and
    observability infrastructure.

    Args:
        tenant_id: If provided, only re-index items for this tenant.
                   If None, re-index all tenants.
    """
    return _run_async(_smart_reindex_impl(self, tenant_id))


async def _smart_reindex_impl(task, tenant_id: str | None) -> dict:
    """Async implementation for smart_reindex_library_items."""
    from sqlalchemy import and_, func, select, text as sql_text

    from app.models.library import LibraryItem
    from app.services.library_indexing_service import enqueue_library_index_job

    async with AsyncSessionLocal() as session:
        # Count total items to process
        count_q = select(func.count(LibraryItem.id)).where(
            LibraryItem.deleted_at.is_(None),
        )
        if tenant_id:
            count_q = count_q.where(LibraryItem.tenant_id == tenant_id)
        total_items = await session.scalar(count_q) or 0

        if total_items == 0:
            logger.info("smart_reindex_no_items", tenant_id=tenant_id)
            return {"total": 0, "processed": 0, "errors": 0}

        logger.info(
            "smart_reindex_starting",
            tenant_id=tenant_id,
            total_items=total_items,
            batch_size=BATCH_SIZE,
        )

        processed = 0
        errors = 0
        offset = 0

        while offset < total_items:
            # Fetch batch of items
            items_q = (
                select(LibraryItem.id, LibraryItem.tenant_id)
                .where(LibraryItem.deleted_at.is_(None))
                .order_by(LibraryItem.id)
                .offset(offset)
                .limit(BATCH_SIZE)
            )
            if tenant_id:
                items_q = items_q.where(LibraryItem.tenant_id == tenant_id)

            result = await session.execute(items_q)
            items = result.fetchall()

            if not items:
                break

            for item in items:
                try:
                    await enqueue_library_index_job(
                        db=session,
                        tenant_id=item.tenant_id,
                        library_item_id=item.id,
                        job_type="smart_reindex",
                    )
                    processed += 1
                except Exception as exc:
                    logger.warning(
                        "smart_reindex_enqueue_error",
                        item_id=item.id,
                        tenant_id=item.tenant_id,
                        error=str(exc),
                    )
                    errors += 1

            await session.commit()
            offset += BATCH_SIZE

            logger.info(
                "smart_reindex_batch_progress",
                tenant_id=tenant_id,
                processed=processed,
                total=total_items,
                errors=errors,
            )

            # Update Celery task state for progress tracking
            if task and hasattr(task, "update_state"):
                task.update_state(
                    state="PROGRESS",
                    meta={
                        "processed": processed,
                        "total": total_items,
                        "errors": errors,
                    },
                )

    logger.info(
        "smart_reindex_completed",
        tenant_id=tenant_id,
        total=total_items,
        processed=processed,
        errors=errors,
    )

    return {
        "total": total_items,
        "processed": processed,
        "errors": errors,
    }
