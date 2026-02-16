"""Backfill orchestration controls for library indexing jobs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library import (
    LibraryBackfillCampaign,
    LibraryChunk,
    LibraryIndexJob,
    LibraryItem,
)
from app.services.library_indexing_service import (
    PENDING_STATUS,
    PROCESSING_STATUS,
    RETRY_PENDING_STATUS,
    enqueue_library_index_job,
)
from app.services.library_observability import emit_metric, log_observability_event

ACTIVE_JOB_STATUSES = (PENDING_STATUS, PROCESSING_STATUS, RETRY_PENDING_STATUS)
ELIGIBLE_ITEM_STATUSES = ("ready", "failed", "indexing")
SUPPORTED_BACKFILL_DOMAINS = ("library", "gallery")
GALLERY_SOURCE = "media_history"


def _normalize_domain(domain: str) -> str:
    normalized = str(domain or "library").strip().lower() or "library"
    if normalized not in SUPPORTED_BACKFILL_DOMAINS:
        raise ValueError(f"unsupported_backfill_domain:{normalized}")
    return normalized


def _normalize_tenant_id(tenant_id: str | int | None) -> str | None:
    if tenant_id is None:
        return None
    value = str(tenant_id).strip()
    return value or None


def _library_candidate_query(*, tenant_id: str | None, cursor: int):
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
        LibraryItem.source != GALLERY_SOURCE,
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


def _gallery_candidate_query(*, tenant_id: str | None, cursor: int):
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

    query = (
        select(LibraryItem.id, LibraryItem.tenant_id)
        .where(
            and_(
                LibraryItem.id > cursor,
                LibraryItem.deleted_at.is_(None),
                LibraryItem.status.in_(ELIGIBLE_ITEM_STATUSES),
                LibraryItem.source == GALLERY_SOURCE,
                ~has_chunks,
                ~has_active_job,
            )
        )
        .order_by(LibraryItem.id.asc())
    )
    if tenant_id is not None:
        query = query.where(LibraryItem.tenant_id == tenant_id)
    return query


async def _count_candidates(
    db: AsyncSession,
    *,
    domain: str,
    tenant_id: str | None,
    cursor: int,
) -> int:
    if domain == "library":
        query = _library_candidate_query(tenant_id=tenant_id, cursor=cursor).subquery()
        count = await db.scalar(select(func.count()).select_from(query))
        return int(count or 0)

    query = _gallery_candidate_query(tenant_id=tenant_id, cursor=cursor).subquery()
    count = await db.scalar(select(func.count()).select_from(query))
    return int(count or 0)


async def load_backfill_candidates(
    db: AsyncSession,
    *,
    domain: str,
    tenant_id: str | int | None,
    cursor: int,
    limit: int,
) -> list[dict[str, Any]]:
    resolved_domain = _normalize_domain(domain)
    resolved_tenant_id = _normalize_tenant_id(tenant_id)
    resolved_cursor = max(cursor, 0)
    resolved_limit = max(limit, 1)

    if resolved_domain == "library":
        rows = (
            (
                await db.execute(
                    _library_candidate_query(
                        tenant_id=resolved_tenant_id,
                        cursor=resolved_cursor,
                    ).limit(resolved_limit)
                )
            )
            .all()
        )
        return [
            {
                "domain": "library",
                "cursor": int(row.id),
                "entity_id": f"library:{row.id}",
                "tenant_id": str(row.tenant_id),
                "library_item_id": int(row.id),
            }
            for row in rows
        ]

    rows = (
        (
            await db.execute(
                _gallery_candidate_query(
                    tenant_id=resolved_tenant_id,
                    cursor=resolved_cursor,
                ).limit(resolved_limit)
            )
        )
        .all()
    )
    return [
        {
            "domain": "gallery",
            "cursor": int(row.id),
            "entity_id": f"gallery:{row.id}",
            "tenant_id": str(row.tenant_id),
            "library_item_id": int(row.id),
        }
        for row in rows
    ]


async def create_backfill_campaign(
    db: AsyncSession,
    *,
    domain: str = "library",
    tenant_id: str | int | None = None,
    cursor: int = 0,
) -> LibraryBackfillCampaign:
    resolved_domain = _normalize_domain(domain)
    resolved_tenant_id = _normalize_tenant_id(tenant_id)
    resolved_cursor = max(cursor, 0)

    campaign = LibraryBackfillCampaign(
        tenant_id=resolved_tenant_id,
        domain=resolved_domain,
        status="queued",
        cursor=resolved_cursor,
        checkpoint_json={"cursor": resolved_cursor},
        diagnostics_json={},
        started_at=datetime.utcnow(),
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


def _campaign_counters(campaign: LibraryBackfillCampaign) -> dict[str, int]:
    return {
        "queued": int(campaign.queued_count or 0),
        "processed": int(campaign.processed_count or 0),
        "succeeded": int(campaign.succeeded_count or 0),
        "failed": int(campaign.failed_count or 0),
        "skipped": int(campaign.skipped_count or 0),
    }


async def run_backfill_campaign_batch(
    db: AsyncSession,
    *,
    campaign_id: int,
    batch_size: int = 100,
    dry_run: bool = True,
    paused: bool = False,
    max_enqueue: int = 25,
) -> dict[str, Any]:
    campaign = await db.scalar(
        select(LibraryBackfillCampaign).where(LibraryBackfillCampaign.id == campaign_id)
    )
    if campaign is None:
        raise LookupError(f"library_backfill_campaign_not_found:{campaign_id}")

    cap = max(1, min(batch_size, max_enqueue))
    estimated_remaining = await _count_candidates(
        db,
        domain=campaign.domain,
        tenant_id=campaign.tenant_id,
        cursor=campaign.cursor or 0,
    )

    if paused:
        campaign.status = "paused"
        campaign.updated_at = datetime.utcnow()
        await db.commit()
        return {
            "campaign_id": campaign.id,
            "domain": campaign.domain,
            "tenant_id": campaign.tenant_id,
            "status": campaign.status,
            "paused": True,
            "dry_run": dry_run,
            "cursor": campaign.cursor,
            "next_cursor": campaign.cursor,
            "candidate_entity_ids": [],
            "estimated_remaining": estimated_remaining,
            "counters": _campaign_counters(campaign),
            "diagnostics": dict(campaign.diagnostics_json or {}),
        }

    candidates = await load_backfill_candidates(
        db,
        domain=campaign.domain,
        tenant_id=campaign.tenant_id,
        cursor=campaign.cursor or 0,
        limit=cap,
    )
    candidate_entity_ids = [str(candidate["entity_id"]) for candidate in candidates]
    next_cursor = int(candidates[-1]["cursor"]) if candidates else int(campaign.cursor or 0)

    if dry_run:
        campaign.status = "running" if candidates else "completed"
        if campaign.status == "completed":
            campaign.completed_at = datetime.utcnow()
        campaign.updated_at = datetime.utcnow()
        await db.commit()
        return {
            "campaign_id": campaign.id,
            "domain": campaign.domain,
            "tenant_id": campaign.tenant_id,
            "status": campaign.status,
            "paused": False,
            "dry_run": True,
            "cursor": campaign.cursor,
            "next_cursor": next_cursor,
            "candidate_entity_ids": candidate_entity_ids,
            "estimated_remaining": estimated_remaining,
            "counters": _campaign_counters(campaign),
            "diagnostics": dict(campaign.diagnostics_json or {}),
        }

    created_job_ids: list[int] = []
    failed_entities: list[dict[str, str]] = []
    enqueue_attempted = 0

    for candidate in candidates:
        enqueue_attempted += 1
        campaign.processed_count = int(campaign.processed_count or 0) + 1
        job_type = "gallery_backfill_index" if campaign.domain == "gallery" else "backfill_index"

        try:
            result = await enqueue_library_index_job(
                db,
                int(candidate["library_item_id"]),
                tenant_id=str(candidate["tenant_id"]),
                job_type=job_type,
                run_at=datetime.utcnow(),
            )
            if result.get("created"):
                campaign.queued_count = int(campaign.queued_count or 0) + 1
                campaign.succeeded_count = int(campaign.succeeded_count or 0) + 1
                created_job_ids.append(int(result["job_id"]))
            else:
                campaign.skipped_count = int(campaign.skipped_count or 0) + 1
        except Exception as exc:  # noqa: BLE001
            campaign.failed_count = int(campaign.failed_count or 0) + 1
            campaign.last_error = str(exc)
            failed_entities.append(
                {
                    "entity_id": str(candidate["entity_id"]),
                    "error": str(exc),
                }
            )

    campaign.cursor = next_cursor
    campaign.status = "completed" if not candidates else "running"
    campaign.completed_at = datetime.utcnow() if campaign.status == "completed" else None
    campaign.updated_at = datetime.utcnow()
    campaign.checkpoint_json = {
        "cursor": campaign.cursor,
        "batch_size": cap,
        "last_entity_id": candidate_entity_ids[-1] if candidate_entity_ids else None,
    }
    campaign.diagnostics_json = {
        **dict(campaign.diagnostics_json or {}),
        "failed_entities": failed_entities,
        "created_job_ids": created_job_ids,
        "enqueue_attempted": enqueue_attempted,
        "estimated_remaining": estimated_remaining,
        "skip_reason": None,
    }
    await db.commit()

    emit_metric(
        "library.backfill.campaign.batch_completed_total",
        tenant_id=campaign.tenant_id,
        domain=campaign.domain,
    )
    log_observability_event(
        "library_backfill_campaign_batch_completed",
        campaign_id=campaign.id,
        tenant_id=campaign.tenant_id,
        domain=campaign.domain,
        status=campaign.status,
        cursor=campaign.cursor,
        candidate_entity_ids=candidate_entity_ids,
        created_job_ids=created_job_ids,
        failed_entities=failed_entities,
        counters=_campaign_counters(campaign),
    )

    return {
        "campaign_id": campaign.id,
        "domain": campaign.domain,
        "tenant_id": campaign.tenant_id,
        "status": campaign.status,
        "paused": False,
        "dry_run": False,
        "cursor": campaign.cursor,
        "next_cursor": campaign.cursor,
        "candidate_entity_ids": candidate_entity_ids,
        "estimated_remaining": estimated_remaining,
        "created_job_ids": created_job_ids,
        "enqueue_attempted": enqueue_attempted,
        "counters": _campaign_counters(campaign),
        "diagnostics": dict(campaign.diagnostics_json or {}),
    }


async def validate_backfill_consistency(
    db: AsyncSession,
    *,
    domain: str,
    tenant_id: str | int | None = None,
    tolerance: float = 0.0,
) -> dict[str, Any]:
    resolved_domain = _normalize_domain(domain)
    resolved_tenant_id = _normalize_tenant_id(tenant_id)
    effective_tolerance = max(float(tolerance), 0.0)

    if resolved_domain == "gallery":
        gallery_predicates = [
            LibraryItem.deleted_at.is_(None),
            LibraryItem.status.in_(ELIGIBLE_ITEM_STATUSES),
            LibraryItem.source == GALLERY_SOURCE,
        ]
        if resolved_tenant_id is not None:
            gallery_predicates.append(LibraryItem.tenant_id == resolved_tenant_id)

        source_count = int(
            await db.scalar(
                select(func.count(LibraryItem.id)).where(and_(*gallery_predicates))
            )
            or 0
        )
        indexed_count = int(
            await db.scalar(
                select(func.count(func.distinct(LibraryChunk.library_item_id)))
                .select_from(LibraryChunk)
                .join(LibraryItem, LibraryItem.id == LibraryChunk.library_item_id)
                .where(
                    and_(
                        LibraryChunk.vector_ref_id.is_not(None),
                        *gallery_predicates,
                    )
                )
            )
            or 0
        )
        source_rows = (
            (
                await db.execute(
                    select(LibraryItem.id)
                    .where(
                        and_(
                            *gallery_predicates,
                            ~exists(
                                select(LibraryChunk.id).where(
                                    and_(
                                        LibraryChunk.library_item_id == LibraryItem.id,
                                        LibraryChunk.vector_ref_id.is_not(None),
                                    )
                                )
                            ),
                        )
                    )
                    .order_by(LibraryItem.id.asc())
                    .limit(50)
                )
            )
            .all()
        )
        missing_count = max(source_count - indexed_count, 0)
        divergence_ratio = float(missing_count) / float(source_count) if source_count else 0.0
        return {
            "domain": "gallery",
            "tenant_id": resolved_tenant_id,
            "passed": divergence_ratio <= effective_tolerance,
            "source_count": source_count,
            "indexed_count": indexed_count,
            "missing_count": missing_count,
            "divergence_ratio": divergence_ratio,
            "tolerance": effective_tolerance,
            "missing_entities": [f"gallery:{int(row.id)}" for row in source_rows],
            "diagnostics": {
                "reason": GALLERY_SKIP_REASON,
                "action": "wire_gallery_enqueue_to_python_worker_or_external_campaign_runner",
            },
        }

    predicates = [
        LibraryItem.deleted_at.is_(None),
        LibraryItem.status.in_(ELIGIBLE_ITEM_STATUSES),
    ]
    if resolved_tenant_id is not None:
        predicates.append(LibraryItem.tenant_id == resolved_tenant_id)

    source_count = int(
        await db.scalar(
            select(func.count(LibraryItem.id)).where(and_(*predicates))
        )
        or 0
    )
    indexed_count = int(
        await db.scalar(
            select(func.count(func.distinct(LibraryChunk.library_item_id)))
            .select_from(LibraryChunk)
            .join(LibraryItem, LibraryItem.id == LibraryChunk.library_item_id)
            .where(
                and_(
                    LibraryChunk.vector_ref_id.is_not(None),
                    *predicates,
                )
            )
        )
        or 0
    )

    missing_rows = (
        (
            await db.execute(
                select(LibraryItem.id)
                .where(
                    and_(
                        *predicates,
                        ~exists(
                            select(LibraryChunk.id).where(
                                and_(
                                    LibraryChunk.library_item_id == LibraryItem.id,
                                    LibraryChunk.vector_ref_id.is_not(None),
                                )
                            )
                        ),
                    )
                )
                .order_by(LibraryItem.id.asc())
                .limit(50)
            )
        )
        .all()
    )
    missing_count = max(source_count - indexed_count, 0)
    divergence_ratio = float(missing_count) / float(source_count) if source_count else 0.0

    return {
        "domain": "library",
        "tenant_id": resolved_tenant_id,
        "passed": divergence_ratio <= effective_tolerance,
        "source_count": source_count,
        "indexed_count": indexed_count,
        "missing_count": missing_count,
        "divergence_ratio": divergence_ratio,
        "tolerance": effective_tolerance,
        "missing_entities": [f"library:{row.id}" for row in missing_rows],
        "diagnostics": {
            "missing_entity_sample_size": len(missing_rows),
            "action": "rerun_campaign_for_missing_entities_and_verify_chunk_vector_refs",
        },
    }


async def run_library_backfill_batch(
    db: AsyncSession,
    *,
    tenant_id: str | int | None = None,
    cursor: int = 0,
    batch_size: int = 100,
    dry_run: bool = True,
    paused: bool = False,
    max_enqueue: int = 25,
    domain: str = "library",
) -> dict[str, Any]:
    """Execute one backfill slice with pause/resume and throttle controls."""
    resolved_domain = _normalize_domain(domain)
    resolved_tenant_id = _normalize_tenant_id(tenant_id)
    cursor = max(cursor, 0)
    cap = max(1, min(batch_size, max_enqueue))

    if paused:
        log_observability_event(
            "library_backfill_paused",
            tenant_id=resolved_tenant_id,
            cursor=cursor,
            batch_size=batch_size,
            max_enqueue=max_enqueue,
            domain=resolved_domain,
        )
        emit_metric(
            "library.backfill.paused_total",
            tenant_id=resolved_tenant_id,
            domain=resolved_domain,
        )
        return {
            "paused": True,
            "dry_run": dry_run,
            "cursor": cursor,
            "next_cursor": cursor,
            "candidate_item_ids": [],
            "enqueued_jobs": 0,
            "estimated_remaining": await _count_candidates(
                db,
                domain=resolved_domain,
                tenant_id=resolved_tenant_id,
                cursor=cursor,
            ),
            "domain": resolved_domain,
        }

    emit_metric(
        "library.backfill.batch_started_total",
        tenant_id=resolved_tenant_id,
        dry_run=dry_run,
        domain=resolved_domain,
    )
    estimated_remaining = await _count_candidates(
        db,
        domain=resolved_domain,
        tenant_id=resolved_tenant_id,
        cursor=cursor,
    )

    candidates = await load_backfill_candidates(
        db,
        domain=resolved_domain,
        tenant_id=resolved_tenant_id,
        cursor=cursor,
        limit=cap,
    )
    candidate_item_ids = [int(c["library_item_id"]) for c in candidates]
    next_cursor = int(candidates[-1]["cursor"]) if candidates else cursor

    emit_metric(
        "library.backfill.candidate_selected_total",
        tenant_id=resolved_tenant_id,
        count=len(candidates),
        domain=resolved_domain,
    )

    if dry_run:
        log_observability_event(
            "library_backfill_dry_run",
            tenant_id=resolved_tenant_id,
            domain=resolved_domain,
            cursor=cursor,
            next_cursor=next_cursor,
            estimated_remaining=estimated_remaining,
            candidate_entity_ids=[c["entity_id"] for c in candidates],
        )
        return {
            "paused": False,
            "dry_run": True,
            "cursor": cursor,
            "next_cursor": next_cursor,
            "candidate_item_ids": candidate_item_ids,
            "enqueued_jobs": 0,
            "estimated_remaining": estimated_remaining,
            "domain": resolved_domain,
        }

    created_jobs = 0
    created_job_ids: list[int] = []
    enqueue_attempted = 0
    skipped = 0
    for candidate in candidates:
        enqueue_attempted += 1
        job_type = "gallery_backfill_index" if resolved_domain == "gallery" else "backfill_index"

        result = await enqueue_library_index_job(
            db,
            int(candidate["library_item_id"]),
            tenant_id=str(candidate["tenant_id"]),
            job_type=job_type,
            run_at=datetime.utcnow(),
        )
        if result.get("created"):
            created_jobs += 1
            created_job_ids.append(int(result["job_id"]))
        else:
            skipped += 1

    emit_metric(
        "library.backfill.jobs_enqueued_total",
        tenant_id=resolved_tenant_id,
        enqueued=created_jobs,
        attempted=enqueue_attempted,
        domain=resolved_domain,
    )
    log_observability_event(
        "library_backfill_batch_completed",
        tenant_id=resolved_tenant_id,
        domain=resolved_domain,
        cursor=cursor,
        next_cursor=next_cursor,
        candidate_entity_ids=[c["entity_id"] for c in candidates],
        created_job_ids=created_job_ids,
        enqueued_jobs=created_jobs,
        enqueue_attempted=enqueue_attempted,
        skipped=skipped,
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
        "skipped": skipped,
        "domain": resolved_domain,
        "diagnostics": {
            "skip_reason": None,
        },
    }
