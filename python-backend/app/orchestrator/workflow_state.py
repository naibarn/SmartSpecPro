from typing import TypedDict, Dict, List, Any
from pydantic import BaseModel, field_validator
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
    status: str  # pending, running, completed, failed, paused
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

    @field_validator('budget')
    @classmethod
    def validate_budget(cls, v):
        if 'reserved' not in v or 'spent' not in v:
            raise ValueError("Budget must have 'reserved' and 'spent' fields")
        return v

def serialize_state(state: WorkflowState) -> str:
    return json.dumps(state, ensure_ascii=False)

def deserialize_state(data: str) -> WorkflowState:
    state = json.loads(data)
    WorkflowStateValidator(**state)
    return state

def get_state_size_kb(state: WorkflowState) -> float:
    serialized = serialize_state(state)
    return len(serialized.encode('utf-8')) / 1024
