"""
Unit Tests for Handoff Protocol
Phase 1: Core Loop Implementation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.orchestrator.agents.handoff_protocol import (
    HandoffProtocol,
    HandoffSession,
    HandoffStatus,
    HandoffDirection,
    TaskExecution,
    TaskExecutionStatus,
)
from app.orchestrator.agents.kilo_adapter import KiloExecutionResult
from app.orchestrator.agents.opencode_adapter import OpenCodeExecutionResult
from app.templates.template_manager import ParsedTask


class TestTaskExecution:
    """Test suite for TaskExecution dataclass."""
    
    def test_duration_calculation(self):
        """Test duration calculation."""
        task_exec = TaskExecution(
            task=ParsedTask(task_id="1.1", title="Test Task", priority="P0", effort="S", assignee="OpenCode"),
            started_at=datetime(2024, 1, 1, 10, 0, 0),
            completed_at=datetime(2024, 1, 1, 10, 0, 5),
        )
        
        assert task_exec.duration_ms == 5000
    
    def test_duration_without_completion(self):
        """Test duration when not completed."""
        task_exec = TaskExecution(
            task=ParsedTask(task_id="1.1", title="Test Task", priority="P0", effort="S", assignee="OpenCode"),
            started_at=datetime(2024, 1, 1, 10, 0, 0),
        )
        
        assert task_exec.duration_ms == 0
    
    def test_to_dict(self):
        """Test converting to dictionary."""
        task_exec = TaskExecution(
            task=ParsedTask(task_id="1.1", title="Test Task", priority="P0", effort="S", assignee="OpenCode"),
            status=TaskExecutionStatus.COMPLETED,
        )
        
        result = task_exec.to_dict()
        
        assert result["task_id"] == "1.1"
        assert result["task_title"] == "Test Task"
        assert result["status"] == "completed"


class TestHandoffSession:
    """Test suite for HandoffSession dataclass."""
    
    def test_progress_calculation(self):
        """Test progress calculation."""
        session = HandoffSession()
        session.task_executions = [
            TaskExecution(
                task=ParsedTask(task_id="1.1", title="Task 1", priority="P0", effort="S", assignee="OpenCode"),
                status=TaskExecutionStatus.COMPLETED,
            ),
            TaskExecution(
                task=ParsedTask(task_id="1.2", title="Task 2", priority="P0", effort="S", assignee="OpenCode"),
                status=TaskExecutionStatus.COMPLETED,
            ),
            TaskExecution(
                task=ParsedTask(task_id="1.3", title="Task 3", priority="P1", effort="M", assignee="OpenCode"),
                status=TaskExecutionStatus.PENDING,
            ),
            TaskExecution(
                task=ParsedTask(task_id="1.4", title="Task 4", priority="P1", effort="M", assignee="OpenCode"),
                status=TaskExecutionStatus.FAILED,
            ),
        ]
        
        assert session.total_tasks == 4
        assert session.completed_tasks == 2
        assert session.failed_tasks == 1
        assert session.progress == 50.0
    
    def test_progress_empty(self):
        """Test progress with no tasks."""
        session = HandoffSession()
        assert session.progress == 0.0
    
    def test_to_dict(self):
        """Test converting to dictionary."""
        session = HandoffSession(
            workflow_id="wf-123",
            project_id="proj-456",
            status=HandoffStatus.IN_PROGRESS,
        )
        
        result = session.to_dict()
        
        assert result["workflow_id"] == "wf-123"
        assert result["project_id"] == "proj-456"
        assert result["status"] == "in_progress"


class TestHandoffProtocol:
    """Test suite for HandoffProtocol."""
    
    @pytest.fixture
    def mock_kilo_adapter(self):
        """Create a mock Kilo adapter."""
        adapter = MagicMock()
        adapter.execute = AsyncMock(return_value=KiloExecutionResult(
            request_id="req-1",
            session_id="sess-1",
            success=True,
            output="""
## spec.md
# Feature: Test Feature

## plan.md
# Implementation Plan

## tasks.md
# Tasks

#### Task 1.1: Create service

- **Priority:** P0
- **Effort:** S (1-2 hours)
- **Assignee:** OpenCode
- **Dependencies:** None
- **Files:**
  - Create: `app/services/test_service.py`

**Description:**
Create the test service.

**Acceptance Criteria:**
- [ ] Service is created
- [ ] Tests pass

---

#### Task 1.2: Add endpoint

- **Priority:** P0
- **Effort:** S (1-2 hours)
- **Assignee:** OpenCode
- **Dependencies:** Task 1.1
- **Files:**
  - Create: `app/api/test_endpoint.py`

**Description:**
Add the API endpoint.

**Acceptance Criteria:**
- [ ] Endpoint works
""",
            tokens_used=1000,
        ))
        adapter.cleanup = AsyncMock()
        return adapter
    
    @pytest.fixture
    def mock_opencode_adapter(self):
        """Create a mock OpenCode adapter."""
        adapter = MagicMock()
        adapter.execute = AsyncMock(return_value=OpenCodeExecutionResult(
            request_id="req-1",
            success=True,
            output="Task completed successfully",
            files_created=["app/services/test_service.py"],
            tokens_used=500,
        ))
        adapter.cleanup = AsyncMock()
        return adapter
    
    @pytest.fixture
    def mock_budget_controller(self):
        """Create a mock budget controller."""
        from app.orchestrator.agents.budget_controller import BudgetAllocation, BudgetScope
        
        controller = MagicMock()
        controller.create_allocation = AsyncMock(return_value=BudgetAllocation(
            scope=BudgetScope.WORKFLOW,
            scope_id="wf-1",
        ))
        controller.record_usage = AsyncMock()
        return controller
    
    @pytest.fixture
    def protocol(self, mock_kilo_adapter, mock_opencode_adapter, mock_budget_controller):
        """Create a HandoffProtocol instance for testing."""
        return HandoffProtocol(
            kilo_adapter=mock_kilo_adapter,
            opencode_adapter=mock_opencode_adapter,
            budget_controller=mock_budget_controller,
        )
    
    # ==================== Execution Tests ====================
    
    @pytest.mark.asyncio
    async def test_execute_macro_to_micro_success(self, protocol):
        """Test successful macro to micro handoff."""
        session = await protocol.execute_macro_to_micro(
            workflow_id="wf-1",
            project_id="proj-1",
            user_id="user-1",
            prompt="Create a test feature",
        )
        
        assert session.status == HandoffStatus.COMPLETED
        assert session.total_tasks > 0
        assert session.completed_tasks > 0
    
    @pytest.mark.asyncio
    async def test_execute_with_callbacks(self, protocol):
        """Test execution with progress callbacks."""
        progress_updates = []
        task_completions = []
        
        async def on_progress(progress, message):
            progress_updates.append((progress, message))
        
        async def on_task_complete(task_exec):
            task_completions.append(task_exec)
        
        session = await protocol.execute_macro_to_micro(
            workflow_id="wf-1",
            project_id="proj-1",
            user_id="user-1",
            prompt="Create a test feature",
            on_progress=on_progress,
            on_task_complete=on_task_complete,
        )
        
        assert len(progress_updates) > 0
        assert progress_updates[-1][0] == 100  # Final progress is 100%
    
    @pytest.mark.asyncio
    async def test_execute_kilo_failure(self, protocol, mock_kilo_adapter):
        """Test handling of Kilo failure."""
        mock_kilo_adapter.execute = AsyncMock(return_value=KiloExecutionResult(
            request_id="req-1",
            session_id="sess-1",
            success=False,
            error="Kilo execution failed",
        ))
        
        session = await protocol.execute_macro_to_micro(
            workflow_id="wf-1",
            project_id="proj-1",
            user_id="user-1",
            prompt="Create a test feature",
        )
        
        assert session.status == HandoffStatus.FAILED
    
    # ==================== Session Management Tests ====================
    
    @pytest.mark.asyncio
    async def test_get_session(self, protocol):
        """Test getting a session by ID."""
        session = await protocol.execute_macro_to_micro(
            workflow_id="wf-1",
            project_id="proj-1",
            user_id="user-1",
            prompt="Create a test feature",
        )
        
        retrieved = await protocol.get_session(session.session_id)
        
        assert retrieved is not None
        assert retrieved.session_id == session.session_id
    
    @pytest.mark.asyncio
    async def test_cancel_session(self, protocol):
        """Test cancelling a session."""
        session = await protocol.execute_macro_to_micro(
            workflow_id="wf-1",
            project_id="proj-1",
            user_id="user-1",
            prompt="Create a test feature",
        )
        
        result = await protocol.cancel_session(session.session_id)
        
        # Session was already completed, so cancel may not change status
        assert result is True
    
    # ==================== Cleanup Tests ====================
    
    @pytest.mark.asyncio
    async def test_cleanup(self, protocol, mock_kilo_adapter, mock_opencode_adapter):
        """Test cleanup of resources."""
        await protocol.cleanup()
        
        mock_kilo_adapter.cleanup.assert_called_once()
        mock_opencode_adapter.cleanup.assert_called_once()


class TestDependencyHandling:
    """Test suite for dependency handling in handoff."""
    
    @pytest.fixture
    def protocol(self):
        """Create a HandoffProtocol with mocked adapters."""
        kilo_adapter = MagicMock()
        kilo_adapter.execute = AsyncMock()
        kilo_adapter.cleanup = AsyncMock()
        
        opencode_adapter = MagicMock()
        opencode_adapter.execute = AsyncMock(return_value=OpenCodeExecutionResult(
            request_id="req-1",
            success=True,
            output="Done",
        ))
        opencode_adapter.cleanup = AsyncMock()
        
        budget_controller = MagicMock()
        budget_controller.create_allocation = AsyncMock()
        budget_controller.record_usage = AsyncMock()
        
        return HandoffProtocol(
            kilo_adapter=kilo_adapter,
            opencode_adapter=opencode_adapter,
            budget_controller=budget_controller,
        )
    
    def test_dependencies_met_no_deps(self, protocol):
        """Test dependencies_met when task has no dependencies."""
        task_exec = TaskExecution(
            task=ParsedTask(
                task_id="1.1",
                title="Task 1",
                priority="P0",
                effort="S",
                assignee="OpenCode",
                dependencies=[],
            ),
        )
        
        result = protocol._dependencies_met(task_exec, [])
        assert result is True
    
    def test_dependencies_met_with_completed_dep(self, protocol):
        """Test dependencies_met when dependency is completed."""
        dep_exec = TaskExecution(
            task=ParsedTask(
                task_id="1.1",
                title="Dependency Task",
                priority="P0",
                effort="S",
                assignee="OpenCode",
            ),
            status=TaskExecutionStatus.COMPLETED,
        )
        
        task_exec = TaskExecution(
            task=ParsedTask(
                task_id="1.2",
                title="Dependent Task",
                priority="P0",
                effort="S",
                assignee="OpenCode",
                dependencies=["Task 1.1"],
            ),
        )
        
        result = protocol._dependencies_met(task_exec, [dep_exec, task_exec])
        assert result is True
    
    def test_dependencies_not_met(self, protocol):
        """Test dependencies_met when dependency is not completed."""
        dep_exec = TaskExecution(
            task=ParsedTask(
                task_id="1.1",
                title="Dependency Task",
                priority="P0",
                effort="S",
                assignee="OpenCode",
            ),
            status=TaskExecutionStatus.PENDING,
        )
        
        task_exec = TaskExecution(
            task=ParsedTask(
                task_id="1.2",
                title="Dependent Task",
                priority="P0",
                effort="S",
                assignee="OpenCode",
                dependencies=["Task 1.1"],
            ),
        )
        
        result = protocol._dependencies_met(task_exec, [dep_exec, task_exec])
        assert result is False
