"""Tests for QueryRouter — intent classification to skip/invoke RAG."""

import pytest
from unittest.mock import AsyncMock, patch
from app.orchestrator.rag.query_router import QueryRouter, QueryIntent, QueryRouteDecision


# ---------------------------------------------------------------------------
# QueryIntent enum
# ---------------------------------------------------------------------------

class TestQueryIntent:
    """Tests for the QueryIntent enum."""

    def test_enum_members(self):
        """Enum should have KNOWLEDGE, CONVERSATIONAL, CREATIVE members."""
        assert hasattr(QueryIntent, "KNOWLEDGE")
        assert hasattr(QueryIntent, "CONVERSATIONAL")
        assert hasattr(QueryIntent, "CREATIVE")

    def test_enum_string_values(self):
        """String values should match expected."""
        assert QueryIntent.KNOWLEDGE == "knowledge"
        assert QueryIntent.CONVERSATIONAL == "conversational"
        assert QueryIntent.CREATIVE == "creative"


# ---------------------------------------------------------------------------
# QueryRouteDecision dataclass
# ---------------------------------------------------------------------------

class TestQueryRouteDecision:
    """Tests for QueryRouteDecision dataclass."""

    def test_all_fields(self):
        """Should have intent, confidence, skip_rag, reason fields."""
        decision = QueryRouteDecision(
            intent=QueryIntent.KNOWLEDGE,
            confidence=0.95,
            skip_rag=False,
            reason="Knowledge query detected.",
        )
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.confidence == 0.95
        assert decision.skip_rag is False
        assert decision.reason == "Knowledge query detected."


# ---------------------------------------------------------------------------
# Heuristic routing
# ---------------------------------------------------------------------------

class TestQueryRouterHeuristics:
    """Tests for fast regex/heuristic routing (no LLM call)."""

    @pytest.fixture
    def router(self):
        return QueryRouter()

    @pytest.mark.asyncio
    async def test_hello_is_conversational(self, router):
        decision = await router.route("hello")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    @pytest.mark.asyncio
    async def test_hi_is_conversational(self, router):
        decision = await router.route("hi")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    @pytest.mark.asyncio
    async def test_thanks_is_conversational(self, router):
        decision = await router.route("thanks")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    @pytest.mark.asyncio
    async def test_thank_you_is_conversational(self, router):
        decision = await router.route("thank you for helping")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    @pytest.mark.asyncio
    async def test_good_morning_is_conversational(self, router):
        decision = await router.route("good morning")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    @pytest.mark.asyncio
    async def test_write_poem_is_creative(self, router):
        decision = await router.route("write me a poem about clouds")
        assert decision.intent == QueryIntent.CREATIVE
        assert decision.skip_rag is True

    @pytest.mark.asyncio
    async def test_write_story_is_creative(self, router):
        decision = await router.route("write a story about a dragon")
        assert decision.intent == QueryIntent.CREATIVE
        assert decision.skip_rag is True

    @pytest.mark.asyncio
    async def test_policy_query_is_knowledge(self, router):
        decision = await router.route("what does the policy say about remote work")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False

    @pytest.mark.asyncio
    async def test_explain_process_is_knowledge(self, router):
        decision = await router.route("explain the process for onboarding new employees")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False

    @pytest.mark.asyncio
    async def test_how_does_work_is_knowledge(self, router):
        decision = await router.route("how does the authentication system work")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False

    @pytest.mark.asyncio
    async def test_skip_rag_logic(self, router):
        """skip_rag should be True for CONVERSATIONAL and CREATIVE, False for KNOWLEDGE."""
        conv = await router.route("hello there")
        creative = await router.route("write me a poem")
        knowledge = await router.route("what is the deployment process")

        assert conv.skip_rag is True
        assert creative.skip_rag is True
        assert knowledge.skip_rag is False


# ---------------------------------------------------------------------------
# LLM fallback
# ---------------------------------------------------------------------------

class TestQueryRouterLLMFallback:
    """Tests for LLM classification of ambiguous queries."""

    @pytest.fixture
    def router(self):
        return QueryRouter()

    @pytest.mark.asyncio
    async def test_ambiguous_falls_back_to_knowledge(self, router):
        """Ambiguous query with no LLM should default to KNOWLEDGE."""
        with patch.object(router, "_classify_with_llm", new_callable=AsyncMock, side_effect=RuntimeError("No LLM")):
            decision = await router.route("can you help me with something")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False

    @pytest.mark.asyncio
    async def test_llm_failure_defaults_to_knowledge(self, router):
        """LLM classification failure should default to KNOWLEDGE (safe fallback)."""
        with patch.object(router, "_classify_with_llm", new_callable=AsyncMock, side_effect=Exception("API error")):
            decision = await router.route("tell me about the company benefits")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False

    @pytest.mark.asyncio
    async def test_llm_returns_correct_intent(self, router):
        """LLM classification should return the classified intent."""
        with patch.object(
            router,
            "_classify_with_llm",
            new_callable=AsyncMock,
            return_value=QueryRouteDecision(
                intent=QueryIntent.CREATIVE,
                confidence=0.9,
                skip_rag=True,
                reason="LLM classified as creative.",
            ),
        ):
            decision = await router.route("imagine a world where cats rule")
        assert decision.intent == QueryIntent.CREATIVE
        assert decision.skip_rag is True
