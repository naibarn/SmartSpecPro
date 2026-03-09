# Section 07 Code Review

## Critical Issues

### 1. SECURITY: Command Allowlist Bypass via Arguments (HIGH)
The allowlist checks only the base command name (`python`), not arguments. `python -c 'import os; os.system("rm -rf /")'` passes. However, `SandboxDispatcher` delegates to sandboxed execution (OpenSandbox) which provides isolation. The allowlist is a first gate, not the sole defense.

### 2. Capability Check is Dead Code in Production (MEDIUM-HIGH)
`node_config` is never passed from `call_tool` endpoint since `ToolCallRequest` has no such field. The capability check only fires when `node_config is not None`, making it effectively dead code in the MCP path.

### 3. No Input Validation on `allowed_domains` (MEDIUM)
Domains passed through from MCP arguments without validation. Node route validates but allows substring matching.

## Moderate Issues

### 4. ToolError Imported from google_drive_mcp (MEDIUM)
Fragile coupling. Should be in shared module.

### 5. Timeout Inconsistency (MEDIUM)
Body sends clamped timeout but httpx client uses unclamped `timeout_seconds + 10`.

### 6. sandbox.exec_command Returns job_id, Not Results (MEDIUM)
Plan says await results, implementation is fire-and-forget.

### 7. parentReservationId Destructured But Unused (LOW)
Forward-compatible per plan but currently dead code.

## Test Gaps

### 8. No Integration Test with FastAPI Endpoints (MEDIUM)
### 9. No Test for connection_error Case (LOW)
### 10. Sandbox Patch Fragility (LOW)
