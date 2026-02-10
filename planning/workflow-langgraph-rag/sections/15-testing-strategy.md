Now I have all the context I need. Let me generate the comprehensive section content.

# Section 15 -- Testing Strategy

## Overview

This section defines the comprehensive testing strategy for the SmartSpecPro workflow engine rebuild. It establishes shared test infrastructure, the `ExecutorTestContract` base class, per-section test file templates, security test suites, integration test patterns, and coverage enforcement. Every new component introduced in Sections 1-14 and 16 must meet the quality gates defined here.

**Coverage target**: 80% minimum overall (enforced by `pytest-cov`), 100% on security-critical code paths (SSRF validation, SQL allowlist, code sandbox, secret scrubbing, expression engine security).

---

## Dependencies

| Dependency | Section | What is needed |
|---|---|---|
| Runtime core | Section 01 | `LangGraphRuntime`, `WorkflowCompiler`, `node_adapter`, `WorkflowState` |
| Streaming | Section 02 | SSE event translation, ring buffer |
| HITL | Section 03 | `interrupt()`, `Command(resume=...)` |
| Trigger nodes | Section 04 | Manual, Webhook, Schedule, Queue trigger executors |
| I/O nodes | Section 05 | HTTP Request, DB Query, Storage, Notification, Webhook Response executors |
| Data nodes | Section 06 | Set, Map, Filter, If, Switch, Merge, Split, Batch, Transform, Validate executors |
| Reliability nodes | Section 07 | Retry, Rate Limiter, Circuit Breaker, Idempotency, DLQ, Checkpoint executors |
| Security nodes | Section 08 | Secrets Vault, RBAC, Audit, Logging, Metrics, Run History executors |
| Code nodes | Section 09 | Code sandbox (Python + JS) |
| Cache system | Section 10 | `WorkflowCacheService`, cache middleware |
| DB schema | Section 13 | New tables (workflow_executions, DLQ, audit_events, etc.) |
| API endpoints | Section 14 | `/compile`, `/execute`, `/stream`, `/resume`, `/dlq` |
| Backward compat | Section 16 | Adapter wrapping, old format acceptance |

---

## Test File Organization

All test files live under `/home/dev/projects/SmartSpecPro/python-backend/tests/`. The new directory structure:

```
python-backend/tests/
  conftest.py                          # Extended with workflow engine fixtures
  executor_test_base.py                # ExecutorTestContract base class (NEW)
  test_langgraph_runtime.py            # Section 01 - Runtime core tests
  test_workflow_compiler.py            # Section 01 - Compiler tests
  test_expression_engine.py            # Section 01 - Expression engine tests
  test_streaming.py                    # Section 02 - SSE streaming tests
  test_hitl.py                         # Section 03 - Human-in-the-loop tests
  test_cache.py                        # Section 10 - Cache system tests
  test_schema.py                       # Section 13 - DB schema tests
  test_api_workflows.py                # Section 14 - API endpoint tests
  test_backward_compat.py              # Section 16 - Backward compatibility tests
  test_node_executors/                 # Sections 04-09 - Per-executor tests
    __init__.py
    test_triggers.py                   # Section 04
    test_io.py                         # Section 05
    test_data.py                       # Section 06
    test_reliability.py                # Section 07
    test_security.py                   # Section 08
    test_code_sandbox.py               # Section 09
  test_security/                       # Cross-cutting security tests
    __init__.py
    test_ssrf.py                       # SSRF blocking validation
    test_sql_safety.py                 # SQL operation allowlist
    test_sandbox_escape.py             # Code sandbox escape attempts
    test_secret_propagation.py         # Secret scrubbing from state/checkpoints
  integration/
    test_workflow_e2e.py               # E2E workflow tests (expand existing)
```

---

## Shared Test Infrastructure

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/conftest.py` (Additions)

Append the following fixtures to the existing `conftest.py`. These provide mock objects for the new workflow engine components without requiring live PostgreSQL or Redis.

```python
# =============================================================================
# Workflow Engine Test Fixtures (Added for Sections 01-16)
# =============================================================================

import uuid
from dataclasses import field as dataclass_field
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


@pytest.fixture
def mock_execution_context() -> ExecutionContext:
    """Create a standard ExecutionContext for executor unit tests.

    Provides a fully populated context with test defaults.
    All fields are overridable by passing kwargs to the dataclass.
    """
    return ExecutionContext(
        user_id=1,
        tenant_id="test-tenant-001",
        workflow_id="wf-test-001",
        execution_id=f"exec-{uuid.uuid4().hex[:12]}",
        credits_available=10000,
        extra_data={},
    )


@pytest.fixture
def mock_node_data() -> NodeExecutionData:
    """Create a standard NodeExecutionData for executor unit tests.

    Provides a minimal node execution data object. Tests should
    override config/inputs as needed for their specific executor.
    """
    return NodeExecutionData(
        node_id="node-test-001",
        node_type="test_node",
        config={},
        inputs={},
        state={},
    )


def make_node_data(
    node_id: str = "node-test-001",
    node_type: str = "test_node",
    config: dict | None = None,
    inputs: dict | None = None,
    state: dict | None = None,
) -> NodeExecutionData:
    """Factory function for creating NodeExecutionData with custom values.

    This is not a fixture -- it is imported directly by tests that
    need to construct multiple data objects in a single test case.
    """
    return NodeExecutionData(
        node_id=node_id,
        node_type=node_type,
        config=config or {},
        inputs=inputs or {},
        state=state or {},
    )


@pytest.fixture
def mock_workflow_state() -> dict:
    """Create a standard WorkflowState dict for compiler/runtime tests.

    Matches the TypedDict shape defined in Section 01.
    """
    return {
        "node_outputs": {},
        "current_node": "",
        "messages": [],
        "errors": [],
        "audit_trail": [],
        "cache_hits": 0,
        "schema_version": 1,
    }


@pytest.fixture
def simple_workflow_json() -> dict:
    """Create a minimal ReactFlow workflow JSON for compiler tests.

    Three-node linear workflow: manual_trigger -> set_fields -> webhook_response.
    """
    return {
        "nodes": [
            {
                "id": "trigger-1",
                "type": "manual_trigger",
                "position": {"x": 0, "y": 0},
                "data": {"config": {}},
            },
            {
                "id": "set-1",
                "type": "set_fields",
                "position": {"x": 200, "y": 0},
                "data": {
                    "config": {
                        "fields": [
                            {"name": "greeting", "operation": "set", "value": "Hello, World!"}
                        ]
                    }
                },
            },
            {
                "id": "response-1",
                "type": "webhook_response",
                "position": {"x": 400, "y": 0},
                "data": {"config": {"status_code": 200}},
            },
        ],
        "edges": [
            {"id": "e1", "source": "trigger-1", "target": "set-1"},
            {"id": "e2", "source": "set-1", "target": "response-1"},
        ],
    }


@pytest.fixture
def branching_workflow_json() -> dict:
    """Create a branching workflow JSON for compiler tests.

    Trigger -> If -> (true: set_fields_a, false: set_fields_b) -> merge -> response.
    """
    return {
        "nodes": [
            {
                "id": "trigger-1",
                "type": "manual_trigger",
                "position": {"x": 0, "y": 0},
                "data": {"config": {}},
            },
            {
                "id": "if-1",
                "type": "if",
                "position": {"x": 200, "y": 0},
                "data": {
                    "config": {
                        "condition": {
                            "field": "{{trigger-1.value}}",
                            "operator": "==",
                            "value": "yes",
                        }
                    }
                },
            },
            {
                "id": "set-true",
                "type": "set_fields",
                "position": {"x": 400, "y": -100},
                "data": {"config": {"fields": [{"name": "branch", "operation": "set", "value": "true"}]}},
            },
            {
                "id": "set-false",
                "type": "set_fields",
                "position": {"x": 400, "y": 100},
                "data": {"config": {"fields": [{"name": "branch", "operation": "set", "value": "false"}]}},
            },
            {
                "id": "response-1",
                "type": "webhook_response",
                "position": {"x": 600, "y": 0},
                "data": {"config": {"status_code": 200}},
            },
        ],
        "edges": [
            {"id": "e1", "source": "trigger-1", "target": "if-1"},
            {"id": "e2", "source": "if-1", "target": "set-true", "sourceHandle": "true"},
            {"id": "e3", "source": "if-1", "target": "set-false", "sourceHandle": "false"},
            {"id": "e4", "source": "set-true", "target": "response-1"},
            {"id": "e5", "source": "set-false", "target": "response-1"},
        ],
    }


@pytest.fixture
def cyclic_workflow_json() -> dict:
    """Create a cyclic workflow JSON that should fail compilation.

    Trigger -> A -> B -> A (cycle).
    """
    return {
        "nodes": [
            {"id": "trigger-1", "type": "manual_trigger", "position": {"x": 0, "y": 0}, "data": {"config": {}}},
            {"id": "a", "type": "set_fields", "position": {"x": 200, "y": 0}, "data": {"config": {}}},
            {"id": "b", "type": "set_fields", "position": {"x": 400, "y": 0}, "data": {"config": {}}},
        ],
        "edges": [
            {"id": "e1", "source": "trigger-1", "target": "a"},
            {"id": "e2", "source": "a", "target": "b"},
            {"id": "e3", "source": "b", "target": "a"},
        ],
    }


class MockWorkflowRedis:
    """Extended mock Redis with workflow-specific operations.

    Supports SET NX (for cache stampede protection), TTL tracking,
    hash operations for circuit breaker state, and pipelining.
    Inherits the pattern from the existing MockRedisClient in conftest.py.
    """

    def __init__(self):
        self._data: dict[str, Any] = {}
        self._ttls: dict[str, int] = {}
        self._hashes: dict[str, dict[str, Any]] = {}
        self._locks: set[str] = set()

    async def get(self, key: str) -> str | None:
        value = self._data.get(key)
        return str(value) if value is not None else None

    async def set(self, key: str, value: Any, ex: int | None = None, nx: bool = False) -> bool:
        if nx and key in self._data:
            return False
        self._data[key] = value
        if ex:
            self._ttls[key] = ex
        return True

    async def delete(self, *keys: str) -> int:
        count = 0
        for key in keys:
            if key in self._data:
                del self._data[key]
                count += 1
        return count

    async def incr(self, key: str) -> int:
        if key not in self._data:
            self._data[key] = 0
        self._data[key] += 1
        return self._data[key]

    async def expire(self, key: str, seconds: int) -> bool:
        self._ttls[key] = seconds
        return True

    async def ttl(self, key: str) -> int:
        return self._ttls.get(key, -1)

    async def hget(self, name: str, key: str) -> str | None:
        h = self._hashes.get(name, {})
        val = h.get(key)
        return str(val) if val is not None else None

    async def hset(self, name: str, key: str, value: Any) -> int:
        if name not in self._hashes:
            self._hashes[name] = {}
        self._hashes[name][key] = value
        return 1

    async def hgetall(self, name: str) -> dict:
        return self._hashes.get(name, {})

    def pipeline(self):
        return MockRedisPipeline(self._data, self._ttls)


@pytest.fixture
def workflow_redis() -> MockWorkflowRedis:
    """Provide a mock Redis client with workflow-specific operations.

    Supports SET NX for stampede protection, hash operations for
    circuit breaker state, and standard key/value operations.
    """
    return MockWorkflowRedis()


@pytest.fixture
def mock_checkpointer():
    """Provide a mock AsyncPostgresSaver for runtime tests.

    Returns an AsyncMock that simulates checkpoint storage without
    requiring a real PostgreSQL connection.
    """
    checkpointer = AsyncMock()
    checkpointer.setup = AsyncMock()
    checkpointer.aget = AsyncMock(return_value=None)
    checkpointer.aput = AsyncMock()
    checkpointer.alist = AsyncMock(return_value=[])
    return checkpointer
```

---

## ExecutorTestContract Base Class

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/executor_test_base.py`

This is the shared test contract that every node executor test class must inherit. It provides five standard tests that are automatically run for every executor, ensuring consistent behavior across all 33+ node types.

```python
"""
Executor Test Contract -- shared base class for all node executor tests.

Every executor test class MUST inherit from ExecutorTestContract and set:
  - executor_class: The executor class to instantiate
  - valid_config: A dict of valid configuration for the executor
  - valid_input: A dict of valid input data for the executor
  - expected_output_keys: A set of expected output key names

The contract provides 5 standard tests that run automatically:
  1. test_returns_dict -- executor returns a dict
  2. test_handles_missing_required_input -- graceful error on missing input
  3. test_handles_invalid_input_type -- graceful error on wrong type
  4. test_respects_timeout -- execution does not hang indefinitely
  5. test_output_keys_match_output_spec -- output keys match specification
"""

import asyncio
import uuid
from typing import Any

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ExecutorTestContract:
    """Base test contract that every executor test class must inherit.

    Subclasses MUST define these class attributes:
        executor_class (type): The executor class under test.
        valid_config (dict): A valid configuration dict for the executor.
        valid_input (dict): A valid input dict for the executor.
        expected_output_keys (set[str]): Keys expected in the output dict.
        timeout_seconds (float): Max seconds for test_respects_timeout (default 5.0).
    """

    executor_class: type
    valid_config: dict[str, Any]
    valid_input: dict[str, Any]
    expected_output_keys: set[str] = set()
    timeout_seconds: float = 5.0

    def _make_context(self) -> ExecutionContext:
        """Create a standard ExecutionContext for contract tests."""
        return ExecutionContext(
            user_id=1,
            tenant_id="test-tenant",
            workflow_id="wf-contract-test",
            execution_id=f"exec-{uuid.uuid4().hex[:12]}",
            credits_available=10000,
        )

    def _make_data(
        self,
        config: dict | None = None,
        inputs: dict | None = None,
    ) -> NodeExecutionData:
        """Create NodeExecutionData with optional overrides."""
        return NodeExecutionData(
            node_id="node-contract-test",
            node_type=getattr(self, "node_type", "test"),
            config=config if config is not None else self.valid_config,
            inputs=inputs if inputs is not None else self.valid_input,
            state={},
        )

    def _make_executor(self):
        """Instantiate the executor under test."""
        return self.executor_class()

    @pytest.mark.asyncio
    async def test_returns_dict(self):
        """Contract: executor.execute() MUST return a dict."""
        executor = self._make_executor()
        context = self._make_context()
        data = self._make_data()
        result = await executor.execute(data, context)
        assert isinstance(result, dict), (
            f"{self.executor_class.__name__}.execute() returned "
            f"{type(result).__name__}, expected dict"
        )

    @pytest.mark.asyncio
    async def test_handles_missing_required_input(self):
        """Contract: executor MUST handle empty inputs gracefully.

        It should either raise a known error type or return an error
        dict -- it must NOT raise an unhandled exception like KeyError
        or TypeError.
        """
        executor = self._make_executor()
        context = self._make_context()
        data = self._make_data(inputs={})

        try:
            result = await executor.execute(data, context)
            # If it returns, it should be a dict (possibly with error info)
            assert isinstance(result, dict)
        except (ValueError, KeyError, TypeError):
            # Known error types are acceptable
            pass
        except Exception as e:
            # Allow executor-defined error classes
            error_name = type(e).__name__
            assert "Error" in error_name or "Exception" in error_name, (
                f"{self.executor_class.__name__} raised unexpected "
                f"{error_name}: {e}"
            )

    @pytest.mark.asyncio
    async def test_handles_invalid_input_type(self):
        """Contract: executor MUST handle wrong input types gracefully.

        Passing a string where an object is expected (or vice versa)
        should raise a validation error, not crash with AttributeError.
        """
        executor = self._make_executor()
        context = self._make_context()
        data = self._make_data(inputs={"invalid_key": "not_the_right_type"})

        try:
            result = await executor.execute(data, context)
            assert isinstance(result, dict)
        except (ValueError, TypeError, KeyError):
            pass
        except Exception as e:
            error_name = type(e).__name__
            assert "Error" in error_name or "Exception" in error_name, (
                f"{self.executor_class.__name__} raised unexpected "
                f"{error_name}: {e}"
            )

    @pytest.mark.asyncio
    async def test_respects_timeout(self):
        """Contract: executor.execute() MUST complete within timeout_seconds.

        This verifies the executor does not hang indefinitely. The timeout
        is generous (default 5s) to account for test environment slowness.
        """
        executor = self._make_executor()
        context = self._make_context()
        data = self._make_data()

        try:
            await asyncio.wait_for(
                executor.execute(data, context),
                timeout=self.timeout_seconds,
            )
        except asyncio.TimeoutError:
            pytest.fail(
                f"{self.executor_class.__name__}.execute() did not complete "
                f"within {self.timeout_seconds}s timeout"
            )

    @pytest.mark.asyncio
    async def test_output_keys_match_output_spec(self):
        """Contract: output dict keys MUST match the declared output spec.

        If expected_output_keys is defined (non-empty), the returned dict
        must contain exactly those keys (no extra, no missing).
        If expected_output_keys is empty, this test is skipped.
        """
        if not self.expected_output_keys:
            pytest.skip("No expected_output_keys defined for this executor")

        executor = self._make_executor()
        context = self._make_context()
        data = self._make_data()
        result = await executor.execute(data, context)

        assert isinstance(result, dict)
        result_keys = set(result.keys())
        assert result_keys == self.expected_output_keys, (
            f"{self.executor_class.__name__} output keys mismatch.\n"
            f"  Expected: {self.expected_output_keys}\n"
            f"  Got:      {result_keys}\n"
            f"  Missing:  {self.expected_output_keys - result_keys}\n"
            f"  Extra:    {result_keys - self.expected_output_keys}"
        )
```

---

## Test File Templates

### Section 01: LangGraph Runtime Core

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_langgraph_runtime.py`

```python
"""
Tests for LangGraph Runtime Core (Section 01).

Covers:
- Compilation pipeline (ReactFlow JSON -> LangGraph StateGraph)
- Execution lifecycle (start, checkpoint, resume)
- Thread ID namespacing
- Concurrent workflow limits
- Large output externalization
"""

import asyncio

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.unit
class TestCompilation:
    """Compilation pipeline tests."""

    async def test_compile_simple_linear_workflow(self, simple_workflow_json):
        """ReactFlow JSON with 3 sequential nodes compiles to valid StateGraph."""
        # TODO: Import WorkflowCompiler, call compile(), assert result is a compiled app
        ...

    async def test_compile_branching_workflow(self, branching_workflow_json):
        """If/Switch nodes produce conditional edges in the compiled graph."""
        ...

    async def test_compile_parallel_fork_join(self):
        """Fork-join pattern creates parallel execution groups."""
        ...

    async def test_compile_rejects_cycle(self, cyclic_workflow_json):
        """Cyclic graph raises CompilationError."""
        # TODO: from app.orchestrator.workflow_compiler import CompilationError
        # with pytest.raises(CompilationError): compiler.compile(cyclic_workflow_json)
        ...

    async def test_compile_rejects_orphan_nodes(self):
        """Disconnected nodes raise CompilationError."""
        ...

    async def test_compile_rejects_missing_trigger(self):
        """No trigger node raises CompilationError."""
        ...

    async def test_compile_validates_port_types(self):
        """Incompatible port types raise CompilationError."""
        ...

    async def test_compile_warns_unreachable_nodes(self):
        """Unreachable nodes logged as warnings, not errors."""
        ...


@pytest.mark.integration
class TestExecution:
    """Runtime execution tests (require mock checkpointer)."""

    async def test_execute_simple_workflow(self, simple_workflow_json, mock_checkpointer):
        """Compiled workflow runs to completion, returns outputs."""
        ...

    async def test_execute_creates_checkpoint(self, simple_workflow_json, mock_checkpointer):
        """Execution creates checkpoint via AsyncPostgresSaver."""
        ...

    async def test_resume_from_checkpoint(self, mock_checkpointer):
        """Interrupted workflow resumes from last checkpoint."""
        ...

    async def test_thread_id_namespaced(self, mock_execution_context):
        """Thread ID includes tenant_id prefix: {tenant_id}:{execution_id}."""
        ctx = mock_execution_context
        expected_prefix = f"{ctx.tenant_id}:{ctx.execution_id}"
        # TODO: Verify LangGraphRuntime creates thread_id with this format
        assert expected_prefix.startswith(ctx.tenant_id)

    async def test_concurrent_workflow_limit(self, mock_checkpointer):
        """Semaphore blocks when max_parallel_workflows reached."""
        ...

    async def test_large_output_externalized(self, mock_checkpointer, workflow_redis):
        """Node outputs > 1MB stored externally, reference in state."""
        ...
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_workflow_compiler.py`

```python
"""
Tests for WorkflowCompiler internals (Section 01).

Covers node adapter, switch routing, approval subgraph expansion.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.unit
class TestNodeAdapter:
    """Tests for the make_langgraph_node adapter."""

    async def test_node_adapter_wraps_executor(self):
        """make_langgraph_node wraps executor and returns state update dict."""
        ...

    async def test_node_adapter_injects_context_from_config(self):
        """ExecutionContext built from config['configurable'] fields."""
        ...

    async def test_node_adapter_catches_exceptions(self):
        """Exceptions stored in errors field, do not crash graph."""
        ...


@pytest.mark.unit
class TestSwitchRouting:
    """Tests for switch/router compile-time routing function generation."""

    async def test_switch_routing_function_generated(self):
        """Switch node generates correct routing function at compile time."""
        ...


@pytest.mark.unit
class TestApprovalSubgraph:
    """Tests for approval node expansion to interrupt subgraph."""

    async def test_approval_expands_to_subgraph(self):
        """Approval node expands to interrupt subgraph with correct channels."""
        ...
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_expression_engine.py`

```python
"""
Tests for the expression engine (Section 01 / Section 06).

Covers field references, nested access, array indexing, optional
chaining, condition operators, boolean combinators, and security
(blocking function calls, eval/exec/import).
"""

import pytest


@pytest.mark.unit
class TestFieldReferences:
    """Tests for basic field reference resolution."""

    async def test_simple_field_reference(self):
        """{{node1.field}} resolves to the correct value from state."""
        ...

    async def test_nested_field_access(self):
        """{{node1.data.nested.value}} resolves nested dicts."""
        ...

    async def test_array_indexing(self):
        """{{node1.items[0]}} returns first element of array."""
        ...

    async def test_optional_chaining(self):
        """{{node1.data?.missing}} returns None without raising."""
        ...


@pytest.mark.unit
class TestExpressionSecurity:
    """Security tests for the expression engine."""

    async def test_blocks_function_calls(self):
        """{{node1.field()}} raises SecurityError."""
        ...

    async def test_blocks_eval_exec(self):
        """Expressions with eval/exec/import are rejected."""
        ...


@pytest.mark.unit
class TestConditions:
    """Tests for condition operators and boolean combinators."""

    async def test_condition_operators(self):
        """==, !=, >, <, contains, matches all work correctly."""
        ...

    async def test_boolean_combinators(self):
        """AND, OR, NOT combine conditions correctly."""
        ...
```

### Section 02: Streaming Integration

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_streaming.py`

```python
"""
Tests for streaming integration (Section 02).

Covers LangGraph event-to-SSE translation, token streaming,
internal event filtering, ring buffer, and reconnection replay.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.unit
class TestSSEEventMapping:
    """Tests for mapping LangGraph events to SSE events."""

    async def test_astream_events_to_sse_node_start(self):
        """on_chain_start maps to node_start SSE event."""
        ...

    async def test_astream_events_to_sse_node_complete(self):
        """on_chain_end maps to node_complete with outputs."""
        ...

    async def test_astream_events_to_sse_node_error(self):
        """on_chain_error maps to node_error with message."""
        ...

    async def test_astream_events_to_sse_workflow_complete(self):
        """Custom event maps to workflow_complete."""
        ...

    async def test_token_streaming(self):
        """on_chat_model_stream maps to token events."""
        ...

    async def test_internal_routing_nodes_filtered(self):
        """Internal LangGraph routing events not sent to client."""
        ...


@pytest.mark.unit
class TestRingBuffer:
    """Tests for the SSE event ring buffer."""

    async def test_ring_buffer_stores_events(self):
        """Ring buffer stores last 100 events."""
        ...


@pytest.mark.integration
class TestSSEReconnection:
    """Tests for SSE reconnection with Last-Event-ID."""

    async def test_sse_reconnection_replays_from_last_event_id(self):
        """Missed events replayed on reconnect via Last-Event-ID header."""
        ...
```

### Section 03: Human-in-the-Loop

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_hitl.py`

```python
"""
Tests for Human-in-the-Loop via LangGraph interrupt() (Section 03).

Covers interrupt pausing, SSE event emission, resume with
approval/rejection, timeout auto-reject, and persistence across restarts.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.integration
class TestHITL:
    """Integration tests for HITL interrupt/resume lifecycle."""

    async def test_interrupt_pauses_graph(self, mock_checkpointer):
        """interrupt() pauses execution and creates checkpoint."""
        ...

    async def test_interrupt_sends_sse_event(self, mock_checkpointer):
        """Frontend receives approval_required SSE event on interrupt."""
        ...

    async def test_resume_with_approval(self, mock_checkpointer):
        """Command(resume={'approved': True}) continues graph execution."""
        ...

    async def test_resume_with_rejection(self, mock_checkpointer):
        """Rejection routes to error/reject path."""
        ...

    async def test_timeout_auto_rejects(self, mock_checkpointer):
        """Celery task auto-rejects after configured timeout."""
        ...

    async def test_interrupt_survives_restart(self, mock_checkpointer):
        """Interrupt data persists in checkpoint across process restarts."""
        ...
```

### Sections 04-09: Node Executor Tests

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/__init__.py`

```python
"""Node executor test package."""
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_triggers.py`

```python
"""
Tests for trigger node executors (Section 04).

Each test class inherits ExecutorTestContract for the 5 standard tests,
then adds executor-specific tests.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests.executor_test_base import ExecutorTestContract


@pytest.mark.unit
class TestManualTrigger(ExecutorTestContract):
    """Tests for ManualTriggerExecutor."""

    # Contract configuration
    # executor_class = ManualTriggerExecutor  # TODO: import when available
    valid_config = {}
    valid_input = {}
    expected_output_keys = set()  # Define when executor spec is finalized

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        """Deferred import of executor class (set when Section 04 is implemented)."""
        # from app.orchestrator.node_executors.trigger_executors.manual_trigger_executor import (
        #     ManualTriggerExecutor,
        # )
        # self.executor_class = ManualTriggerExecutor
        pytest.skip("Section 04 not yet implemented")

    async def test_manual_trigger_compatible(self):
        """Manual trigger works with new runtime adapter."""
        ...


@pytest.mark.unit
class TestWebhookTrigger(ExecutorTestContract):
    """Tests for WebhookTriggerExecutor."""

    valid_config = {"methods": ["POST"]}
    valid_input = {"body": {"key": "value"}, "headers": {}, "query": {}}
    expected_output_keys = {"body", "headers", "query", "method"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 04 not yet implemented")

    async def test_webhook_trigger_parses_body(self):
        """Request body, headers, query params extracted correctly."""
        ...

    async def test_webhook_trigger_methods(self):
        """POST/GET/PUT/PATCH/DELETE are all supported."""
        ...


@pytest.mark.unit
class TestScheduleTrigger(ExecutorTestContract):
    """Tests for ScheduleTriggerExecutor."""

    valid_config = {"cron": "0 * * * *"}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 04 not yet implemented")

    async def test_schedule_trigger_cron(self):
        """Cron expression parsed and validated."""
        ...


@pytest.mark.integration
class TestQueueTrigger(ExecutorTestContract):
    """Tests for MessageQueueTriggerExecutor (Redis Streams)."""

    valid_config = {"queue_name": "test-queue", "consumer_group": "test-group", "batch_size": 1}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 04 not yet implemented")

    async def test_queue_trigger_consumes(self, workflow_redis):
        """Redis Streams message consumed and processed."""
        ...

    async def test_queue_trigger_acks(self, workflow_redis):
        """Message acknowledged after successful processing."""
        ...

    async def test_queue_trigger_batch(self, workflow_redis):
        """Batch of N messages consumed together."""
        ...
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_io.py`

```python
"""
Tests for Core I/O node executors (Section 05).

Covers HTTP Request (with SSRF tests), Database Query (with SQL safety),
Storage, Notification, and Webhook Response executors.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests.executor_test_base import ExecutorTestContract


@pytest.mark.unit
class TestHTTPRequest(ExecutorTestContract):
    """Tests for HTTPRequestExecutor."""

    valid_config = {"method": "GET", "url": "https://api.example.com/data", "timeout": 30}
    valid_input = {}
    expected_output_keys = {"status", "headers", "body"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 05 not yet implemented")

    async def test_http_request_get(self):
        """GET request returns status, headers, body."""
        ...

    async def test_http_request_post_json(self):
        """POST with JSON body works correctly."""
        ...

    async def test_http_request_auth_bearer(self):
        """Bearer token added to request headers."""
        ...

    async def test_http_request_blocks_private_ip(self):
        """SSRF: 10.0.0.0/8, 172.16.0.0/12, etc. blocked."""
        ...

    async def test_http_request_blocks_localhost(self):
        """SSRF: localhost, 127.0.0.1 blocked."""
        ...

    async def test_http_request_blocks_metadata(self):
        """SSRF: 169.254.169.254 (AWS metadata) blocked."""
        ...

    async def test_http_request_allows_tenant_allowlist(self):
        """Allowed internal URLs pass for enterprise tenants."""
        ...


@pytest.mark.unit
class TestDatabaseQuery(ExecutorTestContract):
    """Tests for DatabaseQueryExecutor."""

    valid_config = {"connection_type": "postgresql", "query": "SELECT 1"}
    valid_input = {}
    expected_output_keys = {"rows", "row_count", "columns"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 05 not yet implemented")

    async def test_db_query_select(self):
        """SELECT returns rows."""
        ...

    async def test_db_query_parameterized(self):
        """Parameters properly bound (no interpolation)."""
        ...

    async def test_db_query_blocks_drop(self):
        """SQL safety: DROP rejected."""
        ...

    async def test_db_query_blocks_truncate(self):
        """SQL safety: TRUNCATE rejected."""
        ...

    async def test_db_query_blocks_delete_default(self):
        """SQL safety: DELETE rejected by default."""
        ...


@pytest.mark.unit
class TestStorage(ExecutorTestContract):
    """Tests for StorageExecutor."""

    valid_config = {"operation": "upload", "provider": "s3", "bucket": "test-bucket"}
    valid_input = {"content": b"test data", "key": "test/file.txt"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 05 not yet implemented")

    async def test_storage_upload(self):
        """File uploaded, URL returned."""
        ...

    async def test_storage_download(self):
        """File downloaded by key."""
        ...


@pytest.mark.unit
class TestNotification(ExecutorTestContract):
    """Tests for NotificationExecutor."""

    valid_config = {"channel": "email", "recipients": ["test@example.com"]}
    valid_input = {"subject": "Test", "body": "Hello"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 05 not yet implemented")

    async def test_notification_email(self):
        """Email sent via SMTP."""
        ...


@pytest.mark.unit
class TestWebhookResponse(ExecutorTestContract):
    """Tests for WebhookResponseExecutor."""

    valid_config = {"status_code": 200}
    valid_input = {"body": {"result": "ok"}}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 05 not yet implemented")

    async def test_webhook_response(self):
        """HTTP response with status, headers, body."""
        ...
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_data.py`

```python
"""
Tests for Data Shaping node executors (Section 06).

Covers Set/Edit Fields, Map/Rename, Filter, If, Switch, Merge,
Split, Batch, JSON/CSV Transform, Schema Validate.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from tests.executor_test_base import ExecutorTestContract


@pytest.mark.unit
class TestSetFields(ExecutorTestContract):
    """Tests for SetFieldsExecutor."""

    valid_config = {"fields": [{"name": "greeting", "operation": "set", "value": "hello"}]}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_set_fields_static(self):
        """Static value set on output."""
        ...

    async def test_set_fields_expression(self):
        """{{node_id.field}} resolved from state."""
        ...


@pytest.mark.unit
class TestMapFields(ExecutorTestContract):
    """Tests for MapFieldsExecutor."""

    valid_config = {"mapping": {"old_name": "new_name"}, "unmapped": "keep"}
    valid_input = {"old_name": "value"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_map_fields_rename(self):
        """Fields renamed per mapping."""
        ...

    async def test_map_fields_drop_unmapped(self):
        """Unmapped fields dropped when configured."""
        ...


@pytest.mark.unit
class TestFilter(ExecutorTestContract):
    """Tests for FilterExecutor."""

    valid_config = {"condition": {"field": "age", "operator": ">", "value": 18}}
    valid_input = {"items": [{"age": 20}, {"age": 15}]}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_filter_matches(self):
        """Matching items pass, rejected items on other port."""
        ...


@pytest.mark.unit
class TestIf(ExecutorTestContract):
    """Tests for IfExecutor (conditional branching)."""

    valid_config = {"condition": {"field": "status", "operator": "==", "value": "active"}}
    valid_input = {"status": "active"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_if_true_branch(self):
        """True condition routes to true output."""
        ...

    async def test_if_false_branch(self):
        """False condition routes to false output."""
        ...


@pytest.mark.unit
class TestSwitch(ExecutorTestContract):
    """Tests for SwitchExecutor (multi-case routing)."""

    valid_config = {
        "value_field": "type",
        "cases": {"a": "port_a", "b": "port_b"},
        "default": "port_default",
    }
    valid_input = {"type": "a"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_switch_routes_by_value(self):
        """Cases routed to correct ports."""
        ...

    async def test_switch_default_port(self):
        """Unmatched value goes to default port."""
        ...


@pytest.mark.unit
class TestMerge(ExecutorTestContract):
    """Tests for MergeExecutor."""

    valid_config = {"strategy": "append"}
    valid_input = {"input_a": [1, 2], "input_b": [3, 4]}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_merge_append(self):
        """Arrays concatenated."""
        ...

    async def test_merge_key_join(self):
        """Objects joined on key field."""
        ...


@pytest.mark.unit
class TestSplit(ExecutorTestContract):
    """Tests for SplitExecutor."""

    valid_config = {"array_field": "items"}
    valid_input = {"items": [{"a": 1}, {"a": 2}]}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_split_items(self):
        """Array split into individual items."""
        ...


@pytest.mark.unit
class TestBatch(ExecutorTestContract):
    """Tests for BatchExecutor."""

    valid_config = {"batch_size": 2}
    valid_input = {"items": [1, 2, 3, 4, 5]}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_batch_chunks(self):
        """Items grouped into batches of N."""
        ...


@pytest.mark.unit
class TestTransformer(ExecutorTestContract):
    """Tests for JSON/XML/CSV Transformer."""

    valid_config = {"source_format": "json", "target_format": "csv"}
    valid_input = {"data": [{"name": "Alice", "age": 30}]}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_json_to_csv(self):
        """JSON converted to CSV string."""
        ...

    async def test_csv_to_json(self):
        """CSV parsed to JSON objects."""
        ...


@pytest.mark.unit
class TestSchemaValidator(ExecutorTestContract):
    """Tests for SchemaValidatorExecutor."""

    valid_config = {
        "schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        "validation_mode": "strict",
    }
    valid_input = {"items": [{"name": "Alice"}, {"age": 30}]}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 06 not yet implemented")

    async def test_schema_validator_pass(self):
        """Valid data passes through."""
        ...

    async def test_schema_validator_reject(self):
        """Invalid data routed to invalid_items port."""
        ...
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_reliability.py`

```python
"""
Tests for reliability node executors (Section 07).

Covers Retry, Rate Limiter, Circuit Breaker, Idempotency, DLQ, Checkpoint.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests.executor_test_base import ExecutorTestContract


@pytest.mark.unit
class TestRetry:
    """Tests for Retry middleware (not a standalone executor)."""

    async def test_retry_succeeds_after_failure(self):
        """Retries on error, succeeds on 2nd attempt."""
        ...

    async def test_retry_respects_max_retries(self):
        """Stops after max_retries exceeded."""
        ...

    async def test_retry_exponential_backoff(self):
        """Delay increases exponentially between retries."""
        ...

    async def test_retry_jitter(self):
        """Random jitter added to delay."""
        ...


@pytest.mark.unit
class TestRateLimiter:
    """Tests for Rate Limiter middleware."""

    async def test_rate_limiter_allows_within_limit(self, workflow_redis):
        """Requests within rate pass through."""
        ...

    async def test_rate_limiter_blocks_over_limit(self, workflow_redis):
        """Excess requests await token."""
        ...


@pytest.mark.unit
class TestCircuitBreaker(ExecutorTestContract):
    """Tests for Circuit Breaker executor."""

    valid_config = {"timeout_seconds": 5, "failure_threshold": 3, "recovery_timeout": 30}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 07 not yet implemented")

    async def test_circuit_breaker_closed(self, workflow_redis):
        """Normal operation passes through (CLOSED state)."""
        ...

    async def test_circuit_breaker_opens_on_failures(self, workflow_redis):
        """Trips to OPEN after failure_threshold consecutive failures."""
        ...

    async def test_circuit_breaker_half_open_recovery(self, workflow_redis):
        """Allows one test request after recovery_timeout (HALF_OPEN)."""
        ...


@pytest.mark.unit
class TestIdempotency(ExecutorTestContract):
    """Tests for Idempotency executor."""

    valid_config = {"key_expression": "{{node1.id}}", "ttl": 3600}
    valid_input = {"id": "item-001"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 07 not yet implemented")

    async def test_idempotency_dedup(self, workflow_redis):
        """Duplicate input returns cached result."""
        ...

    async def test_idempotency_different_input(self, workflow_redis):
        """Different input executes normally."""
        ...


@pytest.mark.integration
class TestDLQ:
    """Tests for Dead Letter Queue."""

    async def test_dlq_stores_failed_item(self, test_db):
        """Failed item stored in DLQ table with error details."""
        ...

    async def test_dlq_reprocess(self, test_db):
        """DLQ item reprocessed successfully."""
        ...


@pytest.mark.integration
class TestCheckpointNode(ExecutorTestContract):
    """Tests for explicit Checkpoint node."""

    valid_config = {"label": "midpoint-checkpoint"}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 07 not yet implemented")

    async def test_checkpoint_creates_named(self, mock_checkpointer):
        """Named checkpoint created in PostgreSQL."""
        ...
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_security.py`

```python
"""
Tests for Security & Governance node executors (Section 08).

Covers Secrets Vault, RBAC, Audit Log, Structured Logging,
Metrics & Alerting, Run History.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests.executor_test_base import ExecutorTestContract


@pytest.mark.unit
class TestSecretsVault(ExecutorTestContract):
    """Tests for SecretsVaultExecutor."""

    valid_config = {"secret_name": "test-api-key", "vault_backend": "default"}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 08 not yet implemented")

    async def test_secrets_vault_retrieves(self):
        """Secret decrypted and returned."""
        ...

    async def test_secrets_vault_never_logged(self):
        """Secret value not present in audit_trail state field."""
        ...

    async def test_secrets_scrubbed_from_state(self):
        """__secret__ tagged values removed from node_outputs."""
        ...


@pytest.mark.unit
class TestRBAC(ExecutorTestContract):
    """Tests for RBAC/Permission executor."""

    valid_config = {"required_role": "admin", "resource_type": "workflow"}
    valid_input = {"user_role": "admin"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 08 not yet implemented")

    async def test_rbac_allows_admin(self):
        """Admin role passes permission check."""
        ...

    async def test_rbac_blocks_viewer(self):
        """Viewer role blocked for edit permission."""
        ...


@pytest.mark.integration
class TestAuditLog(ExecutorTestContract):
    """Tests for AuditLogExecutor."""

    valid_config = {"event_type": "data_access", "include_input": True}
    valid_input = {"data": "test"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 08 not yet implemented")

    async def test_audit_log_writes(self, test_db):
        """Audit event written to workflow_audit_events table."""
        ...

    async def test_audit_log_redacts_sensitive(self):
        """Sensitive fields redacted in audit output."""
        ...


@pytest.mark.unit
class TestStructuredLogging(ExecutorTestContract):
    """Tests for StructuredLoggingExecutor."""

    valid_config = {"level": "info", "message_template": "Processed {{node1.count}} items"}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 08 not yet implemented")

    async def test_structured_logging_writes(self, tmp_path):
        """Log entry written to JSONL file."""
        ...


@pytest.mark.unit
class TestMetrics(ExecutorTestContract):
    """Tests for MetricsExecutor."""

    valid_config = {"metric_name": "items_processed", "value_expression": "{{node1.count}}"}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 08 not yet implemented")

    async def test_metrics_emits(self):
        """Metric stored in metrics table."""
        ...

    async def test_metrics_alert_triggered(self):
        """Alert fired when threshold exceeded."""
        ...


@pytest.mark.integration
class TestRunHistory(ExecutorTestContract):
    """Tests for RunHistoryExecutor."""

    valid_config = {"workflow_id": "wf-001", "limit": 10}
    valid_input = {}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 08 not yet implemented")

    async def test_run_history_queries(self, test_db):
        """Execution history returned for workflow_id."""
        ...
```

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_code_sandbox.py`

```python
"""
Tests for Code Step executor sandbox (Section 09).

CRITICAL SECURITY TESTS: Code sandbox must use subprocess isolation
with resource limits, not in-process exec(). These tests verify that
the sandbox blocks dangerous operations.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests.executor_test_base import ExecutorTestContract


@pytest.mark.unit
class TestPythonSandbox(ExecutorTestContract):
    """Tests for Python code sandbox."""

    valid_config = {"language": "python", "code": "result = inputs['x'] + 1", "timeout_seconds": 5}
    valid_input = {"x": 41}
    expected_output_keys = {"result"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 09 not yet implemented")

    async def test_python_sandbox_returns_result(self):
        """Simple Python code returns computed value."""
        ...

    async def test_python_sandbox_receives_inputs(self):
        """inputs variable available in sandbox context."""
        ...

    async def test_python_sandbox_timeout(self):
        """Long-running code killed after timeout_seconds."""
        ...

    async def test_python_sandbox_memory_limit(self):
        """Memory-hungry code killed by RLIMIT_AS."""
        ...

    async def test_python_sandbox_blocks_os_import(self):
        """import os raises error in sandbox."""
        ...

    async def test_python_sandbox_blocks_subprocess(self):
        """import subprocess blocked in sandbox."""
        ...

    async def test_python_sandbox_blocks_network(self):
        """import socket blocked in sandbox."""
        ...

    async def test_python_sandbox_no_config_access(self):
        """Cannot access credentials or config['configurable']."""
        ...


@pytest.mark.unit
class TestJSSandbox(ExecutorTestContract):
    """Tests for JavaScript code sandbox."""

    valid_config = {"language": "javascript", "code": "return inputs.x + 1;", "timeout_seconds": 5}
    valid_input = {"x": 41}
    expected_output_keys = {"result"}

    @pytest.fixture(autouse=True)
    def _setup_executor_class(self):
        pytest.skip("Section 09 not yet implemented")

    async def test_js_sandbox_returns_result(self):
        """Simple JS code returns value."""
        ...

    async def test_js_sandbox_timeout(self):
        """Long-running JS killed after timeout."""
        ...

    async def test_js_sandbox_isolated(self):
        """No access to Node.js globals (process, require, etc.)."""
        ...
```

### Section 10: Cache System

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_cache.py`

```python
"""
Tests for the workflow node caching system (Section 10).

Covers cache hit/miss, key normalization, TTL expiry,
stampede protection, opt-out, and metrics.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.unit
class TestCacheSystem:
    """Tests for WorkflowCacheService."""

    async def test_cache_miss_executes_node(self, workflow_redis):
        """Cache miss triggers normal node execution."""
        ...

    async def test_cache_hit_returns_cached(self, workflow_redis):
        """Cache hit returns stored result without executing node."""
        ...

    async def test_cache_key_normalization(self):
        """Whitespace, case, key ordering normalized in cache key."""
        ...

    async def test_cache_ttl_expires(self, workflow_redis):
        """Cached result expires after configured TTL."""
        ...

    async def test_cache_stampede_protection(self, workflow_redis):
        """Concurrent requests for same key use SET NX lock."""
        ...

    async def test_cache_opt_out(self, workflow_redis):
        """cache_enabled: false bypasses cache entirely."""
        ...

    async def test_cache_metrics_tracked(self, workflow_redis):
        """hit_count and miss_count incremented correctly."""
        ...
```

### Section 13: Database Schema

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_schema.py`

```python
"""
Tests for new database schema tables (Section 13).

Verifies that the Drizzle-managed tables exist and have correct
column types. These are integration tests that require a test database.
"""

import pytest


@pytest.mark.integration
class TestSchemaCreation:
    """Tests for new workflow engine tables."""

    async def test_workflow_executions_table_exists(self, test_db):
        """workflow_executions table created with all required columns."""
        ...

    async def test_dlq_table_exists(self, test_db):
        """workflow_dead_letter_queue table created."""
        ...

    async def test_audit_events_table_exists(self, test_db):
        """workflow_audit_events table created."""
        ...

    async def test_secrets_table_encrypted(self, test_db):
        """workflow_secrets table stores encrypted values (not plaintext)."""
        ...

    async def test_policy_rules_table_exists(self, test_db):
        """workflow_policy_rules table created."""
        ...
```

### Section 14: API Endpoints

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_api_workflows.py`

```python
"""
Tests for workflow API endpoints (Section 14).

Covers /compile, /execute, /stream, /resume, /dlq endpoints.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestWorkflowAPI:
    """Integration tests for workflow API endpoints."""

    async def test_compile_endpoint_success(self, client, auth_headers, simple_workflow_json):
        """POST /compile returns compiled manifest on valid input."""
        ...

    async def test_compile_endpoint_validation_error(self, client, auth_headers):
        """POST /compile returns 400 with errors on invalid workflow."""
        ...

    async def test_execute_endpoint_starts(self, client, auth_headers, simple_workflow_json):
        """POST /execute starts workflow, returns execution_id."""
        ...

    async def test_stream_endpoint_sse(self, client, auth_headers):
        """GET /execute/{id}/stream returns SSE events."""
        ...

    async def test_resume_endpoint(self, client, auth_headers):
        """POST /execute/{id}/resume resumes HITL-paused workflow."""
        ...

    async def test_dlq_list(self, client, auth_headers):
        """GET /dlq returns list of DLQ items."""
        ...

    async def test_dlq_reprocess(self, client, auth_headers):
        """POST /dlq/{id}/reprocess triggers reprocessing."""
        ...
```

### Section 16: Backward Compatibility

#### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_backward_compat.py`

```python
"""
Tests for backward compatibility (Section 16).

Verifies that existing 21-node workflows continue to function
after the LangGraph runtime rebuild.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.integration
class TestBackwardCompatibility:
    """Tests that existing workflows and APIs still work."""

    async def test_existing_llm_call_works(self, mock_checkpointer):
        """LLM call node runs in new runtime via adapter."""
        ...

    async def test_existing_conditional_works(self, mock_checkpointer):
        """Conditional node branches correctly via adapter."""
        ...

    async def test_existing_loop_works(self, mock_checkpointer):
        """Loop node iterates with adapter wrapping."""
        ...

    async def test_existing_approval_works(self, mock_checkpointer):
        """Approval gate uses new interrupt() internally."""
        ...

    async def test_existing_generate_image_works(self, mock_checkpointer):
        """Image generation node runs via adapter."""
        ...

    async def test_existing_workflow_json_format(self, mock_checkpointer):
        """Old ReactFlow JSON compiles without changes."""
        ...

    async def test_sse_event_format_unchanged(self):
        """Frontend receives same event format as before."""
        ...

    async def test_budget_lifecycle_preserved(self, mock_checkpointer):
        """Reserve -> finalize -> rollback credit lifecycle still works."""
        ...
```

---

## Security Test Suite

Security tests are separated into their own directory for clarity and to support targeted execution via `pytest tests/test_security/`.

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_security/__init__.py`

```python
"""Security test package for workflow engine."""
```

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_security/test_ssrf.py`

```python
"""
SSRF Protection Tests.

100% coverage REQUIRED on SSRF validation code.

Tests verify that the HTTP Request executor blocks requests to:
- Private IPs (RFC 1918)
- Loopback addresses
- Link-local addresses (AWS metadata endpoint)
- Internal service ports
- DNS rebinding attacks

See Section 05 of the implementation plan.
"""

import ipaddress

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.unit
class TestSSRFProtection:
    """Tests for SSRF blocking in HTTP Request executor."""

    # Private IPs (RFC 1918)
    @pytest.mark.parametrize(
        "url",
        [
            "http://10.0.0.1/api",
            "http://10.255.255.255/api",
            "http://172.16.0.1/api",
            "http://172.31.255.255/api",
            "http://192.168.0.1/api",
            "http://192.168.255.255/api",
        ],
    )
    async def test_blocks_private_ips(self, url):
        """Private RFC 1918 IPs are blocked."""
        # TODO: from app.orchestrator.node_executors.io_executors.http_request_executor import (
        #     validate_url,
        #     SSRFError,
        # )
        # with pytest.raises(SSRFError):
        #     await validate_url(url)
        ...

    # Loopback
    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1/api",
            "http://localhost/api",
            "http://0.0.0.0/api",
            "http://[::1]/api",
        ],
    )
    async def test_blocks_loopback(self, url):
        """Loopback addresses are blocked."""
        ...

    # Link-local / AWS metadata
    @pytest.mark.parametrize(
        "url",
        [
            "http://169.254.169.254/latest/meta-data/",
            "http://169.254.0.1/",
        ],
    )
    async def test_blocks_link_local(self, url):
        """Link-local addresses (including AWS metadata) are blocked."""
        ...

    # Internal services
    @pytest.mark.parametrize(
        "url",
        [
            "http://internal-host:5432/",
            "http://internal-host:6379/",
        ],
    )
    async def test_blocks_internal_service_ports(self, url):
        """Known internal service ports are blocked."""
        ...

    # DNS rebinding
    async def test_blocks_dns_rebinding(self):
        """DNS that resolves to private IP after initial check is blocked."""
        ...

    # Allowlist
    async def test_allows_tenant_allowlisted_urls(self):
        """URLs on the tenant allowlist are permitted even if internal."""
        ...

    # Public URLs pass
    @pytest.mark.parametrize(
        "url",
        [
            "https://api.example.com/v1/data",
            "https://jsonplaceholder.typicode.com/posts",
        ],
    )
    async def test_allows_public_urls(self, url):
        """Public URLs pass SSRF validation."""
        ...
```

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_security/test_sql_safety.py`

```python
"""
SQL Operation Allowlist Tests.

100% coverage REQUIRED on SQL allowlist validation code.

Tests verify that the Database Query executor:
- Allows SELECT, INSERT, UPDATE
- Blocks DROP, TRUNCATE, DELETE (by default)
- Uses parameterized queries only
- Handles SQL injection attempts

See Section 05 of the implementation plan.
"""

import pytest


@pytest.mark.unit
class TestSQLAllowlist:
    """Tests for SQL operation allowlist in DatabaseQueryExecutor."""

    @pytest.mark.parametrize(
        "query",
        [
            "SELECT * FROM users WHERE id = $1",
            "SELECT count(*) FROM orders",
            "INSERT INTO logs (message) VALUES ($1)",
            "UPDATE users SET name = $1 WHERE id = $2",
        ],
    )
    async def test_allows_safe_operations(self, query):
        """SELECT, INSERT, UPDATE are allowed."""
        # TODO: from app.orchestrator.node_executors.io_executors.database_query_executor import (
        #     validate_sql,
        # )
        # assert validate_sql(query) is True
        ...

    @pytest.mark.parametrize(
        "query",
        [
            "DROP TABLE users",
            "DROP DATABASE smartspec",
            "TRUNCATE users",
            "DELETE FROM users WHERE 1=1",
            "ALTER TABLE users DROP COLUMN email",
        ],
    )
    async def test_blocks_dangerous_operations(self, query):
        """DROP, TRUNCATE, DELETE, ALTER are blocked by default."""
        # TODO: with pytest.raises(SQLSafetyError):
        #     validate_sql(query)
        ...

    @pytest.mark.parametrize(
        "query",
        [
            "SELECT * FROM users; DROP TABLE users; --",
            "SELECT * FROM users WHERE name = ''; DROP TABLE users; --'",
        ],
    )
    async def test_blocks_sql_injection_attempts(self, query):
        """Multi-statement and injection patterns blocked."""
        ...

    async def test_requires_parameterized_queries(self):
        """Raw value interpolation is not permitted."""
        ...
```

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_security/test_sandbox_escape.py`

```python
"""
Code Sandbox Escape Tests.

100% coverage REQUIRED on sandbox isolation code.

Tests verify that the Code Step executor:
- Blocks dangerous imports (os, sys, subprocess, socket, ctypes)
- Prevents file system access
- Prevents network access
- Enforces CPU time limits
- Enforces memory limits
- Cannot access environment variables or credentials

See Section 09 of the implementation plan.
"""

import pytest


@pytest.mark.unit
class TestPythonSandboxEscape:
    """Escape attempt tests for the Python code sandbox."""

    @pytest.mark.parametrize(
        "code",
        [
            "import os; os.system('id')",
            "import subprocess; subprocess.run(['id'])",
            "import socket; s = socket.socket()",
            "import ctypes",
            "import importlib; importlib.import_module('os')",
            "__import__('os').system('id')",
            "exec('import os')",
            "eval('__import__(\"os\")')",
        ],
    )
    async def test_blocks_dangerous_imports(self, code):
        """Dangerous imports are blocked in the sandbox."""
        ...

    async def test_blocks_file_read(self):
        """Cannot read files from the host filesystem."""
        ...

    async def test_blocks_file_write(self):
        """Cannot write files to the host filesystem."""
        ...

    async def test_blocks_env_access(self):
        """Cannot access environment variables."""
        ...

    async def test_cpu_limit_enforced(self):
        """Infinite loop killed by CPU time limit."""
        ...

    async def test_memory_limit_enforced(self):
        """Memory allocation bomb killed by memory limit."""
        ...

    async def test_no_credential_access(self):
        """Cannot access LLM_ENCRYPTION_KEY or other secrets."""
        ...


@pytest.mark.unit
class TestJSSandboxEscape:
    """Escape attempt tests for the JavaScript code sandbox."""

    @pytest.mark.parametrize(
        "code",
        [
            "process.exit(0)",
            "require('child_process').execSync('id')",
            "require('fs').readFileSync('/etc/passwd')",
        ],
    )
    async def test_blocks_node_globals(self, code):
        """Node.js globals (process, require) are not available."""
        ...
```

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_security/test_secret_propagation.py`

```python
"""
Secret Propagation & Scrubbing Tests.

100% coverage REQUIRED on secret scrubbing code.

Tests verify that:
- Secret values tagged with __secret__ are scrubbed from node_outputs
- Secrets do not appear in WorkflowState checkpoint data
- Secrets do not appear in audit_trail
- Secrets do not appear in SSE events
- Code sandbox cannot access credentials

See Section 08 of the implementation plan.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.unit
class TestSecretScrubbing:
    """Tests for __secret__ value scrubbing in node_adapter.py."""

    async def test_secret_tagged_value_scrubbed_from_outputs(self):
        """Values tagged with __secret__ removed from node_outputs in state."""
        ...

    async def test_secret_not_in_checkpoint(self):
        """Secret values not persisted in checkpoint data."""
        ...

    async def test_secret_not_in_audit_trail(self):
        """Secret values not present in audit_trail state field."""
        ...

    async def test_secret_not_in_sse_events(self):
        """Secret values not included in SSE node_complete event data."""
        ...

    async def test_secret_refetch_required(self):
        """Downstream nodes must re-fetch secrets from vault, not state."""
        ...

    async def test_sandbox_no_secret_access(self):
        """Code sandbox inputs are scrubbed of secret references."""
        ...
```

---

## E2E Workflow Integration Test

### File: `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_workflow_e2e.py` (expand existing)

```python
"""
End-to-end workflow integration tests.

Tests complete workflow lifecycle: trigger -> transform -> output.
These tests use the full compilation + execution pipeline with
mock external services.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.e2e
class TestWorkflowE2E:
    """End-to-end tests for complete workflow lifecycle."""

    async def test_linear_workflow_trigger_to_response(
        self,
        simple_workflow_json,
        mock_checkpointer,
        mock_execution_context,
    ):
        """Complete flow: manual_trigger -> set_fields -> webhook_response.

        Steps:
        1. Compile the simple_workflow_json
        2. Execute with mock trigger input
        3. Verify set_fields populated output correctly
        4. Verify webhook_response received the set data
        5. Verify workflow_complete event emitted
        6. Verify checkpoint created
        """
        ...

    async def test_branching_workflow_true_path(
        self,
        branching_workflow_json,
        mock_checkpointer,
        mock_execution_context,
    ):
        """Branching flow: trigger -> if(true) -> set_true -> response.

        Verifies that only the true branch executes.
        """
        ...

    async def test_branching_workflow_false_path(
        self,
        branching_workflow_json,
        mock_checkpointer,
        mock_execution_context,
    ):
        """Branching flow: trigger -> if(false) -> set_false -> response.

        Verifies that only the false branch executes.
        """
        ...

    async def test_workflow_with_hitl_approval(
        self,
        mock_checkpointer,
        mock_execution_context,
    ):
        """Full HITL lifecycle: trigger -> approval(pause) -> resume -> response.

        Steps:
        1. Compile workflow with approval node
        2. Execute until interrupt
        3. Verify SSE approval_required event
        4. Resume with Command(resume={"approved": True})
        5. Verify execution completes
        """
        ...

    async def test_workflow_with_cache_hit(
        self,
        simple_workflow_json,
        mock_checkpointer,
        workflow_redis,
        mock_execution_context,
    ):
        """Second execution of same workflow uses cache.

        Steps:
        1. Execute workflow first time (cache miss)
        2. Execute same workflow again (cache hit)
        3. Verify cache_hits incremented
        """
        ...

    async def test_workflow_error_handling(
        self,
        mock_checkpointer,
        mock_execution_context,
    ):
        """Node failure stores error in state, workflow terminates.

        Steps:
        1. Create workflow with a node that will raise an exception
        2. Execute
        3. Verify errors list in state contains the error
        4. Verify workflow status is failed
        """
        ...

    async def test_workflow_checkpoint_resume_after_failure(
        self,
        mock_checkpointer,
        mock_execution_context,
    ):
        """Workflow can be resumed from checkpoint after transient failure.

        Steps:
        1. Execute workflow that fails at node 2 of 3
        2. Verify checkpoint saved at node 1
        3. Resume from checkpoint
        4. Verify node 2 re-executes (with fix applied)
        5. Verify workflow completes
        """
        ...
```

---

## Test Execution Order

Tests should be run in this dependency order (matching the implementation order from the master plan). This order is recommended for development; CI runs all tests together.

| Priority | Test File | Section | Why this order |
|---|---|---|---|
| 1 | `test_expression_engine.py` | 01 | No dependencies, pure logic |
| 2 | `test_langgraph_runtime.py` | 01 | Foundation for everything |
| 3 | `test_workflow_compiler.py` | 01 | Depends on runtime types |
| 4 | `test_schema.py` | 13 | Tables needed by executors |
| 5 | `test_api_workflows.py` | 14 | Endpoints needed for testing |
| 6 | `test_streaming.py` | 02 | Depends on runtime + API |
| 7 | `test_hitl.py` | 03 | Depends on runtime + streaming |
| 8 | `test_backward_compat.py` | 16 | Verify before adding new nodes |
| 9 | `test_cache.py` | 10 | Middleware for node execution |
| 10 | `test_node_executors/test_triggers.py` | 04 | Entry points for workflows |
| 11 | `test_node_executors/test_io.py` | 05 | Data sources and sinks |
| 12 | `test_node_executors/test_data.py` | 06 | Transformation layer |
| 13 | `test_node_executors/test_reliability.py` | 07 | Execution safety |
| 14 | `test_node_executors/test_security.py` | 08 | Governance layer |
| 15 | `test_node_executors/test_code_sandbox.py` | 09 | Sandbox (last due to security complexity) |
| 16 | `test_security/test_ssrf.py` | 05 | Cross-cutting security |
| 17 | `test_security/test_sql_safety.py` | 05 | Cross-cutting security |
| 18 | `test_security/test_sandbox_escape.py` | 09 | Cross-cutting security |
| 19 | `test_security/test_secret_propagation.py` | 08 | Cross-cutting security |
| 20 | `integration/test_workflow_e2e.py` | ALL | Full integration (runs last) |

To run in order during development:

```bash
cd /home/dev/projects/SmartSpecPro/python-backend

# Phase 1: Foundation
pytest tests/test_expression_engine.py -v
pytest tests/test_langgraph_runtime.py tests/test_workflow_compiler.py -v
pytest tests/test_schema.py -v
pytest tests/test_api_workflows.py -v

# Phase 2: Core features
pytest tests/test_streaming.py -v
pytest tests/test_hitl.py -v
pytest tests/test_backward_compat.py -v
pytest tests/test_cache.py -v

# Phase 3: Executors
pytest tests/test_node_executors/ -v

# Phase 4: Security
pytest tests/test_security/ -v

# Phase 5: E2E
pytest tests/integration/test_workflow_e2e.py -v

# Full suite (CI)
pytest -v
```

---

## Coverage Configuration Updates

### Additions to `/home/dev/projects/SmartSpecPro/python-backend/pyproject.toml`

Add new test markers:

```toml
# Add to [tool.pytest.ini_options] markers list:
markers = [
    # ... existing markers ...
    "workflow: Workflow engine tests",
    "security_critical: 100% coverage required on these paths",
]
```

### Additions to `/home/dev/projects/SmartSpecPro/python-backend/.coveragerc`

No new omissions. The following new files MUST have coverage tracked (not omitted):

```
# These files require 100% coverage (security-critical):
# app/orchestrator/node_executors/io_executors/http_request_executor.py   (SSRF validation)
# app/orchestrator/node_executors/io_executors/database_query_executor.py (SQL allowlist)
# app/orchestrator/node_executors/data_executors/code_executor.py         (code sandbox)
# app/orchestrator/node_adapter.py                                        (secret scrubbing)
# app/orchestrator/expression_engine.py                                   (expression security)
```

To verify security-critical coverage after test runs:

```bash
cd /home/dev/projects/SmartSpecPro/python-backend

# Generate detailed coverage report
pytest --cov=app --cov-report=term-missing --cov-report=html:.spec/reports/coverage/html -v

# Check specific security-critical files (must show 100%)
coverage report --include="app/orchestrator/node_executors/io_executors/http_request_executor.py,app/orchestrator/node_executors/io_executors/database_query_executor.py,app/orchestrator/node_executors/data_executors/code_executor.py,app/orchestrator/node_adapter.py,app/orchestrator/expression_engine.py"
```

---

## Integration Test Patterns

### Pattern: Testing Checkpoint/Resume

```python
async def test_checkpoint_resume_pattern(mock_checkpointer):
    """Pattern for testing checkpoint/resume flows.

    1. Create a workflow with a known interrupt point
    2. Execute until interrupt
    3. Assert checkpoint was created
    4. Resume with Command(resume=...)
    5. Assert execution completed
    """
    # Step 1: Compile workflow with approval node at step 2
    # workflow_json = {...}
    # compiled = await compiler.compile(workflow_json)

    # Step 2: Execute (will pause at approval)
    # config = {"configurable": {"thread_id": "test-tenant:exec-001"}}
    # result = await runtime.execute(compiled, input_data, config)
    # assert result["status"] == "interrupted"

    # Step 3: Verify checkpoint exists
    # mock_checkpointer.aput.assert_called()

    # Step 4: Resume
    # from langgraph.types import Command
    # result = await runtime.resume("test-tenant:exec-001", Command(resume={"approved": True}))

    # Step 5: Verify completion
    # assert result["status"] == "completed"
    ...
```

### Pattern: Testing HITL with Timeout

```python
async def test_hitl_timeout_pattern(mock_checkpointer):
    """Pattern for testing HITL timeout auto-reject.

    1. Trigger interrupt
    2. Wait for timeout (mock time)
    3. Assert auto-rejection happened
    """
    # Use freezegun or manual time patching to advance past timeout
    # from unittest.mock import patch
    # with patch("time.time", return_value=current_time + timeout_seconds + 1):
    #     await celery_check_pending_interrupts()
    #     # Assert graph was resumed with rejection
    ...
```

### Pattern: Testing Streaming Events

```python
async def test_streaming_pattern(mock_checkpointer):
    """Pattern for testing SSE event streaming.

    1. Execute workflow with streaming enabled
    2. Collect all emitted SSE events
    3. Assert correct event sequence: node_start -> node_complete -> ... -> workflow_complete
    """
    # events = []
    # async for event in runtime.astream_events(compiled, input_data, config, version="v2"):
    #     translated = translate_to_sse(event)
    #     if translated:
    #         events.append(translated)
    #
    # assert events[0]["event"] == "node_start"
    # assert events[-1]["event"] == "workflow_complete"
    ...
```

---

## CI/CD Integration Notes

### GitHub Actions / CI Pipeline

The test suite integrates with CI as follows:

1. **Test execution**: `cd python-backend && pytest -v` (runs all tests with coverage enforcement)
2. **Coverage gate**: `--cov-fail-under=80` causes CI to fail if coverage drops below 80%
3. **Security-critical files**: Add a CI step that checks 100% coverage on security files:

```yaml
# Example CI step (add to existing workflow)
- name: Check security-critical coverage
  run: |
    cd python-backend
    pytest --cov=app --cov-report=json -q
    python -c "
    import json
    with open('.spec/reports/coverage/coverage.json') as f:
        data = json.load(f)
    critical_files = [
        'app/orchestrator/node_executors/io_executors/http_request_executor.py',
        'app/orchestrator/node_executors/io_executors/database_query_executor.py',
        'app/orchestrator/node_executors/data_executors/code_executor.py',
        'app/orchestrator/node_adapter.py',
        'app/orchestrator/expression_engine.py',
    ]
    for filepath in critical_files:
        file_data = data.get('files', {}).get(filepath)
        if file_data:
            pct = file_data['summary']['percent_covered']
            print(f'{filepath}: {pct}%')
            if pct < 100:
                raise SystemExit(f'CRITICAL: {filepath} has {pct}% coverage (100% required)')
        else:
            print(f'{filepath}: not found in coverage report (may not exist yet)')
    print('All security-critical files pass coverage check')
    "
```

4. **Test markers for CI parallelization**:
   - `pytest -m unit` -- fast tests, no external dependencies
   - `pytest -m integration` -- requires mock DB/Redis
   - `pytest -m e2e` -- full system tests
   - `pytest -m security_critical` -- security-focused tests

---

## Verification Checklist

Before merging any section, verify these items:

- [ ] All tests in the section's test file(s) pass: `pytest tests/test_<section>.py -v`
- [ ] ExecutorTestContract 5 standard tests pass for every new executor
- [ ] Coverage is at or above 80% overall: `pytest --cov-fail-under=80`
- [ ] Security-critical files have 100% coverage (SSRF, SQL, sandbox, secrets, expressions)
- [ ] No test uses `time.sleep()` -- use `asyncio.sleep()` or mock time instead
- [ ] No test makes real HTTP requests -- use `httpx` mocking or `respx`
- [ ] No test connects to real Redis/PostgreSQL -- use mock fixtures from conftest
- [ ] All async tests use `@pytest.mark.asyncio` or are auto-detected via `asyncio_mode = auto`
- [ ] Test class names start with `Test` and test function names start with `test_`
- [ ] Black formatting applied: `black tests/ --check`
- [ ] No flaky tests -- all tests are deterministic (no random data, no time-dependent assertions)
- [ ] Each test file has a module docstring explaining what it covers
- [ ] Security tests include parametrized attack vectors (multiple payloads per test)
- [ ] Integration tests properly clean up state (fixtures use function scope)
- [ ] E2E tests can run in isolation (no dependency on test execution order)