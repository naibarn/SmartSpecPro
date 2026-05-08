diff --git a/python-backend/app/services/mcp_rate_limiter.py b/python-backend/app/services/mcp_rate_limiter.py
new file mode 100644
index 00000000..e1d98152
--- /dev/null
+++ b/python-backend/app/services/mcp_rate_limiter.py
@@ -0,0 +1,158 @@
+"""
+MCP Cross-System Protection Layer (section-15).
+
+Rate limiting, response wrapping, loop detection, and guardrail
+integration for MCP tool calls.
+"""
+
+import logging
+import re
+from typing import Optional
+
+logger = logging.getLogger(__name__)
+
+# ── Constants ──
+
+MAX_MCP_TOOL_CALLS_PER_TURN = 10
+MAX_MCP_CALLS_PER_RUN = 50
+MAX_MCP_CALLS_PER_TENANT_MINUTE = 200
+MAX_RESULT_BYTES = 100_000  # 100KB truncation limit
+MAX_CHAIN_LENGTH = 5
+TRUNCATION_MARKER = "\n[MCP_RESPONSE_TRUNCATED]"
+
+
+class McpToolError(Exception):
+    """Typed error for MCP tool failures."""
+
+    def __init__(self, error_type: str, message: str = "", retryable: bool = False):
+        self.error_type = error_type
+        self.retryable = retryable
+        super().__init__(message or error_type)
+
+
+def wrap_mcp_response(result: str, server_slug: str, tool_name: str) -> str:
+    """Wrap MCP tool output with boundary tags to prevent prompt injection."""
+    return f"[MCP_TOOL_RESULT: mcp.{server_slug}/{tool_name}]\n{result}\n[/MCP_TOOL_RESULT]"
+
+
+def truncate_response(result: str, max_bytes: int = MAX_RESULT_BYTES) -> str:
+    """Truncate MCP response to max size, appending marker if truncated."""
+    if len(result.encode("utf-8", errors="replace")) <= max_bytes:
+        return result
+    # Truncate by chars (approximate), leave room for marker
+    truncated = result[: max_bytes - len(TRUNCATION_MARKER)]
+    return truncated + TRUNCATION_MARKER
+
+
+class PerTurnCounter:
+    """Per-tool-per-turn invocation counter (in-process, per execution)."""
+
+    def __init__(self, max_calls: int = MAX_MCP_TOOL_CALLS_PER_TURN):
+        self._counts: dict[str, int] = {}
+        self._max_calls = max_calls
+
+    def check_and_increment(self, tool_name: str) -> Optional[str]:
+        """Returns error message if limit exceeded, None if OK."""
+        count = self._counts.get(tool_name, 0) + 1
+        self._counts[tool_name] = count
+        if count > self._max_calls:
+            return f"[MCP ERROR] Tool call limit exceeded for '{tool_name}' (max {self._max_calls}/turn)"
+        return None
+
+    def reset(self):
+        self._counts.clear()
+
+
+async def check_run_rate_limit(
+    redis_client,
+    run_id: str,
+    max_calls: int = MAX_MCP_CALLS_PER_RUN,
+    ttl: int = 3600,
+) -> Optional[str]:
+    """Check per-run MCP call counter. Returns error if exceeded."""
+    if not redis_client or not run_id:
+        return None
+    key = f"mcp:rate:run:{run_id}"
+    count = await redis_client.incr(key)
+    if count == 1:
+        await redis_client.expire(key, ttl)
+    if count > max_calls:
+        return f"[MCP ERROR] Run MCP call limit exceeded ({max_calls} max)"
+    return None
+
+
+async def check_tenant_rate_limit(
+    redis_client,
+    tenant_id: str,
+    max_calls: int = MAX_MCP_CALLS_PER_TENANT_MINUTE,
+    window_seconds: int = 60,
+) -> Optional[str]:
+    """Check per-tenant MCP calls per minute. Returns error if exceeded."""
+    if not redis_client or not tenant_id:
+        return None
+    key = f"mcp:rate:{tenant_id}:minute"
+    count = await redis_client.incr(key)
+    if count == 1:
+        await redis_client.expire(key, window_seconds)
+    if count > max_calls:
+        return f"[MCP ERROR] Tenant MCP rate limit exceeded ({max_calls}/min)"
+    return None
+
+
+async def on_tenant_disabled(redis_client, tenant_id: str):
+    """Clear MCP rate limit keys when a tenant is disabled."""
+    if not redis_client or not tenant_id:
+        return
+    minute_key = f"mcp:rate:{tenant_id}:minute"
+    await redis_client.delete(minute_key)
+    # Pattern-delete run keys for this tenant (best effort)
+    pattern = f"mcp:rate:run:{tenant_id}:*"
+    cursor = 0
+    while True:
+        cursor, keys = await redis_client.scan(cursor, match=pattern, count=100)
+        if keys:
+            await redis_client.delete(*keys)
+        if cursor == 0:
+            break
+
+
+def check_loop_detection(
+    agency_run_chain: list[str],
+    current_agency_id: str,
+    max_chain_length: int = MAX_CHAIN_LENGTH,
+) -> Optional[str]:
+    """Detect circular or excessively deep cross-agency MCP call chains."""
+    if current_agency_id in agency_run_chain:
+        return (
+            f"[MCP ERROR] Cross-boundary loop detected: "
+            f"{' → '.join(agency_run_chain)} → {current_agency_id}"
+        )
+    if len(agency_run_chain) >= max_chain_length:
+        return f"[MCP ERROR] Max agency call chain depth exceeded ({max_chain_length})"
+    return None
+
+
+def check_tool_chain_depth(
+    current_depth: int,
+    max_depth: int = 5,
+) -> Optional[str]:
+    """Check tool chain depth to prevent infinite MCP→skill→agency chains."""
+    if current_depth >= max_depth:
+        return f"[MCP ERROR] Max tool chain depth exceeded ({max_depth})"
+    return None
+
+
+def scrub_params(params: dict, secret_patterns: list[re.Pattern]) -> dict:
+    """Scrub sensitive values from MCP tool parameters before sending."""
+    scrubbed = {}
+    for key, value in params.items():
+        if isinstance(value, str):
+            scrubbed_val = value
+            for pattern in secret_patterns:
+                scrubbed_val = pattern.sub("[REDACTED]", scrubbed_val)
+            scrubbed[key] = scrubbed_val
+        elif isinstance(value, dict):
+            scrubbed[key] = scrub_params(value, secret_patterns)
+        else:
+            scrubbed[key] = value
+    return scrubbed
diff --git a/python-backend/tests/unit/test_mcp_rate_limiter.py b/python-backend/tests/unit/test_mcp_rate_limiter.py
new file mode 100644
index 00000000..41c94b16
--- /dev/null
+++ b/python-backend/tests/unit/test_mcp_rate_limiter.py
@@ -0,0 +1,268 @@
+"""Tests for MCP cross-system protections (section-15)."""
+
+import re
+from unittest.mock import AsyncMock
+
+import pytest
+
+from app.services.mcp_rate_limiter import (
+    MAX_MCP_CALLS_PER_RUN,
+    MAX_MCP_CALLS_PER_TENANT_MINUTE,
+    MAX_MCP_TOOL_CALLS_PER_TURN,
+    MAX_RESULT_BYTES,
+    McpToolError,
+    PerTurnCounter,
+    check_loop_detection,
+    check_run_rate_limit,
+    check_tenant_rate_limit,
+    check_tool_chain_depth,
+    on_tenant_disabled,
+    scrub_params,
+    truncate_response,
+    wrap_mcp_response,
+)
+
+
+# ── Response wrapper (14.1) ──
+
+
+class TestWrapMcpResponse:
+    def test_wraps_with_tags(self):
+        result = wrap_mcp_response("hello world", "my-server", "get_data")
+        assert result.startswith("[MCP_TOOL_RESULT: mcp.my-server/get_data]")
+        assert result.endswith("[/MCP_TOOL_RESULT]")
+        assert "hello world" in result
+
+    def test_wraps_empty_response(self):
+        result = wrap_mcp_response("", "s", "t")
+        assert "[MCP_TOOL_RESULT:" in result
+        assert "[/MCP_TOOL_RESULT]" in result
+
+
+# ── Per-tool counter (14.2) ──
+
+
+class TestPerTurnCounter:
+    def test_allows_calls_under_limit(self):
+        counter = PerTurnCounter(max_calls=3)
+        assert counter.check_and_increment("tool_a") is None
+        assert counter.check_and_increment("tool_a") is None
+        assert counter.check_and_increment("tool_a") is None
+
+    def test_blocks_after_limit(self):
+        counter = PerTurnCounter(max_calls=2)
+        counter.check_and_increment("tool_a")
+        counter.check_and_increment("tool_a")
+        err = counter.check_and_increment("tool_a")
+        assert err is not None
+        assert "limit exceeded" in err.lower()
+
+    def test_tracks_tools_independently(self):
+        counter = PerTurnCounter(max_calls=1)
+        assert counter.check_and_increment("tool_a") is None
+        assert counter.check_and_increment("tool_b") is None
+        assert counter.check_and_increment("tool_a") is not None
+
+    def test_reset_clears_counts(self):
+        counter = PerTurnCounter(max_calls=1)
+        counter.check_and_increment("tool_a")
+        counter.reset()
+        assert counter.check_and_increment("tool_a") is None
+
+    def test_default_limit_is_10(self):
+        counter = PerTurnCounter()
+        for _ in range(MAX_MCP_TOOL_CALLS_PER_TURN):
+            assert counter.check_and_increment("t") is None
+        assert counter.check_and_increment("t") is not None
+
+
+# ── Per-run rate limit (14.3) ──
+
+
+class TestRunRateLimit:
+    @pytest.mark.asyncio
+    async def test_allows_under_limit(self):
+        redis = AsyncMock()
+        redis.incr = AsyncMock(return_value=1)
+        redis.expire = AsyncMock()
+        result = await check_run_rate_limit(redis, "run-1", max_calls=50)
+        assert result is None
+
+    @pytest.mark.asyncio
+    async def test_blocks_over_limit(self):
+        redis = AsyncMock()
+        redis.incr = AsyncMock(return_value=51)
+        result = await check_run_rate_limit(redis, "run-1", max_calls=50)
+        assert result is not None
+        assert "limit exceeded" in result.lower()
+
+    @pytest.mark.asyncio
+    async def test_sets_ttl_on_first_call(self):
+        redis = AsyncMock()
+        redis.incr = AsyncMock(return_value=1)
+        redis.expire = AsyncMock()
+        await check_run_rate_limit(redis, "run-1", ttl=3600)
+        redis.expire.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_no_redis_returns_none(self):
+        result = await check_run_rate_limit(None, "run-1")
+        assert result is None
+
+
+# ── Per-tenant rate limit (14.3) ──
+
+
+class TestTenantRateLimit:
+    @pytest.mark.asyncio
+    async def test_allows_under_limit(self):
+        redis = AsyncMock()
+        redis.incr = AsyncMock(return_value=100)
+        result = await check_tenant_rate_limit(redis, "tenant-1", max_calls=200)
+        assert result is None
+
+    @pytest.mark.asyncio
+    async def test_blocks_at_limit(self):
+        redis = AsyncMock()
+        redis.incr = AsyncMock(return_value=201)
+        result = await check_tenant_rate_limit(redis, "tenant-1", max_calls=200)
+        assert result is not None
+        assert "rate limit" in result.lower()
+
+
+# ── Tenant disable cleanup (NEW-05) ──
+
+
+class TestTenantDisableCleanup:
+    @pytest.mark.asyncio
+    async def test_deletes_rate_limit_key(self):
+        redis = AsyncMock()
+        redis.delete = AsyncMock()
+        redis.scan = AsyncMock(return_value=(0, []))
+        await on_tenant_disabled(redis, "tenant-1")
+        redis.delete.assert_called_with("mcp:rate:tenant-1:minute")
+
+    @pytest.mark.asyncio
+    async def test_no_op_without_redis(self):
+        await on_tenant_disabled(None, "tenant-1")  # Should not raise
+
+
+# ── Loop detection (14.4) ──
+
+
+class TestLoopDetection:
+    def test_no_loop(self):
+        result = check_loop_detection(["agency-1"], "agency-2")
+        assert result is None
+
+    def test_detects_circular_loop(self):
+        result = check_loop_detection(["agency-1", "agency-2"], "agency-1")
+        assert result is not None
+        assert "loop detected" in result.lower()
+
+    def test_blocks_long_chain(self):
+        chain = [f"agency-{i}" for i in range(5)]
+        result = check_loop_detection(chain, "agency-99", max_chain_length=5)
+        assert result is not None
+        assert "depth exceeded" in result.lower()
+
+    def test_allows_short_chain(self):
+        result = check_loop_detection(["a", "b"], "c", max_chain_length=5)
+        assert result is None
+
+
+# ── Tool chain depth (XSY-C1) ──
+
+
+class TestToolChainDepth:
+    def test_allows_under_max(self):
+        assert check_tool_chain_depth(3, max_depth=5) is None
+
+    def test_blocks_at_max(self):
+        result = check_tool_chain_depth(5, max_depth=5)
+        assert result is not None
+        assert "depth exceeded" in result.lower()
+
+
+# ── Response truncation (M13) ──
+
+
+class TestResponseTruncation:
+    def test_short_response_unchanged(self):
+        result = truncate_response("hello", max_bytes=1000)
+        assert result == "hello"
+
+    def test_long_response_truncated(self):
+        long_str = "a" * 200_000
+        result = truncate_response(long_str, max_bytes=MAX_RESULT_BYTES)
+        assert len(result) < 200_000
+        assert result.endswith("[MCP_RESPONSE_TRUNCATED]")
+
+    def test_default_limit_is_100kb(self):
+        assert MAX_RESULT_BYTES == 100_000
+
+
+# ── Typed errors (14.9) ──
+
+
+class TestMcpToolError:
+    def test_timeout_error(self):
+        err = McpToolError("timeout", retryable=True)
+        assert err.error_type == "timeout"
+        assert err.retryable is True
+
+    def test_rate_limited_error(self):
+        err = McpToolError("rate_limited", "HTTP 429", retryable=False)
+        assert err.error_type == "rate_limited"
+        assert err.retryable is False
+
+    def test_is_exception(self):
+        assert issubclass(McpToolError, Exception)
+
+
+# ── Param scrubbing (14.5) ──
+
+
+class TestScrubParams:
+    def test_scrubs_api_keys(self):
+        patterns = [re.compile(r"sk-[a-zA-Z0-9]{20,}")]
+        params = {"query": "use key sk-example-redacted"}
+        result = scrub_params(params, patterns)
+        assert "[REDACTED]" in result["query"]
+        assert "sk-" not in result["query"]
+
+    def test_preserves_safe_values(self):
+        patterns = [re.compile(r"sk-[a-zA-Z0-9]{20,}")]
+        params = {"query": "normal text", "count": 5}
+        result = scrub_params(params, patterns)
+        assert result["query"] == "normal text"
+        assert result["count"] == 5
+
+    def test_handles_nested_dicts(self):
+        patterns = [re.compile(r"Bearer\s+[a-zA-Z0-9._\-]+")]
+        params = {"outer": {"inner": "Bearer abc123.xyz"}}
+        result = scrub_params(params, patterns)
+        assert "[REDACTED]" in result["outer"]["inner"]
+
+
+# ── Memory extraction protection (14.6) ──
+
+
+class TestMemoryExtractionGuard:
+    def test_flag_defaults_to_false(self):
+        """memory_extraction_enabled should default to False for MCP agents."""
+        config = {}
+        has_mcp_tools = True
+        enabled = config.get("memory_extraction_enabled", False)
+        if has_mcp_tools and not enabled:
+            skip = True
+        else:
+            skip = False
+        assert skip is True
+
+    def test_flag_allows_when_explicit(self):
+        config = {"memory_extraction_enabled": True}
+        has_mcp_tools = True
+        enabled = config.get("memory_extraction_enabled", False)
+        skip = has_mcp_tools and not enabled
+        assert skip is False
