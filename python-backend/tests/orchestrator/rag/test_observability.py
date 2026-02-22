"""Tests for observability enhancements -- Phase 5.3."""

import json
import pytest

from app.orchestrator.rag.hybrid_rag import (
    HybridRAGEngine,
    RAGConfig,
    SearchMode,
)


@pytest.fixture
def engine_with_docs():
    """Engine with caching/reranking disabled for test isolation."""
    config = RAGConfig(
        mode=SearchMode.HYBRID,
        use_rerank=False,
        use_cache=False,
    )
    return HybridRAGEngine(config=config)


def _extract_log_event(caplog, event_name: str) -> dict | None:
    """Extract a structured log event from caplog records."""
    for record in caplog.records:
        msg = record.getMessage()
        try:
            data = json.loads(msg)
            if data.get("event") == event_name:
                return data
        except (json.JSONDecodeError, TypeError):
            if event_name in msg:
                return {"raw": msg}
    return None


class TestLogEventIncludesQuality:
    @pytest.mark.asyncio
    async def test_quality_in_log(self, engine_with_docs, caplog):
        engine = engine_with_docs
        await engine.add_document(
            content="Test doc content",
            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
            doc_id="doc-1",
        )
        with caplog.at_level("INFO"):
            await engine.retrieve(
                query="test query",
                tenant_id="t1",
                effective_scopes=["p:global"],
            )
        event = _extract_log_event(caplog, "rag_retrieval_complete")
        assert event is not None
        assert "quality" in event


class TestLogEventIncludesConfidence:
    @pytest.mark.asyncio
    async def test_confidence_in_log(self, engine_with_docs, caplog):
        engine = engine_with_docs
        await engine.add_document(
            content="Test doc",
            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
            doc_id="doc-1",
        )
        with caplog.at_level("INFO"):
            await engine.retrieve(
                query="test",
                tenant_id="t1",
                effective_scopes=["p:global"],
            )
        event = _extract_log_event(caplog, "rag_retrieval_complete")
        assert event is not None
        assert "confidence" in event


class TestLogEventIncludesQueryStrategy:
    @pytest.mark.asyncio
    async def test_query_strategy_in_log(self, engine_with_docs, caplog):
        engine = engine_with_docs
        await engine.add_document(
            content="Test doc",
            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
            doc_id="doc-1",
        )
        with caplog.at_level("INFO"):
            await engine.retrieve(
                query="test",
                tenant_id="t1",
                effective_scopes=["p:global"],
            )
        event = _extract_log_event(caplog, "rag_retrieval_complete")
        assert event is not None
        assert "query_strategy" in event


class TestLogEventIncludesScopeFilterCount:
    @pytest.mark.asyncio
    async def test_scope_filter_count_in_log(self, engine_with_docs, caplog):
        engine = engine_with_docs
        await engine.add_document(
            content="Test doc",
            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
            doc_id="doc-1",
        )
        with caplog.at_level("INFO"):
            await engine.retrieve(
                query="test",
                tenant_id="t1",
                effective_scopes=["u:42", "g:10", "p:global"],
            )
        event = _extract_log_event(caplog, "rag_retrieval_complete")
        assert event is not None
        assert "scope_filter_count" in event
        assert event["scope_filter_count"] == 3


class TestLogEventIncludesCacheHit:
    @pytest.mark.asyncio
    async def test_cache_hit_false(self, engine_with_docs, caplog):
        engine = engine_with_docs
        await engine.add_document(
            content="Test doc",
            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
            doc_id="doc-1",
        )
        with caplog.at_level("INFO"):
            await engine.retrieve(
                query="test",
                tenant_id="t1",
                effective_scopes=["p:global"],
            )
        event = _extract_log_event(caplog, "rag_retrieval_complete")
        assert event is not None
        assert "cache_hit" in event
        assert event["cache_hit"] is False

    @pytest.mark.asyncio
    async def test_cache_hit_true(self, caplog):
        config = RAGConfig(
            mode=SearchMode.HYBRID,
            use_rerank=False,
            use_cache=True,
        )
        engine = HybridRAGEngine(config=config)
        await engine.add_document(
            content="Test doc",
            metadata={"tenant_id": "t1", "allowed_scopes": ["p:global"]},
            doc_id="doc-1",
        )
        # First call: populate cache
        await engine.retrieve(
            query="test",
            tenant_id="t1",
            effective_scopes=["p:global"],
        )
        # Second call: should hit cache
        caplog.clear()
        with caplog.at_level("INFO"):
            await engine.retrieve(
                query="test",
                tenant_id="t1",
                effective_scopes=["p:global"],
            )
        event = _extract_log_event(caplog, "rag_retrieval_complete")
        assert event is not None
        assert "cache_hit" in event
        assert event["cache_hit"] is True
