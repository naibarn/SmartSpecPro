"""
System auto-report client -- calls the Node.js internal feedback endpoint.

Fire-and-forget helper used by background Celery tasks to auto-file an
admin feedback ticket whenever a job fails permanently, so failures get
triaged without an admin needing to dig through logs.

This module NEVER raises. Any problem reaching the Node.js endpoint
(missing config, network error, non-2xx response) is logged and swallowed
so the caller's task retry/failure semantics are never affected.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.core.config import settings

logger = structlog.get_logger()

_TIMEOUT_SECONDS = 5.0
_MAX_TITLE_LEN = 300
_MAX_TEXT_LEN = 2000

# Only these primitive types are allowed through `extra` -- never forward
# secrets, headers, full prompts, or raw provider payloads.
_ALLOWED_EXTRA_TYPES = (str, int, float, bool, type(None))


def _sanitize_extra(extra: dict[str, Any] | None) -> dict[str, Any]:
    """Keep only whitelisted primitive values; drop anything else silently."""
    if not extra:
        return {}
    safe: dict[str, Any] = {}
    for key, value in extra.items():
        if isinstance(value, _ALLOWED_EXTRA_TYPES):
            safe[key] = value
        else:
            logger.debug(
                "system_auto_report_extra_dropped", key=key, value_type=type(value).__name__
            )
    return safe


async def report_system_failure(
    *,
    source: str,
    title: str,
    error_message: str,
    user_id: int | str | None = None,
    tenant_id: str | None = None,
    stack: str | None = None,
    path: str | None = None,
    job_id: str | None = None,
    trace_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """
    Auto-file an admin feedback ticket for a permanently failed background job.

    Fire-and-forget: this coroutine never raises. Missing configuration,
    network errors, and non-2xx responses are logged at warning/debug level
    and swallowed so callers (Celery tasks) are never affected.
    """
    try:
        base_url = (settings.SMARTSPEC_WEB_GATEWAY_URL or "").rstrip("/")
        token = settings.SMARTSPEC_WEB_GATEWAY_TOKEN or ""

        if not base_url or not token:
            logger.debug(
                "system_auto_report_skipped",
                reason="SMARTSPEC_WEB_GATEWAY_URL or SMARTSPEC_WEB_GATEWAY_TOKEN not configured",
                source=source,
            )
            return

        payload: dict[str, Any] = {
            "source": source,
            "title": (title or "")[:_MAX_TITLE_LEN],
            "errorMessage": (error_message or "")[:_MAX_TEXT_LEN],
        }
        if user_id is not None:
            payload["userId"] = user_id
        if tenant_id:
            payload["tenantId"] = tenant_id
        if stack:
            payload["stack"] = stack[:_MAX_TEXT_LEN]
        if path:
            payload["path"] = path
        if job_id:
            payload["jobId"] = job_id
        if trace_id:
            payload["traceId"] = trace_id

        sanitized_extra = _sanitize_extra(extra)
        if sanitized_extra:
            payload["extra"] = sanitized_extra

        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{base_url}/api/internal/feedback/auto-report",
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code not in (200, 201):
            logger.warning(
                "system_auto_report_failed",
                source=source,
                job_id=job_id,
                status=resp.status_code,
                body=resp.text[:200],
            )
        else:
            logger.debug("system_auto_report_sent", source=source, job_id=job_id)

    except Exception as exc:
        # Fire-and-forget: swallow everything so this never affects the caller.
        logger.warning("system_auto_report_error", source=source, job_id=job_id, error=str(exc))
