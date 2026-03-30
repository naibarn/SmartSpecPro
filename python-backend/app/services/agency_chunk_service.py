"""Agency chunk storage and semantic fallback retrieval."""

from __future__ import annotations

import inspect
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agency_memory_chunks import AgencyMemoryChunk
from app.services.agentic_sanitizer import sanitize_llm_input
from app.services.agentic_safety_filter import memory_safety_filter

logger = structlog.get_logger(__name__)

MIN_CHUNK_RETENTION_DAYS = 3
MAX_CHUNK_RETENTION_DAYS = 30


def _embedding_to_pgvector(embedding: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in embedding) + "]"


def _cosine_similarity(left: list[float] | None, right: list[float] | None) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0

    dot_product = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for left_value, right_value in zip(left, right):
        l = float(left_value)
        r = float(right_value)
        dot_product += l * r
        left_norm += l * l
        right_norm += r * r

    if left_norm <= 0.0 or right_norm <= 0.0:
        return 0.0

    return max(0.0, min(1.0, dot_product / math.sqrt(left_norm * right_norm)))


class AgencyChunkService:
    """Level 2 chunk storage: split agent outputs into embeddable segments."""

    CHUNK_SIZE = 500
    CHUNK_OVERLAP = 50
    CHUNK_SIZE_CHARS = 2000
    CHUNK_OVERLAP_CHARS = 200
    MAX_CHUNKS_PER_OUTPUT = 30
    MIN_CHUNK_LENGTH = 20
    DEFAULT_RETENTION_DAYS = 7

    def __init__(self, db: AsyncSession, embedding_service: Any) -> None:
        self.db = db
        self.embedding_service = embedding_service

    def _split_into_chunks(self, text: str) -> list[str]:
        normalized = str(text or "").strip()
        if not normalized:
            return []

        chunks: list[str] = []
        cursor = 0
        total_length = len(normalized)

        while cursor < total_length and len(chunks) < self.MAX_CHUNKS_PER_OUTPUT:
            window_end = min(cursor + self.CHUNK_SIZE_CHARS, total_length)
            chunk_end = window_end

            if window_end < total_length:
                search_start = max(cursor, window_end - 400)
                window = normalized[search_start:window_end]
                best_end: int | None = None
                for pattern in ("\n\n", ".\n", ". ", "\n"):
                    idx = window.rfind(pattern)
                    if idx >= 0:
                        candidate_end = search_start + idx + (2 if pattern == "\n\n" else 1)
                        if candidate_end - cursor >= self.MIN_CHUNK_LENGTH:
                            if best_end is None or candidate_end > best_end:
                                best_end = candidate_end
                if best_end is not None:
                    chunk_end = best_end

            raw_chunk = normalized[cursor:chunk_end]
            chunk = raw_chunk.lstrip().rstrip(" ")
            if len(chunk.strip()) >= self.MIN_CHUNK_LENGTH:
                chunks.append(chunk)

            if chunk_end >= total_length:
                break

            next_cursor = max(chunk_end - self.CHUNK_OVERLAP_CHARS, cursor + 1)
            cursor = next_cursor

        return chunks[: self.MAX_CHUNKS_PER_OUTPUT]

    async def _batch_embed(self, chunks: list[str]) -> list[list[float] | None]:
        if not chunks:
            return []

        try:
            embed_batch_fn = getattr(self.embedding_service, "embed_batch", None)
            if embed_batch_fn is None:
                return [None] * len(chunks)

            embeddings = embed_batch_fn(chunks)
            if inspect.isawaitable(embeddings):
                embeddings = await embeddings
        except Exception as exc:
            logger.warning("agency_chunk_embed_failed", error=str(exc)[:120], chunk_count=len(chunks))
            return [None] * len(chunks)

        if not isinstance(embeddings, list):
            return [None] * len(chunks)

        normalized: list[list[float] | None] = []
        for embedding in embeddings[: len(chunks)]:
            if isinstance(embedding, list) and embedding:
                try:
                    normalized.append([float(value) for value in embedding])
                except Exception:
                    normalized.append(None)
            else:
                normalized.append(None)

        while len(normalized) < len(chunks):
            normalized.append(None)

        return normalized

    async def chunk_and_store(
        self,
        output: str,
        tenant_id: str,
        agency_id: str,
        user_id: int,
        agent_node_id: str,
        run_id: str,
        source_node_id: str,
        metadata: dict | None = None,
        chunk_retention_days: int = 7,
    ) -> int:
        sanitized_output = sanitize_llm_input(output)
        chunks = self._split_into_chunks(sanitized_output)
        if not chunks:
            return 0

        # Safety filter: reject chunks that look like prompt injection
        safe_chunks: list[str] = []
        for chunk in chunks:
            if await memory_safety_filter(chunk):
                safe_chunks.append(chunk)
            else:
                logger.info(
                    "chunk_rejected_by_safety_filter",
                    tenant_id=tenant_id,
                    agency_id=agency_id,
                    chunk_preview=chunk[:80],
                )
        chunks = safe_chunks
        if not chunks:
            return 0

        embeddings = await self._batch_embed(chunks)
        clamped_days = max(MIN_CHUNK_RETENTION_DAYS, min(MAX_CHUNK_RETENTION_DAYS, int(chunk_retention_days or self.DEFAULT_RETENTION_DAYS)))
        expires_at = datetime.now(timezone.utc) + timedelta(days=clamped_days)

        for index, chunk in enumerate(chunks):
            embedding = embeddings[index] if index < len(embeddings) else None
            row = AgencyMemoryChunk(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                agency_id=agency_id,
                user_id=user_id,
                agent_node_id=agent_node_id,
                run_id=run_id,
                source_node_id=source_node_id,
                chunk_index=index,
                content=chunk,
                embedding=embedding,
                metadata_json=metadata,
                expires_at=expires_at,
            )
            add_result = self.db.add(row)
            if inspect.isawaitable(add_result):
                await add_result

        await self.db.commit()
        return len(chunks)

    async def search_chunks(
        self,
        query_embedding: list[float],
        tenant_id: str,
        agency_id: str,
        agent_node_id: str | None,
        user_id: int,
        top_k: int = 5,
        threshold: float = 0.5,
    ) -> list[dict]:
        """Search chunks by vector similarity.

        agent_node_id: If provided, filter to specific node. If None, search agency-wide.
        """
        if not query_embedding:
            return []

        conditions = [
            AgencyMemoryChunk.tenant_id == tenant_id,
            AgencyMemoryChunk.agency_id == agency_id,
            AgencyMemoryChunk.user_id == user_id,
            AgencyMemoryChunk.embedding.is_not(None),
            AgencyMemoryChunk.expires_at > datetime.now(timezone.utc),
        ]
        if agent_node_id:
            conditions.append(AgencyMemoryChunk.agent_node_id == agent_node_id)

        stmt = (
            select(AgencyMemoryChunk)
            .where(and_(*conditions))
            .order_by(text("embedding <=> CAST(:query_embedding AS vector)"))
            .limit(max(1, top_k * 2))
            .params(query_embedding=_embedding_to_pgvector(query_embedding))
        )

        result = await self.db.execute(stmt)
        rows = result.scalars().all()

        matches: list[dict] = []
        for row in rows:
            similarity = _cosine_similarity(query_embedding, list(row.embedding) if row.embedding is not None else None)
            if similarity < threshold:
                continue
            matches.append(
                {
                    "id": row.id,
                    "content": row.content,
                    "similarity": similarity,
                    "sourceNodeId": row.source_node_id,
                    "chunkIndex": row.chunk_index,
                    "metadata": row.metadata_json,
                    "createdAt": row.created_at.isoformat() if row.created_at else None,
                }
            )

        matches.sort(key=lambda item: item["similarity"], reverse=True)
        return matches[:top_k]
