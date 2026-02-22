"""
End-to-end scope enforcement integration tests — Phase 4.4.

These tests verify the full pipeline: query through executor with scope
filtering, reranking, and guardrails. Requires prior sections' components.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.rag_executor import RAGExecutor
from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode


def _make_chunk(
    *,
    id: int = 1,
    tenant_id: str = "tenant-a",
    library_item_id: int = 100,
    content: str = "Some content",
    allowed_scopes: list | None = None,
    metadata_json: dict | None = None,
) -> MagicMock:
    chunk = MagicMock()
    chunk.id = id
    chunk.tenant_id = tenant_id
    chunk.library_item_id = library_item_id
    chunk.chunk_index = 0
    chunk.content = content
    chunk.is_parent = False
    chunk.allowed_scopes = allowed_scopes or ["p:global"]
    chunk.metadata_json = metadata_json or {}
    chunk.vector_ref_id = f"vec-{id}"
    return chunk


def _make_item(*, id: int = 100, title: str = "Doc") -> MagicMock:
    item = MagicMock()
    item.id = id
    item.title = title
    item.item_type = "document"
    item.visibility = "private"
    return item


def _make_tenant(*, id: str = "tenant-a", settings: dict | None = None) -> MagicMock:
    tenant = MagicMock()
    tenant.id = id
    tenant.settings = settings or {}
    tenant.plan = MagicMock(value="free")
    return tenant


def _patch_db(chunks, items, tenant):
    session = AsyncMock()

    async def _execute_side_effect(stmt):
        result_mock = MagicMock()
        stmt_str = str(stmt)
        if "library_chunks" in stmt_str.lower() or "librarychunk" in stmt_str.lower():
            result_mock.scalars.return_value.all.return_value = chunks
        elif "library_items" in stmt_str.lower() or "libraryitem" in stmt_str.lower():
            result_mock.scalars.return_value.all.return_value = items
        else:
            result_mock.scalars.return_value.first.return_value = tenant
            result_mock.scalar_one_or_none.return_value = tenant
        return result_mock

    session.execute = AsyncMock(side_effect=_execute_side_effect)

    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=session)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx, session


@pytest.mark.integration
class TestE2EScopeEnforcement:
    """End-to-end tests for scope enforcement through the full RAG pipeline."""

    @pytest.mark.asyncio
    async def test_no_cross_tenant_documents_in_results(self):
        """Query as tenant A must never return tenant B's documents."""
        # Tenant A's chunks
        chunks_a = [_make_chunk(id=1, tenant_id="tenant-a", content="Tenant A data")]
        items = [_make_item()]
        tenant = _make_tenant(id="tenant-a")
        ctx_mock, _ = _patch_db(chunks_a, items, tenant)

        # Only tenant-a docs should be retrieved because the executor filters by tenant_id
        tenant_a_result = RAGResult(
            query="test",
            documents=[
                Document(
                    doc_id="d1",
                    content="Tenant A data",
                    final_score=0.9,
                    parent_doc_title="Doc",
                    metadata={"tenant_id": "tenant-a"},
                ),
            ],
            final_count=1,
            mode=SearchMode.HYBRID,
        )

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-a",
            workflow_id="wf-1",
            execution_id="exec-1",
            extra_data={"effective_scopes": ["u:1", "p:global"]},
        )
        data = NodeExecutionData(
            node_id="rag-1",
            node_type="rag_query",
            config={"top_k": 5, "mode": "hybrid"},
            inputs={"query": "search data"},
            state={},
        )

        executor = RAGExecutor()

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=tenant_a_result)
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(data, context)

        # Verify retrieve was called with tenant-a isolation
        retrieve_kwargs = engine.retrieve.call_args.kwargs
        assert retrieve_kwargs["tenant_id"] == "tenant-a"

        # No tenant-b data should appear
        for doc in result["documents"]:
            assert "tenant-b" not in doc.get("text", "").lower()

    @pytest.mark.asyncio
    async def test_full_pipeline_respects_scopes_and_produces_quality(self):
        """Full pipeline must respect scopes and include quality assessment."""
        chunks = [
            _make_chunk(id=1, content="Scoped content", allowed_scopes=["u:1", "p:global"]),
        ]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        scoped_result = RAGResult(
            query="test",
            documents=[
                Document(
                    doc_id="d1",
                    content="Scoped content",
                    final_score=0.8,
                    parent_doc_title="Doc",
                    section_heading="S1",
                    chunk_id="chunk-1",
                    parent_doc_id="100",
                ),
            ],
            final_count=1,
            mode=SearchMode.HYBRID,
            retrieval_time_ms=30,
            rerank_time_ms=10,
            total_time_ms=50,
            bm25_candidates=3,
            vector_candidates=5,
        )

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-a",
            workflow_id="wf-1",
            execution_id="exec-1",
            extra_data={"effective_scopes": ["u:1", "p:global"]},
        )
        data = NodeExecutionData(
            node_id="rag-1",
            node_type="rag_query",
            config={"top_k": 5, "mode": "hybrid"},
            inputs={"query": "find content"},
            state={},
        )

        executor = RAGExecutor()

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=scoped_result)
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(data, context)

        # Scopes were passed to retrieve
        retrieve_kwargs = engine.retrieve.call_args.kwargs
        assert retrieve_kwargs["effective_scopes"] == ["u:1", "p:global"]

        # Quality assessment is present
        assert "quality" in result
        assert result["quality"]["quality"] in ("high", "medium", "low", "failed")

        # Metadata is present
        assert "metadata" in result
        assert "total_results" in result["metadata"]
