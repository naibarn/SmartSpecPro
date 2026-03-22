Now I have everything I need. Here is the section content:

# Section 21: Error Handler & Data Transform Nodes

## Section ID
`section-21-error-handler-data-transform`

## Dependencies

| Section | What this section uses from it |
|---------|-------------------------------|
| section-01-database-migration | `agencyAgents.nodeType` enum extended with `error_handler` and `data_transform`; `nodeConfig` JSONB stores `ErrorHandlerConfig` / `DataTransformConfig` |
| section-09-sse-streaming-backend | `AgencyEventEmitter` for publishing `error_handled` SSE events during retry/fallback/skip |

## Blocked By
- section-22-ai-creator-v2 (needs all 14 node types including these two)

## Overview

This section introduces two new node types to the agency graph:

1. **`error_handler`** -- A "listener" node that watches other nodes. When a watched node throws an error, the error handler intercepts it and applies a strategy: retry with exponential backoff, redirect to a fallback node, skip with a message, or terminate the run. It is NOT executed in normal graph traversal order; instead, the orchestrator builds an `error_handler_map` at graph load time and wraps watched nodes in try/except.

2. **`data_transform`** -- A normal sequential node that transforms the previous node's output. Supports three modes: JSONPath extraction (`jsonpath_ng`), Mustache template rendering (`pystache` with HTML escaping), and array filtering by condition.

Both nodes require changes across four layers: Zod validation (tRPC), Python orchestrator handlers, frontend node cards, and property panel config forms.

---

## Files to Create or Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` | **MODIFY** | Add `error_handler_map` construction, wrap `_execute_node` with error interception, add `_handle_error` and `_execute_data_transform` handlers |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_error_handler.py` | **CREATE** | Isolated module: `scrub_error_payload()`, `execute_retry()`, `execute_fallback()`, `execute_skip()` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_data_transform.py` | **CREATE** | Isolated module: `apply_jsonpath()`, `apply_template()`, `apply_filter()` |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_error_handler.py` | **CREATE** | pytest tests for error handler strategies |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_data_transform.py` | **CREATE** | pytest tests for data transform modes |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` | **MODIFY** | Extend `nodeType` z.enum to include `error_handler` and `data_transform`; add `.superRefine()` rules |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/types.ts` | **MODIFY** | Add `"error_handler" | "data_transform"` to `AgencyNodeType` union |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx` | **MODIFY** | Add switch cases for new node types |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/ErrorHandlerNodeCard.tsx` | **CREATE** | Red card with ShieldAlert icon, strategy badge, watched node count |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/DataTransformNodeCard.tsx` | **CREATE** | Slate card with Braces icon, transform mode badge |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx` | **MODIFY** | Add config forms for error_handler and data_transform nodeConfig |

---

## TDD Test Specifications

### Python Tests: `test_agency_error_handler.py`

All tests use `pytest` with markers `@pytest.mark.unit` and `@pytest.mark.agency`.

```
Test: error_handler retries with exponential backoff
  - Create a mock node executor that fails twice then succeeds on 3rd call
  - Configure retryConfig: maxRetries=3, backoffMs=100, backoffMultiplier=2
  - Call execute_retry() with onError="retry"
  - Assert the executor was called 3 times
  - Assert delays between calls match exponential pattern (100ms, 200ms)
  - Assert the final result is the successful response

Test: error_handler fallback routes to alternative node
  - Create a mock node executor that always fails
  - Configure onError="fallback", fallbackNodeId="node-backup"
  - Call execute_fallback()
  - Assert it returns the fallbackNodeId for the orchestrator to route to
  - Assert fallbackMessage is used if fallbackNodeId is absent

Test: error_handler skip returns skipMessage
  - Configure onError="skip", skipMessage="Step skipped due to API error"
  - Call execute_skip()
  - Assert the returned result equals the skipMessage
  - Assert the context records the skip

Test: error_handler terminate raises a RunTerminatedError
  - Configure onError="terminate"
  - Assert calling the terminate handler raises a specific exception type
  - Assert the error message includes the failed node name

Test: error_handler scrubs stack traces from fallback payload
  - Create an exception with a traceback containing file paths ("/home/dev/..."), DB URLs ("postgresql://user:pass@host"), and API keys ("sk-abc123...")
  - Call scrub_error_payload(str(exc))
  - Assert none of the sensitive patterns appear in the output
  - Assert a safe summary message remains

Test: maxRetries capped at 5 server-side
  - Configure retryConfig.maxRetries=10
  - Assert execute_retry() internally caps to 5 retries
  - Verify only 5+1 (initial + 5 retry) attempts are made

Test: error_handler_map built at graph load time
  - Construct an AgencyOrchestrator with nodes including an error_handler watching ["node-a", "node-b"]
  - Assert orchestrator.error_handler_map["node-a"] contains the handler
  - Assert orchestrator.error_handler_map["node-b"] contains the handler
  - Assert nodes not in watchedNodeIds have no handlers

Test: error interception wraps watched node execution
  - Construct orchestrator with agent node "node-a" and error_handler watching it (onError="skip")
  - Mock _execute_agent_node to raise RuntimeError
  - Run orchestrator
  - Assert the skip message appears in context.results instead of an exception propagating
```

### Python Tests: `test_agency_data_transform.py`

```
Test: data_transform jsonpath extracts correct fields
  - Input: JSON string '{"results": [{"title": "A"}, {"title": "B"}]}'
  - jsonpathExpression: "$.results[*].title"
  - Assert output is '["A", "B"]'

Test: data_transform jsonpath handles invalid expression gracefully
  - Use an invalid expression like "$.[[["
  - Assert a descriptive error message is returned (not a raw exception)

Test: data_transform template renders with HTML escaping
  - Input: {"title": "<script>alert(1)</script>", "summary": "Safe text"}
  - template: "Title: {{title}}\nSummary: {{summary}}"
  - Assert output contains "&lt;script&gt;" (HTML escaped)
  - Assert "Safe text" appears unescaped

Test: data_transform filter reduces array by condition
  - Input: '[{"name": "A", "score": 0.9}, {"name": "B", "score": 0.5}, {"name": "C", "score": 0.85}]'
  - filterCondition: { field: "score", operator: "gt", value: "0.8" }
  - Assert output contains items A and C only

Test: data_transform filter with equals operator
  - Input: '[{"status": "done"}, {"status": "pending"}]'
  - filterCondition: { field: "status", operator: "equals", value: "done" }
  - Assert output contains only the "done" item

Test: data_transform filter with contains operator
  - Input: '[{"text": "hello world"}, {"text": "goodbye"}]'
  - filterCondition: { field: "text", operator: "contains", value: "hello" }
  - Assert output contains only first item

Test: data_transform stores result in context when outputKey specified
  - Configure outputKey="transformed_data"
  - Run transform
  - Assert context has key "transformed_data" with the transform result

Test: data_transform handles non-JSON input gracefully
  - Input: plain text "not json"
  - transformMode: "jsonpath"
  - Assert returns an error string, does not raise
```

### Vitest Tests (in `agency.ts` router test file)

```
Test: saveBuilder validates error_handler watchedNodeIds reference existing nodes
  - Submit a saveBuilder call with error_handler node whose watchedNodeIds references "nonexistent-node"
  - Assert Zod validation fails with descriptive error

Test: saveBuilder validates error_handler maxRetries capped at 5
  - Submit error_handler nodeConfig with retryConfig.maxRetries=10
  - Assert validation rejects (maxRetries must be <= 5)

Test: saveBuilder validates error_handler fallbackNodeId exists when onError=fallback
  - Submit error_handler with onError="fallback" but no fallbackNodeId
  - Assert validation fails

Test: saveBuilder validates data_transform transformMode is valid enum
  - Submit data_transform with transformMode="invalid"
  - Assert validation rejects

Test: saveBuilder accepts valid error_handler config
  - Submit well-formed error_handler with watchedNodeIds referencing real node IDs in the same save
  - Assert save succeeds

Test: saveBuilder accepts valid data_transform config
  - Submit data_transform with transformMode="jsonpath", jsonpathExpression="$.title"
  - Assert save succeeds
```

---

## Implementation Details

### 1. Python: Error Handler Module (`agency_error_handler.py`)

Create a standalone module with pure functions (no class needed):

```python
# Stub signatures — do not implement fully
import re
import asyncio
from typing import Any, Callable, Awaitable

MAX_RETRIES_CAP = 5

SCRUB_PATTERNS: list[re.Pattern] = [
    # file paths, DB URLs, API keys, Bearer tokens
]

async def execute_retry(
    node_executor: Callable[..., Awaitable[str]],
    node: dict,
    ctx: Any,
    retry_config: dict,
    emitter: Any | None = None,
) -> str:
    """Retry the failed node with exponential backoff.
    
    Cap maxRetries at MAX_RETRIES_CAP. Between each retry, sleep for
    backoffMs * (backoffMultiplier ^ attempt). Emit 'error_handled' SSE event
    per attempt if emitter is provided.
    """
    ...

async def execute_fallback(
    fallback_node_id: str | None,
    fallback_message: str | None,
    error: Exception,
    emitter: Any | None = None,
) -> tuple[str | None, str | None]:
    """Return (result, redirect_node_id). If fallbackNodeId exists, return it
    for the orchestrator to route to. Otherwise return fallbackMessage as result.
    Scrub the error before storing in context."""
    ...

def execute_skip(skip_message: str | None) -> str:
    """Return the skip message or a default."""
    ...

def scrub_error_payload(raw: str) -> str:
    """Remove stack traces, file paths, DB connection strings, API keys."""
    ...
```

Key behaviors:
- `execute_retry`: Use `asyncio.sleep()` for backoff. Cap `maxRetries` at 5 regardless of user config. Emit `error_handled` SSE event with `{"nodeName": ..., "strategy": "retry", "attempt": N}` after each attempt.
- `scrub_error_payload`: Strip patterns matching `/home/...`, `postgresql://...`, `sk-...`, `Bearer ...`, `Authorization: ...`. Replace with `[REDACTED]`. Truncate to 500 chars.
- `execute_fallback`: Scrub the error message before it enters context. Return `(None, fallback_node_id)` to signal the orchestrator to redirect, or `(fallback_message, None)` if no redirect node.

### 2. Python: Data Transform Module (`agency_data_transform.py`)

```python
# Stub signatures
from typing import Any

def apply_jsonpath(data_str: str, expression: str) -> str:
    """Parse data_str as JSON, apply jsonpath_ng expression, return JSON string of matches.
    
    Dependency: jsonpath_ng (add to requirements.txt if not present).
    On parse error or invalid expression, return a descriptive error string.
    """
    ...

def apply_template(data_str: str, template: str) -> str:
    """Parse data_str as JSON dict, render Mustache template with HTML escaping.
    
    Dependency: pystache.
    HTML-escape all interpolated values to prevent injection.
    """
    ...

def apply_filter(data_str: str, condition: dict) -> str:
    """Parse data_str as JSON array, filter items by condition.
    
    condition: { "field": str, "operator": "gt"|"lt"|"equals"|"contains", "value": str }
    Returns JSON string of filtered array.
    """
    ...

def execute_data_transform(input_data: str, config: dict) -> str:
    """Dispatch to the correct transform function based on config['transformMode']."""
    ...
```

Key behaviors:
- All functions accept string input and return string output (orchestrator passes `ctx.results[prev_node_id]`)
- `apply_template` must HTML-escape interpolated values via `pystache.render()` with `escape` option
- `apply_filter` coerces `value` to the appropriate type for comparison (float for gt/lt, string for equals/contains)
- Non-JSON input returns descriptive error string, never raises

### 3. Python: Orchestrator Modifications (`agency_orchestrator.py`)

Modify `AgencyOrchestrator.__init__()`:
- After building `self.nodes` and `self.edges`, construct `self.error_handler_map: dict[str, list[NodeRow]]` by scanning all nodes with `node_type == "error_handler"` and mapping each `watchedNodeId` to its handler node(s).

Modify `_execute_node()`:
- Before the existing `match node_type:` block, check `self.error_handler_map.get(node_id)`.
- If handlers exist, wrap the node execution in try/except. On exception, iterate through handlers and call `_handle_error()`.
- Add new cases to the match statement:
  - `case "error_handler":` -- Skip (error handlers are not executed directly in graph traversal). Return empty string.
  - `case "data_transform":` -- Call `_execute_data_transform(node, ctx)`.

Add `_handle_error(handler_node, failed_node, exc, ctx)`:
- Read handler's `nodeConfig` for `onError` strategy
- Dispatch to `execute_retry`, `execute_fallback`, `execute_skip`, or raise `RunTerminatedError`
- For fallback with `fallbackNodeId`, call `self._execute_node(self.nodes[fallbackNodeId], ctx)`
- Emit `error_handled` SSE event via `self.emitter` (added by section-09)

Add `_execute_data_transform(node, ctx)`:
- Get previous node's result from `ctx.results` (find the incoming edge's source node)
- Call `execute_data_transform(input_data, node_config)`
- If `outputKey` is specified, also store in context under that key
- Return the transformed result

### 4. TypeScript: Zod Validation in `agency.ts`

Extend the `nodeType` enum in both the `agents` Zod schema and the `saveBuilder` input:

```typescript
nodeType: z.enum([
  "agent", "supervisor", "router", "aggregator",
  "knowledge_base", "skill_call", "human_approval", "browser_session",
  "conditional_branch", "parallel_fan_out", "loop_retry",
  "skill_discovery", "data_transform", "error_handler",
]).default("agent"),
```

Add `.superRefine()` rules in `saveBuilder`:

- For `error_handler` nodes:
  - `watchedNodeIds` must be a non-empty array of strings
  - Each `watchedNodeId` must exist in the submitted agents list
  - `onError` must be one of `retry | fallback | skip | terminate`
  - If `onError === "retry"`: `retryConfig.maxRetries` must be `<= 5`
  - If `onError === "fallback"`: `fallbackNodeId` must exist in the agents list OR `fallbackMessage` must be non-empty

- For `data_transform` nodes:
  - `transformMode` must be one of `jsonpath | template | filter`
  - If `transformMode === "jsonpath"`: `jsonpathExpression` must be a non-empty string
  - If `transformMode === "template"`: `template` must be a non-empty string
  - If `transformMode === "filter"`: `filterCondition` must have `field`, `operator`, `value`

### 5. TypeScript: Types (`types.ts`)

Add to the `AgencyNodeType` union:

```typescript
export type AgencyNodeType =
  | "agent"
  | "supervisor"
  | "router"
  | "aggregator"
  | "knowledge_base"
  | "skill_call"
  | "human_approval"
  | "browser_session"
  | "conditional_branch"
  | "parallel_fan_out"
  | "loop_retry"
  | "skill_discovery"
  | "data_transform"
  | "error_handler";
```

Note: The six new node types from sections 17-21 should all be added here in whichever section runs first. Ensure idempotent addition (check if already present).

### 6. Frontend: `BaseAgencyNode.tsx`

Add imports and switch cases:

```typescript
import { ErrorHandlerNodeCard } from "./ErrorHandlerNodeCard";
import { DataTransformNodeCard } from "./DataTransformNodeCard";

// In the switch:
case "error_handler":
  return <ErrorHandlerNodeCard {...props} />;
case "data_transform":
  return <DataTransformNodeCard {...props} />;
```

### 7. Frontend: `ErrorHandlerNodeCard.tsx`

New file. Follow the pattern of `RouterNodeCard.tsx`:

- **Color scheme**: Red (`border-red-300`, `text-red-500`, handle `!border-red-400`)
- **Icon**: `ShieldAlert` from lucide-react
- **Badge**: Show the `onError` strategy (e.g., "retry", "fallback", "skip")
- **Info line**: Show count of watched nodes: "Watching N nodes"
- **Handles**: Target (top) + Source (bottom) -- standard input/output handles
- **Validation dot**: Red dot if `validationErrors` present

Note on dashed edges to watched nodes: This is a visual-only concern handled at the `AgencyBuilder.tsx` level (not in this card). The builder should render dashed edges from this node to each `watchedNodeId`. Implementation guidance: when rendering edges, check if the source node is `error_handler` and apply `style={{ strokeDasharray: "5 5" }}` to the ReactFlow Edge component.

### 8. Frontend: `DataTransformNodeCard.tsx`

New file. Follow the same card pattern:

- **Color scheme**: Slate (`border-slate-300`, `text-slate-500`)
- **Icon**: `Braces` from lucide-react (or `Code2` if Braces unavailable)
- **Badge**: Show `transformMode` value
- **Info line**: For jsonpath show expression preview (truncated); for template show "Template"; for filter show filter field name
- **Handles**: Target (top) + Source (bottom)

### 9. Frontend: `NodePropertyPanel.tsx`

Add config form sections for the two new node types. When `selectedNode.nodeType === "error_handler"`:

- **Watched Nodes**: Multi-select dropdown of all other nodes in the agency (exclude self and other error handlers)
- **On Error Strategy**: Radio/select for `retry | fallback | skip | terminate`
- **Retry Config** (shown when strategy = "retry"): maxRetries (number input, max 5), backoffMs (number), backoffMultiplier (number)
- **Fallback Config** (shown when strategy = "fallback"): fallbackNodeId (dropdown of nodes), fallbackMessage (textarea)
- **Skip Config** (shown when strategy = "skip"): skipMessage (textarea)

When `selectedNode.nodeType === "data_transform"`:

- **Transform Mode**: Select for `jsonpath | template | filter`
- **JSONPath Expression** (shown when mode = "jsonpath"): text input
- **Template** (shown when mode = "template"): textarea with Mustache syntax hint
- **Filter Condition** (shown when mode = "filter"): field (text), operator (select), value (text)
- **Output Key**: Optional text input for context storage key

---

## Python Dependencies

Ensure these packages are in `python-backend/requirements.txt`:

- `jsonpath-ng` -- JSONPath expression parsing and evaluation
- `pystache` -- Mustache template rendering

If already present, no action needed. If not, add with appropriate version pins.

---

## SSE Event Integration

The `error_handled` SSE event type must be registered in the shared event types from section-09. Event shape:

```typescript
interface ErrorHandledEvent {
  type: "error_handled";
  nodeName: string;
  watchedNodeName: string;
  strategy: "retry" | "fallback" | "skip" | "terminate";
  attempt?: number;       // for retry strategy
  errorSummary: string;   // scrubbed error message
  timestamp: string;
}
```

The Python `AgencyEventEmitter.emit("error_handled", {...})` call is made from within `_handle_error()` in the orchestrator.

---

## Security Considerations

1. **Payload scrubbing** (HIGH priority): Before any error information enters the `ExecutionContext` or is sent via SSE, it must pass through `scrub_error_payload()`. This strips:
   - File system paths (`/home/...`, `/app/...`)
   - Database connection strings (`postgresql://...`, `mysql://...`)
   - API keys (`sk-...`, `key-...`)
   - Auth headers (`Bearer ...`, `Authorization: ...`)
   - Stack trace frames (lines matching `File "..."`, `at ...`)

2. **maxRetries cap**: Enforced both in Zod validation (tRPC layer, `<= 5`) and in Python runtime (`MAX_RETRIES_CAP = 5`). Defense in depth.

3. **Template injection**: `apply_template` must HTML-escape all interpolated values. Do not use `{{{ }}}` (triple-mustache unescaped) in pystache.

4. **JSONPath DoS**: Limit expression complexity -- reject expressions longer than 500 characters. The `jsonpath_ng` library handles most edge cases, but add a length guard.

---

## Verification Checklist

- [ ] All pytest tests in `test_agency_error_handler.py` pass
- [ ] All pytest tests in `test_agency_data_transform.py` pass
- [ ] Vitest saveBuilder validation tests pass for both node types
- [ ] `pnpm check` (TypeScript) passes with no new errors
- [ ] Error handler nodes appear correctly in the AgencyBuilder canvas (red, ShieldAlert)
- [ ] Data transform nodes appear correctly (slate, Braces)
- [ ] Property panel shows correct config forms for each node type
- [ ] `error_handled` SSE events are emitted during retry/fallback/skip (requires section-09)