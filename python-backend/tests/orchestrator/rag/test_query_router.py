"""Tests for QueryRouter — intent classification to skip/invoke RAG."""

import pytest
from unittest.mock import AsyncMock, patch
from app.orchestrator.rag.query_router import QueryRouter, QueryIntent, QueryRouteDecision


class TestQueryIntent:
    """Tests for the QueryIntent enum."""

    def test_enum_members_exist(self):
        assert hasattr(QueryIntent, "KNOWLEDGE")
        assert hasattr(QueryIntent, "CONVERSATIONAL")
        assert hasattr(QueryIntent, "CREATIVE")

    def test_string_values(self):
        assert QueryIntent.KNOWLEDGE.value == "knowledge"
        assert QueryIntent.CONVERSATIONAL.value == "conversational"
        assert QueryIntent.CREATIVE.value == "creative"


class TestQueryRouteDecision:
    """Tests for QueryRouteDecision dataclass."""

    def test_all_fields_present(self):
        decision = QueryRouteDecision(
            intent=QueryIntent.KNOWLEDGE,
            confidence=0.9,
            skip_rag=False,
            reason="Looks like a knowledge query.",
        )
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.confidence == 0.9
        assert decision.skip_rag is False
        assert decision.reason == "Looks like a knowledge query."


@pytest.mark.asyncio
class TestQueryRouterHeuristics:
    """Tests for fast regex/heuristic routing (no LLM call)."""

    @pytest.fixture
    def router(self):
        return QueryRouter()

    async def test_hello_is_conversational(self, router):
        decision = await router.route("hello")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    async def test_hi_is_conversational(self, router):
        decision = await router.route("hi")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    async def test_thanks_is_conversational(self, router):
        decision = await router.route("thanks")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    async def test_thank_you_is_conversational(self, router):
        decision = await router.route("thank you for the help")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    async def test_good_morning_is_conversational(self, router):
        decision = await router.route("good morning")
        assert decision.intent == QueryIntent.CONVERSATIONAL
        assert decision.skip_rag is True

    async def test_write_poem_is_creative(self, router):
        decision = await router.route("write me a poem about cats")
        assert decision.intent == QueryIntent.CREATIVE
        assert decision.skip_rag is True

    async def test_write_story_is_creative(self, router):
        decision = await router.route("write a story about a dragon")
        assert decision.intent == QueryIntent.CREATIVE
        assert decision.skip_rag is True

    async def test_policy_question_is_knowledge(self, router):
        decision = await router.route("what does the policy say about vacation time")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False

    async def test_explain_process_is_knowledge(self, router):
        decision = await router.route("explain the process for onboarding new employees")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False

    async def test_how_does_work_is_knowledge(self, router):
        decision = await router.route("how does the authentication system work")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False

    async def test_skip_rag_true_for_non_knowledge(self, router):
        conv = await router.route("hey there")
        assert conv.skip_rag is True
        creative = await router.route("compose me a song about coding")
        assert creative.skip_rag is True

    async def test_skip_rag_false_for_knowledge(self, router):
        decision = await router.route("what are the security requirements")
        assert decision.skip_rag is False


@pytest.mark.asyncio
class TestQueryRouterLLMFallback:
    """Tests for LLM classification of ambiguous queries."""

    @pytest.fixture
    def router(self):
        return QueryRouter()

    async def test_llm_failure_defaults_to_knowledge(self, router):
        """When LLM classification fails, default to KNOWLEDGE (safe fallback)."""
        # An ambiguous query that doesn't match heuristics
        with patch.object(
            router, "_classify_with_llm", new_callable=AsyncMock,
            side_effect=Exception("LLM unavailable"),
        ):
            decision = await router.route("tell me something interesting about our quarterly numbers")
            assert decision.intent == QueryIntent.KNOWLEDGE
            assert decision.skip_rag is False

    async def test_ambiguous_query_falls_back(self, router):
        """Ambiguous queries that don't match heuristics should default to KNOWLEDGE."""
        decision = await router.route("tell me about the project timeline and milestones")
        assert decision.intent == QueryIntent.KNOWLEDGE
        assert decision.skip_rag is False
