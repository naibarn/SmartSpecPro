"""Canonical workflow state schema for LangGraph."""

from typing import Any, TypedDict, Annotated
from langgraph.graph import add_messages


def _append_list(existing: list, new: list) -> list:
    """Reducer: append new items to existing list."""
    return existing + new


def _merge_dicts(existing: dict, new: dict) -> dict:
    """Reducer: merge new entries into existing dict (safe for concurrent nodes)."""
    return {**existing, **new}


def _last_value(existing: Any, new: Any) -> Any:
    """Reducer: always keep the newest value (safe last-writer-wins for concurrent nodes)."""
    return new


class WorkflowState(TypedDict, total=False):
    """LangGraph state for workflow execution.

    ALL fields must have an Annotated reducer when nodes can run concurrently.
    LangGraph raises INVALID_CONCURRENT_GRAPH_UPDATE for any unannotated field
    that receives updates from more than one node in the same step.
    """

    # Output keyed by node_id -> output dict (merge reducer for parallel safety)
    node_outputs: Annotated[dict[str, Any], _merge_dicts]

    # Currently executing node id (last-writer-wins is fine — just need a reducer)
    current_node: Annotated[str, _last_value]

    # LLM conversation history (append-only, uses LangGraph's add_messages)
    messages: Annotated[list, add_messages]

    # Error accumulation (append-only)
    errors: Annotated[list[dict], _append_list]

    # Audit trail (append-only)
    audit_trail: Annotated[list[dict], _append_list]

    # Cache hit counter
    cache_hits: Annotated[int, _last_value]

    # Schema version for checkpoint migration
    schema_version: Annotated[int, _last_value]
