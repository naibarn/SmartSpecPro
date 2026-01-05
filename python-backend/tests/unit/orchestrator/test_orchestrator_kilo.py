"""
Unit tests for Orchestrator Kilo Code integration.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.orchestrator.orchestrator import WorkflowOrchestrator
from app.services.kilo_session_manager import (
    KiloSession,
    KiloResult,
    KiloMode,
    KiloSessionStatus,
    KiloCheckpoint,
    KiloTask,
)
from app.services.kilo_skill_manager import Skill, SkillScope, SkillMode
from app.services.kilo_state_sync import SyncState, CheckpointMapping, TaskMapping


@pytest.fixture
def orchestrator():
    """Create orchestrator instance."""
    return WorkflowOrchestrator(use_postgres=False)


@pytest.fixture
def temp_workspace(tmp_path):
    """Create temporary workspace directory."""
    workspace = tmp_path / "test_workspace"
    workspace.mkdir()
    return str(workspace)


@pytest.fixture
def mock_kilo_session(temp_workspace):
    """Create mock Kilo session."""
    return KiloSession(
        session_id="test-session-123",
        workspace=temp_workspace,
        mode=KiloMode.CODE,
        status=KiloSessionStatus.IDLE,
    )


class TestOrchestratorKiloProperties:
    """Tests for Kilo-related properties."""
    
    def test_kilo_session_manager_property(self, orchestrator):
        """Test kilo_session_manager lazy initialization."""
        manager = orchestrator.kilo_session_manager
        
        assert manager is not None
        # Should return same instance
        assert orchestrator.kilo_session_manager is manager
    
    def test_kilo_skill_manager_property(self, orchestrator):
        """Test kilo_skill_manager lazy initialization."""
        manager = orchestrator.kilo_skill_manager
        
        assert manager is not None
        assert orchestrator.kilo_skill_manager is manager
    
    def test_kilo_state_sync_property(self, orchestrator):
        """Test kilo_state_sync lazy initialization."""
        sync = orchestrator.kilo_state_sync
        
        assert sync is not None
        assert orchestrator.kilo_state_sync is sync


class TestOrchestratorKiloSession:
    """Tests for Kilo session management."""
    
    @pytest.mark.asyncio
    async def test_create_kilo_session(self, orchestrator, temp_workspace):
        """Test creating a Kilo session."""
        mock_session = KiloSession(
            session_id="new-session",
            workspace=temp_workspace,
            mode=KiloMode.CODE,
        )
        
        with patch.object(
            orchestrator.kilo_session_manager,
            'check_cli_available',
            new_callable=AsyncMock,
            return_value=True,
        ), patch.object(
            orchestrator.kilo_session_manager,
            'create_session',
            new_callable=AsyncMock,
            return_value=mock_session,
        ):
            session = await orchestrator.create_kilo_session(
                execution_id="exec-123",
                workspace=temp_workspace,
                mode=KiloMode.CODE,
            )
        
        assert session is not None
        assert session.session_id == "new-session"
        assert "exec-123" in orchestrator._kilo_sessions
    
    @pytest.mark.asyncio
    async def test_create_kilo_session_cli_not_available(self, orchestrator, temp_workspace):
        """Test creating session when CLI not available."""
        with patch.object(
            orchestrator.kilo_session_manager,
            'check_cli_available',
            new_callable=AsyncMock,
            return_value=False,
        ):
            session = await orchestrator.create_kilo_session(
                execution_id="exec-123",
                workspace=temp_workspace,
            )
        
        assert session is None
    
    def test_kilo_session_tracking(self, orchestrator, mock_kilo_session):
        """Test Kilo session tracking."""
        orchestrator._kilo_sessions["exec-123"] = mock_kilo_session
        
        session = orchestrator._kilo_sessions.get("exec-123")
        
        assert session is mock_kilo_session
    
    def test_kilo_session_tracking_not_found(self, orchestrator):
        """Test getting non-existent session."""
        session = orchestrator._kilo_sessions.get("nonexistent")
        
        assert session is None
    
    @pytest.mark.asyncio
    async def test_close_kilo_session(self, orchestrator, mock_kilo_session):
        """Test closing Kilo session."""
        orchestrator._kilo_sessions["exec-123"] = mock_kilo_session
        
        with patch.object(
            orchestrator.kilo_session_manager,
            'close_session',
            new_callable=AsyncMock,
        ):
            await orchestrator.close_kilo_session("exec-123")
        
        assert "exec-123" not in orchestrator._kilo_sessions


class TestOrchestratorKiloExecution:
    """Tests for Kilo task execution."""
    
    @pytest.mark.asyncio
    async def test_execute_kilo_task(self, orchestrator, mock_kilo_session):
        """Test executing Kilo task."""
        orchestrator._kilo_sessions["exec-123"] = mock_kilo_session
        
        mock_result = KiloResult(
            success=True,
            exit_code=0,
            output="Task completed",
            tokens_used=100,
            cost=0.01,
        )
        
        with patch.object(
            orchestrator.kilo_session_manager,
            'execute_task',
            new_callable=AsyncMock,
            return_value=mock_result,
        ):
            result = await orchestrator.execute_kilo_task(
                execution_id="exec-123",
                prompt="Fix the bug",
            )
        
        assert result is not None
        assert result.success is True
        assert result.output == "Task completed"
    
    @pytest.mark.asyncio
    async def test_execute_kilo_task_no_session(self, orchestrator):
        """Test executing task without session."""
        result = await orchestrator.execute_kilo_task(
            execution_id="nonexistent",
            prompt="Fix the bug",
        )
        
        assert result is None


class TestOrchestratorSkillInjection:
    """Tests for skill injection."""
    
    @pytest.mark.asyncio
    async def test_inject_skills_for_execution(self, orchestrator, temp_workspace):
        """Test injecting skills for execution."""
        with patch.object(
            orchestrator.kilo_skill_manager,
            'inject_smartspec_context',
        ), patch.object(
            orchestrator.kilo_skill_manager,
            'setup_project_skills',
            return_value=[],
        ):
            skills = await orchestrator.inject_skills_for_execution(
                execution_id="exec-123",
                workspace=temp_workspace,
            )
        
        assert isinstance(skills, list)
    
    @pytest.mark.asyncio
    async def test_inject_custom_skill(self, orchestrator, temp_workspace):
        """Test injecting custom skill."""
        with patch.object(
            orchestrator.kilo_skill_manager,
            'create_skill',
        ):
            result = await orchestrator.inject_custom_skill(
                workspace=temp_workspace,
                name="my-skill",
                description="My custom skill",
                content="# My Skill",
                mode="code",
            )
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_inject_custom_skill_error(self, orchestrator, temp_workspace):
        """Test injecting custom skill with error."""
        with patch.object(
            orchestrator.kilo_skill_manager,
            'create_skill',
            side_effect=Exception("Test error"),
        ):
            result = await orchestrator.inject_custom_skill(
                workspace=temp_workspace,
                name="my-skill",
                description="My custom skill",
                content="# My Skill",
            )
        
        assert result is False


class TestOrchestratorStateSync:
    """Tests for state synchronization."""
    
    @pytest.mark.asyncio
    async def test_init_kilo_sync_state(self, orchestrator, temp_workspace):
        """Test initializing sync state."""
        state = await orchestrator.init_kilo_sync_state(
            execution_id="exec-123",
            workspace=temp_workspace,
        )
        
        assert state is not None
        assert state.execution_id == "exec-123"
        assert state.workspace == temp_workspace
    
    @pytest.mark.asyncio
    async def test_record_kilo_checkpoint(self, orchestrator, temp_workspace):
        """Test recording checkpoint."""
        # First create sync state
        await orchestrator.init_kilo_sync_state("exec-123", temp_workspace)
        
        mapping = await orchestrator.record_kilo_checkpoint(
            execution_id="exec-123",
            step_id="step-1",
            kilo_checkpoint_hash="abc123",
            smartspec_checkpoint_id="ss-1",
        )
        
        assert mapping is not None
        assert mapping.kilo_checkpoint_hash == "abc123"
    
    @pytest.mark.asyncio
    async def test_record_kilo_task(self, orchestrator, temp_workspace):
        """Test recording task."""
        await orchestrator.init_kilo_sync_state("exec-123", temp_workspace)
        
        mapping = await orchestrator.record_kilo_task(
            execution_id="exec-123",
            step_id="step-1",
            kilo_task_id="task-1",
            prompt="Fix bug",
            result="Done",
            success=True,
        )
        
        assert mapping is not None
        assert mapping.kilo_task_id == "task-1"
    
    @pytest.mark.asyncio
    async def test_sync_kilo_state(self, orchestrator, mock_kilo_session, temp_workspace):
        """Test syncing Kilo state."""
        orchestrator._kilo_sessions["exec-123"] = mock_kilo_session
        await orchestrator.init_kilo_sync_state("exec-123", temp_workspace)
        
        mock_checkpoints = [
            KiloCheckpoint(hash="hash-1", timestamp=datetime.utcnow(), message="Commit 1"),
        ]
        mock_tasks = [
            KiloTask(task_id="task-1", description="Fix bug", timestamp=datetime.utcnow()),
        ]
        
        with patch.object(
            orchestrator.kilo_session_manager,
            'get_checkpoints',
            new_callable=AsyncMock,
            return_value=mock_checkpoints,
        ), patch.object(
            orchestrator.kilo_session_manager,
            'get_task_history',
            new_callable=AsyncMock,
            return_value=mock_tasks,
        ):
            result = await orchestrator.sync_kilo_state("exec-123")
        
        assert result["success"] is True
        assert result["checkpoints_synced"] == 1
        assert result["tasks_synced"] == 1
    
    @pytest.mark.asyncio
    async def test_sync_kilo_state_no_session(self, orchestrator):
        """Test syncing state without session."""
        result = await orchestrator.sync_kilo_state("nonexistent")
        
        assert result["success"] is False
        assert "error" in result
    
    @pytest.mark.asyncio
    async def test_get_kilo_sync_summary(self, orchestrator, temp_workspace):
        """Test getting sync summary."""
        await orchestrator.init_kilo_sync_state("exec-123", temp_workspace)
        
        summary = await orchestrator.get_kilo_sync_summary("exec-123")
        
        assert summary["found"] is True
        assert summary["execution_id"] == "exec-123"


class TestOrchestratorExecuteKiloStep:
    """Tests for _execute_kilo_step method."""
    
    @pytest.mark.asyncio
    async def test_execute_kilo_step_success(self, orchestrator, mock_kilo_session, temp_workspace):
        """Test successful Kilo step execution."""
        orchestrator._kilo_sessions["exec-123"] = mock_kilo_session
        
        mock_result = KiloResult(
            success=True,
            exit_code=0,
            output="Code generated successfully",
            tokens_used=150,
            cost=0.02,
        )
        
        with patch.object(
            orchestrator.kilo_session_manager,
            'check_cli_available',
            new_callable=AsyncMock,
            return_value=True,
        ), patch.object(
            orchestrator,
            'execute_kilo_task',
            new_callable=AsyncMock,
            return_value=mock_result,
        ), patch('app.orchestrator.orchestrator.state_manager') as mock_state_manager:
            result = await orchestrator._execute_kilo_step(
                execution_id="exec-123",
                step_id="step-1",
                step_config={
                    "prompt": "Generate API endpoint",
                    "mode": "code",
                    "workspace": temp_workspace,
                },
            )
        
        assert result["success"] is True
        assert result["content"] == "Code generated successfully"
    
    @pytest.mark.asyncio
    async def test_execute_kilo_step_cli_not_available(self, orchestrator, temp_workspace):
        """Test Kilo step when CLI not available - falls back to LLM."""
        with patch.object(
            orchestrator.kilo_session_manager,
            'check_cli_available',
            new_callable=AsyncMock,
            return_value=False,
        ), patch.object(
            orchestrator,
            '_execute_llm_step',
            new_callable=AsyncMock,
            return_value={"success": True, "content": "LLM fallback"},
        ) as mock_llm:
            result = await orchestrator._execute_kilo_step(
                execution_id="exec-123",
                step_id="step-1",
                step_config={
                    "prompt": "Generate code",
                    "workspace": temp_workspace,
                },
            )
        
        # Should fall back to LLM
        mock_llm.assert_called_once()
        assert result["success"] is True
    
    @pytest.mark.asyncio
    async def test_execute_kilo_step_failure(self, orchestrator, mock_kilo_session, temp_workspace):
        """Test failed Kilo step execution."""
        orchestrator._kilo_sessions["exec-123"] = mock_kilo_session
        
        with patch.object(
            orchestrator.kilo_session_manager,
            'check_cli_available',
            new_callable=AsyncMock,
            return_value=True,
        ), patch.object(
            orchestrator,
            'execute_kilo_task',
            new_callable=AsyncMock,
            return_value=None,  # Kilo execution failed
        ):
            result = await orchestrator._execute_kilo_step(
                execution_id="exec-123",
                step_id="step-1",
                step_config={
                    "prompt": "Generate code",
                    "workspace": temp_workspace,
                },
            )
        
        assert result["success"] is False
        assert "error" in result
