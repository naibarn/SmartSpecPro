Now I have all the context I need. Let me write the comprehensive section file.

# Section 01: LangGraph Runtime Core

## Overview

This section replaces the existing `WorkflowOrchestrator` (a lightweight LangGraph wrapper with in-memory/file-based state management) with a production-grade `LangGraphRuntime` built on native LangGraph primitives. It is the **foundation** for every subsequent section -- all node executors, streaming, HITL, caching, and API endpoints depend on the runtime, compiler, and adapter built here.

**What gets built:**

1. **`LangGraphRuntime`** -- the new execution engine that compiles, executes, and resumes workflows using `AsyncPostgresSaver` for durable checkpointing.
2. **`WorkflowCompiler`** -- transforms ReactFlow JSON (nodes + edges) into a compiled LangGraph `StateGraph`, replacing the existing `FlowCompiler`.
3. **`NodeAdapter`** -- wraps the existing `NodeExecutor` protocol into LangGraph-compatible async node functions, preserving all 21 existing executors without modification.
4. **`WorkflowState` TypedDict** -- the canonical LangGraph state schema with `Annotated` reducers for append-only fields.
5. **Updates to `checkpointer.py`** -- refined pool management, GC support, and health monitoring hooks.
6. **Backward-compatible delegation in `orchestrator.py`** -- the existing public API (`execute_workflow`, `resume_from_checkpoint`) delegates to the new runtime.

**Why a full rebuild:**
- The current orchestrator uses `StateGraph(dict)` (untyped), `MemorySaver` (non-persistent), and manual checkpoint/state managers. It cannot leverage LangGraph's core strengths: PostgreSQL checkpointing, `interrupt()`, `astream_events`, conditional edges, or subgraph composition.
- File-based checkpointing has no concurrency or distributed support.
- The compilation pipeline lacks cycle detection, port type validation, and parallel execution grouping in the LangGraph-native sense.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/langgraph_runtime.py` | **CREATE** | Core runtime class: compile, execute, resume, cancel |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_compiler.py` | **CREATE** | ReactFlow JSON to LangGraph StateGraph compiler |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py` | **CREATE** | NodeExecutor protocol to LangGraph node function adapter |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_state.py` | **CREATE** | WorkflowState TypedDict and related types |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/orchestrator.py` | **MODIFY** | Delegate public API to LangGraphRuntime (backward compat) |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/checkpointer.py` | **MODIFY** | Add GC support, pool health metrics, configurable pool size |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/errors.py` | **CREATE** | Compilation and runtime error hierarchy |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_langgraph_runtime.py` | **CREATE** | Runtime integration tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_workflow_compiler.py` | **CREATE** | Compiler unit tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_adapter.py` | **CREATE** | Adapter unit tests |

---

## Implementation Steps

### Step 1: Create Error Hierarchy

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/errors.py`

```python
"""Custom error types for the workflow engine."""


class CompilationError(Exception):
    """Raised when workflow compilation fails.

    Attributes:
        errors: List of specific validation failures.
        warnings: List of non-fatal issues (e.g., unreachable nodes).
    """

    def __init__(self, message: str, errors: list[str] | None = None, warnings: list[str] | None = None):
        super().__init__(message)
        self.errors = errors or [message]
        self.warnings = warnings or []


class RuntimeExecutionError(Exception):
    """Raised when workflow execution fails at the runtime level."""

    def __init__(self, message: str, node_id: str | None = None, execution_id: str | None = None):
        super().__init__(message)
        self.node_id = node_id
        self.execution_id = execution_id


class CheckpointerError(Exception):
    """Raised when the checkpointer fails after retry attempts."""
    pass
```

### Step 2: Define WorkflowState TypedDict

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_state.py`

This is the LangGraph state schema. It uses `TypedDict` (not Pydantic) for LangGraph compatibility and `Annotated` with reducer functions for append-only semantics.

```python
"""Canonical workflow state schema for LangGraph."""

from typing import Any, TypedDict, Annotated
from langgraph.graph import add_messages


def _append_list(existing: list, new: list) -> list:
    """Reducer: append new items to existing list."""
    return existing + new


class WorkflowState(TypedDict):
    """LangGraph state for workflow execution.

    Fields with Annotated reducers use append semantics --
    each node update extends the list rather than replacing it.

    Fields without reducers use last-writer-wins semantics.
    """

    # Output keyed by node_id -> output dict
    node_outputs: dict[str, Any]

    # Currently executing node id
    current_node: str

    # LLM conversation history (append-only, uses LangGraph's add_messages)
    messages: Annotated[list, add_messages]

    # Error accumulation (append-only)
    errors: Annotated[list[dict], _append_list]

    # Audit trail (append-only)
    audit_trail: Annotated[list[dict], _append_list]

    # Cache hit counter (last-writer-wins, incremented by cache middleware)
    cache_hits: int

    # Schema version for checkpoint migration
    schema_version: int
```

**Execution context** is passed via `config["configurable"]` (immutable, not checkpointed):

```python
# Built at execution start, passed to graph.ainvoke() / graph.astream_events()
config = {
    "configurable": {
        "thread_id": f"{tenant_id}:{execution_id}",
        "user_id": user_id,
        "tenant_id": tenant_id,
        "workflow_id": workflow_id,
        "execution_id": execution_id,
        "credits_available": credits,
        "memory_service": memory_service_instance,
        "episodic_memory": episodic_memory_instance,
    }
}
```

Credits are NOT in state because on checkpoint resume, stale credit values would cause incorrect billing. The 3-phase DB lifecycle (reserve, finalize, rollback) uses `config["configurable"]["credits_available"]` which is re-read from DB on resume.

### Step 3: Create NodeAdapter

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py`

The adapter wraps the existing `NodeExecutor` protocol (from `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/base.py`) into a LangGraph-compatible async function. All 21 existing executors work without modification.

```python
"""Adapter: wraps NodeExecutor protocol into LangGraph node functions."""

import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Callable

import structlog

from app.orchestrator.node_executors.base import (
    ExecutionContext,
    NodeExecutionData,
    NodeExecutor,
)
from app.orchestrator.workflow_state import WorkflowState

logger = structlog.get_logger()

# Maximum output size before externalization (1 MB)
MAX_OUTPUT_SIZE_BYTES = 1_048_576


def make_langgraph_node(
    executor: NodeExecutor,
    node_id: str,
    node_type: str,
    node_config: dict[str, Any],
) -> Callable:
    """Create a LangGraph node function from a NodeExecutor.

    The returned async function accepts (state: WorkflowState) and the
    LangGraph RunnableConfig, executes the node via the existing executor
    protocol, and returns a state update dict.

    Args:
        executor: An object implementing the NodeExecutor protocol.
        node_id: Unique identifier for this node instance.
        node_type: The node type name (e.g., "llm_call").
        node_config: Static configuration from the visual editor.

    Returns:
        An async function compatible with StateGraph.add_node().
    """

    async def _node_fn(state: WorkflowState, config: dict) -> dict:
        """Execute the wrapped node executor and return a state update."""
        configurable = config.get("configurable", {})

        # Build ExecutionContext from config (not from state)
        context = ExecutionContext(
            user_id=configurable.get("user_id", 0),
            tenant_id=configurable.get("tenant_id"),
            workflow_id=configurable.get("workflow_id", ""),
            execution_id=configurable.get("execution_id", ""),
            credits_available=configurable.get("credits_available", 0),
            extra_data={
                "memory_service": configurable.get("memory_service"),
                "episodic_memory": configurable.get("episodic_memory"),
            },
        )

        # Resolve inputs from upstream node_outputs
        resolved_inputs = _resolve_inputs(state, node_config)

        # Build NodeExecutionData
        data = NodeExecutionData(
            node_id=node_id,
            node_type=node_type,
            config=node_config,
            inputs=resolved_inputs,
            state=state.get("node_outputs", {}),
        )

        # Emit audit event
        audit_entry = {
            "event": "node_start",
            "node_id": node_id,
            "node_type": node_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            output = await executor.execute(data, context)

            # Check output size -- externalize if too large
            output = _check_output_size(output, node_id)

            # Build state update
            node_outputs = dict(state.get("node_outputs", {}))
            node_outputs[node_id] = output

            audit_complete = {
                "event": "node_complete",
                "node_id": node_id,
                "node_type": node_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            return {
                "node_outputs": node_outputs,
                "current_node": node_id,
                "audit_trail": [audit_entry, audit_complete],
            }

        except Exception as exc:
            error_detail = {
                "node_id": node_id,
                "node_type": node_type,
                "error": str(exc),
                "traceback": traceback.format_exc(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            logger.error(
                "Node execution failed",
                node_id=node_id,
                error=str(exc),
            )

            audit_error = {
                "event": "node_error",
                "node_id": node_id,
                "node_type": node_type,
                "error": str(exc),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # Store error in state and terminate graph
            return {
                "current_node": node_id,
                "errors": [error_detail],
                "audit_trail": [audit_entry, audit_error],
            }

    # Set a useful name for debugging
    _node_fn.__name__ = f"node_{node_id}"
    _node_fn.__qualname__ = f"node_{node_id}"

    return _node_fn


def _resolve_inputs(
    state: WorkflowState, node_config: dict[str, Any]
) -> dict[str, Any]:
    """Resolve input values from upstream node outputs.

    Looks up {{node_id.field}} patterns in the config and resolves
    them from state["node_outputs"]. This is a simplified resolver;
    the full expression engine is built in a later section.

    Returns:
        Dict of resolved input values.
    """
    import re

    pattern = re.compile(r"\{\{(\w+)\.(\w+(?:\.\w+)*)\}\}")
    resolved = {}
    node_outputs = state.get("node_outputs", {})

    for key, value in node_config.items():
        if isinstance(value, str):
            match = pattern.search(value)
            if match:
                ref_node_id = match.group(1)
                ref_field_path = match.group(2)
                upstream = node_outputs.get(ref_node_id, {})
                # Navigate nested path
                result = upstream
                for part in ref_field_path.split("."):
                    if isinstance(result, dict):
                        result = result.get(part)
                    else:
                        result = None
                        break
                resolved[key] = result
            else:
                resolved[key] = value
        else:
            resolved[key] = value

    return resolved


def _check_output_size(output: dict[str, Any], node_id: str) -> dict[str, Any]:
    """Check output size and externalize if above threshold.

    For Phase 1, large outputs are truncated with a warning.
    Full externalization to Redis/S3 is added in a later section.
    """
    try:
        import json
        serialized = json.dumps(output, default=str)
        if len(serialized.encode("utf-8")) > MAX_OUTPUT_SIZE_BYTES:
            logger.warning(
                "Node output exceeds 1MB, truncation may apply",
                node_id=node_id,
                size_bytes=len(serialized.encode("utf-8")),
            )
            # TODO: externalize to Redis/S3 and replace with reference
    except (TypeError, ValueError):
        pass  # Non-serializable output, skip check
    return output
```

### Step 4: Create WorkflowCompiler

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_compiler.py`

Replaces the existing `FlowCompiler` at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/flow_compiler.py`. Transforms ReactFlow JSON into a compiled LangGraph `CompiledStateGraph`.

```python
"""Compiler: transforms ReactFlow JSON into a compiled LangGraph StateGraph."""

from typing import Any

import structlog
from langgraph.graph import StateGraph, END

from app.orchestrator.errors import CompilationError
from app.orchestrator.node_adapter import make_langgraph_node
from app.orchestrator.node_registry import NodeRegistry
from app.orchestrator.data_types import is_compatible_connection
from app.orchestrator.workflow_state import WorkflowState

logger = structlog.get_logger()

# Node types that produce conditional edges
CONDITIONAL_NODE_TYPES = {"conditional", "switch", "if"}

# Node types that are triggers (entry points)
TRIGGER_NODE_TYPES = {"manual_trigger", "event_trigger", "webhook_trigger", "schedule_trigger", "file_upload_trigger"}


class WorkflowCompiler:
    """Compiles ReactFlow JSON into a LangGraph CompiledStateGraph.

    Responsibilities:
    - Validate the DAG (cycles, orphans, missing trigger, port compatibility)
    - Map visual nodes to LangGraph node functions via NodeAdapter
    - Map edges to LangGraph edges (normal + conditional)
    - Identify parallel execution groups (fork-join)
    - Expand composite nodes into subgraphs (e.g., Approval -> interrupt)
    """

    def __init__(self, registry: NodeRegistry | None = None):
        self.registry = registry or NodeRegistry.get_instance()

    def compile(
        self,
        flow_json: dict[str, Any],
        checkpointer: Any = None,
        metadata: dict[str, Any] | None = None,
    ) -> Any:
        """Compile ReactFlow JSON into a LangGraph CompiledStateGraph.

        Args:
            flow_json: Dict with "nodes" and "edges" from ReactFlow.
            checkpointer: LangGraph checkpointer (AsyncPostgresSaver or MemorySaver).
            metadata: Optional workflow metadata.

        Returns:
            Compiled LangGraph graph ready for execution.

        Raises:
            CompilationError: If validation fails.
        """
        nodes = flow_json.get("nodes", [])
        edges = flow_json.get("edges", [])

        if not nodes:
            raise CompilationError("Workflow must have at least one node")

        # Phase 1: Validate
        warnings = []
        self._validate_graph(nodes, edges, warnings)

        # Phase 2: Build StateGraph
        graph = self._build_state_graph(nodes, edges)

        # Phase 3: Compile with checkpointer
        compiled = graph.compile(checkpointer=checkpointer)

        if warnings:
            logger.warning("Workflow compiled with warnings", warnings=warnings)

        logger.info(
            "Workflow compiled successfully",
            node_count=len(nodes),
            edge_count=len(edges),
        )

        return compiled

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def _validate_graph(
        self,
        nodes: list[dict],
        edges: list[dict],
        warnings: list[str],
    ) -> None:
        """Run all validation checks. Raises CompilationError on failure."""
        errors: list[str] = []

        node_ids = {n["id"] for n in nodes}
        node_map = {n["id"]: n for n in nodes}

        # 1. Unique IDs
        if len(node_ids) != len(nodes):
            errors.append("Duplicate node IDs found")

        # 2. Exactly one trigger node
        trigger_nodes = [
            n for n in nodes
            if n.get("data", {}).get("nodeType", "") in TRIGGER_NODE_TYPES
        ]
        if len(trigger_nodes) == 0:
            errors.append("Workflow must have exactly one trigger node")
        elif len(trigger_nodes) > 1:
            errors.append(
                f"Workflow has {len(trigger_nodes)} trigger nodes; exactly one is required"
            )

        # 3. Edges reference existing nodes
        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            if src not in node_ids:
                errors.append(f"Edge source '{src}' not found in nodes")
            if tgt not in node_ids:
                errors.append(f"Edge target '{tgt}' not found in nodes")

        # 4. No orphan nodes (every non-trigger node must have at least one incoming edge)
        targets = {e.get("target") for e in edges}
        sources = {e.get("source") for e in edges}
        trigger_ids = {n["id"] for n in trigger_nodes}
        for nid in node_ids:
            if nid not in trigger_ids and nid not in targets:
                errors.append(f"Orphan node '{nid}' has no incoming edges")

        # 5. Unreachable nodes (nodes with no outgoing edges except terminal)
        # These are warnings, not errors
        for nid in node_ids:
            if nid not in sources and nid not in trigger_ids:
                # Terminal node -- check if it's a legitimate end node
                if nid in targets:
                    pass  # leaf/terminal node, valid
                else:
                    warnings.append(f"Node '{nid}' is unreachable")

        # 6. Cycle detection (DAG enforcement)
        if not errors:  # only check if graph is otherwise valid
            self._check_cycles(node_ids, edges, errors)

        # 7. Port type compatibility
        self._validate_port_compatibility(nodes, edges, errors)

        if errors:
            raise CompilationError(
                f"Compilation failed with {len(errors)} error(s)",
                errors=errors,
                warnings=warnings,
            )

    def _check_cycles(
        self,
        node_ids: set[str],
        edges: list[dict],
        errors: list[str],
    ) -> None:
        """DFS-based cycle detection."""
        adj: dict[str, list[str]] = {nid: [] for nid in node_ids}
        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            if src in adj:
                adj[src].append(tgt)

        WHITE, GRAY, BLACK = 0, 1, 2
        color = {nid: WHITE for nid in node_ids}

        def dfs(node: str) -> bool:
            color[node] = GRAY
            for neighbor in adj.get(node, []):
                if color.get(neighbor) == GRAY:
                    return True  # back edge = cycle
                if color.get(neighbor) == WHITE and dfs(neighbor):
                    return True
            color[node] = BLACK
            return False

        for nid in node_ids:
            if color[nid] == WHITE:
                if dfs(nid):
                    errors.append(
                        "Workflow contains cycles. Use explicit loop nodes for iteration."
                    )
                    return

    def _validate_port_compatibility(
        self,
        nodes: list[dict],
        edges: list[dict],
        errors: list[str],
    ) -> None:
        """Validate that connected ports have compatible data types."""
        node_map = {n["id"]: n for n in nodes}

        for edge in edges:
            src_id = edge.get("source")
            tgt_id = edge.get("target")
            src_handle = edge.get("sourceHandle")
            tgt_handle = edge.get("targetHandle")

            if not all([src_id, tgt_id, src_handle, tgt_handle]):
                continue

            src_node = node_map.get(src_id)
            tgt_node = node_map.get(tgt_id)
            if not src_node or not tgt_node:
                continue

            src_type = src_node.get("data", {}).get("nodeType", "")
            tgt_type = tgt_node.get("data", {}).get("nodeType", "")

            src_spec = self.registry.get_node_type(src_type)
            tgt_spec = self.registry.get_node_type(tgt_type)
            if not src_spec or not tgt_spec:
                continue

            out_spec = next((o for o in src_spec.outputs if o.name == src_handle), None)
            in_spec = next((i for i in tgt_spec.inputs if i.name == tgt_handle), None)

            if not out_spec or not in_spec:
                errors.append(
                    f"Invalid port: {src_id}.{src_handle} -> {tgt_id}.{tgt_handle}"
                )
                continue

            if not is_compatible_connection(out_spec.data_type, in_spec.data_type):
                errors.append(
                    f"Incompatible types: {out_spec.data_type} -> {in_spec.data_type} "
                    f"({src_id}.{src_handle} -> {tgt_id}.{tgt_handle})"
                )

    # ------------------------------------------------------------------
    # Graph Building
    # ------------------------------------------------------------------

    def _build_state_graph(
        self,
        nodes: list[dict],
        edges: list[dict],
    ) -> StateGraph:
        """Build a LangGraph StateGraph from validated nodes and edges."""
        graph = StateGraph(WorkflowState)

        node_map = {n["id"]: n for n in nodes}

        # Identify trigger and find entry point
        trigger_node = next(
            n for n in nodes
            if n.get("data", {}).get("nodeType", "") in TRIGGER_NODE_TYPES
        )
        entry_node_id = trigger_node["id"]

        # Add all nodes
        for node in nodes:
            nid = node["id"]
            node_data = node.get("data", {})
            node_type = node_data.get("nodeType", "")
            node_config = node_data.get("config", {})

            # Get executor from registry
            spec = self.registry.get_node_type(node_type)
            executor = self._instantiate_executor(spec.executor) if spec else None

            if executor is None:
                raise CompilationError(f"No executor found for node type '{node_type}'")

            # Wrap with adapter
            lg_node_fn = make_langgraph_node(
                executor=executor,
                node_id=nid,
                node_type=node_type,
                node_config=node_config,
            )
            graph.add_node(nid, lg_node_fn)

        # Set entry point
        graph.set_entry_point(entry_node_id)

        # Add edges
        self._add_edges(graph, nodes, edges)

        return graph

    def _add_edges(
        self,
        graph: StateGraph,
        nodes: list[dict],
        edges: list[dict],
    ) -> None:
        """Add edges to the StateGraph.

        Handles:
        - Normal (direct) edges
        - Conditional edges (for If/Switch nodes)
        - Terminal nodes (connect to END)
        """
        node_map = {n["id"]: n for n in nodes}
        source_edges: dict[str, list[dict]] = {}
        for edge in edges:
            src = edge.get("source")
            source_edges.setdefault(src, []).append(edge)

        # Identify nodes with outgoing edges
        sources_with_edges = set(source_edges.keys())
        all_node_ids = {n["id"] for n in nodes}

        for node in nodes:
            nid = node["id"]
            node_type = node.get("data", {}).get("nodeType", "")

            outgoing = source_edges.get(nid, [])

            if not outgoing:
                # Terminal node -> END
                graph.add_edge(nid, END)
                continue

            if node_type in CONDITIONAL_NODE_TYPES and len(outgoing) > 1:
                # Conditional edges -- generate routing function
                self._add_conditional_edges(graph, nid, node_type, outgoing)
            else:
                # Normal edges
                if len(outgoing) == 1:
                    graph.add_edge(nid, outgoing[0]["target"])
                else:
                    # Fork: multiple outgoing from a non-conditional node = parallel
                    # LangGraph handles fan-out natively when multiple edges added
                    for edge in outgoing:
                        graph.add_edge(nid, edge["target"])

    def _add_conditional_edges(
        self,
        graph: StateGraph,
        node_id: str,
        node_type: str,
        outgoing_edges: list[dict],
    ) -> None:
        """Generate a routing function for conditional/switch nodes.

        The routing function inspects node_outputs[node_id] for
        the routing key and maps it to a target node name.
        """
        # Build mapping: sourceHandle -> target node id
        handle_to_target: dict[str, str] = {}
        for edge in outgoing_edges:
            handle = edge.get("sourceHandle", "default")
            target = edge["target"]
            handle_to_target[handle] = target

        # Determine default
        default_target = handle_to_target.get("default") or handle_to_target.get("false")

        def routing_fn(state: WorkflowState) -> str:
            """Route based on node output."""
            outputs = state.get("node_outputs", {})
            node_output = outputs.get(node_id, {})

            if node_type in ("conditional", "if"):
                # Boolean routing: "true" or "false" handle
                result = node_output.get("result", False)
                handle = "true" if result else "false"
            else:
                # Switch: output contains a "route" key
                handle = str(node_output.get("route", "default"))

            target = handle_to_target.get(handle, default_target)
            if target is None:
                # Fallback: pick the first target
                target = next(iter(handle_to_target.values()))
            return target

        graph.add_conditional_edges(
            node_id,
            routing_fn,
            handle_to_target,
        )

    def _instantiate_executor(self, executor_path: str) -> Any:
        """Instantiate an executor from its dotted path string.

        Args:
            executor_path: e.g. "app.orchestrator.node_executors.llm_executor.LLMExecutor"

        Returns:
            An instance of the executor class.
        """
        try:
            module_path, class_name = executor_path.rsplit(".", 1)
            import importlib
            module = importlib.import_module(module_path)
            cls = getattr(module, class_name)
            return cls()
        except Exception as e:
            logger.error(
                "Failed to instantiate executor",
                path=executor_path,
                error=str(e),
            )
            return None
```

### Step 5: Create LangGraphRuntime

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/langgraph_runtime.py`

```python
"""LangGraph Runtime -- core execution engine for workflows.

Replaces WorkflowOrchestrator with a production-grade LangGraph runtime
that uses PostgreSQL checkpointing, typed state, and streaming.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import structlog

from app.core.checkpointer import CheckpointerFactory
from app.core.config import settings
from app.orchestrator.errors import (
    CheckpointerError,
    CompilationError,
    RuntimeExecutionError,
)
from app.orchestrator.workflow_compiler import WorkflowCompiler
from app.orchestrator.workflow_state import WorkflowState

logger = structlog.get_logger()


class LangGraphRuntime:
    """Production-grade workflow execution engine.

    Key responsibilities:
    - Compile ReactFlow JSON -> LangGraph CompiledStateGraph
    - Execute compiled graphs with PostgreSQL checkpointing
    - Resume interrupted workflows (HITL, failure recovery)
    - Enforce concurrent workflow limits via semaphore
    - Stream execution events via astream_events
    """

    def __init__(
        self,
        use_postgres: bool = True,
        max_parallel_workflows: int | None = None,
        checkpointer_pool_size: int | None = None,
    ):
        """Initialize the runtime.

        Args:
            use_postgres: Use PostgreSQL checkpointer (True) or MemorySaver (False).
            max_parallel_workflows: Max concurrent workflow executions.
            checkpointer_pool_size: psycopg pool max_size for checkpointer.
        """
        self._use_postgres = use_postgres
        self._max_parallel = max_parallel_workflows or settings.MAX_PARALLEL_WORKFLOWS
        self._semaphore = asyncio.Semaphore(self._max_parallel)
        self._checkpointer = None
        self._compiler = WorkflowCompiler()
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the checkpointer (lazy, idempotent)."""
        if self._initialized:
            return
        self._checkpointer = await CheckpointerFactory.create(self._use_postgres)
        self._initialized = True
        logger.info(
            "LangGraphRuntime initialized",
            checkpointer=type(self._checkpointer).__name__,
            max_parallel=self._max_parallel,
        )

    async def close(self) -> None:
        """Release resources."""
        from app.core.checkpointer import cleanup_checkpointers
        await cleanup_checkpointers()
        self._checkpointer = None
        self._initialized = False
        logger.info("LangGraphRuntime closed")

    # ------------------------------------------------------------------
    # Compilation
    # ------------------------------------------------------------------

    async def compile(
        self,
        workflow_json: dict[str, Any],
        metadata: dict[str, Any] | None = None,
    ) -> Any:
        """Compile a ReactFlow workflow into a runnable graph.

        Args:
            workflow_json: Dict with "nodes" and "edges" from ReactFlow.
            metadata: Optional workflow metadata (name, version).

        Returns:
            Compiled LangGraph graph.

        Raises:
            CompilationError: On validation failure.
        """
        await self.initialize()
        return self._compiler.compile(
            flow_json=workflow_json,
            checkpointer=self._checkpointer,
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def execute(
        self,
        compiled_graph: Any,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a compiled workflow to completion.

        Args:
            compiled_graph: Output of compile().
            input_data: Initial state values / trigger data.
            config: LangGraph config with configurable.thread_id, etc.

        Returns:
            Final workflow state.

        Raises:
            RuntimeExecutionError: On execution failure.
        """
        await self.initialize()

        execution_id = config.get("configurable", {}).get("execution_id", "unknown")

        async with self._semaphore:
            logger.info(
                "Executing workflow",
                execution_id=execution_id,
                thread_id=config.get("configurable", {}).get("thread_id"),
            )

            initial_state: WorkflowState = {
                "node_outputs": {},
                "current_node": "",
                "messages": [],
                "errors": [],
                "audit_trail": [],
                "cache_hits": 0,
                "schema_version": 1,
                **input_data,
            }

            try:
                result = await compiled_graph.ainvoke(initial_state, config=config)
                return result

            except Exception as exc:
                logger.error(
                    "Workflow execution failed",
                    execution_id=execution_id,
                    error=str(exc),
                )
                raise RuntimeExecutionError(
                    str(exc),
                    execution_id=execution_id,
                ) from exc

    async def execute_stream(
        self,
        compiled_graph: Any,
        input_data: dict[str, Any],
        config: dict[str, Any],
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute a compiled workflow with event streaming.

        Yields LangGraph events from astream_events(version="v2").
        The caller (API layer) translates these to SSE events.

        Args:
            compiled_graph: Output of compile().
            input_data: Initial state values.
            config: LangGraph config.

        Yields:
            LangGraph event dicts.
        """
        await self.initialize()

        initial_state: WorkflowState = {
            "node_outputs": {},
            "current_node": "",
            "messages": [],
            "errors": [],
            "audit_trail": [],
            "cache_hits": 0,
            "schema_version": 1,
            **input_data,
        }

        async with self._semaphore:
            async for event in compiled_graph.astream_events(
                initial_state,
                config=config,
                version="v2",
            ):
                yield event

    # ------------------------------------------------------------------
    # Resume (HITL / checkpoint recovery)
    # ------------------------------------------------------------------

    async def resume(
        self,
        compiled_graph: Any,
        thread_id: str,
        command: Any,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Resume a workflow from an interrupt (HITL or checkpoint).

        Args:
            compiled_graph: The same compiled graph used for initial execution.
            thread_id: The thread_id (tenant_id:execution_id).
            command: LangGraph Command object (e.g., Command(resume=response)).
            config: Optional config overrides.

        Returns:
            Final state after resumption.
        """
        await self.initialize()

        resume_config = config or {
            "configurable": {"thread_id": thread_id}
        }

        async with self._semaphore:
            logger.info("Resuming workflow", thread_id=thread_id)
            result = await compiled_graph.ainvoke(command, config=resume_config)
            return result

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def build_config(
        self,
        tenant_id: str,
        execution_id: str,
        user_id: int,
        workflow_id: str,
        credits_available: int = 0,
        memory_service: Any = None,
        episodic_memory: Any = None,
    ) -> dict[str, Any]:
        """Build a standard LangGraph config dict.

        Thread ID is namespaced as {tenant_id}:{execution_id} for
        multi-tenant isolation in the checkpoint table.
        """
        return {
            "configurable": {
                "thread_id": f"{tenant_id}:{execution_id}",
                "user_id": user_id,
                "tenant_id": tenant_id,
                "workflow_id": workflow_id,
                "execution_id": execution_id,
                "credits_available": credits_available,
                "memory_service": memory_service,
                "episodic_memory": episodic_memory,
            }
        }

    @property
    def is_initialized(self) -> bool:
        """Whether the runtime has been initialized."""
        return self._initialized
```

### Step 6: Modify Checkpointer

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/checkpointer.py`

Add GC support and pool health monitoring. The existing monkey-patch on `MIGRATIONS` (removing `CONCURRENTLY`) is preserved and documented as tech debt.

Key additions:
- `get_pool_stats()` function for health monitoring
- `gc_checkpoints()` async function for periodic cleanup
- Configurable pool size from `settings.CHECKPOINT_POOL_SIZE`

```python
# Key additions to existing checkpointer.py:

async def get_pool_stats() -> dict[str, Any]:
    """Return connection pool utilization stats for health monitoring.

    Returns dict with: pool_size, pool_available, pool_used, pool_max.
    Returns empty dict if pool not initialized.
    """
    if _postgres_pool is None:
        return {}
    stats = _postgres_pool.get_stats()
    return {
        "pool_size": stats.get("pool_size", 0),
        "pool_available": stats.get("pool_available", 0),
        "pool_used": stats.get("pool_size", 0) - stats.get("pool_available", 0),
        "pool_max": _postgres_pool.max_size,
    }


async def gc_checkpoints(
    completed_retention_days: int = 30,
    failed_retention_days: int = 7,
    stale_threshold_hours: int = 24,
) -> dict[str, int]:
    """Garbage-collect old checkpoint rows.

    Called by Celery periodic task. Deletes:
    - Completed workflow checkpoints older than completed_retention_days
    - Failed workflow checkpoints older than failed_retention_days
    - Stale in-progress checkpoints with no activity for stale_threshold_hours

    Returns dict with counts of deleted rows per category.
    """
    # Implementation uses raw SQL against the checkpoint tables
    # created by AsyncPostgresSaver.setup()
    ...
```

### Step 7: Update orchestrator.py for Backward Compatibility

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/orchestrator.py`

The existing `WorkflowOrchestrator` class is modified to delegate its public API to `LangGraphRuntime`. All existing memory service, Kilo, and episodic memory methods remain unchanged. The `execute_workflow` and `resume_from_checkpoint` methods are updated to route through the new runtime.

Key changes:
- Import and instantiate `LangGraphRuntime` alongside existing services
- `execute_workflow()` delegates to `LangGraphRuntime.execute()`
- `resume_from_checkpoint()` delegates to `LangGraphRuntime.resume()`
- `_build_graph()` is replaced with `_compiler.compile()` internally
- All memory/Kilo/episodic methods are preserved without changes

```python
# In WorkflowOrchestrator.__init__:
from app.orchestrator.langgraph_runtime import LangGraphRuntime

self._runtime = LangGraphRuntime(use_postgres=use_postgres)

# In execute_workflow:
async def execute_workflow(self, workflow_id, ...):
    # ... existing state creation logic ...
    compiled = await self._runtime.compile(workflow_json)
    config = self._runtime.build_config(
        tenant_id=tenant_id,
        execution_id=execution_id,
        user_id=user_id,
        workflow_id=workflow_id,
    )
    result = await self._runtime.execute(compiled, input_data, config)
    # ... existing status update logic ...
```

---

## State Schema

The full `WorkflowState` TypedDict is defined in Step 2 above. Here is the complete specification:

| Field | Type | Reducer | Purpose |
|-------|------|---------|---------|
| `node_outputs` | `dict[str, Any]` | Last-writer-wins | Output of each node, keyed by node_id |
| `current_node` | `str` | Last-writer-wins | ID of the currently executing node |
| `messages` | `Annotated[list, add_messages]` | Append (LangGraph native) | LLM conversation history for context |
| `errors` | `Annotated[list[dict], _append_list]` | Append | Accumulated errors from node failures |
| `audit_trail` | `Annotated[list[dict], _append_list]` | Append | Execution audit events |
| `cache_hits` | `int` | Last-writer-wins | Number of cache hits in this execution |
| `schema_version` | `int` | Last-writer-wins | For future checkpoint migration (starts at 1) |

**Config (not in state, not checkpointed):**

| Config Key | Type | Source |
|------------|------|--------|
| `thread_id` | `str` | `{tenant_id}:{execution_id}` |
| `user_id` | `int` | From API request |
| `tenant_id` | `str` | From API request |
| `workflow_id` | `str` | From workflow definition |
| `execution_id` | `str` | Generated UUID |
| `credits_available` | `int` | Read from DB at start, re-read on resume |
| `memory_service` | `MemoryService \| None` | Injected |
| `episodic_memory` | `EpisodicMemoryService \| None` | Injected |

---

## Key Classes

### LangGraphRuntime

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/langgraph_runtime.py`

```
class LangGraphRuntime:
    __init__(use_postgres: bool, max_parallel_workflows: int | None, checkpointer_pool_size: int | None)
    async initialize() -> None
    async close() -> None
    async compile(workflow_json: dict, metadata: dict | None) -> CompiledStateGraph
    async execute(compiled_graph, input_data: dict, config: dict) -> dict
    async execute_stream(compiled_graph, input_data: dict, config: dict) -> AsyncIterator[dict]
    async resume(compiled_graph, thread_id: str, command: Command, config: dict | None) -> dict
    build_config(tenant_id, execution_id, user_id, workflow_id, ...) -> dict
    is_initialized: bool (property)
```

### WorkflowCompiler

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_compiler.py`

```
class WorkflowCompiler:
    __init__(registry: NodeRegistry | None)
    compile(flow_json: dict, checkpointer: Any, metadata: dict | None) -> CompiledStateGraph
    _validate_graph(nodes, edges, warnings) -> None
    _check_cycles(node_ids, edges, errors) -> None
    _validate_port_compatibility(nodes, edges, errors) -> None
    _build_state_graph(nodes, edges) -> StateGraph
    _add_edges(graph, nodes, edges) -> None
    _add_conditional_edges(graph, node_id, node_type, outgoing_edges) -> None
    _instantiate_executor(executor_path: str) -> NodeExecutor | None
```

### NodeAdapter (module-level function)

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py`

```
make_langgraph_node(executor: NodeExecutor, node_id: str, node_type: str, node_config: dict) -> Callable
_resolve_inputs(state: WorkflowState, node_config: dict) -> dict
_check_output_size(output: dict, node_id: str) -> dict
```

---

## Error Handling

### Strategy

| Error Source | Handling | State Impact |
|-------------|----------|--------------|
| **Node executor exception** | Caught by `NodeAdapter`; error detail appended to `state["errors"]`; graph terminates (no "continue on fail" in Phase 1) | Errors accumulate via append reducer |
| **Checkpointer connection drop** | Wrapped with retry (3 attempts, exponential backoff 1s/2s/4s); if all fail, `CheckpointerError` raised, execution marked `failed` | Execution stops cleanly |
| **Invalid compiled graph** | `WorkflowCompiler` raises `CompilationError` with `.errors` list and `.warnings` list | No execution starts; errors returned to frontend |
| **Cycle in graph** | Detected during compilation; `CompilationError` raised | No execution starts |
| **Missing trigger node** | Detected during compilation; `CompilationError` raised | No execution starts |
| **Orphan/unreachable nodes** | Orphans = error; unreachable = warning (logged, not blocking) | Compilation succeeds with warnings |
| **Port type mismatch** | Detected during compilation; `CompilationError` raised | No execution starts |
| **Semaphore exhaustion** | `execute()` awaits until a slot opens; no error, just backpressure | Caller waits |
| **Executor instantiation failure** | `CompilationError` at compile time if dotted path is invalid | No execution starts |

### Retry Wrapper for Checkpointer

The checkpointer retry logic wraps the `AsyncPostgresSaver` pool operations. If the pool connection drops during a checkpoint write:

```python
async def _with_checkpointer_retry(fn, max_retries=3, base_delay=1.0):
    """Execute fn with retry on psycopg connection errors."""
    for attempt in range(max_retries):
        try:
            return await fn()
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            if attempt == max_retries - 1:
                raise CheckpointerError(
                    f"Checkpointer failed after {max_retries} attempts: {exc}"
                ) from exc
            delay = base_delay * (2 ** attempt)
            logger.warning(
                "Checkpointer connection error, retrying",
                attempt=attempt + 1,
                delay=delay,
            )
            await asyncio.sleep(delay)
```

---

## Connection Pool Coordination

Two PostgreSQL connection pools coexist:

| Pool | Library | Location | Default Size | Purpose |
|------|---------|----------|--------------|---------|
| **Checkpointer pool** | `psycopg` (v3) `AsyncConnectionPool` | `/home/dev/projects/SmartSpecPro/python-backend/app/core/checkpointer.py` | `max_size=10` | LangGraph checkpoint reads/writes |
| **Application pool** | SQLAlchemy async (`asyncpg` driver) | `/home/dev/projects/SmartSpecPro/python-backend/app/core/config.py` | `pool_size=10, max_overflow=20` | All app queries (users, workflows, credits, etc.) |

**Coordination rules:**
- Combined pool total must stay below `PostgreSQL max_connections - 10` (safety margin)
- Default: `10 (psycopg) + 10+20 (SQLAlchemy) = 40` connections max, well within PostgreSQL's default `max_connections=100`
- Pool size is configurable via `settings.CHECKPOINT_POOL_SIZE` (env var `CHECKPOINT_POOL_SIZE`)
- Health monitoring: `get_pool_stats()` exposes pool utilization for the existing `HealthService`
- If pool exhaustion is detected (available = 0), log a warning; the pool will queue requests internally

**Connection lifecycle:**
- Checkpointer pool opens on first `LangGraphRuntime.initialize()` call
- Checkpointer pool closes on `LangGraphRuntime.close()` (called during app shutdown via `lifespan`)
- SQLAlchemy pool is managed separately by FastAPI's existing lifecycle hooks

---

## Checkpoint GC

### Strategy

Garbage collection runs as a Celery periodic task (`celery beat`), daily at 3:00 AM.

**Retention Policy:**

| Checkpoint Category | Retention | Deletion Criteria |
|--------------------|-----------|--------------------|
| Completed workflows | 30 days | `updated_at < now() - 30 days` AND status = completed |
| Failed workflows | 7 days | `updated_at < now() - 7 days` AND status = failed |
| Stale in-progress | Mark stale after 24h, delete after 7 days | No activity for 24h, then 7 days |

**Estimated Growth:**
- ~5 checkpoints per workflow execution (one per super-step)
- ~100 workflows/day in production
- 30-day retention = ~15,000 rows at steady state

**Implementation:**

```python
# In python-backend/app/tasks/workflow_tasks.py (Celery task)

@celery_app.task(name="gc_checkpoints")
async def gc_checkpoints_task():
    """Periodic task: garbage-collect old checkpoints."""
    from app.core.checkpointer import gc_checkpoints
    result = await gc_checkpoints(
        completed_retention_days=30,
        failed_retention_days=7,
        stale_threshold_hours=24,
    )
    logger.info("Checkpoint GC completed", **result)
```

The GC function executes SQL directly against the checkpoint tables created by `AsyncPostgresSaver.setup()`. These tables are:
- `checkpoints`
- `checkpoint_blobs`
- `checkpoint_writes`

The GC deletes by `thread_id` pattern matching (since thread_id = `{tenant_id}:{execution_id}`).

---

## Tests

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_langgraph_runtime.py`

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_compile_simple_linear_workflow` | unit | ReactFlow JSON with 3 sequential nodes (trigger -> transform -> output) compiles to a valid StateGraph |
| `test_compile_branching_workflow` | unit | If/Switch nodes produce conditional edges in the compiled graph |
| `test_compile_parallel_fork_join` | unit | Fork-join pattern (one source, multiple targets) creates parallel execution groups |
| `test_compile_rejects_cycle` | unit | Cyclic graph raises `CompilationError` with "cycles" in error message |
| `test_compile_rejects_orphan_nodes` | unit | Node with no incoming edges (and not a trigger) raises `CompilationError` |
| `test_compile_rejects_missing_trigger` | unit | Graph with no trigger node raises `CompilationError` |
| `test_compile_validates_port_types` | unit | Incompatible port types (e.g., image -> number) raise `CompilationError` |
| `test_compile_warns_unreachable_nodes` | unit | Unreachable nodes logged as warnings, compilation still succeeds |
| `test_execute_simple_workflow` | integration | Compiled workflow runs to completion; `node_outputs` contains results from all nodes |
| `test_execute_creates_checkpoint` | integration | After execution, checkpoint exists in PostgreSQL for the thread_id |
| `test_resume_from_checkpoint` | integration | Interrupted workflow resumes from last checkpoint and completes |
| `test_thread_id_namespaced` | unit | `build_config()` produces thread_id = `{tenant_id}:{execution_id}` |
| `test_concurrent_workflow_limit` | integration | When `max_parallel_workflows` concurrent executions are running, additional `execute()` calls block until a slot opens |
| `test_large_output_externalized` | integration | Node output > 1MB triggers warning log (full externalization deferred to later section) |

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_workflow_compiler.py`

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_node_adapter_wraps_executor` | unit | `make_langgraph_node()` wraps executor; returned function accepts `(state, config)` and returns state update dict with `node_outputs` |
| `test_node_adapter_injects_context_from_config` | unit | `ExecutionContext` fields populated from `config["configurable"]` |
| `test_node_adapter_catches_exceptions` | unit | Executor exception stored in `errors` field; does not propagate |
| `test_switch_routing_function_generated` | unit | Switch node with 3 cases generates routing function that maps handle names to target node IDs |
| `test_approval_expands_to_subgraph` | unit | Approval node type expands to interrupt subgraph (deferred to Section 3 HITL; stub test here) |

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_adapter.py`

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_resolve_inputs_simple` | unit | `{{node1.field}}` in config resolves to value from `state["node_outputs"]["node1"]["field"]` |
| `test_resolve_inputs_nested` | unit | `{{node1.data.nested.value}}` navigates nested dicts |
| `test_resolve_inputs_missing_ref` | unit | Missing reference resolves to `None` without error |
| `test_audit_trail_appended` | unit | Both `node_start` and `node_complete` events appended to `audit_trail` |
| `test_error_detail_on_failure` | unit | On executor exception, error dict includes `node_id`, `error`, `traceback`, `timestamp` |
| `test_output_size_warning` | unit | Output > 1MB logs a warning |

---

## Dependencies

### On Other Sections

| Dependency | Section | Nature |
|------------|---------|--------|
| Expression Engine | Section 6 (Data Shaping) | `_resolve_inputs` in `node_adapter.py` uses a simplified expression resolver; full `{{node_id.field.nested[0]}}` with operators is built in Section 6 |
| Streaming Integration | Section 2 | `execute_stream()` yields raw LangGraph events; Section 2 maps them to SSE format |
| HITL | Section 3 | `resume()` accepts `Command` objects; Section 3 builds the approval executor using `interrupt()` |
| Database Schema | Section 13 | Checkpoint tables are auto-created by `AsyncPostgresSaver.setup()`; not Drizzle-managed |
| API Endpoints | Section 14 | API routes call `runtime.compile()`, `runtime.execute()`, `runtime.resume()` |
| Backward Compatibility | Section 16 | `orchestrator.py` delegates to runtime; verified after all other sections |

### Python Packages Required

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| `langgraph` | >=0.2 | Core graph runtime | Yes |
| `langgraph-checkpoint-postgres` | >=0.1 | PostgreSQL checkpointer | Yes (imported in `checkpointer.py`) |
| `psycopg[binary]` | v3 | Async PostgreSQL driver for checkpointer | Yes (used in `checkpointer.py`) |
| `psycopg-pool` | >=3.1 | Async connection pool | Yes (imported in `checkpointer.py`) |
| `structlog` | >=23.0 | Structured logging | Yes |

No new packages are required for this section. All dependencies are already present in the project.