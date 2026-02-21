"""
In-process registry of active workflow executions.

Maps execution_id -> {"graph": compiled_graph, "config": config, "started_at": datetime}

This is an in-process store (not Redis) because the compiled graph object
cannot be serialized. If the process restarts, active executions are lost
and must be re-triggered (checkpoint allows resumption).
"""

from datetime import datetime
from typing import Any, Optional

_active_executions: dict[str, dict[str, Any]] = {}


def register_execution(
    execution_id: str,
    graph: Any,
    config: dict,
    input_data: dict | None = None,
) -> None:
    """Register a compiled graph for an active execution."""
    _active_executions[execution_id] = {
        "graph": graph,
        "config": config,
        "input_data": input_data or {},
        "started_at": datetime.utcnow(),
    }


def get_active_execution(execution_id: str) -> Optional[dict[str, Any]]:
    """Get the active execution entry, or None if not found."""
    return _active_executions.get(execution_id)


def unregister_execution(execution_id: str) -> None:
    """Remove execution from the registry after completion."""
    _active_executions.pop(execution_id, None)


def get_active_count() -> int:
    """Return the number of currently active executions."""
    return len(_active_executions)
