"""
SmartSpec Pro - State Manager
Phase 0.3 - LangGraph Integration

Manages workflow execution state:
- Create and update execution state
- Track progress
- Manage steps
- Aggregate outputs
"""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
import structlog

from app.orchestrator.models import (
    ExecutionState,
    ExecutionStatus,
    WorkflowStep,
)

logger = structlog.get_logger()


class StateManager:
    """Manages workflow execution state"""
    
    def __init__(self):
        self.states: Dict[str, ExecutionState] = {}
        logger.info("State manager initialized")
    
    def create_execution(
        self,
        workflow_id: str,
        user_prompt: str,
        goal: str,
        project_path: Optional[str] = None,
        total_steps: int = 0
    ) -> ExecutionState:
        """
        Create a new execution state
        
        Args:
            workflow_id: Workflow ID
            user_prompt: User's original prompt
            goal: Execution goal
            project_path: Project directory path
            total_steps: Total number of steps
        
        Returns:
            ExecutionState object
        """
        execution_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        state = ExecutionState(
            execution_id=execution_id,
            workflow_id=workflow_id,
            status=ExecutionStatus.PENDING,
            created_at=now,
            updated_at=now,
            user_prompt=user_prompt,
            goal=goal,
            project_path=project_path,
            total_steps=total_steps
        )
        
        self.states[execution_id] = state
        
        logger.info(
            "Execution created",
            execution_id=execution_id,
            workflow_id=workflow_id,
            total_steps=total_steps
        )
        
        return state
    
    def get_state(self, execution_id: str) -> Optional[ExecutionState]:
        """Get execution state"""
        return self.states.get(execution_id)
    
    def update_status(self, execution_id: str, status: ExecutionStatus):
        """Update execution status"""
        state = self.states.get(execution_id)
        if not state:
            logger.warning("Execution not found", execution_id=execution_id)
            return
        
        state.status = status
        state.updated_at = datetime.utcnow()
        
        if status == ExecutionStatus.RUNNING and not state.started_at:
            state.started_at = datetime.utcnow()
        elif status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED]:
            state.completed_at = datetime.utcnow()
            if state.started_at:
                state.total_duration_seconds = (state.completed_at - state.started_at).total_seconds()
        
        logger.info("Execution status updated", execution_id=execution_id, status=status)
    
    def add_step(
        self,
        execution_id: str,
        step_id: str,
        name: str,
        description: str
    ) -> Optional[WorkflowStep]:
        """Add a new step to execution"""
        state = self.states.get(execution_id)
        if not state:
            logger.warning("Execution not found", execution_id=execution_id)
            return None
        
        step = WorkflowStep(
            id=step_id,
            name=name,
            description=description,
            status=ExecutionStatus.PENDING
        )
        
        state.steps.append(step)
        state.updated_at = datetime.utcnow()
        
        logger.debug("Step added", execution_id=execution_id, step_id=step_id, name=name)
        
        return step
    
    def update_step_status(
        self,
        execution_id: str,
        step_id: str,
        status: ExecutionStatus,
        output: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_cost: Optional[float] = None,
        tokens_used: Optional[int] = None
    ):
        """Update step status"""
        state = self.states.get(execution_id)
        if not state:
            logger.warning("Execution not found", execution_id=execution_id)
            return
        
        # Find step
        step = next((s for s in state.steps if s.id == step_id), None)
        if not step:
            logger.warning("Step not found", execution_id=execution_id, step_id=step_id)
            return
        
        step.status = status
        
        if status == ExecutionStatus.RUNNING and not step.started_at:
            step.started_at = datetime.utcnow()
            state.current_step_id = step_id
        elif status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED]:
            step.completed_at = datetime.utcnow()
            if step.started_at:
                step.duration_seconds = (step.completed_at - step.started_at).total_seconds()
            
            if status == ExecutionStatus.COMPLETED:
                state.completed_steps += 1
        
        if output:
            step.output = output
        
        if error:
            step.error = error
        
        if llm_provider:
            step.llm_provider = llm_provider
        
        if llm_model:
            step.llm_model = llm_model
        
        if llm_cost is not None:
            step.llm_cost = llm_cost
            state.total_cost += llm_cost
        
        if tokens_used is not None:
            step.tokens_used = tokens_used
            state.total_tokens_used += tokens_used
        
        # Update progress
        if state.total_steps > 0:
            state.progress_percentage = (state.completed_steps / state.total_steps) * 100
        
        state.updated_at = datetime.utcnow()
        
        logger.info(
            "Step status updated",
            execution_id=execution_id,
            step_id=step_id,
            status=status,
            progress=f"{state.progress_percentage:.1f}%"
        )
    
    def add_aggregate_output(self, execution_id: str, key: str, value: Any):
        """Add data to aggregate output"""
        state = self.states.get(execution_id)
        if not state:
            logger.warning("Execution not found", execution_id=execution_id)
            return
        
        state.aggregate_output[key] = value
        state.updated_at = datetime.utcnow()
        
        logger.debug("Aggregate output added", execution_id=execution_id, key=key)
    
    def add_file_created(self, execution_id: str, file_path: str):
        """Track file creation"""
        state = self.states.get(execution_id)
        if not state:
            return
        
        if file_path not in state.files_created:
            state.files_created.append(file_path)
            state.updated_at = datetime.utcnow()
    
    def add_file_modified(self, execution_id: str, file_path: str):
        """Track file modification"""
        state = self.states.get(execution_id)
        if not state:
            return
        
        if file_path not in state.files_modified:
            state.files_modified.append(file_path)
            state.updated_at = datetime.utcnow()
    
    def add_file_deleted(self, execution_id: str, file_path: str):
        """Track file deletion"""
        state = self.states.get(execution_id)
        if not state:
            return
        
        if file_path not in state.files_deleted:
            state.files_deleted.append(file_path)
            state.updated_at = datetime.utcnow()
    
    def set_error(self, execution_id: str, error: str):
        """Set execution error"""
        state = self.states.get(execution_id)
        if not state:
            return
        
        state.error = error
        state.status = ExecutionStatus.FAILED
        state.updated_at = datetime.utcnow()
        
        logger.error("Execution error set", execution_id=execution_id, error=error)
    
    def increment_retry(self, execution_id: str) -> int:
        """Increment retry count"""
        state = self.states.get(execution_id)
        if not state:
            return 0
        
        state.retry_count += 1
        state.updated_at = datetime.utcnow()
        
        logger.info("Retry count incremented", execution_id=execution_id, retry_count=state.retry_count)
        
        return state.retry_count
    
    def set_checkpoint(self, execution_id: str, checkpoint_id: str):
        """Set last checkpoint ID"""
        state = self.states.get(execution_id)
        if not state:
            return
        
        state.last_checkpoint_id = checkpoint_id
        state.checkpoint_count += 1
        state.updated_at = datetime.utcnow()
        
        logger.debug("Checkpoint set", execution_id=execution_id, checkpoint_id=checkpoint_id)
    
    def list_executions(self, status: Optional[ExecutionStatus] = None) -> List[ExecutionState]:
        """List all executions, optionally filtered by status"""
        executions = list(self.states.values())
        
        if status:
            executions = [e for e in executions if e.status == status]
        
        # Sort by creation time (newest first)
        executions.sort(key=lambda e: e.created_at, reverse=True)
        
        return executions
    
    def delete_execution(self, execution_id: str) -> bool:
        """Delete an execution state"""
        if execution_id in self.states:
            del self.states[execution_id]
            logger.info("Execution deleted", execution_id=execution_id)
            return True
        return False
    
    def cleanup_old_executions(self, days: int = 7) -> int:
        """Clean up executions older than specified days"""
        from datetime import timedelta
        
        cutoff_time = datetime.utcnow() - timedelta(days=days)
        count = 0
        
        execution_ids_to_delete = []
        for execution_id, state in self.states.items():
            if state.created_at < cutoff_time:
                execution_ids_to_delete.append(execution_id)
        
        for execution_id in execution_ids_to_delete:
            del self.states[execution_id]
            count += 1
        
        logger.info("Old executions cleaned up", count=count, days=days)
        return count


# Global state manager instance
state_manager = StateManager()
