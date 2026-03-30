# Section 10: Autonomous Executor -- Plan/Execute/Reflect Engine

## Overview

This section creates the Level 3 core engine in `python-backend/app/services/autonomous_executor.py`. The module implements three cooperating components:

- **AutonomousPlanner** -- Uses the LLM with structured output to decompose a complex task into a `TaskPlan` of sub-tasks with dependencies.
- **AutonomousExecutor** -- Topologically sorts sub-tasks by dependencies, executes them (via `ReActExecutor` or delegation to other agents), and manages parallel/sequential execution.
- **AutonomousReflector** -- Evaluates completed work against a quality threshold, decides whether to re-plan, and provides improvement suggestions.

**Level:** 3 (Autonomous Agent)
**Depends on:** section-05-react-executor (`ReActExecutor`, `tool_config_to_function`), section-08-react-integration (orchestrator wiring of ReAct path)
**Blocks:** section-13-frontend-level3

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `python-backend/app/services/autonomous_executor.py` | AutonomousPlanner, AutonomousExecutor, AutonomousReflector classes |
| `python-backend/tests/unit/test_autonomous_executor.py` | Unit tests for all three classes |

### Modified Files

| File | Change |
|------|--------|
| `python-backend/app/services/agency_orchestrator.py` | Add `autonomous_agent` to `_execute_node()` match block; add `delegation_depth` to `ExecutionContext.__init__()` |

---

## Dependencies on Other Sections

- **section-01-foundation:** Provides `agentic_limits.py` (specifically `MAX_PLAN_DEPTH`, `MAX_TOTAL_ITERATIONS`, `MAX_DELEGATION_DEPTH`) and `agentic_sanitizer.py` (`sanitize_llm_input`).
- **section-05-react-executor:** Provides `ReActExecutor` class and `tool_config_to_function()`. Sub-tasks that execute locally use `ReActExecutor` as their engine.
- **section-08-react-integration:** Provides the orchestrator integration pattern for creating `AsyncOpenAI` gateway clients and resolving tool definitions. The autonomous executor follows the same pattern.
- **section-04-feature-flags:** The `agencyAutonomousAgentEnabled` flag gates entry to the autonomous path in the orchestrator.
- **section-11-execution-memory:** Provides `ExecutionMemoryStore` for checkpoint/recovery. The autonomous executor calls it but the store itself is built in section-11.

---

## Tests (Write First)

### File: `python-backend/tests/unit/test_autonomous_executor.py`

All tests use `pytest` with `asyncio` auto mode. The `AsyncOpenAI` gateway client and `ReActExecutor` must be mocked. Never make real LLM or HTTP calls in unit tests.

#### Test Fixtures

**`mock_gateway_client`** -- Returns a mock `AsyncOpenAI` client where `client.chat.completions.create` is an `AsyncMock`. Configure the mock to return structured JSON matching `TaskPlan` or `ReflectionResult` schemas as needed per test.

**`mock_react_executor`** -- Returns a mock `ReActExecutor` instance where `execute()` is an `AsyncMock` returning a `ReActResult` with `status="complete"` and a configurable `final_answer`.

**`sample_execution_context`** -- Returns a minimal `ExecutionContext` with `input_message="Test task"`, `user_token="test-token"`, `tenant_id="tenant-1"`, `user_id=1`.

**`sample_nodes`** -- Returns a dict of `NodeRow` objects simulating an agency with 2-3 agent nodes, used for delegation tests.

#### Test Cases

```python
@pytest.mark.asyncio
async def test_plan_decomposition():
    """Planner decomposes task into sub-tasks with dependencies.
    Setup: Mock gateway returns structured JSON with 3 sub-tasks,
           sub-task 2 depends on sub-task 1, sub-task 3 depends on sub-task 2.
    Assert: Returned TaskPlan has 3 sub-tasks.
            Dependency graph is [1] -> [2] -> [3].
    """

@pytest.mark.asyncio
async def test_plan_validation_empty():
    """Empty plan (0 sub-tasks) raises PlanValidationError.
    Setup: Mock gateway returns structured JSON with empty sub_tasks list.
    Assert: PlanValidationError raised with message indicating empty plan.
    """

@pytest.mark.asyncio
async def test_plan_validation_cycle():
    """Dependency cycle detected raises PlanValidationError.
    Setup: Mock gateway returns plan where sub-task A depends on B and B depends on A.
    Assert: PlanValidationError raised with message indicating cycle.
    """

@pytest.mark.asyncio
async def test_plan_validation_nonexistent_agent():
    """Sub-task delegating to non-existent agent falls back to self-execution.
    Setup: Mock gateway returns plan with sub-task delegated to 'agent-999' (not in nodes).
    Assert: Sub-task execution_mode changed to 'self' (not 'delegate').
           No error raised.
    """

@pytest.mark.asyncio
async def test_sequential_execution():
    """Sub-tasks with dependencies execute in dependency order.
    Setup: Plan with 3 sub-tasks in chain: A -> B -> C.
           Mock ReActExecutor records call order.
    Assert: Execute calls happen in order A, B, C.
           Each sub-task receives prior results in context.
    """

@pytest.mark.asyncio
async def test_parallel_execution():
    """Independent sub-tasks execute concurrently via asyncio.gather.
    Setup: Plan with 3 sub-tasks, B and C both depend only on A.
           Mock ReActExecutor with 0.1s delay to verify concurrency.
    Assert: B and C start after A completes.
           Total execution time is ~0.2s (A serial + B/C parallel), not ~0.3s.
    """

@pytest.mark.asyncio
async def test_reflection_triggers_replan():
    """Quality score < threshold triggers re-planning.
    Setup: Mock reflector returns quality_score=0.5, threshold=0.8, replan=True.
    Assert: Planner called a second time (re-plan).
           Second plan's sub-tasks are executed.
    """

@pytest.mark.asyncio
async def test_reflection_accepts_result():
    """Quality score >= threshold marks run complete.
    Setup: Mock reflector returns quality_score=0.9, threshold=0.8.
    Assert: No re-planning triggered.
           Final result returned from executor.
    """

@pytest.mark.asyncio
async def test_delegation_depth_enforcement():
    """Delegation at depth >= MAX_DELEGATION_DEPTH returns error, not recurse.
    Setup: ExecutionContext with delegation_depth=MAX_DELEGATION_DEPTH (3).
           Sub-task attempts delegation.
    Assert: Delegation returns error string '[Delegation depth limit reached]'.
           No recursive call made.
    """

@pytest.mark.asyncio
async def test_delegation_context_isolation():
    """Delegated agent writes to own namespace, not parent's ctx.results.
    Setup: Sub-task delegates to agent-2. Agent-2 produces result 'delegated-result'.
    Assert: Parent ctx.results does NOT contain agent-2's intermediate results.
           Only the final delegation result is returned to the sub-task.
    """

@pytest.mark.asyncio
async def test_max_total_iterations_respected():
    """Total iterations across all sub-tasks capped at MAX_TOTAL_ITERATIONS.
    Setup: Plan with 5 sub-tasks each requiring 15 iterations.
           MAX_TOTAL_ITERATIONS=50.
    Assert: Execution stops before all sub-tasks complete.
           Result status indicates iteration limit.
    """

@pytest.mark.asyncio
async def test_max_plan_depth_limits_replanning():
    """Re-planning limited by maxPlanDepth config.
    Setup: Reflector always returns replan=True.
           maxPlanDepth=2.
    Assert: Planner called at most 2 times total.
           After max depth, returns best available result.
    """

@pytest.mark.asyncio
async def test_subtask_failure_recorded_not_fatal():
    """A failed sub-task is recorded but does not crash the entire run.
    Setup: Sub-task B raises an exception during execution.
    Assert: Error recorded in sub-task results.
           Remaining sub-tasks (not dependent on B) still execute.
           Final result includes partial completion info.
    """
```

---

## Implementation Details

### File: `python-backend/app/services/autonomous_executor.py`

#### Pydantic Models

**`SubTask`** -- Represents a single decomposed sub-task:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | Unique identifier within the plan (e.g., `"subtask-1"`) |
| `description` | `str` | What the sub-task should accomplish |
| `depends_on` | `list[str]` | IDs of sub-tasks that must complete first |
| `execution_mode` | `str` | One of `"self"`, `"delegate"`, `"cross_agency"` |
| `delegate_to` | `str | None` | Agent node ID (for `"delegate"`) or agency ID (for `"cross_agency"`) |
| `tool_hints` | `list[str]` | Suggested tools (informational, not binding) |
| `estimated_complexity` | `str` | `"low"`, `"medium"`, `"high"` |

**`TaskPlan`** -- Structured output from the planner LLM call:

| Field | Type | Description |
|-------|------|-------------|
| `plan_id` | `str` | UUID for this plan version |
| `sub_tasks` | `list[SubTask]` | Ordered list of sub-tasks |
| `strategy` | `str` | `"sequential"`, `"parallel"`, `"adaptive"` |
| `estimated_total_tokens` | `int | None` | LLM's estimate of total token cost |

**`ReflectionResult`** -- Structured output from the reflector LLM call:

| Field | Type | Description |
|-------|------|-------------|
| `quality_score` | `float` | 0.0 to 1.0 quality assessment |
| `is_complete` | `bool` | Whether the task is satisfactorily completed |
| `gaps` | `list[str]` | Identified gaps or missing elements |
| `suggestions` | `list[str]` | Improvement suggestions for re-planning |
| `replan_focus` | `str | None` | Specific area to focus if re-planning |

**`PlanValidationError`** -- Custom exception raised by `_validate_plan()`:

```python
class PlanValidationError(Exception):
    """Raised when a generated plan fails structural validation."""
```

**`AutonomousResult`** -- Return type for the full autonomous execution:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `str` | `"complete"`, `"max_iterations"`, `"max_plan_depth"`, `"partial"` |
| `final_answer` | `str` | Synthesized result from all sub-tasks |
| `plan_versions` | `int` | How many times re-planning occurred |
| `total_subtasks` | `int` | Total sub-tasks across all plan versions |
| `total_tokens` | `int` | Cumulative tokens used |
| `subtask_results` | `dict[str, str]` | Sub-task ID to result mapping |

#### `AutonomousPlanner` Class

**Constructor parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `gateway_client` | `AsyncOpenAI` | Required | LLM gateway client |
| `model_name` | `str` | Required | Model for planning calls |
| `available_agents` | `dict[str, NodeRow]` | Required | Agent nodes in the agency (for delegation references) |
| `available_tools` | `list[str]` | `[]` | Tool names available for sub-tasks |

**`async plan(self, task: str, context: str, previous_result: str | None = None, replan_focus: str | None = None) -> TaskPlan` method:**

1. Build system prompt instructing LLM to decompose the task into sub-tasks with JSON output matching `TaskPlan` schema.
2. If `previous_result` and `replan_focus` are provided, include them as user-role context (framed as "previous attempt" -- never system-role).
3. Call `gateway_client.chat.completions.create()` with `response_format` requesting JSON. Parse the response via `TaskPlan.model_validate_json()`.
4. Call `self._validate_plan(plan)` before returning.
5. Sanitize all sub-task descriptions via `sanitize_llm_input()`.

**`_validate_plan(self, plan: TaskPlan) -> None` method:**

Validation checks (raises `PlanValidationError` on failure):
1. Plan must have at least 1 sub-task.
2. No dependency cycles (topological sort must succeed).
3. All `depends_on` references point to existing sub-task IDs within the plan.
4. For `execution_mode == "delegate"`: if `delegate_to` agent not found in `available_agents`, change mode to `"self"` (fallback, no error).
5. Sub-task count capped at `MAX_TOTAL_ITERATIONS`.

Cycle detection uses Kahn's algorithm (BFS topological sort). If the sorted output has fewer items than the sub-task count, a cycle exists.

#### `AutonomousExecutor` Class

**Constructor parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `react_executor_factory` | `Callable[..., ReActExecutor]` | Required | Factory to create ReActExecutor instances per sub-task |
| `orchestrator` | `AgencyOrchestrator | None` | `None` | Reference to parent orchestrator (for delegation) |
| `event_emitter` | `AgencyEventEmitter | None` | `None` | For SSE events |
| `max_total_iterations` | `int` | `50` | Clamped to `MAX_TOTAL_ITERATIONS` |

**`async execute(self, plan: TaskPlan, ctx: ExecutionContext) -> dict[str, str]` method:**

1. Topologically sort sub-tasks from `plan.sub_tasks` using `depends_on`.
2. Group sub-tasks into execution "waves" -- a wave contains all tasks whose dependencies are satisfied.
3. For each wave:
   - If wave has 1 task: execute sequentially via `_execute_subtask()`.
   - If wave has multiple tasks: execute concurrently via `asyncio.gather()`, with `return_exceptions=True`.
4. Track cumulative iteration count. If `_total_iterations >= max_total_iterations`, stop and return partial results.
5. Store each sub-task result in `subtask_results: dict[str, str]`.
6. On sub-task failure (exception): record error in `subtask_results[task_id]`, emit `autonomous_subtask_complete` SSE event with `status="failed"`, continue with remaining tasks that do not depend on the failed one.
7. Return `subtask_results`.

**`async _execute_subtask(self, subtask: SubTask, ctx: ExecutionContext, prior_results: dict[str, str]) -> str` method:**

Based on `subtask.execution_mode`:

- **`"self"`**: Create a `ReActExecutor` via `react_executor_factory`, call `executor.execute(subtask.description, context=prior_results_summary)`. Return `result.final_answer`.
- **`"delegate"`**: Call `self._delegate(subtask.delegate_to, subtask.description, ctx)`. Return delegation result.
- **`"cross_agency"`**: Call `self._delegate_cross_agency(subtask.delegate_to, subtask.description, ctx)`. Return delegation result.

Build context for the sub-task by including results from completed dependencies: `prior_results_summary = "\n".join(f"[{dep_id}]: {prior_results[dep_id][:500]}" for dep_id in subtask.depends_on if dep_id in prior_results)`.

Emit SSE event after completion:
```python
await self.event_emitter.emit("autonomous_subtask_complete", {
    "subtaskId": subtask.id,
    "status": "complete" or "failed",
    "tokensUsed": tokens,
})
```

**`async _delegate(self, agent_node_id: str, task: str, ctx: ExecutionContext) -> str` method:**

1. Check `ctx.delegation_depth >= MAX_DELEGATION_DEPTH` -- if so, return `"[Delegation depth limit reached]"` (hard stop, no exception).
2. Create a shallow copy of `ExecutionContext` for the delegation:
   - Same `user_token`, `tenant_id`, `user_id`.
   - Fresh `results: {}` (isolated namespace).
   - `delegation_depth = ctx.delegation_depth + 1`.
   - `input = task`.
3. Call `self.orchestrator._execute_node(target_node, delegated_ctx)`.
4. Return the result string. Do NOT copy `delegated_ctx.results` back to parent `ctx`.

**`async _delegate_cross_agency(self, agency_id: str, task: str, ctx: ExecutionContext) -> str` method:**

Uses the existing `builtin-agency-call` tool pattern. Calls the tool's HTTP endpoint with:
- `agency_id`: target agency
- `message`: task description
- `current_depth`: `ctx.delegation_depth` (unifies depth counters with `agency_call_tool.py`)
- Authorization: `Bearer {ctx.user_token}`

Returns the tool's response text (truncated to 2000 chars, sanitized).

#### `AutonomousReflector` Class

**Constructor parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `gateway_client` | `AsyncOpenAI` | Required | LLM gateway client |
| `model_name` | `str` | Required | Model for reflection calls |
| `quality_threshold` | `float` | `0.8` | Minimum quality score to accept result |

**`async reflect(self, task: str, subtask_results: dict[str, str], plan: TaskPlan) -> ReflectionResult` method:**

1. Build system prompt instructing LLM to evaluate quality of completed work against the original task.
2. Build user-role message with:
   - Original task description
   - Sub-task results (all concatenated, each truncated to 500 chars)
   - Plan structure (sub-task descriptions and dependencies)
3. Call `gateway_client.chat.completions.create()` with `response_format` requesting JSON.
4. Parse via `ReflectionResult.model_validate_json()`.
5. `suggestions` and `replan_focus` are treated as user-role content when fed back to the planner (security: never placed in system prompt).

#### Top-Level `run_autonomous()` Function

This is the main entry point called by the orchestrator. It orchestrates the Plan-Execute-Reflect cycle.

**Signature:**
```python
async def run_autonomous(
    task: str,
    ctx: ExecutionContext,
    node_config: dict,
    gateway_client: AsyncOpenAI,
    model_name: str,
    available_agents: dict[str, NodeRow],
    tools: list[ToolDefinition],
    tool_endpoints: ToolEndpointMap,
    orchestrator: AgencyOrchestrator | None = None,
    event_emitter: AgencyEventEmitter | None = None,
) -> AutonomousResult:
```

**Flow:**

1. Read config from `node_config`:
   - `max_plan_depth = min(node_config.get("maxPlanDepth", 3), MAX_PLAN_DEPTH)`
   - `max_total_iterations = min(node_config.get("maxTotalIterations", 20), MAX_TOTAL_ITERATIONS)`
   - `quality_threshold = node_config.get("qualityThreshold", 0.8)`
   - `delegation_mode = node_config.get("delegationMode", "self_only")`

2. Create `AutonomousPlanner`, `AutonomousExecutor`, `AutonomousReflector` instances.

3. Create a `react_executor_factory` closure that builds `ReActExecutor` with the shared `gateway_client`, `model_name`, tools, and tool_endpoints.

4. **Plan-Execute-Reflect loop** (up to `max_plan_depth` iterations):

   a. **Plan:** Call `planner.plan(task, ctx.get_context_text(), previous_result, replan_focus)`.
   
   b. Emit SSE: `autonomous_plan_created` with `{planVersion, subtaskCount}`.
   
   c. If `delegation_mode == "self_only"`: force all sub-tasks to `execution_mode="self"`.
   
   d. **Execute:** Call `executor.execute(plan, ctx)`. Returns `subtask_results`.
   
   e. **Synthesize:** Combine sub-task results into a coherent answer. For simple cases, concatenate. For complex cases, call LLM to synthesize (short call via gateway).
   
   f. **Reflect:** Call `reflector.reflect(task, subtask_results, plan)`.
   
   g. Emit SSE: `autonomous_reflection` with `{qualityScore, isComplete, replanRequired}`.
   
   h. If `reflection.is_complete` or `reflection.quality_score >= quality_threshold`: break loop, return result.
   
   i. Else: set `previous_result = synthesized_answer`, `replan_focus = reflection.replan_focus`, continue loop.

5. Return `AutonomousResult` with accumulated stats.

#### Orchestrator Modification

In `python-backend/app/services/agency_orchestrator.py`:

**`ExecutionContext.__init__`** -- Add parameter:
```python
self.delegation_depth: int = 0
```

**`_execute_node()` match block** -- Add case:
```python
case "autonomous_agent":
    result = await self._execute_autonomous_node(node, ctx)
```

**New method `_execute_autonomous_node()`:**
1. Check feature flag `agencyAutonomousAgentEnabled` via internal HTTP call (same pattern as existing flag checks).
2. If disabled, fall back to standard `_execute_agent_node()`.
3. Extract `node_config = node.get("node_config", {})`.
4. Create `AsyncOpenAI` gateway client (same pattern as section-08).
5. Resolve tools via `resolve_tools_for_agent()`.
6. Call `run_autonomous()` from `autonomous_executor.py`.
7. Return `result.final_answer`.

#### Import Dependencies

From section-01:
- `from app.services.agentic_limits import MAX_PLAN_DEPTH, MAX_TOTAL_ITERATIONS, MAX_DELEGATION_DEPTH`
- `from app.services.agentic_sanitizer import sanitize_llm_input`

From section-05:
- `from app.services.react_executor import ReActExecutor, ReActResult, ToolDefinition, ToolEndpointMap`

From existing codebase:
- `from openai import AsyncOpenAI`
- `from pydantic import BaseModel, Field`
- `import asyncio`
- `import structlog`
- `import uuid`
- `from collections import deque` (for Kahn's algorithm)
- `from app.services.agency_event_emitter import AgencyEventEmitter`
- `from app.services.agency_orchestrator import ExecutionContext, AgencyOrchestrator, NodeRow`

Note: The import of `ExecutionContext` and `AgencyOrchestrator` from `agency_orchestrator` creates a circular import risk. Resolve by using `TYPE_CHECKING` guard:
```python
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.agency_orchestrator import AgencyOrchestrator, ExecutionContext, NodeRow
```

At runtime, these types are only used for type hints and the `run_autonomous()` function receives them as parameters.

---

## Key Design Decisions

1. **ReActExecutor as sub-task engine:** Each sub-task runs through a `ReActExecutor` instance (from section-05). This gives sub-tasks full tool-calling capability without duplicating the Thought-Action-Observation loop.

2. **Factory pattern for executors:** A `react_executor_factory` closure creates per-sub-task `ReActExecutor` instances. This allows different sub-tasks to have different tool sets or budgets in future iterations.

3. **Context isolation on delegation:** Delegated agents get a fresh `results` dict (shallow copy of ExecutionContext). This prevents a delegated agent's intermediate state from polluting the parent's namespace. Only the final result string flows back.

4. **Depth unification:** `ctx.delegation_depth` and the existing `current_depth` in `agency_call_tool.py` are unified. When calling `builtin-agency-call` for cross-agency delegation, `ctx.delegation_depth` is passed as `current_depth` so both counters increment together.

5. **Graceful degradation on sub-task failure:** A failed sub-task does not crash the entire run. Its error is recorded, and tasks that do not depend on it continue executing. This maximizes partial progress.

6. **Reflector output as user-role:** The reflector's `suggestions` and `replan_focus` are always injected as user-role messages (not system-role) when fed back to the planner. This prevents the reflector's output from being treated as trusted instructions, mitigating prompt injection via reflection.

7. **Delegation mode gating:** When `delegationMode == "self_only"`, all sub-tasks are forced to `execution_mode="self"` regardless of what the planner suggests. This gives users explicit control over whether agents can delegate.

---

## Relationship to Other Sections

- **section-05-react-executor:** Provides `ReActExecutor` -- the execution engine for individual sub-tasks. Must be completed before this section.
- **section-08-react-integration:** Provides the pattern for creating `AsyncOpenAI` gateway clients and converting tools. This section follows the same pattern.
- **section-01-foundation:** Provides hard caps (`MAX_PLAN_DEPTH`, `MAX_DELEGATION_DEPTH`, `MAX_TOTAL_ITERATIONS`) and `sanitize_llm_input()`.
- **section-04-feature-flags:** Provides `agencyAutonomousAgentEnabled` flag.
- **section-11-execution-memory:** Provides `ExecutionMemoryStore` for crash recovery. The autonomous executor should call `store.checkpoint()` after each sub-task completion, but the store implementation itself is in section-11. For this section, the checkpoint call should be guarded with `if memory_store:` to allow the executor to work without the store.
- **section-12-long-term-memory:** After a successful run, the long-term memory service (section-12) extracts learnings from the autonomous execution. That integration is in section-12, not here.
- **section-13-frontend-level3:** Provides the `AutonomousAgentNode` UI card and `AutonomousConfigPanel`. The `autonomous_agent` node type must be registered in the orchestrator (this section) before the frontend can use it.