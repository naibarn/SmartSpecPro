"""
Backward compatibility adapter for the workflow engine rebuild.

Maps the old WorkflowOrchestrator.execute_workflow() call signature
(which accepts a list of step dicts) to the new LangGraphRuntime
(which accepts ReactFlow JSON with nodes and edges).

Also converts old ExecutionState results back to the legacy format
expected by API callers.
"""

import warnings
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog

from app.orchestrator.models import (
    ExecutionState,
    ExecutionStatus,
)

logger = structlog.get_logger()


def steps_to_reactflow_json(
    steps: List[Dict[str, Any]],
    parallel_steps: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Convert old step-based workflow definition to ReactFlow JSON format.

    The old orchestrator accepted a flat list of step dicts with 'id', 'name',
    'type', 'prompt', etc. The new runtime expects ReactFlow JSON with nodes
    and edges.

    Args:
        steps: List of step configuration dicts from old API.
        parallel_steps: Optional list of step IDs to execute in parallel.

    Returns:
        Dict with "nodes" and "edges" in ReactFlow format.
    """
    nodes = []
    edges = []

    for i, step in enumerate(steps):
        step_id = step.get("id", f"step_{i}")
        step_type = step.get("type", "llm")

        # Map old step types to new node types
        node_type = _map_step_type_to_node_type(step_type)

        node = {
            "id": step_id,
            "type": "customNode",
            "position": {"x": 0, "y": i * 150},
            "data": {
                "nodeType": node_type,
                "label": step.get("name", step_id),
                "config": _extract_config(step),
            },
        }
        nodes.append(node)

    # Add a synthetic trigger node if none exists
    has_trigger = any(
        n["data"]["nodeType"] in ("manual_trigger", "event_trigger", "webhook_trigger")
        for n in nodes
    )
    if not has_trigger and nodes:
        trigger_node = {
            "id": "__compat_trigger__",
            "type": "customNode",
            "position": {"x": 0, "y": -150},
            "data": {
                "nodeType": "manual_trigger",
                "label": "Start",
                "config": {},
            },
        }
        nodes.insert(0, trigger_node)

    # Generate edges
    node_ids = [n["id"] for n in nodes]
    if parallel_steps:
        edges = _build_parallel_edges(node_ids, parallel_steps)
    else:
        edges = _build_sequential_edges(node_ids)

    return {"nodes": nodes, "edges": edges}


def _map_step_type_to_node_type(step_type: str) -> str:
    """Map old step type strings to new node type names."""
    mapping = {
        "llm": "llm_call",
        "kilo_cli": "llm_call",  # Kilo steps fallback to LLM in new runtime
        "custom": "llm_call",
    }
    return mapping.get(step_type, step_type)


def _extract_config(step: Dict[str, Any]) -> Dict[str, Any]:
    """Extract node config from old step dict, preserving all keys."""
    config = dict(step)
    # Remove keys that are node metadata, not config
    for key in ("id", "name", "type"):
        config.pop(key, None)
    return config


def _build_sequential_edges(node_ids: List[str]) -> List[Dict[str, Any]]:
    """Build sequential edges between nodes."""
    edges = []
    for i in range(len(node_ids) - 1):
        edges.append({
            "id": f"e_{node_ids[i]}_{node_ids[i+1]}",
            "source": node_ids[i],
            "target": node_ids[i + 1],
            "sourceHandle": "output",
            "targetHandle": "input",
        })
    return edges


def _build_parallel_edges(
    node_ids: List[str], parallel_steps: List[str]
) -> List[Dict[str, Any]]:
    """Build fork-join edges for parallel execution."""
    edges = []
    step_index = {sid: i for i, sid in enumerate(node_ids)}
    parallel_indices = {step_index[s] for s in parallel_steps if s in step_index}

    if not parallel_indices:
        return _build_sequential_edges(node_ids)

    min_idx = min(parallel_indices)
    max_idx = max(parallel_indices)

    # Sequential edges before fork
    for i in range(min_idx - 1):
        edges.append({
            "id": f"e_{node_ids[i]}_{node_ids[i+1]}",
            "source": node_ids[i],
            "target": node_ids[i + 1],
            "sourceHandle": "output",
            "targetHandle": "input",
        })

    # Fork edges
    if min_idx > 0:
        fork_id = node_ids[min_idx - 1]
        for idx in parallel_indices:
            edges.append({
                "id": f"e_{fork_id}_{node_ids[idx]}",
                "source": fork_id,
                "target": node_ids[idx],
                "sourceHandle": "output",
                "targetHandle": "input",
            })

    # Join edges
    if max_idx < len(node_ids) - 1:
        join_id = node_ids[max_idx + 1]
        for idx in parallel_indices:
            edges.append({
                "id": f"e_{node_ids[idx]}_{join_id}",
                "source": node_ids[idx],
                "target": join_id,
                "sourceHandle": "output",
                "targetHandle": "input",
            })

        # Sequential edges after join
        for i in range(max_idx + 1, len(node_ids) - 1):
            edges.append({
                "id": f"e_{node_ids[i]}_{node_ids[i+1]}",
                "source": node_ids[i],
                "target": node_ids[i + 1],
                "sourceHandle": "output",
                "targetHandle": "input",
            })

    return edges


def langgraph_state_to_execution_state(
    lg_result: Dict[str, Any],
    execution_id: str,
    workflow_id: str,
) -> ExecutionState:
    """Convert LangGraph final state to legacy ExecutionState format.

    This allows callers that expect ExecutionState (the old Pydantic model)
    to continue working without changes.

    Args:
        lg_result: Final WorkflowState dict from LangGraph execution.
        execution_id: The execution ID.
        workflow_id: The workflow ID.

    Returns:
        ExecutionState populated from LangGraph result.
    """
    now = datetime.utcnow()
    errors = lg_result.get("errors", [])
    status = ExecutionStatus.FAILED if errors else ExecutionStatus.COMPLETED

    state = ExecutionState(
        execution_id=execution_id,
        workflow_id=workflow_id,
        status=status,
        created_at=now,
        updated_at=now,
        user_prompt="",
        goal="",
        total_steps=len(lg_result.get("node_outputs", {})),
        completed_steps=len(lg_result.get("node_outputs", {})) if not errors else 0,
        aggregate_output=lg_result.get("node_outputs", {}),
    )

    if errors:
        state.error = str(errors[-1].get("error", "Unknown error"))

    return state
