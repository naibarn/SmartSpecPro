diff --git a/python-backend/tests/unit/orchestrator/test_mcp_executor_security.py b/python-backend/tests/unit/orchestrator/test_mcp_executor_security.py
new file mode 100644
index 00000000..bbbbf4a7
--- /dev/null
+++ b/python-backend/tests/unit/orchestrator/test_mcp_executor_security.py
@@ -0,0 +1,221 @@
+"""Tests for MCPExecutor security hardening (section-01).
+
+Covers findings F07 (SSRF), F08 (ownership), F09 (URL leakage),
+F10 (error message leakage), F11 (structlog), F12 (timeout clamping).
+"""
+
+import importlib
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import httpx
+import pytest
+
+from app.orchestrator.node_executors.integration_executors.mcp_executor import (
+    MCPExecutor,
+    _normalize_timeout,
+)
+
+pytestmark = [pytest.mark.unit]
+
+MODULE_PATH = "app.orchestrator.node_executors.integration_executors.mcp_executor"
+
+
+class _AsyncSessionCM:
+    def __init__(self, session):
+        self._session = session
+
+    async def __aenter__(self):
+        return self._session
+
+    async def __aexit__(self, exc_type, exc, tb):
+        return False
+
+
+def _make_workflow(*, user_id: int = 7, tenant_id: str = "tenant-1"):
+    return MagicMock(userId=user_id, tenantId=tenant_id)
+
+
+def _owned_session(user_id: int = 7, tenant_id: str = "tenant-1"):
+    """Create a mock session that returns an owned workflow."""
+    session = MagicMock()
+    session.execute = AsyncMock(
+        return_value=MagicMock(
+            scalar_one_or_none=MagicMock(
+                return_value=_make_workflow(user_id=user_id, tenant_id=tenant_id)
+            )
+        )
+    )
+    return session
+
+
+def _default_context():
+    return {"workflow_id": "123", "user_id": 7, "tenant_id": "tenant-1"}
+
+
+class TestExecutorSSRF:
+    """F07: Executor blocks private IPs and metadata endpoints."""
+
+    @pytest.mark.asyncio
+    async def test_blocks_private_ip(self):
+        executor = MCPExecutor()
+        result = await executor.execute(
+            "node-1", "mcp",
+            {"mcp_server_url": "http://127.0.0.1:5432", "method": "call_tool"},
+            {}, _default_context(),
+        )
+        assert not result.success
+        assert "blocked" in result.error.lower()
+
+    @pytest.mark.asyncio
+    async def test_blocks_metadata_endpoint(self):
+        executor = MCPExecutor()
+        result = await executor.execute(
+            "node-1", "mcp",
+            {"mcp_server_url": "http://169.254.169.254/latest/"},
+            {}, _default_context(),
+        )
+        assert not result.success
+        assert "blocked" in result.error.lower()
+
+
+class TestOutputSanitization:
+    """F09: server_url must not appear in success output metadata."""
+
+    @pytest.mark.asyncio
+    async def test_server_url_not_in_metadata(self):
+        executor = MCPExecutor()
+        session = _owned_session()
+
+        mock_response = MagicMock()
+        mock_response.raise_for_status = MagicMock()
+        mock_response.json.return_value = {
+            "jsonrpc": "2.0", "id": 1,
+            "result": {"resources": [{"uri": "file://doc-1"}]},
+        }
+        mock_client = MagicMock()
+        mock_client.post = AsyncMock(return_value=mock_response)
+
+        with (
+            patch(f"{MODULE_PATH}.AsyncSessionLocal", return_value=_AsyncSessionCM(session)),
+            patch(f"{MODULE_PATH}.httpx.AsyncClient") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+            result = await executor.execute(
+                "node-1", "mcp",
+                {"mcp_server_url": "https://mcp.example.com", "method": "list_resources"},
+                {}, _default_context(),
+            )
+
+        assert result.success
+        assert "server_url" not in result.outputs.get("metadata", {})
+        assert "mcp_server_url" not in str(result.outputs)
+
+
+class TestErrorMessageSanitization:
+    """F10: Error messages must not contain hostnames or ports."""
+
+    @pytest.mark.asyncio
+    async def test_http_error_message_is_generic(self):
+        executor = MCPExecutor()
+        session = _owned_session()
+
+        mock_response = MagicMock()
+        mock_response.raise_for_status = MagicMock(
+            side_effect=httpx.HTTPError("Connection to 10.0.0.1:8080 refused")
+        )
+        mock_client = MagicMock()
+        mock_client.post = AsyncMock(return_value=mock_response)
+
+        with (
+            patch(f"{MODULE_PATH}.AsyncSessionLocal", return_value=_AsyncSessionCM(session)),
+            patch(f"{MODULE_PATH}.httpx.AsyncClient") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+            result = await executor.execute(
+                "node-1", "mcp",
+                {"mcp_server_url": "https://mcp.example.com", "method": "list_resources"},
+                {}, _default_context(),
+            )
+
+        assert not result.success
+        assert "10.0.0.1" not in result.error
+        assert ":8080" not in result.error
+        assert "failed" in result.error.lower() or "error" in result.error.lower()
+
+
+class TestTimeoutClamping:
+    """F12: Timeout clamped to 120s maximum, defaults to 30s."""
+
+    def test_clamps_to_120(self):
+        assert _normalize_timeout(7200) == 120.0
+
+    def test_defaults_to_30(self):
+        assert _normalize_timeout(None) == 30.0
+
+    def test_minimum_is_1(self):
+        assert _normalize_timeout(0.1) == 1.0
+
+    @pytest.mark.asyncio
+    async def test_executor_uses_clamped_timeout(self):
+        executor = MCPExecutor()
+        session = _owned_session()
+
+        mock_response = MagicMock()
+        mock_response.raise_for_status = MagicMock()
+        mock_response.json.return_value = {
+            "jsonrpc": "2.0", "id": 1,
+            "result": {"resources": []},
+        }
+        mock_client = MagicMock()
+        mock_client.post = AsyncMock(return_value=mock_response)
+
+        with (
+            patch(f"{MODULE_PATH}.AsyncSessionLocal", return_value=_AsyncSessionCM(session)),
+            patch(f"{MODULE_PATH}.httpx.AsyncClient") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+            await executor.execute(
+                "node-1", "mcp",
+                {"mcp_server_url": "https://mcp.example.com", "method": "list_resources", "timeout": 9999},
+                {}, _default_context(),
+            )
+
+        assert mock_factory.call_args.kwargs["timeout"] == 120.0
+
+
+class TestWorkflowOwnership:
+    """F08: Executor blocks when context user does not own workflow."""
+
+    @pytest.mark.asyncio
+    async def test_blocks_unauthorized_user(self):
+        executor = MCPExecutor()
+        session = _owned_session(user_id=99)  # workflow owned by user 99
+
+        with (
+            patch(f"{MODULE_PATH}.AsyncSessionLocal", return_value=_AsyncSessionCM(session)),
+            patch(f"{MODULE_PATH}.httpx.AsyncClient") as mock_client,
+        ):
+            result = await executor.execute(
+                "node-1", "mcp",
+                {"mcp_server_url": "https://mcp.example.com", "method": "list_resources"},
+                {},
+                {"workflow_id": "123", "user_id": 7, "tenant_id": "tenant-1"},  # user 7 != owner 99
+            )
+
+        assert not result.success
+        assert "unauthorized" in result.error.lower()
+        mock_client.assert_not_called()
+
+
+class TestStructlog:
+    """F11: Module uses structlog, not stdlib logging."""
+
+    def test_uses_structlog(self):
+        import structlog
+        mod = importlib.import_module(MODULE_PATH.replace("/", "."))
+        assert hasattr(mod, "logger")
+        # structlog.get_logger returns a BoundLoggerLazyProxy
+        assert "structlog" in type(mod.logger).__module__
diff --git a/python-backend/tests/unit/services/test_mcp_client_ssrf.py b/python-backend/tests/unit/services/test_mcp_client_ssrf.py
new file mode 100644
index 00000000..1f9b387e
--- /dev/null
+++ b/python-backend/tests/unit/services/test_mcp_client_ssrf.py
@@ -0,0 +1,141 @@
+"""Tests for MCP client SSRF protection and tenant cache isolation (section-01).
+
+Covers findings F01 (discover_tools SSRF), F02 (call_tool SSRF), F03 (tenant cache).
+"""
+
+import pytest
+from unittest.mock import patch, AsyncMock, MagicMock
+
+from app.services.mcp_client import (
+    discover_tools,
+    call_tool,
+    _cache_key,
+    _validate_mcp_url,
+    clear_discovery_cache,
+)
+
+pytestmark = [pytest.mark.unit]
+
+
+@pytest.fixture(autouse=True)
+def clear_cache():
+    clear_discovery_cache()
+    yield
+    clear_discovery_cache()
+
+
+def _mock_httpx_success(tools_payload: list[dict] | None = None):
+    """Helper to create a mock httpx client returning a successful tools/list response."""
+    tools = tools_payload or [{"name": "search", "description": "Search", "inputSchema": {}}]
+    mock_response = MagicMock()
+    mock_response.raise_for_status = MagicMock()
+    mock_response.json.return_value = {
+        "jsonrpc": "2.0",
+        "id": 1,
+        "result": {"tools": tools},
+    }
+    mock_client = MagicMock()
+    mock_client.post = AsyncMock(return_value=mock_response)
+    return mock_client
+
+
+class TestDiscoverToolsSSRF:
+    """F01: SSRF validation must be called in discover_tools."""
+
+    @pytest.mark.asyncio
+    async def test_blocks_private_ip_192(self):
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
+            result = await discover_tools("http://192.168.1.1:8080/rpc", tenant_id=1)
+        assert result == []
+        mock.assert_not_called()
+
+    @pytest.mark.asyncio
+    async def test_blocks_cloud_metadata_endpoint(self):
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
+            result = await discover_tools("http://169.254.169.254/latest/meta-data/", tenant_id=1)
+        assert result == []
+        mock.assert_not_called()
+
+    @pytest.mark.asyncio
+    async def test_blocks_localhost(self):
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
+            result = await discover_tools("http://127.0.0.1:6379/rpc", tenant_id=1)
+        assert result == []
+        mock.assert_not_called()
+
+    @pytest.mark.asyncio
+    async def test_blocks_10_network(self):
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
+            result = await discover_tools("http://10.0.0.1:8080/rpc", tenant_id=1)
+        assert result == []
+        mock.assert_not_called()
+
+    @pytest.mark.asyncio
+    async def test_allows_valid_public_url(self):
+        mock_client = _mock_httpx_success()
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_factory:
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+            result = await discover_tools("https://mcp.example.com/rpc", "token", tenant_id=1)
+        assert len(result) > 0
+        assert result[0].name == "search"
+
+
+class TestCallToolSSRF:
+    """F02: SSRF validation must be called in call_tool."""
+
+    @pytest.mark.asyncio
+    async def test_blocks_private_ip(self):
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
+            result = await call_tool("http://10.0.0.1:8080/rpc", "search", {}, tenant_id=1)
+        assert "blocked" in result.lower()
+        mock.assert_not_called()
+
+    @pytest.mark.asyncio
+    async def test_blocks_metadata_endpoint(self):
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock:
+            result = await call_tool("http://169.254.169.254/rpc", "read", {}, tenant_id=1)
+        assert "blocked" in result.lower()
+        mock.assert_not_called()
+
+    @pytest.mark.asyncio
+    async def test_requires_tenant_id(self):
+        result = await call_tool("https://mcp.example.com", "search", {}, tenant_id=None)
+        assert "tenant_id" in result.lower()
+
+
+class TestTenantCacheIsolation:
+    """F03: Cache must be scoped by tenant_id."""
+
+    def test_cache_key_differs_by_tenant(self):
+        key1 = _cache_key("1", "https://mcp.example.com", "abc")
+        key2 = _cache_key("2", "https://mcp.example.com", "abc")
+        assert key1 != key2
+
+    def test_cache_key_same_tenant_same_key(self):
+        key1 = _cache_key("1", "https://mcp.example.com", "abc")
+        key2 = _cache_key("1", "https://mcp.example.com", "abc")
+        assert key1 == key2
+
+    @pytest.mark.asyncio
+    async def test_cached_results_scoped_to_tenant(self):
+        """Tenant 1 cache does not serve tenant 2."""
+        tool_a = [{"name": "tool_a", "description": "A", "inputSchema": {}}]
+        tool_b = [{"name": "tool_b", "description": "B", "inputSchema": {}}]
+
+        # First call for tenant 1
+        mock_client_a = _mock_httpx_success(tool_a)
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_factory:
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client_a)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+            result_t1 = await discover_tools("https://mcp.example.com", tenant_id=1)
+
+        # Second call for tenant 2
+        mock_client_b = _mock_httpx_success(tool_b)
+        with patch("app.services.mcp_client.httpx.AsyncClient") as mock_factory:
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_client_b)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
+            result_t2 = await discover_tools("https://mcp.example.com", tenant_id=2)
+
+        assert result_t1[0].name == "tool_a"
+        assert result_t2[0].name == "tool_b"
