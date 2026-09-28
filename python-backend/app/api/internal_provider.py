"""
Internal Provider API
For CLI access to provider configs (not exposed to frontend or the public
internet).

SECURITY: this route lives under /api/v1/internal/ and is blocked from the
public internet by nginx (`location ~ ^/api/v[0-9]+/internal/ { deny all }`
in nginx/conf.d/dev-host.conf). Its only legitimate caller is the
server-local ss_autopilot CLI (.smartspec/ss_autopilot/llm_client.py), which
connects directly to http://localhost:8000 and needs the decrypted provider
key to call the provider. Access is additionally gated by the
SMARTSPEC_PROXY_TOKEN header (constant-time compare, fail-closed). Do NOT
expose this route through nginx or hand its payload to any browser/frontend
client. Future hardening: proxy the provider call server-side so the raw key
never leaves the backend.
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List, Dict, Any
import secrets
import structlog

from app.core.database import get_db
from app.models.provider_config import ProviderConfig
from app.core.encryption import encryption_service
from app.core.config import settings

logger = structlog.get_logger()
router = APIRouter(prefix="/api/v1/internal/provider", tags=["internal"])


class ProviderPollRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=64)
    provider_job_id: str = Field(min_length=1, max_length=255)
    operation_key: str = Field(min_length=1, max_length=200)


def map_provider_poll_result(task: Any, result: dict[str, Any]) -> dict[str, Any]:
    """Convert a legacy media-task poll result into a safe CP observation."""
    status = str(result.get("status") or "").lower()
    if status == "completed":
        return {"status": "completed", "resultRef": f"media-task:{task.id}"}
    if status == "failed":
        return {
            "status": "failed",
            "safeErrorCode": "PROVIDER_TASK_FAILED",
            "message": str(result.get("error") or task.error_message or "provider_task_failed")[:500],
        }
    if status == "terminal":
        # The compatibility pollers deliberately return a terminal observation
        # when the domain MediaTask was already settled before the control
        # plane acknowledgement completed. Treat that as durable evidence,
        # not as an unrecognized provider response; otherwise a retry after a
        # lost control-plane response could incorrectly fail the canonical job.
        terminal_state = str(result.get("state") or "").lower()
        if terminal_state == "completed" and task.result_url:
            return {"status": "completed", "resultRef": f"media-task:{task.id}"}
        if terminal_state in {"failed", "cancelled", "canceled"}:
            return {
                "status": "failed",
                "safeErrorCode": "PROVIDER_TASK_ALREADY_TERMINAL",
                "message": str(task.error_message or "provider_task_already_terminal")[:500],
            }
        return {"status": "unknown", "reason": "provider_task_terminal_state_ambiguous"}
    if status in {"processing", "submitted", "waiting_external", "rate_limited"}:
        return {"status": "pending", "providerStatus": status}
    return {"status": "unknown", "reason": f"provider_poll_unrecognized:{status[:80]}"}


async def verify_cli_token(x_proxy_token: Optional[str] = Header(None)):
    """Verify CLI proxy token (constant-time compare; fail-closed if unset)."""
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")

    proxy_token = settings.SMARTSPEC_PROXY_TOKEN
    if not proxy_token:
        raise HTTPException(
            status_code=503, detail="SMARTSPEC_PROXY_TOKEN not configured"
        )

    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")

    return True


@router.get("/configs")
async def get_provider_configs(
    db: AsyncSession = Depends(get_db),
    _verified: bool = Depends(verify_cli_token)
) -> List[Dict[str, Any]]:
    """
    Get enabled provider configs for the server-local CLI.

    Returns the decrypted ``api_key`` because the sole caller (ss_autopilot,
    localhost-only — see module docstring) calls the provider directly. This
    route is nginx-blocked from the public internet and proxy-token gated; it
    must never be reachable from a browser/frontend.
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.is_enabled == True)
    )
    configs = result.scalars().all()

    safe_configs = []
    for config in configs:
        api_key = None
        if config.api_key_encrypted:
            try:
                api_key = encryption_service.decrypt(config.api_key_encrypted)
            except Exception as e:
                logger.error(
                    "failed_to_decrypt_api_key",
                    provider=config.provider_name,
                    error=str(e)
                )

        safe_configs.append({
            "id": config.id,
            "provider_name": config.provider_name,
            "display_name": config.display_name,
            "configured": bool(config.api_key_encrypted),
            "api_key": api_key,
            "base_url": config.base_url,
            "config_json": config.config_json,
            "is_enabled": config.is_enabled,
            "description": config.description
        })

    logger.info(
        "cli_fetched_provider_configs",
        count=len(safe_configs),
        providers=[c["provider_name"] for c in safe_configs]
    )

    return safe_configs


@router.post("/poll", dependencies=[Depends(verify_cli_token)])
async def poll_provider_operation(
    request: ProviderPollRequest,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Perform one bounded provider observation for the Node control plane.

    The endpoint reuses the existing domain poll implementations, but never
    sleeps or schedules another task. The canonical job remains owned by
    PostgreSQL; this response is only an observation for the durable poller.
    """
    from app.models.media_task import MediaTask
    from app.tasks.media_tasks import (
        _feature_186_external_metadata,
        _poll_kie_image_task_async,
        _poll_wavespeed_video_task_async,
    )

    provider = request.provider.strip().lower().replace(".", "_").replace("-", "_")
    task_result = await db.execute(
        select(MediaTask).where(MediaTask.task_id == request.provider_job_id).limit(1)
    )
    task = task_result.scalar_one_or_none()
    if task is None:
        return {"status": "unknown", "reason": "provider_task_not_bound_to_media_task"}

    # The provider task ID is not sufficient correlation evidence. A stale or
    # misrouted poll must not observe a task that belongs to another canonical
    # job/attempt, even though this endpoint is internal and token-gated.
    external_metadata = _feature_186_external_metadata(task.result_data)
    if external_metadata is None:
        return {"status": "unknown", "reason": "provider_task_missing_canonical_binding"}
    expected_operation_key = (
        f"provider:{external_metadata['canonicalJobId']}:{external_metadata['attemptId']}:{provider}:generate"
    )
    if request.operation_key != expected_operation_key:
        return {"status": "unknown", "reason": "provider_operation_key_mismatch"}

    if provider == "kie_ai":
        result = await _poll_kie_image_task_async(task.id, schedule_next_poll=False)
    elif provider == "wavespeed_ai":
        result = await _poll_wavespeed_video_task_async(task.id, schedule_next_poll=False)
    else:
        return {"status": "unknown", "reason": "provider_poll_not_configured"}

    return map_provider_poll_result(task, result)
