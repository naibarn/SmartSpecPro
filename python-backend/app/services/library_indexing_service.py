"""Asynchronous indexing pipeline for library items."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Callable, Optional, Protocol

import structlog
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vectordb import VectorCollection
from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
from app.services.embedding_service import EmbeddingService, get_embedding_service
from app.services.library_observability import emit_metric, log_observability_event
from app.services.credit_billing_client import charge_credits_post_deduct

logger = structlog.get_logger()

PENDING_STATUS = "pending"
PROCESSING_STATUS = "processing"
RETRY_PENDING_STATUS = "retry_pending"
COMPLETED_STATUS = "completed"
FAILED_STATUS = "failed"
SUPPORTED_VECTOR_PROVIDERS = {"chroma", "pgvector", "cloudflare_vectorize"}
TRANSIENT_ERROR_MARKERS = (
    "timeout",
    "temporarily",
    "try again",
    "connection",
    "rate limit",
    "429",
    "503",
    "network",
    "unavailable",
    "reset by peer",
)


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


def _derive_legacy_domain(job_type: str) -> str:
    return "gallery" if job_type.startswith("gallery") else "library"


def _derive_legacy_operation(job_type: str) -> str:
    return "delete" if "delete" in job_type else "index"


def build_library_job_dedupe_key(
    *,
    domain: str,
    operation: str,
    tenant_id: str,
    entity_id: str,
) -> str:
    return f"libidx:v2:{domain}:{operation}:{tenant_id}:{entity_id}"


def parse_library_index_job_payload(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("Invalid library index job payload")

    version = str(raw.get("version") or "").strip()
    if version == "v2":
        tenant_id = str(raw.get("tenantId") or "").strip()
        if not tenant_id:
            raise ValueError("Invalid library index job payload: tenantId is required")

        entity_id = str(raw.get("entityId") or "").strip()
        domain = str(raw.get("domain") or "library").strip() or "library"
        operation = str(raw.get("operation") or "index").strip() or "index"
        dedupe_key = str(raw.get("dedupeKey") or "").strip()
        if not dedupe_key:
            dedupe_key = build_library_job_dedupe_key(
                domain=domain,
                operation=operation,
                tenant_id=tenant_id,
                entity_id=entity_id,
            )

        return {
            "version": "v2",
            "domain": domain,
            "operation": operation,
            "tenant_id": tenant_id,
            "entity_id": entity_id,
            "dedupe_key": dedupe_key,
            "source": str(raw.get("source") or "unknown"),
            "source_metadata": raw.get("sourceMetadata") if isinstance(raw.get("sourceMetadata"), dict) else {},
        }

    tenant_id = str(raw.get("tenantId") or "").strip()
    if not tenant_id:
        raise ValueError("Invalid library index job payload: tenantId is required")

    job_type = str(raw.get("jobType") or "initial_index").strip()
    domain = _derive_legacy_domain(job_type)
    operation = _derive_legacy_operation(job_type)

    entity_id = str(raw.get("entityId") or "").strip()
    if not entity_id:
        if raw.get("libraryItemId") is not None:
            entity_id = f"library:{raw['libraryItemId']}"
        elif raw.get("galleryItemId") is not None:
            entity_id = f"gallery:{raw['galleryItemId']}"
        else:
            entity_id = "unknown:0"

    dedupe_key = str(raw.get("dedupeKey") or "").strip()
    if not dedupe_key:
        dedupe_key = build_library_job_dedupe_key(
            domain=domain,
            operation=operation,
            tenant_id=tenant_id,
            entity_id=entity_id,
        )

    source = str(raw.get("source") or f"legacy:{job_type}")
    source_metadata = raw.get("sourceMetadata") if isinstance(raw.get("sourceMetadata"), dict) else {}

    return {
        "version": "legacy",
        "domain": domain,
        "operation": operation,
        "tenant_id": tenant_id,
        "entity_id": entity_id,
        "dedupe_key": dedupe_key,
        "source": source,
        "source_metadata": source_metadata,
    }


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


# ── Provider-specific upsert adapters ────────────────────────────────────


def _pgvector_vector_upsert(
    *,
    tenant_id: str,
    item_id: int,
    chunks: list[dict[str, Any]],
    embeddings: list[list[float]],
    pgvector_config: dict[str, str] | None = None,
) -> list[str]:
    """Store chunk embeddings via pgvector and return vector IDs."""
    from app.orchestrator.vector_store.pgvector_store import PgVectorStore, VectorDocument

    if len(chunks) != len(embeddings):
        raise RuntimeError("embedding_count_mismatch")

    cfg = pgvector_config or {}
    host = cfg.get("pgvectorHost", "localhost")
    port = cfg.get("pgvectorPort", "5432")
    database = cfg.get("pgvectorDatabase", "smartspec")
    user = cfg.get("pgvectorUser", "smartspec")
    password = cfg.get("pgvectorPassword", "")
    conn_str = f"postgresql://{user}:{password}@{host}:{port}/{database}"

    store = PgVectorStore(connection_string=conn_str)

    vector_ids = [f"lib:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks]

    docs = [
        VectorDocument(
            doc_id=vid,
            content=chunk["content"],
            embedding=emb,
            metadata={
                "tenant_id": tenant_id,
                "item_id": item_id,
                "chunk_index": chunk["chunk_index"],
                "token_count": chunk.get("token_count") or 0,
                "content_type": chunk.get("content_type") or "text",
            },
            tenant_id=tenant_id,
            doc_type="library_chunk",
            source=f"library_item:{item_id}",
        )
        for vid, chunk, emb in zip(vector_ids, chunks, embeddings)
    ]

    store.add_documents(docs)
    return vector_ids


def _cloudflare_vector_upsert(
    *,
    tenant_id: str,
    item_id: int,
    chunks: list[dict[str, Any]],
    embeddings: list[list[float]],
    vectorize_config: dict[str, str] | None = None,
) -> list[str]:
    """Store chunk embeddings via Cloudflare Vectorize and return vector IDs."""
    import asyncio
    from app.orchestrator.vector_store.cloudflare_vectorize_store import (
        CloudflareVectorizeStore,
        VectorizeConfig,
    )

    if len(chunks) != len(embeddings):
        raise RuntimeError("embedding_count_mismatch")

    cfg = vectorize_config or {}
    account_id = cfg.get("vectorizeAccountId", "")
    api_token = cfg.get("vectorizeApiToken", "")
    index_name = cfg.get("vectorizeIndexName", "smartspec-library")

    if not account_id or not api_token:
        raise RuntimeError("Cloudflare Vectorize credentials not configured")

    store = CloudflareVectorizeStore(
        VectorizeConfig(
            account_id=account_id,
            api_token=api_token,
            index_name=index_name,
        )
    )

    vector_ids = [f"lib:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks]

    vectors = [
        {
            "id": vid,
            "values": emb,
            "metadata": {
                "tenant_id": tenant_id,
                "item_id": item_id,
                "chunk_index": chunk["chunk_index"],
                "content_type": chunk.get("content_type") or "text",
            },
        }
        for vid, chunk, emb in zip(vector_ids, chunks, embeddings)
    ]

    # Run async upsert from sync context (Celery worker)
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(store.upsert(vectors))
    finally:
        loop.close()

    return vector_ids


def get_vector_upsert_fn(
    provider: str,
    config: dict[str, str] | None = None,
) -> VectorUpsertFn:
    """Factory: return the correct upsert function for the active vector DB provider."""
    if provider == "pgvector":
        def pgvector_fn(
            *, tenant_id: str, item_id: int,
            chunks: list[dict[str, Any]], embeddings: list[list[float]],
        ) -> list[str]:
            return _pgvector_vector_upsert(
                tenant_id=tenant_id, item_id=item_id,
                chunks=chunks, embeddings=embeddings,
                pgvector_config=config,
            )
        return pgvector_fn

    if provider == "cloudflare_vectorize":
        def vectorize_fn(
            *, tenant_id: str, item_id: int,
            chunks: list[dict[str, Any]], embeddings: list[list[float]],
        ) -> list[str]:
            return _cloudflare_vector_upsert(
                tenant_id=tenant_id, item_id=item_id,
                chunks=chunks, embeddings=embeddings,
                vectorize_config=config,
            )
        return vectorize_fn

    # Default: ChromaDB
    return _default_vector_upsert


def _vector_provider_config_from_env() -> dict[str, str]:
    config: dict[str, str] = {}
    mapping = {
        "PGVECTOR_HOST": "pgvectorHost",
        "PGVECTOR_PORT": "pgvectorPort",
        "PGVECTOR_DATABASE": "pgvectorDatabase",
        "PGVECTOR_USER": "pgvectorUser",
        "PGVECTOR_PASSWORD": "pgvectorPassword",
        "VECTORIZE_ACCOUNT_ID": "vectorizeAccountId",
        "VECTORIZE_API_TOKEN": "vectorizeApiToken",
        "VECTORIZE_INDEX_NAME": "vectorizeIndexName",
    }
    for env_key, config_key in mapping.items():
        value = os.getenv(env_key)
        if value:
            config[config_key] = value
    return config


def resolve_library_vector_provider() -> tuple[str, dict[str, str]]:
    raw = (os.getenv("LIBRARY_VECTOR_PROVIDER") or os.getenv("VECTOR_DB_PROVIDER") or "chroma").strip().lower()
    aliases = {
        "vectorize": "cloudflare_vectorize",
        "cloudflare": "cloudflare_vectorize",
        "chromadb": "chroma",
    }
    provider = aliases.get(raw, raw)
    if provider not in SUPPORTED_VECTOR_PROVIDERS:
        provider = "chroma"
    return provider, _vector_provider_config_from_env()


def _resolve_vector_upsert_fn(explicit: Optional[VectorUpsertFn]) -> VectorUpsertFn:
    if explicit is not None:
        return explicit

    provider, config = resolve_library_vector_provider()
    return get_vector_upsert_fn(provider, config=config)


def _is_transient_indexing_error(exc: Exception) -> bool:
    if isinstance(exc, (ValueError, LookupError, PermissionError, NotImplementedError)):
        return False
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True

    lowered = str(exc).lower()
    return any(marker in lowered for marker in TRANSIENT_ERROR_MARKERS)


async def _find_duplicate_completed_job_by_dedupe_key(
    db: AsyncSession,
    *,
    job: LibraryIndexJob,
    dedupe_key: str,
) -> Optional[LibraryIndexJob]:
    candidates = (
        (
            await db.execute(
                select(LibraryIndexJob)
                .where(
                    and_(
                        LibraryIndexJob.id != job.id,
                        LibraryIndexJob.tenant_id == job.tenant_id,
                        LibraryIndexJob.library_item_id == job.library_item_id,
                        LibraryIndexJob.status == COMPLETED_STATUS,
                    )
                )
                .order_by(LibraryIndexJob.completed_at.desc(), LibraryIndexJob.id.desc())
                .limit(25)
            )
        )
        .scalars()
        .all()
    )

    entity_id = f"library:{job.library_item_id}"
    for candidate in candidates:
        candidate_key = build_library_job_dedupe_key(
            domain=_derive_legacy_domain(candidate.job_type),
            operation=_derive_legacy_operation(candidate.job_type),
            tenant_id=candidate.tenant_id,
            entity_id=entity_id,
        )
        if candidate_key == dedupe_key:
            return candidate
    return None


async def reindex_all_library_items(
    db: AsyncSession,
    *,
    tenant_id: str | None = None,
) -> dict[str, Any]:
    """
    Reindex all library items by clearing existing chunks and enqueuing fresh index jobs.

    Returns summary with total_items and enqueued_jobs count.
    """
    predicates = [
        LibraryItem.deleted_at.is_(None),
    ]
    if tenant_id is not None:
        predicates.append(LibraryItem.tenant_id == tenant_id)

    # Count total items
    total_count = await db.scalar(
        select(func.count(LibraryItem.id)).where(and_(*predicates))
    )
    total_count = int(total_count or 0)

    if total_count == 0:
        return {"total_items": 0, "enqueued_jobs": 0, "errors": 0}

    # Fetch all item IDs in batches
    batch_size = 200
    offset = 0
    enqueued = 0
    errors = 0

    while offset < total_count:
        rows = (
            await db.execute(
                select(LibraryItem.id, LibraryItem.tenant_id)
                .where(and_(*predicates))
                .order_by(LibraryItem.id.asc())
                .offset(offset)
                .limit(batch_size)
            )
        ).all()

        if not rows:
            break

        for row in rows:
            try:
                await enqueue_library_index_job(
                    db,
                    row.id,
                    tenant_id=row.tenant_id,
                    job_type="reindex",
                    run_at=datetime.utcnow(),
                )
                enqueued += 1
            except Exception as exc:
                logger.warning(
                    "reindex_enqueue_error",
                    library_item_id=row.id,
                    error=str(exc),
                )
                errors += 1

        offset += batch_size

    logger.info(
        "reindex_all_enqueued",
        tenant_id=tenant_id,
        total_items=total_count,
        enqueued_jobs=enqueued,
        errors=errors,
    )
    emit_metric(
        "library.reindex.enqueued_total",
        tenant_id=tenant_id,
        total=total_count,
        enqueued=enqueued,
    )

    return {
        "total_items": total_count,
        "enqueued_jobs": enqueued,
        "errors": errors,
    }


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
    job_payload: Optional[dict[str, Any]] = None,
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
    parsed_payload: Optional[dict[str, Any]] = None
    try:
        if job_payload is not None:
            parsed_payload = parse_library_index_job_payload(job_payload)

            if parsed_payload["tenant_id"] != job.tenant_id:
                raise PermissionError(
                    f"tenant_mismatch: payload={parsed_payload['tenant_id']} job={job.tenant_id}"
                )

            expected_entity = f"library:{job.library_item_id}"
            if parsed_payload["entity_id"] != expected_entity:
                raise ValueError(
                    f"entity_mismatch: payload={parsed_payload['entity_id']} expected={expected_entity}"
                )

            if parsed_payload["operation"] == "delete":
                raise NotImplementedError("delete_operation_not_supported_in_worker")

            duplicate_completed_job = await _find_duplicate_completed_job_by_dedupe_key(
                db,
                job=job,
                dedupe_key=parsed_payload["dedupe_key"],
            )
            if duplicate_completed_job is not None:
                job.status = COMPLETED_STATUS
                job.completed_at = datetime.utcnow()
                job.next_retry_at = None
                job.last_error = None
                job.updated_at = datetime.utcnow()
                await db.commit()

                log_observability_event(
                    "library_index_job_deduped",
                    correlation_id=f"library-index:{job.id}",
                    tenant_id=job.tenant_id,
                    library_item_id=job.library_item_id,
                    dedupe_key=parsed_payload["dedupe_key"],
                    duplicate_of_job_id=duplicate_completed_job.id,
                )
                emit_metric(
                    "library.index.job.deduped_total",
                    tenant_id=job.tenant_id,
                    job_type=job.job_type,
                )
                return {
                    "job_id": job.id,
                    "status": COMPLETED_STATUS,
                    "chunks_written": 0,
                    "duplicate": True,
                    "dedupe_key": parsed_payload["dedupe_key"],
                }

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

        upsert = _resolve_vector_upsert_fn(vector_upsert_fn)
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

        # Post-deduct credit billing for indexing
        service_tag = "library.save_reindex" if job.job_type == "reindex" else "library.upload_index"
        await charge_credits_post_deduct(
            user_id=item.owner_user_id,
            chunk_count=len(chunks),
            service=service_tag,
            idempotency_key=f"library-index:{job.id}",
        )

        return {
            "job_id": job.id,
            "status": COMPLETED_STATUS,
            "chunks_written": len(chunks),
            "attempt_count": job.attempt_count,
            "provider_payload_version": parsed_payload["version"] if parsed_payload else "legacy",
        }

    except Exception as exc:  # noqa: BLE001
        error_message = str(exc)
        is_transient = _is_transient_indexing_error(exc)
        terminal = (not is_transient) or job.attempt_count >= (job.max_attempts or 5)

        if terminal:
            failure_classification = "transient_exhausted" if is_transient else "permanent"
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
                classification=failure_classification,
            )
            emit_metric(
                "library.index.job.dead_letter_total",
                tenant_id=job.tenant_id,
                job_type=job.job_type,
                classification=failure_classification,
            )
            log_observability_event(
                "library_index_job_failed_observed",
                correlation_id=f"library-index:{job.id}",
                tenant_id=job.tenant_id,
                library_item_id=job.library_item_id,
                attempt_count=job.attempt_count,
                error=error_message,
                failure_classification=failure_classification,
                dead_lettered=True,
            )
            log_observability_event(
                "library_index_job_dead_lettered",
                correlation_id=f"library-index:{job.id}",
                tenant_id=job.tenant_id,
                library_item_id=job.library_item_id,
                attempt_count=job.attempt_count,
                error=error_message,
                failure_classification=failure_classification,
            )
            return {
                "job_id": job.id,
                "status": FAILED_STATUS,
                "error": error_message,
                "attempt_count": job.attempt_count,
                "failure_classification": failure_classification,
                "dead_lettered": True,
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
