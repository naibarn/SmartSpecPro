"""Internal transport adapter for Feature 186 Python execution."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/api/internal/job-control-plane", tags=["Internal Job Control Plane"])


def _verify_token(token: str) -> None:
    expected_tokens = {
        str(getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "") or "").strip(),
        str(getattr(settings, "SMARTSPEC_PROXY_TOKEN", "") or "").strip(),
    }
    expected_tokens.discard("")
    if not expected_tokens:
        raise HTTPException(status_code=503, detail="Internal token is not configured")
    if not token or not any(secrets.compare_digest(token, expected) for expected in expected_tokens):
        raise HTTPException(status_code=401, detail="Invalid internal token")


class PublishRequest(BaseModel):
    job_id: str = Field(min_length=1, max_length=80)
    task_id: str = Field(min_length=1, max_length=200)
    attempt_id: str | None = Field(default=None, max_length=80)
    queue: str | None = Field(default=None, max_length=80)


@router.post("/publish", include_in_schema=False)
def publish_unified_job(
    request: PublishRequest,
    x_internal_token: str = Header("", alias="x-internal-token"),
) -> dict[str, Any]:
    """Reject the retired publisher endpoint; producers enqueue via worker_jobs."""
    _verify_token(x_internal_token)
    raise HTTPException(status_code=410, detail="LEGACY_JOB_PUBLISHER_RETIRED")
