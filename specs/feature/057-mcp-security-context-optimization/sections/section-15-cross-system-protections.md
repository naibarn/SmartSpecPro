# Section 15 — Cross-System Protection Layer

## Section ID
`section-15-cross-system-protections`

## Dependencies
- **section-01**: mcp_client.py SSRF fixes
- **section-12**: mcp_servers table

## Overview

Implements 11 cross-system protections identified in the deep review: MCP response wrapper (prompt injection defense), per-tool invocation counter, per-run and per-tenant rate limits, cross-boundary loop detection, guardrail integration for MCP params/responses, memory extraction protection, audit trail, credit tracking, typed error handling, health check task, and Celery worker constraint documentation.

See claude-plan.md Section 14 (14.1–14.11) for full specifications of each protection.

## Files to Create

| File | Path |
|------|------|
| mcp_rate_limiter.py | `python-backend/app/services/mcp_rate_limiter.py` |

## Files to Modify

| File | Path |
|------|------|
| agency_tools.py | `python-backend/app/services/agency_tools.py` |
| mcp_client.py | `python-backend/app/services/mcp_client.py` |
| long_term_memory.py | `python-backend/app/services/long_term_memory.py` |
| agency_trace_collector.py | `python-backend/app/services/agency_trace_collector.py` |
| agency_credits.py | `python-backend/app/services/agency_credits.py` |

---

## TDD Specification

```
# Test: MCP response wrapped with tags before entering agent context (14.1)
# Test: per-tool counter blocks after MAX_MCP_TOOL_CALLS_PER_TURN=10 (14.2)
# Test: per-run Redis counter blocks after MAX_MCP_CALLS_PER_RUN=50 (14.3)
# Test: per-tenant rate limit blocks at 200 calls/minute (14.3)
# Test: X-Agency-Run-Chain header propagated through MCP calls (14.4)
# Test: _SECRET_PATTERNS scrubbing applied to MCP tool params (14.5)
# Test: output guardrails applied to MCP responses (14.5)
# Test: memory_extraction_enabled defaults to false for MCP agents (14.6)
# Test: mcp_tool_call audit event emitted with correct fields (14.7)
# Test: TraceCollector records MCP tool calls in agencyRunTraces (14.7)
# Test: credit charged per MCP tool call (configurable per server) (14.8)
# Test: McpToolError raised on timeout (not success string) (14.9)
# Test: McpToolError raised on HTTP 429 with retryable=False (14.9)
# Test: health check task pings enabled servers every 5 minutes (14.10)

# Test: Celery workers call MCP via HTTP proxy, not direct client (14.11)
  - Import mcp_client_manager in Celery task context
  - Assert stdio connections are NOT available in worker process
  - Assert HTTP proxy endpoint /api/v1/mcp/tool/call is used instead

# Test: cross-boundary loop detected when Agency A→MCP→Agency B→MCP→Agency A (XSY-D1)
  - Set X-Agency-Run-Chain: "agency-1" on outbound MCP call
  - When MCP triggers agency-call back to agency-1
  - Assert loop detected and blocked before execution

# Test: tool_chain_depth prevents MCP→skill→agency infinite chain (XSY-C1)
  - Set tool_chain_depth=3 on ExecutionContext
  - MCP tool triggers builtin-skill-executor which triggers sub-run
  - Assert blocked at depth 3 with "max tool chain depth exceeded"

# Test: MCP response containing skill trigger syntax does NOT trigger skill (XSY-C1)
  - MCP tool returns text matching skill detection pattern
  - Assert skill_detect NOT called on [MCP_TOOL_RESULT]-wrapped content
  - Assert skill executor NOT triggered from MCP response

# Test: execution depth propagated through MCP boundary (XSY-D2)
  - Start execution at currentDepth=4 (near max of 5)
  - Agency calls MCP tool which triggers agency re-invocation
  - Assert new execution inherits accumulated depth (4+1=5)
  - Assert execution blocked if accumulated depth > MAX_DEPTH

# Test: tool response exceeding MAX_RESULT_BYTES truncated (M13)
  - MCP tool returns 500KB response
  - Assert response truncated to <=100KB before entering agent context
  - Assert truncation marker appended

# Test: rate limit keys cleared when tenant is disabled (NEW-05)
  - Set mcp:rate:{tenantId}:minute = 150 in Redis
  - Call on_tenant_disabled(tenantId)
  - Assert key deleted from Redis
  - Re-enable tenant, make MCP call
  - Assert call succeeds (counter starts from 0)
```

---

## Implementation Guidance

All 11 protections are fully specified in claude-plan.md Section 14. Key implementation notes:

### 14.1 Response Wrapper
In the tool bridge `run_func` closure, wrap the MCP response:
```python
result = await mcp_client.call_tool(...)
wrapped = f"[MCP_TOOL_RESULT: mcp.{server_slug}/{tool_name}]\n{result}\n[/MCP_TOOL_RESULT]"
```

### 14.2 Per-Tool Counter
```python
# In the run_func closure:
_call_counts[tool_name] = _call_counts.get(tool_name, 0) + 1
if _call_counts[tool_name] > MAX_MCP_TOOL_CALLS_PER_TURN:
    return "[MCP ERROR] Tool call limit exceeded for this turn"
```

### 14.3 Rate Limits
Use existing `distributedRateLimit` Redis pattern for per-tenant limit. Per-run counter via simple Redis INCR with TTL.

**NEW-05 fix — cleanup on tenant disable:** When a tenant is disabled, delete their MCP rate limit keys to prevent stale counters from blocking a re-enabled tenant:

```python
# In tenant_service.py disable_tenant() or equivalent:
async def on_tenant_disabled(tenant_id: int):
    await redis.delete(f"mcp:rate:{tenant_id}:minute")
    await redis.delete(f"mcp:rate:{tenant_id}:run:*")  # pattern delete
```

### 14.4 Cross-Boundary Loop Detection

The `X-Agency-Run-Chain` header carries a comma-separated list of agency IDs that have been visited in the current call chain. On each outbound MCP call that triggers an agency-call:

1. Read existing chain from context: `chain = ctx.get("agency_run_chain", [])`
2. If the target agency ID is already in the chain → **block** (circular call detected)
3. Otherwise, append current agency ID and propagate: `chain + [current_agency_id]`
4. Max chain length: 5 (prevents long transitive chains even without cycles)

The header is NOT trusted from external MCP servers — it is only set/read within SSP's internal agency-call dispatch (`agency_call_tool.py`). External MCP servers cannot inject this header to bypass the check.

### 14.5 Guardrail Integration

Before outbound MCP call:
```python
from app.services.agency_trace_collector import _SECRET_PATTERNS
scrubbed_params = scrub_secrets(tool_params, _SECRET_PATTERNS)
```

After receiving MCP response (before returning to agent):
```python
if agent_guardrails and agent_guardrails.output_rules:
    violation = await evaluate_guardrails(mcp_response, agent_guardrails.output_rules)
    if violation:
        return f"[MCP_GUARDRAIL_BLOCKED] Response blocked by guardrail: {violation.rule_name}"
```

### 14.6 Memory Protection

In `long_term_memory.py` `extract_and_store_memories()`:
```python
if agent_has_mcp_tools and not agent_config.get("memory_extraction_enabled", False):
    logger.info("memory_extraction_skipped", reason="agent_has_mcp_tools")
    return  # Skip extraction entirely
```

### 14.8 Credit Tracking

```python
# In the run_func closure, after successful call_tool:
await credit_manager.charge_mcp_call(
    tenant_id=ctx.tenant_id,
    server_id=mcp_server.id,
    credit_amount=mcp_server.credit_per_call,
    run_id=ctx.run_id,
)
```

### 14.9 Typed Errors
```python
class McpToolError(Exception):
    def __init__(self, error_type: str, retryable: bool = False):
        self.error_type = error_type
        self.retryable = retryable
```

### Security Considerations

1. **Prompt injection defense**: The `[MCP_TOOL_RESULT]` wrapper prevents MCP responses from being interpreted as agent instructions
2. **Rate limiting defense-in-depth**: Three levels (per-tool-per-turn, per-run, per-tenant) prevent runaway costs from any single vector
3. **Guardrail bypass prevention**: Without MCP param scrubbing, PII could be sent to external servers even when input guardrails are configured

---

## Actual Implementation Notes

### Files Created
- **Created**: `python-backend/app/services/mcp_rate_limiter.py` — Standalone protection module
- **Created**: `python-backend/tests/unit/test_mcp_rate_limiter.py` — 32 tests

### Protections Implemented (as composable functions/classes)
1. **Response wrapper** (`wrap_mcp_response`) — boundary tags [MCP_TOOL_RESULT]
2. **Per-tool counter** (`PerTurnCounter`) — in-process, per execution
3. **Per-run rate limit** (`check_run_rate_limit`) — Redis INCR with TTL
4. **Per-tenant rate limit** (`check_tenant_rate_limit`) — Redis INCR with 60s window
5. **Tenant disable cleanup** (`on_tenant_disabled`) — deletes rate limit keys
6. **Loop detection** (`check_loop_detection`) — circular chain + max depth
7. **Tool chain depth** (`check_tool_chain_depth`) — prevents infinite nesting
8. **Response truncation** (`truncate_response`) — 100KB limit with marker
9. **Param scrubbing** (`scrub_params`) — regex-based secret removal
10. **Typed errors** (`McpToolError`) — error_type + retryable flag
11. **Memory protection guard** — tested as behavior pattern (config flag check)

### Deferred to Wiring (section-17)
- Integration into agency_tools.py `_make_run_func` closure
- Health check Celery task (14.10)
- Credit tracking per call (14.8)
- Audit trail events (14.7)
- Celery worker constraints (14.11)

### Test Count
32 tests covering all protection functions with edge cases.
