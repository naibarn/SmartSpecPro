"""Internal Vertical Drama media-worker helpers (Feature 137 P3)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/api/internal/vertical-drama", tags=["Internal Vertical Drama"])


async def _verify_proxy_token(x_proxy_token: Optional[str] = Header(None)) -> None:
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")
    expected = [
        str(getattr(settings, "SMARTSPEC_PROXY_TOKEN", "") or "").strip(),
        str(getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "") or "").strip(),
    ]
    if not any(token and secrets.compare_digest(x_proxy_token, token) for token in expected):
        raise HTTPException(status_code=401, detail="Invalid proxy token")


class ClipQcFramesRequest(BaseModel):
    source_url: str = Field(min_length=1, max_length=4000)
    positions: list[float] = Field(default_factory=lambda: [0.10, 0.40, 0.70, 0.95], max_length=6)
    max_frames: int = Field(default=6, ge=1, le=6)
    user_id: int = Field(default=0, ge=0)
    wait: bool = True
    wait_seconds: int = Field(default=145, ge=1, le=150)


async def _read_clip_qc_status(task_id: str) -> dict:
    from app.services.job_control_plane import JobControlPlaneClient

    return await asyncio.to_thread(JobControlPlaneClient().status, task_id)


def _clip_qc_control_plane_payload(task_id: str, snapshot: dict) -> dict:
    status = str(snapshot.get("status") or "queued")
    progress = snapshot.get("progress") if isinstance(snapshot.get("progress"), dict) else {}
    output = snapshot.get("output") if isinstance(snapshot.get("output"), dict) else {}
    if status == "succeeded":
        return {"task_id": task_id, "status": "succeeded", **output}
    if status in {"failed", "expired", "cancelled"}:
        return {
            "status": "samples_unavailable",
            "task_id": task_id,
            "samples": [],
            "warning": str(snapshot.get("errorMessage") or snapshot.get("operatorReviewReason") or status)[:500],
        }
    return {
        "status": "sampling" if status in {"leased", "running", "waiting_external"} else status,
        "task_id": task_id,
        "progress": progress.get("progress", 0),
        "stage": progress.get("stage"),
    }


@router.post("/clip-qc-frames", dependencies=[Depends(_verify_proxy_token)])
async def enqueue_clip_qc_frames(request: ClipQcFramesRequest) -> dict:
    from app.tasks.media_tasks import extract_clip_qc_frames

    from app.services.job_control_plane import dispatch_python_task

    task = dispatch_python_task(
        extract_clip_qc_frames.name,
        args=[request.source_url, request.positions, request.max_frames, request.user_id],
        queue="media",
        tenant_id=os.getenv("FEATURE_186_SYSTEM_TENANT_ID"),
        user_id=request.user_id or None,
        idempotency_key=(
            "vertical-drama:clip-qc:"
            + hashlib.sha256(
                json.dumps(request.model_dump(), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            ).hexdigest()[:32]
        ),
        correlation_id="internal:vertical-drama-clip-qc",
        legacy_task=extract_clip_qc_frames,
    )
    if not request.wait:
        return {"status": "queued", "task_id": task.id}

    deadline = asyncio.get_running_loop().time() + request.wait_seconds
    snapshot = await _read_clip_qc_status(task.id)
    while snapshot.get("status") in {"queued", "running", "leased", "waiting_external"} and asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(0.5)
        snapshot = await _read_clip_qc_status(task.id)
    if _feature_186_python_worker_enabled():
        if snapshot.get("status") in {"queued", "running", "leased", "waiting_external"}:
            return {"status": "sampling", "task_id": task.id}
        return _clip_qc_control_plane_payload(task.id, snapshot)

    if snapshot.get("status") in {"queued", "running", "leased", "waiting_external"}:
        return {"status": "sampling", "task_id": task.id}
    if snapshot.get("status") == "failed":
        return {
            "status": "samples_unavailable",
            "task_id": task.id,
            "samples": [],
            "warning": str(snapshot.get("error") or "clip QC task failed")[:500],
        }
    return {"task_id": task.id, **(snapshot.get("output") or {})}


@router.get("/clip-qc-frames/{task_id}", dependencies=[Depends(_verify_proxy_token)])
async def get_clip_qc_frames(task_id: str) -> dict:
    snapshot = await _read_clip_qc_status(task_id)
    if _feature_186_python_worker_enabled():
        return _clip_qc_control_plane_payload(task_id, snapshot)
    if snapshot.get("status") in {"queued", "running"}:
        return {"status": snapshot["status"], "task_id": task_id}
    if snapshot.get("status") == "failed":
        return {"status": "samples_unavailable", "task_id": task_id, "samples": [], "warning": snapshot.get("error")}
    return {"task_id": task_id, **(snapshot.get("output") or {})}
