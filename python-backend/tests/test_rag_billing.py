"""Tests for RAG query billing integration."""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.unit
@pytest.mark.asyncio
class TestRagBilling:
    """Tests for credit billing in the RAG retrieve path."""

    async def test_semantic_search_charges_credits(self):
        """Semantic search mode should trigger credit billing."""
        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, SearchMode, RAGConfig

        mock_vector = AsyncMock()
        mock_vector.retrieve.return_value = []
        engine = HybridRAGEngine(
            config=RAGConfig(mode=SearchMode.SEMANTIC),
            vector_retriever=mock_vector,
        )

        with patch("app.services.credit_billing_client.charge_credits_post_deduct") as mock_charge:
            mock_charge.return_value = {"creditsUsed": 1}
            await engine.retrieve("test query", user_id=42, tenant_id="test-tenant")
            mock_charge.assert_called_once()
            call_kwargs = mock_charge.call_args[1]
            assert call_kwargs["user_id"] == 42
            assert call_kwargs["amount"] == 1
            assert call_kwargs["service"] == "rag.semantic_search"

    async def test_keyword_search_does_not_charge(self):
        """BM25-only (keyword) search should NOT trigger billing."""
        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, SearchMode, RAGConfig

        mock_bm25 = AsyncMock()
        mock_bm25.retrieve.return_value = []
        engine = HybridRAGEngine(
            config=RAGConfig(mode=SearchMode.KEYWORD),
            bm25_retriever=mock_bm25,
        )

        with patch("app.services.credit_billing_client.charge_credits_post_deduct") as mock_charge:
            await engine.retrieve("keyword query", user_id=42, tenant_id="test-tenant")
            mock_charge.assert_not_called()

    async def test_no_user_id_no_billing(self):
        """When user_id is None, no billing should occur."""
        from app.orchestrator.rag.hybrid_rag import HybridRAGEngine, SearchMode, RAGConfig

        mock_vector = AsyncMock()
        mock_vector.retrieve.return_value = []
        engine = HybridRAGEngine(
            config=RAGConfig(mode=SearchMode.SEMANTIC),
            vector_retriever=mock_vector,
        )

        with patch("app.services.credit_billing_client.charge_credits_post_deduct") as mock_charge:
            await engine.retrieve("test query", user_id=None, tenant_id="test-tenant")
            mock_charge.assert_not_called()
