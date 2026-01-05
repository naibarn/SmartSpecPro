"""
SmartSpec Pro - State Manager Tests
Comprehensive tests for StateManager class

Coverage targets:
- create_execution()
- get_state()
- update_status()
- add_step()
- update_step_status()
- add_aggregate_output()
- add_file_created/modified/deleted()
- set_error()
- increment_retry()
- set_checkpoint()
- list_executions()
- delete_execution()
- cleanup_old_executions()
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch
import time

from app.orchestrator.state_manager import StateManager
from app.orchestrator.models import ExecutionStatus


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def state_manager():
    """Create a fresh StateManager instance for each test."""
    return StateManager()


@pytest.fixture
def execution_with_steps(state_manager):
    """Create an execution with multiple steps."""
    state = state_manager.create_execution(
        workflow_id="wf-test",
        user_prompt="Test prompt",
        goal="Test goal",
        project_path="/test/path",
        total_steps=3
    )
    
    # Add steps
    state_manager.add_step(state.execution_id, "step-1", "Step 1", "First step")
    state_manager.add_step(state.execution_id, "step-2", "Step 2", "Second step")
    state_manager.add_step(state.execution_id, "step-3", "Step 3", "Third step")
    
    return state


# =============================================================================
# Test: create_execution()
# =============================================================================

class TestCreateExecution:
    """Test create_execution method."""
    
    def test_create_execution_basic(self, state_manager):
        """Test creating a basic execution."""
        state = state_manager.create_execution(
            workflow_id="wf-1",
            user_prompt="Generate a report",
            goal="Create comprehensive report"
        )
        
        assert state.workflow_id == "wf-1"
        assert state.user_prompt == "Generate a report"
        assert state.goal == "Create comprehensive report"
        assert state.status == ExecutionStatus.PENDING
        assert state.execution_id is not None
        assert len(state.execution_id) == 36  # UUID format
    
    def test_create_execution_with_project_path(self, state_manager):
        """Test creating execution with project path."""
        state = state_manager.create_execution(
            workflow_id="wf-2",
            user_prompt="Build app",
            goal="Create web application",
            project_path="/home/user/project"
        )
        
        assert state.project_path == "/home/user/project"
    
    def test_create_execution_with_total_steps(self, state_manager):
        """Test creating execution with total steps."""
        state = state_manager.create_execution(
            workflow_id="wf-3",
            user_prompt="Multi-step task",
            goal="Complete workflow",
            total_steps=5
        )
        
        assert state.total_steps == 5
        assert state.completed_steps == 0
        assert state.progress_percentage == 0.0
    
    def test_create_execution_timestamps(self, state_manager):
        """Test that timestamps are set correctly."""
        before = datetime.utcnow()
        state = state_manager.create_execution(
            workflow_id="wf-4",
            user_prompt="Test",
            goal="Test"
        )
        after = datetime.utcnow()
        
        assert before <= state.created_at <= after
        assert before <= state.updated_at <= after
        assert state.started_at is None
        assert state.completed_at is None
    
    def test_create_multiple_executions(self, state_manager):
        """Test creating multiple executions."""
        state1 = state_manager.create_execution("wf-1", "p1", "g1")
        state2 = state_manager.create_execution("wf-2", "p2", "g2")
        
        assert state1.execution_id != state2.execution_id
        assert len(state_manager.states) == 2
    
    def test_create_execution_initial_values(self, state_manager):
        """Test that initial values are set correctly."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        assert state.steps == []
        assert state.aggregate_output == {}
        assert state.files_created == []
        assert state.files_modified == []
        assert state.files_deleted == []
        assert state.total_cost == 0.0
        assert state.total_tokens_used == 0
        assert state.retry_count == 0
        assert state.checkpoint_count == 0
        assert state.error is None
    
    def test_execution_stored_in_states(self, state_manager):
        """Test that execution is stored in states dict."""
        state = state_manager.create_execution(
            workflow_id="wf_123",
            user_prompt="Test",
            goal="Test goal"
        )
        
        assert state.execution_id in state_manager.states
        assert state_manager.states[state.execution_id] == state


# =============================================================================
# Test: get_state()
# =============================================================================

class TestGetState:
    """Test get_state method."""
    
    def test_get_state_existing(self, state_manager):
        """Test getting an existing state."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        retrieved = state_manager.get_state(state.execution_id)
        
        assert retrieved is not None
        assert retrieved.execution_id == state.execution_id
        assert retrieved.workflow_id == "wf-1"
    
    def test_get_state_not_found(self, state_manager):
        """Test getting a non-existent state."""
        result = state_manager.get_state("non-existent-id")
        
        assert result is None
    
    def test_get_state_returns_same_object(self, state_manager):
        """Test that get_state returns the same object (not a copy)."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        retrieved1 = state_manager.get_state(state.execution_id)
        retrieved2 = state_manager.get_state(state.execution_id)
        
        assert retrieved1 is retrieved2


# =============================================================================
# Test: update_status()
# =============================================================================

class TestUpdateStatus:
    """Test update_status method."""
    
    def test_update_status_to_running(self, state_manager):
        """Test updating status to RUNNING."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.status == ExecutionStatus.RUNNING
        assert updated.started_at is not None
    
    def test_update_status_to_completed(self, state_manager):
        """Test updating status to COMPLETED."""
        state = state_manager.create_execution("wf-1", "p", "g")
        state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
        
        state_manager.update_status(state.execution_id, ExecutionStatus.COMPLETED)
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.status == ExecutionStatus.COMPLETED
        assert updated.completed_at is not None
        assert updated.total_duration_seconds is not None
        assert updated.total_duration_seconds >= 0
    
    def test_update_status_to_failed(self, state_manager):
        """Test updating status to FAILED."""
        state = state_manager.create_execution("wf-1", "p", "g")
        state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
        
        state_manager.update_status(state.execution_id, ExecutionStatus.FAILED)
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.status == ExecutionStatus.FAILED
        assert updated.completed_at is not None
    
    def test_update_status_to_cancelled(self, state_manager):
        """Test updating status to CANCELLED."""
        state = state_manager.create_execution("wf-1", "p", "g")
        state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
        
        state_manager.update_status(state.execution_id, ExecutionStatus.CANCELLED)
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.status == ExecutionStatus.CANCELLED
        assert updated.completed_at is not None
    
    def test_update_status_not_found(self, state_manager):
        """Test updating status for non-existent execution."""
        # Should not raise, just log warning
        state_manager.update_status("non-existent", ExecutionStatus.RUNNING)
    
    def test_update_status_running_only_sets_started_once(self, state_manager):
        """Test that started_at is only set once."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
        first_started = state_manager.get_state(state.execution_id).started_at
        
        # Small delay
        time.sleep(0.01)
        
        # Update to RUNNING again (shouldn't change started_at)
        state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
        second_started = state_manager.get_state(state.execution_id).started_at
        
        assert first_started == second_started
    
    def test_update_status_updates_timestamp(self, state_manager):
        """Test that updated_at is changed."""
        state = state_manager.create_execution("wf-1", "p", "g")
        original_updated = state.updated_at
        
        # Small delay to ensure timestamp difference
        time.sleep(0.01)
        
        state_manager.update_status(state.execution_id, ExecutionStatus.RUNNING)
        
        assert state_manager.get_state(state.execution_id).updated_at > original_updated


# =============================================================================
# Test: add_step()
# =============================================================================

class TestAddStep:
    """Test add_step method."""
    
    def test_add_step_basic(self, state_manager):
        """Test adding a step."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        step = state_manager.add_step(
            state.execution_id,
            "step-1",
            "Analysis",
            "Analyze requirements"
        )
        
        assert step is not None
        assert step.id == "step-1"
        assert step.name == "Analysis"
        assert step.description == "Analyze requirements"
        assert step.status == ExecutionStatus.PENDING
    
    def test_add_step_appends_to_list(self, state_manager):
        """Test that steps are appended to the list."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_step(state.execution_id, "s1", "Step 1", "Desc 1")
        state_manager.add_step(state.execution_id, "s2", "Step 2", "Desc 2")
        
        updated = state_manager.get_state(state.execution_id)
        assert len(updated.steps) == 2
        assert updated.steps[0].id == "s1"
        assert updated.steps[1].id == "s2"
    
    def test_add_step_not_found(self, state_manager):
        """Test adding step to non-existent execution."""
        result = state_manager.add_step("non-existent", "s1", "Step", "Desc")
        
        assert result is None
    
    def test_add_step_updates_timestamp(self, state_manager):
        """Test that adding step updates timestamp."""
        state = state_manager.create_execution("wf-1", "p", "g")
        original = state.updated_at
        
        time.sleep(0.01)
        
        state_manager.add_step(state.execution_id, "s1", "Step", "Desc")
        
        assert state_manager.get_state(state.execution_id).updated_at > original


# =============================================================================
# Test: update_step_status()
# =============================================================================

class TestUpdateStepStatus:
    """Test update_step_status method."""
    
    def test_update_step_to_running(self, execution_with_steps, state_manager):
        """Test updating step status to RUNNING."""
        exec_id = execution_with_steps.execution_id
        
        state_manager.update_step_status(exec_id, "step-1", ExecutionStatus.RUNNING)
        
        state = state_manager.get_state(exec_id)
        step = next(s for s in state.steps if s.id == "step-1")
        
        assert step.status == ExecutionStatus.RUNNING
        assert step.started_at is not None
        assert state.current_step_id == "step-1"
    
    def test_update_step_to_completed(self, execution_with_steps, state_manager):
        """Test updating step status to COMPLETED."""
        exec_id = execution_with_steps.execution_id
        
        # First set to RUNNING
        state_manager.update_step_status(exec_id, "step-1", ExecutionStatus.RUNNING)
        # Then complete
        state_manager.update_step_status(exec_id, "step-1", ExecutionStatus.COMPLETED)
        
        state = state_manager.get_state(exec_id)
        step = next(s for s in state.steps if s.id == "step-1")
        
        assert step.status == ExecutionStatus.COMPLETED
        assert step.completed_at is not None
        assert step.duration_seconds is not None
        assert state.completed_steps == 1
    
    def test_update_step_to_failed(self, execution_with_steps, state_manager):
        """Test updating step status to FAILED."""
        exec_id = execution_with_steps.execution_id
        
        state_manager.update_step_status(exec_id, "step-1", ExecutionStatus.RUNNING)
        state_manager.update_step_status(exec_id, "step-1", ExecutionStatus.FAILED)
        
        state = state_manager.get_state(exec_id)
        step = next(s for s in state.steps if s.id == "step-1")
        
        assert step.status == ExecutionStatus.FAILED
        assert step.completed_at is not None
        # completed_steps should NOT increase for failed steps
        assert state.completed_steps == 0
    
    def test_update_step_with_output(self, execution_with_steps, state_manager):
        """Test updating step with output data."""
        exec_id = execution_with_steps.execution_id
        output = {"result": "success", "data": [1, 2, 3]}
        
        state_manager.update_step_status(
            exec_id, "step-1", ExecutionStatus.COMPLETED,
            output=output
        )
        
        state = state_manager.get_state(exec_id)
        step = next(s for s in state.steps if s.id == "step-1")
        
        assert step.output == output
    
    def test_update_step_with_error(self, execution_with_steps, state_manager):
        """Test updating step with error message."""
        exec_id = execution_with_steps.execution_id
        
        state_manager.update_step_status(
            exec_id, "step-1", ExecutionStatus.FAILED,
            error="Something went wrong"
        )
        
        state = state_manager.get_state(exec_id)
        step = next(s for s in state.steps if s.id == "step-1")
        
        assert step.error == "Something went wrong"
    
    def test_update_step_with_llm_info(self, execution_with_steps, state_manager):
        """Test updating step with LLM provider info."""
        exec_id = execution_with_steps.execution_id
        
        state_manager.update_step_status(
            exec_id, "step-1", ExecutionStatus.COMPLETED,
            llm_provider="openai",
            llm_model="gpt-4",
            llm_cost=0.05,
            tokens_used=1000
        )
        
        state = state_manager.get_state(exec_id)
        step = next(s for s in state.steps if s.id == "step-1")
        
        assert step.llm_provider == "openai"
        assert step.llm_model == "gpt-4"
        assert step.llm_cost == 0.05
        assert step.tokens_used == 1000
        
        # Check totals
        assert state.total_cost == 0.05
        assert state.total_tokens_used == 1000
    
    def test_update_step_accumulates_cost(self, execution_with_steps, state_manager):
        """Test that costs are accumulated across steps."""
        exec_id = execution_with_steps.execution_id
        
        state_manager.update_step_status(
            exec_id, "step-1", ExecutionStatus.COMPLETED,
            llm_cost=0.05, tokens_used=1000
        )
        state_manager.update_step_status(
            exec_id, "step-2", ExecutionStatus.COMPLETED,
            llm_cost=0.03, tokens_used=500
        )
        
        state = state_manager.get_state(exec_id)
        
        assert state.total_cost == 0.08
        assert state.total_tokens_used == 1500
    
    def test_update_step_progress_percentage(self, execution_with_steps, state_manager):
        """Test that progress percentage is calculated correctly."""
        exec_id = execution_with_steps.execution_id
        
        # Complete step 1 (1/3 = 33.33%)
        state_manager.update_step_status(exec_id, "step-1", ExecutionStatus.COMPLETED)
        state = state_manager.get_state(exec_id)
        assert abs(state.progress_percentage - 33.33) < 0.1
        
        # Complete step 2 (2/3 = 66.67%)
        state_manager.update_step_status(exec_id, "step-2", ExecutionStatus.COMPLETED)
        state = state_manager.get_state(exec_id)
        assert abs(state.progress_percentage - 66.67) < 0.1
        
        # Complete step 3 (3/3 = 100%)
        state_manager.update_step_status(exec_id, "step-3", ExecutionStatus.COMPLETED)
        state = state_manager.get_state(exec_id)
        assert state.progress_percentage == 100.0
    
    def test_update_step_execution_not_found(self, state_manager):
        """Test updating step for non-existent execution."""
        # Should not raise
        state_manager.update_step_status("non-existent", "step-1", ExecutionStatus.RUNNING)
    
    def test_update_step_step_not_found(self, execution_with_steps, state_manager):
        """Test updating non-existent step."""
        exec_id = execution_with_steps.execution_id
        
        # Should not raise
        state_manager.update_step_status(exec_id, "non-existent-step", ExecutionStatus.RUNNING)


# =============================================================================
# Test: add_aggregate_output()
# =============================================================================

class TestAddAggregateOutput:
    """Test add_aggregate_output method."""
    
    def test_add_aggregate_output_basic(self, state_manager):
        """Test adding aggregate output."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_aggregate_output(state.execution_id, "summary", "Test summary")
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.aggregate_output["summary"] == "Test summary"
    
    def test_add_aggregate_output_multiple(self, state_manager):
        """Test adding multiple aggregate outputs."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_aggregate_output(state.execution_id, "key1", "value1")
        state_manager.add_aggregate_output(state.execution_id, "key2", {"nested": "data"})
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.aggregate_output["key1"] == "value1"
        assert updated.aggregate_output["key2"] == {"nested": "data"}
    
    def test_add_aggregate_output_overwrite(self, state_manager):
        """Test overwriting aggregate output."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_aggregate_output(state.execution_id, "key", "old")
        state_manager.add_aggregate_output(state.execution_id, "key", "new")
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.aggregate_output["key"] == "new"
    
    def test_add_aggregate_output_not_found(self, state_manager):
        """Test adding output to non-existent execution."""
        # Should not raise
        state_manager.add_aggregate_output("non-existent", "key", "value")


# =============================================================================
# Test: add_file_created/modified/deleted()
# =============================================================================

class TestFileTracking:
    """Test file tracking methods."""
    
    def test_add_file_created(self, state_manager):
        """Test tracking file creation."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_file_created(state.execution_id, "/path/to/file1.py")
        state_manager.add_file_created(state.execution_id, "/path/to/file2.py")
        
        updated = state_manager.get_state(state.execution_id)
        assert len(updated.files_created) == 2
        assert "/path/to/file1.py" in updated.files_created
        assert "/path/to/file2.py" in updated.files_created
    
    def test_add_file_created_no_duplicates(self, state_manager):
        """Test that duplicate files are not added."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_file_created(state.execution_id, "/path/to/file.py")
        state_manager.add_file_created(state.execution_id, "/path/to/file.py")
        
        updated = state_manager.get_state(state.execution_id)
        assert len(updated.files_created) == 1
    
    def test_add_file_modified(self, state_manager):
        """Test tracking file modification."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_file_modified(state.execution_id, "/path/to/file.py")
        
        updated = state_manager.get_state(state.execution_id)
        assert "/path/to/file.py" in updated.files_modified
    
    def test_add_file_modified_no_duplicates(self, state_manager):
        """Test that duplicate modified files are not added."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_file_modified(state.execution_id, "/path/to/file.py")
        state_manager.add_file_modified(state.execution_id, "/path/to/file.py")
        
        updated = state_manager.get_state(state.execution_id)
        assert len(updated.files_modified) == 1
    
    def test_add_file_deleted(self, state_manager):
        """Test tracking file deletion."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_file_deleted(state.execution_id, "/path/to/file.py")
        
        updated = state_manager.get_state(state.execution_id)
        assert "/path/to/file.py" in updated.files_deleted
    
    def test_add_file_deleted_no_duplicates(self, state_manager):
        """Test that duplicate deleted files are not added."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.add_file_deleted(state.execution_id, "/path/to/file.py")
        state_manager.add_file_deleted(state.execution_id, "/path/to/file.py")
        
        updated = state_manager.get_state(state.execution_id)
        assert len(updated.files_deleted) == 1
    
    def test_file_tracking_not_found(self, state_manager):
        """Test file tracking for non-existent execution."""
        # Should not raise
        state_manager.add_file_created("non-existent", "/path")
        state_manager.add_file_modified("non-existent", "/path")
        state_manager.add_file_deleted("non-existent", "/path")


# =============================================================================
# Test: set_error()
# =============================================================================

class TestSetError:
    """Test set_error method."""
    
    def test_set_error_basic(self, state_manager):
        """Test setting an error."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.set_error(state.execution_id, "Critical failure occurred")
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.error == "Critical failure occurred"
        assert updated.status == ExecutionStatus.FAILED
    
    def test_set_error_updates_timestamp(self, state_manager):
        """Test that setting error updates timestamp."""
        state = state_manager.create_execution("wf-1", "p", "g")
        original = state.updated_at
        
        time.sleep(0.01)
        
        state_manager.set_error(state.execution_id, "Error")
        
        assert state_manager.get_state(state.execution_id).updated_at > original
    
    def test_set_error_not_found(self, state_manager):
        """Test setting error for non-existent execution."""
        # Should not raise
        state_manager.set_error("non-existent", "Error")


# =============================================================================
# Test: increment_retry()
# =============================================================================

class TestIncrementRetry:
    """Test increment_retry method."""
    
    def test_increment_retry_basic(self, state_manager):
        """Test incrementing retry count."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        count = state_manager.increment_retry(state.execution_id)
        
        assert count == 1
        assert state_manager.get_state(state.execution_id).retry_count == 1
    
    def test_increment_retry_multiple(self, state_manager):
        """Test incrementing retry count multiple times."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.increment_retry(state.execution_id)
        state_manager.increment_retry(state.execution_id)
        count = state_manager.increment_retry(state.execution_id)
        
        assert count == 3
        assert state_manager.get_state(state.execution_id).retry_count == 3
    
    def test_increment_retry_not_found(self, state_manager):
        """Test incrementing retry for non-existent execution."""
        count = state_manager.increment_retry("non-existent")
        
        assert count == 0


# =============================================================================
# Test: set_checkpoint()
# =============================================================================

class TestSetCheckpoint:
    """Test set_checkpoint method."""
    
    def test_set_checkpoint_basic(self, state_manager):
        """Test setting a checkpoint."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.set_checkpoint(state.execution_id, "cp-001")
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.last_checkpoint_id == "cp-001"
        assert updated.checkpoint_count == 1
    
    def test_set_checkpoint_multiple(self, state_manager):
        """Test setting multiple checkpoints."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        state_manager.set_checkpoint(state.execution_id, "cp-001")
        state_manager.set_checkpoint(state.execution_id, "cp-002")
        state_manager.set_checkpoint(state.execution_id, "cp-003")
        
        updated = state_manager.get_state(state.execution_id)
        assert updated.last_checkpoint_id == "cp-003"
        assert updated.checkpoint_count == 3
    
    def test_set_checkpoint_not_found(self, state_manager):
        """Test setting checkpoint for non-existent execution."""
        # Should not raise
        state_manager.set_checkpoint("non-existent", "cp-001")


# =============================================================================
# Test: list_executions()
# =============================================================================

class TestListExecutions:
    """Test list_executions method."""
    
    def test_list_executions_empty(self, state_manager):
        """Test listing when no executions exist."""
        result = state_manager.list_executions()
        
        assert result == []
    
    def test_list_executions_all(self, state_manager):
        """Test listing all executions."""
        state_manager.create_execution("wf-1", "p1", "g1")
        state_manager.create_execution("wf-2", "p2", "g2")
        state_manager.create_execution("wf-3", "p3", "g3")
        
        result = state_manager.list_executions()
        
        assert len(result) == 3
    
    def test_list_executions_filtered_by_status(self, state_manager):
        """Test listing executions filtered by status."""
        state1 = state_manager.create_execution("wf-1", "p1", "g1")
        state2 = state_manager.create_execution("wf-2", "p2", "g2")
        state3 = state_manager.create_execution("wf-3", "p3", "g3")
        
        state_manager.update_status(state1.execution_id, ExecutionStatus.RUNNING)
        state_manager.update_status(state2.execution_id, ExecutionStatus.COMPLETED)
        # state3 remains PENDING
        
        running = state_manager.list_executions(status=ExecutionStatus.RUNNING)
        completed = state_manager.list_executions(status=ExecutionStatus.COMPLETED)
        pending = state_manager.list_executions(status=ExecutionStatus.PENDING)
        
        assert len(running) == 1
        assert len(completed) == 1
        assert len(pending) == 1
    
    def test_list_executions_sorted_by_created_at(self, state_manager):
        """Test that executions are sorted by creation time (newest first)."""
        state1 = state_manager.create_execution("wf-1", "p1", "g1")
        time.sleep(0.01)
        state2 = state_manager.create_execution("wf-2", "p2", "g2")
        time.sleep(0.01)
        state3 = state_manager.create_execution("wf-3", "p3", "g3")
        
        result = state_manager.list_executions()
        
        # Newest first
        assert result[0].execution_id == state3.execution_id
        assert result[1].execution_id == state2.execution_id
        assert result[2].execution_id == state1.execution_id


# =============================================================================
# Test: delete_execution()
# =============================================================================

class TestDeleteExecution:
    """Test delete_execution method."""
    
    def test_delete_execution_existing(self, state_manager):
        """Test deleting an existing execution."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        result = state_manager.delete_execution(state.execution_id)
        
        assert result is True
        assert state_manager.get_state(state.execution_id) is None
    
    def test_delete_execution_not_found(self, state_manager):
        """Test deleting a non-existent execution."""
        result = state_manager.delete_execution("non-existent")
        
        assert result is False
    
    def test_delete_execution_removes_from_list(self, state_manager):
        """Test that deleted execution is removed from list."""
        state1 = state_manager.create_execution("wf-1", "p1", "g1")
        state2 = state_manager.create_execution("wf-2", "p2", "g2")
        
        state_manager.delete_execution(state1.execution_id)
        
        result = state_manager.list_executions()
        assert len(result) == 1
        assert result[0].execution_id == state2.execution_id


# =============================================================================
# Test: cleanup_old_executions()
# =============================================================================

class TestCleanupOldExecutions:
    """Test cleanup_old_executions method."""
    
    def test_cleanup_old_executions_basic(self, state_manager):
        """Test cleaning up old executions."""
        # Create execution with old timestamp
        state = state_manager.create_execution("wf-1", "p", "g")
        
        # Manually set old created_at
        state.created_at = datetime.utcnow() - timedelta(days=10)
        
        count = state_manager.cleanup_old_executions(days=7)
        
        assert count == 1
        assert state_manager.get_state(state.execution_id) is None
    
    def test_cleanup_old_executions_keeps_recent(self, state_manager):
        """Test that recent executions are kept."""
        state = state_manager.create_execution("wf-1", "p", "g")
        
        count = state_manager.cleanup_old_executions(days=7)
        
        assert count == 0
        assert state_manager.get_state(state.execution_id) is not None
    
    def test_cleanup_old_executions_mixed(self, state_manager):
        """Test cleanup with mix of old and new executions."""
        # Create old execution
        old_state = state_manager.create_execution("wf-old", "p", "g")
        old_state.created_at = datetime.utcnow() - timedelta(days=10)
        
        # Create new execution
        new_state = state_manager.create_execution("wf-new", "p", "g")
        
        count = state_manager.cleanup_old_executions(days=7)
        
        assert count == 1
        assert state_manager.get_state(old_state.execution_id) is None
        assert state_manager.get_state(new_state.execution_id) is not None
    
    def test_cleanup_old_executions_custom_days(self, state_manager):
        """Test cleanup with custom day threshold."""
        state = state_manager.create_execution("wf-1", "p", "g")
        state.created_at = datetime.utcnow() - timedelta(days=3)
        
        # Should not be cleaned with 7 days threshold
        count1 = state_manager.cleanup_old_executions(days=7)
        assert count1 == 0
        
        # Should be cleaned with 2 days threshold
        count2 = state_manager.cleanup_old_executions(days=2)
        assert count2 == 1


# =============================================================================
# Test: Global Instance
# =============================================================================

class TestGlobalInstance:
    """Test global state_manager instance."""
    
    def test_global_instance_exists(self):
        """Test that global instance is created."""
        from app.orchestrator.state_manager import state_manager
        
        assert state_manager is not None
        assert isinstance(state_manager, StateManager)


# =============================================================================
# Test: Edge Cases and Error Handling
# =============================================================================

class TestMissingBranchCoverage:
    """Test missing branch conditions for 100% coverage."""
    
    def test_update_step_completed_without_started_at(self, state_manager):
        """
        Test completing a step that was never started (no started_at).
        This covers the branch at line 161: `if step.started_at`
        """
        state = state_manager.create_execution("wf-1", "p", "g", total_steps=1)
        state_manager.add_step(state.execution_id, "step-1", "Step 1", "Desc")
        
        # Complete without setting to RUNNING first (so started_at is None)
        state_manager.update_step_status(
            state.execution_id, "step-1", ExecutionStatus.COMPLETED
        )
        
        updated = state_manager.get_state(state.execution_id)
        step = updated.steps[0]
        
        assert step.status == ExecutionStatus.COMPLETED
        assert step.completed_at is not None
        # duration_seconds should be None because started_at was None
        assert step.duration_seconds is None
        assert updated.completed_steps == 1
    
    def test_update_step_with_zero_total_steps(self, state_manager):
        """
        Test updating step when total_steps is 0.
        This covers the branch at line 188: `if state.total_steps > 0`
        """
        state = state_manager.create_execution("wf-1", "p", "g", total_steps=0)
        state_manager.add_step(state.execution_id, "step-1", "Step 1", "Desc")
        
        state_manager.update_step_status(
            state.execution_id, "step-1", ExecutionStatus.COMPLETED
        )
        
        updated = state_manager.get_state(state.execution_id)
        
        # progress_percentage should remain 0 because total_steps is 0
        assert updated.progress_percentage == 0.0
        # But completed_steps should still increase
        assert updated.completed_steps == 1
    
    def test_list_executions_with_none_status_filter(self, state_manager):
        """
        Test list_executions with status=None (no filter).
        This ensures the `if status:` branch is covered for False case.
        """
        state1 = state_manager.create_execution("wf-1", "p1", "g1")
        state2 = state_manager.create_execution("wf-2", "p2", "g2")
        state_manager.update_status(state1.execution_id, ExecutionStatus.RUNNING)
        
        # Explicitly pass None
        result = state_manager.list_executions(status=None)
        
        # Should return all executions
        assert len(result) == 2
    
    def test_cleanup_old_executions_empty_states(self, state_manager):
        """
        Test cleanup when there are no executions.
        This covers the loop not executing case.
        """
        count = state_manager.cleanup_old_executions(days=7)
        
        assert count == 0
    
    def test_cleanup_old_executions_no_old_executions(self, state_manager):
        """
        Test cleanup when all executions are recent.
        This covers the `if state.created_at < cutoff_time` being False.
        """
        state_manager.create_execution("wf-1", "p1", "g1")
        state_manager.create_execution("wf-2", "p2", "g2")
        
        count = state_manager.cleanup_old_executions(days=7)
        
        assert count == 0
        assert len(state_manager.list_executions()) == 2
    
    def test_update_step_to_pending_status(self, state_manager):
        """
        Test updating step to PENDING status (not RUNNING, COMPLETED, or FAILED).
        This covers the else branch at line 159: neither RUNNING nor COMPLETED/FAILED.
        """
        state = state_manager.create_execution("wf-1", "p", "g", total_steps=1)
        state_manager.add_step(state.execution_id, "step-1", "Step 1", "Desc")
        
        # Update to PENDING (which is the default, but explicitly setting it)
        state_manager.update_step_status(
            state.execution_id, "step-1", ExecutionStatus.PENDING
        )
        
        updated = state_manager.get_state(state.execution_id)
        step = updated.steps[0]
        
        assert step.status == ExecutionStatus.PENDING
        assert step.started_at is None
        assert step.completed_at is None
    
    def test_update_step_to_cancelled_status(self, state_manager):
        """
        Test updating step to CANCELLED status.
        This covers the else branch at line 159.
        """
        state = state_manager.create_execution("wf-1", "p", "g", total_steps=1)
        state_manager.add_step(state.execution_id, "step-1", "Step 1", "Desc")
        
        # Update to CANCELLED (not RUNNING, COMPLETED, or FAILED)
        state_manager.update_step_status(
            state.execution_id, "step-1", ExecutionStatus.CANCELLED
        )
        
        updated = state_manager.get_state(state.execution_id)
        step = updated.steps[0]
        
        assert step.status == ExecutionStatus.CANCELLED
        # started_at and completed_at should not be set for CANCELLED
        assert step.started_at is None
        assert step.completed_at is None


class TestEdgeCases:
    """Test edge cases and error handling."""
    
    def test_empty_workflow_id(self, state_manager):
        """Test creating execution with empty workflow_id."""
        state = state_manager.create_execution("", "prompt", "goal")
        assert state.workflow_id == ""
    
    def test_long_strings(self, state_manager):
        """Test with very long strings."""
        long_string = "x" * 10000
        state = state_manager.create_execution("wf-1", long_string, long_string)
        
        assert state.user_prompt == long_string
        assert state.goal == long_string
    
    def test_special_characters(self, state_manager):
        """Test with special characters."""
        special = "Test with special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?`~"
        state = state_manager.create_execution("wf-1", special, special)
        
        assert state.user_prompt == special
        assert state.goal == special
    
    def test_unicode_characters(self, state_manager):
        """Test with unicode characters."""
        unicode_str = "Test with unicode: 你好世界 🚀 émojis"
        state = state_manager.create_execution("wf-1", unicode_str, unicode_str)
        
        assert state.user_prompt == unicode_str
        assert state.goal == unicode_str
    
    def test_concurrent_updates(self, state_manager):
        """Test that updates don't interfere with each other."""
        state1 = state_manager.create_execution("wf-1", "p1", "g1")
        state2 = state_manager.create_execution("wf-2", "p2", "g2")
        
        # Update both
        state_manager.update_status(state1.execution_id, ExecutionStatus.RUNNING)
        state_manager.update_status(state2.execution_id, ExecutionStatus.COMPLETED)
        
        # Verify they're independent
        assert state_manager.get_state(state1.execution_id).status == ExecutionStatus.RUNNING
        assert state_manager.get_state(state2.execution_id).status == ExecutionStatus.COMPLETED
    
    def test_zero_total_steps(self, state_manager):
        """Test execution with zero total steps."""
        state = state_manager.create_execution("wf-1", "p", "g", total_steps=0)
        
        # Progress should handle division by zero
        assert state.progress_percentage == 0.0
    
    def test_negative_cost(self, state_manager):
        """Test updating step with negative cost (edge case)."""
        state = state_manager.create_execution("wf-1", "p", "g", total_steps=1)
        state_manager.add_step(state.execution_id, "s1", "Step 1", "Desc")
        
        # Negative cost (shouldn't happen but test handling)
        state_manager.update_step_status(
            state.execution_id, "s1", ExecutionStatus.COMPLETED,
            llm_cost=-0.01, tokens_used=-100
        )
        
        updated = state_manager.get_state(state.execution_id)
        # Should still work, just with negative values
        assert updated.total_cost == -0.01
        assert updated.total_tokens_used == -100
