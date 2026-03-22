"""Tests for scope propagation to vector stores on permission changes."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from app.orchestrator.rag.scope_engine import (
    propagate_scopes_to_vector_stores,
    invalidate_rag_cache_for_item,
    handle_permission_change,
)


def _mock_session_with_chunks(chunk_rows: list[dict]) -> AsyncMock:
    """Build a mock session that returns chunk rows for vector_ref_id lookup."""
    session = AsyncMock()

    # The function calls session.execute multiple times:
    # 1. For chunk lookup (vector_ref_ids)
    # 2. For recompute_allowed_scopes (item lookup, perm lookup, updates)
    # We set up a side_effect list for each call.
    chunk_result = MagicMock()
    chunk_result.fetchall.return_value = [
        MagicMock(vector_ref_id=row["vector_ref_id"], id=row["id"])
        for row in chunk_rows
    ]
    session.execute = AsyncMock(return_value=chunk_result)
    return session


@pytest.mark.unit
@pytest.mark.asyncio
class TestPropagateToVectorStores:
    """Tests for propagate_scopes_to_vector_stores."""

    async def test_pgvector_metadata_updated(self):
        """pgvector store should receive metadata update with new allowed_scopes."""
        mock_pgvector = AsyncMock()
        mock_pgvector.update_document = AsyncMock(return_value=MagicMock())

        session = _mock_session_with_chunks([
            {"id": 1, "vector_ref_id": "vec-001"},
            {"id": 2, "vector_ref_id": "vec-002"},
        ])

        result = await propagate_scopes_to_vector_stores(
            item_id=10,
            new_allowed_scopes=["u:1", "g:10"],
            tenant_id="t1",
            session=session,
            pgvector_store=mock_pgvector,
        )

        assert mock_pgvector.update_document.call_count == 2
        # Verify metadata contains allowed_scopes
        for c in mock_pgvector.update_document.call_args_list:
            assert c[1]["metadata"]["allowed_scopes"] == ["u:1", "g:10"]

        assert result["pgvector"] == 2

    async def test_pgvector_provider_updates_canonical_library_chunk_vectors(self):
        """When pgvector is the active provider, metadata is updated in the canonical table."""
        session = _mock_session_with_chunks([
            {"id": 1, "vector_ref_id": "vec-001"},
            {"id": 2, "vector_ref_id": "vec-002"},
        ])

        with patch(
            "app.services.library_indexing_service.resolve_library_vector_provider",
            return_value=("pgvector", {}),
        ), patch(
            "app.services.library_pgvector_service.update_library_chunk_vector_metadata",
            new_callable=AsyncMock,
        ) as mock_update:
            mock_update.return_value = 2

            result = await propagate_scopes_to_vector_stores(
                item_id=10,
                new_allowed_scopes=["u:1", "g:10"],
                tenant_id="t1",
                session=session,
            )

        mock_update.assert_awaited_once_with(
            session,
            tenant_id="t1",
            item_id=10,
            metadata_patch={"allowed_scopes": ["u:1", "g:10"]},
        )
        assert result["pgvector"] == 2

    async def test_cloudflare_vectorize_delete_and_reinsert(self):
        """Cloudflare Vectorize should delete + re-insert (no in-place update)."""
        mock_cf = AsyncMock()
        mock_cf.get_by_ids = AsyncMock(return_value=[
            {"id": "vec-001", "values": [0.1, 0.2], "metadata": {"old": True}},
        ])
        mock_cf.delete_by_ids = AsyncMock(return_value={})
        mock_cf.upsert = AsyncMock(return_value={})

        session = _mock_session_with_chunks([
            {"id": 1, "vector_ref_id": "vec-001"},
        ])

        result = await propagate_scopes_to_vector_stores(
            item_id=10,
            new_allowed_scopes=["u:1", "p:global"],
            tenant_id="t1",
            session=session,
            cloudflare_store=mock_cf,
        )

        mock_cf.delete_by_ids.assert_called_once_with(["vec-001"])
        mock_cf.upsert.assert_called_once()
        upsert_vectors = mock_cf.upsert.call_args[0][0]
        assert upsert_vectors[0]["metadata"]["allowed_scopes"] == ["u:1", "p:global"]
        assert result["cloudflare_vectorize"] == 1

    async def test_chromadb_metadata_updated(self):
        """ChromaDB collection should receive update with new metadata."""
        mock_collection = MagicMock()
        mock_collection.update = MagicMock()

        session = _mock_session_with_chunks([
            {"id": 1, "vector_ref_id": "vec-001"},
            {"id": 2, "vector_ref_id": "vec-002"},
        ])

        result = await propagate_scopes_to_vector_stores(
            item_id=10,
            new_allowed_scopes=["u:1"],
            tenant_id="t1",
            session=session,
            chromadb_collection=mock_collection,
        )

        mock_collection.update.assert_called_once()
        call_kwargs = mock_collection.update.call_args[1]
        assert call_kwargs["ids"] == ["vec-001", "vec-002"]
        assert result["chromadb"] == 2

    async def test_no_chunks_returns_zero(self):
        """When item has no chunks, all providers should report 0 updated."""
        session = _mock_session_with_chunks([])

        result = await propagate_scopes_to_vector_stores(
            item_id=999,
            new_allowed_scopes=["u:1"],
            tenant_id="t1",
            session=session,
        )

        assert result.get("pgvector", 0) == 0
        assert result.get("chromadb", 0) == 0
        assert result.get("cloudflare_vectorize", 0) == 0

    async def test_provider_error_does_not_fail_others(self):
        """If one provider fails, others should still be updated."""
        mock_pgvector = AsyncMock()
        mock_pgvector.update_document = AsyncMock(side_effect=Exception("pgvector down"))

        mock_collection = MagicMock()
        mock_collection.update = MagicMock()

        session = _mock_session_with_chunks([
            {"id": 1, "vector_ref_id": "vec-001"},
        ])

        result = await propagate_scopes_to_vector_stores(
            item_id=10,
            new_allowed_scopes=["u:1"],
            tenant_id="t1",
            session=session,
            pgvector_store=mock_pgvector,
            chromadb_collection=mock_collection,
        )

        # pgvector failed, chromadb succeeded
        assert result.get("pgvector", 0) == 0
        assert result["chromadb"] == 1


@pytest.mark.unit
@pytest.mark.asyncio
class TestInvalidateRagCache:
    """Tests for invalidate_rag_cache_for_item."""

    async def test_clears_tenant_cache_entries(self):
        """Cache entries for the given tenant should be removed."""
        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, RAGConfig, RAGResult
        from datetime import datetime

        engine = HybridRAGEngine(config=RAGConfig())
        # Pre-populate cache with entries for different tenants
        engine._cache["t1:abc:q1:10:hybrid"] = (RAGResult(query="q1"), datetime.utcnow())
        engine._cache["t1:def:q2:10:hybrid"] = (RAGResult(query="q2"), datetime.utcnow())
        engine._cache["t2:ghi:q3:10:hybrid"] = (RAGResult(query="q3"), datetime.utcnow())

        count = await invalidate_rag_cache_for_item(
            item_id=1,
            tenant_id="t1",
            engine=engine,
        )

        assert count == 2
        assert len(engine._cache) == 1
        assert "t2:ghi:q3:10:hybrid" in engine._cache

    async def test_no_matching_entries_returns_zero(self):
        """When no cache entries match the tenant, return 0."""
        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, RAGConfig

        engine = HybridRAGEngine(config=RAGConfig())

        count = await invalidate_rag_cache_for_item(
            item_id=1,
            tenant_id="nonexistent",
            engine=engine,
        )

        assert count == 0


@pytest.mark.unit
@pytest.mark.asyncio
class TestHandlePermissionChange:
    """Tests for handle_permission_change orchestrator."""

    async def test_recomputes_and_propagates(self):
        """handle_permission_change should recompute scopes and propagate."""
        session = AsyncMock()

        # Mock recompute_allowed_scopes to return new scopes
        with patch(
            "app.orchestrator.rag.scope_engine.recompute_allowed_scopes",
            new_callable=AsyncMock,
        ) as mock_recompute, patch(
            "app.orchestrator.rag.scope_engine.propagate_scopes_to_vector_stores",
            new_callable=AsyncMock,
        ) as mock_propagate, patch(
            "app.orchestrator.rag.scope_engine.invalidate_rag_cache_for_item",
            new_callable=AsyncMock,
        ) as mock_invalidate:
            mock_recompute.return_value = ["u:1", "g:10"]
            mock_propagate.return_value = {"pgvector": 2}
            mock_invalidate.return_value = 1

            await handle_permission_change(
                item_id=10,
                tenant_id="t1",
                session=session,
            )

            mock_recompute.assert_called_once_with(10, session)
            mock_propagate.assert_called_once()
            propagate_kwargs = mock_propagate.call_args[1]
            assert propagate_kwargs["item_id"] == 10
            assert propagate_kwargs["new_allowed_scopes"] == ["u:1", "g:10"]
            assert propagate_kwargs["tenant_id"] == "t1"
            mock_invalidate.assert_called_once_with(
                item_id=10, tenant_id="t1", engine=None
            )

    async def test_empty_recompute_still_propagates(self):
        """Even if recompute returns empty (item not found), propagation is skipped."""
        session = AsyncMock()

        with patch(
            "app.orchestrator.rag.scope_engine.recompute_allowed_scopes",
            new_callable=AsyncMock,
        ) as mock_recompute, patch(
            "app.orchestrator.rag.scope_engine.propagate_scopes_to_vector_stores",
            new_callable=AsyncMock,
        ) as mock_propagate:
            mock_recompute.return_value = []

            await handle_permission_change(
                item_id=999,
                tenant_id="t1",
                session=session,
            )

            mock_recompute.assert_called_once()
            # Propagation should be skipped when scopes are empty
            mock_propagate.assert_not_called()
