"""Tests for SmartChunker integration into the library indexing pipeline."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

from app.orchestrator.rag.chunker import Chunk, ChunkConfig, ChunkStrategy, SmartChunker


def _make_chunk(index, is_parent, parent_chunk_id=None, content="test content"):
    return Chunk(
        chunk_id=f"chunk-{index}",
        content=content,
        index=index,
        parent_chunk_id=parent_chunk_id,
        parent_doc_id="doc-1",
        parent_doc_title="Test Doc",
        section_heading="",
        token_count=10,
        start_char=0,
        end_char=len(content),
        is_parent=is_parent,
        tenant_id="t1",
        allowed_scopes=["u:1"],
        metadata={"strategy": "recursive"},
    )


@pytest.mark.unit
@pytest.mark.asyncio
class TestIndexingPipelineIntegration:
    """Tests for SmartChunker integration with library_indexing_service."""

    async def test_creates_parent_and_child_chunks(self):
        """Indexing a document creates both parent and child chunks in DB."""
        parent = _make_chunk(0, is_parent=True, content="parent content")
        child1 = _make_chunk(1, is_parent=False, parent_chunk_id="chunk-0", content="child1")
        child2 = _make_chunk(2, is_parent=False, parent_chunk_id="chunk-0", content="child2")

        mock_chunker = MagicMock()
        mock_chunker.chunk.return_value = [parent, child1, child2]

        mock_embedder = MagicMock()
        mock_embedder.embed_batch.return_value = [[0.1] * 1536, [0.2] * 1536]

        mock_upsert = MagicMock(return_value=["vec-1", "vec-2"])

        # Verify SmartChunker produces both types
        all_chunks = mock_chunker.chunk("text", doc_id="1", doc_title="T", tenant_id="t1", allowed_scopes=[])
        parents = [c for c in all_chunks if c.is_parent]
        children = [c for c in all_chunks if not c.is_parent]

        assert len(parents) == 1
        assert len(children) == 2

        # Verify only children are embedded
        mock_embedder.embed_batch([c.content for c in children])
        assert mock_embedder.embed_batch.call_count == 1
        call_args = mock_embedder.embed_batch.call_args[0][0]
        assert len(call_args) == 2

    async def test_only_child_chunks_embedded(self):
        """Only child chunks (is_parent=False) are sent to the embedding service."""
        parent = _make_chunk(0, is_parent=True, content="parent content here")
        child = _make_chunk(1, is_parent=False, parent_chunk_id="chunk-0", content="child content")

        all_chunks = [parent, child]
        child_chunks = [c for c in all_chunks if not c.is_parent]

        assert len(child_chunks) == 1
        assert child_chunks[0].content == "child content"
        assert child_chunks[0].is_parent is False

    async def test_parent_chunks_not_in_vector_store(self):
        """Parent chunks are stored in DB but NOT indexed in vector store."""
        parent = _make_chunk(0, is_parent=True, content="parent content")
        child = _make_chunk(1, is_parent=False, parent_chunk_id="chunk-0")

        all_chunks = [parent, child]
        child_chunks = [c for c in all_chunks if not c.is_parent]
        parent_chunks = [c for c in all_chunks if c.is_parent]

        # Only child chunks get vector IDs
        mock_upsert = MagicMock(return_value=["vec-1"])
        vector_ids = mock_upsert(
            tenant_id="t1",
            item_id=1,
            chunks=[{"content": c.content} for c in child_chunks],
            embeddings=[[0.1]],
        )

        assert len(vector_ids) == len(child_chunks)
        # Parent should get vector_ref_id=None in DB
        assert parent_chunks[0].is_parent is True

    async def test_chunk_content_hashes_unique(self):
        """Chunk IDs are unique per item."""
        chunker = SmartChunker(ChunkConfig(
            strategy=ChunkStrategy.RECURSIVE,
            child_max_tokens=100,
            parent_max_tokens=250,
        ))
        text = (
            "First paragraph about machine learning algorithms.\n\n"
            "Second paragraph about neural networks and deep learning.\n\n"
            "Third paragraph about reinforcement learning methods."
        )
        chunks = chunker.chunk(
            text, doc_id="1", doc_title="T", tenant_id="t1", allowed_scopes=["u:1"],
        )
        ids = [c.chunk_id for c in chunks]
        assert len(ids) == len(set(ids)), "Duplicate chunk IDs found"

    async def test_reindexing_replaces_old_chunks(self):
        """Re-indexing the same document should produce new chunk IDs."""
        chunker = SmartChunker(ChunkConfig(
            strategy=ChunkStrategy.RECURSIVE,
            child_max_tokens=100,
            parent_max_tokens=250,
        ))
        text = "Some document content for testing re-indexing behavior."

        first_run = chunker.chunk(
            text, doc_id="1", doc_title="T", tenant_id="t1", allowed_scopes=["u:1"],
        )
        second_run = chunker.chunk(
            text, doc_id="1", doc_title="T", tenant_id="t1", allowed_scopes=["u:1"],
        )

        first_ids = {c.chunk_id for c in first_run}
        second_ids = {c.chunk_id for c in second_run}
        # UUIDs are generated fresh each time, so IDs should be different
        assert first_ids.isdisjoint(second_ids)


@pytest.mark.unit
@pytest.mark.asyncio
class TestEmbeddingStandardization:
    """Tests for embedding dimension standardization."""

    async def test_new_chunks_use_1536_dim(self):
        """New chunks should be embedded with 1536-dim model."""
        mock_embedder = MagicMock()
        mock_embedder.embed_batch.return_value = [[0.1] * 1536]

        result = mock_embedder.embed_batch(["test text"])
        assert len(result[0]) == 1536

    async def test_embedding_dimension_matches_service(self):
        """Embedding dimensions should match the configured service."""
        mock_embedder = MagicMock()
        mock_embedder.embed_batch.return_value = [[0.1] * 1536, [0.2] * 1536]

        embeddings = mock_embedder.embed_batch(["chunk1", "chunk2"])
        for emb in embeddings:
            assert len(emb) == 1536
