"""Tests for workflow state management"""
import pytest
from pydantic import ValidationError
from app.orchestrator.workflow_state import (
    WorkflowState, WorkflowStateValidator,
    serialize_state, deserialize_state, get_state_size_kb
)

@pytest.mark.unit
def test_state_serialization():
    state = {
        "execution_id": "exec-123", "skill_id": "test",
        "user_id": 1, "tenant_id": 1, "inputs": {"brief": "Test"},
        "step_results": {}, "artifacts": [], "approvals": {},
        "dependencies": {}, "budget": {"reserved": 0, "spent": 0}
    }
    serialized = serialize_state(state)
    deserialized = deserialize_state(serialized)
    assert deserialized["execution_id"] == "exec-123"

@pytest.mark.unit
def test_state_validation_missing_fields():
    with pytest.raises(ValidationError):
        WorkflowStateValidator(execution_id="test")

@pytest.mark.unit
def test_state_validation_invalid_budget():
    with pytest.raises(ValidationError):
        WorkflowStateValidator(
            execution_id="test", skill_id="s", user_id=1, tenant_id=1,
            inputs={}, budget={"wrong": 0}
        )

@pytest.mark.unit
def test_state_size_monitoring():
    state = {
        "execution_id": "exec-123", "skill_id": "test",
        "user_id": 1, "tenant_id": 1, "inputs": {},
        "artifacts": [{"data": "x" * 100000} for _ in range(2)]
    }
    size_kb = get_state_size_kb(state)
    assert size_kb > 100

@pytest.mark.unit
def test_state_default_values():
    validator = WorkflowStateValidator(
        execution_id="test", skill_id="s", user_id=1, tenant_id=1, inputs={}
    )
    assert validator.status == "pending"
    assert validator.budget == {"reserved": 0, "spent": 0}
