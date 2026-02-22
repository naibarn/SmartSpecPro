"""
SmartSpec Pro - Query Router
Phase 2: Quality & Intelligence

Intent classification to skip RAG for non-knowledge queries.
Uses fast heuristics first, falls back to LLM for ambiguous queries.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

import structlog

logger = structlog.get_logger()


class QueryIntent(str, Enum):
    """Query intent classification."""
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


# Compiled regex patterns for heuristic routing
_CONVERSATIONAL_PATTERNS = [
    re.compile(r"^(hello|hi|hey|good morning|good afternoon|good evening)\b", re.IGNORECASE),
    re.compile(r"^(thanks|thank you|thx|cheers)\b", re.IGNORECASE),
    re.compile(r"^(who are you|what can you do|how do you work)\b", re.IGNORECASE),
    re.compile(r"^(bye|goodbye|see you|good night)\b", re.IGNORECASE),
]

_CREATIVE_PATTERNS = [
    re.compile(
        r"^(write|compose|create|draft|generate)\s+(me\s+)?(a\s+)?(poem|story|essay|song|letter|email)\b",
        re.IGNORECASE,
    ),
    re.compile(r"^(write|tell)\s+(me\s+)?a\s+(joke|riddle)\b", re.IGNORECASE),
]


class QueryRouter:
    """
    Lightweight router that classifies query intent to avoid unnecessary RAG retrieval.

    Uses fast heuristics first (regex patterns for greetings, thanks, creative prompts).
    Falls back to LLM classification for ambiguous queries.
    Default assumption: KNOWLEDGE (safe fallback — extra RAG is cheaper than missing context).
    """

    def __init__(self, llm_model: str = "gpt-4.1-nano") -> None:
        self.llm_model = llm_model

    async def route(self, query: str) -> QueryRouteDecision:
        """Classify the query intent."""
        query_stripped = query.strip()

        word_count = len(query_stripped.split())

        # Fast heuristic: conversational patterns (only for short queries)
        if word_count < 8:
            for pattern in _CONVERSATIONAL_PATTERNS:
                if pattern.search(query_stripped):
                    return QueryRouteDecision(
                        intent=QueryIntent.CONVERSATIONAL,
                        confidence=0.95,
                        skip_rag=True,
                        reason="Matched conversational pattern.",
                    )

        # Fast heuristic: creative patterns
        for pattern in _CREATIVE_PATTERNS:
            if pattern.search(query_stripped):
                return QueryRouteDecision(
                    intent=QueryIntent.CREATIVE,
                    confidence=0.90,
                    skip_rag=True,
                    reason="Matched creative generation pattern.",
                )

        # For non-matching queries, try LLM classification
        try:
            decision = await self._classify_with_llm(query_stripped)
            if decision is not None:
                return decision
        except Exception as e:
            logger.warning("query_router_llm_fallback_failed", error=str(e))

        # Default: KNOWLEDGE (safe fallback)
        return QueryRouteDecision(
            intent=QueryIntent.KNOWLEDGE,
            confidence=0.5,
            skip_rag=False,
            reason="Default to knowledge query (safe fallback).",
        )

    async def _classify_with_llm(self, query: str) -> QueryRouteDecision | None:
        """
        Classify query intent using a cheap LLM model.

        Returns None — LLM integration deferred to Section 07 (rag-executor).
        The caller falls back to KNOWLEDGE (safe default).
        """
        return None
