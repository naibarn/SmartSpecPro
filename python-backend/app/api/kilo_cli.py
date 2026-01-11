from __future__ import annotations

import os
import json
import asyncio
import yaml
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.kilo.job_manager import JOB_MANAGER
from app.kilo.context_manager import CONTEXT_MANAGER, ContextSettings
from app.orchestrator.sandbox import validate_workspace
from app.core.legacy_key import reject_legacy_key_http


router = APIRouter(prefix="/api/v1/kilo", tags=["kilo"])

WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "")


class ConversationMessage(BaseModel):
    """A single message in conversation history"""
    role: str  # "user" | "assistant"
    content: str
    timestamp: Optional[float] = None


class ConversationContext(BaseModel):
    """Context sent from frontend"""
    session_id: Optional[str] = None
    recent_messages: Optional[List[ConversationMessage]] = None
    summary: Optional[str] = None


class RunReq(BaseModel):
    """Request body for /run endpoint"""
    workspace: str
    command: str
    session_id: Optional[str] = None
    conversation_context: Optional[ConversationContext] = None


def _require_localhost(req: Request):
    if getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (req.client.host if req.client else "") or ""
        if host not in ("127.0.0.1", "::1", "localhost"):
            raise HTTPException(status_code=403, detail="Forbidden (localhost only)")


def _require_proxy_token(req: Request):
    if not settings.DEBUG and not settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN is required in production")

    if not settings.SMARTSPEC_PROXY_TOKEN:
        return

    h = (req.headers.get("authorization") or "").strip()
    token = ""
    if h.lower().startswith("bearer "):
        token = h.split(" ", 1)[1].strip()
    if not token:
        token = (req.headers.get("x-proxy-token") or "").strip()

    if token != settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/run")
async def run(req: Request, body: RunReq):
    """
    Run a Kilo CLI command with optional conversation context.
    
    The context system maintains conversation history across multiple commands
    within the same session, allowing the LLM to reference previous interactions.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    validate_workspace(WORKSPACE_ROOT, body.workspace)
    
    # Prepare context
    session_id = body.session_id
    context_data = None
    
    if body.conversation_context or session_id:
        # Use context manager to prepare context
        prepared = CONTEXT_MANAGER.prepare_context(
            session_id=session_id or (body.conversation_context.session_id if body.conversation_context else None),
            new_command=body.command,
            conversation_context=body.conversation_context.model_dump() if body.conversation_context else None
        )
        session_id = prepared.session_id
        context_data = {
            "messages": prepared.messages,
            "total_tokens": prepared.total_tokens,
            "was_truncated": prepared.was_truncated,
            "context_usage_percent": prepared.context_usage_percent
        }
    
    # Start job with context
    job = JOB_MANAGER.start(
        command=body.command, 
        cwd=body.workspace,
        session_id=session_id,
        context=context_data
    )
    
    return {
        "jobId": job.job_id,
        "sessionId": session_id,
        "contextInfo": {
            "totalTokens": context_data["total_tokens"] if context_data else 0,
            "wasTruncated": context_data["was_truncated"] if context_data else False,
            "usagePercent": context_data["context_usage_percent"] if context_data else 0
        } if context_data else None
    }


@router.get("/jobs/{job_id}/events")
async def job_events(req: Request, job_id: str):
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    async def gen():
        seq = 0
        while True:
            job = JOB_MANAGER.get(job_id)
            if not job:
                yield json.dumps({"type": "error", "message": "job_not_found"}) + "\n"
                return

            rows = JOB_MANAGER.pop_output(job_id, timeout=0.2)
            for s, line in rows:
                seq = max(seq, s)
                yield json.dumps({"type": "stdout", "seq": s, "data": line}) + "\n"

            if job.status != "running":
                yield json.dumps({"type": "status", "status": job.status, "returncode": job.returncode, "seq": seq}) + "\n"
                return

            await asyncio.sleep(0.05)

    return StreamingResponse(gen(), media_type="text/plain")


@router.post("/jobs/{job_id}/response")
async def job_response(req: Request, job_id: str, body: Dict[str, Any]):
    """
    Record assistant response for context tracking.
    Called after job completes to store the response in conversation history.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    job = JOB_MANAGER.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")
    
    response_content = body.get("response", "")
    if response_content and job.session_id:
        CONTEXT_MANAGER.add_assistant_response(job.session_id, response_content)
    
    return {"ok": True}


@router.get("/sessions/{session_id}/context")
async def get_session_context(req: Request, session_id: str):
    """
    Get context usage information for a session.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    usage = CONTEXT_MANAGER.get_context_usage(session_id)
    if "error" in usage:
        raise HTTPException(status_code=404, detail=usage["error"])
    
    return usage


class WorkflowArg(BaseModel):
    name: str
    type: str = "string"
    values: list[str] | None = None
    required: bool = False


class WorkflowSchema(BaseModel):
    name: str
    description: str | None = None
    example: str | None = None
    args: list[WorkflowArg] | None = None


@router.get("/workflows")
async def list_workflows(req: Request, workspace: str | None = None):
    """
    List available Kilo workflows.

    - Looks for YAML files in "<workspace>/.smartspec/workflows"
    - Returns simple list of workflow names
    - Optionally returns schema information parsed from each YAML file
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    root = Path(WORKSPACE_ROOT or os.getcwd())

    # If the caller passes an explicit workspace, validate and use it.
    if workspace:
        validated = validate_workspace(workspace, WORKSPACE_ROOT or "")
        root = Path(validated)

    wf_dir = root / ".smartspec" / "workflows"
    names: list[str] = []
    schemas: list[dict] = []

    if wf_dir.exists() and wf_dir.is_dir():
        for p in sorted(wf_dir.glob("*.yaml")) + sorted(wf_dir.glob("*.yml")):
            try:
                raw = yaml.safe_load(p.read_text(encoding="utf-8"))
            except Exception:
                raw = None

            schema_name = p.stem
            if isinstance(raw, dict) and raw.get("name"):
                schema_name = str(raw["name"])

            if schema_name not in names:
                names.append(schema_name)

            if isinstance(raw, dict) and raw.get("name"):
                try:
                    schema = WorkflowSchema(**raw)
                    schemas.append(schema.model_dump())
                except Exception:
                    # Ignore invalid schema definitions but still expose the workflow name.
                    pass

    return {"workflows": sorted(names), "schemas": schemas}


class StdinRequest(BaseModel):
    text: str


@router.post("/jobs/{job_id}/input")
async def job_input(req: Request, job_id: str, body: StdinRequest):
    """
    Send a single line of stdin text to a running job.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    ok = JOB_MANAGER.send_input(job_id, body.text)
    if not ok:
        raise HTTPException(status_code=404, detail="job_not_found_or_not_running")
    return {"ok": True}


@router.post("/jobs/{job_id}/cancel")
async def job_cancel(req: Request, job_id: str):
    """
    Request cancellation of a running job.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    ok = JOB_MANAGER.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job_not_found_or_not_running")
    return {"ok": True}
