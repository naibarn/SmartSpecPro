# Section 05: Workflow State Management

**Phase**: 1 - Foundation
**Estimated Time**: 2 days
**Priority**: Medium
**Dependencies**: Section 01 (Checkpointing)

---

## Overview

Define and implement the `WorkflowState` TypedDict that holds all workflow execution data. Ensure proper serialization/deserialization for PostgreSQL JSONB storage and LangGraph checkpointing.

---

## Goals

- ✅ WorkflowState TypedDict defined with all required fields
- ✅ JSON serialization/deserialization works correctly
- ✅ Pydantic validation for state structure
- ✅ State size monitoring (warn if >100KB)
- ✅ All tests in `tests/test_workflow_state.py` pass

---

## Files to Create

**Created**:
- `python-backend/app/orchestrator/state.py` - State definition
- `python-backend/tests/test_workflow_state.py` - Tests

---

## Implementation

```python
# app/orchestrator/state.py
from typing import TypedDict, Dict, List, Any
from pydantic import BaseModel, validator
import json

class WorkflowState(TypedDict, total=False):
    execution_id: str
    skill_id: str
    user_id: int
    tenant_id: int
    inputs: Dict[str, Any]
    step_results: Dict[str, Any]
    artifacts: List[Dict[str, Any]]
    approvals: Dict[str, Any]
    dependencies: Dict[str, List[str]]
    budget: Dict[str, int]
    current_step: str
    status: str
    error: str

class WorkflowStateValidator(BaseModel):
    execution_id: str
    skill_id: str
    user_id: int
    tenant_id: int
    inputs: dict
    step_results: dict = {}
    artifacts: list = []
    approvals: dict = {}
    dependencies: dict = {}
    budget: dict = {"reserved": 0, "spent": 0}
    current_step: str = ""
    status: str = "pending"
    error: str = ""

    @validator('budget')
    def validate_budget(cls, v):
        assert 'reserved' in v and 'spent' in v
        assert v['spent'] <= v['reserved']
        return v

def serialize_state(state: WorkflowState) -> str:
    """Serialize state to JSON string"""
    return json.dumps(state, ensure_ascii=False)

def deserialize_state(data: str) -> WorkflowState:
    """Deserialize JSON string to WorkflowState"""
    state = json.loads(data)
    WorkflowStateValidator(**state)  # Validate
    return state

def get_state_size_kb(state: WorkflowState) -> float:
    """Get state size in KB"""
    serialized = serialize_state(state)
    return len(serialized.encode('utf-8')) / 1024
```

---

## Tests

```python
# tests/test_workflow_state.py
def test_state_serialization():
    state = {
        "execution_id": "exec-123",
        "skill_id": "test",
        "user_id": 1,
        "tenant_id": 1,
        "inputs": {"brief": "Test"},
        "step_results": {},
        "artifacts": [],
        "approvals": {},
        "dependencies": {},
        "budget": {"reserved": 0, "spent": 0}
    }

    serialized = serialize_state(state)
    deserialized = deserialize_state(serialized)

    assert deserialized["execution_id"] == "exec-123"

def test_state_validation():
    invalid_state = {"execution_id": "test"}  # Missing required fields

    with pytest.raises(ValidationError):
        WorkflowStateValidator(**invalid_state)

def test_state_size_monitoring():
    large_state = {
        "execution_id": "exec-123",
        "artifacts": [{"data": "x" * 100000} for _ in range(10)]
    }

    size_kb = get_state_size_kb(large_state)
    assert size_kb > 100
```

---

## Completion Checklist

- [ ] WorkflowState TypedDict defined
- [ ] Serialization/deserialization works
- [ ] Pydantic validation implemented
- [ ] All tests pass

**Estimated Completion**: 2 days
