"""Skill manifest validation service.

Validates skill manifests for:
1. JSON Schema compliance
2. Tool allowlist compliance
3. Graph structure validity
4. Circular dependency detection
5. Prompt injection detection
6. Unsafe expression detection
"""

import json
import re
from pathlib import Path

import structlog
from jsonschema import ValidationError as JsonSchemaValidationError
from jsonschema import validate as json_schema_validate

from app.schemas.tool_allowlist import validate_tool_usage

logger = structlog.get_logger(__name__)


class ManifestValidationError(Exception):
    """Raised when manifest validation fails."""

    pass


# Load the JSON schema once at module import
SCHEMA_PATH = Path(__file__).parent.parent / "schemas" / "manifest_schema.json"
with open(SCHEMA_PATH, encoding="utf-8") as f:
    MANIFEST_SCHEMA = json.load(f)


# Prompt injection detection patterns (basic heuristics)
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+previous\s+instructions?",
    r"disregard\s+.*\s+instructions?",
    r"forget\s+everything",
    r"system:\s*",
    r"<\|im_start\|>",
    r"<\|im_end\|>",
    r"\[INST\]",
    r"\[/INST\]",
    r"<<<SYSTEM>>>",
]

# Unsafe expression patterns for conditional nodes
UNSAFE_EXPRESSION_PATTERNS = [
    r"__import__",
    r"eval\s*\(",
    r"exec\s*\(",
    r"compile\s*\(",
    r"os\.",
    r"sys\.",
    r"subprocess\.",
    r"open\s*\(",
    r"file\s*\(",
]


def _detect_cycles_dfs(
    graph: dict[str, list[str]], node: str, visited: set[str], rec_stack: set[str]
) -> bool:
    """Detect cycles in a directed graph using DFS.

    Args:
        graph: Adjacency list representation {node_id: [target_ids]}
        node: Current node being visited
        visited: Set of all visited nodes
        rec_stack: Recursion stack for cycle detection

    Returns:
        True if a cycle is detected, False otherwise
    """
    visited.add(node)
    rec_stack.add(node)

    # Visit all neighbors
    for neighbor in graph.get(node, []):
        if neighbor not in visited:
            if _detect_cycles_dfs(graph, neighbor, visited, rec_stack):
                return True
        elif neighbor in rec_stack:
            # Back edge found - cycle detected
            return True

    rec_stack.remove(node)
    return False


def _has_circular_dependencies(nodes: list[dict], edges: list[dict]) -> bool:
    """Check if the workflow graph has circular dependencies.

    Args:
        nodes: List of node dictionaries
        edges: List of edge dictionaries

    Returns:
        True if circular dependencies exist, False otherwise
    """
    # Build adjacency list
    graph: dict[str, list[str]] = {node["id"]: [] for node in nodes}
    for edge in edges:
        from_node = edge.get("from")
        to_node = edge.get("to")
        if from_node and to_node:
            graph[from_node].append(to_node)

    # Run DFS from each node
    visited: set[str] = set()
    for node_id in graph:
        if node_id not in visited:
            rec_stack: set[str] = set()
            if _detect_cycles_dfs(graph, node_id, visited, rec_stack):
                return True

    return False


def _check_prompt_injection(manifest: dict) -> list[str]:
    """Check for potential prompt injection attempts in node configurations.

    Args:
        manifest: The skill manifest dictionary

    Returns:
        List of warnings about potential prompt injection patterns found
    """
    warnings = []
    compiled_patterns = [
        re.compile(pattern, re.IGNORECASE) for pattern in PROMPT_INJECTION_PATTERNS
    ]

    nodes = manifest.get("nodes", [])
    for node in nodes:
        node_id = node.get("id", "unknown")

        # Check all string values in node config and inputs
        def check_dict_values(data: dict, path: str):
            for key, value in data.items():
                current_path = f"{path}.{key}"
                if isinstance(value, str):
                    for pattern in compiled_patterns:
                        if pattern.search(value):
                            warnings.append(
                                f"Potential prompt injection in {current_path}: pattern matched '{pattern.pattern}'"
                            )
                elif isinstance(value, dict):
                    check_dict_values(value, current_path)

        check_dict_values(node.get("config", {}), f"node[{node_id}].config")
        check_dict_values(node.get("inputs", {}), f"node[{node_id}].inputs")

    return warnings


def _check_unsafe_expressions(manifest: dict) -> list[str]:
    """Check for unsafe expressions in conditional nodes.

    Args:
        manifest: The skill manifest dictionary

    Returns:
        List of errors about unsafe expressions found
    """
    errors = []
    compiled_patterns = [
        re.compile(pattern, re.IGNORECASE) for pattern in UNSAFE_EXPRESSION_PATTERNS
    ]

    # Check conditional nodes
    nodes = manifest.get("nodes", [])
    for node in nodes:
        if node.get("type") == "conditional":
            node_id = node.get("id", "unknown")
            condition = node.get("config", {}).get("condition", "")
            if condition:
                for pattern in compiled_patterns:
                    if pattern.search(condition):
                        errors.append(
                            f"Unsafe expression in node[{node_id}].config.condition: "
                            f"pattern matched '{pattern.pattern}'"
                        )

    # Check edge conditions
    edges = manifest.get("edges", [])
    for i, edge in enumerate(edges):
        condition = edge.get("condition", "")
        if condition:
            for pattern in compiled_patterns:
                if pattern.search(condition):
                    errors.append(
                        f"Unsafe expression in edge[{i}].condition (from {edge.get('from')} to {edge.get('to')}): "
                        f"pattern matched '{pattern.pattern}'"
                    )

    return errors


def _validate_graph_structure(nodes: list[dict], edges: list[dict]) -> list[str]:
    """Validate that all edge references point to valid nodes.

    Args:
        nodes: List of node dictionaries
        edges: List of edge dictionaries

    Returns:
        List of errors about invalid edge references
    """
    errors = []
    node_ids = {node["id"] for node in nodes}

    for i, edge in enumerate(edges):
        from_node = edge.get("from")
        to_node = edge.get("to")

        if from_node not in node_ids:
            errors.append(f"Edge[{i}].from references non-existent node: {from_node}")

        if to_node not in node_ids:
            errors.append(f"Edge[{i}].to references non-existent node: {to_node}")

    return errors


def validate_manifest(manifest: dict) -> tuple[bool, str | None]:
    """Validate a skill manifest.

    Performs all validation checks and returns a tuple of (is_valid, error_message).

    Args:
        manifest: The skill manifest dictionary to validate

    Returns:
        Tuple of (is_valid: bool, error_message: Optional[str])
        If valid, error_message is None. If invalid, error_message contains the reason.
    """
    try:
        # Step 1: JSON Schema validation
        try:
            json_schema_validate(instance=manifest, schema=MANIFEST_SCHEMA)
        except JsonSchemaValidationError as e:
            return False, f"JSON Schema validation failed: {e.message}"

        # Step 2: Tool allowlist validation
        disallowed_tools = validate_tool_usage(manifest)
        if disallowed_tools:
            return False, f"Disallowed tools found: {', '.join(disallowed_tools)}"

        nodes = manifest.get("nodes", [])
        edges = manifest.get("edges", [])

        # Step 3: Graph structure validation
        structure_errors = _validate_graph_structure(nodes, edges)
        if structure_errors:
            return False, f"Graph structure errors: {'; '.join(structure_errors)}"

        # Step 4: Circular dependency detection
        if _has_circular_dependencies(nodes, edges):
            return False, "Circular dependency detected in workflow graph"

        # Step 5: Prompt injection detection (warnings, not errors)
        injection_warnings = _check_prompt_injection(manifest)
        if injection_warnings:
            logger.warning(
                "potential_prompt_injection_detected",
                manifest_name=manifest.get("name"),
                warnings=injection_warnings,
            )
            # Note: We log warnings but don't fail validation for prompt injection detection
            # This is a heuristic check and may have false positives

        # Step 6: Unsafe expression detection
        unsafe_errors = _check_unsafe_expressions(manifest)
        if unsafe_errors:
            return False, f"Unsafe expressions detected: {'; '.join(unsafe_errors)}"

        # All validations passed
        logger.info(
            "manifest_validation_passed",
            manifest_name=manifest.get("name"),
            version=manifest.get("version"),
            node_count=len(nodes),
            edge_count=len(edges),
        )
        return True, None

    except Exception as e:
        logger.exception("manifest_validation_error", error=str(e))
        return False, f"Unexpected validation error: {str(e)}"


def validate_and_raise(manifest: dict) -> None:
    """Validate a skill manifest and raise ManifestValidationError if invalid.

    Args:
        manifest: The skill manifest dictionary to validate

    Raises:
        ManifestValidationError: If the manifest is invalid
    """
    is_valid, error_message = validate_manifest(manifest)
    if not is_valid:
        raise ManifestValidationError(error_message)
