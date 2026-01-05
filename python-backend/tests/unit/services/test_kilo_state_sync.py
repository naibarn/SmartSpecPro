"""
Unit tests for KiloStateSync service.
"""

import pytest
from datetime import datetime
from pathlib import Path

from app.services.kilo_state_sync import (
    KiloStateSync,
    SyncState,
    CheckpointMapping,
    TaskMapping,
    SyncStatus,
    get_kilo_state_sync,
    reset_kilo_state_sync,
)
from app.services.kilo_session_manager import KiloCheckpoint, KiloTask


@pytest.fixture
def state_sync(tmp_path):
    """Create state sync instance."""
    reset_kilo_state_sync()
    state_dir = tmp_path / "sync_state"
    state_dir.mkdir()
    return KiloStateSync(state_dir=str(state_dir))


@pytest.fixture
def temp_workspace(tmp_path):
    """Create temporary workspace directory."""
    workspace = tmp_path / "test_workspace"
    workspace.mkdir()
    return str(workspace)


class TestCheckpointMapping:
    """Tests for CheckpointMapping data class."""
    
    def test_to_dict(self):
        """Test checkpoint mapping serialization."""
        mapping = CheckpointMapping(
            execution_id="exec-123",
            step_id="step-1",
            kilo_checkpoint_hash="abc123def456",
            smartspec_checkpoint_id="ss-checkpoint-1",
            sync_status=SyncStatus.SYNCED,
        )
        
        data = mapping.to_dict()
        
        assert data["execution_id"] == "exec-123"
        assert data["step_id"] == "step-1"
        assert data["kilo_checkpoint_hash"] == "abc123def456"
        assert data["smartspec_checkpoint_id"] == "ss-checkpoint-1"
        assert data["sync_status"] == "synced"


class TestTaskMapping:
    """Tests for TaskMapping data class."""
    
    def test_to_dict(self):
        """Test task mapping serialization."""
        mapping = TaskMapping(
            execution_id="exec-123",
            step_id="step-1",
            kilo_task_id="kilo-task-1",
            prompt="Fix the bug",
            result="Bug fixed",
            success=True,
        )
        
        data = mapping.to_dict()
        
        assert data["execution_id"] == "exec-123"
        assert data["kilo_task_id"] == "kilo-task-1"
        assert data["prompt"] == "Fix the bug"
        assert data["success"] is True


class TestSyncState:
    """Tests for SyncState data class."""
    
    def test_to_dict(self):
        """Test sync state serialization."""
        state = SyncState(
            execution_id="exec-123",
            workspace="/tmp/test",
            sync_status=SyncStatus.SYNCED,
        )
        
        data = state.to_dict()
        
        assert data["execution_id"] == "exec-123"
        assert data["workspace"] == "/tmp/test"
        assert data["sync_status"] == "synced"
    
    def test_add_checkpoint_mapping(self):
        """Test adding checkpoint mapping."""
        state = SyncState(
            execution_id="exec-123",
            workspace="/tmp/test",
        )
        
        mapping = state.add_checkpoint_mapping(
            step_id="step-1",
            kilo_checkpoint_hash="abc123",
            smartspec_checkpoint_id="ss-1",
        )
        
        assert mapping in state.checkpoint_mappings
        assert mapping.step_id == "step-1"
        assert mapping.kilo_checkpoint_hash == "abc123"
    
    def test_add_task_mapping(self):
        """Test adding task mapping."""
        state = SyncState(
            execution_id="exec-123",
            workspace="/tmp/test",
        )
        
        mapping = state.add_task_mapping(
            step_id="step-1",
            kilo_task_id="task-1",
            prompt="Fix bug",
            result="Done",
            success=True,
        )
        
        assert mapping in state.task_mappings
        assert mapping.kilo_task_id == "task-1"
    
    def test_get_checkpoint_for_step(self):
        """Test getting checkpoint for step."""
        state = SyncState(
            execution_id="exec-123",
            workspace="/tmp/test",
        )
        
        state.add_checkpoint_mapping("step-1", "hash-1")
        state.add_checkpoint_mapping("step-2", "hash-2")
        state.add_checkpoint_mapping("step-1", "hash-3")  # Later checkpoint for step-1
        
        mapping = state.get_checkpoint_for_step("step-1")
        
        assert mapping is not None
        assert mapping.kilo_checkpoint_hash == "hash-3"  # Should get latest
    
    def test_get_latest_checkpoint(self):
        """Test getting latest checkpoint."""
        state = SyncState(
            execution_id="exec-123",
            workspace="/tmp/test",
        )
        
        state.add_checkpoint_mapping("step-1", "hash-1")
        state.add_checkpoint_mapping("step-2", "hash-2")
        
        mapping = state.get_latest_checkpoint()
        
        assert mapping is not None
        assert mapping.kilo_checkpoint_hash == "hash-2"
    
    def test_get_latest_checkpoint_empty(self):
        """Test getting latest checkpoint when empty."""
        state = SyncState(
            execution_id="exec-123",
            workspace="/tmp/test",
        )
        
        mapping = state.get_latest_checkpoint()
        
        assert mapping is None


class TestKiloStateSync:
    """Tests for KiloStateSync service."""
    
    def test_init(self, state_sync, tmp_path):
        """Test state sync initialization."""
        assert state_sync.state_dir == tmp_path / "sync_state"
        assert state_sync._sync_states == {}
    
    def test_create_sync_state(self, state_sync, temp_workspace):
        """Test creating sync state."""
        state = state_sync.create_sync_state(
            execution_id="exec-123",
            workspace=temp_workspace,
        )
        
        assert state is not None
        assert state.execution_id == "exec-123"
        assert state.workspace == temp_workspace
        assert "exec-123" in state_sync._sync_states
    
    def test_get_sync_state(self, state_sync, temp_workspace):
        """Test getting sync state."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        
        state = state_sync.get_sync_state("exec-123")
        
        assert state is not None
        assert state.execution_id == "exec-123"
    
    def test_get_sync_state_not_found(self, state_sync):
        """Test getting non-existent sync state."""
        state = state_sync.get_sync_state("nonexistent")
        assert state is None
    
    def test_save_and_load_state(self, state_sync, temp_workspace):
        """Test saving and loading state."""
        # Create state with data
        state = state_sync.create_sync_state("exec-123", temp_workspace)
        state.add_checkpoint_mapping("step-1", "hash-1", "ss-1")
        state.add_task_mapping("step-1", "task-1", "Fix bug", "Done", True)
        
        # Save
        result = state_sync.save_state("exec-123")
        assert result is True
        
        # Clear memory
        state_sync._sync_states.clear()
        
        # Load
        loaded = state_sync.get_sync_state("exec-123")
        
        assert loaded is not None
        assert loaded.execution_id == "exec-123"
        assert len(loaded.checkpoint_mappings) == 1
        assert len(loaded.task_mappings) == 1
    
    @pytest.mark.asyncio
    async def test_record_checkpoint(self, state_sync, temp_workspace):
        """Test recording checkpoint."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        
        mapping = await state_sync.record_checkpoint(
            execution_id="exec-123",
            step_id="step-1",
            kilo_checkpoint_hash="abc123",
            smartspec_checkpoint_id="ss-1",
        )
        
        assert mapping is not None
        assert mapping.kilo_checkpoint_hash == "abc123"
        
        state = state_sync.get_sync_state("exec-123")
        assert len(state.checkpoint_mappings) == 1
    
    @pytest.mark.asyncio
    async def test_record_checkpoint_no_state(self, state_sync):
        """Test recording checkpoint without state."""
        mapping = await state_sync.record_checkpoint(
            execution_id="nonexistent",
            step_id="step-1",
            kilo_checkpoint_hash="abc123",
        )
        
        assert mapping is None
    
    @pytest.mark.asyncio
    async def test_record_task(self, state_sync, temp_workspace):
        """Test recording task."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        
        mapping = await state_sync.record_task(
            execution_id="exec-123",
            step_id="step-1",
            kilo_task_id="task-1",
            prompt="Fix bug",
            result="Done",
            success=True,
        )
        
        assert mapping is not None
        assert mapping.kilo_task_id == "task-1"
        assert mapping.success is True
    
    @pytest.mark.asyncio
    async def test_get_rollback_point(self, state_sync, temp_workspace):
        """Test getting rollback point."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        
        await state_sync.record_checkpoint(
            execution_id="exec-123",
            step_id="step-1",
            kilo_checkpoint_hash="hash-1",
            smartspec_checkpoint_id="ss-1",
        )
        
        result = await state_sync.get_rollback_point("exec-123", "step-1")
        
        assert result is not None
        kilo_hash, ss_id = result
        assert kilo_hash == "hash-1"
        assert ss_id == "ss-1"
    
    @pytest.mark.asyncio
    async def test_get_rollback_point_not_found(self, state_sync, temp_workspace):
        """Test getting rollback point when not found."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        
        result = await state_sync.get_rollback_point("exec-123", "nonexistent")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_sync_checkpoints_from_kilo(self, state_sync, temp_workspace):
        """Test syncing checkpoints from Kilo."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        
        checkpoints = [
            KiloCheckpoint(
                hash="hash-1",
                timestamp=datetime.utcnow(),
                message="Commit 1",
            ),
            KiloCheckpoint(
                hash="hash-2",
                timestamp=datetime.utcnow(),
                message="Commit 2",
            ),
        ]
        
        count = await state_sync.sync_checkpoints_from_kilo(
            execution_id="exec-123",
            kilo_checkpoints=checkpoints,
        )
        
        assert count == 2
        
        state = state_sync.get_sync_state("exec-123")
        assert len(state.checkpoint_mappings) == 2
    
    @pytest.mark.asyncio
    async def test_sync_checkpoints_from_kilo_no_duplicates(self, state_sync, temp_workspace):
        """Test that duplicate checkpoints are not synced."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        
        checkpoints = [
            KiloCheckpoint(hash="hash-1", timestamp=datetime.utcnow(), message="Commit 1"),
        ]
        
        # First sync
        await state_sync.sync_checkpoints_from_kilo("exec-123", checkpoints)
        
        # Second sync with same checkpoint
        count = await state_sync.sync_checkpoints_from_kilo("exec-123", checkpoints)
        
        assert count == 0  # No new checkpoints
    
    @pytest.mark.asyncio
    async def test_sync_tasks_from_kilo(self, state_sync, temp_workspace):
        """Test syncing tasks from Kilo."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        
        tasks = [
            KiloTask(
                task_id="task-1",
                description="Fix bug",
                timestamp=datetime.utcnow(),
            ),
            KiloTask(
                task_id="task-2",
                description="Add feature",
                timestamp=datetime.utcnow(),
            ),
        ]
        
        count = await state_sync.sync_tasks_from_kilo(
            execution_id="exec-123",
            kilo_tasks=tasks,
        )
        
        assert count == 2
        
        state = state_sync.get_sync_state("exec-123")
        assert len(state.task_mappings) == 2
    
    def test_get_sync_summary(self, state_sync, temp_workspace):
        """Test getting sync summary."""
        state = state_sync.create_sync_state("exec-123", temp_workspace)
        state.add_checkpoint_mapping("step-1", "hash-1")
        state.add_task_mapping("step-1", "task-1", "Fix bug")
        
        summary = state_sync.get_sync_summary("exec-123")
        
        assert summary["found"] is True
        assert summary["checkpoint_count"] == 1
        assert summary["task_count"] == 1
    
    def test_get_sync_summary_not_found(self, state_sync):
        """Test getting sync summary for non-existent execution."""
        summary = state_sync.get_sync_summary("nonexistent")
        
        assert summary["found"] is False
    
    def test_delete_sync_state(self, state_sync, temp_workspace):
        """Test deleting sync state."""
        state_sync.create_sync_state("exec-123", temp_workspace)
        state_sync.save_state("exec-123")
        
        result = state_sync.delete_sync_state("exec-123")
        
        assert result is True
        assert "exec-123" not in state_sync._sync_states
        assert not state_sync._get_state_file("exec-123").exists()
    
    def test_list_sync_states(self, state_sync, temp_workspace):
        """Test listing sync states."""
        state_sync.create_sync_state("exec-1", temp_workspace)
        state_sync.create_sync_state("exec-2", temp_workspace)
        state_sync.save_state("exec-1")
        
        states = state_sync.list_sync_states()
        
        assert "exec-1" in states
        assert "exec-2" in states


class TestGlobalInstance:
    """Tests for global instance management."""
    
    def test_get_kilo_state_sync(self, tmp_path):
        """Test getting global instance."""
        reset_kilo_state_sync()
        
        sync1 = get_kilo_state_sync(str(tmp_path))
        sync2 = get_kilo_state_sync()
        
        assert sync1 is sync2
    
    def test_reset_kilo_state_sync(self, tmp_path):
        """Test resetting global instance."""
        sync1 = get_kilo_state_sync(str(tmp_path))
        reset_kilo_state_sync()
        sync2 = get_kilo_state_sync(str(tmp_path))
        
        assert sync1 is not sync2
