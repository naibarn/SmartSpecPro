Now I have enough context to write the section. Let me generate the complete section content.

# Section 07: Python Validator — `workflow_validator.py`

## Overview

This section creates the Pydantic v2 validation schema for generated workflow JSON and extends the status response model with structured error fields. It is an independent deliverable that does not depend on any other section — it can be implemented and tested in parallel with sections 01–03.

**Blocks:** section-08 (Python Generator Retry Loop), which wraps its LLM calls with `GeneratedWorkflow.model_validate()`.

---

## Background

The existing `WorkflowGenerator` in `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_generator.py` performs ad-hoc validation via `_parse_and_validate()`. It detects some structural issues (empty node list, malformed JSON) but does not validate:

- Whether a trigger node is present
- Whether edge `source`/`target` IDs reference actual node IDs
- Whether `data.nodeType` values belong to the 57 known node types

This section creates a dedicated Pydantic v2 model that enforces all three invariants and provides structured, human-readable error messages. When section-08 wraps this into a 3-attempt retry loop, the error messages are fed back into the LLM to guide correction.

**Critical Pydantic version note:** This project uses Pydantic v2 (`pydantic>=2.7.4`). Never use v1 API (`@validator`, `.dict()`, `values` dict in validators). Always use v2 API: `@model_validator(mode="after")`, `.model_dump()`, `.model_validate()`.

---

## Tests First

Write these tests before implementing `workflow_validator.py`. Run with:

```bash
cd python-backend && uv run pytest tests/test_workflow_validator.py -m unit -v
```

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_workflow_validator.py`

```python
"""
Unit tests for GeneratedWorkflow Pydantic v2 validator.
Run: cd python-backend && uv run pytest tests/test_workflow_validator.py -m unit -v
"""
import pytest
from pydantic import ValidationError

from app.orchestrator.workflow_validator import GeneratedWorkflow, WorkflowGenerateStatusResponse


# ---------------------------------------------------------------------------
# Fixtures — minimal valid workflow data
# ---------------------------------------------------------------------------

VALID_MINIMAL = {
    "nodes": [
        {
            "id": "trigger_1",
            "type": "workflow",
            "position": {"x": 0, "y": 0},
            "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
        },
        {
            "id": "llm_1",
            "type": "workflow",
            "position": {"x": 280, "y": 0},
            "data": {"nodeType": "llm_call", "label": "Generate", "config": {}},
        },
    ],
    "edges": [
        {
            "id": "edge-trigger_1-llm_1",
            "source": "trigger_1",
            "target": "llm_1",
        }
    ],
}


# ---------------------------------------------------------------------------
# GeneratedWorkflow validation
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_valid_minimal_workflow_passes():
    """Valid workflow with trigger + one action passes without error."""
    workflow = GeneratedWorkflow.model_validate(VALID_MINIMAL)
    assert len(workflow.nodes) == 2
    assert len(workflow.edges) == 1


@pytest.mark.unit
def test_zero_nodes_raises_validation_error():
    """Workflow with zero nodes raises ValidationError."""
    data = {"nodes": [], "edges": []}
    with pytest.raises(ValidationError):
        GeneratedWorkflow.model_validate(data)


@pytest.mark.unit
def test_no_trigger_node_raises_with_trigger_message():
    """Workflow with nodes but no trigger nodeType raises ValidationError mentioning 'trigger'."""
    data = {
        "nodes": [
            {
                "id": "llm_1",
                "type": "workflow",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "llm_call", "label": "Generate", "config": {}},
            }
        ],
        "edges": [],
    }
    with pytest.raises(ValidationError) as exc_info:
        GeneratedWorkflow.model_validate(data)
    assert "trigger" in str(exc_info.value).lower()


@pytest.mark.unit
def test_hallucinated_node_type_raises_with_bad_type_in_message():
    """Workflow with unknown nodeType raises ValidationError naming the bad type."""
    data = {
        "nodes": [
            {
                "id": "trigger_1",
                "type": "workflow",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
            },
            {
                "id": "fake_1",
                "type": "workflow",
                "position": {"x": 280, "y": 0},
                "data": {"nodeType": "fake_node_xyz", "label": "Fake", "config": {}},
            },
        ],
        "edges": [],
    }
    with pytest.raises(ValidationError) as exc_info:
        GeneratedWorkflow.model_validate(data)
    assert "fake_node_xyz" in str(exc_info.value)


@pytest.mark.unit
def test_edge_with_nonexistent_source_raises():
    """Edge referencing a non-existent source node ID raises ValidationError."""
    data = {
        "nodes": [
            {
                "id": "trigger_1",
                "type": "workflow",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
            }
        ],
        "edges": [
            {"id": "e1", "source": "nonexistent_node", "target": "trigger_1"}
        ],
    }
    with pytest.raises(ValidationError) as exc_info:
        GeneratedWorkflow.model_validate(data)
    assert "nonexistent_node" in str(exc_info.value)


@pytest.mark.unit
def test_edge_with_nonexistent_target_raises():
    """Edge referencing a non-existent target node ID raises ValidationError."""
    data = {
        "nodes": [
            {
                "id": "trigger_1",
                "type": "workflow",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
            }
        ],
        "edges": [
            {"id": "e1", "source": "trigger_1", "target": "ghost_node"}
        ],
    }
    with pytest.raises(ValidationError) as exc_info:
        GeneratedWorkflow.model_validate(data)
    assert "ghost_node" in str(exc_info.value)


@pytest.mark.unit
def test_parallel_branches_with_join_passes():
    """Workflow with parallel branches (two sources feeding a join) passes validation."""
    # A → B, A → C, B → D, C → D (join pattern)
    data = {
        "nodes": [
            {
                "id": "trigger_1",
                "type": "workflow",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "schedule_trigger", "label": "Daily", "config": {}},
            },
            {
                "id": "llm_b",
                "type": "workflow",
                "position": {"x": 280, "y": -100},
                "data": {"nodeType": "llm_call", "label": "Path B", "config": {}},
            },
            {
                "id": "llm_c",
                "type": "workflow",
                "position": {"x": 280, "y": 100},
                "data": {"nodeType": "llm_call", "label": "Path C", "config": {}},
            },
            {
                "id": "join_1",
                "type": "workflow",
                "position": {"x": 560, "y": 0},
                "data": {"nodeType": "join", "label": "Merge", "config": {}},
            },
        ],
        "edges": [
            {"id": "e1", "source": "trigger_1", "target": "llm_b"},
            {"id": "e2", "source": "trigger_1", "target": "llm_c"},
            {"id": "e3", "source": "llm_b", "target": "join_1"},
            {"id": "e4", "source": "llm_c", "target": "join_1"},
        ],
    }
    workflow = GeneratedWorkflow.model_validate(data)
    assert len(workflow.nodes) == 4


@pytest.mark.unit
def test_node_type_field_workflow_is_accepted():
    """Node with type='workflow' (correct ReactFlow value) is accepted."""
    workflow = GeneratedWorkflow.model_validate(VALID_MINIMAL)
    assert workflow.nodes[0].type == "workflow"


@pytest.mark.unit
def test_node_type_field_workflownode_does_not_break_validator():
    """
    Node with type='workflowNode' (wrong but sometimes generated) is still
    parsed without crashing. The 'type' field is informational for ReactFlow;
    the validator only checks data.nodeType against KNOWN_NODE_TYPES.
    """
    data = {
        "nodes": [
            {
                "id": "trigger_1",
                # Wrong value — should be "workflow" — but validator must not crash
                "type": "workflowNode",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
            }
        ],
        "edges": [],
    }
    # Should not raise — type string on node is not validated against an enum
    workflow = GeneratedWorkflow.model_validate(data)
    assert workflow.nodes[0].type == "workflowNode"


# ---------------------------------------------------------------------------
# WorkflowGenerateStatusResponse model
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_status_response_has_validation_error_field():
    """WorkflowGenerateStatusResponse includes validationError field defaulting to None."""
    resp = WorkflowGenerateStatusResponse(status="pending")
    assert hasattr(resp, "validationError")
    assert resp.validationError is None


@pytest.mark.unit
def test_status_response_has_hint_field():
    """WorkflowGenerateStatusResponse includes hint field defaulting to None."""
    resp = WorkflowGenerateStatusResponse(status="pending")
    assert hasattr(resp, "hint")
    assert resp.hint is None


@pytest.mark.unit
def test_status_response_serializes_none_fields():
    """model_dump() includes validationError=None and hint=None when not set."""
    resp = WorkflowGenerateStatusResponse(status="completed", result={"nodes": [], "edges": []})
    dumped = resp.model_dump()
    assert "validationError" in dumped
    assert dumped["validationError"] is None
    assert "hint" in dumped
    assert dumped["hint"] is None


@pytest.mark.unit
def test_status_response_failed_with_structured_error():
    """Failed status response carries validationError and hint."""
    resp = WorkflowGenerateStatusResponse(
        status="failed",
        error="Workflow generation failed after 3 attempts.",
        validationError="Workflow must have at least one trigger node.",
        hint="Try describing when the workflow should start, e.g., 'every morning at 7 AM'.",
    )
    dumped = resp.model_dump()
    assert dumped["status"] == "failed"
    assert "trigger" in dumped["validationError"]
    assert dumped["hint"] is not None
```

All tests must **fail** before implementing the module. Verify they fail, then implement.

---

## Implementation

### File to Create

**`/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_validator.py`**

This is a new file. Do not modify `node_registry.py` or `workflow_generator.py` in this section (those are section-08's responsibility).

### Module Structure (stubs with docstrings)

```python
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
# Known node types — hardcoded, do NOT import from node_registry
# ---------------------------------------------------------------------------

KNOWN_NODE_TYPES: frozenset[str] = frozenset({
    # Triggers
    "manual_trigger", "schedule_trigger", "webhook_trigger", "event_trigger",
    # AI
    "llm_call", "rag_query", "embedding_generator", "multi_model_router",
    "prompt_template", "output_parser",
    # Flow control
    "conditional", "loop", "parallel", "join", "subworkflow",
    "retry", "circuit_breaker", "try_catch", "delay",
    # Data
    "database_query", "transformer", "filter", "aggregator",
    "csv_parser", "template_engine", "read_file", "write_file",
    # Integrations
    "http_request", "graphql_request", "websocket_client",
    "storage_action",
    # Outputs
    "send_email", "send_notification", "workflow_response",
    # Observability
    "metrics_collector", "logger_node", "secrets_vault",
    # Media / Skills / Human
    "generate_image", "skill", "approval_gate", "form_input",
    # Add remaining types from node_registry.py to reach 57 total
    # (copy type strings — do not import the class)
})

TRIGGER_NODE_TYPES: frozenset[str] = frozenset({
    "manual_trigger",
    "schedule_trigger",
    "webhook_trigger",
    "event_trigger",
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
        """Run all three structural validators after field parsing."""
        # Collect node IDs and nodeType values for validation
        node_ids: set[str] = {n.id for n in self.nodes}
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

    New fields (added in feature-017):
        validationError: The specific Pydantic validation message after 3 failed
                         attempts, e.g. "Workflow must have at least one trigger node."
        hint: A user-facing corrective suggestion derived from the error type,
              e.g. "Try describing when the workflow should start."

    Pydantic v2 note: Use .model_dump() (not .dict()) when serializing.
    """

    status: str  # "pending" | "running" | "completed" | "failed"
    result: dict[str, Any] | None = None
    error: str | None = None
    validationError: str | None = None  # NEW: specific validation failure message
    hint: str | None = None             # NEW: user-facing corrective hint
```

### Completing `KNOWN_NODE_TYPES`

After writing the stub above, populate `KNOWN_NODE_TYPES` with all 57 type strings from `node_registry.py`. Read `_register_core_nodes()` in `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` to extract every `type=` argument. Do NOT import the class — copy the string literals only.

The set in the stub above is illustrative. The final set must be exhaustive so that `test_hallucinated_node_type_raises_with_bad_type_in_message` passes and legitimate node types such as `"join"`, `"workflow_response"`, `"form_input"` do not incorrectly fail validation.

### Validation Error Messages — Format Requirements

The error messages produced by `validate_workflow` are fed directly back to the LLM in the retry loop (section-08). They must be:

- **Specific**: name the exact offending value (`"fake_node_xyz"`, `"ghost_node"`)
- **Actionable**: include the valid alternatives or a description of what is expected
- **Concise**: avoid lengthy preamble — the LLM reads these as correction instructions

Do not raise generic errors like `"Validation failed"`.

### `WorkflowGenerateStatusResponse` — Where It Is Used

This model is returned by the status endpoint in the Python backend. The existing endpoint is at:
- Route: `GET /api/v1/workflows/generate/status/{task_id}`
- The response model class may currently be defined in `workflow_generator.py` or the API router. Find it with:
  ```bash
  grep -r "WorkflowGenerateStatusResponse" /home/dev/projects/SmartSpecPro/python-backend/
  ```

If the class does not yet exist under that name, define it only in `workflow_validator.py` and import it in the router. If it already exists elsewhere, **move** (not copy) it to `workflow_validator.py` and update the import in the existing location to `from app.orchestrator.workflow_validator import WorkflowGenerateStatusResponse`.

---

## Hint Derivation Logic

The `hint` field on `WorkflowGenerateStatusResponse` is derived from the validation error type by the retry loop in section-08. For reference, the mapping is:

| Validation error contains | Hint text |
|---|---|
| `"trigger"` | `"Try describing when the workflow should start (e.g., 'every morning at 7 AM' or 'when a webhook is received')."` |
| `"unknown nodeType"` | `"Be more specific about which tools or apps are involved. Use standard node types like 'llm_call', 'http_request', or 'send_email'."` |
| `"source"` or `"target"` (edge reference) | `"Try simplifying the workflow description — fewer branching paths make it easier to generate correctly."` |
| Any other | `"Try rephrasing your request with more specific steps and tools."` |

This hint logic lives in `workflow_generator.py` (section-08), not in this validator module. The validator only raises `ValueError` with descriptive messages; hint derivation is the generator's responsibility.

---

## Dependencies

**This section has no dependencies on other sections.** It can be implemented immediately in parallel with sections 01–03.

**Sections that depend on this section:**
- **Section 08 (Python Generator)** imports `GeneratedWorkflow` and `WorkflowGenerateStatusResponse` from this module. Do not rename these classes.

---

## Implementation Notes (Actual)

### Files Created/Modified
- **Created:** `python-backend/app/orchestrator/workflow_validator.py` — Pydantic v2 models (GeneratedWorkflow, WorkflowGenerateStatusResponse)
- **Created:** `python-backend/tests/test_workflow_validator.py` — 15 unit tests
- **Modified:** `python-backend/app/api/workflows.py` — Removed inline `WorkflowGenerateStatusResponse` class, replaced with import from `workflow_validator.py`

### Deviations from Plan
1. **WorkflowGenerateStatusResponse preserves original fields**: The plan spec only showed `status`, `result`, `error`, `validationError`, `hint`. Implementation keeps original fields (`message`, `nodes`, `edges`, `description`) for backward compatibility with existing endpoint handler, plus adds `result`, `validationError`, `hint`.
2. **TRIGGER_NODE_TYPES expanded**: Plan's illustrative set had 4 triggers. Actual implementation includes 7 triggers found in `node_registry.py`: `manual_trigger`, `schedule_trigger`, `webhook_trigger`, `event_trigger`, `queue_trigger`, `file_upload_trigger`, `error_trigger`.
3. **Duplicate node ID validation added** (code review fix): Added validator 0 that catches duplicate IDs before other checks.
4. **Registry drift test added** (code review fix): `test_known_node_types_matches_registry` cross-validates `KNOWN_NODE_TYPES` against the live `NodeRegistry` singleton.
5. **15 tests total** (plan said 12): Added `test_duplicate_node_ids_raises`, `test_known_node_types_matches_registry`, and `test_status_response_failed_with_structured_error`.

## Verification Checklist

After implementing:

1. Run the unit tests:
   ```bash
   cd /home/dev/projects/SmartSpecPro/python-backend && uv run pytest tests/test_workflow_validator.py -m unit -v
   ```
   All 15 tests must pass.

2. Run the full test suite to check for regressions:
   ```bash
   cd /home/dev/projects/SmartSpecPro/python-backend && uv run pytest -m unit
   ```

3. Verify no circular imports by importing the module in isolation:
   ```bash
   cd /home/dev/projects/SmartSpecPro/python-backend && uv run python -c "from app.orchestrator.workflow_validator import GeneratedWorkflow, WorkflowGenerateStatusResponse; print('OK')"
   ```