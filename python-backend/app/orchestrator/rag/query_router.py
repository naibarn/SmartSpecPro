"""
Query intent router for RAG pipeline.

Classifies queries to decide whether RAG retrieval is needed:
  KNOWLEDGE      - needs RAG retrieval
  CONVERSATIONAL - greetings, meta-questions; skip RAG
  CREATIVE       - writing/generation tasks; skip RAG

Uses fast heuristics first (regex). Falls back to KNOWLEDGE
as the safe default (extra RAG is cheaper than missing context).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

import structlog

logger = structlog.get_logger()


class QueryIntent(str, Enum):
    """Intent classification for a user query."""
    KNOWLEDGE = "knowledge"
    CONVERSATIONAL = "conversational"
    CREATIVE = "creative"


@dataclass
class QueryRouteDecision:
    """Result of query intent classification."""
    intent: QueryIntent
    confidence: float
    skip_rag: bool
    reason: str


# Compiled regex patterns for heuristic matching
_CONVERSATIONAL_PATTERNS = re.compile(
    r"^(hello|hi|hey|good morning|good afternoon|good evening|"
    r"thanks|thank you|thx|cheers|"
    r"who are you|what can you do|how do you work)\b",
    re.IGNORECASE,
)

_CREATIVE_PATTERNS = re.compile(
    r"^(write|compose|create|draft|generate)\s+(me\s+)?(a\s+)?"
    r"(poem|story|essay|song|letter|email|joke|riddle)",
    re.IGNORECASE,
)

_CREATIVE_ALT_PATTERNS = re.compile(
    r"^(write|tell)\s+(me\s+)?a\s+(joke|riddle)",
    re.IGNORECASE,
)


class QueryRouter:
    """Lightweight router that classifies query intent to avoid unnecessary RAG retrieval."""

    async def route(self, query: str) -> QueryRouteDecision:
        """Classify the query intent.

        Uses fast heuristics first (regex patterns for greetings, thanks,
        creative prompts). Falls back to KNOWLEDGE for anything ambiguous.
        """
        stripped = query.strip()

        # Check conversational patterns — only for short queries to avoid
        # misclassifying "Hi, what is the refund policy?" as conversational
        word_count = len(stripped.split())
        if word_count < 8 and _CONVERSATIONAL_PATTERNS.search(stripped):
            return QueryRouteDecision(
                intent=QueryIntent.CONVERSATIONAL,
                confidence=0.95,
                skip_rag=True,
                reason="Matched conversational pattern.",
            )

        # Check creative patterns
        if _CREATIVE_PATTERNS.search(stripped) or _CREATIVE_ALT_PATTERNS.search(stripped):
            return QueryRouteDecision(
                intent=QueryIntent.CREATIVE,
                confidence=0.90,
                skip_rag=True,
                reason="Matched creative/generation pattern.",
            )

        # Default: KNOWLEDGE (safe fallback)
        try:
            decision = await self._classify_with_llm(stripped)
            if decision is not None:
                return decision
        except Exception:
            logger.debug("query_router_llm_fallback_failed", query=stripped[:50])

        return QueryRouteDecision(
            intent=QueryIntent.KNOWLEDGE,
            confidence=0.5,
            skip_rag=False,
            reason="No heuristic match; defaulting to knowledge query.",
        )

    async def _classify_with_llm(self, query: str) -> QueryRouteDecision | None:
        """Attempt LLM-based classification for ambiguous queries.

        Returns None if classification is inconclusive or unavailable.
        Currently returns None (LLM integration deferred to Section 07).
        """
        return None
