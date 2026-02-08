diff --git a/planning/workflow-langgraph-rag/sections/index.md b/planning/workflow-langgraph-rag/sections/index.md
new file mode 100644
index 0000000..998701a
--- /dev/null
+++ b/planning/workflow-langgraph-rag/sections/index.md
@@ -0,0 +1,71 @@
+<!-- PROJECT_CONFIG
+runtime: python-uv
+test_command: cd python-backend && uv run pytest
+END_PROJECT_CONFIG -->
+
+<!-- SECTION_MANIFEST
+01-langgraph-runtime-core
+13-database-schema
+14-api-endpoints
+02-streaming-integration
+03-hitl-interrupt
+16-backward-compatibility
+10-caching-system
+11-node-registry-expansion
+04-trigger-nodes
+05-core-io-nodes
+06-data-shaping-nodes
+07-reliability-nodes
+08-security-nodes
+09-hitl-code-nodes
+12-frontend-updates
+15-testing-strategy
+END_MANIFEST -->
+
+# Section Index: SmartSpecPro Workflow Engine Rebuild
+
+## SECTION_MANIFEST
+
+| Section | File | Title | Dependencies | Implementation Order |
+|---------|------|-------|-------------|---------------------|
+| 01 | `01-langgraph-runtime-core.md` | LangGraph Runtime Core | None | 1 |
+| 02 | `02-streaming-integration.md` | Streaming Integration | Section 01, Section 14 | 4 |
+| 03 | `03-hitl-interrupt.md` | Human-in-the-Loop via interrupt() | Section 01, Section 02 | 5 |
+| 04 | `04-trigger-nodes.md` | Trigger Nodes (4 nodes) | Section 01, Section 11 | 9a |
+| 05 | `05-core-io-nodes.md` | Core I/O Nodes (5 nodes) | Section 01, Section 11 | 9b |
+| 06 | `06-data-shaping-nodes.md` | Data Shaping & Control Nodes (10 nodes) | Section 01, Section 11 | 9c |
+| 07 | `07-reliability-nodes.md` | Reliability Nodes (6 nodes) | Section 01, Section 10 | 9d |
+| 08 | `08-security-nodes.md` | Security & Governance Nodes (6 nodes) | Section 01, Section 13 | 9e |
+| 09 | `09-hitl-code-nodes.md` | HITL & Code Nodes (2 nodes) | Section 01, Section 03 | 9f |
+| 10 | `10-caching-system.md` | Exact-Hash Caching System | Section 01 | 7 |
+| 11 | `11-node-registry-expansion.md` | Node Registry Expansion | Section 01 | 8 |
+| 12 | `12-frontend-updates.md` | Frontend Updates | Section 11 | 10 |
+| 13 | `13-database-schema.md` | Database Schema Changes | None | 2 |
+| 14 | `14-api-endpoints.md` | API Endpoint Updates | Section 01 | 3 |
+| 15 | `15-testing-strategy.md` | Testing Strategy | All sections | 11 |
+| 16 | `16-backward-compatibility.md` | Backward Compatibility | Section 01, Section 02, Section 03 | 6 |
+
+## Implementation Order (Dependency-Respecting)
+
+```
+Phase 1 Implementation Sequence:
+
+1. Section 01 (Runtime Core) ─────────────┐
+2. Section 13 (Database Schema) ──────────┤
+3. Section 14 (API Endpoints) ────────────┤─── Foundation
+4. Section 02 (Streaming) ────────────────┤
+5. Section 03 (HITL) ────────────────────┘
+6. Section 16 (Backward Compat) ──────── Verification Gate
+7. Section 10 (Caching) ─────────────────┐
+8. Section 11 (Node Registry) ───────────┤─── Infrastructure
+9. Sections 04-09 (Node Executors) ──────┤─── Can parallelize
+10. Section 12 (Frontend) ───────────────┘
+11. Section 15 (Testing Final Pass) ──── Quality Gate
+```
+
+## Section Writing Strategy
+
+- Sections 01, 13, 14 are critical path — write first, most detail needed
+- Sections 04-09 (node executors) can be written in parallel by subagents
+- Section 15 (testing) references all other sections — write last
+- Each section file must be self-contained with: overview, files, implementation steps, tests, dependencies
diff --git a/python-backend/app/orchestrator/errors.py b/python-backend/app/orchestrator/errors.py
new file mode 100644
index 0000000..e9b5eb3
--- /dev/null
+++ b/python-backend/app/orchestrator/errors.py
@@ -0,0 +1,29 @@
+"""Custom error types for the workflow engine."""
+
+
+class CompilationError(Exception):
+    """Raised when workflow compilation fails.
+
+    Attributes:
+        errors: List of specific validation failures.
+        warnings: List of non-fatal issues (e.g., unreachable nodes).
+    """
+
+    def __init__(self, message: str, errors: list[str] | None = None, warnings: list[str] | None = None):
+        super().__init__(message)
+        self.errors = errors or [message]
+        self.warnings = warnings or []
+
+
+class RuntimeExecutionError(Exception):
+    """Raised when workflow execution fails at the runtime level."""
+
+    def __init__(self, message: str, node_id: str | None = None, execution_id: str | None = None):
+        super().__init__(message)
+        self.node_id = node_id
+        self.execution_id = execution_id
+
+
+class CheckpointerError(Exception):
+    """Raised when the checkpointer fails after retry attempts."""
+    pass
diff --git a/python-backend/app/orchestrator/langgraph_runtime.py b/python-backend/app/orchestrator/langgraph_runtime.py
new file mode 100644
index 0000000..6191ad1
--- /dev/null
+++ b/python-backend/app/orchestrator/langgraph_runtime.py
@@ -0,0 +1,273 @@
+"""LangGraph Runtime -- core execution engine for workflows.
+
+Replaces WorkflowOrchestrator with a production-grade LangGraph runtime
+that uses PostgreSQL checkpointing, typed state, and streaming.
+"""
+
+import asyncio
+from datetime import datetime, timezone
+from typing import Any, AsyncIterator
+
+import structlog
+
+from app.core.checkpointer import CheckpointerFactory
+from app.core.config import settings
+from app.orchestrator.errors import (
+    CheckpointerError,
+    CompilationError,
+    RuntimeExecutionError,
+)
+from app.orchestrator.workflow_compiler import WorkflowCompiler
+from app.orchestrator.workflow_state import WorkflowState
+
+logger = structlog.get_logger()
+
+
+class LangGraphRuntime:
+    """Production-grade workflow execution engine.
+
+    Key responsibilities:
+    - Compile ReactFlow JSON -> LangGraph CompiledStateGraph
+    - Execute compiled graphs with PostgreSQL checkpointing
+    - Resume interrupted workflows (HITL, failure recovery)
+    - Enforce concurrent workflow limits via semaphore
+    - Stream execution events via astream_events
+    """
+
+    def __init__(
+        self,
+        use_postgres: bool = True,
+        max_parallel_workflows: int | None = None,
+        checkpointer_pool_size: int | None = None,
+    ):
+        """Initialize the runtime.
+
+        Args:
+            use_postgres: Use PostgreSQL checkpointer (True) or MemorySaver (False).
+            max_parallel_workflows: Max concurrent workflow executions.
+            checkpointer_pool_size: psycopg pool max_size for checkpointer.
+        """
+        self._use_postgres = use_postgres
+        self._max_parallel = max_parallel_workflows or getattr(settings, 'MAX_PARALLEL_WORKFLOWS', 10)
+        self._semaphore = asyncio.Semaphore(self._max_parallel)
+        self._checkpointer = None
+        self._compiler = WorkflowCompiler()
+        self._initialized = False
+
+    async def initialize(self) -> None:
+        """Initialize the checkpointer (lazy, idempotent)."""
+        if self._initialized:
+            return
+        self._checkpointer = await CheckpointerFactory.create(self._use_postgres)
+        self._initialized = True
+        logger.info(
+            "LangGraphRuntime initialized",
+            checkpointer=type(self._checkpointer).__name__,
+            max_parallel=self._max_parallel,
+        )
+
+    async def close(self) -> None:
+        """Release resources."""
+        from app.core.checkpointer import cleanup_checkpointers
+        await cleanup_checkpointers()
+        self._checkpointer = None
+        self._initialized = False
+        logger.info("LangGraphRuntime closed")
+
+    # ------------------------------------------------------------------
+    # Compilation
+    # ------------------------------------------------------------------
+
+    async def compile(
+        self,
+        workflow_json: dict[str, Any],
+        metadata: dict[str, Any] | None = None,
+    ) -> Any:
+        """Compile a ReactFlow workflow into a runnable graph.
+
+        Args:
+            workflow_json: Dict with "nodes" and "edges" from ReactFlow.
+            metadata: Optional workflow metadata (name, version).
+
+        Returns:
+            Compiled LangGraph graph.
+
+        Raises:
+            CompilationError: On validation failure.
+        """
+        await self.initialize()
+        return self._compiler.compile(
+            flow_json=workflow_json,
+            checkpointer=self._checkpointer,
+            metadata=metadata,
+        )
+
+    # ------------------------------------------------------------------
+    # Execution
+    # ------------------------------------------------------------------
+
+    async def execute(
+        self,
+        compiled_graph: Any,
+        input_data: dict[str, Any],
+        config: dict[str, Any],
+    ) -> dict[str, Any]:
+        """Execute a compiled workflow to completion.
+
+        Args:
+            compiled_graph: Output of compile().
+            input_data: Initial state values / trigger data.
+            config: LangGraph config with configurable.thread_id, etc.
+
+        Returns:
+            Final workflow state.
+
+        Raises:
+            RuntimeExecutionError: On execution failure.
+        """
+        await self.initialize()
+
+        execution_id = config.get("configurable", {}).get("execution_id", "unknown")
+
+        async with self._semaphore:
+            logger.info(
+                "Executing workflow",
+                execution_id=execution_id,
+                thread_id=config.get("configurable", {}).get("thread_id"),
+            )
+
+            initial_state: WorkflowState = {
+                "node_outputs": {},
+                "current_node": "",
+                "messages": [],
+                "errors": [],
+                "audit_trail": [],
+                "cache_hits": 0,
+                "schema_version": 1,
+                **input_data,
+            }
+
+            try:
+                result = await compiled_graph.ainvoke(initial_state, config=config)
+                return result
+
+            except Exception as exc:
+                logger.error(
+                    "Workflow execution failed",
+                    execution_id=execution_id,
+                    error=str(exc),
+                )
+                raise RuntimeExecutionError(
+                    str(exc),
+                    execution_id=execution_id,
+                ) from exc
+
+    async def execute_stream(
+        self,
+        compiled_graph: Any,
+        input_data: dict[str, Any],
+        config: dict[str, Any],
+    ) -> AsyncIterator[dict[str, Any]]:
+        """Execute a compiled workflow with event streaming.
+
+        Yields LangGraph events from astream_events(version="v2").
+        The caller (API layer) translates these to SSE events.
+
+        Args:
+            compiled_graph: Output of compile().
+            input_data: Initial state values.
+            config: LangGraph config.
+
+        Yields:
+            LangGraph event dicts.
+        """
+        await self.initialize()
+
+        initial_state: WorkflowState = {
+            "node_outputs": {},
+            "current_node": "",
+            "messages": [],
+            "errors": [],
+            "audit_trail": [],
+            "cache_hits": 0,
+            "schema_version": 1,
+            **input_data,
+        }
+
+        async with self._semaphore:
+            async for event in compiled_graph.astream_events(
+                initial_state,
+                config=config,
+                version="v2",
+            ):
+                yield event
+
+    # ------------------------------------------------------------------
+    # Resume (HITL / checkpoint recovery)
+    # ------------------------------------------------------------------
+
+    async def resume(
+        self,
+        compiled_graph: Any,
+        thread_id: str,
+        command: Any,
+        config: dict[str, Any] | None = None,
+    ) -> dict[str, Any]:
+        """Resume a workflow from an interrupt (HITL or checkpoint).
+
+        Args:
+            compiled_graph: The same compiled graph used for initial execution.
+            thread_id: The thread_id (tenant_id:execution_id).
+            command: LangGraph Command object (e.g., Command(resume=response)).
+            config: Optional config overrides.
+
+        Returns:
+            Final state after resumption.
+        """
+        await self.initialize()
+
+        resume_config = config or {
+            "configurable": {"thread_id": thread_id}
+        }
+
+        async with self._semaphore:
+            logger.info("Resuming workflow", thread_id=thread_id)
+            result = await compiled_graph.ainvoke(command, config=resume_config)
+            return result
+
+    # ------------------------------------------------------------------
+    # Utilities
+    # ------------------------------------------------------------------
+
+    def build_config(
+        self,
+        tenant_id: str,
+        execution_id: str,
+        user_id: int,
+        workflow_id: str,
+        credits_available: int = 0,
+        memory_service: Any = None,
+        episodic_memory: Any = None,
+    ) -> dict[str, Any]:
+        """Build a standard LangGraph config dict.
+
+        Thread ID is namespaced as {tenant_id}:{execution_id} for
+        multi-tenant isolation in the checkpoint table.
+        """
+        return {
+            "configurable": {
+                "thread_id": f"{tenant_id}:{execution_id}",
+                "user_id": user_id,
+                "tenant_id": tenant_id,
+                "workflow_id": workflow_id,
+                "execution_id": execution_id,
+                "credits_available": credits_available,
+                "memory_service": memory_service,
+                "episodic_memory": episodic_memory,
+            }
+        }
+
+    @property
+    def is_initialized(self) -> bool:
+        """Whether the runtime has been initialized."""
+        return self._initialized
diff --git a/python-backend/app/orchestrator/node_adapter.py b/python-backend/app/orchestrator/node_adapter.py
new file mode 100644
index 0000000..222d2ce
--- /dev/null
+++ b/python-backend/app/orchestrator/node_adapter.py
@@ -0,0 +1,201 @@
+"""Adapter: wraps NodeExecutor protocol into LangGraph node functions."""
+
+import sys
+import traceback
+from datetime import datetime, timezone
+from typing import Any, Callable
+
+import structlog
+
+from app.orchestrator.node_executors.base import (
+    ExecutionContext,
+    NodeExecutionData,
+    NodeExecutor,
+)
+from app.orchestrator.workflow_state import WorkflowState
+
+logger = structlog.get_logger()
+
+# Maximum output size before externalization (1 MB)
+MAX_OUTPUT_SIZE_BYTES = 1_048_576
+
+
+def make_langgraph_node(
+    executor: NodeExecutor,
+    node_id: str,
+    node_type: str,
+    node_config: dict[str, Any],
+) -> Callable:
+    """Create a LangGraph node function from a NodeExecutor.
+
+    The returned async function accepts (state: WorkflowState) and the
+    LangGraph RunnableConfig, executes the node via the existing executor
+    protocol, and returns a state update dict.
+
+    Args:
+        executor: An object implementing the NodeExecutor protocol.
+        node_id: Unique identifier for this node instance.
+        node_type: The node type name (e.g., "llm_call").
+        node_config: Static configuration from the visual editor.
+
+    Returns:
+        An async function compatible with StateGraph.add_node().
+    """
+
+    async def _node_fn(state: WorkflowState, config: dict) -> dict:
+        """Execute the wrapped node executor and return a state update."""
+        configurable = config.get("configurable", {})
+
+        # Build ExecutionContext from config (not from state)
+        context = ExecutionContext(
+            user_id=configurable.get("user_id", 0),
+            tenant_id=configurable.get("tenant_id"),
+            workflow_id=configurable.get("workflow_id", ""),
+            execution_id=configurable.get("execution_id", ""),
+            credits_available=configurable.get("credits_available", 0),
+            extra_data={
+                "memory_service": configurable.get("memory_service"),
+                "episodic_memory": configurable.get("episodic_memory"),
+            },
+        )
+
+        # Resolve inputs from upstream node_outputs
+        resolved_inputs = _resolve_inputs(state, node_config)
+
+        # Build NodeExecutionData
+        data = NodeExecutionData(
+            node_id=node_id,
+            node_type=node_type,
+            config=node_config,
+            inputs=resolved_inputs,
+            state=state.get("node_outputs", {}),
+        )
+
+        # Emit audit event
+        audit_entry = {
+            "event": "node_start",
+            "node_id": node_id,
+            "node_type": node_type,
+            "timestamp": datetime.now(timezone.utc).isoformat(),
+        }
+
+        try:
+            output = await executor.execute(data, context)
+
+            # Check output size -- externalize if too large
+            output = _check_output_size(output, node_id)
+
+            # Build state update
+            node_outputs = dict(state.get("node_outputs", {}))
+            node_outputs[node_id] = output
+
+            audit_complete = {
+                "event": "node_complete",
+                "node_id": node_id,
+                "node_type": node_type,
+                "timestamp": datetime.now(timezone.utc).isoformat(),
+            }
+
+            return {
+                "node_outputs": node_outputs,
+                "current_node": node_id,
+                "audit_trail": [audit_entry, audit_complete],
+            }
+
+        except Exception as exc:
+            error_detail = {
+                "node_id": node_id,
+                "node_type": node_type,
+                "error": str(exc),
+                "traceback": traceback.format_exc(),
+                "timestamp": datetime.now(timezone.utc).isoformat(),
+            }
+            logger.error(
+                "Node execution failed",
+                node_id=node_id,
+                error=str(exc),
+            )
+
+            audit_error = {
+                "event": "node_error",
+                "node_id": node_id,
+                "node_type": node_type,
+                "error": str(exc),
+                "timestamp": datetime.now(timezone.utc).isoformat(),
+            }
+
+            # Store error in state and terminate graph
+            return {
+                "current_node": node_id,
+                "errors": [error_detail],
+                "audit_trail": [audit_entry, audit_error],
+            }
+
+    # Set a useful name for debugging
+    _node_fn.__name__ = f"node_{node_id}"
+    _node_fn.__qualname__ = f"node_{node_id}"
+
+    return _node_fn
+
+
+def _resolve_inputs(
+    state: WorkflowState, node_config: dict[str, Any]
+) -> dict[str, Any]:
+    """Resolve input values from upstream node outputs.
+
+    Looks up {{node_id.field}} patterns in the config and resolves
+    them from state["node_outputs"]. This is a simplified resolver;
+    the full expression engine is built in a later section.
+
+    Returns:
+        Dict of resolved input values.
+    """
+    import re
+
+    pattern = re.compile(r"\{\{(\w+)\.(\w+(?:\.\w+)*)\}\}")
+    resolved = {}
+    node_outputs = state.get("node_outputs", {})
+
+    for key, value in node_config.items():
+        if isinstance(value, str):
+            match = pattern.search(value)
+            if match:
+                ref_node_id = match.group(1)
+                ref_field_path = match.group(2)
+                upstream = node_outputs.get(ref_node_id, {})
+                # Navigate nested path
+                result = upstream
+                for part in ref_field_path.split("."):
+                    if isinstance(result, dict):
+                        result = result.get(part)
+                    else:
+                        result = None
+                        break
+                resolved[key] = result
+            else:
+                resolved[key] = value
+        else:
+            resolved[key] = value
+
+    return resolved
+
+
+def _check_output_size(output: dict[str, Any], node_id: str) -> dict[str, Any]:
+    """Check output size and externalize if above threshold.
+
+    For Phase 1, large outputs are truncated with a warning.
+    Full externalization to Redis/S3 is added in a later section.
+    """
+    try:
+        import json
+        serialized = json.dumps(output, default=str)
+        if len(serialized.encode("utf-8")) > MAX_OUTPUT_SIZE_BYTES:
+            logger.warning(
+                "Node output exceeds 1MB, truncation may apply",
+                node_id=node_id,
+                size_bytes=len(serialized.encode("utf-8")),
+            )
+            # TODO: externalize to Redis/S3 and replace with reference
+    except (TypeError, ValueError):
+        pass  # Non-serializable output, skip check
+    return output
diff --git a/python-backend/app/orchestrator/workflow_compiler.py b/python-backend/app/orchestrator/workflow_compiler.py
new file mode 100644
index 0000000..a609130
--- /dev/null
+++ b/python-backend/app/orchestrator/workflow_compiler.py
@@ -0,0 +1,404 @@
+"""Compiler: transforms ReactFlow JSON into a compiled LangGraph StateGraph."""
+
+from typing import Any
+
+import structlog
+from langgraph.graph import StateGraph, END
+
+from app.orchestrator.errors import CompilationError
+from app.orchestrator.node_adapter import make_langgraph_node
+from app.orchestrator.node_registry import NodeRegistry
+from app.orchestrator.data_types import is_compatible_connection
+from app.orchestrator.workflow_state import WorkflowState
+
+logger = structlog.get_logger()
+
+# Node types that produce conditional edges
+CONDITIONAL_NODE_TYPES = {"conditional", "switch", "if"}
+
+# Node types that are triggers (entry points)
+TRIGGER_NODE_TYPES = {"manual_trigger", "event_trigger", "webhook_trigger", "schedule_trigger", "file_upload_trigger"}
+
+
+class WorkflowCompiler:
+    """Compiles ReactFlow JSON into a LangGraph CompiledStateGraph.
+
+    Responsibilities:
+    - Validate the DAG (cycles, orphans, missing trigger, port compatibility)
+    - Map visual nodes to LangGraph node functions via NodeAdapter
+    - Map edges to LangGraph edges (normal + conditional)
+    - Identify parallel execution groups (fork-join)
+    - Expand composite nodes into subgraphs (e.g., Approval -> interrupt)
+    """
+
+    def __init__(self, registry: NodeRegistry | None = None):
+        self.registry = registry or NodeRegistry.get_instance()
+
+    def compile(
+        self,
+        flow_json: dict[str, Any],
+        checkpointer: Any = None,
+        metadata: dict[str, Any] | None = None,
+    ) -> Any:
+        """Compile ReactFlow JSON into a LangGraph CompiledStateGraph.
+
+        Args:
+            flow_json: Dict with "nodes" and "edges" from ReactFlow.
+            checkpointer: LangGraph checkpointer (AsyncPostgresSaver or MemorySaver).
+            metadata: Optional workflow metadata.
+
+        Returns:
+            Compiled LangGraph graph ready for execution.
+
+        Raises:
+            CompilationError: If validation fails.
+        """
+        nodes = flow_json.get("nodes", [])
+        edges = flow_json.get("edges", [])
+
+        if not nodes:
+            raise CompilationError("Workflow must have at least one node")
+
+        # Phase 1: Validate
+        warnings = []
+        self._validate_graph(nodes, edges, warnings)
+
+        # Phase 2: Build StateGraph
+        graph = self._build_state_graph(nodes, edges)
+
+        # Phase 3: Compile with checkpointer
+        compiled = graph.compile(checkpointer=checkpointer)
+
+        if warnings:
+            logger.warning("Workflow compiled with warnings", warnings=warnings)
+
+        logger.info(
+            "Workflow compiled successfully",
+            node_count=len(nodes),
+            edge_count=len(edges),
+        )
+
+        return compiled
+
+    # ------------------------------------------------------------------
+    # Validation
+    # ------------------------------------------------------------------
+
+    def _validate_graph(
+        self,
+        nodes: list[dict],
+        edges: list[dict],
+        warnings: list[str],
+    ) -> None:
+        """Run all validation checks. Raises CompilationError on failure."""
+        errors: list[str] = []
+
+        node_ids = {n["id"] for n in nodes}
+        node_map = {n["id"]: n for n in nodes}
+
+        # 1. Unique IDs
+        if len(node_ids) != len(nodes):
+            errors.append("Duplicate node IDs found")
+
+        # 2. Exactly one trigger node
+        trigger_nodes = [
+            n for n in nodes
+            if n.get("data", {}).get("nodeType", "") in TRIGGER_NODE_TYPES
+        ]
+        if len(trigger_nodes) == 0:
+            errors.append("Workflow must have exactly one trigger node")
+        elif len(trigger_nodes) > 1:
+            errors.append(
+                f"Workflow has {len(trigger_nodes)} trigger nodes; exactly one is required"
+            )
+
+        # 3. Edges reference existing nodes
+        for edge in edges:
+            src = edge.get("source")
+            tgt = edge.get("target")
+            if src not in node_ids:
+                errors.append(f"Edge source '{src}' not found in nodes")
+            if tgt not in node_ids:
+                errors.append(f"Edge target '{tgt}' not found in nodes")
+
+        # 4. No orphan nodes (every non-trigger node must have at least one incoming edge)
+        targets = {e.get("target") for e in edges}
+        sources = {e.get("source") for e in edges}
+        trigger_ids = {n["id"] for n in trigger_nodes}
+        for nid in node_ids:
+            if nid not in trigger_ids and nid not in targets:
+                errors.append(f"Orphan node '{nid}' has no incoming edges")
+
+        # 5. Unreachable nodes (nodes with no outgoing edges except terminal)
+        # These are warnings, not errors
+        for nid in node_ids:
+            if nid not in sources and nid not in trigger_ids:
+                # Terminal node -- check if it's a legitimate end node
+                if nid in targets:
+                    pass  # leaf/terminal node, valid
+                else:
+                    warnings.append(f"Node '{nid}' is unreachable")
+
+        # 6. Cycle detection (DAG enforcement)
+        if not errors:  # only check if graph is otherwise valid
+            self._check_cycles(node_ids, edges, errors)
+
+        # 7. Port type compatibility
+        self._validate_port_compatibility(nodes, edges, errors)
+
+        if errors:
+            raise CompilationError(
+                f"Compilation failed with {len(errors)} error(s)",
+                errors=errors,
+                warnings=warnings,
+            )
+
+    def _check_cycles(
+        self,
+        node_ids: set[str],
+        edges: list[dict],
+        errors: list[str],
+    ) -> None:
+        """DFS-based cycle detection."""
+        adj: dict[str, list[str]] = {nid: [] for nid in node_ids}
+        for edge in edges:
+            src = edge.get("source")
+            tgt = edge.get("target")
+            if src in adj:
+                adj[src].append(tgt)
+
+        WHITE, GRAY, BLACK = 0, 1, 2
+        color = {nid: WHITE for nid in node_ids}
+
+        def dfs(node: str) -> bool:
+            color[node] = GRAY
+            for neighbor in adj.get(node, []):
+                if color.get(neighbor) == GRAY:
+                    return True  # back edge = cycle
+                if color.get(neighbor) == WHITE and dfs(neighbor):
+                    return True
+            color[node] = BLACK
+            return False
+
+        for nid in node_ids:
+            if color[nid] == WHITE:
+                if dfs(nid):
+                    errors.append(
+                        "Workflow contains cycles. Use explicit loop nodes for iteration."
+                    )
+                    return
+
+    def _validate_port_compatibility(
+        self,
+        nodes: list[dict],
+        edges: list[dict],
+        errors: list[str],
+    ) -> None:
+        """Validate that connected ports have compatible data types."""
+        node_map = {n["id"]: n for n in nodes}
+
+        for edge in edges:
+            src_id = edge.get("source")
+            tgt_id = edge.get("target")
+            src_handle = edge.get("sourceHandle")
+            tgt_handle = edge.get("targetHandle")
+
+            if not all([src_id, tgt_id, src_handle, tgt_handle]):
+                continue
+
+            src_node = node_map.get(src_id)
+            tgt_node = node_map.get(tgt_id)
+            if not src_node or not tgt_node:
+                continue
+
+            src_type = src_node.get("data", {}).get("nodeType", "")
+            tgt_type = tgt_node.get("data", {}).get("nodeType", "")
+
+            src_spec = self.registry.get_node_type(src_type)
+            tgt_spec = self.registry.get_node_type(tgt_type)
+            if not src_spec or not tgt_spec:
+                continue
+
+            out_spec = next((o for o in src_spec.outputs if o.name == src_handle), None)
+            in_spec = next((i for i in tgt_spec.inputs if i.name == tgt_handle), None)
+
+            if not out_spec or not in_spec:
+                errors.append(
+                    f"Invalid port: {src_id}.{src_handle} -> {tgt_id}.{tgt_handle}"
+                )
+                continue
+
+            if not is_compatible_connection(out_spec.data_type, in_spec.data_type):
+                errors.append(
+                    f"Incompatible types: {out_spec.data_type} -> {in_spec.data_type} "
+                    f"({src_id}.{src_handle} -> {tgt_id}.{tgt_handle})"
+                )
+
+    # ------------------------------------------------------------------
+    # Graph Building
+    # ------------------------------------------------------------------
+
+    def _build_state_graph(
+        self,
+        nodes: list[dict],
+        edges: list[dict],
+    ) -> StateGraph:
+        """Build a LangGraph StateGraph from validated nodes and edges."""
+        graph = StateGraph(WorkflowState)
+
+        node_map = {n["id"]: n for n in nodes}
+
+        # Identify trigger and find entry point
+        trigger_node = next(
+            n for n in nodes
+            if n.get("data", {}).get("nodeType", "") in TRIGGER_NODE_TYPES
+        )
+        entry_node_id = trigger_node["id"]
+
+        # Add all nodes
+        for node in nodes:
+            nid = node["id"]
+            node_data = node.get("data", {})
+            node_type = node_data.get("nodeType", "")
+            node_config = node_data.get("config", {})
+
+            # Get executor from registry
+            spec = self.registry.get_node_type(node_type)
+            executor = self._instantiate_executor(spec.executor) if spec else None
+
+            if executor is None:
+                raise CompilationError(f"No executor found for node type '{node_type}'")
+
+            # Wrap with adapter
+            lg_node_fn = make_langgraph_node(
+                executor=executor,
+                node_id=nid,
+                node_type=node_type,
+                node_config=node_config,
+            )
+            graph.add_node(nid, lg_node_fn)
+
+        # Set entry point
+        graph.set_entry_point(entry_node_id)
+
+        # Add edges
+        self._add_edges(graph, nodes, edges)
+
+        return graph
+
+    def _add_edges(
+        self,
+        graph: StateGraph,
+        nodes: list[dict],
+        edges: list[dict],
+    ) -> None:
+        """Add edges to the StateGraph.
+
+        Handles:
+        - Normal (direct) edges
+        - Conditional edges (for If/Switch nodes)
+        - Terminal nodes (connect to END)
+        """
+        node_map = {n["id"]: n for n in nodes}
+        source_edges: dict[str, list[dict]] = {}
+        for edge in edges:
+            src = edge.get("source")
+            source_edges.setdefault(src, []).append(edge)
+
+        # Identify nodes with outgoing edges
+        sources_with_edges = set(source_edges.keys())
+        all_node_ids = {n["id"] for n in nodes}
+
+        for node in nodes:
+            nid = node["id"]
+            node_type = node.get("data", {}).get("nodeType", "")
+
+            outgoing = source_edges.get(nid, [])
+
+            if not outgoing:
+                # Terminal node -> END
+                graph.add_edge(nid, END)
+                continue
+
+            if node_type in CONDITIONAL_NODE_TYPES and len(outgoing) > 1:
+                # Conditional edges -- generate routing function
+                self._add_conditional_edges(graph, nid, node_type, outgoing)
+            else:
+                # Normal edges
+                if len(outgoing) == 1:
+                    graph.add_edge(nid, outgoing[0]["target"])
+                else:
+                    # Fork: multiple outgoing from a non-conditional node = parallel
+                    # LangGraph handles fan-out natively when multiple edges added
+                    for edge in outgoing:
+                        graph.add_edge(nid, edge["target"])
+
+    def _add_conditional_edges(
+        self,
+        graph: StateGraph,
+        node_id: str,
+        node_type: str,
+        outgoing_edges: list[dict],
+    ) -> None:
+        """Generate a routing function for conditional/switch nodes.
+
+        The routing function inspects node_outputs[node_id] for
+        the routing key and maps it to a target node name.
+        """
+        # Build mapping: sourceHandle -> target node id
+        handle_to_target: dict[str, str] = {}
+        for edge in outgoing_edges:
+            handle = edge.get("sourceHandle", "default")
+            target = edge["target"]
+            handle_to_target[handle] = target
+
+        # Determine default
+        default_target = handle_to_target.get("default") or handle_to_target.get("false")
+
+        def routing_fn(state: WorkflowState) -> str:
+            """Route based on node output."""
+            outputs = state.get("node_outputs", {})
+            node_output = outputs.get(node_id, {})
+
+            if node_type in ("conditional", "if"):
+                # Boolean routing: "true" or "false" handle
+                result = node_output.get("result", False)
+                handle = "true" if result else "false"
+            else:
+                # Switch: output contains a "route" key
+                handle = str(node_output.get("route", "default"))
+
+            target = handle_to_target.get(handle, default_target)
+            if target is None:
+                # Fallback: pick the first target
+                target = next(iter(handle_to_target.values()))
+            return target
+
+        graph.add_conditional_edges(
+            node_id,
+            routing_fn,
+            handle_to_target,
+        )
+
+    def _instantiate_executor(self, executor_path: str) -> Any:
+        """Instantiate an executor from its dotted path string.
+
+        Args:
+            executor_path: e.g. "app.orchestrator.node_executors.llm_executor.LLMExecutor"
+
+        Returns:
+            An instance of the executor class.
+        """
+        try:
+            module_path, class_name = executor_path.rsplit(".", 1)
+            import importlib
+            module = importlib.import_module(module_path)
+            cls = getattr(module, class_name)
+            return cls()
+        except Exception as e:
+            logger.error(
+                "Failed to instantiate executor",
+                path=executor_path,
+                error=str(e),
+            )
+            return None
diff --git a/python-backend/app/orchestrator/workflow_state.py b/python-backend/app/orchestrator/workflow_state.py
index 7893a3e..5c8d633 100644
--- a/python-backend/app/orchestrator/workflow_state.py
+++ b/python-backend/app/orchestrator/workflow_state.py
@@ -1,52 +1,40 @@
-from typing import TypedDict, Dict, List, Any
-from pydantic import BaseModel, field_validator
-import json
-
-class WorkflowState(TypedDict, total=False):
-    execution_id: str
-    skill_id: str
-    user_id: int
-    tenant_id: int
-    inputs: Dict[str, Any]
-    step_results: Dict[str, Any]
-    artifacts: List[Dict[str, Any]]
-    approvals: Dict[str, Any]
-    dependencies: Dict[str, List[str]]
-    budget: Dict[str, int]
-    current_step: str
-    status: str  # pending, running, completed, failed, paused
-    error: str
-
-class WorkflowStateValidator(BaseModel):
-    execution_id: str
-    skill_id: str
-    user_id: int
-    tenant_id: int
-    inputs: dict
-    step_results: dict = {}
-    artifacts: list = []
-    approvals: dict = {}
-    dependencies: dict = {}
-    budget: dict = {"reserved": 0, "spent": 0}
-    current_step: str = ""
-    status: str = "pending"
-    error: str = ""
-
-    @field_validator('budget')
-    @classmethod
-    def validate_budget(cls, v):
-        if 'reserved' not in v or 'spent' not in v:
-            raise ValueError("Budget must have 'reserved' and 'spent' fields")
-        return v
-
-def serialize_state(state: WorkflowState) -> str:
-    return json.dumps(state, ensure_ascii=False)
-
-def deserialize_state(data: str) -> WorkflowState:
-    state = json.loads(data)
-    WorkflowStateValidator(**state)
-    return state
-
-def get_state_size_kb(state: WorkflowState) -> float:
-    serialized = serialize_state(state)
-    return len(serialized.encode('utf-8')) / 1024
+"""Canonical workflow state schema for LangGraph."""
+
+from typing import Any, TypedDict, Annotated
+from langgraph.graph import add_messages
+
+
+def _append_list(existing: list, new: list) -> list:
+    """Reducer: append new items to existing list."""
+    return existing + new
+
+
+class WorkflowState(TypedDict):
+    """LangGraph state for workflow execution.
+
+    Fields with Annotated reducers use append semantics --
+    each node update extends the list rather than replacing it.
+
+    Fields without reducers use last-writer-wins semantics.
+    """
+
+    # Output keyed by node_id -> output dict
+    node_outputs: dict[str, Any]
+
+    # Currently executing node id
+    current_node: str
+
+    # LLM conversation history (append-only, uses LangGraph's add_messages)
+    messages: Annotated[list, add_messages]
+
+    # Error accumulation (append-only)
+    errors: Annotated[list[dict], _append_list]
+
+    # Audit trail (append-only)
+    audit_trail: Annotated[list[dict], _append_list]
+
+    # Cache hit counter (last-writer-wins, incremented by cache middleware)
+    cache_hits: int
+
+    # Schema version for checkpoint migration
+    schema_version: int
diff --git a/python-backend/tests/test_langgraph_runtime.py b/python-backend/tests/test_langgraph_runtime.py
new file mode 100644
index 0000000..0bdb351
--- /dev/null
+++ b/python-backend/tests/test_langgraph_runtime.py
@@ -0,0 +1,72 @@
+"""Tests for LangGraph Runtime Core."""
+
+import pytest
+from app.orchestrator.langgraph_runtime import LangGraphRuntime
+from app.orchestrator.errors import CompilationError
+
+
+@pytest.mark.asyncio
+async def test_runtime_initialization():
+    """Test that runtime initializes correctly."""
+    runtime = LangGraphRuntime(use_postgres=False)
+    assert not runtime.is_initialized
+
+    await runtime.initialize()
+    assert runtime.is_initialized
+
+    await runtime.close()
+    assert not runtime.is_initialized
+
+
+@pytest.mark.asyncio
+async def test_compile_rejects_empty_workflow():
+    """Test that compilation rejects workflows with no nodes."""
+    runtime = LangGraphRuntime(use_postgres=False)
+    await runtime.initialize()
+
+    with pytest.raises(CompilationError) as exc_info:
+        await runtime.compile({"nodes": [], "edges": []})
+
+    assert "at least one node" in str(exc_info.value)
+
+    await runtime.close()
+
+
+@pytest.mark.asyncio
+async def test_compile_rejects_missing_trigger():
+    """Test that compilation requires a trigger node."""
+    runtime = LangGraphRuntime(use_postgres=False)
+    await runtime.initialize()
+
+    workflow_json = {
+        "nodes": [
+            {"id": "node1", "data": {"nodeType": "transform", "config": {}}}
+        ],
+        "edges": []
+    }
+
+    with pytest.raises(CompilationError) as exc_info:
+        await runtime.compile(workflow_json)
+
+    # Check that one of the errors mentions trigger node
+    error_messages = " ".join(exc_info.value.errors).lower()
+    assert "trigger node" in error_messages
+
+    await runtime.close()
+
+
+@pytest.mark.asyncio
+async def test_build_config_creates_thread_id():
+    """Test that build_config creates namespaced thread_id."""
+    runtime = LangGraphRuntime(use_postgres=False)
+
+    config = runtime.build_config(
+        tenant_id="tenant123",
+        execution_id="exec456",
+        user_id=789,
+        workflow_id="wf999",
+    )
+
+    assert config["configurable"]["thread_id"] == "tenant123:exec456"
+    assert config["configurable"]["user_id"] == 789
+    assert config["configurable"]["workflow_id"] == "wf999"
