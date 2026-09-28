"""PostgreSQL registry for rebuildable Vectorize projections.

This module records projection intent and provider mutation evidence only. The
embedding values stay in the provider, while source content remains in SQL/R2.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library import VectorIndexRecord

VECTORIZE_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5"
VECTORIZE_EMBEDDING_DIMENSIONS = 768
VECTORIZE_EMBEDDING_VERSION = "bge-base-en-v1.5-v1"
VECTORIZE_METRIC = "cosine"
VECTORIZE_CHUNKING_VERSION = "text-2000-overlap-200-v1"
VECTORIZE_MAX_NAMESPACE_BYTES = 64


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def vectorize_namespace_for_tenant(tenant_id: str) -> str:
    value = str(tenant_id or "").strip()
    if not value:
        raise ValueError("VECTORIZE_TENANT_ID_REQUIRED")
    namespace = f"tenant:{value}"
    if len(namespace.encode("utf-8")) > VECTORIZE_MAX_NAMESPACE_BYTES:
        raise ValueError("VECTORIZE_NAMESPACE_INVALID")
    return namespace


def build_vector_projection_id(
    *,
    vector_index: str,
    namespace: str,
    source_family: str,
    source_id: str,
    chunk_id: str | None,
    source_revision: str,
    embedding_version: str = VECTORIZE_EMBEDDING_VERSION,
) -> str:
    """Build a stable ID from source identity and schema, never vector values."""
    payload = json.dumps(
        [
            vector_index,
            namespace,
            source_family,
            source_id,
            chunk_id,
            source_revision,
            embedding_version,
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return f"v:{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:56]}"


def build_library_vector_projection_records(
    *,
    tenant_id: str,
    item_id: int,
    chunks: Iterable[dict[str, Any]],
    vector_index: str,
    source_revision: str,
    owner_user_id: int | None = None,
    source_locator_kind: str | None = None,
) -> list[dict[str, Any]]:
    """Create queued registry rows from canonical SQL chunk content."""
    return build_vector_projection_records(
        tenant_id=tenant_id,
        source_family="library_chunks",
        source_table="library_chunks",
        source_id=str(item_id),
        chunks=chunks,
        vector_index=vector_index,
        source_revision=source_revision,
        owner_user_id=owner_user_id,
        source_locator_kind=source_locator_kind,
    )


def build_vector_projection_records(
    *,
    tenant_id: str,
    source_family: str,
    source_table: str,
    source_id: str,
    chunks: Iterable[dict[str, Any]],
    vector_index: str,
    source_revision: str,
    owner_user_id: int | None = None,
    source_locator_kind: str | None = None,
) -> list[dict[str, Any]]:
    """Create queued records for any canonical SQL/R2-backed text source."""
    namespace = vectorize_namespace_for_tenant(tenant_id)
    records: list[dict[str, Any]] = []
    for chunk in chunks:
        chunk_id = str(chunk["chunk_index"])
        content = str(chunk.get("content") or "")
        content_hash = sha256_text(content)
        vector_id = build_vector_projection_id(
            vector_index=vector_index,
            namespace=namespace,
            source_family=source_family,
            source_id=source_id,
            chunk_id=chunk_id,
            source_revision=source_revision,
        )
        records.append(
            {
                "tenant_id": tenant_id,
                "user_id": owner_user_id,
                "source_family": source_family,
                "source_table": source_table,
                "source_id": source_id,
                "chunk_id": chunk_id,
                "vector_id": vector_id,
                "vector_index": vector_index,
                "namespace": namespace,
                "embedding_model": VECTORIZE_EMBEDDING_MODEL,
                "embedding_dimensions": VECTORIZE_EMBEDDING_DIMENSIONS,
                "embedding_version": VECTORIZE_EMBEDDING_VERSION,
                "metric": VECTORIZE_METRIC,
                "chunking_version": VECTORIZE_CHUNKING_VERSION,
                "content_hash": content_hash,
                "source_revision": source_revision,
                "source_locator_kind": source_locator_kind,
                "status": "queued",
                "failure_code": None,
                "indexed_at": None,
                "last_mutation_id": None,
                "input_hash": content_hash,
            }
        )
    return records


async def enqueue_vector_projection_records(
    db: AsyncSession,
    records: list[dict[str, Any]],
) -> None:
    """Upsert queued intent before calling the remote provider."""
    if not records:
        return
    insert_stmt = pg_insert(VectorIndexRecord).values(records)
    await db.execute(
        insert_stmt.on_conflict_do_update(
            index_elements=[VectorIndexRecord.vector_index, VectorIndexRecord.vector_id],
            set_={
                "tenant_id": insert_stmt.excluded.tenant_id,
                "user_id": insert_stmt.excluded.user_id,
                "source_family": insert_stmt.excluded.source_family,
                "source_table": insert_stmt.excluded.source_table,
                "source_id": insert_stmt.excluded.source_id,
                "chunk_id": insert_stmt.excluded.chunk_id,
                "namespace": insert_stmt.excluded.namespace,
                "embedding_model": insert_stmt.excluded.embedding_model,
                "embedding_dimensions": insert_stmt.excluded.embedding_dimensions,
                "embedding_version": insert_stmt.excluded.embedding_version,
                "metric": insert_stmt.excluded.metric,
                "chunking_version": insert_stmt.excluded.chunking_version,
                "content_hash": insert_stmt.excluded.content_hash,
                "source_revision": insert_stmt.excluded.source_revision,
                "source_locator_kind": insert_stmt.excluded.source_locator_kind,
                "input_hash": insert_stmt.excluded.input_hash,
                "status": "queued",
                "indexed_at": None,
                "last_mutation_id": None,
                "failure_code": None,
                "updated_at": datetime.utcnow(),
            },
        )
    )


async def mark_vector_projection_indexed(
    db: AsyncSession,
    *,
    vector_index: str,
    vector_ids: list[str],
    mutation_id: str | None,
) -> None:
    """Persist mutation evidence only after provider acknowledgement."""
    if not vector_ids:
        return
    await db.execute(
        update(VectorIndexRecord)
        .where(
            VectorIndexRecord.vector_index == vector_index,
            VectorIndexRecord.vector_id.in_(vector_ids),
        )
        .values(
            status="indexed",
            indexed_at=datetime.utcnow(),
            last_mutation_id=mutation_id,
            failure_code=None,
            updated_at=datetime.utcnow(),
        )
    )


async def mark_vector_projection_failed(
    db: AsyncSession,
    *,
    vector_index: str,
    vector_ids: list[str],
    failure_code: str,
) -> None:
    """Keep failed intent visible for reconciliation and bounded retry."""
    if not vector_ids:
        return
    await db.execute(
        update(VectorIndexRecord)
        .where(
            VectorIndexRecord.vector_index == vector_index,
            VectorIndexRecord.vector_id.in_(vector_ids),
        )
        .values(status="failed", failure_code=failure_code[:96], updated_at=datetime.utcnow())
    )
