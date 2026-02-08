"""
Flow Compiler - Compiles ReactFlow JSON to LangGraph-compatible manifest.
"""

import structlog

logger = structlog.get_logger(__name__)


class CompilationError(Exception):
    """Raised when flow compilation fails."""

    pass


# Mapping from ReactFlow node types to LangGraph function names
NODE_TYPE_MAP = {
    "llm": "llm_call",
    "llm_stream": "llm_stream",
    "approval": "approval_gate",
    "tool": "tool_call",
    "conditional": "conditional",
    "loop": "loop",
    "parallel": "parallel",
    "image": "generate_image",
    "video": "generate_video",
    "combine": "combine_videos",
    "extract": "extract_data",
    "format": "format_text",
    "email": "send_email",
    "telegram": "send_telegram",
}


class FlowCompiler:
    """Compiles ReactFlow JSON to LangGraph-compatible workflow manifest."""

    def compile(self, flow_json: dict, metadata: dict | None = None) -> dict:
        """
        Compile ReactFlow JSON to LangGraph manifest.

        Args:
            flow_json: ReactFlow data with "nodes" and "edges"
            metadata: Optional manifest metadata (name, version, etc.)

        Returns:
            Compiled manifest dict

        Raises:
            CompilationError: If compilation fails
        """
        if not flow_json.get("nodes"):
            raise CompilationError("Flow must have at least one node")

        manifest = self._build_manifest(flow_json, metadata or {})
        self._validate_manifest(manifest)

        logger.info(
            "flow_compiled",
            node_count=len(manifest["nodes"]),
            edge_count=len(manifest["edges"]),
        )
        return manifest

    def _build_manifest(self, flow_json: dict, metadata: dict) -> dict:
        manifest = {
            "name": metadata.get("name", "unnamed_flow"),
            "version": metadata.get("version", "1.0.0"),
            "description": metadata.get("description", "Compiled from visual flow editor"),
            "author": metadata.get("author", "user@smartspecpro.com"),
            "nodes": [],
            "edges": [],
        }

        for node in flow_json.get("nodes", []):
            compiled_node = self._compile_node(node)
            manifest["nodes"].append(compiled_node)

        # Convert ReactFlow edges (source/target) to manifest format (from/to)
        for edge in flow_json.get("edges", []):
            manifest["edges"].append(
                {
                    "from": edge.get("source"),
                    "to": edge.get("target"),
                    "label": edge.get("label", ""),
                }
            )

        return manifest

    def _compile_node(self, node: dict) -> dict:
        node_type = node.get("type", "")
        node_id = node.get("id", "")
        node_data = node.get("data", {})

        # Map ReactFlow type to LangGraph function
        mapped_type = NODE_TYPE_MAP.get(node_type, node_type)

        compiled = {
            "id": node_id,
            "type": mapped_type,
            "label": node_data.get("label", node_id),
            "params": node_data.get("config", {}),
        }

        # Enforce loop limits
        if node_type == "loop":
            if "max_iterations" not in compiled["params"]:
                raise CompilationError(f"Loop node '{node_id}' requires max_iterations parameter")
            if compiled["params"]["max_iterations"] > 100:
                raise CompilationError(f"Loop node '{node_id}' max_iterations cannot exceed 100")

        return compiled

    def _validate_manifest(self, manifest: dict) -> None:
        # Try using the manifest validator if available
        try:
            from app.services.manifest_validator import validate_manifest

            is_valid, error = validate_manifest(manifest)
            if not is_valid:
                raise CompilationError(f"Manifest validation failed: {error}")
        except ImportError:
            # Fallback: basic validation
            self._basic_validate(manifest)

    def _basic_validate(self, manifest: dict) -> None:
        # Check node IDs are unique
        node_ids = [n["id"] for n in manifest["nodes"]]
        if len(node_ids) != len(set(node_ids)):
            raise CompilationError("Duplicate node IDs found")

        # Check edges reference valid nodes
        for edge in manifest["edges"]:
            # Handle both 'from'/'to' (manifest format) and 'source'/'target' (ReactFlow format)
            source = edge.get("from") or edge.get("source")
            target = edge.get("to") or edge.get("target")

            if source not in node_ids:
                raise CompilationError(f"Edge source '{source}' not found in nodes")
            if target not in node_ids:
                raise CompilationError(f"Edge target '{target}' not found in nodes")
