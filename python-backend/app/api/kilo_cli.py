from __future__ import annotations

import os
import json
import asyncio
import yaml
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.kilo.job_manager import JOB_MANAGER
from app.orchestrator.sandbox import validate_workspace
from app.core.legacy_key import reject_legacy_key_http


router = APIRouter(prefix="/api/v1/kilo", tags=["kilo"])

WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "")


class RunReq(BaseModel):
    workspace: str
    command: str


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
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    validate_workspace(WORKSPACE_ROOT, body.workspace)
    job = JOB_MANAGER.start(command=body.command, cwd=body.workspace)
    return {"jobId": job.job_id}


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
