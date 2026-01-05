"""
Unit tests for KiloSessionManager service.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
import asyncio

from app.services.kilo_session_manager import (
    KiloSessionManager,
    KiloSession,
    KiloResult,
    KiloMode,
    KiloConfig,
    KiloCheckpoint,
    KiloTask,
    KiloSessionStatus,
    KiloExitCode,
    get_kilo_session_manager,
    reset_kilo_session_manager,
)


@pytest.fixture
def kilo_config():
    """Create test Kilo config."""
    return KiloConfig(
        cli_path="kilocode",
        default_mode=KiloMode.CODE,
        default_timeout=60,
        auto_approval=True,
    )


@pytest.fixture
def session_manager(kilo_config):
    """Create session manager instance."""
    reset_kilo_session_manager()
    return KiloSessionManager(kilo_config)


@pytest.fixture
def temp_workspace(tmp_path):
    """Create temporary workspace directory."""
    workspace = tmp_path / "test_workspace"
    workspace.mkdir()
    return str(workspace)


class TestKiloSessionManager:
    """Tests for KiloSessionManager."""
    
    def test_init(self, session_manager, kilo_config):
        """Test session manager initialization."""
        assert session_manager.config == kilo_config
        assert session_manager._sessions == {}
        assert session_manager._cli_available is None
    
    @pytest.mark.asyncio
    async def test_check_cli_available_not_found(self, session_manager):
        """Test CLI check when not found."""
        with patch('asyncio.create_subprocess_exec', side_effect=FileNotFoundError):
            result = await session_manager.check_cli_available()
            assert result is False
            assert session_manager._cli_available is False
    
    @pytest.mark.asyncio
    async def test_check_cli_available_success(self, session_manager):
        """Test CLI check when available."""
        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(b"1.0.0", b""))
        
        with patch('asyncio.create_subprocess_exec', return_value=mock_process):
            result = await session_manager.check_cli_available()
            assert result is True
            assert session_manager._cli_available is True
    
    @pytest.mark.asyncio
    async def test_create_session(self, session_manager, temp_workspace):
        """Test session creation."""
        session = await session_manager.create_session(
            workspace=temp_workspace,
            mode=KiloMode.CODE,
            timeout=120,
        )
        
        assert session is not None
        assert session.workspace == temp_workspace
        assert session.mode == KiloMode.CODE
        assert session.timeout == 120
        assert session.status == KiloSessionStatus.CREATED
        assert session.session_id in session_manager._sessions
    
    @pytest.mark.asyncio
    async def test_create_session_invalid_workspace(self, session_manager):
        """Test session creation with invalid workspace."""
        with pytest.raises(ValueError, match="does not exist"):
            await session_manager.create_session(
                workspace="/nonexistent/path",
            )
    
    def test_get_session(self, session_manager):
        """Test getting session by ID."""
        # Create a mock session
        session = KiloSession(
            session_id="test-123",
            workspace="/tmp/test",
            mode=KiloMode.CODE,
        )
        session_manager._sessions["test-123"] = session
        
        result = session_manager.get_session("test-123")
        assert result == session
        
        result = session_manager.get_session("nonexistent")
        assert result is None
    
    def test_list_sessions(self, session_manager):
        """Test listing sessions."""
        session1 = KiloSession(
            session_id="test-1",
            workspace="/tmp/test1",
            mode=KiloMode.CODE,
        )
        session2 = KiloSession(
            session_id="test-2",
            workspace="/tmp/test2",
            mode=KiloMode.ARCHITECT,
        )
        
        session_manager._sessions["test-1"] = session1
        session_manager._sessions["test-2"] = session2
        
        sessions = session_manager.list_sessions()
        assert len(sessions) == 2
    
    @pytest.mark.asyncio
    async def test_execute_task_stopped_session(self, session_manager):
        """Test executing task on stopped session."""
        session = KiloSession(
            session_id="test-123",
            workspace="/tmp/test",
            mode=KiloMode.CODE,
            status=KiloSessionStatus.STOPPED,
        )
        
        with pytest.raises(ValueError, match="Session is stopped"):
            await session_manager.execute_task(session, "test prompt")
    
    @pytest.mark.asyncio
    async def test_execute_task_success(self, session_manager, temp_workspace):
        """Test successful task execution."""
        session = KiloSession(
            session_id="test-123",
            workspace=temp_workspace,
            mode=KiloMode.CODE,
            timeout=60,
        )
        
        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(
            b'{"result": "success", "tokens_used": 100, "cost": 0.01}',
            b"",
        ))
        
        with patch('asyncio.create_subprocess_exec', return_value=mock_process):
            result = await session_manager.execute_task(
                session=session,
                prompt="Fix the bug",
                json_output=True,
            )
        
        assert result.success is True
        assert result.exit_code == 0
        assert result.json_data is not None
        assert session.status == KiloSessionStatus.IDLE
        assert len(session.task_history) == 1
    
    @pytest.mark.asyncio
    async def test_execute_task_timeout(self, session_manager, temp_workspace):
        """Test task execution timeout."""
        session = KiloSession(
            session_id="test-123",
            workspace=temp_workspace,
            mode=KiloMode.CODE,
            timeout=1,  # Very short timeout
        )
        
        async def slow_communicate():
            await asyncio.sleep(10)
            return (b"", b"")
        
        mock_process = AsyncMock()
        mock_process.communicate = slow_communicate
        mock_process.kill = MagicMock()
        mock_process.wait = AsyncMock()
        
        with patch('asyncio.create_subprocess_exec', return_value=mock_process):
            result = await session_manager.execute_task(
                session=session,
                prompt="Long task",
                timeout=1,
            )
        
        assert result.success is False
        assert result.exit_code == KiloExitCode.TIMEOUT
    
    @pytest.mark.asyncio
    async def test_get_checkpoints(self, session_manager, temp_workspace):
        """Test getting checkpoints."""
        session = KiloSession(
            session_id="test-123",
            workspace=temp_workspace,
            mode=KiloMode.CODE,
        )
        
        mock_process = AsyncMock()
        mock_process.returncode = 0
        mock_process.communicate = AsyncMock(return_value=(
            b"abc123 Initial commit\ndef456 [auto-saved] Checkpoint",
            b"",
        ))
        
        with patch('asyncio.create_subprocess_exec', return_value=mock_process):
            checkpoints = await session_manager.get_checkpoints(session)
        
        assert len(checkpoints) == 2
        assert checkpoints[0].hash == "abc123"
        assert checkpoints[1].is_auto_saved is True
    
    @pytest.mark.asyncio
    async def test_close_session(self, session_manager, temp_workspace):
        """Test closing session."""
        session = await session_manager.create_session(
            workspace=temp_workspace,
        )
        
        await session_manager.close_session(session)
        
        assert session.status == KiloSessionStatus.STOPPED
    
    def test_remove_session(self, session_manager):
        """Test removing session."""
        session = KiloSession(
            session_id="test-123",
            workspace="/tmp/test",
            mode=KiloMode.CODE,
        )
        session_manager._sessions["test-123"] = session
        
        result = session_manager.remove_session("test-123")
        assert result is True
        assert "test-123" not in session_manager._sessions
        
        result = session_manager.remove_session("nonexistent")
        assert result is False


class TestKiloDataClasses:
    """Tests for Kilo data classes."""
    
    def test_kilo_checkpoint_to_dict(self):
        """Test KiloCheckpoint serialization."""
        checkpoint = KiloCheckpoint(
            hash="abc123",
            timestamp=datetime(2024, 1, 1, 12, 0, 0),
            message="Test commit",
            is_auto_saved=True,
        )
        
        data = checkpoint.to_dict()
        assert data["hash"] == "abc123"
        assert data["message"] == "Test commit"
        assert data["is_auto_saved"] is True
    
    def test_kilo_task_to_dict(self):
        """Test KiloTask serialization."""
        task = KiloTask(
            task_id="task-123",
            description="Fix bug",
            timestamp=datetime(2024, 1, 1, 12, 0, 0),
            cost=0.05,
            tokens_used=500,
        )
        
        data = task.to_dict()
        assert data["task_id"] == "task-123"
        assert data["description"] == "Fix bug"
        assert data["cost"] == 0.05
    
    def test_kilo_result_to_dict(self):
        """Test KiloResult serialization."""
        result = KiloResult(
            success=True,
            exit_code=0,
            output="Done",
            duration_seconds=5.5,
            tokens_used=100,
            cost=0.01,
        )
        
        data = result.to_dict()
        assert data["success"] is True
        assert data["exit_code"] == 0
        assert data["duration_seconds"] == 5.5
    
    def test_kilo_session_to_dict(self):
        """Test KiloSession serialization."""
        session = KiloSession(
            session_id="session-123",
            workspace="/tmp/test",
            mode=KiloMode.CODE,
            status=KiloSessionStatus.RUNNING,
            timeout=300,
        )
        
        data = session.to_dict()
        assert data["session_id"] == "session-123"
        assert data["mode"] == "code"
        assert data["status"] == "running"


class TestGlobalInstance:
    """Tests for global instance management."""
    
    def test_get_kilo_session_manager(self):
        """Test getting global instance."""
        reset_kilo_session_manager()
        
        manager1 = get_kilo_session_manager()
        manager2 = get_kilo_session_manager()
        
        assert manager1 is manager2
    
    def test_get_kilo_session_manager_force_new(self):
        """Test forcing new instance."""
        reset_kilo_session_manager()
        
        manager1 = get_kilo_session_manager()
        manager2 = get_kilo_session_manager(force_new=True)
        
        assert manager1 is not manager2
    
    def test_reset_kilo_session_manager(self):
        """Test resetting global instance."""
        manager1 = get_kilo_session_manager()
        reset_kilo_session_manager()
        manager2 = get_kilo_session_manager()
        
        assert manager1 is not manager2
