"""Asynchronous indexing pipeline for library items."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable, Optional, Protocol

import structlog
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vectordb import VectorCollection
from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
from app.services.embedding_service import EmbeddingService, get_embedding_service
from app.services.library_observability import emit_metric, log_observability_event

logger = structlog.get_logger()

PENDING_STATUS = "pending"
PROCESSING_STATUS = "processing"
RETRY_PENDING_STATUS = "retry_pending"
COMPLETED_STATUS = "completed"
FAILED_STATUS = "failed"


class VectorUpsertFn(Protocol):
    """Adapter contract for writing vectors and returning vector IDs."""

    def __call__(
        self,
        *,
        tenant_id: str,
        item_id: int,
        chunks: list[dict[str, Any]],
        embeddings: list[list[float]],
    ) -> list[str]: ...


def _retry_delay_seconds(attempt_count: int) -> int:
    # 30s, 60s, 120s, 240s ... max 30m
    return min(30 * (2 ** max(attempt_count - 1, 0)), 1800)


def _stringify_metadata_value(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        parts = [_stringify_metadata_value(v) for v in value]
        return " ".join(p for p in parts if p)
    if isinstance(value, dict):
        parts = [_stringify_metadata_value(v) for v in value.values()]
        return " ".join(p for p in parts if p)
    return ""


def extract_library_item_text(item: LibraryItem) -> str:
    """Extract indexable text from item core fields and metadata."""
    parts: list[str] = []

    for value in (item.title, item.description):
        text = _stringify_metadata_value(value)
        if text:
            parts.append(text)

    metadata = item.metadata_json if isinstance(item.metadata_json, dict) else {}

    priority_keys = (
        "prompt",
        "description",
        "caption",
        "transcript",
        "ocr_text",
        "ocrText",
        "model",
        "provider",
        "provider_name",
    )
    for key in priority_keys:
        if key in metadata:
            text = _stringify_metadata_value(metadata.get(key))
            if text:
                parts.append(text)

    # Append any other metadata for broad recall.
    for key, value in metadata.items():
        if key in priority_keys:
            continue
        text = _stringify_metadata_value(value)
        if text:
            parts.append(text)

    combined = "\n\n".join(p for p in parts if p)
    return combined.strip()


def chunk_text_content(text: str, max_chars: int = 500, overlap_chars: int = 80) -> list[dict[str, Any]]:
    """Deterministically split content into overlapping chunks."""
    normalized = " ".join(text.split())
    if not normalized:
        return []

    chunks: list[dict[str, Any]] = []
    cursor = 0
    chunk_index = 0
    text_length = len(normalized)

    while cursor < text_length:
        end = min(cursor + max_chars, text_length)

        if end < text_length:
            split = normalized.rfind(" ", cursor, end)
            if split > cursor + 32:
                end = split

        content = normalized[cursor:end].strip()
        if content:
            chunks.append(
                {
                    "chunk_index": chunk_index,
                    "content": content,
                    "content_type": "text",
                    "token_count": len(content.split()),
                    "metadata": {
                        "start_char": cursor,
                        "end_char": end,
                    },
                }
            )
            chunk_index += 1

        if end >= text_length:
            break

        cursor = max(end - overlap_chars, 0)

    return chunks


def _default_vector_upsert(
    *,
    tenant_id: str,
    item_id: int,
    chunks: list[dict[str, Any]],
    embeddings: list[list[float]],
) -> list[str]:
    """Store chunk embeddings in Chroma and return stable vector IDs."""
    if len(chunks) != len(embeddings):
        raise RuntimeError("embedding_count_mismatch")

    collection_name = f"library_tenant_{tenant_id}"
    collection = VectorCollection(collection_name)

    vector_ids = [f"lib:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks]

    # Ensure deterministic overwrite behavior when re-indexing.
    collection.delete(ids=vector_ids)
    collection.add(
        ids=vector_ids,
        documents=[chunk["content"] for chunk in chunks],
        embeddings=embeddings,
        metadatas=[
            {
                "tenant_id": tenant_id,
                "item_id": item_id,
                "chunk_index": chunk["chunk_index"],
                "token_count": chunk.get("token_count") or 0,
                "content_type": chunk.get("content_type") or "text",
            }
            for chunk in chunks
        ],
    )
    return vector_ids


async def enqueue_library_index_job(
    db: AsyncSession,
    library_item_id: int,
    *,
    tenant_id: str,
    job_type: str = "initial_index",
    run_at: Optional[datetime] = None,
) -> dict[str, Any]:
    """Create an index job if one is not already queued/processing for the item."""
    existing = await db.scalar(
        select(LibraryIndexJob)
        .where(
            and_(
                LibraryIndexJob.library_item_id == library_item_id,
                LibraryIndexJob.tenant_id == tenant_id,
                LibraryIndexJob.job_type == job_type,
                LibraryIndexJob.status.in_([PENDING_STATUS, PROCESSING_STATUS, RETRY_PENDING_STATUS]),
            )
        )
        .order_by(LibraryIndexJob.id.desc())
    )

    if existing:
        return {
            "job_id": existing.id,
            "status": existing.status,
            "created": False,
        }

    item = await db.scalar(
        select(LibraryItem).where(
            and_(
                LibraryItem.id == library_item_id,
                LibraryItem.tenant_id == tenant_id,
                LibraryItem.deleted_at.is_(None),
            )
        )
    )
    if not item:
        raise LookupError(f"library_item_not_found:{library_item_id}")

    job = LibraryIndexJob(
        tenant_id=tenant_id,
        library_item_id=library_item_id,
        job_type=job_type,
        status=PENDING_STATUS,
        run_at=run_at or datetime.utcnow(),
        attempt_count=0,
    )
    db.add(job)

    item.status = "indexing"
    item.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(job)

    logger.info(
        "library_index_job_enqueued",
        job_id=job.id,
        library_item_id=library_item_id,
        tenant_id=tenant_id,
    )
    emit_metric(
        "library.index.job.enqueued_total",
        tenant_id=tenant_id,
        job_type=job_type,
    )

    return {
        "job_id": job.id,
        "status": job.status,
        "created": True,
    }


async def process_library_index_job(
    db: AsyncSession,
    job_id: int,
    *,
    embedding_service: Optional[EmbeddingService] = None,
    vector_upsert_fn: Optional[VectorUpsertFn] = None,
) -> dict[str, Any]:
    """Process a single index job through extract/chunk/embed/upsert pipeline."""
    job = await db.scalar(select(LibraryIndexJob).where(LibraryIndexJob.id == job_id))
    if not job:
        raise LookupError(f"library_index_job_not_found:{job_id}")

    if job.status == COMPLETED_STATUS:
        return {
            "job_id": job.id,
            "status": COMPLETED_STATUS,
            "chunks_written": 0,
            "duplicate": True,
        }

    job.status = PROCESSING_STATUS
    job.attempt_count = (job.attempt_count or 0) + 1
    job.started_at = datetime.utcnow()
    job.last_error = None
    job.next_retry_at = None
    job.updated_at = datetime.utcnow()
    await db.commit()

    item: Optional[LibraryItem] = None
    try:
        item = await db.scalar(
            select(LibraryItem).where(
                and_(
                    LibraryItem.id == job.library_item_id,
                    LibraryItem.tenant_id == job.tenant_id,
                    LibraryItem.deleted_at.is_(None),
                )
            )
        )
        if not item:
            raise LookupError(f"library_item_not_found:{job.library_item_id}")

        indexable_text = extract_library_item_text(item)
        if not indexable_text:
            raise ValueError("No indexable text content found for library item")

        chunks = chunk_text_content(indexable_text)
        if not chunks:
            raise ValueError("Chunking produced no content")

        embedder = embedding_service or get_embedding_service()
        embeddings = embedder.embed_batch([chunk["content"] for chunk in chunks])

        upsert = vector_upsert_fn or _default_vector_upsert
        vector_ids = upsert(
            tenant_id=job.tenant_id,
            item_id=job.library_item_id,
            chunks=chunks,
            embeddings=embeddings,
        )

        if len(vector_ids) != len(chunks):
            raise RuntimeError("vector_id_count_mismatch")

        await db.execute(delete(LibraryChunk).where(LibraryChunk.library_item_id == item.id))

        created_at = datetime.utcnow()
        for chunk, vector_id in zip(chunks, vector_ids):
            db.add(
                LibraryChunk(
                    tenant_id=job.tenant_id,
                    library_item_id=item.id,
                    chunk_index=chunk["chunk_index"],
                    content=chunk["content"],
                    content_type=chunk.get("content_type") or "text",
                    token_count=chunk.get("token_count"),
                    vector_ref_id=vector_id,
                    metadata={
                        **(chunk.get("metadata") or {}),
                        "job_id": job.id,
                    },
                    created_at=created_at,
                )
            )

        item.status = "ready"
        item.updated_at = datetime.utcnow()

        job.status = COMPLETED_STATUS
        job.completed_at = datetime.utcnow()
        job.next_retry_at = None
        job.last_error = None
        job.updated_at = datetime.utcnow()

        await db.commit()

        logger.info(
            "library_index_job_completed",
            job_id=job.id,
            library_item_id=job.library_item_id,
            chunk_count=len(chunks),
            attempt_count=job.attempt_count,
        )
        emit_metric(
            "library.index.job.completed_total",
            tenant_id=job.tenant_id,
            job_type=job.job_type,
        )
        log_observability_event(
            "library_index_job_completed_observed",
            correlation_id=f"library-index:{job.id}",
            tenant_id=job.tenant_id,
            library_item_id=job.library_item_id,
            chunk_count=len(chunks),
            attempt_count=job.attempt_count,
        )

        return {
            "job_id": job.id,
            "status": COMPLETED_STATUS,
            "chunks_written": len(chunks),
            "attempt_count": job.attempt_count,
        }

    except Exception as exc:  # noqa: BLE001
        error_message = str(exc)
        terminal = isinstance(exc, ValueError) or job.attempt_count >= (job.max_attempts or 5)

        if terminal:
            job.status = FAILED_STATUS
            job.completed_at = datetime.utcnow()
            job.next_retry_at = None
            job.last_error = error_message
            job.updated_at = datetime.utcnow()
            if item:
                item.status = "failed"
                item.updated_at = datetime.utcnow()
            await db.commit()

            logger.warning(
                "library_index_job_failed_terminal",
                job_id=job.id,
                attempt_count=job.attempt_count,
                error=error_message,
            )
            emit_metric(
                "library.index.job.failed_total",
                tenant_id=job.tenant_id,
                job_type=job.job_type,
                terminal=True,
            )
            log_observability_event(
                "library_index_job_failed_observed",
                correlation_id=f"library-index:{job.id}",
                tenant_id=job.tenant_id,
                library_item_id=job.library_item_id,
                attempt_count=job.attempt_count,
                error=error_message,
            )
            return {
                "job_id": job.id,
                "status": FAILED_STATUS,
                "error": error_message,
                "attempt_count": job.attempt_count,
            }

        delay = _retry_delay_seconds(job.attempt_count)
        job.status = RETRY_PENDING_STATUS
        job.next_retry_at = datetime.utcnow() + timedelta(seconds=delay)
        job.last_error = error_message
        job.updated_at = datetime.utcnow()
        await db.commit()

        logger.info(
            "library_index_job_retry_scheduled",
            job_id=job.id,
            attempt_count=job.attempt_count,
            delay_seconds=delay,
            error=error_message,
        )
        emit_metric(
            "library.index.job.retry_scheduled_total",
            tenant_id=job.tenant_id,
            job_type=job.job_type,
        )
        return {
            "job_id": job.id,
            "status": RETRY_PENDING_STATUS,
            "error": error_message,
            "attempt_count": job.attempt_count,
            "next_retry_at": job.next_retry_at.isoformat() if job.next_retry_at else None,
        }


async def retry_due_library_index_jobs(
    db: AsyncSession,
    *,
    limit: int = 50,
    embedding_service: Optional[EmbeddingService] = None,
    vector_upsert_fn: Optional[VectorUpsertFn] = None,
) -> dict[str, int]:
    """Retry and process index jobs due for execution."""
    now = datetime.utcnow()

    due_jobs = (
        (
            await db.execute(
                select(LibraryIndexJob)
                .where(
                    or_(
                        and_(
                            LibraryIndexJob.status == PENDING_STATUS,
                            LibraryIndexJob.run_at <= now,
                        ),
                        and_(
                            LibraryIndexJob.status == RETRY_PENDING_STATUS,
                            LibraryIndexJob.next_retry_at.is_not(None),
                            LibraryIndexJob.next_retry_at <= now,
                        ),
                    )
                )
                .order_by(LibraryIndexJob.id.asc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    summary = {
        "processed": 0,
        "completed": 0,
        "retry_pending": 0,
        "failed": 0,
    }

    for job in due_jobs:
        result = await process_library_index_job(
            db,
            job.id,
            embedding_service=embedding_service,
            vector_upsert_fn=vector_upsert_fn,
        )
        summary["processed"] += 1

        status = result.get("status")
        if status == COMPLETED_STATUS:
            summary["completed"] += 1
        elif status == RETRY_PENDING_STATUS:
            summary["retry_pending"] += 1
        elif status == FAILED_STATUS:
            summary["failed"] += 1

    log_observability_event(
        "library_index_retry_batch_completed",
        processed=summary["processed"],
        completed=summary["completed"],
        retry_pending=summary["retry_pending"],
        failed=summary["failed"],
        limit=limit,
    )
    return summary
