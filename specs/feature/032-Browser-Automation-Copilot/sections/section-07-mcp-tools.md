# Section 07: MCP Tool Registry for Agencies

## Overview

This section registers two new tools -- `browser.execute_actions` and `sandbox.exec_command` -- in the internal MCP router (`python-backend/app/api/internal_mcp.py`), and wires them for use by agency workflow nodes. The existing MCP router already handles Google Drive and OneDrive tools via the same pattern (tool definitions + handler functions + proxy token auth). This section extends that infrastructure with browser and sandbox capabilities.

## Dependencies

- **Section 04 (Copilot LLM Calls)**: The `browser.execute_actions` tool dispatches to the Node browser tool route, which depends on the LLMGatewayClient being functional for credit attribution.
- **Section 05 (Browser Runner)**: The browser tool route at `/api/internal/tools/browser` must be wired to real Playwright execution before MCP dispatch is useful.

## Background Context

### Current MCP Architecture

The internal MCP router lives at `python-backend/app/api/internal_mcp.py` and exposes two endpoints:

- `GET /api/internal/mcp/tools` -- lists available tools (currently Google Drive + OneDrive)
- `POST /api/internal/mcp/tools/call` -- executes a named tool

All requests require `X-Proxy-Token` header (validated via `SMARTSPEC_PROXY_TOKEN` env var, timing-safe comparison).

Tool handlers are merged into a single `TOOL_HANDLERS` dict from separate MCP modules. The `call_tool` endpoint looks up the handler by name, injects `user_id` and `tenant_id` from the request body, and returns MCP-format content blocks.

### Auth Token Distinction

Two internal tokens exist in the Python backend:

- `SMARTSPEC_PROXY_TOKEN` (`X-Proxy-Token`): Used for Node-to-Python MCP calls. This is what the MCP router checks.
- `SMARTSPEC_WEB_GATEWAY_TOKEN` (`X-Internal-Token`): Used for Python-to-Node calls (e.g., calling `/api/internal/tools/browser`).

When the MCP router dispatches `browser.execute_actions` to the Node browser tool route, it must use `X-Internal-Token` with `SMARTSPEC_WEB_GATEWAY_TOKEN`.

### Agency Integration

Agency workflows use node executors in `python-backend/app/orchestrator/node_executors/`. The `agency_executor.py` delegates to `AgencyService`. When an agency node's tool list includes `browser.execute_actions`, the agency orchestrator calls the MCP endpoint, which then dispatches to the Node browser tool route.

The `persona_prefix` injection guard in `python-backend/app/api/agencies.py` sanitizes persona prefixes to prevent prompt injection. Tool inputs must NOT bypass this guard.

---

## Tests

**File**: `python-backend/tests/test_mcp_browser_tools.py`

```python
"""Tests for browser and sandbox MCP tool registration and dispatch."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import Response

# === Tool registration ===

# Test: GET /tools includes browser.execute_actions in response
# - Call the list_tools endpoint with valid proxy token
# - Assert "browser.execute_actions" appears in the returned tools list
# - Verify the tool's inputSchema includes allowed_domains, actions, session_id, timeout_seconds

# Test: GET /tools includes sandbox.exec_command in response
# - Call the list_tools endpoint with valid proxy token
# - Assert "sandbox.exec_command" appears in the returned tools list
# - Verify the tool's inputSchema includes command, working_dir, timeout_seconds

# Test: tool schemas match expected parameter definitions
# - For browser.execute_actions: actions (required array), allowed_domains (required array),
#   session_id (optional string), timeout_seconds (optional int, default 300)
# - For sandbox.exec_command: command (required string), working_dir (optional string),
#   timeout_seconds (optional int, default 300)

# === browser.execute_actions dispatch ===

# Test: tool call dispatches to Node browser tool route
# - Mock httpx POST to http://localhost:3000/api/internal/tools/browser
# - Call browser.execute_actions via call_tool endpoint
# - Verify the mock was called with correct JSON body (actions, allowedDomains, userId, tenantId)

# Test: X-Internal-Token header sent to Node route
# - Mock httpx and capture headers
# - Verify X-Internal-Token is set to SMARTSPEC_WEB_GATEWAY_TOKEN value

# Test: user_id/tenant_id propagated from agency context
# - Call with user_id=42, tenant_id="tenant-abc"
# - Verify these values appear in the dispatched request body

# Test: missing proxy token -> 401
# - Call call_tool without X-Proxy-Token header
# - Assert 401 response

# === sandbox.exec_command hardening ===

# Test: allowed command (python) -> executes
# - Mock SandboxDispatcher.dispatch
# - Call sandbox.exec_command with command="python script.py"
# - Verify dispatch was called

# Test: disallowed command (rm, curl to non-allowed host) -> rejected
# - Call sandbox.exec_command with command="rm -rf /"
# - Assert error response with code "command_not_allowed"
# - Call with command="curl http://evil.com"
# - Assert same rejection

# Test: max execution time enforced (300s)
# - Call sandbox.exec_command with timeout_seconds=999
# - Verify the dispatched timeout is clamped to MAX_EXEC_TIMEOUT (300)

# Test: not callable without sandbox_command capability in node config
# - Call sandbox.exec_command without the capability flag
# - Assert error response with code "capability_required"

# === Agency integration ===

# Test: persona_prefix injection guard not bypassed by tool inputs
# - Call browser.execute_actions with actions containing strings that look like
#   prompt injection (e.g., "IGNORE ALL PREVIOUS INSTRUCTIONS")
# - Verify the action strings are passed through as-is to the browser tool
#   (the browser treats them as action parameters, NOT as prompts)
# - Verify persona_prefix sanitization still applies at the agency level
```

---

## Implementation Details

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/mcp/browser_tools_mcp.py` | **Create** | Browser + sandbox tool definitions and handler functions |
| `python-backend/app/api/internal_mcp.py` | **Modify** | Import and merge new tool handlers into `TOOL_HANDLERS` |
| `apps/web/server/routes/browserTool.ts` | **Minor modify** | Accept MCP-originated context headers |
| `python-backend/tests/test_mcp_browser_tools.py` | **Create** | Tests as specified above |

### 7.1: Create `browser_tools_mcp.py`

**File**: `python-backend/app/mcp/browser_tools_mcp.py`

This module follows the exact pattern of `google_drive_mcp.py` and `onedrive_mcp.py`: define tool schemas as dicts, implement async handler functions, export `TOOL_HANDLERS` dict and tool definition lists.

#### Tool Definitions

Two tool definition dicts (matching MCP tool schema format):

**`browser.execute_actions`**:
```python
{
    "name": "browser.execute_actions",
    "description": "Execute browser automation actions on allowed domains.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "allowed_domains": {"type": "array", "items": {"type": "string"}, "description": "Domains the browser is allowed to visit"},
            "actions": {"type": "array", "items": {"type": "object"}, "description": "List of browser actions (navigate, click, fill, screenshot, extract_text)"},
            "session_id": {"type": "string", "description": "Optional session ID for continuity"},
            "timeout_seconds": {"type": "integer", "default": 300, "description": "Max execution time in seconds"},
        },
        "required": ["allowed_domains", "actions"],
    },
}
```

**`sandbox.exec_command`**:
```python
{
    "name": "sandbox.exec_command",
    "description": "Execute an approved command in a sandboxed environment.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "Command to execute (must be in allowlist)"},
            "working_dir": {"type": "string", "description": "Working directory for the command"},
            "timeout_seconds": {"type": "integer", "default": 300, "description": "Max execution time"},
        },
        "required": ["command"],
    },
}
```

#### Handler: `handle_browser_execute_actions`

```python
async def handle_browser_execute_actions(
    allowed_domains: list[str],
    actions: list[dict],
    user_id: int,
    tenant_id: str,
    session_id: str | None = None,
    timeout_seconds: int = 300,
    **kwargs,
) -> dict:
    """Dispatch browser actions to the Node browser tool route.

    Calls POST http://localhost:3000/api/internal/tools/browser
    with X-Internal-Token header (SMARTSPEC_WEB_GATEWAY_TOKEN).
    Propagates user_id and tenant_id for credit attribution.
    Returns the Node route's response (screenshots, extracted data, cost).
    """
```

Key implementation points:
- Use `httpx.AsyncClient` to POST to `{SMARTSPEC_WEB_URL}/api/internal/tools/browser`
- Set `X-Internal-Token` header to `settings.SMARTSPEC_WEB_GATEWAY_TOKEN`
- Body: `{"userId": user_id, "tenantId": tenant_id, "actions": actions, "allowedDomains": allowed_domains, "timeout": timeout_seconds}`
- If `session_id` provided, include it in the body
- Timeout: `timeout_seconds + 10` (buffer for network overhead)
- On HTTP error: raise `ToolError` with appropriate code
- On timeout: raise `ToolError("timeout", "Browser execution timed out")`

#### Handler: `handle_sandbox_exec_command`

```python
ALLOWED_COMMANDS = {"python", "python3", "node", "npm", "pip"}
MAX_EXEC_TIMEOUT = 300

async def handle_sandbox_exec_command(
    command: str,
    user_id: int,
    tenant_id: str,
    working_dir: str | None = None,
    timeout_seconds: int = 300,
    node_config: dict | None = None,
    **kwargs,
) -> dict:
    """Execute an approved command in the sandbox.

    Only pre-approved commands are allowed. Requires sandbox_command
    capability in the calling node's config.
    """
```

Key implementation points:
- **Capability check**: If `node_config` is provided, verify `node_config.get("capabilities", {}).get("sandbox_command")` is truthy. If not, raise `ToolError("capability_required", "...")`.
- **Command allowlist**: Parse the command string, extract the base command (first word/token). Check against `ALLOWED_COMMANDS`. Reject if not in the list with `ToolError("command_not_allowed", "...")`.
- **Timeout clamping**: `min(timeout_seconds, MAX_EXEC_TIMEOUT)`
- **Dispatch**: Use `SandboxDispatcher.dispatch()` with `execution_mode="command"`, `feature_type="connector"`
- **Wait for result**: Await job completion, return `{"stdout": ..., "stderr": ..., "exit_code": ...}`
- **Audit logging**: Log all invocations (command, user_id, tenant_id, exit_code) via structured logger

#### Export

```python
BROWSER_TOOLS = [BROWSER_EXECUTE_ACTIONS_TOOL, SANDBOX_EXEC_COMMAND_TOOL]
TOOL_HANDLERS = {
    "browser.execute_actions": handle_browser_execute_actions,
    "sandbox.exec_command": handle_sandbox_exec_command,
}
```

### 7.2: Modify `internal_mcp.py`

Add the import and merge the new handlers:

```python
from app.mcp.browser_tools_mcp import (
    BROWSER_TOOLS,
    TOOL_HANDLERS as BROWSER_HANDLERS,
)

# Merge tool handlers from all providers
TOOL_HANDLERS = {**GDRIVE_HANDLERS, **ONEDRIVE_HANDLERS, **BROWSER_HANDLERS}
```

Update the `list_tools` endpoint to always include browser tools (they do not require OAuth connections like Drive/OneDrive):

```python
@router.get("/tools")
async def list_tools(user_id=None, x_proxy_token=None):
    await _verify_proxy_token(x_proxy_token)
    tools = []
    # ... existing OAuth-gated tools ...
    
    # Browser tools are always available (no OAuth needed)
    tools.extend(BROWSER_TOOLS)
    
    return {"tools": tools}
```

### 7.3: Minor Modification to `browserTool.ts`

The existing Node browser tool route at `/api/internal/tools/browser` (`apps/web/server/routes/browserTool.ts`) already accepts `X-Internal-Token` and extracts `userId`/`tenantId` from the request body. No structural changes are needed -- the MCP handler constructs the request body in the same format the route already expects.

However, one minor addition is needed: the route should accept an optional `parentReservationId` field from the request body (for credit coordination with Section 08). This is a forward-compatible change:

```typescript
// In the destructured request body, add:
const { userId, tenantId, actions, allowedDomains = [], timeout = 300, parentReservationId } = req.body;
```

This field is used by the credit flow coordination (Section 08) but the route should accept it now to avoid a breaking change later.

### 7.4: Agency Integration Considerations

When an agency workflow node invokes a browser or sandbox tool:

1. The agency orchestrator calls the MCP `call_tool` endpoint
2. The MCP router dispatches to the appropriate handler
3. For `browser.execute_actions`: the handler calls the Node browser tool route, which handles credit deduction and concurrency
4. For `sandbox.exec_command`: the handler calls `SandboxDispatcher` directly

The `persona_prefix` injection guard operates at the agency level (in `python-backend/app/api/agencies.py`). Tool inputs are treated as data parameters, not as prompts -- they are never concatenated with `persona_prefix` or system instructions. The handler functions receive `actions` as structured data and pass them through without interpretation.

To ensure safety, the `handle_sandbox_exec_command` handler validates the command against an allowlist before dispatching. The `handle_browser_execute_actions` handler delegates all security (domain validation, SSRF defense, concurrency limits) to the Node browser tool route.

---

## Rollback Strategy

Remove the browser tool handlers from `TOOL_HANDLERS` dict in `internal_mcp.py` by removing the `BROWSER_HANDLERS` import and merge. The `browser_tools_mcp.py` file can remain on disk without effect. No database changes are involved in this section.

---

## Verification Checklist

1. `GET /api/internal/mcp/tools` returns `browser.execute_actions` and `sandbox.exec_command` in the tools list
2. `POST /api/internal/mcp/tools/call` with `name: "browser.execute_actions"` dispatches to Node route
3. `X-Internal-Token` is sent (not `X-Proxy-Token`) when calling Node route
4. `sandbox.exec_command` rejects disallowed commands (`rm`, `curl` to non-allowed hosts)
5. `sandbox.exec_command` rejects calls without `sandbox_command` capability
6. Missing `X-Proxy-Token` on MCP endpoints returns 401
7. All existing MCP tests (Google Drive, OneDrive) continue passing
8. `pytest python-backend/tests/test_mcp_browser_tools.py` passes