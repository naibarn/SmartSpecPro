"""
SmartSpec Pro - Autopilot API
Phase 4 - To be implemented
"""

from fastapi import APIRouter

router = APIRouter()


@router.post("/start")
async def start_autopilot():
    """Start autopilot session"""
    return {"status": "not_implemented", "phase": "4"}


@router.get("/status/{session_id}")
async def get_autopilot_status(session_id: str):
    """Get autopilot session status"""
    return {"status": "not_implemented", "phase": "4"}


@router.post("/stop/{session_id}")
async def stop_autopilot(session_id: str):
    """Stop autopilot session"""
    return {"status": "not_implemented", "phase": "4"}
