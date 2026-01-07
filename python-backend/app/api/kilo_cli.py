from __future__ import annotations

import os
import json
import asyncio
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


@router.get("/workflows")
async def list_workflows(req: Request):
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    root = Path(WORKSPACE_ROOT or os.getcwd())
    wf_dir = root / ".smartspec" / "workflows"
    names = []
    if wf_dir.exists() and wf_dir.is_dir():
        for p in wf_dir.glob("*.yaml"):
            names.append(p.stem)
        for p in wf_dir.glob("*.yml"):
            if p.stem not in names:
                names.append(p.stem)
    return {"workflows": sorted(names)}
