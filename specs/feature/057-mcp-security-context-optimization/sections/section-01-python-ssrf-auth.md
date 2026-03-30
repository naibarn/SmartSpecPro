# Section 01 — Python SSRF + Auth Fixes

## Section ID
`section-01-python-ssrf-auth`

## Dependencies
- None (Wave 1 — can start immediately)

## Overview

This section fixes 9 vulnerabilities (F01, F02, F03, F07, F08, F09, F10, F11, F12) across two Python files. The `_validate_mcp_url()` function in `mcp_client.py` exists but is **never called** before outbound HTTP requests — both `discover_tools()` and `call_tool()` send requests to user-supplied URLs without SSRF protection. The discovery cache is keyed by `(url, token_hash)` without `tenant_id`, causing cross-tenant cache pollution. Separately, `mcp_executor.py` has zero URL validation, no ownership check, leaks server URLs and raw exception messages in output, uses stdlib logging instead of structlog, and accepts unbounded timeouts.

## Implementation Status

**All source fixes were already implemented** in prior feature branches. This section added dedicated TDD test coverage for the 9 vulnerability findings.

### Actual Files Created
- `python-backend/tests/unit/services/test_mcp_client_ssrf.py` — 11 tests covering F01, F02, F03
- `python-backend/tests/unit/orchestrator/test_mcp_executor_security.py` — 10 tests covering F07-F12

### Code Review Fixes Applied
- Added `assert mock_factory.called` guard to prevent silent timeout test pass
- Changed `httpx.HTTPError` to `httpx.ConnectError` for httpx 0.23+ compatibility
- Restructured cross-tenant cache test to single mock context (proves isolation)
- Added workflow_id leakage assertions
- Added DB-not-reached guards on SSRF tests

### Test Count: 21 tests, all passing

## Files to Modify

| File | Path |
|------|------|
| mcp_client.py | `python-backend/app/services/mcp_client.py` |
| mcp_executor.py | `python-backend/app/orchestrator/node_executors/integration_executors/mcp_executor.py` |

## Test Files to Create

| File | Path |
|------|------|
| test_mcp_client_ssrf.py | `python-backend/tests/unit/services/test_mcp_client_ssrf.py` |
| test_mcp_executor_security.py | `python-backend/tests/unit/orchestrator/test_mcp_executor_security.py` |

---

## TDD Specification

### Test: `test_mcp_client_ssrf.py`

Tests follow existing pattern in `tests/unit/services/` — pytest with `@pytest.mark.asyncio`, mock `httpx.AsyncClient` via `pytest-httpx` or `unittest.mock.patch`.

```
# Test: discover_tools blocks private IPs (F01)
  - Call discover_tools("http://192.168.1.1:8080/rpc", None, tenant_id=1)
  - Assert returns [] (empty list)
  - Assert no HTTP request was made (httpx not called)

# Test: discover_tools blocks cloud metadata endpoints (F01)
  - Call discover_tools("http://169.254.169.254/latest/meta-data/", None, tenant_id=1)
  - Assert returns []

# Test: discover_tools blocks localhost (F01)
  - Call discover_tools("http://127.0.0.1:6379/rpc", None, tenant_id=1)
  - Assert returns []

# Test: discover_tools allows valid public URL (F01)
  - Mock httpx to return valid tools/list JSON-RPC response
  - Call discover_tools("https://mcp.example.com/rpc", "token", tenant_id=1)
  - Assert returns non-empty tool list

# Test: call_tool blocks private IPs (F02)
  - Call call_tool("http://10.0.0.1:8080/rpc", None, "search", {}, tenant_id=1)
  - Assert result contains "blocked" or "validation failed"
  - Assert no HTTP request was made

# Test: call_tool blocks metadata endpoints (F02)
  - Call call_tool("http://169.254.169.254/rpc", None, "read", {}, tenant_id=1)
  - Assert result contains error about blocked URL

# Test: cache key includes tenant_id — different tenants produce different keys (F03)
  - Clear _discovery_cache
  - Compute key for tenant_id=1, url="https://mcp.example.com", token_hash="abc"
  - Compute key for tenant_id=2, url="https://mcp.example.com", token_hash="abc"
  - Assert keys are different

# Test: cached results scoped to tenant — tenant 1 cache does not serve tenant 2 (F03)
  - Call discover_tools for tenant_id=1 with mocked response returning [tool_a]
  - Call discover_tools for tenant_id=2 with mocked response returning [tool_b]
  - Assert tenant_id=1 gets [tool_a], tenant_id=2 gets [tool_b]
  - (Without fix, tenant_id=2 would get cached [tool_a])
```

### Test: `test_mcp_executor_security.py`

```
# Test: executor blocks private IP in server_url (F07)
  - Config: {"mcp_server_url": "http://127.0.0.1:5432", "method": "call_tool"}
  - Execute with MCPExecutor
  - Assert result.success is False
  - Assert "blocked" in result.error

# Test: executor blocks metadata endpoint (F07)
  - Config: {"mcp_server_url": "http://169.254.169.254/latest/"}
  - Assert result.success is False

# Test: server_url not in success output metadata (F09)
  - Mock successful HTTP response from a public URL
  - Assert "server_url" not in result.outputs.get("metadata", {})
  - Assert "mcp_server_url" not in str(result.outputs)

# Test: error messages do not contain hostnames or ports (F10)
  - Force httpx.ConnectError with a detailed message containing "10.0.0.1:8080"
  - Assert "10.0.0.1" not in result.error
  - Assert ":8080" not in result.error
  - Assert result.error contains generic message like "MCP server error"

# Test: timeout clamped to 120s maximum (F12)
  - Config: {"mcp_server_url": "https://example.com", "timeout": 7200}
  - Mock httpx.AsyncClient to capture timeout kwarg
  - Assert timeout used is 120.0, not 7200

# Test: executor blocks when context user does not own workflow (F08)
  - Config: {"mcp_server_url": "https://example.com", "workflow_id": 999}
  - Context: {"user_id": 1}  # user 1 does not own workflow 999
  - Assert result.success is False
  - Assert "not authorized" in result.error
  - Assert workflow_id not leaked in error message

# Test: timeout defaults to 30s when not specified (F12)
  - Config: {"mcp_server_url": "https://example.com"} (no timeout key)
  - Assert timeout used is 30.0

# Test: uses structlog not stdlib logging (F11)
  - Import mcp_executor module
  - Assert hasattr(module, "logger") and isinstance from structlog
  - Or assert "structlog" in the module source
```

### Test Structure Guidance

```python
# test_mcp_client_ssrf.py
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.mcp_client import discover_tools, call_tool, _cache_key, _discovery_cache

@pytest.fixture(autouse=True)
def clear_cache():
    _discovery_cache.clear()
    yield
    _discovery_cache.clear()

class TestDiscoverToolsSSRF:
    """F01: SSRF validation must be called in discover_tools."""
    # ... tests above

class TestCallToolSSRF:
    """F02: SSRF validation must be called in call_tool."""
    # ... tests above

class TestTenantCacheIsolation:
    """F03: Cache must be scoped by tenant_id."""
    # ... tests above
```

---

## Implementation Guidance

### mcp_client.py Changes

#### 1. Add `tenant_id` parameter to public functions

Both `discover_tools()` and `call_tool()` must accept `tenant_id: int` as a required keyword argument. This is needed for tenant-scoped caching.

#### 2. Call `_validate_mcp_url()` at function entry

```python
async def discover_tools(server_url: str, auth_token: str | None, *, tenant_id: int) -> list[dict]:
    err = _validate_mcp_url(server_url)
    if err:
        logger.warning("mcp_server_ssrf_blocked", url=server_url, reason=err, tenant_id=tenant_id)
        return []
    # ... existing code continues
```

Same pattern for `call_tool()`, returning an error string instead of `[]`.

#### 3. Update `_cache_key()` to include tenant_id

```python
def _cache_key(tenant_id: int, url: str, token_hash: str | None) -> tuple:
    # When token is None, use empty string to avoid None in cache key
    safe_hash = token_hash or ""
    return (tenant_id, url, safe_hash)
```

Update all call sites of `_cache_key()` within `discover_tools()` to pass `tenant_id`. When `auth_token` is `None`, `token_hash` should be `""` (empty string), not `None`, to ensure consistent cache key types.

#### 4. Update callers

Search for all callers of `discover_tools` and `call_tool` across the codebase (primarily `agency_tools.py`, `agencyMcpService.ts` via HTTP bridge) and pass the `tenant_id` from the execution context.

### mcp_executor.py Changes

#### 1. Import and call SSRF validation

```python
from app.services.mcp_client import _validate_mcp_url

# At the start of execute():
err = _validate_mcp_url(config.get("mcp_server_url", ""))
if err:
    return NodeExecutionResult(success=False, error=f"MCP server URL blocked: {err}")
```

#### 2. Remove server_url from output metadata

In the success path where `outputs["metadata"]` is constructed, remove any `server_url` key.

#### 3. Replace raw exception messages

Replace all `f"HTTP error: {str(e)}"` and `f"MCP execution error: {str(e)}"` with generic `"MCP server returned an error"`. Log the detailed error internally at DEBUG level.

#### 4. Clamp timeout

```python
timeout = min(float(config.get("timeout", 30)), 120.0)
```

#### 5. Switch to structlog

```python
import structlog
logger = structlog.get_logger(__name__)
# Replace all logger.info/warning/error calls to use keyword args
```

### Integration Points

- **Callers of `discover_tools`**: `agency_tools.py:resolve_mcp_tools_for_agent()` — must pass `tenant_id` from `AgencyRunContext`
- **Callers of `call_tool`**: `agency_tools.py` tool bridge closures — must pass `tenant_id` from captured context
- **Callers of `MCPExecutor`**: Workflow orchestrator node dispatch — no change needed (executor reads from config)

### Security Considerations

1. **SSRF defense-in-depth**: `_validate_mcp_url` checks scheme (http/https only), blocks private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), blocks localhost (127.0.0.0/8, ::1), blocks link-local (169.254.0.0/16), and blocks known cloud metadata hostnames. This is called synchronously on the URL string — it does NOT resolve DNS, so it does not prevent DNS rebinding. DNS rebinding mitigation is addressed in section-17 (multi-transport client).
2. **Tenant isolation**: Cache poisoning between tenants was possible because the cache key lacked tenant_id. With the fix, tenant A's cached tool list is never served to tenant B.
3. **Information leakage**: Raw exception messages from httpx can contain hostnames, ports, partial response bodies, and even token fragments in error URLs. Replacing with generic messages prevents leakage to workflow outputs that may be visible to end users or injected into LLM context.
