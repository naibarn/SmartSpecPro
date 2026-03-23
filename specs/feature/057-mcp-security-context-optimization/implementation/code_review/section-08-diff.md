diff --git a/python-backend/app/services/agency_deferred_tools.py b/python-backend/app/services/agency_deferred_tools.py
new file mode 100644
index 00000000..c3d8a681
--- /dev/null
+++ b/python-backend/app/services/agency_deferred_tools.py
@@ -0,0 +1,174 @@
+"""
+Deferred Tool Registry — when an agent has many tools, bind only a
+`tool_search` meta-tool to the LLM and fetch full schemas on demand.
+
+Reduces token usage from ~285 tokens/tool × N tools to ~800 tokens total.
+"""
+
+from __future__ import annotations
+
+from dataclasses import dataclass, field
+from typing import Any
+
+import structlog
+
+logger = structlog.get_logger(__name__)
+
+
+@dataclass
+class PreparedTools:
+    """Result of preparing tools for LLM binding."""
+
+    bind_tools: list[dict[str, Any]]  # Tools to bind to LLM (all or just tool_search)
+    execution_tools: list[dict[str, Any]]  # All tools available for execution
+    deferred: bool  # Whether deferred mode is active
+    available_names: str  # Formatted list of tool names for system prompt
+
+
+TOOL_SEARCH_SCHEMA: dict[str, Any] = {
+    "type": "function",
+    "function": {
+        "name": "tool_search",
+        "description": (
+            "Search for and retrieve full tool schemas. "
+            "Use 'select:name1,name2' for exact matches, "
+            "'+keyword rest' to require keyword in name, "
+            "or free text for relevance search."
+        ),
+        "parameters": {
+            "type": "object",
+            "properties": {
+                "query": {
+                    "type": "string",
+                    "description": "Search query for tools",
+                },
+            },
+            "required": ["query"],
+        },
+    },
+}
+
+
+class DeferredToolRegistry:
+    """Registry that defers tool schema binding when tool count exceeds threshold."""
+
+    THRESHOLD: int = 10
+    MAX_SEARCH_RESULTS: int = 5
+
+    def __init__(self) -> None:
+        self._tools: dict[str, dict[str, Any]] = {}  # name -> {tool, description}
+
+    def prepare_tools(self, tools: list[dict[str, Any]]) -> PreparedTools:
+        """Prepare tools for LLM binding.
+
+        If tools <= THRESHOLD, all tools are bound directly.
+        If tools > THRESHOLD, only tool_search is bound; originals are deferred.
+        """
+        if len(tools) <= self.THRESHOLD:
+            return PreparedTools(
+                bind_tools=list(tools),
+                execution_tools=list(tools),
+                deferred=False,
+                available_names="",
+            )
+
+        # Register all tools for deferred lookup
+        for t in tools:
+            func = t.get("function", {})
+            name = func.get("name", "")
+            if name:
+                self._tools[name] = {
+                    "tool": t,
+                    "description": func.get("description", ""),
+                }
+
+        # Build names list for system prompt
+        names_lines = []
+        for t in tools:
+            func = t.get("function", {})
+            name = func.get("name", "")
+            desc = func.get("description", "")[:80]
+            names_lines.append(f"- {name}: {desc}")
+        available_names = "\n".join(names_lines)
+
+        return PreparedTools(
+            bind_tools=[TOOL_SEARCH_SCHEMA],
+            execution_tools=list(tools) + [TOOL_SEARCH_SCHEMA],
+            deferred=True,
+            available_names=available_names,
+        )
+
+    def search(self, query: str) -> list[dict[str, Any]]:
+        """Search for tools by query.
+
+        Query formats:
+        - "select:name1,name2" — return exact matches
+        - "+keyword rest" — require keyword in tool name, rank by rest
+        - free text — relevance rank all tools
+        """
+        if not query:
+            return []
+
+        if query.startswith("select:"):
+            names = [n.strip() for n in query[7:].split(",") if n.strip()]
+            return [
+                self._tools[n]["tool"] for n in names if n in self._tools
+            ][: self.MAX_SEARCH_RESULTS]
+
+        if query.startswith("+"):
+            parts = query[1:].split(None, 1)
+            keyword = parts[0].lower() if parts else ""
+            candidates = {
+                n: t for n, t in self._tools.items() if keyword in n.lower()
+            }
+            rest = parts[1] if len(parts) > 1 else ""
+            return self._rank(candidates, rest, include_all=True)
+
+        return self._rank(self._tools, query)
+
+    def _rank(
+        self,
+        candidates: dict[str, dict[str, Any]],
+        query: str,
+        include_all: bool = False,
+    ) -> list[dict[str, Any]]:
+        """Rank candidate tools by simple text relevance to query.
+
+        If include_all is True, all candidates are returned (sorted by relevance).
+        Otherwise, only candidates with a positive relevance score are returned.
+        """
+        if not candidates:
+            return []
+
+        if not query.strip():
+            # No ranking query — return all candidates up to limit
+            return [
+                info["tool"] for info in list(candidates.values())[: self.MAX_SEARCH_RESULTS]
+            ]
+
+        query_lower = query.lower()
+        query_words = set(query_lower.split())
+
+        scored: list[tuple[float, str]] = []
+        for name, info in candidates.items():
+            desc = info.get("description", "").lower()
+            name_lower = name.lower()
+
+            # Score: name match > description match
+            score = 0.0
+            for word in query_words:
+                if word in name_lower:
+                    score += 10.0
+                if word in desc:
+                    score += 1.0
+            # Exact name match bonus
+            if query_lower == name_lower:
+                score += 100.0
+
+            if score > 0 or include_all:
+                scored.append((score, name))
+
+        scored.sort(key=lambda x: -x[0])
+        return [
+            candidates[name]["tool"] for _, name in scored[: self.MAX_SEARCH_RESULTS]
+        ]
diff --git a/python-backend/tests/unit/services/test_agency_deferred_tools.py b/python-backend/tests/unit/services/test_agency_deferred_tools.py
new file mode 100644
index 00000000..707f8256
--- /dev/null
+++ b/python-backend/tests/unit/services/test_agency_deferred_tools.py
@@ -0,0 +1,120 @@
+"""Tests for DeferredToolRegistry — deferred tool binding and search."""
+
+from __future__ import annotations
+
+import pytest
+
+from app.services.agency_deferred_tools import (
+    DeferredToolRegistry,
+    PreparedTools,
+    TOOL_SEARCH_SCHEMA,
+)
+
+
+def _make_tool(name: str, description: str = "") -> dict:
+    """Helper to create an OpenAI function-format tool definition."""
+    return {
+        "type": "function",
+        "function": {
+            "name": name,
+            "description": description or f"Tool: {name}",
+            "parameters": {"type": "object", "properties": {}},
+        },
+    }
+
+
+@pytest.mark.unit
+class TestPrepareTools:
+    def test_passthrough_when_under_threshold(self):
+        registry = DeferredToolRegistry()
+        tools = [_make_tool(f"tool-{i}") for i in range(5)]
+        result = registry.prepare_tools(tools)
+
+        assert not result.deferred
+        assert len(result.bind_tools) == 5
+        assert result.available_names == ""
+
+    def test_activates_deferred_when_over_threshold(self):
+        registry = DeferredToolRegistry()
+        tools = [_make_tool(f"tool-{i}") for i in range(15)]
+        result = registry.prepare_tools(tools)
+
+        assert result.deferred
+        assert len(result.bind_tools) == 1
+        assert result.bind_tools[0]["function"]["name"] == "tool_search"
+        # Execution tools include originals + tool_search
+        assert len(result.execution_tools) == 16
+
+    def test_exact_threshold_not_deferred(self):
+        registry = DeferredToolRegistry()
+        tools = [_make_tool(f"tool-{i}") for i in range(10)]
+        result = registry.prepare_tools(tools)
+        assert not result.deferred
+
+    def test_available_names_populated(self):
+        registry = DeferredToolRegistry()
+        tools = [
+            _make_tool("web-search", "Search the web"),
+            _make_tool("email-notify", "Send notifications"),
+        ] + [_make_tool(f"filler-{i}") for i in range(10)]
+        result = registry.prepare_tools(tools)
+        assert "web-search: Search the web" in result.available_names
+        assert "email-notify: Send notifications" in result.available_names
+
+
+@pytest.mark.unit
+class TestSearch:
+    def setup_method(self):
+        self.registry = DeferredToolRegistry()
+        tools = [
+            _make_tool("web-search", "Search the web for information"),
+            _make_tool("web-scraper", "Scrape web pages for content"),
+            _make_tool("email-notify", "Send email notifications"),
+            _make_tool("rag-knowledge", "Query knowledge base with RAG"),
+            _make_tool("file-upload", "Upload files to storage"),
+        ] + [_make_tool(f"extra-{i}", f"Extra tool number {i}") for i in range(10)]
+        self.registry.prepare_tools(tools)
+
+    def test_select_exact_matches(self):
+        results = self.registry.search("select:web-search,email-notify")
+        names = [r["function"]["name"] for r in results]
+        assert names == ["web-search", "email-notify"]
+
+    def test_select_nonexistent_skipped(self):
+        results = self.registry.search("select:web-search,nonexistent")
+        names = [r["function"]["name"] for r in results]
+        assert names == ["web-search"]
+
+    def test_free_text_returns_max_5(self):
+        results = self.registry.search("search the web for information")
+        assert len(results) <= 5
+        # web-search should rank high
+        names = [r["function"]["name"] for r in results]
+        assert "web-search" in names
+
+    def test_keyword_filter(self):
+        results = self.registry.search("+web information")
+        names = [r["function"]["name"] for r in results]
+        assert "web-search" in names
+        assert "web-scraper" in names
+        assert "email-notify" not in names
+
+    def test_no_matches_returns_empty(self):
+        results = self.registry.search("nonexistent_tool_xyz_123")
+        assert results == []
+
+    def test_empty_query_returns_empty(self):
+        results = self.registry.search("")
+        assert results == []
+
+
+@pytest.mark.unit
+class TestToolSearchSchema:
+    def test_schema_valid_for_binding(self):
+        assert TOOL_SEARCH_SCHEMA["type"] == "function"
+        func = TOOL_SEARCH_SCHEMA["function"]
+        assert func["name"] == "tool_search"
+        assert "description" in func
+        params = func["parameters"]
+        assert "query" in params["properties"]
+        assert "query" in params["required"]
