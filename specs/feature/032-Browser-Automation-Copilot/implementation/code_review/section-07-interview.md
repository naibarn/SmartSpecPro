# Section 07 Code Review Interview

## Interview Decisions

### Q1: Capability check dead code — defer or fix now?
**User chose: Defer to Section 09**
Rationale: The MCP endpoint is proxy-token-protected. The capability check works when agency orchestrator passes node_config directly. Section 09 security audit will audit this.

### Q2: sandbox.exec_command fire-and-forget vs await results?
**User chose: Keep fire-and-forget**
Rationale: SandboxDispatcher is async by design. Caller can poll by job_id. Blocking for 300s in an MCP handler is undesirable.

## Auto-fixes Applied

### Fix 1: Timeout inconsistency (Review #5)
- **File**: `python-backend/app/mcp/browser_tools_mcp.py`
- **Issue**: httpx client timeout used unclamped `timeout_seconds + 10` while body sent clamped value
- **Fix**: Extract `effective_timeout = min(timeout_seconds, MAX_EXEC_TIMEOUT)` and use for both body and httpx timeout

### Fix 2: Missing connection_error test (Review #9)
- **File**: `python-backend/tests/test_mcp_browser_tools.py`
- **Issue**: No test covered the `httpx.ConnectError` -> `ToolError("connection_error")` path
- **Fix**: Added `test_connection_error_raises_tool_error` test

## Items Let Go

- #1 Command allowlist bypass: SandboxDispatcher provides real isolation
- #3 Domain validation: Delegated to Node route
- #4 ToolError coupling: Works fine, out of scope
- #7 parentReservationId unused: Forward-compatible per plan
- #8 Integration tests: Covered by Section 09
- #10 Patch fragility: Tests pass reliably
