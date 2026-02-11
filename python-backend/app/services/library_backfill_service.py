"""Backfill orchestration controls for library indexing jobs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
from app.services.library_indexing_service import (
    PENDING_STATUS,
    PROCESSING_STATUS,
    RETRY_PENDING_STATUS,
    enqueue_library_index_job,
)
from app.services.library_observability import emit_metric, log_observability_event

ACTIVE_JOB_STATUSES = (PENDING_STATUS, PROCESSING_STATUS, RETRY_PENDING_STATUS)
ELIGIBLE_ITEM_STATUSES = ("ready", "failed", "indexing")


def _candidate_query(*, tenant_id: str | None, cursor: int):
    has_chunks = exists(
        select(LibraryChunk.id).where(LibraryChunk.library_item_id == LibraryItem.id)
    )
    has_active_job = exists(
        select(LibraryIndexJob.id).where(
            and_(
                LibraryIndexJob.library_item_id == LibraryItem.id,
                LibraryIndexJob.status.in_(ACTIVE_JOB_STATUSES),
            )
        )
    )

    predicates = [
        LibraryItem.id > cursor,
        LibraryItem.deleted_at.is_(None),
        LibraryItem.status.in_(ELIGIBLE_ITEM_STATUSES),
        ~has_chunks,
        ~has_active_job,
    ]
    if tenant_id is not None:
        predicates.append(LibraryItem.tenant_id == tenant_id)

    return (
        select(LibraryItem.id, LibraryItem.tenant_id)
        .where(and_(*predicates))
        .order_by(LibraryItem.id.asc())
    )


async def _count_candidates(db: AsyncSession, *, tenant_id: str | None, cursor: int) -> int:
    query = _candidate_query(tenant_id=tenant_id, cursor=cursor).subquery()
    count = await db.scalar(select(func.count()).select_from(query))
    return int(count or 0)


async def run_library_backfill_batch(
    db: AsyncSession,
    *,
    tenant_id: str | None = None,
    cursor: int = 0,
    batch_size: int = 100,
    dry_run: bool = True,
    paused: bool = False,
    max_enqueue: int = 25,
) -> dict[str, Any]:
    """Execute one backfill slice with pause/resume and throttle controls."""
    cursor = max(cursor, 0)
    cap = max(1, min(batch_size, max_enqueue))

    if paused:
        log_observability_event(
            "library_backfill_paused",
            tenant_id=tenant_id,
            cursor=cursor,
            batch_size=batch_size,
            max_enqueue=max_enqueue,
        )
        emit_metric("library.backfill.paused_total", tenant_id=tenant_id)
        return {
            "paused": True,
            "dry_run": dry_run,
            "cursor": cursor,
            "next_cursor": cursor,
            "candidate_item_ids": [],
            "enqueued_jobs": 0,
            "estimated_remaining": await _count_candidates(db, tenant_id=tenant_id, cursor=cursor),
        }

    emit_metric("library.backfill.batch_started_total", tenant_id=tenant_id, dry_run=dry_run)
    estimated_remaining = await _count_candidates(db, tenant_id=tenant_id, cursor=cursor)

    rows = (
        (
            await db.execute(
                _candidate_query(tenant_id=tenant_id, cursor=cursor).limit(cap)
            )
        )
        .all()
    )
    candidate_item_ids = [row.id for row in rows]
    next_cursor = candidate_item_ids[-1] if candidate_item_ids else cursor
    emit_metric(
        "library.backfill.candidate_selected_total",
        tenant_id=tenant_id,
        count=len(candidate_item_ids),
    )

    if dry_run:
        log_observability_event(
            "library_backfill_dry_run",
            tenant_id=tenant_id,
            cursor=cursor,
            next_cursor=next_cursor,
            estimated_remaining=estimated_remaining,
            candidate_item_ids=candidate_item_ids,
        )
        return {
            "paused": False,
            "dry_run": True,
            "cursor": cursor,
            "next_cursor": next_cursor,
            "candidate_item_ids": candidate_item_ids,
            "enqueued_jobs": 0,
            "estimated_remaining": estimated_remaining,
        }

    created_jobs = 0
    created_job_ids: list[int] = []
    enqueue_attempted = 0
    for row in rows:
        enqueue_attempted += 1
        result = await enqueue_library_index_job(
            db,
            row.id,
            tenant_id=row.tenant_id,
            job_type="backfill_index",
            run_at=datetime.utcnow(),
        )
        if result.get("created"):
            created_jobs += 1
            created_job_ids.append(int(result["job_id"]))

    emit_metric(
        "library.backfill.jobs_enqueued_total",
        tenant_id=tenant_id,
        enqueued=created_jobs,
        attempted=enqueue_attempted,
    )
    log_observability_event(
        "library_backfill_batch_completed",
        tenant_id=tenant_id,
        cursor=cursor,
        next_cursor=next_cursor,
        candidate_item_ids=candidate_item_ids,
        created_job_ids=created_job_ids,
        enqueued_jobs=created_jobs,
        enqueue_attempted=enqueue_attempted,
    )

    return {
        "paused": False,
        "dry_run": False,
        "cursor": cursor,
        "next_cursor": next_cursor,
        "candidate_item_ids": candidate_item_ids,
        "enqueued_jobs": created_jobs,
        "estimated_remaining": estimated_remaining,
        "created_job_ids": created_job_ids,
        "enqueue_attempted": enqueue_attempted,
    }
