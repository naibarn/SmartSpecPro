"""
SmartSpec Pro - Workflows API
Phase 1+ - To be implemented
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_workflows():
    """List available workflows"""
    return {"status": "not_implemented", "phase": "1+"}


@router.post("/execute")
async def execute_workflow():
    """Execute a workflow"""
    return {"status": "not_implemented", "phase": "1+"}


@router.get("/{workflow_id}/report")
async def get_workflow_report(workflow_id: str):
    """Get workflow execution report"""
    return {"status": "not_implemented", "phase": "1+"}
