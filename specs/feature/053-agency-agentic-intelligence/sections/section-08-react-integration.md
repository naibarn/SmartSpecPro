# Section 08: ReAct Integration into Orchestrator

## Overview

This section wires the `ReActExecutor` (from section-05) into the orchestrator's agentic execution path. When an agent node has `executionMode: "agentic"` and `planningStrategy: "react"`, the orchestrator bypasses the agency-swarm adapter loop entirely and delegates to the `ReActExecutor` for direct LLM calls via the OpenAI SDK through the Node.js gateway.

This section is the convergence point for all Level 2 components: it creates the `AsyncOpenAI` gateway client, converts `ToolConfig` objects to OpenAI function definitions, connects working memory (section-06) and cost controls (section-07), and emits SSE events per ReAct iteration.

**Level:** 2 (ReAct Engine)
**Depends on:** section-02-orchestrator-agentic, section-05-react-executor, section-06-working-memory, section-07-cost-controls
**Blocks:** section-10-autonomous-executor

---

## File Changes

### Modified Files

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/services/agency_orchestrator.py` | MODIFY | Add ReAct branch in `_execute_agent_node_agentic()`, create gateway client, resolve tools for ReAct |

### New Files

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/tests/unit/test_react_integration.py` | CREATE | Integration-level unit tests for the ReAct path inside the orchestrator |

### No New Service Files

All service modules (`react_executor.py`, `working_memory.py`, `agentic_cost_controls.py`) are created by sections 05, 06, and 07 respectively. This section only wires them together inside `agency_orchestrator.py`.

---

## Tests (TDD)

### File: `python-backend/tests/unit/test_react_integration.py`

All tests use `pytest` with `asyncio` auto mode. The tests verify the wiring inside the orchestrator -- they do not re-test ReActExecutor internals (those are covered in section-05's `test_react_executor.py`).

```python
"""Tests for ReAct integration path in AgencyOrchestrator._execute_agent_node_agentic().

These tests verify that:
1. The orchestrator creates an AsyncOpenAI gateway client correctly
2. ToolConfig objects are converted to OpenAI function definitions
3. Working memory is initialized and passed to the executor
4. Cost controls (budget tracker + concurrent run limiter) are engaged
5. SSE events are emitted per iteration
6. The orchestrator falls back to the standard agentic path for non-react strategies
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = [pytest.mark.unit, pytest.mark.agency]
```

#### Test Cases

1. **`test_react_path_activated_for_react_strategy`**
   - When `nodeConfig.executionMode == "agentic"` and `nodeConfig.planningStrategy == "react"`, the orchestrator creates a `ReActExecutor` and calls its `execute()` method.
   - Mock `ReActExecutor.execute` to return a `ReActResult(status="complete", final_answer="done", iterations=2, total_tokens=5000, reasoning_trace=[])`.
   - Assert: the returned string is `"done"`.

2. **`test_non_react_strategy_uses_reflection_loop`**
   - When `planningStrategy == "basic"` (or `"cot"`), the orchestrator uses the existing reflection loop from section-02, NOT the ReActExecutor.
   - Mock `adapter.run()` to return completion signal.
   - Assert: `ReActExecutor` is never instantiated.

3. **`test_gateway_client_created_with_user_token`**
   - Verify that `AsyncOpenAI` is constructed with `api_key=ctx.user_token` and `base_url` set to `{NODEJS_INTERNAL_URL}/v1`.
   - Mock the `AsyncOpenAI` constructor and capture its arguments.

4. **`test_tool_configs_converted_to_function_definitions`**
   - Mock `resolve_tools_for_agent()` to return a list of mock tool bridge classes.
   - Mock a secondary helper `resolve_tool_configs_for_react()` (or equivalent) to return `ToolConfig` objects.
   - Verify each `ToolConfig` is converted via `tool_config_to_function()` and the resulting list is passed to `ReActExecutor.__init__`.

5. **`test_working_memory_initialized_and_injected`**
   - Verify that a `WorkingMemory` instance is created with the correct Redis key pattern: `agency:run:{tenant_id}:{run_id}:memory:{agent_id}`.
   - Verify that `working_memory.get_summary()` is called and its result included in the context passed to `ReActExecutor.execute()`.

6. **`test_concurrent_run_limiter_acquired_and_released`**
   - Mock `ConcurrentRunLimiter.acquire()` to succeed.
   - After `ReActExecutor.execute()` completes, verify `ConcurrentRunLimiter.release()` is called (even on exception).
   - Use `try/finally` pattern verification.

7. **`test_concurrent_run_limiter_blocks_when_full`**
   - Mock `ConcurrentRunLimiter.acquire()` to raise a limit-exceeded error.
   - Assert: the method returns an error message string (not raises), matching the pattern `"Maximum concurrent agentic runs reached..."`.

8. **`test_budget_tracker_passed_to_executor`**
   - Verify that `TokenBudgetTracker` is instantiated with the agent's configured `maxTokensBudget` (or default from `agentic_limits`).
   - Verify it is passed to `ReActExecutor` constructor.

9. **`test_sse_events_emitted_for_react_result`**
   - After ReActExecutor returns, verify the orchestrator emits `text_delta` SSE event with the final answer.
   - Verify iteration-level events are handled by the executor itself (not duplicated by orchestrator).

10. **`test_react_path_respects_feature_flag`**
    - When `agencyReactExecutorEnabled` feature flag is `False`, the orchestrator falls back to the standard agentic reflection loop even if `planningStrategy == "react"`.
    - Mock the feature flag check to return `False`.

#### Test Helper

```python
def _build_react_orchestrator(node_config=None):
    """Build an AgencyOrchestrator with a single agent node configured for ReAct.

    Returns (orchestrator, mock_adapter, mock_db).
    Default node_config:
        executionMode: "agentic"
        planningStrategy: "react"
        maxReflectionCycles: 5
        maxTokensBudget: 50000
    """
    # ... build with mocked adapter, db, event_emitter ...
```

---

## Implementation Details

### Modification: `python-backend/app/services/agency_orchestrator.py`

#### New Imports

Add at the top of the file, after existing imports:

```python
from openai import AsyncOpenAI

from app.services.agentic_cost_controls import ConcurrentRunLimiter, TokenBudgetTracker
from app.services.react_executor import ReActExecutor, ReActResult, tool_config_to_function
from app.services.working_memory import WorkingMemory
```

These imports are conditional at the usage site to avoid hard failures if section-05/06/07 modules are not yet deployed. Use lazy imports within the ReAct branch:

```python
# Inside the react branch of _execute_agent_node_agentic
try:
    from app.services.react_executor import ReActExecutor, ReActResult, tool_config_to_function
    from app.services.working_memory import WorkingMemory
    from app.services.agentic_cost_controls import ConcurrentRunLimiter, TokenBudgetTracker
except ImportError:
    logger.error("react_executor_imports_missing", hint="Sections 05-07 not deployed")
    return "[ReAct executor not available — required modules not installed]"
```

#### Modify `_execute_agent_node_agentic()` Method

The existing `_execute_agent_node_agentic()` (from section-02) handles the basic/cot reflection loop. Add a branch at the top of this method for the `"react"` planning strategy.

**Location:** Inside `_execute_agent_node_agentic()`, before the existing reflection loop.

**Pseudocode flow:**

```python
async def _execute_agent_node_agentic(self, node: NodeRow, ctx: ExecutionContext) -> str:
    node_config = node.get("node_config") or {}
    strategy = node_config.get("planningStrategy", "basic")

    if strategy == "react":
        return await self._execute_react_path(node, ctx)

    # ... existing reflection loop for basic/cot (from section-02) ...
```

#### New Method: `_execute_react_path()`

**Signature:**
```python
async def _execute_react_path(self, node: NodeRow, ctx: ExecutionContext) -> str:
```

**Flow:**

1. **Feature flag check:**
   - Check `agencyReactExecutorEnabled` via internal HTTP call or cached flag
   - If disabled: fall back to basic reflection loop (call the existing reflection code)

2. **Concurrent run limiter -- acquire:**
   - Create `ConcurrentRunLimiter` with Redis client
   - Call `await limiter.acquire(tenant_id=ctx.tenant_id, user_id=ctx.user_id, run_type="react")`
   - If limit exceeded: return error message string `"Maximum concurrent agentic runs reached. Please wait for an existing run to complete."`

3. **Create AsyncOpenAI gateway client:**
   ```python
   base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
   gateway_client = AsyncOpenAI(
       api_key=ctx.user_token,
       base_url=f"{base_url}/v1",
   )
   ```

4. **Resolve tools for ReAct:**
   - Call existing `resolve_tools_for_agent()` to get tool bridge classes
   - For each tool, extract the `ToolConfig` data to convert to OpenAI function definitions
   - Use `tool_config_to_function()` for conversion
   - Build `tool_endpoints` map: `{tool_name: {"url": endpoint_url, "risk_level": risk, "config": merged_config}}`
   - This requires a new helper function `resolve_tool_configs_for_react()` (see below)

5. **Initialize working memory:**
   ```python
   run_id = getattr(ctx, "run_id", None) or str(uuid4())
   working_memory = WorkingMemory(
       redis_client=self._get_redis(),
       tenant_id=ctx.tenant_id,
       run_id=run_id,
       agent_id=node["id"],
   )
   ```

6. **Initialize budget tracker:**
   ```python
   max_budget = min(
       node_config.get("maxTokensBudget", MAX_TOKENS_BUDGET),
       MAX_TOKENS_BUDGET,
   )
   budget_tracker = TokenBudgetTracker(budget=max_budget, event_emitter=self.event_emitter)
   ```

7. **Build agent instructions:**
   - Start with `node.get("instructions", "")`
   - Run through `resolve_instructions()` (existing function)
   - Append working memory summary if available: `memory_summary = await working_memory.get_summary()`

8. **Create and execute ReActExecutor:**
   ```python
   executor = ReActExecutor(
       gateway_client=gateway_client,
       model_name=node.get("model", "gpt-4o"),
       agent_instructions=agent_instructions,
       tools=tool_definitions,
       tool_endpoints=tool_endpoint_map,
       max_iterations=min(node_config.get("maxReflectionCycles", 5), MAX_REACT_ITERATIONS),
       max_tokens_budget=max_budget,
       event_emitter=self.event_emitter,
   )

   augmented_message = ctx.get_context_text()
   result: ReActResult = await executor.execute(task=augmented_message, context=context_dict)
   ```

9. **Post-execution:**
   - Store result in `ctx.results[node["id"]] = result.final_answer`
   - Update working memory with result observations
   - Emit `text_delta` SSE event with final answer
   - Release concurrent run limiter (in `finally` block)
   - Return `result.final_answer`

10. **Error handling:**
    - Wrap entire flow in `try/finally` to ensure `limiter.release()` is called
    - On exception: log error, release limiter, return error message string

#### New Helper: `resolve_tool_configs_for_react()`

This function bridges the gap between `resolve_tools_for_agent()` (which returns agency-swarm tool classes) and `ReActExecutor` (which needs OpenAI function definitions + endpoint maps).

**Location:** Add as a module-level async function in `agency_orchestrator.py`, or as a static method.

**Signature:**
```python
async def resolve_tool_configs_for_react(
    db: AsyncSession,
    agent_id: str,
    agency_whitelist: set[str],
    retrieval_scope_mode: str | None = None,
) -> tuple[list[dict], dict[str, dict]]:
    """Resolve tools for ReAct executor (OpenAI function format + endpoint map).

    Returns:
        Tuple of:
        - tool_definitions: list of OpenAI function definition dicts
        - tool_endpoints: dict mapping tool_name -> {"url": str, "risk_level": str, "config": dict}
    """
```

**Flow:**
1. Execute the same SQL query as `resolve_tools_for_agent()` to fetch tool rows
2. For each row:
   - Merge `base_config` with `instance_config`
   - Resolve `endpoint_url` (same logic as existing code: check config, then `_BUILTIN_ENDPOINTS`)
   - Build description from tool metadata (tool_id as name, description from config or a default)
   - Call `tool_config_to_function(tool_id, description, input_schema)` to get the function definition
   - Add to `tool_endpoints` map
3. Return both structures

**Why a separate function:** `resolve_tools_for_agent()` returns agency-swarm `BaseTool` subclasses which embed the HTTP execution logic. ReActExecutor needs raw function definitions (for the LLM) and separate endpoint info (for direct HTTP calls). Reusing the same SQL query but different output format is cleaner than trying to reverse-engineer tool classes.

**Tool description source:** The current `ToolConfig` model does not have a `description` field. Descriptions must be sourced from:
- The `agency_tools` table `config` column (may contain `"description"` key)
- Builtin tool descriptions from a constant map (similar to `_BUILTIN_ENDPOINTS`)
- Fallback: use `tool_id` as description

Add a constant for builtin tool descriptions:

```python
_BUILTIN_TOOL_DESCRIPTIONS: dict[str, str] = {
    "builtin-rag-knowledge": "Search and retrieve relevant documents from the knowledge base",
    "builtin-skill-executor": "Execute a SmartSpecPro skill to generate content",
    "builtin-web-search": "Search the web for current information",
    "builtin-code-runner": "Execute code in a sandboxed environment",
    "builtin-image-gen": "Generate images from text descriptions",
    "builtin-agency-call": "Call another agency to handle a sub-task",
    # ... add entries for all builtin tools
}
```

**Tool input schema source:** The `CustomToolConfig` model has `input_schema`. For builtin tools without explicit schemas, use a generic schema:
```python
{"type": "object", "properties": {"query": {"type": "string", "description": "Input for the tool"}}}
```

#### Redis Client Access

The orchestrator needs a Redis client for `WorkingMemory` and `ConcurrentRunLimiter`. The existing codebase uses `redis.asyncio.Redis`. Add a helper method:

```python
def _get_redis(self) -> "redis.asyncio.Redis":
    """Get or create a Redis client for working memory and rate limiting."""
    if not hasattr(self, "_redis_client") or self._redis_client is None:
        import redis.asyncio as aioredis
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        self._redis_client = aioredis.from_url(redis_url, decode_responses=True)
    return self._redis_client
```

Alternatively, accept a Redis client in the `AgencyOrchestrator.__init__()` constructor (preferred for testability). The decision depends on how the orchestrator is currently instantiated -- check `agency_service.py` for the construction pattern.

---

## Key Design Decisions

1. **ReAct branch inside `_execute_agent_node_agentic()`.** The `planningStrategy` field determines whether to use the reflection loop (basic/cot) or the ReAct executor. This keeps the routing logic in one place.

2. **Separate `resolve_tool_configs_for_react()` function.** The existing `resolve_tools_for_agent()` returns agency-swarm tool classes. ReAct needs raw function definitions and endpoint URLs. A separate query function avoids coupling the two execution engines.

3. **Lazy imports for ReAct modules.** If sections 05-07 are not yet deployed, the import failure is caught and a graceful error message is returned instead of crashing the entire orchestrator.

4. **`try/finally` for limiter release.** The `ConcurrentRunLimiter.release()` must always execute, even if the executor throws an exception. This prevents stuck counters.

5. **Feature flag gates ReAct path.** Even with `planningStrategy: "react"`, the feature flag `agencyReactExecutorEnabled` must be enabled. This allows safe rollback without changing agency configurations.

6. **Gateway client is per-request, not cached.** Each ReAct execution creates a new `AsyncOpenAI` client with the current user's token. This ensures correct credit attribution per user.

7. **Working memory summary is injected as context, not instructions.** The memory summary is passed in the `context` parameter of `ReActExecutor.execute()`, which places it in a user-role message. This follows the security requirement that user-sourced content stays in user-role messages.

---

## Relationship to Other Sections

- **section-02-orchestrator-agentic:** Provides `_execute_agent_node_agentic()` method and `CompletionSignal`. This section adds the ReAct branch inside that method.
- **section-04-feature-flags:** Provides `agencyReactExecutorEnabled` flag. This section checks it before entering the ReAct path.
- **section-05-react-executor:** Provides `ReActExecutor`, `ReActResult`, `tool_config_to_function()`. This section instantiates and calls the executor.
- **section-06-working-memory:** Provides `WorkingMemory` class. This section creates an instance and passes summary context to the executor.
- **section-07-cost-controls:** Provides `TokenBudgetTracker` and `ConcurrentRunLimiter`. This section acquires/releases the limiter and passes the tracker to the executor.
- **section-10-autonomous-executor:** Depends on this section being complete. The autonomous executor reuses the same ReAct integration path for sub-task execution.

---

## Verification Checklist

- [ ] `pytest python-backend/tests/unit/test_react_integration.py -v` -- all 10 tests pass
- [ ] `pytest python-backend/tests/unit/test_agentic_orchestrator.py -v` -- section-02 tests still pass (no regressions)
- [ ] `pytest python-backend/tests/unit/test_react_executor.py -v` -- section-05 tests still pass
- [ ] Existing single-shot agencies work identically (no behavior change)
- [ ] Agencies with `planningStrategy: "basic"` or `"cot"` still use the reflection loop
- [ ] `agencyReactExecutorEnabled=false` causes fallback to reflection loop
- [ ] `ConcurrentRunLimiter.release()` is called even on executor failure
- [ ] Gateway client uses `ctx.user_token` as API key (verified via mock capture)
- [ ] Tool definitions include both builtin and custom tools with correct schemas