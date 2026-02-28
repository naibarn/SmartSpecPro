"""Internal sandbox dispatch API for Node.js -> Python backend calls."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.integrations.opensandbox.client import OpenSandboxClient
from app.integrations.opensandbox.config import opensandbox_settings
from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
from app.integrations.opensandbox.models import SandboxConfig
from app.models.sandbox import SandboxJob
from app.services.sandbox_dispatcher import PolicyDeniedError, SandboxDispatcher

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/internal/sandbox", tags=["Internal Sandbox"])


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    x_proxy_token: Optional[str] = Header(None),
) -> None:
    """Verify internal service token for Node.js -> Python calls."""
    expected = (
        getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
        or getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None)
    )
    if not expected:
        raise HTTPException(status_code=500, detail="Internal token is not configured")

    token = x_internal_token or x_proxy_token
    if not token:
        raise HTTPException(status_code=401, detail="Missing internal token")
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Invalid internal token")


class InputFile(BaseModel):
    key: str
    mime_type: str = Field(alias="mimeType")
    size_bytes: int = Field(alias="sizeBytes")


class SandboxDispatchRequest(BaseModel):
    feature_type: str
    execution_mode: str
    tenant_id: str
    user_id: int
    input_files: list[InputFile] = Field(default_factory=list)
    profile_override: Optional[str] = None
    idempotency_key: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class SandboxDispatchResponse(BaseModel):
    job_id: str


class SandboxCancelResponse(BaseModel):
    success: bool
    job_id: str
    status: str


class SandboxProbeResponse(BaseModel):
    ok: bool
    sandbox_id: str
    status: str


def _normalize_execution_mode(mode: str) -> str:
    """Normalize Node.js execution mode names to backend values."""
    if mode == "sandbox-python":
        return "code"
    if mode.startswith("sandbox-"):
        return mode.replace("sandbox-", "", 1)
    if mode == "media-generate":
        return "media"
    if mode == "python":
        return "code"
    return mode


def _build_manifest(request: SandboxDispatchRequest) -> dict[str, Any]:
    """Build worker input manifest from dispatch request payload."""
    manifest: dict[str, Any] = {
        "input_files": [
            {
                "key": f.key,
                "mime_type": f.mime_type,
                "size_bytes": f.size_bytes,
            }
            for f in request.input_files
        ],
        "metadata": request.metadata or {},
    }

    metadata = request.metadata or {}
    if isinstance(metadata.get("commands"), list):
        manifest["commands"] = [str(c) for c in metadata["commands"]]
    elif isinstance(metadata.get("command"), str):
        manifest["commands"] = [metadata["command"]]
    else:
        manifest["commands"] = []

    if isinstance(metadata.get("output_paths"), list):
        manifest["output_paths"] = [str(p) for p in metadata["output_paths"]]

    inline_files = metadata.get("inlineFiles")
    if isinstance(inline_files, list):
        normalized_inline_files: list[dict[str, Any]] = []
        for entry in inline_files:
            if not isinstance(entry, dict):
                continue
            path_value = entry.get("path")
            content_value = entry.get("contentBase64")
            if not isinstance(path_value, str) or not isinstance(content_value, str):
                continue
            normalized_entry: dict[str, Any] = {
                "path": path_value,
                "content_base64": content_value,
            }
            mode_value = entry.get("mode")
            if isinstance(mode_value, int):
                normalized_entry["mode"] = mode_value
            normalized_inline_files.append(normalized_entry)
        manifest["inline_files"] = normalized_inline_files

    return manifest


@router.post(
    "/dispatch",
    response_model=SandboxDispatchResponse,
    dependencies=[Depends(_verify_internal_token)],
)
async def dispatch_sandbox_job(
    body: SandboxDispatchRequest,
    db: AsyncSession = Depends(get_db),
) -> SandboxDispatchResponse:
    """Accept a sandbox execution request and enqueue a sandbox job."""
    dispatcher = SandboxDispatcher(db)
    try:
        job_id = await dispatcher.dispatch(
            feature_type=body.feature_type,
            execution_mode=_normalize_execution_mode(body.execution_mode),
            tenant_id=body.tenant_id,
            user_id=body.user_id,
            inputs=_build_manifest(body),
            feature_ref_id=(body.metadata or {}).get("featureRefId"),
            profile_override=body.profile_override,
            idempotency_key=body.idempotency_key,
        )
    except PolicyDeniedError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("internal_sandbox_dispatch_failed", error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail="Sandbox dispatch failed") from exc

    if not job_id:
        raise HTTPException(
            status_code=503,
            detail="OpenSandbox dispatch is currently disabled or unavailable",
        )

    return SandboxDispatchResponse(job_id=job_id)


@router.post(
    "/cancel/{job_id}",
    response_model=SandboxCancelResponse,
    dependencies=[Depends(_verify_internal_token)],
)
async def cancel_sandbox_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> SandboxCancelResponse:
    """Mark a non-terminal sandbox job as canceled."""
    from sqlalchemy import select

    result = await db.execute(select(SandboxJob).where(SandboxJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Sandbox job not found")

    if job.status in {"completed", "failed", "timed_out", "canceled"}:
        return SandboxCancelResponse(success=True, job_id=job_id, status=job.status)

    await db.execute(
        update(SandboxJob)
        .where(SandboxJob.id == job_id)
        .values(
            status="canceled",
            status_reason="Canceled by internal API request",
            finished_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()

    return SandboxCancelResponse(success=True, job_id=job_id, status="canceled")


@router.post(
    "/probe",
    response_model=SandboxProbeResponse,
    dependencies=[Depends(_verify_internal_token)],
)
async def probe_opensandbox_connectivity() -> SandboxProbeResponse:
    """Verify backend -> OpenSandbox connectivity using configured API key."""
    client = OpenSandboxClient(opensandbox_settings)
    lifecycle = SandboxLifecycleManager(client)
    sandbox_id: str | None = None
    try:
        sandbox_id = await lifecycle.provision_sandbox(
            SandboxConfig(
                image="python:3.11-slim",
                timeout_seconds=90,
                network_default_action=opensandbox_settings.SANDBOX_DEFAULT_NETWORK_ACTION,
                metadata={"probe": "internal_sandbox_api"},
            ),
            job_id="probe",
        )
        status = await client.get_sandbox_status(sandbox_id)
        return SandboxProbeResponse(ok=True, sandbox_id=sandbox_id, status=status.status)
    except Exception as exc:
        logger.error("internal_sandbox_probe_failed", error=str(exc), exc_info=True)
        raise HTTPException(status_code=502, detail=f"OpenSandbox probe failed: {exc}") from exc
    finally:
        try:
            if sandbox_id:
                await lifecycle.destroy_sandbox(sandbox_id)
        finally:
            await client.close()
