"""
workflow_validator.py — Pydantic v2 models for validating AI-generated workflow JSON.

Used by WorkflowGenerator (workflow_generator.py) to validate LLM output before
returning it to the caller. On validation failure the error is fed back to the LLM
as a correction instruction (see workflow_generator.py retry loop in section-08).

Do NOT import NodeRegistry here — circular dependency risk.
The KNOWN_NODE_TYPES set is a hardcoded copy of the 57 registered type strings.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, model_validator


# ---------------------------------------------------------------------------
# Known node types — hardcoded from node_registry.py, do NOT import
# ---------------------------------------------------------------------------

KNOWN_NODE_TYPES: frozenset[str] = frozenset({
    # Triggers
    "manual_trigger", "schedule_trigger", "webhook_trigger", "event_trigger",
    "queue_trigger", "file_upload_trigger", "error_trigger",
    # AI
    "llm_call", "rag_query", "prompt_template", "output_parser",
    "multi_model_router",
    # Flow control
    "conditional", "loop", "parallel", "join", "subworkflow",
    "retry", "circuit_breaker", "try_catch", "delay", "switch", "wait",
    "split", "batch", "execution_timeout",
    # Data
    "database_query", "transformer", "filter", "set_variable", "merge_data",
    "code_runner", "map_array", "validator",
    "csv_parser", "template_engine", "read_file", "write_file",
    # Integrations
    "http_request", "graphql_request", "websocket_client",
    "storage_action", "mcp_connector",
    # Outputs
    "send_email", "send_notification", "workflow_response", "webhook_response",
    # Observability / reliability
    "metrics_collector", "secrets_vault", "dead_letter_queue", "run_history",
    "rate_limiter", "idempotency",
    # Media / Skills / Human
    "generate_image", "skill", "approval_gate", "form_input",
})

TRIGGER_NODE_TYPES: frozenset[str] = frozenset({
    "manual_trigger",
    "schedule_trigger",
    "webhook_trigger",
    "event_trigger",
    "queue_trigger",
    "file_upload_trigger",
    "error_trigger",
})


# ---------------------------------------------------------------------------
# Pydantic v2 models
# ---------------------------------------------------------------------------


class NodeData(BaseModel):
    """Data payload carried by each ReactFlow workflow node."""

    nodeType: str
    label: str
    config: dict[str, Any] = {}


class WorkflowNode(BaseModel):
    """A single node in the ReactFlow workflow graph.

    The 'type' field is the ReactFlow component name — it should be "workflow"
    (the registered custom renderer key). The validator does NOT enforce this
    as an enum because wrong values (e.g. "workflowNode") are a UX issue, not
    a structural error; correcting them is done elsewhere.
    """

    id: str
    type: str = "workflow"
    position: dict[str, float]
    data: NodeData


class WorkflowEdge(BaseModel):
    """A directed edge connecting two nodes in the workflow graph."""

    id: str
    source: str
    target: str
    sourceHandle: str = "output"
    targetHandle: str = "input"


class GeneratedWorkflow(BaseModel):
    """Top-level model for an AI-generated workflow JSON object.

    Validates the structural invariants required for a workflow to be usable:
    1. At least one trigger node must be present.
    2. All edge source/target IDs must reference existing node IDs.
    3. All data.nodeType values must be in KNOWN_NODE_TYPES.

    Usage (Pydantic v2):
        workflow = GeneratedWorkflow.model_validate(parsed_dict)
        result = workflow.model_dump()
    """

    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]

    @model_validator(mode="after")
    def validate_workflow(self) -> "GeneratedWorkflow":
        """Run structural validators after field parsing."""
        # --- Validator 0: duplicate node IDs ---
        seen_ids: set[str] = set()
        for node in self.nodes:
            if node.id in seen_ids:
                raise ValueError(
                    f"Duplicate node id '{node.id}'. Every node must have a unique id."
                )
            seen_ids.add(node.id)

        node_ids = seen_ids
        node_types: set[str] = {n.data.nodeType for n in self.nodes}

        # --- Validator 1: at least one trigger node ---
        if not node_types & TRIGGER_NODE_TYPES:
            raise ValueError(
                f"Workflow must have at least one trigger node. "
                f"Known trigger types: {sorted(TRIGGER_NODE_TYPES)}. "
                f"Found nodeTypes: {sorted(node_types)}"
            )

        # --- Validator 2: edge IDs reference existing node IDs ---
        for edge in self.edges:
            if edge.source not in node_ids:
                raise ValueError(
                    f"Edge '{edge.id}' has source '{edge.source}' which does not "
                    f"match any node id. Available node ids: {sorted(node_ids)}"
                )
            if edge.target not in node_ids:
                raise ValueError(
                    f"Edge '{edge.id}' has target '{edge.target}' which does not "
                    f"match any node id. Available node ids: {sorted(node_ids)}"
                )

        # --- Validator 3: all nodeType values are known ---
        for node in self.nodes:
            if node.data.nodeType not in KNOWN_NODE_TYPES:
                raise ValueError(
                    f"Node '{node.id}' has unknown nodeType '{node.data.nodeType}'. "
                    f"Use one of the registered node types from KNOWN_NODE_TYPES."
                )

        return self


# ---------------------------------------------------------------------------
# Status response model extension
# ---------------------------------------------------------------------------


class WorkflowGenerateStatusResponse(BaseModel):
    """Response model for GET /api/v1/workflows/generate/status/{task_id}.

    Extended with structured error fields so the frontend can display
    specific corrective guidance instead of a generic failure message.

    Fields preserved from original (apps/api/workflows.py):
        status, message, error, nodes, edges, description

    New fields (added in feature-017):
        result: Alternative combined result dict (nodes + edges + description)
        validationError: The specific Pydantic validation message after 3 failed
                         attempts, e.g. "Workflow must have at least one trigger node."
        hint: A user-facing corrective suggestion derived from the error type,
              e.g. "Try describing when the workflow should start."

    Pydantic v2 note: Use .model_dump() (not .dict()) when serializing.
    """

    status: str  # "pending" | "running" | "completed" | "failed"
    message: str | None = None
    error: str | None = None
    nodes: list[dict[str, Any]] | None = None
    edges: list[dict[str, Any]] | None = None
    description: str | None = None
    result: dict[str, Any] | None = None
    validationError: str | None = None
    hint: str | None = None
