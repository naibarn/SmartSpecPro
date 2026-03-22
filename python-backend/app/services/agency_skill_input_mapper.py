"""Resolve field-level input mappings for skill_call nodes.

Supports three source types:
- static: use the value directly
- node_output: look up a previous node's output by nodeId + dot-path outputField
- context: read from AgencyRunContext by key
"""

from __future__ import annotations

from typing import Any

from app.services.agency_run_context import AgencyRunContext


async def resolve_skill_input_mappings(
    mappings: dict[str, dict] | None,
    context: AgencyRunContext,
    results: dict[str, Any],
) -> dict[str, Any] | None:
    """Resolve input mappings to concrete values.

    Returns None if mappings is None or empty (caller should use existing behavior).
    """
    if not mappings:
        return None

    resolved: dict[str, Any] = {}
    for field_name, mapping in mappings.items():
        source = mapping.get("source", "static")
        resolved[field_name] = await _resolve_single(source, mapping, context, results)

    return resolved


async def _resolve_single(
    source: str,
    mapping: dict[str, Any],
    context: AgencyRunContext,
    results: dict[str, Any],
) -> Any:
    """Resolve a single mapping entry."""
    if source == "static":
        return mapping.get("value")

    if source == "node_output":
        node_id = mapping.get("nodeId", "")
        output_field = mapping.get("outputField", "")
        node_result = results.get(node_id)
        if node_result is None:
            return None
        return _traverse_dot_path(node_result, output_field)

    if source == "context":
        context_key = mapping.get("contextKey", "")
        return await context.get(context_key)

    return None


def _traverse_dot_path(obj: Any, path: str) -> Any:
    """Navigate a dot-separated path into nested dicts.

    Returns None if any segment is missing.
    """
    if not path:
        return obj
    parts = path.split(".")
    current = obj
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
        if current is None:
            return None
    return current
