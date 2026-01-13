"""
SmartSpec Pro - Handoff Protocol
Phase 1.5: Kilo ↔ OpenCode Handoff

Protocol for handing off tasks between Kilo (Macro) and OpenCode (Micro).
Implements the "One Brain, Two Hands" architecture.

Flow:
1. Supervisor decides to use Kilo or OpenCode
2. Kilo generates spec.md, plan.md, tasks.md
3. Handoff Protocol parses tasks and sends to OpenCode
4. OpenCode implements each task
5. Results are synced back to Kilo for checkpoint
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Callable, Awaitable
from uuid import uuid4

import structlog

from app.orchestrator.agents.kilo_adapter import (
    KiloAdapter,
    KiloExecutionRequest,
    KiloExecutionResult,
)
from app.orchestrator.agents.opencode_adapter import (
    OpenCodeAdapter,
    OpenCodeExecutionRequest,
    OpenCodeExecutionResult,
)
from app.orchestrator.agents.token_budget_controller import (
    TokenBudgetController,
    BudgetAllocation,
    BudgetScope,
)
from app.templates.template_manager import (
    TemplateManager,
    ParsedTask,
    MacroOutput,
)
from app.services.kilo_session_manager import KiloMode

logger = structlog.get_logger()


# ==================== ENUMS ====================

class HandoffStatus(str, Enum):
    """Status of a handoff operation."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class HandoffDirection(str, Enum):
    """Direction of handoff."""
    KILO_TO_OPENCODE = "kilo_to_opencode"
    OPENCODE_TO_KILO = "opencode_to_kilo"


class TaskExecutionStatus(str, Enum):
    """Status of individual task execution."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


# ==================== DATA CLASSES ====================

@dataclass
class TaskExecution:
    """Represents execution of a single task."""
    execution_id: str = field(default_factory=lambda: str(uuid4()))
    task: ParsedTask = None
    status: TaskExecutionStatus = TaskExecutionStatus.PENDING
    result: Optional[OpenCodeExecutionResult] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    retry_count: int = 0
    
    @property
    def duration_ms(self) -> int:
        if self.started_at and self.completed_at:
            return int((self.completed_at - self.started_at).total_seconds() * 1000)
        return 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "task_id": self.task.task_id if self.task else None,
            "task_title": self.task.title if self.task else None,
            "status": self.status.value,
            "result": self.result.to_dict() if self.result else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_ms": self.duration_ms,
            "error": self.error,
            "retry_count": self.retry_count,
        }


@dataclass
class HandoffSession:
    """Represents a complete handoff session."""
    session_id: str = field(default_factory=lambda: str(uuid4()))
    workflow_id: str = ""
    project_id: str = ""
    user_id: str = ""
    direction: HandoffDirection = HandoffDirection.KILO_TO_OPENCODE
    status: HandoffStatus = HandoffStatus.PENDING
    
    # Kilo output
    kilo_result: Optional[KiloExecutionResult] = None
    macro_output: Optional[MacroOutput] = None
    
    # Task executions
    task_executions: List[TaskExecution] = field(default_factory=list)
    
    # Budget
    budget_allocation_id: Optional[str] = None
    
    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Callbacks
    on_task_complete: Optional[Callable[[TaskExecution], Awaitable[None]]] = None
    on_progress: Optional[Callable[[float, str], Awaitable[None]]] = None
    
    @property
    def total_tasks(self) -> int:
        return len(self.task_executions)
    
    @property
    def completed_tasks(self) -> int:
        return sum(1 for t in self.task_executions if t.status == TaskExecutionStatus.COMPLETED)
    
    @property
    def failed_tasks(self) -> int:
        return sum(1 for t in self.task_executions if t.status == TaskExecutionStatus.FAILED)
    
    @property
    def progress(self) -> float:
        if self.total_tasks == 0:
            return 0.0
        return (self.completed_tasks / self.total_tasks) * 100
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "workflow_id": self.workflow_id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "direction": self.direction.value,
            "status": self.status.value,
            "total_tasks": self.total_tasks,
            "completed_tasks": self.completed_tasks,
            "failed_tasks": self.failed_tasks,
            "progress": self.progress,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "task_executions": [t.to_dict() for t in self.task_executions],
        }


# ==================== HANDOFF PROTOCOL ====================

class HandoffProtocol:
    """
    Handoff Protocol for Kilo ↔ OpenCode communication.
    
    Implements the "One Brain, Two Hands" architecture:
    - Kilo (Macro-hand): Generates specs, plans, and task breakdowns
    - OpenCode (Micro-hand): Implements individual tasks
    
    The protocol manages:
    1. Task parsing and ordering
    2. Sequential/parallel execution
    3. Result aggregation
    4. Checkpoint synchronization
    """
    
    # Configuration
    MAX_RETRIES = 2
    MAX_PARALLEL_TASKS = 3
    
    def __init__(
        self,
        kilo_adapter: Optional[KiloAdapter] = None,
        opencode_adapter: Optional[OpenCodeAdapter] = None,
        template_manager: Optional[TemplateManager] = None,
        budget_controller: Optional[TokenBudgetController] = None,
    ):
        """Initialize the Handoff Protocol."""
        self.kilo_adapter = kilo_adapter or KiloAdapter()
        self.opencode_adapter = opencode_adapter or OpenCodeAdapter()
        self.template_manager = template_manager or TemplateManager()
        self.budget_controller = budget_controller or TokenBudgetController()
        
        # Active sessions
        self._sessions: Dict[str, HandoffSession] = {}
        
        logger.info("handoff_protocol_initialized")
    
    async def execute_macro_to_micro(
        self,
        workflow_id: str,
        project_id: str,
        user_id: str,
        prompt: str,
        context: Optional[Dict[str, Any]] = None,
        on_task_complete: Optional[Callable[[TaskExecution], Awaitable[None]]] = None,
        on_progress: Optional[Callable[[float, str], Awaitable[None]]] = None,
    ) -> HandoffSession:
        """
        Execute a complete Macro → Micro handoff.
        
        Steps:
        1. Send prompt to Kilo (Architect mode)
        2. Parse output into tasks
        3. Execute tasks in OpenCode
        4. Sync results back to Kilo
        
        Args:
            workflow_id: Workflow identifier
            project_id: Project identifier
            user_id: User identifier
            prompt: The user's request
            context: Additional context
            on_task_complete: Callback for task completion
            on_progress: Callback for progress updates
            
        Returns:
            HandoffSession with results
        """
        session = HandoffSession(
            workflow_id=workflow_id,
            project_id=project_id,
            user_id=user_id,
            direction=HandoffDirection.KILO_TO_OPENCODE,
            on_task_complete=on_task_complete,
            on_progress=on_progress,
        )
        
        self._sessions[session.session_id] = session
        session.started_at = datetime.utcnow()
        session.status = HandoffStatus.IN_PROGRESS
        
        try:
            # Step 1: Create budget allocation
            budget = await self.budget_controller.create_allocation(
                scope=BudgetScope.WORKFLOW,
                scope_id=workflow_id,
            )
            session.budget_allocation_id = budget.allocation_id
            
            await self._report_progress(session, 5, "Creating implementation plan...")
            
            # Step 2: Execute Kilo (Architect mode)
            kilo_result = await self._execute_kilo_architect(session, prompt, context)
            session.kilo_result = kilo_result
            
            if not kilo_result.success:
                session.status = HandoffStatus.FAILED
                return session
            
            await self._report_progress(session, 20, "Parsing tasks...")
            
            # Step 3: Parse Kilo output
            macro_output = self.template_manager.parse_kilo_output(
                output=kilo_result.output,
                feature_name=self._extract_feature_name(prompt),
            )
            session.macro_output = macro_output
            
            # Step 4: Get tasks for OpenCode
            tasks = self.template_manager.get_tasks_for_opencode(
                parsed_tasks=macro_output.parsed_tasks,
                priority_filter=["P0", "P1"],  # Only high priority tasks
            )
            
            # Order by dependencies
            ordered_tasks = self.template_manager.order_tasks_by_dependencies(tasks)
            
            # Create task executions
            session.task_executions = [
                TaskExecution(task=task)
                for task in ordered_tasks
            ]
            
            await self._report_progress(session, 25, f"Executing {len(ordered_tasks)} tasks...")
            
            # Step 5: Execute tasks in OpenCode
            await self._execute_tasks(session)
            
            # Step 6: Sync results back to Kilo
            await self._sync_to_kilo(session)
            
            # Mark complete
            session.completed_at = datetime.utcnow()
            session.status = HandoffStatus.COMPLETED
            
            await self._report_progress(session, 100, "Handoff complete")
            
            logger.info(
                "handoff_completed",
                session_id=session.session_id,
                total_tasks=session.total_tasks,
                completed_tasks=session.completed_tasks,
                failed_tasks=session.failed_tasks,
            )
            
            return session
            
        except Exception as e:
            session.status = HandoffStatus.FAILED
            session.completed_at = datetime.utcnow()
            logger.error("handoff_failed", session_id=session.session_id, error=str(e))
            raise
    
    async def _execute_kilo_architect(
        self,
        session: HandoffSession,
        prompt: str,
        context: Optional[Dict[str, Any]],
    ) -> KiloExecutionResult:
        """Execute Kilo in Architect mode to generate spec/plan/tasks."""
        request = KiloExecutionRequest(
            project_id=session.project_id,
            user_id=session.user_id,
            prompt=prompt,
            mode=KiloMode.ARCHITECT,
            context=context or {},
        )
        
        result = await self.kilo_adapter.execute(request)
        
        # Record usage
        if session.budget_allocation_id:
            await self.budget_controller.record_usage(
                allocation_id=session.budget_allocation_id,
                model="claude-3.5-sonnet",  # Kilo default
                input_tokens=result.tokens_used // 2,  # Approximate split
                output_tokens=result.tokens_used // 2,
                workflow_id=session.workflow_id,
                stage_id="kilo_architect",
            )
        
        return result
    
    async def _execute_tasks(self, session: HandoffSession):
        """Execute all tasks in OpenCode."""
        total_tasks = len(session.task_executions)
        
        for i, task_exec in enumerate(session.task_executions):
            # Check dependencies
            if not self._dependencies_met(task_exec, session.task_executions):
                task_exec.status = TaskExecutionStatus.SKIPPED
                task_exec.error = "Dependencies not met"
                continue
            
            # Execute task
            await self._execute_single_task(session, task_exec)
            
            # Report progress
            progress = 25 + (70 * (i + 1) / total_tasks)
            await self._report_progress(
                session,
                progress,
                f"Completed task {i + 1}/{total_tasks}: {task_exec.task.title}",
            )
            
            # Callback
            if session.on_task_complete:
                await session.on_task_complete(task_exec)
    
    async def _execute_single_task(
        self,
        session: HandoffSession,
        task_exec: TaskExecution,
    ):
        """Execute a single task in OpenCode."""
        task_exec.status = TaskExecutionStatus.RUNNING
        task_exec.started_at = datetime.utcnow()
        
        try:
            # Build OpenCode request
            request = OpenCodeExecutionRequest(
                project_id=session.project_id,
                user_id=session.user_id,
                prompt=task_exec.task.to_prompt(),
                files=task_exec.task.files_to_modify + task_exec.task.files_to_create,
                context={
                    "task_id": task_exec.task.task_id,
                    "priority": task_exec.task.priority,
                },
            )
            
            # Execute with retries
            result = None
            for attempt in range(self.MAX_RETRIES + 1):
                result = await self.opencode_adapter.execute(request)
                
                if result.success:
                    break
                
                task_exec.retry_count = attempt + 1
                logger.warning(
                    "task_retry",
                    task_id=task_exec.task.task_id,
                    attempt=attempt + 1,
                    error=result.error,
                )
            
            task_exec.result = result
            task_exec.completed_at = datetime.utcnow()
            
            if result.success:
                task_exec.status = TaskExecutionStatus.COMPLETED
            else:
                task_exec.status = TaskExecutionStatus.FAILED
                task_exec.error = result.error
            
            # Record usage
            if session.budget_allocation_id and result:
                await self.budget_controller.record_usage(
                    allocation_id=session.budget_allocation_id,
                    model="claude-3.5-sonnet",
                    input_tokens=result.tokens_used // 2,
                    output_tokens=result.tokens_used // 2,
                    workflow_id=session.workflow_id,
                    stage_id="opencode",
                    task_id=task_exec.task.task_id,
                )
                
        except Exception as e:
            task_exec.status = TaskExecutionStatus.FAILED
            task_exec.error = str(e)
            task_exec.completed_at = datetime.utcnow()
            logger.error(
                "task_execution_error",
                task_id=task_exec.task.task_id,
                error=str(e),
            )
    
    def _dependencies_met(
        self,
        task_exec: TaskExecution,
        all_executions: List[TaskExecution],
    ) -> bool:
        """Check if all dependencies for a task are met."""
        if not task_exec.task.dependencies:
            return True
        
        for dep in task_exec.task.dependencies:
            dep_id = dep.replace("Task ", "").replace("Epic ", "").strip()
            
            # Find the dependency execution
            dep_exec = next(
                (e for e in all_executions if e.task.task_id == dep_id),
                None,
            )
            
            if dep_exec and dep_exec.status != TaskExecutionStatus.COMPLETED:
                return False
        
        return True
    
    async def _sync_to_kilo(self, session: HandoffSession):
        """Sync results back to Kilo for checkpoint."""
        # Build summary of completed tasks
        completed_files = []
        for task_exec in session.task_executions:
            if task_exec.status == TaskExecutionStatus.COMPLETED and task_exec.result:
                completed_files.extend(task_exec.result.files_created)
                completed_files.extend(task_exec.result.files_modified)
        
        # Create sync request
        sync_prompt = f"""
## Implementation Summary

The following tasks have been completed:

{self._format_task_summary(session)}

### Files Modified
{chr(10).join(f"- {f}" for f in set(completed_files)) if completed_files else "None"}

Please create a checkpoint for this implementation.
"""
        
        request = KiloExecutionRequest(
            project_id=session.project_id,
            user_id=session.user_id,
            prompt=sync_prompt,
            mode=KiloMode.ORCHESTRATOR,
            context={"action": "checkpoint"},
        )
        
        await self.kilo_adapter.execute(request)
    
    def _format_task_summary(self, session: HandoffSession) -> str:
        """Format task execution summary."""
        lines = []
        for task_exec in session.task_executions:
            status_emoji = {
                TaskExecutionStatus.COMPLETED: "✅",
                TaskExecutionStatus.FAILED: "❌",
                TaskExecutionStatus.SKIPPED: "⏭️",
                TaskExecutionStatus.PENDING: "⏳",
                TaskExecutionStatus.RUNNING: "🔄",
            }.get(task_exec.status, "❓")
            
            lines.append(f"{status_emoji} Task {task_exec.task.task_id}: {task_exec.task.title}")
        
        return "\n".join(lines)
    
    def _extract_feature_name(self, prompt: str) -> str:
        """Extract feature name from prompt."""
        # Simple extraction - take first line or first 50 chars
        first_line = prompt.split("\n")[0].strip()
        if len(first_line) > 50:
            return first_line[:47] + "..."
        return first_line
    
    async def _report_progress(
        self,
        session: HandoffSession,
        progress: float,
        message: str,
    ):
        """Report progress via callback."""
        if session.on_progress:
            await session.on_progress(progress, message)
        
        logger.debug(
            "handoff_progress",
            session_id=session.session_id,
            progress=progress,
            message=message,
        )
    
    async def get_session(self, session_id: str) -> Optional[HandoffSession]:
        """Get a handoff session by ID."""
        return self._sessions.get(session_id)
    
    async def cancel_session(self, session_id: str) -> bool:
        """Cancel a handoff session."""
        session = self._sessions.get(session_id)
        if not session:
            return False
        
        session.status = HandoffStatus.CANCELLED
        session.completed_at = datetime.utcnow()
        
        logger.info("handoff_cancelled", session_id=session_id)
        return True
    
    async def cleanup(self):
        """Cleanup resources."""
        await self.kilo_adapter.cleanup()
        await self.opencode_adapter.cleanup()
        self._sessions.clear()
        
        logger.info("handoff_protocol_cleanup_complete")
