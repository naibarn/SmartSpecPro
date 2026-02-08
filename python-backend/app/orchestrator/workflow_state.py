"""Canonical workflow state schema for LangGraph."""

from typing import Any, TypedDict, Annotated
from langgraph.graph import add_messages


def _append_list(existing: list, new: list) -> list:
    """Reducer: append new items to existing list."""
    return existing + new


class WorkflowState(TypedDict, total=False):
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
