"""
Deferred Tool Registry — when an agent has many tools, bind only a
`tool_search` meta-tool to the LLM and fetch full schemas on demand.

Reduces token usage from ~285 tokens/tool × N tools to ~800 tokens total.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# Patterns to strip potential prompt injection from tool descriptions
_INJECTION_PATTERNS = [
    re.compile(r"<\|.*?\|>", re.S),  # <|system|> style tags
    re.compile(r"\[INST\].*?\[/INST\]", re.S),  # Llama-style
    re.compile(r"<system>.*?</system>", re.S),  # XML injection
    re.compile(r"(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instructions?|rules?|prompts?)", re.I),
]


def _sanitize_description(text: str, max_len: int = 200) -> str:
    """Strip potential prompt injection patterns and truncate."""
    result = text[:max_len]
    for pattern in _INJECTION_PATTERNS:
        result = pattern.sub("[filtered]", result)
    return result.strip()


@dataclass
class PreparedTools:
    """Result of preparing tools for LLM binding."""

    bind_tools: list[dict[str, Any]]  # Tools to bind to LLM (all or just tool_search)
    execution_tools: list[dict[str, Any]]  # All tools available for execution
    deferred: bool  # Whether deferred mode is active
    available_names: str  # Formatted list of tool names for system prompt


TOOL_SEARCH_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "tool_search",
        "description": (
            "Search for and retrieve full tool schemas. "
            "Use 'select:name1,name2' for exact matches, "
            "'+keyword rest' to require keyword in name, "
            "or free text for relevance search."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query for tools",
                },
            },
            "required": ["query"],
        },
    },
}


class DeferredToolRegistry:
    """Registry that defers tool schema binding when tool count exceeds threshold.

    Each instance is scoped to a single agent invocation. Do not reuse
    instances across agents — _tools is cleared on each prepare_tools() call.
    """

    THRESHOLD: int = 10
    MAX_SEARCH_RESULTS: int = 5

    def __init__(self) -> None:
        self._tools: dict[str, dict[str, Any]] = {}  # name -> {tool, description}

    def prepare_tools(self, tools: list[dict[str, Any]]) -> PreparedTools:
        """Prepare tools for LLM binding.

        If tools <= THRESHOLD, all tools are bound directly.
        If tools > THRESHOLD, only tool_search is bound; originals are deferred.
        """
        # Clear state from any prior call to enforce per-agent scoping
        self._tools.clear()

        if len(tools) <= self.THRESHOLD:
            return PreparedTools(
                bind_tools=list(tools),
                execution_tools=list(tools),
                deferred=False,
                available_names="",
            )

        # Register all tools for deferred lookup
        for t in tools:
            func = t.get("function", {})
            name = func.get("name", "")
            if name:
                self._tools[name] = {
                    "tool": t,
                    "description": func.get("description", ""),
                }

        # Build names list for system prompt with sanitized descriptions
        names_lines = []
        for t in tools:
            func = t.get("function", {})
            name = func.get("name", "")
            desc = _sanitize_description(func.get("description", ""), max_len=80)
            names_lines.append(f"- {name}: {desc}")
        available_names = "\n".join(names_lines)

        return PreparedTools(
            bind_tools=[TOOL_SEARCH_SCHEMA],
            execution_tools=list(tools) + [TOOL_SEARCH_SCHEMA],
            deferred=True,
            available_names=available_names,
        )

    def search(self, query: str) -> list[dict[str, Any]]:
        """Search for tools by query.

        Only returns tools from the current agent's registered set
        (populated by prepare_tools). This enforces NEW-03 scope restriction.

        Query formats:
        - "select:name1,name2" — return exact matches
        - "+keyword rest" — require keyword in tool name, rank by rest
        - free text — relevance rank all tools
        """
        if not query:
            return []

        if query.startswith("select:"):
            names = [n.strip() for n in query[7:].split(",") if n.strip()]
            return [
                self._tools[n]["tool"] for n in names if n in self._tools
            ][: self.MAX_SEARCH_RESULTS]

        if query.startswith("+"):
            parts = query[1:].split(None, 1)
            keyword = parts[0].lower() if parts else ""
            candidates = {
                n: t for n, t in self._tools.items() if keyword in n.lower()
            }
            rest = parts[1] if len(parts) > 1 else ""
            return self._rank(candidates, rest, include_all=True)

        return self._rank(self._tools, query)

    def _rank(
        self,
        candidates: dict[str, dict[str, Any]],
        query: str,
        include_all: bool = False,
    ) -> list[dict[str, Any]]:
        """Rank candidate tools by simple text relevance to query."""
        if not candidates:
            return []

        if not query.strip():
            # No ranking query — return candidates sorted by name for determinism
            sorted_names = sorted(candidates.keys())
            return [
                candidates[n]["tool"] for n in sorted_names[: self.MAX_SEARCH_RESULTS]
            ]

        query_lower = query.lower()
        query_words = set(query_lower.split())

        scored: list[tuple[float, str]] = []
        for name, info in candidates.items():
            desc = info.get("description", "").lower()
            name_lower = name.lower()

            score = 0.0
            for word in query_words:
                if word in name_lower:
                    score += 10.0
                if word in desc:
                    score += 1.0
            if query_lower == name_lower:
                score += 100.0

            if score > 0 or include_all:
                scored.append((score, name))

        scored.sort(key=lambda x: (-x[0], x[1]))
        return [
            candidates[name]["tool"] for _, name in scored[: self.MAX_SEARCH_RESULTS]
        ]
