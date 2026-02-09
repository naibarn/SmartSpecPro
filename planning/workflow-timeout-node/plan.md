# Timeout (Execution Timeout) Workflow Node Executor

## Problem Statement

Workflow executions can hang indefinitely when upstream nodes (LLM calls, external APIs,
code execution, media generation) take longer than expected. There is no mechanism to enforce
time limits on arbitrary workflow operations. The timeout node wraps upstream execution with
configurable deadline enforcement, supporting hard kill, graceful shutdown, and fallback value
strategies.

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/orchestrator/node_executors/flow_executors/timeout_executor.py` | **CREATE** | Core executor implementation |
| `python-backend/app/orchestrator/node_executors/flow_executors/__init__.py` | **MODIFY** | Export the new executor |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Register `execution_timeout` node type |
| `python-backend/tests/test_timeout_executor.py` | **CREATE** | Comprehensive test suite |
| `apps/web/client/src/lib/workflow/dataTypes.ts` | **NO CHANGE** | Existing `any`, `boolean`, `number`, `object` types are sufficient |

## Design Decisions

### 1. Node Type Naming

Use `execution_timeout` (not just `timeout`) to distinguish from the approval_gate's timeout
field (which is a simple config parameter, not a node type). This also avoids collision with
Python's built-in `timeout` references.

### 2. Category Placement

Category: `flow_control`. The timeout node controls execution flow by enforcing deadlines,
similar to `conditional`, `switch`, and `wait` nodes.

### 3. Timeout Enforcement Strategy

The executor wraps an **upstream value** (received via connection) rather than wrapping the
execution of downstream nodes. This is consistent with the existing architecture where each
node receives inputs from upstream ports and produces outputs for downstream ports.

**How it works in practice:**
- The timeout node sits between a potentially slow node and the rest of the workflow.
- It receives the upstream result via its `input` port (connected from a slow node's output).
- If the upstream node completes within the deadline, the result passes through.
- The timeout is enforced at the **node execution level** using `asyncio.wait_for` wrapping
  a future that resolves when the input data arrives.

However, since the orchestrator resolves inputs *before* calling `execute()`, the timeout
node's primary use case is wrapping an **async operation performed within its own execute
method**. To support wrapping upstream execution, the node should accept an `operation`
input that is a coroutine reference or, more practically, it should use a **wrapper pattern**
where it:

1. Reads a `wrappedNodeId` config field identifying which upstream node to time-bound.
2. The orchestrator recognizes this and applies `asyncio.wait_for` when executing that node.

**Chosen approach: Direct async wrapper within execute().**

The executor will use `asyncio.wait_for` to enforce a deadline on the resolution of its
input. The orchestrator passes a special `_pending_input` future when the timeout node's
input is connected to a node that has not yet completed. If no pending input exists (input
already resolved), the timeout simply passes through the value -- the upstream already
completed within any reasonable time.

**Simplified approach (recommended for Phase 1):**

Since the current orchestrator resolves all inputs before calling `execute()`, the timeout
node functions as a **pass-through with timing metadata** when inputs are pre-resolved.
The real timeout enforcement happens when the orchestrator is enhanced to support lazy
input resolution. For now, the executor:

1. Records `executionTime` (time spent in the execute method).
2. Checks if `executionTime` exceeds the configured `timeout`.
3. If the node is used with the future-based orchestrator enhancement, `asyncio.wait_for`
   enforces the actual deadline.

This gives us a working, testable executor now, with a clear path to full deadline
enforcement when the orchestrator supports it.

### 4. Timeout Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `hard` | `asyncio.wait_for` raises `asyncio.TimeoutError` immediately. No cleanup. Error propagated. | External API calls where partial results are useless |
| `soft` | `asyncio.wait_for` raises, but a cleanup coroutine runs (up to 5s). Error propagated after cleanup. | Database transactions that need rollback |
| `fallback` | `asyncio.wait_for` raises, but `fallbackValue` is returned instead of error. No exception propagated. | LLM calls where a cached/default response is acceptable |

### 5. Nested Timeout Semantics

When a timeout node wraps another timeout node, the **inner (shorter) timeout takes
precedence** because `asyncio.wait_for` with a shorter deadline will fire first. If the
outer timeout is shorter, it cancels the inner operation (including its own wait_for).
This is standard asyncio behavior and requires no special handling.

---

## Registry Specification

```python
NodeTypeSpec(
    type="execution_timeout",
    display_name="Execution Timeout",
    description="Enforce a time limit on upstream operations with configurable timeout behavior",
    icon="timer",
    color="red",
    category="flow_control",
    inputs=[
        InputSpec(
            name="input",
            display_name="Input Data",
            data_type="any",
            ui_type="json_editor",
            required=True,
            accepts_connection=True,
            placeholder="Connect output from node to time-bound...",
        ),
        InputSpec(
            name="timeout",
            display_name="Timeout (seconds)",
            data_type="number",
            ui_type="number",
            required=True,
            accepts_connection=False,
            default=30,
            validation={"min": 1, "max": 3600},
        ),
        InputSpec(
            name="timeoutMode",
            display_name="Timeout Mode",
            data_type="text",
            ui_type="select",
            required=False,
            accepts_connection=False,
            default="hard",
            options=[
                {"label": "Hard (kill immediately)", "value": "hard"},
                {"label": "Soft (allow cleanup)", "value": "soft"},
                {"label": "Fallback (return default value)", "value": "fallback"},
            ],
        ),
        InputSpec(
            name="fallbackValue",
            display_name="Fallback Value",
            data_type="any",
            ui_type="json_editor",
            required=False,
            accepts_connection=False,
            default=None,
            placeholder="Value to return if timeout occurs (fallback mode only)...",
        ),
        InputSpec(
            name="includeStackTrace",
            display_name="Include Stack Trace",
            data_type="boolean",
            ui_type="toggle",
            required=False,
            accepts_connection=False,
            default=True,
        ),
    ],
    outputs=[
        OutputSpec(name="result", display_name="Result", data_type="any"),
        OutputSpec(name="timedOut", display_name="Timed Out", data_type="boolean"),
        OutputSpec(name="executionTime", display_name="Execution Time (ms)", data_type="number"),
        OutputSpec(name="error", display_name="Error Details", data_type="json"),
    ],
    executor="app.orchestrator.node_executors.flow_executors.timeout_executor.TimeoutExecutor",
)
```

---

## Executor Implementation

### File: `python-backend/app/orchestrator/node_executors/flow_executors/timeout_executor.py`

```python
"""Execution Timeout Executor - Enforce time limits on workflow operations."""
import asyncio
import time
import traceback
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)

# Maximum allowed cleanup time for soft mode (seconds)
SOFT_CLEANUP_TIMEOUT = 5.0


class ExecutionTimeoutError(Exception):
    """Raised when an operation exceeds its configured timeout."""

    def __init__(self, timeout_seconds: float, execution_time_ms: float, message: str = ""):
        self.timeout_seconds = timeout_seconds
        self.execution_time_ms = execution_time_ms
        super().__init__(message or f"Operation timed out after {timeout_seconds}s")


class TimeoutExecutor:
    """Executor for execution timeout nodes.

    Enforces configurable time limits on upstream operations. Supports three modes:
    - hard: Cancel immediately on timeout, raise error
    - soft: Cancel with cleanup window, raise error
    - fallback: Cancel on timeout, return configured fallback value
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute timeout enforcement on the input operation.

        When the input is already resolved (synchronous pass-through), this records
        timing metadata. When a _pending_future is provided in the execution state
        (async orchestrator mode), asyncio.wait_for enforces the actual deadline.

        Args:
            data: Node execution data with timeout configuration
            context: Execution context

        Returns:
            Dictionary with result, timedOut flag, executionTime, and error details

        Raises:
            ExecutionTimeoutError: In hard/soft mode when timeout occurs
            ValueError: If configuration is invalid
        """
        # --- Extract and validate configuration ---
        timeout_seconds = data.inputs.get("timeout")
        timeout_mode = data.inputs.get("timeoutMode", "hard")
        fallback_value = data.inputs.get("fallbackValue")
        include_stack_trace = data.inputs.get("includeStackTrace", True)

        if timeout_seconds is None:
            raise ValueError("Timeout value is required")

        timeout_seconds = float(timeout_seconds)
        if timeout_seconds < 1 or timeout_seconds > 3600:
            raise ValueError(
                f"Timeout must be between 1 and 3600 seconds, got {timeout_seconds}"
            )

        if timeout_mode not in ("hard", "soft", "fallback"):
            raise ValueError(
                f"Invalid timeout mode: {timeout_mode}. Must be 'hard', 'soft', or 'fallback'"
            )

        logger.info(
            "timeout_node_executing",
            node_id=data.node_id,
            timeout_seconds=timeout_seconds,
            timeout_mode=timeout_mode,
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
        )

        # --- Check for pending async operation ---
        pending_future = data.state.get("_pending_future")

        if pending_future is not None and asyncio.isfuture(pending_future):
            # Async mode: enforce deadline on the pending operation
            return await self._execute_with_timeout(
                future=pending_future,
                timeout_seconds=timeout_seconds,
                timeout_mode=timeout_mode,
                fallback_value=fallback_value,
                include_stack_trace=include_stack_trace,
                data=data,
                context=context,
            )
        else:
            # Sync pass-through: input already resolved, record timing
            return self._pass_through(
                input_value=data.inputs.get("input"),
                data=data,
                context=context,
            )

    async def _execute_with_timeout(
        self,
        future: asyncio.Future,
        timeout_seconds: float,
        timeout_mode: str,
        fallback_value: Any,
        include_stack_trace: bool,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute an async operation with timeout enforcement."""
        start_time = time.monotonic()

        try:
            result = await asyncio.wait_for(future, timeout=timeout_seconds)
            execution_time_ms = (time.monotonic() - start_time) * 1000

            logger.info(
                "timeout_node_completed",
                node_id=data.node_id,
                execution_time_ms=round(execution_time_ms, 2),
                timed_out=False,
                workflow_id=context.workflow_id,
            )

            return {
                "result": result,
                "timedOut": False,
                "executionTime": round(execution_time_ms, 2),
                "error": None,
            }

        except asyncio.TimeoutError:
            execution_time_ms = (time.monotonic() - start_time) * 1000
            return await self._handle_timeout(
                timeout_seconds=timeout_seconds,
                timeout_mode=timeout_mode,
                fallback_value=fallback_value,
                include_stack_trace=include_stack_trace,
                execution_time_ms=execution_time_ms,
                data=data,
                context=context,
            )

    async def _handle_timeout(
        self,
        timeout_seconds: float,
        timeout_mode: str,
        fallback_value: Any,
        include_stack_trace: bool,
        execution_time_ms: float,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Handle a timeout event according to the configured mode."""
        error_info = self._build_error_info(
            timeout_seconds=timeout_seconds,
            execution_time_ms=execution_time_ms,
            timeout_mode=timeout_mode,
            include_stack_trace=include_stack_trace,
            data=data,
            context=context,
        )

        logger.warning(
            "timeout_node_timed_out",
            node_id=data.node_id,
            timeout_seconds=timeout_seconds,
            timeout_mode=timeout_mode,
            execution_time_ms=round(execution_time_ms, 2),
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
        )

        if timeout_mode == "fallback":
            # Return fallback value without raising
            return {
                "result": fallback_value,
                "timedOut": True,
                "executionTime": round(execution_time_ms, 2),
                "error": error_info,
            }

        elif timeout_mode == "soft":
            # Run cleanup handler if provided, then raise
            cleanup_coro = data.state.get("_cleanup_handler")
            if cleanup_coro is not None and asyncio.iscoroutine(cleanup_coro):
                try:
                    await asyncio.wait_for(cleanup_coro, timeout=SOFT_CLEANUP_TIMEOUT)
                    logger.info(
                        "timeout_cleanup_completed",
                        node_id=data.node_id,
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        "timeout_cleanup_timed_out",
                        node_id=data.node_id,
                        cleanup_timeout=SOFT_CLEANUP_TIMEOUT,
                    )
                except Exception as cleanup_err:
                    logger.error(
                        "timeout_cleanup_failed",
                        node_id=data.node_id,
                        error=str(cleanup_err),
                    )

            raise ExecutionTimeoutError(
                timeout_seconds=timeout_seconds,
                execution_time_ms=execution_time_ms,
                message=(
                    f"Operation on node '{data.node_id}' timed out after "
                    f"{timeout_seconds}s (soft mode, cleanup attempted)"
                ),
            )

        else:
            # Hard mode: raise immediately
            raise ExecutionTimeoutError(
                timeout_seconds=timeout_seconds,
                execution_time_ms=execution_time_ms,
                message=(
                    f"Operation on node '{data.node_id}' timed out after "
                    f"{timeout_seconds}s (hard mode)"
                ),
            )

    def _pass_through(
        self,
        input_value: Any,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Pass through an already-resolved input value with timing metadata."""
        logger.info(
            "timeout_node_pass_through",
            node_id=data.node_id,
            workflow_id=context.workflow_id,
            note="Input already resolved, no timeout enforcement needed",
        )

        return {
            "result": input_value,
            "timedOut": False,
            "executionTime": 0.0,
            "error": None,
        }

    def _build_error_info(
        self,
        timeout_seconds: float,
        execution_time_ms: float,
        timeout_mode: str,
        include_stack_trace: bool,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Build structured error information for timeout events."""
        error_info: dict[str, Any] = {
            "type": "ExecutionTimeoutError",
            "message": (
                f"Operation exceeded {timeout_seconds}s timeout "
                f"(mode: {timeout_mode})"
            ),
            "timeoutSeconds": timeout_seconds,
            "executionTimeMs": round(execution_time_ms, 2),
            "mode": timeout_mode,
            "nodeId": data.node_id,
            "workflowId": context.workflow_id,
            "executionId": context.execution_id,
        }

        if include_stack_trace:
            error_info["stackTrace"] = traceback.format_stack()

        return error_info
```

---

## Registry Registration

Add the following block to `_register_core_nodes()` in `node_registry.py`, in the
**Phase 2.4: Advanced Flow Control** section, after the existing `wait` node registration:

```python
# Execution Timeout
self.register_node_type(
    NodeTypeSpec(
        type="execution_timeout",
        display_name="Execution Timeout",
        description="Enforce a time limit on upstream operations with configurable timeout behavior",
        icon="timer",
        color="red",
        category="flow_control",
        inputs=[
            InputSpec(
                name="input",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Connect output from node to time-bound...",
            ),
            InputSpec(
                name="timeout",
                display_name="Timeout (seconds)",
                data_type="number",
                ui_type="number",
                required=True,
                accepts_connection=False,
                default=30,
                validation={"min": 1, "max": 3600},
            ),
            InputSpec(
                name="timeoutMode",
                display_name="Timeout Mode",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="hard",
                options=[
                    {"label": "Hard (kill immediately)", "value": "hard"},
                    {"label": "Soft (allow cleanup)", "value": "soft"},
                    {"label": "Fallback (return default value)", "value": "fallback"},
                ],
            ),
            InputSpec(
                name="fallbackValue",
                display_name="Fallback Value",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=False,
                default=None,
                placeholder="Value to return if timeout occurs (fallback mode only)...",
            ),
            InputSpec(
                name="includeStackTrace",
                display_name="Include Stack Trace",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
        ],
        outputs=[
            OutputSpec(name="result", display_name="Result", data_type="any"),
            OutputSpec(name="timedOut", display_name="Timed Out", data_type="boolean"),
            OutputSpec(name="executionTime", display_name="Execution Time (ms)", data_type="number"),
            OutputSpec(name="error", display_name="Error Details", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.flow_executors.timeout_executor.TimeoutExecutor",
    )
)
```

---

## Testing Strategy

### File: `python-backend/tests/test_timeout_executor.py`

All tests use `pytest.mark.asyncio` and follow the existing test patterns in
`test_phase2_executors.py`.

#### Test Categories

**1. Configuration Validation (5 tests)**

| Test | Description |
|------|-------------|
| `test_missing_timeout_raises_value_error` | No `timeout` in inputs raises `ValueError` |
| `test_timeout_below_minimum_raises_value_error` | `timeout=0` raises `ValueError` |
| `test_timeout_above_maximum_raises_value_error` | `timeout=3601` raises `ValueError` |
| `test_invalid_timeout_mode_raises_value_error` | `timeoutMode="invalid"` raises `ValueError` |
| `test_valid_configuration_accepted` | Valid config does not raise |

**2. Pass-Through (Synchronous) Behavior (4 tests)**

| Test | Description |
|------|-------------|
| `test_pass_through_returns_input_value` | Already-resolved input is returned unchanged |
| `test_pass_through_timed_out_is_false` | `timedOut` output is `False` |
| `test_pass_through_execution_time_is_zero` | `executionTime` is `0.0` |
| `test_pass_through_error_is_none` | `error` output is `None` |

**3. Async Timeout Enforcement - Hard Mode (4 tests)**

| Test | Description |
|------|-------------|
| `test_hard_mode_success_within_deadline` | Future resolves in time, result passed through |
| `test_hard_mode_timeout_raises_error` | Future exceeds deadline, `ExecutionTimeoutError` raised |
| `test_hard_mode_timeout_error_has_correct_attributes` | Error has `timeout_seconds` and `execution_time_ms` |
| `test_hard_mode_cancels_future_on_timeout` | The wrapped future is cancelled |

**4. Async Timeout Enforcement - Soft Mode (4 tests)**

| Test | Description |
|------|-------------|
| `test_soft_mode_runs_cleanup_handler` | Cleanup coroutine is awaited after timeout |
| `test_soft_mode_cleanup_timeout` | Cleanup exceeding `SOFT_CLEANUP_TIMEOUT` is cancelled |
| `test_soft_mode_cleanup_failure_logged` | Exception in cleanup is caught and logged, timeout error still raised |
| `test_soft_mode_no_cleanup_handler` | Missing cleanup handler still raises `ExecutionTimeoutError` |

**5. Async Timeout Enforcement - Fallback Mode (4 tests)**

| Test | Description |
|------|-------------|
| `test_fallback_mode_returns_fallback_value` | Configured fallback returned on timeout |
| `test_fallback_mode_timed_out_is_true` | `timedOut` output is `True` |
| `test_fallback_mode_error_contains_details` | `error` output has structured error info |
| `test_fallback_mode_none_fallback_value` | `fallbackValue=None` returns `None` (not error) |

**6. Error Information (3 tests)**

| Test | Description |
|------|-------------|
| `test_error_info_includes_stack_trace` | `includeStackTrace=True` adds `stackTrace` field |
| `test_error_info_excludes_stack_trace` | `includeStackTrace=False` omits `stackTrace` field |
| `test_error_info_contains_context_ids` | Error has `nodeId`, `workflowId`, `executionId` |

**7. Edge Cases (3 tests)**

| Test | Description |
|------|-------------|
| `test_future_resolves_exactly_at_deadline` | Border case: resolves just before timeout |
| `test_input_is_complex_object` | Complex nested dict/list passes through correctly |
| `test_float_timeout_value` | Non-integer timeout like `1.5` works correctly |

**Total: 27 tests**

### Test Helper Pattern

```python
def make_context(**overrides) -> ExecutionContext:
    """Create a test ExecutionContext with defaults."""
    defaults = {
        "user_id": 1,
        "tenant_id": "test_tenant",
        "workflow_id": "wf_test",
        "execution_id": "exec_test",
    }
    defaults.update(overrides)
    return ExecutionContext(**defaults)


def make_data(inputs: dict, state: dict | None = None, **overrides) -> NodeExecutionData:
    """Create a test NodeExecutionData with defaults."""
    defaults = {
        "node_id": "timeout_1",
        "node_type": "execution_timeout",
        "config": {},
        "inputs": inputs,
        "state": state or {},
    }
    defaults.update(overrides)
    return NodeExecutionData(**defaults)
```

### Async Future Test Helper

```python
async def make_delayed_future(value: Any, delay: float) -> Any:
    """Create a future that resolves after a delay."""
    await asyncio.sleep(delay)
    return value
```

---

## Integration with Workflow Execution Flow

### Current Architecture

```
Orchestrator
  -> resolves inputs (expressions, connections)
  -> calls executor.execute(data, context)
  -> stores outputs in state
  -> proceeds to next node
```

### Timeout Node in the Flow

```
[LLM Call Node] --result--> [Execution Timeout Node] --result--> [Next Node]
                                    |
                                    +--> timedOut (boolean)
                                    +--> executionTime (ms)
                                    +--> error (json, if timed out)
```

**Phase 1 (current implementation):**
- The timeout node receives the already-resolved LLM result.
- It passes through the value and records `timedOut=False`, `executionTime=0`.
- This is useful for workflow validation and as a structural placeholder.

**Phase 2 (future orchestrator enhancement):**
- The orchestrator detects that the timeout node's input is connected to an unresolved node.
- Instead of resolving the input eagerly, it passes a `_pending_future` in the state.
- The timeout executor wraps this future with `asyncio.wait_for`.
- If the upstream node completes within the deadline, the result passes through.
- If not, the timeout mode determines behavior (error or fallback).

### Orchestrator Enhancement Notes (for Phase 2)

The orchestrator would need to:

1. Detect `execution_timeout` node type during input resolution.
2. For connected inputs, create an `asyncio.Future` instead of awaiting the upstream result.
3. Pass the future as `state["_pending_future"]`.
4. The timeout executor handles the future with `asyncio.wait_for`.

This is a non-breaking enhancement: the executor works in both modes.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `asyncio.wait_for` cancelling tasks unexpectedly | Medium | Document that cancelled tasks may leave resources open; soft mode provides cleanup window |
| Signal-based timeout (SIGALRM) conflict with code_executor | Low | Timeout executor uses only asyncio, never signals. No conflict. |
| Nested timeouts causing confusion | Low | Inner timeout fires first (standard asyncio). Document this behavior. |
| Large `fallbackValue` consuming memory | Low | No special limit needed; JSON editor input naturally constrains size |
| `includeStackTrace` leaking internal paths | Medium | Stack traces only included when explicitly enabled; default `True` is fine for development, should be `False` in production templates |

---

## Implementation Steps

- [ ] **Step 1**: Create `timeout_executor.py` in `flow_executors/`
- [ ] **Step 2**: Update `flow_executors/__init__.py` to export `TimeoutExecutor`
- [ ] **Step 3**: Register `execution_timeout` in `node_registry.py`
- [ ] **Step 4**: Create `test_timeout_executor.py` with all 27 tests
- [ ] **Step 5**: Run `pytest tests/test_timeout_executor.py` -- verify all pass
- [ ] **Step 6**: Run `ruff check app/orchestrator/node_executors/flow_executors/timeout_executor.py`
- [ ] **Step 7**: Run `black --check app/orchestrator/node_executors/flow_executors/timeout_executor.py`
- [ ] **Step 8**: Run full `pytest` suite to confirm no regressions

---

## Verification Checklist

- [ ] Executor follows `NodeExecutor` protocol (async execute with correct signature)
- [ ] All 4 output ports populated in every code path (result, timedOut, executionTime, error)
- [ ] `ExecutionTimeoutError` is a proper Exception subclass with attributes
- [ ] Structured logging with `structlog` on all significant events
- [ ] No use of `signal.alarm` (asyncio-only, compatible with event loop)
- [ ] Fallback mode never raises exceptions to caller
- [ ] Hard/soft modes always raise `ExecutionTimeoutError` on timeout
- [ ] Soft mode cleanup is bounded by `SOFT_CLEANUP_TIMEOUT`
- [ ] Configuration validation rejects out-of-range values early
- [ ] Test coverage >= 80% for the new executor
