"""Tests for DeferredToolRegistry — deferred tool binding and search."""

from __future__ import annotations

import pytest

from app.services.agency_deferred_tools import (
    DeferredToolRegistry,
    PreparedTools,
    TOOL_SEARCH_SCHEMA,
)


def _make_tool(name: str, description: str = "") -> dict:
    """Helper to create an OpenAI function-format tool definition."""
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description or f"Tool: {name}",
            "parameters": {"type": "object", "properties": {}},
        },
    }


@pytest.mark.unit
class TestPrepareTools:
    def test_passthrough_when_under_threshold(self):
        registry = DeferredToolRegistry()
        tools = [_make_tool(f"tool-{i}") for i in range(5)]
        result = registry.prepare_tools(tools)

        assert not result.deferred
        assert len(result.bind_tools) == 5
        assert result.available_names == ""

    def test_activates_deferred_when_over_threshold(self):
        registry = DeferredToolRegistry()
        tools = [_make_tool(f"tool-{i}") for i in range(15)]
        result = registry.prepare_tools(tools)

        assert result.deferred
        assert len(result.bind_tools) == 1
        assert result.bind_tools[0]["function"]["name"] == "tool_search"
        # Execution tools include originals + tool_search
        assert len(result.execution_tools) == 16

    def test_exact_threshold_not_deferred(self):
        registry = DeferredToolRegistry()
        tools = [_make_tool(f"tool-{i}") for i in range(10)]
        result = registry.prepare_tools(tools)
        assert not result.deferred

    def test_available_names_populated(self):
        registry = DeferredToolRegistry()
        tools = [
            _make_tool("web-search", "Search the web"),
            _make_tool("email-notify", "Send notifications"),
        ] + [_make_tool(f"filler-{i}") for i in range(10)]
        result = registry.prepare_tools(tools)
        assert "web-search: Search the web" in result.available_names
        assert "email-notify: Send notifications" in result.available_names


@pytest.mark.unit
class TestSearch:
    def setup_method(self):
        self.registry = DeferredToolRegistry()
        tools = [
            _make_tool("web-search", "Search the web for information"),
            _make_tool("web-scraper", "Scrape web pages for content"),
            _make_tool("email-notify", "Send email notifications"),
            _make_tool("rag-knowledge", "Query knowledge base with RAG"),
            _make_tool("file-upload", "Upload files to storage"),
        ] + [_make_tool(f"extra-{i}", f"Extra tool number {i}") for i in range(10)]
        self.registry.prepare_tools(tools)

    def test_select_exact_matches(self):
        results = self.registry.search("select:web-search,email-notify")
        names = [r["function"]["name"] for r in results]
        assert names == ["web-search", "email-notify"]

    def test_select_nonexistent_skipped(self):
        results = self.registry.search("select:web-search,nonexistent")
        names = [r["function"]["name"] for r in results]
        assert names == ["web-search"]

    def test_free_text_returns_max_5(self):
        results = self.registry.search("search the web for information")
        assert len(results) <= 5
        # web-search should rank high
        names = [r["function"]["name"] for r in results]
        assert "web-search" in names

    def test_keyword_filter(self):
        results = self.registry.search("+web information")
        names = [r["function"]["name"] for r in results]
        assert "web-search" in names
        assert "web-scraper" in names
        assert "email-notify" not in names

    def test_no_matches_returns_empty(self):
        results = self.registry.search("nonexistent_tool_xyz_123")
        assert results == []

    def test_empty_query_returns_empty(self):
        results = self.registry.search("")
        assert results == []


@pytest.mark.unit
class TestToolSearchSchema:
    def test_schema_valid_for_binding(self):
        assert TOOL_SEARCH_SCHEMA["type"] == "function"
        func = TOOL_SEARCH_SCHEMA["function"]
        assert func["name"] == "tool_search"
        assert "description" in func
        params = func["parameters"]
        assert "query" in params["properties"]
        assert "query" in params["required"]
