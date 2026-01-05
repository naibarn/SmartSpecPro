"""
SmartSpec Pro - Orchestrator API
Phase 0.3
"""

from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
from pydantic import BaseModel

from app.orchestrator import (
    orchestrator,
    state_manager,
    checkpoint_manager,
    ExecutionState,
    ExecutionStatus,
    CheckpointData,
    ParallelExecution,
)

router = APIRouter()


class ExecuteWorkflowRequest(BaseModel):
    """Request to execute workflow"""
    workflow_id: str
    user_prompt: str
    goal: str
    steps: List[dict]
    project_path: Optional[str] = None
    parallel_config: Optional[ParallelExecution] = None
    validation_rules: Optional[List[dict]] = None


@router.post("/execute", response_model=ExecutionState, status_code=status.HTTP_200_OK)
async def execute_workflow(request: ExecuteWorkflowRequest):
    """
    Execute workflow with LangGraph orchestration
    
    This endpoint:
    - Creates execution state
    - Builds LangGraph
    - Executes steps sequentially or in parallel
    - Creates checkpoints after each step
    - Validates execution
    """
    try:
        state = await orchestrator.execute_workflow(
            workflow_id=request.workflow_id,
            user_prompt=request.user_prompt,
            goal=request.goal,
            steps=request.steps,
            project_path=request.project_path,
            parallel_config=request.parallel_config,
            validation_rules=request.validation_rules
        )
        return state
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Workflow execution failed: {str(e)}"
        )


@router.get("/status/{execution_id}", response_model=ExecutionState, status_code=status.HTTP_200_OK)
async def get_execution_status(execution_id: str):
    """Get workflow execution status"""
    state = orchestrator.get_execution_status(execution_id)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Execution not found: {execution_id}"
        )
    return state


@router.get("/list", response_model=List[ExecutionState], status_code=status.HTTP_200_OK)
async def list_executions(status_filter: Optional[ExecutionStatus] = None):
    """List all executions, optionally filtered by status"""
    return orchestrator.list_executions(status_filter)


@router.post("/cancel/{execution_id}", status_code=status.HTTP_200_OK)
async def cancel_execution(execution_id: str):
    """Cancel a running execution"""
    success = orchestrator.cancel_execution(execution_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel execution: {execution_id}"
        )
    return {"status": "cancelled", "execution_id": execution_id}


@router.post("/resume/{checkpoint_id}", response_model=ExecutionState, status_code=status.HTTP_200_OK)
async def resume_from_checkpoint(checkpoint_id: str):
    """Resume workflow from checkpoint"""
    try:
        state = await orchestrator.resume_from_checkpoint(checkpoint_id)
        return state
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resume failed: {str(e)}"
        )


@router.get("/checkpoints/{execution_id}", response_model=List[CheckpointData], status_code=status.HTTP_200_OK)
async def list_checkpoints(execution_id: str):
    """List all checkpoints for an execution"""
    checkpoints = checkpoint_manager.list_checkpoints(execution_id)
    return checkpoints


@router.get("/checkpoints/{execution_id}/latest", response_model=CheckpointData, status_code=status.HTTP_200_OK)
async def get_latest_checkpoint(execution_id: str):
    """Get the latest checkpoint for an execution"""
    checkpoint = checkpoint_manager.get_latest_checkpoint(execution_id)
    if not checkpoint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No checkpoints found for execution: {execution_id}"
        )
    return checkpoint


@router.delete("/checkpoints/{checkpoint_id}", status_code=status.HTTP_200_OK)
async def delete_checkpoint(checkpoint_id: str):
    """Delete a checkpoint"""
    success = checkpoint_manager.delete_checkpoint(checkpoint_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checkpoint not found: {checkpoint_id}"
        )
    return {"status": "deleted", "checkpoint_id": checkpoint_id}


@router.get("/stats", status_code=status.HTTP_200_OK)
async def get_stats():
    """Get orchestrator statistics"""
    checkpoint_stats = checkpoint_manager.get_checkpoint_stats()
    
    executions = state_manager.list_executions()
    execution_stats = {
        "total_executions": len(executions),
        "running": len([e for e in executions if e.status == ExecutionStatus.RUNNING]),
        "completed": len([e for e in executions if e.status == ExecutionStatus.COMPLETED]),
        "failed": len([e for e in executions if e.status == ExecutionStatus.FAILED]),
        "pending": len([e for e in executions if e.status == ExecutionStatus.PENDING]),
    }
    
    return {
        "checkpoints": checkpoint_stats,
        "executions": execution_stats
    }


@router.post("/test", status_code=status.HTTP_200_OK)
async def test_orchestrator():
    """Test orchestrator with a simple workflow"""
    
    test_steps = [
        {
            "id": "step_1",
            "name": "Test Step 1",
            "description": "First test step",
            "type": "llm",
            "prompt": "Say 'Step 1 completed'",
            "task_type": "simple",
            "budget_priority": "cost"
        },
        {
            "id": "step_2",
            "name": "Test Step 2",
            "description": "Second test step",
            "type": "llm",
            "prompt": "Say 'Step 2 completed'",
            "task_type": "simple",
            "budget_priority": "cost"
        }
    ]
    
    try:
        state = await orchestrator.execute_workflow(
            workflow_id="test_workflow",
            user_prompt="Test orchestrator",
            goal="Test workflow execution with checkpoints",
            steps=test_steps
        )
        
        return {
            "status": "success",
            "execution_id": state.execution_id,
            "workflow_status": state.status,
            "completed_steps": state.completed_steps,
            "total_steps": state.total_steps,
            "checkpoints": state.checkpoint_count,
            "total_cost": state.total_cost,
            "duration_seconds": state.total_duration_seconds
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Test failed: {str(e)}"
        )
