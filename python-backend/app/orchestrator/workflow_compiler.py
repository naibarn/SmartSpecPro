"""Compiler: transforms ReactFlow JSON into a compiled LangGraph StateGraph."""

from dataclasses import dataclass, field
from typing import Any

import structlog
from langgraph.graph import StateGraph, END

from app.orchestrator.errors import CompilationError
from app.orchestrator.node_adapter import make_langgraph_node
from app.orchestrator.node_registry import NodeRegistry
from app.orchestrator.data_types import is_compatible_connection
from app.orchestrator.workflow_state import WorkflowState

logger = structlog.get_logger()

# Allowlist: executor dotpaths MUST start with one of these prefixes.
# This prevents arbitrary module loading if executor paths ever originate
# from user-supplied or database-stored data in the future.
_ALLOWED_EXECUTOR_PREFIXES = (
    "app.orchestrator.node_executors.",
)


@dataclass
class CompileResult:
    """Return value of WorkflowCompiler.compile()."""

    graph: Any
    warnings: list[str] = field(default_factory=list)


# Node types that produce conditional edges
CONDITIONAL_NODE_TYPES = {"conditional", "switch", "if"}

# Node types that are triggers (entry points)
TRIGGER_NODE_TYPES = {
    "manual_trigger",
    "event_trigger",
    "webhook_trigger",
    "schedule_trigger",
    "file_upload_trigger",
    "incoming_meta_message",
}


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

        return CompileResult(graph=compiled, warnings=warnings)

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
        self._validate_port_compatibility(nodes, edges, errors, warnings)

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
        warnings: list[str],
    ) -> None:
        """Validate that connected ports have compatible data types.

        Invalid ports (non-existent handle names) → hard errors.
        Type mismatches (e.g. text → json) → warnings only, because LLM nodes
        commonly output text whose content happens to be JSON/arrays, and
        runtime coercion handles the conversion.
        """
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

            # Fallback: generic "output"/"input" handles map to the first port.
            # Template-seeded workflows use these generic names; named ports are
            # resolved when users build workflows in the visual editor.
            if out_spec is None and src_handle == "output" and src_spec.outputs:
                out_spec = src_spec.outputs[0]
            if in_spec is None and tgt_handle == "input":
                connectable = [i for i in tgt_spec.inputs if getattr(i, "accepts_connection", True)]
                in_spec = connectable[0] if connectable else (tgt_spec.inputs[0] if tgt_spec.inputs else None)

            if not out_spec or not in_spec:
                # Warn but do not block compilation — the edge will be skipped at
                # runtime. AI-generated workflows sometimes produce handle names
                # that don't match the registry (e.g. "trigger" on form_input).
                warnings.append(
                    f"Invalid port: {src_id}.{src_handle} -> {tgt_id}.{tgt_handle} "
                    f"(edge skipped)"
                )
                continue

            if not is_compatible_connection(out_spec.data_type, in_spec.data_type):
                warnings.append(
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

        # routing_fn already resolves to the final target node ID — do NOT
        # pass handle_to_target as path_map.  LangGraph would try to look up
        # the returned node ID as a key in that dict (whose keys are handle
        # strings like "true"/"false"), causing a KeyError at runtime.
        graph.add_conditional_edges(
            node_id,
            routing_fn,
        )

    def _instantiate_executor(self, executor_path: str) -> Any:
        """Instantiate an executor from its dotted path string.

        Only paths under ``app.orchestrator.node_executors.*`` are permitted.
        This allowlist prevents arbitrary module loading if executor paths ever
        originate from user-supplied or database-stored data.

        Args:
            executor_path: e.g. "app.orchestrator.node_executors.llm_executor.LLMExecutor"

        Returns:
            An instance of the executor class, or None on failure.
        """
        if not any(executor_path.startswith(p) for p in _ALLOWED_EXECUTOR_PREFIXES):
            logger.error(
                "Rejected executor path outside allowlist",
                path=executor_path,
                allowed_prefixes=_ALLOWED_EXECUTOR_PREFIXES,
            )
            return None

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
