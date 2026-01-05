"""
SmartSpec Pro - Orchestrator Tests
Phase 0.3
"""

import pytest
from datetime import datetime
from app.orchestrator import (
    StateManager,
    CheckpointManager,
    WorkflowOrchestrator,
    ExecutionStatus,
)


@pytest.fixture
def state_manager():
    """Create state manager for testing"""
    return StateManager()


@pytest.fixture
def checkpoint_manager(tmp_path):
    """Create checkpoint manager with temp directory"""
    return CheckpointManager(checkpoint_dir=str(tmp_path / "checkpoints"))


@pytest.fixture
def orchestrator():
    """Create orchestrator for testing"""
    return WorkflowOrchestrator()


# State Manager Tests

def test_create_execution(state_manager):
    """Test creating execution state"""
    state = state_manager.create_execution(
        workflow_id="test_workflow",
        user_prompt="Test prompt",
        goal="Test goal",
        total_steps=3
    )
    
    assert state is not None
    assert state.workflow_id == "test_workflow"
    assert state.user_prompt == "Test prompt"
    assert state.goal == "Test goal"
    assert state.total_steps == 3
    assert state.status == ExecutionStatus.PENDING


def test_update_status(state_manager):
    """Test updating execution status"""
    state = state_manager.create_execution(
        workflow_id="test",
        user_prompt="test",
        goal="test"
    )
    
    state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
    updated_state = state_manager.get_state(state.execution_id)
    
    assert updated_state.status == ExecutionStatus.RUNNING
    assert updated_state.started_at is not None


def test_add_step(state_manager):
    """Test adding step to execution"""
    state = state_manager.create_execution(
        workflow_id="test",
        user_prompt="test",
        goal="test"
    )
    
    step = state_manager.add_step(
        state.execution_id,
        "step_1",
        "Test Step",
        "Test description"
    )
    
    assert step is not None
    assert step.id == "step_1"
    assert step.name == "Test Step"
    assert step.status == ExecutionStatus.PENDING


def test_update_step_status(state_manager):
    """Test updating step status"""
    state = state_manager.create_execution(
        workflow_id="test",
        user_prompt="test",
        goal="test",
        total_steps=1
    )
    
    state_manager.add_step(state.execution_id, "step_1", "Test", "Test")
    
    # Start step
    state_manager.update_step_status(
        state.execution_id,
        "step_1",
        ExecutionStatus.RUNNING
    )
    
    updated_state = state_manager.get_state(state.execution_id)
    step = updated_state.steps[0]
    
    assert step.status == ExecutionStatus.RUNNING
    assert step.started_at is not None
    
    # Complete step
    state_manager.update_step_status(
        state.execution_id,
        "step_1",
        ExecutionStatus.COMPLETED,
        output={"result": "success"},
        llm_cost=0.01,
        tokens_used=100
    )
    
    updated_state = state_manager.get_state(state.execution_id)
    step = updated_state.steps[0]
    
    assert step.status == ExecutionStatus.COMPLETED
    assert step.completed_at is not None
    assert step.output == {"result": "success"}
    assert step.llm_cost == 0.01
    assert step.tokens_used == 100
    assert updated_state.total_cost == 0.01
    assert updated_state.total_tokens_used == 100
    assert updated_state.progress_percentage == 100.0


def test_list_executions(state_manager):
    """Test listing executions"""
    state1 = state_manager.create_execution("w1", "p1", "g1")
    state2 = state_manager.create_execution("w2", "p2", "g2")
    
    state_manager.update_status(state1.execution_id, ExecutionStatus.COMPLETED)
    
    all_executions = state_manager.list_executions()
    assert len(all_executions) == 2
    
    completed = state_manager.list_executions(ExecutionStatus.COMPLETED)
    assert len(completed) == 1
    assert completed[0].execution_id == state1.execution_id


# Checkpoint Manager Tests

def test_create_checkpoint(checkpoint_manager, state_manager):
    """Test creating checkpoint"""
    state = state_manager.create_execution("test", "test", "test")
    
    checkpoint = checkpoint_manager.create_checkpoint(
        execution_id=state.execution_id,
        state=state,
        step_id="step_1",
        step_name="Test Step"
    )
    
    assert checkpoint is not None
    assert checkpoint.execution_id == state.execution_id
    assert checkpoint.step_id == "step_1"
    assert checkpoint.step_name == "Test Step"
    assert checkpoint.can_resume is True


def test_load_checkpoint(checkpoint_manager, state_manager):
    """Test loading checkpoint"""
    state = state_manager.create_execution("test", "test", "test")
    
    checkpoint = checkpoint_manager.create_checkpoint(
        execution_id=state.execution_id,
        state=state,
        step_id="step_1",
        step_name="Test Step"
    )
    
    loaded = checkpoint_manager.load_checkpoint(checkpoint.checkpoint_id)
    
    assert loaded is not None
    assert loaded.checkpoint_id == checkpoint.checkpoint_id
    assert loaded.execution_id == state.execution_id


def test_list_checkpoints(checkpoint_manager, state_manager):
    """Test listing checkpoints"""
    state = state_manager.create_execution("test", "test", "test")
    
    checkpoint_manager.create_checkpoint(state.execution_id, state, "step_1", "Step 1")
    checkpoint_manager.create_checkpoint(state.execution_id, state, "step_2", "Step 2")
    
    checkpoints = checkpoint_manager.list_checkpoints(state.execution_id)
    
    assert len(checkpoints) == 2


def test_get_latest_checkpoint(checkpoint_manager, state_manager):
    """Test getting latest checkpoint"""
    state = state_manager.create_execution("test", "test", "test")
    
    checkpoint1 = checkpoint_manager.create_checkpoint(state.execution_id, state, "step_1", "Step 1")
    checkpoint2 = checkpoint_manager.create_checkpoint(state.execution_id, state, "step_2", "Step 2")
    
    latest = checkpoint_manager.get_latest_checkpoint(state.execution_id)
    
    assert latest is not None
    assert latest.checkpoint_id == checkpoint2.checkpoint_id


def test_delete_checkpoint(checkpoint_manager, state_manager):
    """Test deleting checkpoint"""
    state = state_manager.create_execution("test", "test", "test")
    
    checkpoint = checkpoint_manager.create_checkpoint(state.execution_id, state, "step_1", "Step 1")
    
    success = checkpoint_manager.delete_checkpoint(checkpoint.checkpoint_id)
    assert success is True
    
    loaded = checkpoint_manager.load_checkpoint(checkpoint.checkpoint_id)
    assert loaded is None


def test_checkpoint_stats(checkpoint_manager, state_manager):
    """Test checkpoint statistics"""
    state1 = state_manager.create_execution("test1", "test", "test")
    state2 = state_manager.create_execution("test2", "test", "test")
    
    checkpoint_manager.create_checkpoint(state1.execution_id, state1, "step_1", "Step 1")
    checkpoint_manager.create_checkpoint(state2.execution_id, state2, "step_1", "Step 1")
    
    stats = checkpoint_manager.get_checkpoint_stats()
    
    assert stats["total_checkpoints"] == 2
    assert stats["total_executions"] == 2
    assert stats["total_size_mb"] >= 0


# Orchestrator Tests

@pytest.mark.asyncio
async def test_execute_workflow_simple(orchestrator):
    """Test simple workflow execution"""
    steps = [
        {
            "id": "step_1",
            "name": "Test Step",
            "description": "Test",
            "type": "llm",
            "prompt": "Say hello",
            "task_type": "simple",
            "budget_priority": "cost"
        }
    ]
    
    state = await orchestrator.execute_workflow(
        workflow_id="test",
        user_prompt="Test",
        goal="Test execution",
        steps=steps
    )
    
    assert state is not None
    assert state.workflow_id == "test"
    # Status might be COMPLETED or FAILED depending on LLM availability
    assert state.status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED]


def test_get_execution_status(orchestrator):
    """Test getting execution status"""
    from app.orchestrator import state_manager
    state = state_manager.create_execution("test", "test", "test")
    
    retrieved = orchestrator.get_execution_status(state.execution_id)
    
    assert retrieved is not None
    assert retrieved.execution_id == state.execution_id


def test_list_executions_orchestrator(orchestrator):
    """Test listing executions through orchestrator"""
    from app.orchestrator import state_manager
    state1 = state_manager.create_execution("test1", "test", "test")
    state2 = state_manager.create_execution("test2", "test", "test")
    
    executions = orchestrator.list_executions()
    
    assert len(executions) >= 2


def test_cancel_execution(orchestrator):
    """Test cancelling execution"""
    from app.orchestrator import state_manager
    state = state_manager.create_execution("test", "test", "test")
    state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
    
    success = orchestrator.cancel_execution(state.execution_id)
    
    assert success is True
    
    updated = state_manager.get_state(state.execution_id)
    assert updated.status == ExecutionStatus.CANCELLED
