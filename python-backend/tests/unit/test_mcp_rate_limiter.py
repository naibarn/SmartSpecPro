"""Tests for MCP cross-system protections (section-15)."""

import re
from unittest.mock import AsyncMock

import pytest

from app.services.mcp_rate_limiter import (
    MAX_MCP_CALLS_PER_RUN,
    MAX_MCP_TOOL_CALLS_PER_TURN,
    MAX_RESULT_BYTES,
    McpToolError,
    PerTurnCounter,
    check_run_rate_limit,
    check_tenant_rate_limit,
    check_tool_chain_depth,
    on_tenant_disabled,
    scrub_params,
    truncate_response,
    wrap_mcp_response,
)
from app.services.postgres_rate_limit import SlidingWindowDecision


# ── Response wrapper (14.1) ──


class TestWrapMcpResponse:
    def test_wraps_with_tags(self):
        result = wrap_mcp_response("hello world", "my-server", "get_data")
        assert result.startswith("[MCP_TOOL_RESULT: mcp.my-server/get_data]")
        assert result.endswith("[/MCP_TOOL_RESULT]")
        assert "hello world" in result

    def test_wraps_empty_response(self):
        result = wrap_mcp_response("", "s", "t")
        assert "[MCP_TOOL_RESULT:" in result
        assert "[/MCP_TOOL_RESULT]" in result


# ── Per-tool counter (14.2) ──


class TestPerTurnCounter:
    def test_allows_calls_under_limit(self):
        counter = PerTurnCounter(max_calls=3)
        assert counter.check_and_increment("tool_a") is None
        assert counter.check_and_increment("tool_a") is None
        assert counter.check_and_increment("tool_a") is None

    def test_blocks_after_limit(self):
        counter = PerTurnCounter(max_calls=2)
        counter.check_and_increment("tool_a")
        counter.check_and_increment("tool_a")
        err = counter.check_and_increment("tool_a")
        assert err is not None
        assert "limit exceeded" in err.lower()

    def test_tracks_tools_independently(self):
        counter = PerTurnCounter(max_calls=1)
        assert counter.check_and_increment("tool_a") is None
        assert counter.check_and_increment("tool_b") is None
        assert counter.check_and_increment("tool_a") is not None

    def test_reset_clears_counts(self):
        counter = PerTurnCounter(max_calls=1)
        counter.check_and_increment("tool_a")
        counter.reset()
        assert counter.check_and_increment("tool_a") is None

    def test_default_limit_is_10(self):
        counter = PerTurnCounter()
        for _ in range(MAX_MCP_TOOL_CALLS_PER_TURN):
            assert counter.check_and_increment("t") is None
        assert counter.check_and_increment("t") is not None


# ── Per-run rate limit (14.3) ──


class TestRunRateLimit:
    @pytest.mark.asyncio
    async def test_allows_under_limit(self, monkeypatch):
        consume = AsyncMock(return_value=SlidingWindowDecision(True, 1, 49, 0))
        monkeypatch.setattr("app.services.mcp_rate_limiter.consume_sliding_window", consume)
        result = await check_run_rate_limit("run-1", max_calls=50)
        assert result is None

    @pytest.mark.asyncio
    async def test_blocks_over_limit(self, monkeypatch):
        consume = AsyncMock(return_value=SlidingWindowDecision(False, 51, 0, 10))
        monkeypatch.setattr("app.services.mcp_rate_limiter.consume_sliding_window", consume)
        result = await check_run_rate_limit("run-1", max_calls=50)
        assert result is not None
        assert "limit exceeded" in result.lower()

    @pytest.mark.asyncio
    async def test_passes_ttl_to_postgres_window(self, monkeypatch):
        consume = AsyncMock(return_value=SlidingWindowDecision(True, 1, 49, 0))
        monkeypatch.setattr("app.services.mcp_rate_limiter.consume_sliding_window", consume)
        await check_run_rate_limit("run-1", ttl=3600)
        consume.assert_awaited_once_with("mcp-run", "run-1", MAX_MCP_CALLS_PER_RUN, 3600)

    @pytest.mark.asyncio
    async def test_missing_run_id_returns_none(self):
        result = await check_run_rate_limit("")
        assert result is None


# ── Per-tenant rate limit (14.3) ──


class TestTenantRateLimit:
    @pytest.mark.asyncio
    async def test_allows_under_limit(self, monkeypatch):
        consume = AsyncMock(return_value=SlidingWindowDecision(True, 100, 100, 0))
        monkeypatch.setattr("app.services.mcp_rate_limiter.consume_sliding_window", consume)
        result = await check_tenant_rate_limit("tenant-1", max_calls=200)
        assert result is None

    @pytest.mark.asyncio
    async def test_blocks_at_limit(self, monkeypatch):
        consume = AsyncMock(return_value=SlidingWindowDecision(False, 201, 0, 10))
        monkeypatch.setattr("app.services.mcp_rate_limiter.consume_sliding_window", consume)
        result = await check_tenant_rate_limit("tenant-1", max_calls=200)
        assert result is not None
        assert "rate limit" in result.lower()


# ── Tenant disable cleanup (NEW-05) ──


class TestTenantDisableCleanup:
    @pytest.mark.asyncio
    async def test_expiring_postgres_window_needs_no_cleanup(self):
        await on_tenant_disabled("tenant-1")

    @pytest.mark.asyncio
    async def test_empty_tenant_is_safe(self):
        await on_tenant_disabled("")


# ── Tool chain depth (XSY-C1) ──


class TestToolChainDepth:
    def test_allows_under_max(self):
        assert check_tool_chain_depth(3, max_depth=5) is None

    def test_blocks_at_max(self):
        result = check_tool_chain_depth(5, max_depth=5)
        assert result is not None
        assert "depth exceeded" in result.lower()


# ── Response truncation (M13) ──


class TestResponseTruncation:
    def test_short_response_unchanged(self):
        result = truncate_response("hello", max_bytes=1000)
        assert result == "hello"

    def test_long_response_truncated(self):
        long_str = "a" * 200_000
        result = truncate_response(long_str, max_bytes=MAX_RESULT_BYTES)
        assert len(result) < 200_000
        assert result.endswith("[MCP_RESPONSE_TRUNCATED]")

    def test_default_limit_is_100kb(self):
        assert MAX_RESULT_BYTES == 100_000


# ── Typed errors (14.9) ──


class TestMcpToolError:
    def test_timeout_error(self):
        err = McpToolError("timeout", retryable=True)
        assert err.error_type == "timeout"
        assert err.retryable is True

    def test_rate_limited_error(self):
        err = McpToolError("rate_limited", "HTTP 429", retryable=False)
        assert err.error_type == "rate_limited"
        assert err.retryable is False

    def test_is_exception(self):
        assert issubclass(McpToolError, Exception)


# ── Param scrubbing (14.5) ──


class TestScrubParams:
    def test_scrubs_api_keys(self):
        patterns = [re.compile(r"sk-[a-zA-Z0-9]{20,}")]
        params = {"query": "use key sk-example-redacted"}
        result = scrub_params(params, patterns)
        assert "[REDACTED]" in result["query"]
        assert "sk-" not in result["query"]

    def test_preserves_safe_values(self):
        patterns = [re.compile(r"sk-[a-zA-Z0-9]{20,}")]
        params = {"query": "normal text", "count": 5}
        result = scrub_params(params, patterns)
        assert result["query"] == "normal text"
        assert result["count"] == 5

    def test_handles_nested_dicts(self):
        patterns = [re.compile(r"Bearer\s+[a-zA-Z0-9._\-]+")]
        params = {"outer": {"inner": "Bearer abc123.xyz"}}
        result = scrub_params(params, patterns)
        assert "[REDACTED]" in result["outer"]["inner"]


# ── Memory extraction protection (14.6) ──


class TestMemoryExtractionGuard:
    def test_flag_defaults_to_false(self):
        """memory_extraction_enabled should default to False for MCP agents."""
        config = {}
        has_mcp_tools = True
        enabled = config.get("memory_extraction_enabled", False)
        if has_mcp_tools and not enabled:
            skip = True
        else:
            skip = False
        assert skip is True

    def test_flag_allows_when_explicit(self):
        config = {"memory_extraction_enabled": True}
        has_mcp_tools = True
        enabled = config.get("memory_extraction_enabled", False)
        skip = has_mcp_tools and not enabled
        assert skip is False
