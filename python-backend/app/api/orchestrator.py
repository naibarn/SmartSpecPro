from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import os

from app.core.control_plane_settings import settings
from app.orchestrator.control_plane_client import ControlPlaneClient
from app.orchestrator.factory_orchestrator import SaaSFactoryOrchestrator

router = APIRouter(prefix="/api/v1/orchestrator", tags=["orchestrator"])

def _localhost_only(request: Request):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise HTTPException(status_code=403, detail="localhost_only")

def _require_api_key(request: Request):
    if not settings.orchestrator_api_key:
        return
    key = request.headers.get("x-orchestrator-key", "")
    if key != settings.orchestrator_api_key:
        raise HTTPException(status_code=401, detail="invalid_orchestrator_key")

class FactoryRun(BaseModel):
    projectId: str
    sessionId: str
    workspace: str
    apply: bool = False
    applyApprovalToken: str | None = None
    maxIterations: int = 8

@router.post("/factory/run")
def run_factory(payload: FactoryRun, request: Request):
    _localhost_only(request)
    _require_api_key(request)

    if not settings.control_plane_api_key:
        raise HTTPException(status_code=500, detail="CONTROL_PLANE_API_KEY_not_configured")

    cp = ControlPlaneClient(settings.control_plane_url, settings.control_plane_api_key)
    orch = SaaSFactoryOrchestrator(cp, payload.workspace, settings.workspace_root, settings.max_report_bytes)

    try:
        result = orch.run(
            project_id=payload.projectId,
            session_id=payload.sessionId,
            apply=payload.apply,
            apply_approval_token=payload.applyApprovalToken,
            max_iterations=payload.maxIterations,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
