from __future__ import annotations
import os
import json
import time
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.kilo.job_manager import JOB_MANAGER
from app.orchestrator.sandbox import validate_workspace

router = APIRouter(prefix="/api/v1/kilo", tags=["kilo"])

WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "")
ORCHESTRATOR_API_KEY = os.getenv("ORCHESTRATOR_API_KEY", "")

def _localhost_only(request: Request):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise HTTPException(status_code=403, detail="localhost_only")

def _require_key(request: Request):
    if not ORCHESTRATOR_API_KEY:
        return
    key = request.headers.get("x-orchestrator-key", "")
    if key != ORCHESTRATOR_API_KEY:
        raise HTTPException(status_code=401, detail="invalid_key")

class RunPayload(BaseModel):
    workspace: str
    command: str

class InputPayload(BaseModel):
    text: str

@router.post("/run")
def run(payload: RunPayload, request: Request):
    _localhost_only(request)
    _require_key(request)
    cwd = validate_workspace(payload.workspace, WORKSPACE_ROOT)
    job = JOB_MANAGER.start(command=payload.command, cwd=cwd)
    return {"jobId": job.job_id}

@router.post("/cancel/{job_id}")
def cancel(job_id: str, request: Request):
    _localhost_only(request)
    _require_key(request)
    ok = JOB_MANAGER.cancel(job_id)
    return {"ok": ok}

@router.post("/input/{job_id}")
def send_input(job_id: str, payload: InputPayload, request: Request):
    _localhost_only(request)
    _require_key(request)
    ok = JOB_MANAGER.send_input(job_id, payload.text)
    return {"ok": ok}

@router.get("/status/{job_id}")
def status(job_id: str, request: Request):
    _localhost_only(request)
    _require_key(request)
    job = JOB_MANAGER.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="not_found")
    return {"jobId": job.job_id, "status": job.status, "returncode": job.returncode, "command": job.command, "createdAt": job.created_at}

@router.get("/stream/{job_id}")
def stream_ndjson(job_id: str, request: Request):
    """NDJSON streaming (fetch-friendly). Supports reconnect with `?from=<seq>`."""
    _localhost_only(request)
    _require_key(request)

    job = JOB_MANAGER.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="not_found")

    try:
        from_seq = int((request.query_params.get("from") or "0"))
    except Exception:
        from_seq = 0

    def gen():
        buffered = JOB_MANAGER.buffer_since(job_id, from_seq)
        for seq, line in buffered:
            yield json.dumps({"type": "stdout", "seq": seq, "line": line}, ensure_ascii=False) + "\n"

        while True:
            chunk = JOB_MANAGER.pop_output(job_id)
            for seq, line in chunk:
                yield json.dumps({"type": "stdout", "seq": seq, "line": line}, ensure_ascii=False) + "\n"

            j = JOB_MANAGER.get(job_id)
            if j and j.status in ("completed", "failed", "cancelled"):
                yield json.dumps({"type": "done", "status": j.status, "returncode": j.returncode, "lastSeq": j._seq}) + "\n"
                break

            time.sleep(0.1)

    return StreamingResponse(gen(), media_type="application/x-ndjson")

@router.get("/workflows")
def list_workflows(workspace: str, request: Request):
    """Discover workflow commands for autocomplete: returns [/name.md, ...]."""
    _localhost_only(request)
    _require_key(request)
    cwd = validate_workspace(workspace, WORKSPACE_ROOT)
    wf_dir = Path(cwd) / ".smartspec" / "workflows"
    if not wf_dir.exists():
        return {"workflows": []}

    items = []
    for p in wf_dir.glob("*.md"):
        name = p.name
        if ":Zone.Identifier" in name:
            continue
        items.append("/" + name)

    items.sort()
    return {"workflows": items}
