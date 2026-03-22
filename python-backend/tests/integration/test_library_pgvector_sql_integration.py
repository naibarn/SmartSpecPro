"""Optional integration test for canonical library pgvector helpers.

Set PGVECTOR_INTEGRATION_DSN to run this against a real Postgres/pgvector instance.
"""

from __future__ import annotations

import os
import uuid
from urllib.parse import urlparse

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.services.library_pgvector_service import (
    delete_library_chunk_vectors,
    search_library_pgvector_scores,
    upsert_library_chunk_vectors,
)

PGVECTOR_INTEGRATION_DSN = os.getenv("PGVECTOR_INTEGRATION_DSN")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not PGVECTOR_INTEGRATION_DSN,
        reason="PGVECTOR_INTEGRATION_DSN not set",
    ),
]


class _FakeEmbeddingService:
    def __init__(self, embedding: list[float]):
        self._embedding = embedding

    def embed_batch(self, texts):
        return [self._embedding for _ in texts]


def _pgvector_config_from_dsn(dsn: str) -> dict[str, str]:
    parsed = urlparse(dsn.replace("postgresql+asyncpg://", "postgresql://"))
    return {
        "pgvectorHost": parsed.hostname or "localhost",
        "pgvectorPort": str(parsed.port or 5432),
        "pgvectorDatabase": (parsed.path or "/postgres").lstrip("/"),
        "pgvectorUser": parsed.username or "postgres",
        "pgvectorPassword": parsed.password or "",
    }


@pytest.mark.asyncio
async def test_library_pgvector_helpers_round_trip():
    tenant_id = f"tenant-{uuid.uuid4()}"
    item_id = int(uuid.uuid4().int % 1_000_000_000)
    target_embedding = [0.11, 0.22, 0.33]
    config = _pgvector_config_from_dsn(PGVECTOR_INTEGRATION_DSN or "")

    vector_ids = upsert_library_chunk_vectors(
        tenant_id=tenant_id,
        item_id=item_id,
        chunks=[
            {
                "chunk_index": 0,
                "content": "launch plan",
                "token_count": 2,
                "content_type": "text",
                "allowed_scopes": ["u:1"],
            }
        ],
        embeddings=[target_embedding],
        pgvector_config=config,
    )
    assert vector_ids == [f"lib:{tenant_id}:{item_id}:0"]

    engine = create_async_engine(PGVECTOR_INTEGRATION_DSN)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        try:
            results = await search_library_pgvector_scores(
                session,
                tenant_id=tenant_id,
                query="launch plan",
                candidate_item_ids=[item_id],
                embedding_service=_FakeEmbeddingService(target_embedding),
            )

            assert results
            assert results[0]["item_id"] == item_id
            assert results[0]["vector_score"] > 0.99

            removed_rows = await delete_library_chunk_vectors(
                session,
                tenant_id=tenant_id,
                item_id=item_id,
            )
            assert removed_rows >= 1
            await session.commit()
        finally:
            await session.execute(
                text(
                    """
                    DELETE FROM library_chunk_vectors
                    WHERE tenant_id = :tenant_id
                      AND library_item_id = :item_id
                    """
                ),
                {"tenant_id": tenant_id, "item_id": item_id},
            )
            await session.commit()

    await engine.dispose()
