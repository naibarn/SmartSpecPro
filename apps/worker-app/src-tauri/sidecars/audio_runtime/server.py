#!/usr/bin/env python3
"""Loopback gateway for a managed, genuine MiniMax Music 3 runtime.

This process is intentionally fail-closed. It does not contain a synth,
procedural fallback, stock selector, fake health response, or fabricated audio
metrics. A production adapter must be installed separately and must return
measured artifact/provenance data before a job can complete.
"""

import hashlib
import importlib.util
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

try:
    from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
    from fastapi.responses import FileResponse
    from pydantic import BaseModel, Field
    import uvicorn
except ImportError:
    raise SystemExit("FastAPI, Uvicorn and Pydantic are required for the managed Music 3 runtime.")

MODEL_NAME = "MiniMaxAI/MiniMax-Music3"
MODEL_REVISION = os.environ.get("MINIMAX_MUSIC3_MODEL_REVISION", "").strip()
MODEL_DIR = Path(os.environ.get("MINIMAX_MUSIC3_MODEL_DIR", ""))
ADAPTER_MODULE = os.environ.get("MINIMAX_MUSIC3_ADAPTER_MODULE", "minimax_music3_adapter")
AUTH_TOKEN = os.environ.get("MINIMAX_AUDIO_RUNTIME_TOKEN", "").strip()
LEDGER_PATH = Path(os.environ.get("MINIMAX_AUDIO_LEDGER_PATH", "./audio_runtime_jobs.json"))

app = FastAPI(
    title="SmartAIHub MiniMax Music 3 Managed Runtime",
    version="1.0.0",
    description="Fail-closed gateway for the official MiniMax Music 3 checkpoint.",
)


class MusicGenerationRequest(BaseModel):
    cueId: str = Field(min_length=1, max_length=160)
    modelInstruction: str = Field(min_length=1, max_length=12000)
    planHash: str = Field(min_length=1, max_length=200)
    skillExecutionId: str = Field(min_length=1, max_length=200)
    rightsPolicyHash: str = Field(min_length=1, max_length=200)
    rightsStatus: str = Field(pattern="^approved_for_project$")
    durationSeconds: float = Field(gt=0, le=600)
    intensity: float = Field(ge=0, le=1)
    fadeInMs: int = Field(ge=0, le=60000)
    fadeOutMs: int = Field(ge=0, le=60000)
    targetLufs: float = Field(ge=-60, le=0)


class JobStatusResponse(BaseModel):
    jobId: str
    cueId: str
    status: str
    progressPercent: int
    createdAt: float
    completedAt: Optional[float] = None
    outputWavPath: Optional[str] = None
    outputDurationSeconds: Optional[float] = None
    metrics: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


def verify_token(authorization: Optional[str] = Header(None)) -> str:
    if not AUTH_TOKEN:
        raise HTTPException(status_code=503, detail="MODEL_NOT_INSTALLED: runtime secret is not configured")
    if authorization != f"Bearer {AUTH_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid runtime authorization")
    return AUTH_TOKEN


def load_adapter() -> Any:
    try:
        if not MODEL_REVISION or not MODEL_DIR.is_dir():
            return None
        if importlib.util.find_spec(ADAPTER_MODULE) is None:
            return None
        module = __import__(ADAPTER_MODULE, fromlist=["probe", "generate"])
        probe = getattr(module, "probe", None)
        generate = getattr(module, "generate", None)
        if not callable(probe) or not callable(generate):
            return None
        capability = probe(model_name=MODEL_NAME, model_revision=MODEL_REVISION, model_dir=str(MODEL_DIR))
        if not isinstance(capability, dict) or capability.get("modelName") != MODEL_NAME or not capability.get("ready"):
            return None
        return module
    except Exception:
        return None


def runtime_capability() -> Dict[str, Any]:
    adapter = load_adapter()
    if adapter is None:
        return {
            "ready": False,
            "message": "Genuine MiniMax Music 3 model weights and managed adapter are unavailable.",
        }
    return {"ready": True, "message": "Genuine MiniMax Music 3 runtime is ready."}


def read_ledger() -> Dict[str, Dict[str, Any]]:
    try:
        return json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def write_ledger(ledger: Dict[str, Dict[str, Any]]) -> None:
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = LEDGER_PATH.with_suffix(f".{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(ledger, sort_keys=True), encoding="utf-8")
    temporary.replace(LEDGER_PATH)


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


async def execute_generation_task(job_id: str, req: MusicGenerationRequest) -> None:
    ledger = read_ledger()
    job = ledger.get(job_id)
    if not job or job.get("status") == "cancelled":
        return
    job["status"] = "generating"
    write_ledger(ledger)
    adapter = load_adapter()
    if adapter is None:
        job["status"] = "failed"
        job["error"] = "MODEL_NOT_INSTALLED: genuine MiniMax Music 3 adapter is unavailable"
        write_ledger(ledger)
        return
    try:
        result = await adapter.generate(
            model_name=MODEL_NAME,
            model_revision=MODEL_REVISION,
            model_dir=str(MODEL_DIR),
            cue_id=req.cueId,
            model_instruction=req.modelInstruction,
            duration_seconds=req.durationSeconds,
            intensity=req.intensity,
            fade_in_ms=req.fadeInMs,
            fade_out_ms=req.fadeOutMs,
        )
        if not isinstance(result, dict):
            raise RuntimeError("GENERATION_OUTCOME_UNKNOWN: adapter returned a non-object")
        output_path = Path(str(result.get("outputWavPath", ""))).resolve()
        metrics = result.get("metrics")
        required = ("sampleRate", "channels", "measuredLufs", "truePeakDb", "generationTimeSeconds")
        if not output_path.is_file() or output_path.suffix.lower() != ".wav" or not isinstance(metrics, dict):
            raise RuntimeError("GENERATION_OUTCOME_UNKNOWN: missing decodable artifact or measurements")
        if any(key not in metrics for key in required):
            raise RuntimeError("GENERATION_OUTCOME_UNKNOWN: adapter omitted measured output fields")
        if result.get("modelName") != MODEL_NAME or result.get("modelRevision") != MODEL_REVISION:
            raise RuntimeError("MODEL_IDENTITY_MISMATCH: adapter identity does not match the pinned checkpoint")
        ledger = read_ledger()
        job = ledger.get(job_id)
        if not job or job.get("status") == "cancelled":
            return
        job.update({
            "status": "completed",
            "progressPercent": 100,
            "completedAt": time.time(),
            "outputWavPath": str(output_path),
            "outputDurationSeconds": float(result.get("outputDurationSeconds", 0)),
            "metrics": {
                **metrics,
                "modelName": MODEL_NAME,
                "modelRevision": MODEL_REVISION,
                "outputSha256": hash_file(output_path),
            },
        })
        write_ledger(ledger)
    except Exception as exc:
        ledger = read_ledger()
        job = ledger[job_id]
        job["status"] = "failed"
        job["error"] = str(exc)
        write_ledger(ledger)


@app.get("/healthz")
async def healthz() -> Dict[str, Any]:
    capability = runtime_capability()
    ledger = read_ledger()
    return {
        "status": "ready" if capability["ready"] else "unavailable",
        "ready": capability["ready"],
        "service": "minimax_music3_runtime",
        "version": "1.0.0",
        "modelName": MODEL_NAME,
        "modelRevision": MODEL_REVISION,
        "capability": "genuine_minimax_music3" if capability["ready"] else "",
        "gpu": {"device": "unknown", "vramTotalGb": 0.0, "vramFreeGb": 0.0},
        "activeJobs": sum(1 for job in ledger.values() if job.get("status") in ("queued", "generating")),
        "message": capability["message"],
    }


@app.get("/v1/capabilities")
async def get_capabilities(_token: str = Depends(verify_token)) -> Dict[str, Any]:
    capability = runtime_capability()
    if not capability["ready"]:
        raise HTTPException(status_code=503, detail="MODEL_NOT_INSTALLED: genuine Music 3 capability is unavailable")
    return {
        "modelName": MODEL_NAME,
        "modelRevision": MODEL_REVISION,
        "capability": "genuine_minimax_music3",
        "sampleRate": 32000,
        "channels": 2,
        "supportedFormats": ["wav"],
    }


@app.post("/v1/jobs", response_model=JobStatusResponse)
async def create_music_job(req: MusicGenerationRequest, bg_tasks: BackgroundTasks, _token: str = Depends(verify_token)) -> Dict[str, Any]:
    if not runtime_capability()["ready"]:
        raise HTTPException(status_code=503, detail="MODEL_NOT_INSTALLED: genuine Music 3 capability is unavailable")
    job_id = f"job_music_{uuid.uuid4().hex[:10]}"
    job = {
        "jobId": job_id, "cueId": req.cueId, "status": "queued", "progressPercent": 0,
        "createdAt": time.time(), "completedAt": None, "outputWavPath": None,
        "outputDurationSeconds": None, "metrics": None, "error": None,
    }
    ledger = read_ledger()
    ledger[job_id] = job
    write_ledger(ledger)
    bg_tasks.add_task(execute_generation_task, job_id, req)
    return job


@app.get("/v1/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, _token: str = Depends(verify_token)) -> Dict[str, Any]:
    job = read_ledger().get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/v1/jobs/{job_id}/cancel", response_model=JobStatusResponse)
async def cancel_music_job(job_id: str, _token: str = Depends(verify_token)) -> Dict[str, Any]:
    ledger = read_ledger()
    job = ledger.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") in ("completed", "failed", "cancelled"):
        return job
    job["status"] = "cancelled"
    job["error"] = "Canceled by user"
    job["completedAt"] = time.time()
    write_ledger(ledger)
    return job


@app.get("/v1/jobs/{job_id}/download")
async def download_job_wav(job_id: str, _token: str = Depends(verify_token)) -> FileResponse:
    job = read_ledger().get(job_id)
    if not job or job.get("status") != "completed" or not job.get("outputWavPath"):
        raise HTTPException(status_code=404, detail="Audio file not ready or job failed")
    return FileResponse(job["outputWavPath"], media_type="audio/wav", filename=Path(job["outputWavPath"]).name)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Managed MiniMax Music 3 runtime gateway")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8199)
    args = parser.parse_args()
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("The audio runtime must bind to loopback only.")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
