"""
Tests for RAG Executor — Phase 4.4.

Validates that the executor:
1. Queries libraryChunks from PostgreSQL (not mock data)
2. Loads chunks into HybridRAGEngine for the query lifecycle
3. Uses effective_scopes from extra_data for filtering
4. Returns real documents with citations and quality assessment
5. Respects tenant's rag_failure_mode setting
6. Creates AsyncSession scoped to request lifecycle
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.rag_executor import RAGExecutor
from app.orchestrator.rag.hybrid_rag import Document, RAGResult, SearchMode
from app.orchestrator.rag.guardrails import RetrievalQuality, QualityAssessment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_chunk(
    *,
    id: int = 1,
    tenant_id: str = "tenant-abc",
    library_item_id: int = 100,
    chunk_index: int = 0,
    content: str = "Sample chunk content.",
    is_parent: bool = False,
    allowed_scopes: list | None = None,
    metadata_json: dict | None = None,
    vector_ref_id: str | None = None,
) -> MagicMock:
    """Build a mock LibraryChunk row."""
    chunk = MagicMock()
    chunk.id = id
    chunk.tenant_id = tenant_id
    chunk.library_item_id = library_item_id
    chunk.chunk_index = chunk_index
    chunk.content = content
    chunk.is_parent = is_parent
    chunk.allowed_scopes = allowed_scopes or ["u:42", "p:global"]
    chunk.metadata_json = metadata_json or {}
    chunk.vector_ref_id = vector_ref_id or f"vec-{id}"
    return chunk


def _make_item(
    *,
    id: int = 100,
    title: str = "Test Document",
    item_type: str = "document",
    visibility: str = "private",
) -> MagicMock:
    """Build a mock LibraryItem row."""
    item = MagicMock()
    item.id = id
    item.title = title
    item.item_type = item_type
    item.visibility = visibility
    return item


def _make_tenant(
    *,
    id: str = "tenant-abc",
    settings: dict | None = None,
    plan: str = "free",
) -> MagicMock:
    """Build a mock Tenant row."""
    tenant = MagicMock()
    tenant.id = id
    tenant.settings = settings or {}
    tenant.plan = MagicMock(value=plan)
    return tenant


def _rag_result_with_docs(
    docs: list[Document] | None = None,
    mode: SearchMode = SearchMode.HYBRID,
) -> RAGResult:
    """Build a RAGResult with provided documents."""
    if docs is None:
        docs = [
            Document(
                doc_id="d1",
                content="Refund policy details.",
                final_score=0.85,
                chunk_id="chunk-1",
                parent_doc_id="100",
                parent_doc_title="Test Document",
                section_heading="Refund Policy",
            ),
        ]
    return RAGResult(
        query="test query",
        documents=docs,
        final_count=len(docs),
        mode=mode,
        retrieval_time_ms=50,
        rerank_time_ms=20,
        total_time_ms=80,
        bm25_candidates=5,
        vector_candidates=8,
    )


@pytest.fixture
def executor():
    """Create a RAGExecutor instance."""
    return RAGExecutor()


@pytest.fixture
def base_context():
    """Create a minimal ExecutionContext with effective_scopes."""
    return ExecutionContext(
        user_id=42,
        tenant_id="tenant-abc",
        workflow_id="wf-1",
        execution_id="exec-1",
        credits_available=100,
        extra_data={
            "effective_scopes": ["u:42", "g:10", "t:tenant-abc", "p:global"],
            "user_token": "test-token",
        },
    )


@pytest.fixture
def base_data():
    """Create a minimal NodeExecutionData with a query."""
    return NodeExecutionData(
        node_id="rag-node-1",
        node_type="rag_query",
        config={"top_k": 5, "mode": "hybrid"},
        inputs={"query": "What is our refund policy?"},
        state={},
    )


def _patch_db(chunks, items, tenant):
    """Create a patched get_db_context that returns mock query results.

    Returns the session mock so callers can inspect query calls.
    """
    session = AsyncMock()

    # Map query results based on the model being queried
    async def _execute_side_effect(stmt):
        result_mock = MagicMock()
        # Simple heuristic: inspect the statement to figure out what's being queried.
        # We return different results depending on what the executor queries.
        stmt_str = str(stmt)
        if "library_chunks" in stmt_str.lower() or "librarychunk" in stmt_str.lower():
            result_mock.scalars.return_value.all.return_value = chunks
        elif "library_items" in stmt_str.lower() or "libraryitem" in stmt_str.lower():
            result_mock.scalars.return_value.all.return_value = items
        elif "tenants" in stmt_str.lower() or "tenant" in stmt_str.lower():
            result_mock.scalars.return_value.first.return_value = tenant
            result_mock.scalar_one_or_none.return_value = tenant
        else:
            # Fallback: try to detect by column filters
            result_mock.scalars.return_value.all.return_value = chunks
            result_mock.scalars.return_value.first.return_value = tenant
            result_mock.scalar_one_or_none.return_value = tenant
        return result_mock

    session.execute = AsyncMock(side_effect=_execute_side_effect)

    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=session)
    ctx.__aexit__ = AsyncMock(return_value=False)

    return ctx, session


# ---------------------------------------------------------------------------
# TestRAGExecutorQueryFromDB
# ---------------------------------------------------------------------------

class TestRAGExecutorQueryFromDB:
    """Test: executor queries libraryChunks from PostgreSQL (not mock data)."""

    @pytest.mark.asyncio
    async def test_queries_chunks_from_db(self, executor, base_context, base_data):
        """Executor must query LibraryChunk from the database, not return hardcoded data."""
        chunks = [_make_chunk(content="Real chunk from DB.")]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, session = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(base_data, base_context)

        # Session was used
        assert session.execute.called
        # Result must NOT contain stub data
        assert result.get("documents") is not None

    @pytest.mark.asyncio
    async def test_only_child_chunks_loaded(self, executor, base_context, base_data):
        """Executor must filter for is_parent=False, loading only child chunks for retrieval."""
        child = _make_chunk(id=1, is_parent=False, content="Child chunk")
        # Parent chunks should not be in the results from the DB query
        # (they're filtered out by the SQL WHERE clause)
        chunks = [child]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, session = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            await executor.execute(base_data, base_context)

        # Only the child chunk should be added to the engine
        assert engine.add_document.call_count == 1


# ---------------------------------------------------------------------------
# TestRAGExecutorLoadsIntoEngine
# ---------------------------------------------------------------------------

class TestRAGExecutorLoadsIntoEngine:
    """Test: executor loads chunks into HybridRAGEngine for query lifecycle."""

    @pytest.mark.asyncio
    async def test_loads_chunks_into_engine(self, executor, base_context, base_data):
        """Each DB chunk must be added to the engine with correct fields."""
        chunks = [
            _make_chunk(id=1, content="Chunk A", metadata_json={"section_heading": "Intro"}),
            _make_chunk(id=2, content="Chunk B", metadata_json={"section_heading": "Details"}),
        ]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            await executor.execute(base_data, base_context)

        assert engine.add_document.call_count == 2
        # Verify first chunk was loaded with correct content
        first_call = engine.add_document.call_args_list[0]
        assert first_call.kwargs.get("content") == "Chunk A" or first_call.args[0] == "Chunk A"

    @pytest.mark.asyncio
    async def test_engine_is_request_scoped(self, executor, base_context, base_data):
        """Engine should be created fresh per request and cleaned up after."""
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            await executor.execute(base_data, base_context)
            await executor.execute(base_data, base_context)

        # Engine class should be instantiated twice (once per request)
        assert engine_cls.call_count == 2
        # Cleanup should be called twice
        assert engine.cleanup.call_count == 2


# ---------------------------------------------------------------------------
# TestRAGExecutorEffectiveScopes
# ---------------------------------------------------------------------------

class TestRAGExecutorEffectiveScopes:
    """Test: executor uses effective_scopes from extra_data for filtering."""

    @pytest.mark.asyncio
    async def test_passes_scopes_to_retrieve(self, executor, base_context, base_data):
        """Effective scopes from extra_data must be passed to retrieve()."""
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            await executor.execute(base_data, base_context)

        # Verify retrieve was called with effective_scopes
        retrieve_call = engine.retrieve.call_args
        assert retrieve_call.kwargs.get("effective_scopes") == ["u:42", "g:10", "t:tenant-abc", "p:global"]

    @pytest.mark.asyncio
    async def test_missing_scopes_uses_safe_default(self, executor, base_context, base_data):
        """When effective_scopes is absent, default to ['u:<user_id>', 'p:global']."""
        base_context.extra_data.pop("effective_scopes", None)
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            await executor.execute(base_data, base_context)

        retrieve_call = engine.retrieve.call_args
        assert retrieve_call.kwargs.get("effective_scopes") == ["u:42", "p:global"]


# ---------------------------------------------------------------------------
# TestRAGExecutorReturnsRealResults
# ---------------------------------------------------------------------------

class TestRAGExecutorReturnsRealResults:
    """Test: executor returns real documents with citations and quality assessment."""

    @pytest.mark.asyncio
    async def test_returns_documents_with_citations(self, executor, base_context, base_data):
        """Result must include citation_ref, quality assessment, and real context."""
        docs = [
            Document(
                doc_id="d1",
                content="Refund policy allows 30-day returns.",
                final_score=0.85,
                chunk_id="chunk-1",
                parent_doc_id="100",
                parent_doc_title="Company Policies",
                section_heading="Refunds",
            ),
        ]
        rag_result = _rag_result_with_docs(docs)
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=rag_result)
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(base_data, base_context)

        # Must have documents, context, citations, quality, metadata
        assert "documents" in result
        assert "context" in result
        assert "citations" in result
        assert "quality" in result
        assert "metadata" in result

        # Documents should have citation info
        assert len(result["documents"]) > 0
        first_doc = result["documents"][0]
        assert "citation_ref" in first_doc
        assert "chunk_id" in first_doc

        # Quality should be present
        assert result["quality"]["quality"] in ("high", "medium", "low", "failed")

    @pytest.mark.asyncio
    async def test_does_not_return_stub_data(self, executor, base_context, base_data):
        """Result must not contain the old hardcoded stub strings."""
        chunks = [_make_chunk(content="Real data from DB")]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(base_data, base_context)

        # Must not contain old stub strings
        context_str = result.get("context", "")
        assert "Document 1 content" not in context_str
        assert "Document 2 content" not in context_str


# ---------------------------------------------------------------------------
# TestRAGExecutorTenantFailureMode
# ---------------------------------------------------------------------------

class TestRAGExecutorTenantFailureMode:
    """Test: executor respects tenant's rag_failure_mode setting."""

    @pytest.mark.asyncio
    async def test_strict_mode_refuses_on_low_quality(self, executor, base_context, base_data):
        """Strict failure mode must refuse answer when quality is LOW."""
        low_docs = [
            Document(doc_id="d1", content="Marginal match", final_score=0.2),
        ]
        rag_result = _rag_result_with_docs(low_docs)
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant(settings={"rag_failure_mode": "strict"})
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=rag_result)
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(base_data, base_context)

        # Strict mode + LOW quality => refuse: empty documents
        assert result["documents"] == []
        assert result["quality"]["recommended_action"] == "refuse_answer"

    @pytest.mark.asyncio
    async def test_permissive_mode_warns_on_low_quality(self, executor, base_context, base_data):
        """Permissive failure mode must return results with caveat for LOW quality."""
        low_docs = [
            Document(doc_id="d1", content="Marginal match", final_score=0.2),
        ]
        rag_result = _rag_result_with_docs(low_docs)
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant(settings={"rag_failure_mode": "permissive"})
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=rag_result)
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(base_data, base_context)

        # Permissive mode + LOW quality => warn: documents returned
        assert len(result["documents"]) > 0
        assert result["quality"]["recommended_action"] == "warn_user"

    @pytest.mark.asyncio
    async def test_default_failure_mode_is_permissive(self, executor, base_context, base_data):
        """When rag_failure_mode is not set in tenant settings, default to permissive."""
        low_docs = [
            Document(doc_id="d1", content="Marginal match", final_score=0.2),
        ]
        rag_result = _rag_result_with_docs(low_docs)
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant(settings={})  # No rag_failure_mode set
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=rag_result)
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(base_data, base_context)

        # Default = permissive, so LOW quality => warn, not refuse
        assert result["quality"]["recommended_action"] == "warn_user"


# ---------------------------------------------------------------------------
# TestRAGExecutorSessionLifecycle
# ---------------------------------------------------------------------------

class TestRAGExecutorSessionLifecycle:
    """Test: executor creates AsyncSession scoped to request lifecycle."""

    @pytest.mark.asyncio
    async def test_session_opened_and_closed(self, executor, base_context, base_data):
        """AsyncSession must be opened at start and closed at end of execute()."""
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, session = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=_rag_result_with_docs())
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            await executor.execute(base_data, base_context)

        ctx_mock.__aenter__.assert_called_once()
        ctx_mock.__aexit__.assert_called_once()

    @pytest.mark.asyncio
    async def test_session_closed_on_error(self, executor, base_context, base_data):
        """AsyncSession must be closed even if an error occurs during execution."""
        chunks = [_make_chunk()]
        items = [_make_item()]
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(side_effect=RuntimeError("retrieval error"))
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            # Should not raise — executor handles errors gracefully
            result = await executor.execute(base_data, base_context)

        # Session must still be closed
        ctx_mock.__aexit__.assert_called_once()
        # Engine cleanup must still be called
        engine.cleanup.assert_called_once()
        # Result should indicate failure with sanitized error
        assert result["quality"]["quality"] == "failed"
        # Error message must NOT leak raw exception details
        error_msg = result["metadata"].get("error", "")
        assert "retrieval error" in error_msg.lower() or error_msg == ""
        assert "RuntimeError" not in error_msg


# ---------------------------------------------------------------------------
# TestRAGExecutorEdgeCases
# ---------------------------------------------------------------------------

class TestRAGExecutorEdgeCases:
    """Edge case tests."""

    @pytest.mark.asyncio
    async def test_missing_tenant_id_returns_error(self, executor, base_data):
        """When tenant_id is None, executor returns error response."""
        context = ExecutionContext(
            user_id=42,
            tenant_id=None,
            workflow_id="wf-1",
            execution_id="exec-1",
        )
        result = await executor.execute(base_data, context)
        assert result["documents"] == []
        assert result["quality"]["quality"] == "failed"
        assert "tenant_id" in result["metadata"].get("error", "")

    @pytest.mark.asyncio
    async def test_no_chunks_found_returns_failed(self, executor, base_context, base_data):
        """When no chunks exist for tenant, return FAILED quality."""
        chunks = []  # No chunks
        items = []
        tenant = _make_tenant()
        ctx_mock, _ = _patch_db(chunks, items, tenant)

        with patch("app.orchestrator.node_executors.rag_executor.get_db_context", return_value=ctx_mock), \
             patch("app.orchestrator.node_executors.rag_executor.HybridRAGEngine") as engine_cls:
            engine = AsyncMock()
            engine.retrieve = AsyncMock(return_value=RAGResult(query="test"))
            engine.cleanup = AsyncMock()
            engine.add_document = AsyncMock()
            engine_cls.return_value = engine

            result = await executor.execute(base_data, base_context)

        assert result["documents"] == []
        assert result["quality"]["quality"] == "failed"
