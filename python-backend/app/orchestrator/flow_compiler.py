"""
Flow Compiler - Compiles ReactFlow JSON to executable workflow manifest.
Updated to use NodeRegistry and validate typed port connections.
"""

import re
import structlog
from app.orchestrator.node_registry import NodeRegistry
from app.orchestrator.data_types import is_compatible_connection

logger = structlog.get_logger(__name__)


class CompilationError(Exception):
    """Raised when flow compilation fails."""
    pass


class FlowCompiler:
    """Compiles ReactFlow JSON to executable workflow manifest with registry-based validation."""

    def __init__(self, registry: NodeRegistry | None = None):
        """
        Initialize compiler with node registry.

        Args:
            registry: NodeRegistry instance (defaults to singleton)
        """
        self.registry = registry or NodeRegistry.get_instance()
        self.expression_pattern = re.compile(r"\{\{([^}]+)\}\}")

    def compile(self, flow_json: dict, metadata: dict | None = None) -> dict:
        """
        Compile ReactFlow JSON to workflow manifest.

        Args:
            flow_json: ReactFlow data with "nodes" and "edges"
            metadata: Optional manifest metadata (name, version, etc.)

        Returns:
            Compiled manifest dict with:
                - steps: List of workflow steps
                - edges: List of connections
                - loop_groups: Detected loop groups
                - expressions: Expression resolution metadata

        Raises:
            CompilationError: If compilation fails
        """
        if not flow_json.get("nodes"):
            raise CompilationError("Flow must have at least one node")

        # Build manifest
        manifest = self._build_manifest(flow_json, metadata or {})

        # Validate
        self._validate_manifest(manifest, flow_json)

        logger.info(
            "flow_compiled",
            node_count=len(manifest["steps"]),
            edge_count=len(manifest["edges"]),
            loop_groups=len(manifest.get("loop_groups", [])),
        )
        return manifest

    def _build_manifest(self, flow_json: dict, metadata: dict) -> dict:
        """Build workflow manifest from ReactFlow data."""
        manifest = {
            "name": metadata.get("name", "unnamed_flow"),
            "version": metadata.get("version", "1.0.0"),
            "description": metadata.get("description", "Compiled from visual flow editor"),
            "author": metadata.get("author", "user@smartspecpro.com"),
            "steps": [],
            "edges": [],
            "loop_groups": [],
            "expressions": {},  # nodeId → list of fields with expressions
        }

        nodes = flow_json.get("nodes", [])
        edges = flow_json.get("edges", [])

        # Compile nodes
        for node in nodes:
            compiled_step = self._compile_node(node)
            manifest["steps"].append(compiled_step)

            # Detect expressions in node config
            expressions = self._detect_expressions(node)
            if expressions:
                manifest["expressions"][node["id"]] = expressions

        # Detect loop groups
        manifest["loop_groups"] = self._detect_loop_groups(nodes)

        # Convert edges
        for edge in edges:
            manifest["edges"].append({
                "from": edge.get("source"),
                "to": edge.get("target"),
                "sourceHandle": edge.get("sourceHandle"),
                "targetHandle": edge.get("targetHandle"),
                "type": edge.get("type", "default"),
            })

        return manifest

    def _compile_node(self, node: dict) -> dict:
        """Compile a single node to a workflow step."""
        node_id = node.get("id", "")
        node_data = node.get("data", {})
        node_type_name = node_data.get("nodeType", "")

        # Validate node type exists in registry
        node_type_spec = self.registry.get_node_type(node_type_name)
        if not node_type_spec:
            raise CompilationError(f"Unknown node type: {node_type_name}")

        compiled = {
            "id": node_id,
            "node_type": node_type_name,
            "label": node_data.get("label", node_id),
            "config": node_data.get("config", {}),
            "executor": node_type_spec.executor,
            "parent_id": node.get("parentId"),  # For loop group detection
        }

        return compiled

    def _detect_loop_groups(self, nodes: list[dict]) -> list[dict]:
        """
        Detect loop groups from parent-child relationships.

        Returns list of loop groups: [{loop_id, child_ids}]
        """
        loop_groups = []
        parent_map = {}

        # Build parent→children map
        for node in nodes:
            parent_id = node.get("parentId")
            if parent_id:
                if parent_id not in parent_map:
                    parent_map[parent_id] = []
                parent_map[parent_id].append(node["id"])

        # Create loop groups for loop nodes with children
        for node in nodes:
            node_type = node.get("data", {}).get("nodeType", "")
            node_id = node.get("id")

            if node_type == "loop" and node_id in parent_map:
                loop_groups.append({
                    "loop_id": node_id,
                    "child_ids": parent_map[node_id],
                })

        return loop_groups

    def _detect_expressions(self, node: dict) -> list[str]:
        """
        Detect {{expression}} fields in node config.

        Returns list of config keys that contain expressions.
        """
        config = node.get("data", {}).get("config", {})
        fields_with_expressions = []

        for key, value in config.items():
            if isinstance(value, str) and self.expression_pattern.search(value):
                fields_with_expressions.append(key)

        return fields_with_expressions

    def _validate_manifest(self, manifest: dict, flow_json: dict) -> None:
        """Validate compiled manifest."""
        # Basic validation
        self._validate_unique_ids(manifest)
        self._validate_edges_reference_nodes(manifest)

        # Registry-based validation
        self._validate_required_inputs(manifest, flow_json)
        self._validate_port_compatibility(manifest, flow_json)

        # DAG validation (no cycles except loop groups)
        self._validate_dag_structure(manifest)

    def _validate_unique_ids(self, manifest: dict) -> None:
        """Check node IDs are unique."""
        node_ids = [n["id"] for n in manifest["steps"]]
        if len(node_ids) != len(set(node_ids)):
            raise CompilationError("Duplicate node IDs found")

    def _validate_edges_reference_nodes(self, manifest: dict) -> None:
        """Check edges reference valid nodes."""
        node_ids = {n["id"] for n in manifest["steps"]}

        for edge in manifest["edges"]:
            source = edge.get("from")
            target = edge.get("to")

            if source not in node_ids:
                raise CompilationError(f"Edge source '{source}' not found in nodes")
            if target not in node_ids:
                raise CompilationError(f"Edge target '{target}' not found in nodes")

    def _validate_required_inputs(self, manifest: dict, flow_json: dict) -> None:
        """Validate all required inputs are configured or connected."""
        # Build connection map: nodeId → set of connected input handles
        connected_inputs = {}
        for edge in flow_json.get("edges", []):
            target_node = edge.get("target")
            target_handle = edge.get("targetHandle")
            if target_node and target_handle:
                if target_node not in connected_inputs:
                    connected_inputs[target_node] = set()
                connected_inputs[target_node].add(target_handle)

        # Check each node
        for step in manifest["steps"]:
            node_type_name = step["node_type"]
            node_spec = self.registry.get_node_type(node_type_name)

            if not node_spec:
                continue

            node_id = step["id"]
            node_label = step["label"]
            config = step["config"]

            # Check required inputs
            for input_spec in node_spec.inputs:
                if not input_spec.required:
                    continue

                input_name = input_spec.name
                is_configured = input_name in config and config[input_name]
                is_connected = node_id in connected_inputs and input_name in connected_inputs[node_id]

                if not is_configured and not is_connected:
                    raise CompilationError(
                        f"Node '{node_id}' ({node_label}): Missing required input '{input_name}'"
                    )

    def _validate_port_compatibility(self, manifest: dict, flow_json: dict) -> None:
        """Validate port type compatibility for all edges."""
        for edge in flow_json.get("edges", []):
            source_node_id = edge.get("source")
            target_node_id = edge.get("target")
            source_handle = edge.get("sourceHandle")
            target_handle = edge.get("targetHandle")

            if not all([source_node_id, target_node_id, source_handle, target_handle]):
                continue

            # Get node specs
            source_step = next((s for s in manifest["steps"] if s["id"] == source_node_id), None)
            target_step = next((s for s in manifest["steps"] if s["id"] == target_node_id), None)

            if not source_step or not target_step:
                continue

            source_spec = self.registry.get_node_type(source_step["node_type"])
            target_spec = self.registry.get_node_type(target_step["node_type"])

            if not source_spec or not target_spec:
                continue

            # Find output and input specs
            output_spec = next((o for o in source_spec.outputs if o.name == source_handle), None)
            input_spec = next((i for i in target_spec.inputs if i.name == target_handle), None)

            if not output_spec or not input_spec:
                raise CompilationError(
                    f"Invalid port connection: {source_node_id}.{source_handle} → {target_node_id}.{target_handle}"
                )

            # Check type compatibility
            if not is_compatible_connection(output_spec.data_type, input_spec.data_type):
                raise CompilationError(
                    f"Incompatible port types: {output_spec.data_type} -> {input_spec.data_type} "
                    f"({source_node_id}.{source_handle} → {target_node_id}.{target_handle})"
                )

    def _validate_dag_structure(self, manifest: dict) -> None:
        """
        Validate DAG structure (no cycles except in loop groups).

        Loop groups are allowed to have internal cycles (loop back edges).
        """
        # Build adjacency list
        graph = {step["id"]: [] for step in manifest["steps"]}
        for edge in manifest["edges"]:
            graph[edge["from"]].append(edge["to"])

        # Get loop group node sets
        loop_group_nodes = set()
        for loop_group in manifest.get("loop_groups", []):
            loop_group_nodes.add(loop_group["loop_id"])
            loop_group_nodes.update(loop_group["child_ids"])

        # DFS cycle detection (excluding loop group internal edges)
        visited = set()
        rec_stack = set()

        def has_cycle(node):
            visited.add(node)
            rec_stack.add(node)

            for neighbor in graph.get(node, []):
                # Skip edges within loop groups
                if node in loop_group_nodes and neighbor in loop_group_nodes:
                    continue

                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True

            rec_stack.remove(node)
            return False

        for node in graph:
            if node not in visited:
                if has_cycle(node):
                    raise CompilationError(
                        "Workflow contains cycles. Use explicit loop groups for iteration."
                    )
