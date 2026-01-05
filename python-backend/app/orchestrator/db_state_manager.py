"""
SmartSpec Pro - Database State Manager
Phase 0 - Critical Gap Fix #2

State manager that persists to PostgreSQL database
"""

from typing import Optional, List
from datetime import datetime
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.execution import ExecutionModel, CheckpointModel, ExecutionStatus
from app.orchestrator.models import ExecutionState, WorkflowStep

logger = structlog.get_logger()


class DatabaseStateManager:
    """State manager with database persistence"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_execution(
        self,
        execution_id: str,
        workflow_id: str,
        steps: List[WorkflowStep]
    ) -> ExecutionState:
        """Create new execution in database"""
        
        execution = ExecutionModel(
            id=execution_id,
            workflow_id=workflow_id,
            status=ExecutionStatus.PENDING,
            steps=[step.dict() for step in steps],
            total_steps=len(steps),
            current_step=0,
            created_at=datetime.utcnow()
        )
        
        self.db.add(execution)
        await self.db.commit()
        await self.db.refresh(execution)
        
        logger.info(
            "Execution created in database",
            execution_id=execution_id,
            workflow_id=workflow_id,
            total_steps=len(steps)
        )
        
        return self._model_to_state(execution)
    
    async def get_execution(self, execution_id: str) -> Optional[ExecutionState]:
        """Get execution from database"""
        
        result = await self.db.execute(
            select(ExecutionModel).where(ExecutionModel.id == execution_id)
        )
        execution = result.scalar_one_or_none()
        
        if not execution:
            return None
        
        return self._model_to_state(execution)
    
    async def update_execution(
        self,
        execution_id: str,
        **updates
    ) -> Optional[ExecutionState]:
        """Update execution in database"""
        
        # Convert enum if needed
        if "status" in updates and isinstance(updates["status"], str):
            updates["status"] = ExecutionStatus(updates["status"])
        
        updates["updated_at"] = datetime.utcnow()
        
        await self.db.execute(
            update(ExecutionModel)
            .where(ExecutionModel.id == execution_id)
            .values(**updates)
        )
        await self.db.commit()
        
        return await self.get_execution(execution_id)
    
    async def list_executions(
        self,
        workflow_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[ExecutionState]:
        """List executions from database"""
        
        query = select(ExecutionModel)
        
        if workflow_id:
            query = query.where(ExecutionModel.workflow_id == workflow_id)
        
        if status:
            query = query.where(ExecutionModel.status == ExecutionStatus(status))
        
        query = query.order_by(ExecutionModel.created_at.desc()).limit(limit)
        
        result = await self.db.execute(query)
        executions = result.scalars().all()
        
        return [self._model_to_state(execution) for execution in executions]
    
    async def delete_execution(self, execution_id: str) -> bool:
        """Delete execution from database"""
        
        result = await self.db.execute(
            select(ExecutionModel).where(ExecutionModel.id == execution_id)
        )
        execution = result.scalar_one_or_none()
        
        if not execution:
            return False
        
        await self.db.delete(execution)
        await self.db.commit()
        
        logger.info("Execution deleted from database", execution_id=execution_id)
        return True
    
    async def create_checkpoint(
        self,
        execution_id: str,
        step_number: int,
        step_name: str,
        state: dict,
        tokens_used: int = 0,
        cost: float = 0.0
    ) -> CheckpointModel:
        """Create checkpoint in database"""
        
        checkpoint = CheckpointModel(
            execution_id=execution_id,
            step_number=step_number,
            step_name=step_name,
            state=state,
            tokens_used=tokens_used,
            cost=cost,
            created_at=datetime.utcnow()
        )
        
        self.db.add(checkpoint)
        await self.db.commit()
        await self.db.refresh(checkpoint)
        
        logger.info(
            "Checkpoint created in database",
            execution_id=execution_id,
            checkpoint_id=checkpoint.id,
            step_number=step_number
        )
        
        return checkpoint
    
    async def get_checkpoint(self, checkpoint_id: str) -> Optional[CheckpointModel]:
        """Get checkpoint from database"""
        
        result = await self.db.execute(
            select(CheckpointModel).where(CheckpointModel.id == checkpoint_id)
        )
        return result.scalar_one_or_none()
    
    async def list_checkpoints(
        self,
        execution_id: str
    ) -> List[CheckpointModel]:
        """List checkpoints for execution"""
        
        result = await self.db.execute(
            select(CheckpointModel)
            .where(CheckpointModel.execution_id == execution_id)
            .order_by(CheckpointModel.step_number.asc())
        )
        return list(result.scalars().all())
    
    async def delete_old_checkpoints(
        self,
        execution_id: str,
        keep_last_n: int = 10
    ) -> int:
        """Delete old checkpoints, keep only last N"""
        
        checkpoints = await self.list_checkpoints(execution_id)
        
        if len(checkpoints) <= keep_last_n:
            return 0
        
        to_delete = checkpoints[:-keep_last_n]
        
        for checkpoint in to_delete:
            await self.db.delete(checkpoint)
        
        await self.db.commit()
        
        logger.info(
            "Old checkpoints deleted",
            execution_id=execution_id,
            deleted_count=len(to_delete)
        )
        
        return len(to_delete)
    
    def _model_to_state(self, model: ExecutionModel) -> ExecutionState:
        """Convert database model to ExecutionState"""
        
        return ExecutionState(
            execution_id=model.id,
            workflow_id=model.workflow_id,
            status=model.status.value if isinstance(model.status, ExecutionStatus) else model.status,
            steps=[WorkflowStep(**step) for step in model.steps],
            current_step=model.current_step,
            files_created=model.files_created or [],
            files_modified=model.files_modified or [],
            files_deleted=model.files_deleted or [],
            outputs=model.outputs or {},
            tokens_used=model.tokens_used,
            cost=model.cost,
            duration_seconds=model.duration_seconds,
            error=model.error,
            created_at=model.created_at,
            updated_at=model.updated_at,
            started_at=model.started_at,
            completed_at=model.completed_at
        )
