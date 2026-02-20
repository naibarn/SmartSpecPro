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


@pytest.mark.unit
def test_duplicate_node_ids_raises():
    """Workflow with duplicate node IDs raises ValidationError."""
    data = {
        "nodes": [
            {
                "id": "trigger_1",
                "type": "workflow",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
            },
            {
                "id": "trigger_1",  # duplicate
                "type": "workflow",
                "position": {"x": 280, "y": 0},
                "data": {"nodeType": "llm_call", "label": "Generate", "config": {}},
            },
        ],
        "edges": [],
    }
    with pytest.raises(ValidationError) as exc_info:
        GeneratedWorkflow.model_validate(data)
    assert "trigger_1" in str(exc_info.value)


@pytest.mark.unit
def test_known_node_types_matches_registry():
    """KNOWN_NODE_TYPES must exactly match the types registered in NodeRegistry."""
    from app.orchestrator.node_registry import NodeRegistry
    from app.orchestrator.workflow_validator import KNOWN_NODE_TYPES

    registry = NodeRegistry.get_instance()
    registry_types = {spec.type for spec in registry.get_all_node_types()}

    missing_from_validator = registry_types - KNOWN_NODE_TYPES
    extra_in_validator = KNOWN_NODE_TYPES - registry_types

    assert not missing_from_validator, f"Types in registry but missing from KNOWN_NODE_TYPES: {missing_from_validator}"
    assert not extra_in_validator, f"Types in KNOWN_NODE_TYPES but not in registry: {extra_in_validator}"


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
