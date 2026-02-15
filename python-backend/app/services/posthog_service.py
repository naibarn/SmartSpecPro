"""
PostHog Server-Side SDK (Python)

Provides server-side event capture for media job analytics.
No-op when POSTHOG_API_KEY is not configured.
"""

import structlog
from posthog import Posthog

logger = structlog.get_logger()

_client: Posthog | None = None


def _get_client() -> Posthog | None:
    global _client
    if _client is not None:
        return _client

    from app.core.config import settings

    api_key = settings.POSTHOG_API_KEY
    if not api_key:
        return None

    _client = Posthog(
        api_key,
        host="https://us.i.posthog.com",
        debug=settings.ENVIRONMENT == "development",
        on_error=lambda e, items: logger.warning("posthog_error", error=str(e)),
    )
    return _client


def capture_event(
    distinct_id: str,
    event: str,
    properties: dict | None = None,
) -> None:
    """Capture a server-side PostHog event."""
    ph = _get_client()
    if not ph:
        return

    from app.core.config import settings

    ph.capture(
        distinct_id,
        event,
        properties={
            **(properties or {}),
            "environment": settings.ENVIRONMENT,
            "release": getattr(settings, "APP_VERSION", None) or getattr(settings, "RELEASE", None),
        },
    )


def capture_kie_submit(user_id: str, kie_job_id: str, job_type: str = "") -> None:
    """Capture kie_submit_succeeded event."""
    capture_event(user_id, "kie_submit_succeeded", {
        "kie_job_id": kie_job_id,
        "job_type": job_type,
    })


def capture_media_job_completed(
    user_id: str,
    job_id: str,
    job_type: str,
    duration_ms: float,
    output_size_bytes: int,
    resolution: str = "",
) -> None:
    """Capture media_job_completed event."""
    capture_event(user_id, "media_job_completed", {
        "job_id": job_id,
        "job_type": job_type,
        "duration_ms": duration_ms,
        "output_size_bytes": output_size_bytes,
        "resolution": resolution,
    })


def capture_media_job_failed(
    user_id: str,
    job_id: str,
    job_type: str,
    error_message: str,
) -> None:
    """Capture media_job_failed event."""
    capture_event(user_id, "media_job_failed", {
        "job_id": job_id,
        "job_type": job_type,
        "error_message": error_message,
    })


def shutdown_posthog() -> None:
    """Flush pending events and shut down the client."""
    global _client
    if _client is None:
        return
    try:
        _client.shutdown()
    except Exception as e:
        logger.warning("posthog_shutdown_error", error=str(e))
    _client = None
