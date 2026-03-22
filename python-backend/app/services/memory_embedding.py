"""
Memory Embedding Service — generates embeddings for scoped_memories.

Uses Celery for async processing and OpenAI text-embedding-3-small for 1536-dim vectors.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger(__name__)


class MemoryEmbeddingService:
    """Generates and stores embeddings for scoped memory records."""

    def __init__(self, embedding_client=None):
        self.embedding_client = embedding_client

    async def generate_embedding(self, text: str) -> list[float]:
        """Generate a 1536-dim embedding for the given text."""
        if not self.embedding_client:
            try:
                from app.services.embedding_service import EmbeddingService

                self.embedding_client = EmbeddingService()
            except ImportError:
                logger.warning("EmbeddingService not available, returning empty embedding")
                return []

        try:
            result = await self.embedding_client.embed(
                text=text,
                model="text-embedding-3-small",
            )
            return result if isinstance(result, list) else []
        except Exception as e:
            logger.error("Embedding generation failed: %s", e)
            return []

    async def embed_memory(self, memory_id: str, content: str, title: str = "") -> bool:
        """Generate and store embedding for a scoped memory record."""
        combined = f"{title} {content}".strip()
        embedding = await self.generate_embedding(combined)

        if not embedding:
            return False

        # F03: Use text() wrapper + parameterized bind params — never a raw SQL string.
        try:
            from sqlalchemy import text

            from app.core.database import get_session

            async with get_session() as session:
                await session.execute(
                    text("UPDATE scoped_memories SET embedding = :embedding WHERE id = :id"),
                    {"embedding": str(embedding).replace(" ", ""), "id": memory_id},
                )
                await session.commit()
            return True
        except Exception as e:
            logger.error("Failed to store embedding for memory %s: %s", memory_id, e)
            return False
