"""Query processing strategies for RAG retrieval.

Provides pre-retrieval query transformation to improve search quality.
All strategies are opt-in; default PASSTHROUGH has zero overhead.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable

import structlog

logger = structlog.get_logger()


class QueryStrategy(str, Enum):
    PASSTHROUGH = "passthrough"
    REWRITE = "rewrite"
    HYDE = "hyde"
    MULTI_QUERY = "multi_query"
    STEP_BACK = "step_back"


@dataclass
class ProcessedQuery:
    original: str
    processed: str
    alternatives: list[str] = field(default_factory=list)
    strategy_used: str = "passthrough"
    hypothetical_doc: str | None = None


class QueryProcessor:
    """Processes queries before retrieval to improve search quality.

    Each strategy transforms the user query into a form that produces
    better retrieval results. Default is PASSTHROUGH (no transformation).
    """

    def __init__(
        self,
        llm_client: Callable[..., Any] | None = None,
        model: str = "gpt-4.1-nano",
    ):
        self._llm_client = llm_client
        self._model = model

    async def process(
        self,
        query: str,
        strategy: QueryStrategy = QueryStrategy.PASSTHROUGH,
    ) -> ProcessedQuery:
        """Process a query using the specified strategy."""
        if strategy == QueryStrategy.PASSTHROUGH:
            return self._passthrough(query)

        # LLM-dependent strategies require a client
        if self._llm_client is None:
            logger.warning(
                "query_processor_no_llm_client",
                strategy=strategy.value,
                msg="No LLM client; falling back to passthrough",
            )
            return self._passthrough(query)

        dispatch = {
            QueryStrategy.REWRITE: self._rewrite,
            QueryStrategy.HYDE: self._hyde,
            QueryStrategy.MULTI_QUERY: self._multi_query,
            QueryStrategy.STEP_BACK: self._step_back,
        }
        handler = dispatch.get(strategy)
        if handler is None:
            return self._passthrough(query)

        try:
            return await handler(query)
        except Exception as exc:
            logger.warning(
                "query_processor_fallback",
                strategy=strategy.value,
                error=str(exc),
            )
            return self._passthrough(query)

    def _passthrough(self, query: str) -> ProcessedQuery:
        return ProcessedQuery(
            original=query,
            processed=query,
            alternatives=[],
            strategy_used="passthrough",
            hypothetical_doc=None,
        )

    async def _rewrite(self, query: str) -> ProcessedQuery:
        prompt = (
            "Rewrite this search query for better information retrieval. "
            "Return ONLY the rewritten query, nothing else.\n\n"
            f"Query: {query}"
        )
        result = await self._llm_client(prompt)
        cleaned = result.strip()
        return ProcessedQuery(
            original=query,
            processed=cleaned,
            strategy_used="rewrite",
        )

    async def _hyde(self, query: str) -> ProcessedQuery:
        prompt = (
            "Write a short paragraph (3-5 sentences) that would answer this question. "
            "Write as if you are an authoritative source.\n\n"
            f"Question: {query}"
        )
        hypothetical = await self._llm_client(prompt)
        hypothetical = hypothetical.strip()
        return ProcessedQuery(
            original=query,
            processed=hypothetical,
            strategy_used="hyde",
            hypothetical_doc=hypothetical,
        )

    async def _multi_query(self, query: str) -> ProcessedQuery:
        prompt = (
            "Generate 3-5 alternative search queries for the following query. "
            "Return each query on a new line, nothing else.\n\n"
            f"Query: {query}"
        )
        result = await self._llm_client(prompt)
        lines = [line.strip() for line in result.strip().split("\n") if line.strip()]
        # Deduplicate while preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for line in lines:
            if line not in seen:
                seen.add(line)
                unique.append(line)
        # Cap at 5
        alternatives = unique[:5]
        return ProcessedQuery(
            original=query,
            processed=query,
            alternatives=alternatives,
            strategy_used="multi_query",
        )

    async def _step_back(self, query: str) -> ProcessedQuery:
        prompt = (
            "Given this specific question, generate a more general question "
            "that would help find the answer. Return ONLY the broader question.\n\n"
            f"Question: {query}"
        )
        result = await self._llm_client(prompt)
        broader = result.strip()
        return ProcessedQuery(
            original=query,
            processed=broader,
            strategy_used="step_back",
        )
