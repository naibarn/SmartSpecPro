"""Adapter: wraps NodeExecutor protocol into LangGraph node functions."""

import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Callable

import structlog
from langchain_core.runnables import RunnableConfig

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

    async def _node_fn(state: WorkflowState, config: RunnableConfig) -> dict:
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
                "form_values": configurable.get("form_values", {}),
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

            audit_complete = {
                "event": "node_complete",
                "node_id": node_id,
                "node_type": node_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # Return only the delta — the _merge_dicts reducer in WorkflowState
            # merges this into the existing node_outputs dict safely,
            # even when multiple nodes execute concurrently.
            return {
                "node_outputs": {node_id: output},
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
