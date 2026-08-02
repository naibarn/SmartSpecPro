"""Internal Vertical Drama media-worker helpers (Feature 137 P3)."""

from __future__ import annotations

import asyncio
import secrets
from typing import Optional

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.celery_app import celery_app

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


@router.post("/clip-qc-frames", dependencies=[Depends(_verify_proxy_token)])
async def enqueue_clip_qc_frames(request: ClipQcFramesRequest) -> dict:
    from app.tasks.media_tasks import extract_clip_qc_frames

    task = extract_clip_qc_frames.apply_async(
        args=[request.source_url, request.positions, request.max_frames, request.user_id],
        queue="media",
    )
    if not request.wait:
        return {"status": "queued", "task_id": task.id}

    result = AsyncResult(task.id, app=celery_app)
    deadline = asyncio.get_running_loop().time() + request.wait_seconds
    while not result.ready() and asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(0.5)
    if not result.ready():
        return {"status": "sampling", "task_id": task.id}
    if result.failed():
        return {
            "status": "samples_unavailable",
            "task_id": task.id,
            "samples": [],
            "warning": str(result.result)[:500],
        }
    payload = result.result if isinstance(result.result, dict) else {}
    return {"task_id": task.id, **payload}


@router.get("/clip-qc-frames/{task_id}", dependencies=[Depends(_verify_proxy_token)])
async def get_clip_qc_frames(task_id: str) -> dict:
    result = AsyncResult(task_id, app=celery_app)
    if not result.ready():
        return {"status": result.state.lower(), "task_id": task_id}
    if result.failed():
        return {
            "status": "samples_unavailable",
            "task_id": task_id,
            "samples": [],
            "warning": str(result.result)[:500],
        }
    payload = result.result if isinstance(result.result, dict) else {}
    return {"task_id": task_id, **payload}

