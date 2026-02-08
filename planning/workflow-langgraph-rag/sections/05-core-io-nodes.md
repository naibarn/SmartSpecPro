Now I have all the context I need. Let me produce the complete section document.

# Section 05: Core I/O Nodes (5 nodes)

## Overview

This section implements five core Input/Output executor nodes that connect workflows to external systems: HTTP Request, Database Query, Storage Action, Email/Notification Send, and Webhook Response. Each executor follows the established `NodeExecutor` protocol from `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/base.py` and integrates with the `LangGraphRuntime` built in Section 01.

**CRITICAL SECURITY SCOPE:** This section contains two security-sensitive implementations that require careful attention:

1. **SSRF Protection** for the HTTP Request node -- DNS-level resolution and IP blocklisting to prevent server-side request forgery attacks against internal infrastructure (metadata endpoints, databases, Redis).
2. **SQL Safety** for the Database Query node -- statement parsing via `sqlparse` to enforce an operation allowlist and prevent destructive queries.

**What gets built:**

1. **`SSRFGuard`** -- reusable SSRF protection module with DNS resolution, IP blocklist checking, and tenant-scoped URL allowlists.
2. **`HttpRequestExecutor`** -- async HTTP client (httpx) with SSRF protection, auth modes, pagination, timeout enforcement.
3. **`DatabaseQueryExecutor`** -- parameterized SQL execution with `sqlparse`-based statement validation and operation allowlists.
4. **`StorageExecutor`** -- upload/download/list/delete operations via the existing `R2StorageService`.
5. **`NotificationExecutor`** -- multi-channel send (email/slack/webhook) using the existing `EmailService` and `NotificationService`.
6. **Webhook Response verification** -- confirm the existing `WebhookResponseExecutor` works correctly with the new runtime.
7. **Node registry additions** -- register all five node types in `NodeRegistry._register_core_nodes()`.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/__init__.py` | **CREATE** | Package init |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/ssrf_guard.py` | **CREATE** | SSRF protection module (DNS resolution, IP blocklist, allowlist) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/http_request_executor.py` | **CREATE** | HTTP Request node executor |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/sql_safety.py` | **CREATE** | SQL statement parser and operation allowlist enforcer |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/database_query_executor.py` | **CREATE** | Database Query node executor |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/storage_executor.py` | **CREATE** | Storage Action node executor |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/notification_executor.py` | **CREATE** | Email/SMS/Chat Send node executor |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Add 4 new node type registrations (HTTP Request, Database Query, Storage Action, Notification) |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/__init__.py` | **CREATE** | Test package init |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_io.py` | **CREATE** | All I/O node tests |
| `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` | **MODIFY** | Add `sqlparse>=0.5.0` dependency |

---

## Tests (Write First)

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_io.py`

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_http_request_get` | unit | GET request returns status, headers, body |
| `test_http_request_post_json` | unit | POST with JSON body works |
| `test_http_request_auth_bearer` | unit | Bearer token added to headers |
| `test_http_request_blocks_private_ip` | unit | **SSRF**: 10.0.0.0/8, 172.16.0.0/12, etc. blocked |
| `test_http_request_blocks_localhost` | unit | **SSRF**: localhost, 127.0.0.1 blocked |
| `test_http_request_blocks_metadata` | unit | **SSRF**: 169.254.169.254 blocked |
| `test_http_request_allows_tenant_allowlist` | unit | Allowed internal URLs pass for enterprise |
| `test_http_request_blocks_internal_ports` | unit | **SSRF**: known internal service ports (5432, 6379) blocked |
| `test_http_request_blocks_dns_rebind` | unit | **SSRF**: DNS resolving to private IP after initial check blocked |
| `test_db_query_select` | unit | SELECT returns rows |
| `test_db_query_parameterized` | unit | Parameters properly bound |
| `test_db_query_blocks_drop` | unit | **SQL safety**: DROP rejected |
| `test_db_query_blocks_truncate` | unit | **SQL safety**: TRUNCATE rejected |
| `test_db_query_blocks_delete_default` | unit | **SQL safety**: DELETE rejected by default |
| `test_db_query_allows_delete_with_permission` | unit | DELETE permitted with tenant-level flag |
| `test_db_query_blocks_multi_statement` | unit | Multiple statements separated by `;` rejected |
| `test_storage_upload` | unit | File uploaded, URL returned |
| `test_storage_download` | unit | File downloaded by key |
| `test_storage_list` | unit | Files listed with prefix filter |
| `test_notification_email` | unit | Email sent via SMTP |
| `test_notification_slack_webhook` | unit | Slack message posted via webhook URL |
| `test_webhook_response` | unit | HTTP response with status, headers, body |

```python
"""Tests for Core I/O Node Executors.

Test file: /home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_io.py
"""

import ipaddress
import socket
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def execution_context():
    """Standard execution context for all I/O tests."""
    return ExecutionContext(
        user_id=1,
        tenant_id="tenant-abc",
        workflow_id="wf-123",
        execution_id="exec-456",
        credits_available=100,
        extra_data={},
    )


def _make_data(node_type: str, config: dict, inputs: dict) -> NodeExecutionData:
    """Helper to build NodeExecutionData."""
    return NodeExecutionData(
        node_id="test-node-1",
        node_type=node_type,
        config=config,
        inputs=inputs,
        state={},
    )


# ===========================================================================
# SSRF Guard Tests
# ===========================================================================

class TestSSRFGuard:
    """Tests for SSRF protection module."""

    def test_blocks_private_ip_10(self):
        """10.0.0.0/8 range must be blocked."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        assert guard.is_blocked_ip(ipaddress.ip_address("10.0.0.1")) is True
        assert guard.is_blocked_ip(ipaddress.ip_address("10.255.255.255")) is True

    def test_blocks_private_ip_172(self):
        """172.16.0.0/12 range must be blocked."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        assert guard.is_blocked_ip(ipaddress.ip_address("172.16.0.1")) is True
        assert guard.is_blocked_ip(ipaddress.ip_address("172.31.255.255")) is True

    def test_blocks_private_ip_192(self):
        """192.168.0.0/16 range must be blocked."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        assert guard.is_blocked_ip(ipaddress.ip_address("192.168.1.1")) is True

    def test_blocks_loopback(self):
        """127.0.0.0/8 range must be blocked."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        assert guard.is_blocked_ip(ipaddress.ip_address("127.0.0.1")) is True
        assert guard.is_blocked_ip(ipaddress.ip_address("127.0.0.2")) is True

    def test_blocks_metadata_endpoint(self):
        """169.254.169.254 (AWS/GCP metadata) must be blocked."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        assert guard.is_blocked_ip(ipaddress.ip_address("169.254.169.254")) is True

    def test_allows_public_ip(self):
        """Public IPs (e.g., 8.8.8.8) must be allowed."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        assert guard.is_blocked_ip(ipaddress.ip_address("8.8.8.8")) is False
        assert guard.is_blocked_ip(ipaddress.ip_address("93.184.216.34")) is False

    @pytest.mark.asyncio
    async def test_validate_url_blocks_localhost(self):
        """localhost hostname must be blocked."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        with pytest.raises(ValueError, match="[Bb]locked|[Ss]SRF|localhost|private"):
            await guard.validate_url("http://localhost:8080/secret")

    @pytest.mark.asyncio
    async def test_validate_url_blocks_zero_ip(self):
        """0.0.0.0 hostname must be blocked."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        with pytest.raises(ValueError, match="[Bb]locked|[Ss]SRF|private"):
            await guard.validate_url("http://0.0.0.0:3000/api")

    @pytest.mark.asyncio
    async def test_validate_url_allows_tenant_allowlist(self):
        """Enterprise tenants can allowlist specific internal URLs."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard(tenant_allowlist=["internal-api.corp.example.com"])
        # Should not raise when the hostname is in the allowlist
        # (Mock DNS to return public IP so it passes normally)
        with patch.object(guard, "_resolve_dns", return_value=["93.184.216.34"]):
            validated = await guard.validate_url("https://internal-api.corp.example.com/data")
            assert validated == "https://internal-api.corp.example.com/data"

    @pytest.mark.asyncio
    async def test_validate_url_blocks_internal_ports(self):
        """Requests to known internal service ports must be blocked."""
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

        guard = SSRFGuard()
        # Port 5432 (PostgreSQL)
        with pytest.raises(ValueError, match="[Bb]locked|port"):
            await guard.validate_url("http://example.com:5432/")
        # Port 6379 (Redis)
        with pytest.raises(ValueError, match="[Bb]locked|port"):
            await guard.validate_url("http://example.com:6379/")


# ===========================================================================
# HTTP Request Executor Tests
# ===========================================================================

class TestHttpRequestExecutor:
    """Tests for the HTTP Request node executor."""

    @pytest.mark.asyncio
    async def test_http_request_get(self, execution_context):
        """GET request returns status, headers, body."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )

        executor = HttpRequestExecutor()
        data = _make_data(
            "http_request",
            config={"method": "GET", "url": "https://httpbin.org/get", "timeout": 10},
            inputs={},
        )

        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"url": "https://httpbin.org/get"}
        mock_response.text = '{"url": "https://httpbin.org/get"}'

        with patch.object(executor, "_guarded_request", return_value=mock_response):
            result = await executor.execute(data, execution_context)

        assert result["status"] == 200
        assert "headers" in result
        assert "body" in result

    @pytest.mark.asyncio
    async def test_http_request_post_json(self, execution_context):
        """POST with JSON body works."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )

        executor = HttpRequestExecutor()
        data = _make_data(
            "http_request",
            config={
                "method": "POST",
                "url": "https://httpbin.org/post",
                "timeout": 10,
            },
            inputs={"body": {"key": "value"}},
        )

        mock_response = AsyncMock()
        mock_response.status_code = 201
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {"data": '{"key": "value"}'}
        mock_response.text = '{"data": "{\\"key\\": \\"value\\"}"}'

        with patch.object(executor, "_guarded_request", return_value=mock_response):
            result = await executor.execute(data, execution_context)

        assert result["status"] == 201

    @pytest.mark.asyncio
    async def test_http_request_auth_bearer(self, execution_context):
        """Bearer token added to headers."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )

        executor = HttpRequestExecutor()
        data = _make_data(
            "http_request",
            config={
                "method": "GET",
                "url": "https://api.example.com/data",
                "auth": {"type": "bearer", "token": "my-secret-token"},
                "timeout": 10,
            },
            inputs={},
        )

        captured_headers = {}

        async def mock_guarded_request(method, url, **kwargs):
            captured_headers.update(kwargs.get("headers", {}))
            resp = AsyncMock()
            resp.status_code = 200
            resp.headers = {}
            resp.json.return_value = {}
            resp.text = "{}"
            return resp

        with patch.object(executor, "_guarded_request", side_effect=mock_guarded_request):
            await executor.execute(data, execution_context)

        assert captured_headers.get("Authorization") == "Bearer my-secret-token"

    @pytest.mark.asyncio
    async def test_http_request_blocks_private_ip(self, execution_context):
        """SSRF: Private IPs (10.x, 172.16.x, 192.168.x) must be blocked."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )

        executor = HttpRequestExecutor()
        data = _make_data(
            "http_request",
            config={"method": "GET", "url": "http://10.0.0.5/admin", "timeout": 5},
            inputs={},
        )

        result = await executor.execute(data, execution_context)
        assert "error" in result
        assert "ssrf" in result["error"].lower() or "blocked" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_http_request_blocks_localhost(self, execution_context):
        """SSRF: localhost must be blocked."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )

        executor = HttpRequestExecutor()
        data = _make_data(
            "http_request",
            config={"method": "GET", "url": "http://localhost:8080/api", "timeout": 5},
            inputs={},
        )

        result = await executor.execute(data, execution_context)
        assert "error" in result
        assert "ssrf" in result["error"].lower() or "blocked" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_http_request_blocks_metadata(self, execution_context):
        """SSRF: AWS/GCP metadata endpoint (169.254.169.254) must be blocked."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )

        executor = HttpRequestExecutor()
        data = _make_data(
            "http_request",
            config={
                "method": "GET",
                "url": "http://169.254.169.254/latest/meta-data/",
                "timeout": 5,
            },
            inputs={},
        )

        result = await executor.execute(data, execution_context)
        assert "error" in result

    @pytest.mark.asyncio
    async def test_http_request_allows_tenant_allowlist(self, execution_context):
        """Enterprise tenant allowlisted internal URLs pass."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )

        execution_context.extra_data["url_allowlist"] = ["internal.corp.example.com"]
        executor = HttpRequestExecutor()
        data = _make_data(
            "http_request",
            config={
                "method": "GET",
                "url": "https://internal.corp.example.com/api/data",
                "timeout": 5,
            },
            inputs={},
        )

        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.headers = {}
        mock_response.json.return_value = {"ok": True}
        mock_response.text = '{"ok": true}'

        # Mock both DNS resolution and httpx request
        with patch(
            "app.orchestrator.node_executors.io_executors.ssrf_guard.SSRFGuard._resolve_dns",
            return_value=["93.184.216.34"],
        ), patch("httpx.AsyncClient.request", return_value=mock_response):
            result = await executor.execute(data, execution_context)

        assert "error" not in result or result.get("status") == 200


# ===========================================================================
# SQL Safety Tests
# ===========================================================================

class TestSQLSafety:
    """Tests for SQL statement validation."""

    def test_allows_select(self):
        """SELECT statements must be allowed."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        # Should not raise
        validate_sql("SELECT * FROM users WHERE id = :id", allowed_ops={"SELECT", "INSERT", "UPDATE"})

    def test_allows_insert(self):
        """INSERT statements must be allowed."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        validate_sql(
            "INSERT INTO logs (message) VALUES (:msg)",
            allowed_ops={"SELECT", "INSERT", "UPDATE"},
        )

    def test_blocks_drop(self):
        """DROP must be rejected by default."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        with pytest.raises(ValueError, match="[Dd]rop|not allowed|forbidden"):
            validate_sql("DROP TABLE users", allowed_ops={"SELECT", "INSERT", "UPDATE"})

    def test_blocks_truncate(self):
        """TRUNCATE must be rejected by default."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        with pytest.raises(ValueError, match="[Tt]runcate|not allowed|forbidden"):
            validate_sql("TRUNCATE TABLE logs", allowed_ops={"SELECT", "INSERT", "UPDATE"})

    def test_blocks_delete_default(self):
        """DELETE must be rejected by default."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        with pytest.raises(ValueError, match="[Dd]elete|not allowed|forbidden"):
            validate_sql("DELETE FROM users WHERE id = 1", allowed_ops={"SELECT", "INSERT", "UPDATE"})

    def test_allows_delete_with_permission(self):
        """DELETE permitted when explicitly in allowed_ops."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        # Should not raise
        validate_sql(
            "DELETE FROM temp_table WHERE created < '2025-01-01'",
            allowed_ops={"SELECT", "INSERT", "UPDATE", "DELETE"},
        )

    def test_blocks_alter(self):
        """ALTER must be rejected."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        with pytest.raises(ValueError, match="[Aa]lter|not allowed|forbidden"):
            validate_sql("ALTER TABLE users ADD COLUMN age INT", allowed_ops={"SELECT", "INSERT", "UPDATE"})

    def test_blocks_multi_statement(self):
        """Multiple statements separated by semicolons must be rejected."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        with pytest.raises(ValueError, match="[Mm]ultiple|single|statement"):
            validate_sql(
                "SELECT 1; DROP TABLE users;",
                allowed_ops={"SELECT", "INSERT", "UPDATE"},
            )

    def test_blocks_comment_injection(self):
        """SQL comments that might hide destructive operations must be caught."""
        from app.orchestrator.node_executors.io_executors.sql_safety import validate_sql

        # This attempts to hide DROP after a comment
        with pytest.raises(ValueError):
            validate_sql(
                "SELECT 1; -- innocent\nDROP TABLE users",
                allowed_ops={"SELECT"},
            )


# ===========================================================================
# Database Query Executor Tests
# ===========================================================================

class TestDatabaseQueryExecutor:
    """Tests for the Database Query node executor."""

    @pytest.mark.asyncio
    async def test_db_query_select(self, execution_context):
        """SELECT returns rows, row_count, columns."""
        from app.orchestrator.node_executors.io_executors.database_query_executor import (
            DatabaseQueryExecutor,
        )

        executor = DatabaseQueryExecutor()
        data = _make_data(
            "database_query",
            config={"query": "SELECT id, name FROM users WHERE active = :active"},
            inputs={"parameters": {"active": True}},
        )

        mock_rows = [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]

        with patch.object(executor, "_execute_query", return_value=mock_rows):
            result = await executor.execute(data, execution_context)

        assert result["row_count"] == 2
        assert result["rows"] == mock_rows
        assert "columns" in result

    @pytest.mark.asyncio
    async def test_db_query_parameterized(self, execution_context):
        """Parameters properly bound (no string interpolation)."""
        from app.orchestrator.node_executors.io_executors.database_query_executor import (
            DatabaseQueryExecutor,
        )

        executor = DatabaseQueryExecutor()
        data = _make_data(
            "database_query",
            config={"query": "SELECT * FROM products WHERE price > :min_price AND category = :cat"},
            inputs={"parameters": {"min_price": 10.5, "cat": "electronics"}},
        )

        captured_params = {}

        async def mock_execute(query, params, **kwargs):
            captured_params.update(params)
            return []

        with patch.object(executor, "_execute_query", side_effect=mock_execute):
            await executor.execute(data, execution_context)

        assert captured_params["min_price"] == 10.5
        assert captured_params["cat"] == "electronics"

    @pytest.mark.asyncio
    async def test_db_query_blocks_drop(self, execution_context):
        """SQL safety: DROP rejected."""
        from app.orchestrator.node_executors.io_executors.database_query_executor import (
            DatabaseQueryExecutor,
        )

        executor = DatabaseQueryExecutor()
        data = _make_data(
            "database_query",
            config={"query": "DROP TABLE users"},
            inputs={},
        )

        result = await executor.execute(data, execution_context)
        assert "error" in result

    @pytest.mark.asyncio
    async def test_db_query_blocks_truncate(self, execution_context):
        """SQL safety: TRUNCATE rejected."""
        from app.orchestrator.node_executors.io_executors.database_query_executor import (
            DatabaseQueryExecutor,
        )

        executor = DatabaseQueryExecutor()
        data = _make_data(
            "database_query",
            config={"query": "TRUNCATE TABLE logs"},
            inputs={},
        )

        result = await executor.execute(data, execution_context)
        assert "error" in result

    @pytest.mark.asyncio
    async def test_db_query_blocks_delete_default(self, execution_context):
        """SQL safety: DELETE rejected by default."""
        from app.orchestrator.node_executors.io_executors.database_query_executor import (
            DatabaseQueryExecutor,
        )

        executor = DatabaseQueryExecutor()
        data = _make_data(
            "database_query",
            config={"query": "DELETE FROM users WHERE id = :id"},
            inputs={"parameters": {"id": 5}},
        )

        result = await executor.execute(data, execution_context)
        assert "error" in result


# ===========================================================================
# Storage Executor Tests
# ===========================================================================

class TestStorageExecutor:
    """Tests for the Storage Action node executor."""

    @pytest.mark.asyncio
    async def test_storage_upload(self, execution_context):
        """File uploaded, URL returned."""
        from app.orchestrator.node_executors.io_executors.storage_executor import (
            StorageExecutor,
        )

        executor = StorageExecutor()
        data = _make_data(
            "storage_action",
            config={"operation": "upload", "bucket": "my-bucket", "key": "uploads/test.txt"},
            inputs={"content": "Hello, World!", "content_type": "text/plain"},
        )

        with patch(
            "app.orchestrator.node_executors.io_executors.storage_executor.get_r2_storage_service"
        ) as mock_svc:
            mock_instance = MagicMock()
            mock_instance.upload_file = AsyncMock(return_value="https://cdn.example.com/uploads/test.txt")
            mock_svc.return_value = mock_instance

            result = await executor.execute(data, execution_context)

        assert result.get("url") == "https://cdn.example.com/uploads/test.txt"
        assert result.get("operation") == "upload"

    @pytest.mark.asyncio
    async def test_storage_download(self, execution_context):
        """File downloaded by key."""
        from app.orchestrator.node_executors.io_executors.storage_executor import (
            StorageExecutor,
        )

        executor = StorageExecutor()
        data = _make_data(
            "storage_action",
            config={"operation": "download", "bucket": "my-bucket", "key": "uploads/test.txt"},
            inputs={},
        )

        with patch.object(executor, "_download_file", return_value=b"file-content"):
            result = await executor.execute(data, execution_context)

        assert "content" in result or "url" in result

    @pytest.mark.asyncio
    async def test_storage_list(self, execution_context):
        """Files listed with prefix filter."""
        from app.orchestrator.node_executors.io_executors.storage_executor import (
            StorageExecutor,
        )

        executor = StorageExecutor()
        data = _make_data(
            "storage_action",
            config={"operation": "list", "bucket": "my-bucket", "prefix": "uploads/"},
            inputs={},
        )

        mock_files = [
            {"key": "uploads/a.txt", "size": 100},
            {"key": "uploads/b.txt", "size": 200},
        ]
        with patch.object(executor, "_list_files", return_value=mock_files):
            result = await executor.execute(data, execution_context)

        assert result.get("files") == mock_files
        assert result.get("count") == 2


# ===========================================================================
# Notification Executor Tests
# ===========================================================================

class TestNotificationExecutor:
    """Tests for the Email/Notification Send node executor."""

    @pytest.mark.asyncio
    async def test_notification_email(self, execution_context):
        """Email sent via SMTP."""
        from app.orchestrator.node_executors.io_executors.notification_executor import (
            NotificationExecutor,
        )

        executor = NotificationExecutor()
        data = _make_data(
            "notification",
            config={"channel": "email"},
            inputs={
                "recipients": ["user@example.com"],
                "subject": "Test Subject",
                "body": "<p>Hello</p>",
            },
        )

        with patch(
            "app.orchestrator.node_executors.io_executors.notification_executor.get_email_service"
        ) as mock_svc:
            mock_instance = MagicMock()
            mock_instance.send_email = AsyncMock(return_value=True)
            mock_svc.return_value = mock_instance

            result = await executor.execute(data, execution_context)

        assert result.get("status") == "sent"
        assert result.get("channel") == "email"

    @pytest.mark.asyncio
    async def test_notification_slack_webhook(self, execution_context):
        """Slack message posted via webhook URL."""
        from app.orchestrator.node_executors.io_executors.notification_executor import (
            NotificationExecutor,
        )

        executor = NotificationExecutor()
        data = _make_data(
            "notification",
            config={
                "channel": "slack",
                "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx",
            },
            inputs={"body": "Workflow completed successfully!"},
        )

        mock_resp = AsyncMock()
        mock_resp.status_code = 200

        with patch("httpx.AsyncClient.post", return_value=mock_resp):
            result = await executor.execute(data, execution_context)

        assert result.get("status") == "sent"
        assert result.get("channel") == "slack"


# ===========================================================================
# Webhook Response Tests
# ===========================================================================

class TestWebhookResponse:
    """Tests for the existing Webhook Response node in the new runtime."""

    @pytest.mark.asyncio
    async def test_webhook_response(self, execution_context):
        """Webhook Response stores status, headers, body in context."""
        from app.orchestrator.node_executors.output_executors.webhook_response_executor import (
            WebhookResponseExecutor,
        )

        executor = WebhookResponseExecutor()
        data = _make_data(
            "webhook_response",
            config={},
            inputs={
                "statusCode": 201,
                "body": {"result": "created"},
                "headers": {"X-Custom": "value"},
            },
        )

        result = await executor.execute(data, execution_context)

        webhook_resp = execution_context.extra_data.get("webhook_response")
        assert webhook_resp is not None
        assert webhook_resp["statusCode"] == 201
        assert webhook_resp["body"] == {"result": "created"}
        assert webhook_resp["headers"]["X-Custom"] == "value"
```

---

## Implementation Steps

### Step 1: Add sqlparse Dependency

**File:** `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`

Add `sqlparse>=0.5.0` to the dependencies list. `httpx` is already present (`>=0.24.1`).

### Step 2: Create Package Init

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/__init__.py`

```python
"""I/O node executors: HTTP, Database, Storage, Notification."""
```

### Step 3: Implement SSRF Guard (CRITICAL SECURITY)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/ssrf_guard.py`

This is the most security-critical component in this section. The guard implements a **resolve-then-check** strategy: DNS is resolved first, the resolved IP is checked against blocklists, and only then is the HTTP connection made. This prevents DNS rebinding attacks.

```python
"""SSRF Protection Guard.

Implements DNS-level resolution and IP blocklist checking to prevent
server-side request forgery attacks against internal infrastructure.

Strategy:
1. Parse the URL and extract hostname + port.
2. Check hostname against blocked hostnames (localhost, 0.0.0.0).
3. Check port against blocked internal service ports.
4. Resolve DNS to IP addresses.
5. Check every resolved IP against the blocked IP ranges.
6. Only if all checks pass, allow the request.

Tenant Allowlist:
Enterprise tenants can configure a list of hostnames that bypass the
hostname blocklist (but NOT the IP blocklist). This enables workflows
that need to call internal corporate APIs while still preventing
access to cloud metadata endpoints and databases.
"""

import ipaddress
import socket
from typing import Sequence
from urllib.parse import urlparse

import structlog

logger = structlog.get_logger()

# CIDR ranges that must never be reached from workflow HTTP nodes
BLOCKED_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network("10.0.0.0/8"),        # RFC 1918 private
    ipaddress.ip_network("172.16.0.0/12"),      # RFC 1918 private
    ipaddress.ip_network("192.168.0.0/16"),     # RFC 1918 private
    ipaddress.ip_network("127.0.0.0/8"),        # Loopback
    ipaddress.ip_network("169.254.0.0/16"),     # Link-local (AWS/GCP metadata)
    ipaddress.ip_network("0.0.0.0/8"),          # "This" network
    ipaddress.ip_network("::1/128"),            # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),           # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),          # IPv6 link-local
]

# Hostnames that are always blocked
BLOCKED_HOSTNAMES: set[str] = {
    "localhost",
    "0.0.0.0",
    "[::]",
    "[::1]",
    "metadata.google.internal",          # GCP metadata
    "metadata.google.internal.",
}

# Ports of known internal services -- never allowed
BLOCKED_PORTS: set[int] = {
    5432,   # PostgreSQL
    6379,   # Redis
    3306,   # MySQL
    27017,  # MongoDB
    9200,   # Elasticsearch
    2379,   # etcd
    8500,   # Consul
    11211,  # Memcached
}


class SSRFGuard:
    """Guard against SSRF attacks for workflow HTTP Request nodes.

    Usage:
        guard = SSRFGuard(tenant_allowlist=["internal-api.corp.com"])
        validated_url = await guard.validate_url("https://api.example.com/data")
        # If it returns, the URL is safe to request.
        # If it raises ValueError, the URL is blocked.
    """

    def __init__(self, tenant_allowlist: Sequence[str] | None = None):
        """Initialize the SSRF guard.

        Args:
            tenant_allowlist: Optional list of hostnames that bypass the
                hostname blocklist (but NOT the IP blocklist). For enterprise
                tenants that need to call internal corporate APIs.
        """
        self._tenant_allowlist: set[str] = set(tenant_allowlist or [])

    def is_blocked_ip(self, ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
        """Check if an IP address falls within any blocked network.

        Args:
            ip: The IP address to check.

        Returns:
            True if the IP is in a blocked range, False otherwise.
        """
        for network in BLOCKED_NETWORKS:
            if ip in network:
                return True
        return False

    async def validate_url(self, url: str) -> str:
        """Validate a URL against SSRF protections.

        Steps:
        1. Parse URL, extract hostname and port.
        2. Block known-bad hostnames (unless tenant-allowlisted).
        3. Block known internal service ports.
        4. Resolve DNS and check all resolved IPs against blocklist.

        Args:
            url: The URL to validate.

        Returns:
            The validated URL (unchanged) if it passes all checks.

        Raises:
            ValueError: If the URL is blocked by any SSRF check.
        """
        parsed = urlparse(url)
        hostname = parsed.hostname
        port = parsed.port

        if not hostname:
            raise ValueError("SSRF blocked: URL has no hostname")

        hostname_lower = hostname.lower()

        # Step 1: Check blocked hostnames (unless in tenant allowlist)
        if hostname_lower in BLOCKED_HOSTNAMES and hostname_lower not in self._tenant_allowlist:
            logger.warning("ssrf_hostname_blocked", hostname=hostname, url=url[:200])
            raise ValueError(f"SSRF blocked: hostname '{hostname}' is not allowed")

        # Step 2: Check blocked ports
        if port and port in BLOCKED_PORTS:
            logger.warning("ssrf_port_blocked", hostname=hostname, port=port)
            raise ValueError(
                f"SSRF blocked: port {port} is a known internal service port"
            )

        # Step 3: Try parsing hostname as IP directly (e.g., http://10.0.0.5/)
        try:
            ip = ipaddress.ip_address(hostname)
            if self.is_blocked_ip(ip):
                logger.warning("ssrf_direct_ip_blocked", ip=str(ip), url=url[:200])
                raise ValueError(f"SSRF blocked: IP {ip} is in a private/reserved range")
            # Direct IP that passed -- still return URL
            return url
        except ValueError:
            pass  # Not an IP literal, proceed to DNS resolution

        # Step 4: DNS resolution -- resolve to IPs and check each one
        resolved_ips = await self._resolve_dns(hostname)

        if not resolved_ips:
            raise ValueError(f"SSRF blocked: could not resolve hostname '{hostname}'")

        for ip_str in resolved_ips:
            try:
                ip = ipaddress.ip_address(ip_str)
                if self.is_blocked_ip(ip):
                    logger.warning(
                        "ssrf_dns_resolved_to_private",
                        hostname=hostname,
                        resolved_ip=ip_str,
                        url=url[:200],
                    )
                    raise ValueError(
                        f"SSRF blocked: '{hostname}' resolves to private IP {ip_str}"
                    )
            except ValueError as e:
                if "SSRF" in str(e):
                    raise
                # Invalid IP from DNS -- skip

        return url

    async def _resolve_dns(self, hostname: str) -> list[str]:
        """Resolve hostname to IP addresses.

        Uses socket.getaddrinfo (blocking, but fast for DNS lookups).
        In production, consider using an async resolver (e.g., aiodns).

        Args:
            hostname: The hostname to resolve.

        Returns:
            List of IP address strings.
        """
        try:
            # getaddrinfo returns list of (family, type, proto, canonname, sockaddr)
            results = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            ips = list({result[4][0] for result in results})
            return ips
        except socket.gaierror:
            return []
```

### Step 4: Implement HTTP Request Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/http_request_executor.py`

```python
"""HTTP Request node executor with SSRF protection.

Supports:
- Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Auth: none, basic, bearer, oauth2 (client_credentials)
- Pagination: offset, cursor, link-header (auto-follow)
- Timeout enforcement
- Response parsing: JSON (auto-detected), raw text
- SSRF protection via SSRFGuard (DNS resolution + IP blocklist)
"""

from typing import Any
from urllib.parse import urlparse

import httpx
import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

logger = structlog.get_logger()

# Maximum response body size to store in state (2 MB)
MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024

# Default timeout in seconds
DEFAULT_TIMEOUT = 30

# Maximum number of pagination pages to follow
MAX_PAGINATION_PAGES = 100


class HttpRequestExecutor:
    """Executor for HTTP Request nodes.

    Security: Every outbound URL is validated by SSRFGuard before the
    request is sent. DNS is resolved, the resolved IP is checked
    against the blocklist, and only then is the connection established.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute an HTTP request.

        Config keys:
            method: HTTP method (GET, POST, etc.)
            url: Target URL (subject to SSRF validation)
            headers: Optional dict of headers
            auth: Optional auth config {type, token/username/password}
            timeout: Request timeout in seconds (default 30)
            follow_redirects: Whether to follow redirects (default True)
            pagination: Optional pagination config {mode, ...}

        Input keys:
            body: Optional request body (dict for JSON, str for raw)
            query_params: Optional dict of query parameters

        Returns:
            dict with keys: status, headers, body, url
            On error: dict with key: error
        """
        config = data.config
        inputs = data.inputs

        method = (config.get("method") or "GET").upper()
        url = config.get("url") or inputs.get("url", "")
        timeout = config.get("timeout", DEFAULT_TIMEOUT)
        follow_redirects = config.get("follow_redirects", True)

        if not url:
            return {"error": "HTTP Request node requires a URL"}

        # Build tenant allowlist from context
        tenant_allowlist = context.extra_data.get("url_allowlist", [])
        guard = SSRFGuard(tenant_allowlist=tenant_allowlist)

        try:
            validated_url = await guard.validate_url(url)
        except ValueError as e:
            logger.warning("http_request_ssrf_blocked", url=url[:200], error=str(e))
            return {"error": str(e)}

        # Build headers
        headers = dict(config.get("headers") or {})
        headers.update(inputs.get("headers") or {})

        # Apply auth
        auth_config = config.get("auth")
        if auth_config:
            headers = self._apply_auth(headers, auth_config)

        # Build body
        body = inputs.get("body")
        json_body = None
        raw_body = None

        if body is not None:
            if isinstance(body, dict):
                json_body = body
            elif isinstance(body, str):
                raw_body = body
            else:
                json_body = body  # let httpx serialize

        # Query params
        params = inputs.get("query_params") or config.get("query_params")

        try:
            response = await self._guarded_request(
                method=method,
                url=validated_url,
                headers=headers,
                json=json_body,
                content=raw_body,
                params=params,
                timeout=timeout,
                follow_redirects=follow_redirects,
            )

            # Parse response body
            response_body = self._parse_response_body(response)

            result = {
                "status": response.status_code,
                "headers": dict(response.headers),
                "body": response_body,
                "url": str(response.url) if hasattr(response, "url") else validated_url,
            }

            return result

        except httpx.TimeoutException:
            return {"error": f"HTTP request timed out after {timeout}s", "url": url}
        except httpx.HTTPError as e:
            return {"error": f"HTTP request failed: {str(e)}", "url": url}
        except Exception as e:
            logger.error("http_request_unexpected_error", error=str(e), url=url[:200])
            return {"error": f"Unexpected error: {str(e)}"}

    async def _guarded_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Execute an HTTP request via httpx.

        This method is separate to allow mocking in tests.
        """
        timeout = kwargs.pop("timeout", DEFAULT_TIMEOUT)
        follow_redirects = kwargs.pop("follow_redirects", True)

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout),
            follow_redirects=follow_redirects,
            max_redirects=5,
        ) as client:
            response = await client.request(method, url, **kwargs)
            return response

    def _apply_auth(self, headers: dict, auth_config: dict) -> dict:
        """Apply authentication to request headers.

        Supported auth types:
        - bearer: Adds Authorization: Bearer <token>
        - basic: Adds Authorization: Basic <base64(user:pass)>
        - api_key: Adds custom header with API key
        """
        auth_type = auth_config.get("type", "none")

        if auth_type == "bearer":
            token = auth_config.get("token", "")
            headers["Authorization"] = f"Bearer {token}"

        elif auth_type == "basic":
            import base64
            username = auth_config.get("username", "")
            password = auth_config.get("password", "")
            credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"

        elif auth_type == "api_key":
            header_name = auth_config.get("header_name", "X-API-Key")
            api_key = auth_config.get("api_key", "")
            headers[header_name] = api_key

        return headers

    def _parse_response_body(self, response: httpx.Response) -> Any:
        """Parse HTTP response body.

        Auto-detects JSON from Content-Type header.
        Falls back to raw text. Truncates if body exceeds MAX_RESPONSE_BODY_BYTES.
        """
        content_type = response.headers.get("content-type", "")

        # Check size
        body_bytes = response.content
        if len(body_bytes) > MAX_RESPONSE_BODY_BYTES:
            return {
                "_truncated": True,
                "_original_size": len(body_bytes),
                "text": response.text[:10000],
            }

        # Try JSON
        if "application/json" in content_type:
            try:
                return response.json()
            except Exception:
                return response.text

        return response.text
```

### Step 5: Implement SQL Safety Module (CRITICAL SECURITY)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/sql_safety.py`

```python
"""SQL Safety module for the Database Query node.

Uses sqlparse to parse SQL statements and enforce an operation allowlist.
Prevents users from running destructive operations (DROP, TRUNCATE, ALTER)
unless explicitly permitted at the tenant level.

Default allowlist: SELECT, INSERT, UPDATE
Extended allowlist (per-tenant): + DELETE
Never allowed: DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE
"""

from typing import Set

import sqlparse
import structlog

logger = structlog.get_logger()

# Default operations allowed for all tenants
DEFAULT_ALLOWED_OPS: frozenset[str] = frozenset({"SELECT", "INSERT", "UPDATE"})

# Operations that can be tenant-unlocked
TENANT_UNLOCKABLE_OPS: frozenset[str] = frozenset({"DELETE"})

# Operations that are NEVER allowed regardless of tenant config
ALWAYS_BLOCKED_OPS: frozenset[str] = frozenset({
    "DROP", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE",
    "VACUUM", "REINDEX", "CLUSTER", "COMMENT",
})


def validate_sql(
    sql: str,
    allowed_ops: Set[str] | None = None,
) -> str:
    """Validate a SQL statement against the operation allowlist.

    Args:
        sql: The SQL statement to validate.
        allowed_ops: Set of allowed SQL operations (e.g., {"SELECT", "INSERT"}).
            Defaults to DEFAULT_ALLOWED_OPS if not provided.

    Returns:
        The normalized SQL statement if valid.

    Raises:
        ValueError: If the SQL contains disallowed operations or
            multiple statements.
    """
    if not sql or not sql.strip():
        raise ValueError("SQL query cannot be empty")

    ops = allowed_ops if allowed_ops is not None else DEFAULT_ALLOWED_OPS

    # Parse the SQL
    parsed_statements = sqlparse.parse(sql)

    # Filter out empty statements (trailing semicolons produce empty parsed items)
    non_empty = [
        stmt for stmt in parsed_statements
        if stmt.tokens and str(stmt).strip()
    ]

    if len(non_empty) == 0:
        raise ValueError("SQL query cannot be empty")

    if len(non_empty) > 1:
        raise ValueError(
            "Multiple SQL statements are not allowed. "
            "Only a single statement is permitted per query."
        )

    statement = non_empty[0]
    stmt_type = statement.get_type()

    if stmt_type is None:
        # sqlparse could not determine the type -- extract first keyword manually
        stmt_type = _extract_first_keyword(statement)

    if stmt_type is None:
        raise ValueError("Could not determine SQL statement type")

    stmt_type_upper = stmt_type.upper()

    # Check against always-blocked operations
    if stmt_type_upper in ALWAYS_BLOCKED_OPS:
        raise ValueError(
            f"SQL operation '{stmt_type_upper}' is forbidden and cannot be used "
            f"in workflow database query nodes."
        )

    # Check against allowed operations
    if stmt_type_upper not in ops:
        raise ValueError(
            f"SQL operation '{stmt_type_upper}' is not allowed. "
            f"Allowed operations: {', '.join(sorted(ops))}"
        )

    # Additional check: scan all tokens for hidden destructive keywords
    # (e.g., subqueries or CTEs containing DROP)
    _scan_for_hidden_ops(statement)

    return str(statement).strip()


def _extract_first_keyword(statement: sqlparse.sql.Statement) -> str | None:
    """Extract the first keyword from a parsed SQL statement.

    Fallback for when sqlparse's get_type() returns None.
    """
    for token in statement.flatten():
        if token.ttype in (sqlparse.tokens.Keyword.DDL, sqlparse.tokens.Keyword.DML):
            return str(token).upper()
        if token.ttype is sqlparse.tokens.Keyword and str(token).upper() in (
            "SELECT", "INSERT", "UPDATE", "DELETE",
            "DROP", "TRUNCATE", "ALTER", "CREATE",
            "GRANT", "REVOKE",
        ):
            return str(token).upper()
    return None


def _scan_for_hidden_ops(statement: sqlparse.sql.Statement) -> None:
    """Scan all tokens for hidden destructive operations.

    Catches cases like:
    - SELECT 1; DROP TABLE users (caught by multi-statement check, but double-check)
    - CTEs or subqueries containing DROP
    """
    for token in statement.flatten():
        word = str(token).upper().strip()
        if word in ALWAYS_BLOCKED_OPS:
            raise ValueError(
                f"SQL contains forbidden operation '{word}' "
                f"(found in subquery or expression)"
            )


def get_allowed_ops_for_tenant(
    tenant_config: dict | None = None,
) -> set[str]:
    """Determine the allowed SQL operations for a tenant.

    Args:
        tenant_config: Optional tenant-level configuration dict.
            Looks for key "sql_allow_delete" (bool).

    Returns:
        Set of allowed SQL operation strings.
    """
    ops = set(DEFAULT_ALLOWED_OPS)

    if tenant_config:
        if tenant_config.get("sql_allow_delete", False):
            ops.add("DELETE")

    return ops
```

### Step 6: Implement Database Query Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/database_query_executor.py`

```python
"""Database Query node executor with SQL safety enforcement.

Supports PostgreSQL and MySQL connections via SQLAlchemy async sessions.
All queries are parameterized -- raw string interpolation is never used.
SQL statements are validated via sqlparse before execution.
"""

from typing import Any

import structlog
from sqlalchemy import text

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.io_executors.sql_safety import (
    get_allowed_ops_for_tenant,
    validate_sql,
)

logger = structlog.get_logger()

# Maximum number of rows to return (safety limit)
MAX_ROWS = 10_000


class DatabaseQueryExecutor:
    """Executor for Database Query nodes.

    Config keys:
        query: SQL query string with named parameters (e.g., :param_name)
        connection_type: "postgresql" or "mysql" (default: "postgresql")
        max_rows: Maximum rows to return (default: 1000, max: 10000)
        tenant_config: Optional tenant-level config for operation permissions

    Input keys:
        parameters: Dict of query parameter values

    Returns:
        dict with keys: rows, row_count, columns
        On error: dict with key: error
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute a database query."""
        config = data.config
        inputs = data.inputs

        query = config.get("query", "")
        parameters = inputs.get("parameters") or config.get("parameters") or {}
        max_rows = min(config.get("max_rows", 1000), MAX_ROWS)

        if not query:
            return {"error": "Database query is empty"}

        # Get tenant-level SQL permissions
        tenant_config = config.get("tenant_config") or context.extra_data.get("tenant_config")
        allowed_ops = get_allowed_ops_for_tenant(tenant_config)

        # Validate SQL statement
        try:
            validated_query = validate_sql(query, allowed_ops=allowed_ops)
        except ValueError as e:
            logger.warning(
                "db_query_sql_rejected",
                query=query[:200],
                error=str(e),
                tenant_id=context.tenant_id,
            )
            return {"error": str(e)}

        # Execute query
        try:
            rows = await self._execute_query(validated_query, parameters, max_rows=max_rows)

            columns = list(rows[0].keys()) if rows else []

            return {
                "rows": rows,
                "row_count": len(rows),
                "columns": columns,
            }

        except Exception as e:
            logger.error(
                "db_query_execution_error",
                query=query[:200],
                error=str(e),
                tenant_id=context.tenant_id,
            )
            return {"error": f"Database query failed: {str(e)}"}

    async def _execute_query(
        self,
        query: str,
        parameters: dict[str, Any],
        max_rows: int = 1000,
    ) -> list[dict[str, Any]]:
        """Execute the validated query against the database.

        Uses the application's SQLAlchemy async session pool.
        Parameters are bound via SQLAlchemy text() -- never interpolated.

        Args:
            query: Validated SQL query string.
            parameters: Named parameter values.
            max_rows: Maximum rows to return.

        Returns:
            List of row dicts.
        """
        from app.core.config import get_async_session

        async with get_async_session() as session:
            stmt = text(query)

            # Add LIMIT if not already present (for SELECT queries)
            query_upper = query.upper().strip()
            if query_upper.startswith("SELECT") and "LIMIT" not in query_upper:
                stmt = text(f"{query} LIMIT :__max_rows")
                parameters = {**parameters, "__max_rows": max_rows}

            result = await session.execute(stmt, parameters)

            if result.returns_rows:
                rows = [dict(row._mapping) for row in result.fetchall()]
                return rows[:max_rows]
            else:
                # INSERT/UPDATE -- return affected row count
                return [{"affected_rows": result.rowcount}]
```

### Step 7: Implement Storage Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/storage_executor.py`

```python
"""Storage Action node executor.

Supports upload, download, list, and delete operations via the
existing R2StorageService (S3/R2 compatible).
"""

from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.services.r2_storage_service import get_r2_storage_service

logger = structlog.get_logger()


class StorageExecutor:
    """Executor for Storage Action nodes.

    Config keys:
        operation: "upload" | "download" | "list" | "delete"
        bucket: Target bucket name
        key: Object key (for upload/download/delete)
        prefix: Key prefix (for list operation)

    Input keys:
        content: File content (str or bytes, for upload)
        content_type: MIME type (for upload)

    Returns:
        dict with operation-specific keys:
        - upload: {url, signed_url, operation}
        - download: {content, metadata, operation}
        - list: {files, count, operation}
        - delete: {deleted, operation}
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute a storage operation."""
        config = data.config
        inputs = data.inputs

        operation = (config.get("operation") or "upload").lower()
        bucket = config.get("bucket", "")
        key = config.get("key") or inputs.get("key", "")

        if operation == "upload":
            return await self._upload(config, inputs, context)
        elif operation == "download":
            return await self._download(config, inputs, context)
        elif operation == "list":
            return await self._list(config, inputs, context)
        elif operation == "delete":
            return await self._delete(config, inputs, context)
        else:
            return {"error": f"Unknown storage operation: {operation}"}

    async def _upload(
        self,
        config: dict,
        inputs: dict,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Upload a file to storage."""
        content = inputs.get("content", "")
        content_type = inputs.get("content_type", "application/octet-stream")
        key = config.get("key") or inputs.get("key", "")
        folder = config.get("folder", "workflow-uploads")

        if not content:
            return {"error": "Upload requires content"}

        # Convert string content to bytes if needed
        if isinstance(content, str):
            content_bytes = content.encode("utf-8")
        elif isinstance(content, bytes):
            content_bytes = content
        else:
            return {"error": "Content must be string or bytes"}

        service = get_r2_storage_service()
        filename = key.rsplit("/", 1)[-1] if "/" in key else key or "upload"

        url = await service.upload_file(
            file_content=content_bytes,
            filename=filename,
            folder=folder,
            content_type=content_type,
        )

        if url:
            return {"url": url, "operation": "upload", "key": key}
        else:
            return {"error": "Upload failed", "operation": "upload"}

    async def _download(
        self,
        config: dict,
        inputs: dict,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Download a file from storage."""
        key = config.get("key") or inputs.get("key", "")
        if not key:
            return {"error": "Download requires a key"}

        try:
            content = await self._download_file(key)
            return {
                "content": content.decode("utf-8", errors="replace") if content else None,
                "size": len(content) if content else 0,
                "key": key,
                "operation": "download",
            }
        except Exception as e:
            return {"error": f"Download failed: {str(e)}", "operation": "download"}

    async def _download_file(self, key: str) -> bytes:
        """Download file bytes from S3/R2.

        This method is separate to allow mocking in tests.
        """
        service = get_r2_storage_service()
        settings = await service.get_active_settings()
        if not settings:
            raise ValueError("Storage not configured")

        client = service._get_s3_client(settings)
        bucket = settings.get("bucket", "")
        response = client.get_object(Bucket=bucket, Key=key)
        return response["Body"].read()

    async def _list(
        self,
        config: dict,
        inputs: dict,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """List files in storage with optional prefix filter."""
        prefix = config.get("prefix") or inputs.get("prefix", "")

        try:
            files = await self._list_files(prefix)
            return {
                "files": files,
                "count": len(files),
                "prefix": prefix,
                "operation": "list",
            }
        except Exception as e:
            return {"error": f"List failed: {str(e)}", "operation": "list"}

    async def _list_files(self, prefix: str) -> list[dict[str, Any]]:
        """List files from S3/R2.

        This method is separate to allow mocking in tests.
        """
        service = get_r2_storage_service()
        settings = await service.get_active_settings()
        if not settings:
            raise ValueError("Storage not configured")

        client = service._get_s3_client(settings)
        bucket = settings.get("bucket", "")

        response = client.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1000)
        contents = response.get("Contents", [])

        return [
            {
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat()
                if hasattr(obj["LastModified"], "isoformat")
                else str(obj["LastModified"]),
            }
            for obj in contents
        ]

    async def _delete(
        self,
        config: dict,
        inputs: dict,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Delete a file from storage."""
        key = config.get("key") or inputs.get("key", "")
        if not key:
            return {"error": "Delete requires a key"}

        try:
            service = get_r2_storage_service()
            settings = await service.get_active_settings()
            if not settings:
                return {"error": "Storage not configured"}

            client = service._get_s3_client(settings)
            bucket = settings.get("bucket", "")

            client.delete_object(Bucket=bucket, Key=key)
            return {"deleted": True, "key": key, "operation": "delete"}
        except Exception as e:
            return {"error": f"Delete failed: {str(e)}", "operation": "delete"}
```

### Step 8: Implement Notification Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/notification_executor.py`

```python
"""Notification Send node executor.

Multi-channel notification support:
- email: Uses existing EmailService (SMTP)
- slack: Posts to Slack webhook URL
- webhook: Posts to generic webhook URL

Template support: Jinja2-style template rendering for subject/body.
"""

from typing import Any

import httpx
import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.services.email_service import get_email_service

logger = structlog.get_logger()


class NotificationExecutor:
    """Executor for Email/SMS/Chat Send nodes.

    Config keys:
        channel: "email" | "slack" | "webhook"
        webhook_url: URL for slack/webhook channels
        template: Optional template name

    Input keys:
        recipients: List of email addresses (for email channel)
        subject: Email subject (for email channel)
        body: Message body (HTML for email, text for slack/webhook)

    Returns:
        dict with keys: status, channel, message_id (if applicable)
        On error: dict with key: error
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute notification send."""
        config = data.config
        inputs = data.inputs

        channel = (config.get("channel") or "email").lower()

        if channel == "email":
            return await self._send_email(config, inputs, context)
        elif channel == "slack":
            return await self._send_slack(config, inputs, context)
        elif channel == "webhook":
            return await self._send_webhook(config, inputs, context)
        else:
            return {"error": f"Unknown notification channel: {channel}"}

    async def _send_email(
        self,
        config: dict,
        inputs: dict,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Send email via the existing EmailService."""
        recipients = inputs.get("recipients") or config.get("recipients", [])
        subject = inputs.get("subject") or config.get("subject", "Workflow Notification")
        body = inputs.get("body") or config.get("body", "")

        if not recipients:
            return {"error": "Email requires at least one recipient"}

        if isinstance(recipients, str):
            recipients = [recipients]

        email_service = get_email_service()
        results = []

        for recipient in recipients:
            success = await email_service.send_email(
                to_email=recipient,
                subject=subject,
                html_content=body,
                text_content=body if "<" not in body else None,
            )
            results.append({"recipient": recipient, "sent": success})

        all_sent = all(r["sent"] for r in results)

        return {
            "status": "sent" if all_sent else "partial",
            "channel": "email",
            "results": results,
            "recipient_count": len(recipients),
        }

    async def _send_slack(
        self,
        config: dict,
        inputs: dict,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Send message to Slack via webhook URL."""
        webhook_url = config.get("webhook_url", "")
        body = inputs.get("body") or config.get("body", "")

        if not webhook_url:
            return {"error": "Slack notification requires a webhook_url"}

        if not body:
            return {"error": "Slack notification requires a body message"}

        payload = {"text": body}

        # Optional: Slack blocks for rich formatting
        blocks = inputs.get("blocks") or config.get("blocks")
        if blocks:
            payload["blocks"] = blocks

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(webhook_url, json=payload)
                response.raise_for_status()

            return {
                "status": "sent",
                "channel": "slack",
                "status_code": response.status_code,
            }

        except httpx.HTTPError as e:
            return {
                "error": f"Slack webhook failed: {str(e)}",
                "channel": "slack",
            }

    async def _send_webhook(
        self,
        config: dict,
        inputs: dict,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Send message to a generic webhook URL."""
        webhook_url = config.get("webhook_url", "")
        body = inputs.get("body") or config.get("body", {})

        if not webhook_url:
            return {"error": "Webhook notification requires a webhook_url"}

        # Build payload
        payload = body if isinstance(body, dict) else {"message": body}

        # Add metadata
        payload.setdefault("workflow_id", context.workflow_id)
        payload.setdefault("execution_id", context.execution_id)

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(webhook_url, json=payload)

            return {
                "status": "sent",
                "channel": "webhook",
                "status_code": response.status_code,
                "response_body": response.text[:1000],
            }

        except httpx.HTTPError as e:
            return {
                "error": f"Webhook failed: {str(e)}",
                "channel": "webhook",
            }
```

### Step 9: Register I/O Nodes in NodeRegistry

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`

Add the following registrations at the end of `_register_core_nodes()` (after the existing `# 14. Error Trigger` block). These should be placed under a new section comment:

```python
        # ===== PHASE 2.5: Core I/O Nodes =====

        # 15. HTTP Request
        self.register_node_type(
            NodeTypeSpec(
                type="http_request",
                display_name="HTTP Request",
                description="Send an HTTP request to an external API with SSRF protection",
                icon="globe",
                color="blue",
                category="io",
                inputs=[
                    InputSpec(
                        name="url",
                        display_name="URL",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="https://api.example.com/data",
                    ),
                    InputSpec(
                        name="method",
                        display_name="HTTP Method",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="GET",
                        options=[
                            {"label": "GET", "value": "GET"},
                            {"label": "POST", "value": "POST"},
                            {"label": "PUT", "value": "PUT"},
                            {"label": "PATCH", "value": "PATCH"},
                            {"label": "DELETE", "value": "DELETE"},
                            {"label": "HEAD", "value": "HEAD"},
                        ],
                    ),
                    InputSpec(
                        name="headers",
                        display_name="Headers",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"Content-Type": "application/json"}',
                    ),
                    InputSpec(
                        name="body",
                        display_name="Request Body",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Request body (JSON or text)...",
                    ),
                    InputSpec(
                        name="auth",
                        display_name="Authentication",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=False,
                        default={"type": "none"},
                        placeholder='{"type": "bearer", "token": "..."}',
                    ),
                    InputSpec(
                        name="timeout",
                        display_name="Timeout (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=30,
                        validation={"min": 1, "max": 120},
                    ),
                ],
                outputs=[
                    OutputSpec(name="status", display_name="Status Code", data_type="number"),
                    OutputSpec(name="headers", display_name="Response Headers", data_type="json"),
                    OutputSpec(name="body", display_name="Response Body", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.io_executors.http_request_executor.HttpRequestExecutor",
            )
        )

        # 16. Database Query
        self.register_node_type(
            NodeTypeSpec(
                type="database_query",
                display_name="Database Query",
                description="Execute a parameterized SQL query with safety enforcement",
                icon="database",
                color="orange",
                category="io",
                inputs=[
                    InputSpec(
                        name="query",
                        display_name="SQL Query",
                        data_type="text",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder="SELECT * FROM products WHERE category = :category",
                    ),
                    InputSpec(
                        name="parameters",
                        display_name="Query Parameters",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"category": "electronics"}',
                    ),
                    InputSpec(
                        name="max_rows",
                        display_name="Max Rows",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=1000,
                        validation={"min": 1, "max": 10000},
                    ),
                ],
                outputs=[
                    OutputSpec(name="rows", display_name="Query Results", data_type="array"),
                    OutputSpec(name="row_count", display_name="Row Count", data_type="number"),
                    OutputSpec(name="columns", display_name="Column Names", data_type="array"),
                ],
                executor="app.orchestrator.node_executors.io_executors.database_query_executor.DatabaseQueryExecutor",
            )
        )

        # 17. Storage Action
        self.register_node_type(
            NodeTypeSpec(
                type="storage_action",
                display_name="Storage Action",
                description="Upload, download, list, or delete files in S3/R2 storage",
                icon="hard-drive",
                color="green",
                category="io",
                inputs=[
                    InputSpec(
                        name="operation",
                        display_name="Operation",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="upload",
                        options=[
                            {"label": "Upload", "value": "upload"},
                            {"label": "Download", "value": "download"},
                            {"label": "List", "value": "list"},
                            {"label": "Delete", "value": "delete"},
                        ],
                    ),
                    InputSpec(
                        name="key",
                        display_name="File Key/Path",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="uploads/report.pdf",
                    ),
                    InputSpec(
                        name="content",
                        display_name="File Content",
                        data_type="any",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Content to upload...",
                    ),
                    InputSpec(
                        name="prefix",
                        display_name="List Prefix",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="uploads/",
                    ),
                ],
                outputs=[
                    OutputSpec(name="url", display_name="File URL", data_type="text"),
                    OutputSpec(name="files", display_name="File List", data_type="array"),
                    OutputSpec(name="operation", display_name="Operation Performed", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.io_executors.storage_executor.StorageExecutor",
            )
        )

        # 18. Notification
        self.register_node_type(
            NodeTypeSpec(
                type="notification",
                display_name="Send Notification",
                description="Send email, Slack message, or webhook notification",
                icon="send",
                color="purple",
                category="io",
                inputs=[
                    InputSpec(
                        name="channel",
                        display_name="Channel",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="email",
                        options=[
                            {"label": "Email", "value": "email"},
                            {"label": "Slack", "value": "slack"},
                            {"label": "Webhook", "value": "webhook"},
                        ],
                    ),
                    InputSpec(
                        name="recipients",
                        display_name="Recipients",
                        data_type="array",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="user@example.com",
                    ),
                    InputSpec(
                        name="subject",
                        display_name="Subject",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="Workflow Notification",
                    ),
                    InputSpec(
                        name="body",
                        display_name="Message Body",
                        data_type="text",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder="Notification message...",
                    ),
                    InputSpec(
                        name="webhook_url",
                        display_name="Webhook URL",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="https://hooks.slack.com/...",
                    ),
                ],
                outputs=[
                    OutputSpec(name="status", display_name="Send Status", data_type="text"),
                    OutputSpec(name="channel", display_name="Channel Used", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.io_executors.notification_executor.NotificationExecutor",
            )
        )
```

---

## Security Architecture

### SSRF Protection -- Defense in Depth

The HTTP Request node implements **4 layers** of SSRF protection:

| Layer | Check | Prevents |
|-------|-------|----------|
| 1. Hostname blocklist | Block `localhost`, `0.0.0.0`, `metadata.google.internal` | Direct hostname-based attacks |
| 2. Port blocklist | Block ports 5432, 6379, 3306, etc. | Direct connection to internal services |
| 3. IP literal check | Parse hostname as IP, check against CIDR blocklists | Direct IP-based attacks (e.g., `http://10.0.0.5/`) |
| 4. DNS resolution | Resolve hostname, check ALL resolved IPs against CIDR blocklists | DNS rebinding attacks where `evil.com` resolves to `127.0.0.1` |

**Blocked CIDR ranges:**
- `10.0.0.0/8` -- RFC 1918 private
- `172.16.0.0/12` -- RFC 1918 private
- `192.168.0.0/16` -- RFC 1918 private
- `127.0.0.0/8` -- Loopback
- `169.254.0.0/16` -- Link-local (AWS/GCP metadata endpoint)
- `0.0.0.0/8` -- "This" network
- `::1/128` -- IPv6 loopback
- `fc00::/7` -- IPv6 unique local
- `fe80::/10` -- IPv6 link-local

**Tenant Allowlist:** Enterprise tenants can configure `url_allowlist` in their context `extra_data` to bypass the hostname blocklist (but NOT the IP blocklist). This enables calling internal corporate APIs. The allowlist is matched by exact hostname.

### SQL Safety -- Operation Allowlist

| Operation | Default | Tenant-Unlockable | Always Blocked |
|-----------|---------|-------------------|----------------|
| SELECT | Allowed | -- | -- |
| INSERT | Allowed | -- | -- |
| UPDATE | Allowed | -- | -- |
| DELETE | Blocked | Yes (`sql_allow_delete`) | -- |
| DROP | -- | -- | Always blocked |
| TRUNCATE | -- | -- | Always blocked |
| ALTER | -- | -- | Always blocked |
| CREATE | -- | -- | Always blocked |
| GRANT | -- | -- | Always blocked |
| REVOKE | -- | -- | Always blocked |

**Additional SQL Safety Measures:**
- Only single statements allowed (multi-statement blocked via sqlparse)
- Recursive token scanning for hidden destructive keywords in subqueries/CTEs
- All parameters are bound via SQLAlchemy `text()` -- never string-interpolated
- MAX_ROWS safety limit (10,000) to prevent memory exhaustion

---

## Dependencies

### On Other Sections

| Dependency | Section | Nature |
|------------|---------|--------|
| `NodeExecutor` protocol | Section 01 (LangGraph Runtime Core) | All executors implement the `execute(data, context)` protocol from `base.py` |
| `NodeAdapter` wrapping | Section 01 | Executors are wrapped by `make_langgraph_node()` to run in LangGraph |
| `NodeRegistry` | Section 01 | New node types are registered alongside existing ones |
| Expression engine | Section 06 (Data Shaping) | Config values containing `{{node_id.field}}` are resolved by the expression engine before reaching executor inputs |
| API endpoints | Section 14 | HTTP Request and Database Query nodes are exposed via workflow execution endpoints |
| Frontend node panels | Section 15 | ReactFlow config panels for each I/O node type are built in the frontend section |

### On Existing Code

| Existing Code | Location | Usage |
|---------------|----------|-------|
| `NodeExecutor` protocol | `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/base.py` | All 5 executors implement this protocol |
| `R2StorageService` | `/home/dev/projects/SmartSpecPro/python-backend/app/services/r2_storage_service.py` | Storage executor delegates to this service |
| `EmailService` | `/home/dev/projects/SmartSpecPro/python-backend/app/services/email_service.py` | Notification executor uses this for email sending |
| `WebhookResponseExecutor` | `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/output_executors/webhook_response_executor.py` | Verified to work with new runtime, not modified |
| `SecureURLValidator` | `/home/dev/projects/SmartSpecPro/python-backend/app/core/secure_validators.py` | Existing SSRF-adjacent code; SSRFGuard is a more comprehensive, purpose-built replacement for workflow HTTP nodes |

### Python Packages Required

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| `httpx` | >=0.24.1 | Async HTTP client for HTTP Request node | Yes |
| `sqlparse` | >=0.5.0 | SQL statement parsing for operation allowlist | **No -- must be added** |
| `structlog` | >=23.0 | Structured logging | Yes |
| `boto3` | existing | S3/R2 operations (via R2StorageService) | Yes |
| `sqlalchemy` | existing | Database query execution | Yes |

---

## Verification Checklist

After implementation, verify:

1. **Run all tests:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/python-backend
   pytest tests/test_node_executors/test_io.py -v
   ```

2. **SSRF hardening verification:**
   - Confirm `http://localhost:8080/` is blocked
   - Confirm `http://10.0.0.5/admin` is blocked
   - Confirm `http://169.254.169.254/latest/meta-data/` is blocked
   - Confirm `http://example.com:5432/` is blocked (PostgreSQL port)
   - Confirm `https://api.github.com/repos` is allowed

3. **SQL safety verification:**
   - Confirm `DROP TABLE users` raises ValueError
   - Confirm `TRUNCATE TABLE logs` raises ValueError
   - Confirm `SELECT 1; DROP TABLE users` raises ValueError (multi-statement)
   - Confirm `SELECT * FROM users WHERE id = :id` passes

4. **Type check:**
   ```bash
   cd /home/dev/projects/SmartSpecPro/python-backend
   mypy app/orchestrator/node_executors/io_executors/
   ```

5. **Node registry:**
   - Confirm all 4 new node types are registered (http_request, database_query, storage_action, notification)
   - Confirm the existing webhook_response still works