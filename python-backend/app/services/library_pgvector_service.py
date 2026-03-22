"""Library-specific pgvector helpers for indexing, search, and metadata updates."""

from __future__ import annotations

import json
from typing import Any

import structlog
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embedding_service import EmbeddingService, get_embedding_service

logger = structlog.get_logger(__name__)

TENANT_GUC_KEY = "app.current_tenant_id"
DEFAULT_PGVECTOR_CONNECT_TIMEOUT_SECONDS = 5
_EMBEDDING_DIMENSION_SQL = """
SELECT a.atttypmod
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname = 'library_chunk_vectors'
  AND a.attname = 'embedding'
"""


def _embedding_to_pgvector(embedding: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in embedding) + "]"


def _parse_connect_timeout(pgvector_config: dict[str, str] | None) -> int:
    raw_value = (pgvector_config or {}).get("pgvectorConnectTimeout")
    if raw_value is None:
        return DEFAULT_PGVECTOR_CONNECT_TIMEOUT_SECONDS

    try:
        parsed = int(str(raw_value).strip())
    except (TypeError, ValueError):
        return DEFAULT_PGVECTOR_CONNECT_TIMEOUT_SECONDS

    return max(1, min(parsed, 30))


def _validate_embedding_dimensions(embeddings: list[list[float]]) -> int:
    if not embeddings:
        raise RuntimeError("embedding_count_mismatch")

    lengths = {len(embedding) for embedding in embeddings}
    if len(lengths) != 1:
        raise RuntimeError("embedding_dimension_mismatch")
    dimension = next(iter(lengths))
    if dimension <= 0:
        raise RuntimeError("embedding_dimension_invalid")
    return int(dimension)


def _fetch_pgvector_table_dimension(cursor) -> int | None:
    cursor.execute(_EMBEDDING_DIMENSION_SQL)
    row = cursor.fetchone()
    if not row or row[0] is None:
        return None
    return int(row[0])


async def get_pgvector_table_dimension(session: AsyncSession) -> int | None:
    row = (
        await session.execute(text(_EMBEDDING_DIMENSION_SQL))
    ).first()
    if not row or row[0] is None:
        return None
    return int(row[0])


async def set_pgvector_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    """Set the tenant GUC used by pgvector RLS policies for the current transaction."""
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": tenant_id},
    )


def upsert_library_chunk_vectors(
    *,
    tenant_id: str,
    item_id: int,
    chunks: list[dict[str, Any]],
    embeddings: list[list[float]],
    pgvector_config: dict[str, str] | None = None,
) -> list[str]:
    """Upsert Library chunk embeddings into the canonical pgvector table."""
    if len(chunks) != len(embeddings):
        raise RuntimeError("embedding_count_mismatch")
    embedding_dimension = _validate_embedding_dimensions(embeddings)

    import psycopg

    cfg = pgvector_config or {}
    host = cfg.get("pgvectorHost", "localhost")
    port = cfg.get("pgvectorPort", "5432")
    database = cfg.get("pgvectorDatabase", "smartspec")
    user = cfg.get("pgvectorUser", "smartspec")
    password = cfg.get("pgvectorPassword", "")
    vector_ids = [f"lib:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks]
    connect_timeout = _parse_connect_timeout(cfg)

    with psycopg.connect(
        host=host,
        port=int(port),
        dbname=database,
        user=user,
        password=password,
        connect_timeout=connect_timeout,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('app.current_tenant_id', %s, true)", (tenant_id,))
            table_dimension = _fetch_pgvector_table_dimension(cur)
            if table_dimension is not None and table_dimension != embedding_dimension:
                raise RuntimeError(
                    f"pgvector_dimension_mismatch:table={table_dimension}:embedding={embedding_dimension}"
                )
            for vector_id, chunk, embedding in zip(vector_ids, chunks, embeddings):
                metadata = {
                    "tenant_id": tenant_id,
                    "item_id": item_id,
                    "chunk_index": chunk["chunk_index"],
                    "vector_ref_id": vector_id,
                    "token_count": chunk.get("token_count") or 0,
                    "content_type": chunk.get("content_type") or "text",
                    "allowed_scopes": chunk.get("allowed_scopes") or [],
                }
                cur.execute(
                    """
                    INSERT INTO library_chunk_vectors (
                        tenant_id,
                        library_item_id,
                        chunk_index,
                        embedding,
                        metadata,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s::vector, %s::jsonb, NOW(), NOW())
                    ON CONFLICT (library_item_id, chunk_index)
                    DO UPDATE SET
                        embedding = EXCLUDED.embedding,
                        metadata = EXCLUDED.metadata,
                        updated_at = NOW()
                    """,
                    (
                        tenant_id,
                        item_id,
                        chunk["chunk_index"],
                        _embedding_to_pgvector(embedding),
                        json.dumps(metadata),
                    ),
                )
        conn.commit()

    logger.info(
        "library_pgvector_upsert_success",
        tenant_id=tenant_id,
        item_id=item_id,
        vectors=len(vector_ids),
    )
    return vector_ids


async def delete_library_chunk_vectors(
    session: AsyncSession,
    *,
    tenant_id: str,
    item_id: int,
) -> int:
    """Delete all pgvector rows for a library item."""
    await set_pgvector_tenant_context(session, tenant_id)
    result = await session.execute(
        text(
            """
            DELETE FROM library_chunk_vectors
            WHERE tenant_id = :tenant_id
              AND library_item_id = :item_id
            """
        ),
        {"tenant_id": tenant_id, "item_id": item_id},
    )
    return int(result.rowcount or 0)


async def update_library_chunk_vector_metadata(
    session: AsyncSession,
    *,
    tenant_id: str,
    item_id: int,
    metadata_patch: dict[str, Any],
) -> int:
    """Merge metadata into all pgvector rows for a library item."""
    await set_pgvector_tenant_context(session, tenant_id)
    result = await session.execute(
        text(
            """
            UPDATE library_chunk_vectors
            SET metadata = metadata || CAST(:metadata_patch AS jsonb),
                updated_at = NOW()
            WHERE tenant_id = :tenant_id
              AND library_item_id = :item_id
            """
        ),
        {
            "tenant_id": tenant_id,
            "item_id": item_id,
            "metadata_patch": json.dumps(metadata_patch),
        },
    )
    return int(result.rowcount or 0)


async def search_library_pgvector_scores(
    session: AsyncSession,
    *,
    tenant_id: str,
    query: str,
    candidate_item_ids: list[int],
    embedding_service: EmbeddingService | None = None,
) -> list[dict[str, Any]]:
    """Return max vector score per Library item for the given query."""
    normalized_query = str(query or "").strip()
    if not normalized_query or not candidate_item_ids:
        return []

    embedder = embedding_service or get_embedding_service()
    query_embedding = embedder.embed_batch([normalized_query])[0]
    query_dimension = len(query_embedding)
    table_dimension = await get_pgvector_table_dimension(session)
    if table_dimension is not None and table_dimension != query_dimension:
        raise RuntimeError(
            f"pgvector_dimension_mismatch:table={table_dimension}:embedding={query_dimension}"
        )
    await set_pgvector_tenant_context(session, tenant_id)

    stmt = (
        text(
            """
            SELECT
                library_item_id,
                MAX(1 - (embedding <=> CAST(:query_embedding AS vector))) AS vector_score
            FROM library_chunk_vectors
            WHERE tenant_id = :tenant_id
              AND library_item_id IN :candidate_item_ids
            GROUP BY library_item_id
            ORDER BY vector_score DESC
            """
        ).bindparams(bindparam("candidate_item_ids", expanding=True))
    )

    rows = (
        await session.execute(
            stmt,
            {
                "tenant_id": tenant_id,
                "query_embedding": _embedding_to_pgvector(query_embedding),
                "candidate_item_ids": candidate_item_ids,
            },
        )
    ).mappings()

    return [
        {
            "item_id": int(row["library_item_id"]),
            "vector_score": float(row["vector_score"] or 0.0),
        }
        for row in rows
    ]
