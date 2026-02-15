"""
Sentry Error Tracking - Python Backend

Initializes Sentry for the FastAPI backend with:
- PII scrubbing (headers, body fields)
- FastAPI integration
- Configurable sample rate
"""

import json
import re
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

SENSITIVE_HEADERS = {"authorization", "cookie", "x-proxy-token"}
SENSITIVE_BODY_PATTERN = re.compile(r"password|token|secret|apiKey|encr", re.IGNORECASE)


def before_send(event: dict, hint: dict) -> dict | None:
    """Scrub PII from Sentry events before sending."""
    request = event.get("request", {})

    # Scrub sensitive headers
    headers = request.get("headers", {})
    if isinstance(headers, dict):
        for header in SENSITIVE_HEADERS:
            if header in headers:
                headers[header] = "[FILTERED]"

    # Scrub sensitive body fields (handles both dict and JSON string)
    data = request.get("data")
    if isinstance(data, dict):
        for key in list(data.keys()):
            if SENSITIVE_BODY_PATTERN.search(key):
                data[key] = "[FILTERED]"
    elif isinstance(data, str):
        try:
            parsed = json.loads(data)
            if isinstance(parsed, dict):
                modified = False
                for key in list(parsed.keys()):
                    if SENSITIVE_BODY_PATTERN.search(key):
                        parsed[key] = "[FILTERED]"
                        modified = True
                if modified:
                    request["data"] = json.dumps(parsed)
        except (json.JSONDecodeError, ValueError):
            pass

    return event


def init_sentry() -> None:
    """
    Initialize Sentry for the Python backend.
    Uses SENTRY_DSN from the Pydantic settings model.
    """
    from app.core.config import settings

    dsn = settings.SENTRY_DSN
    if not dsn:
        import structlog
        structlog.get_logger().info("sentry_skip", reason="No SENTRY_DSN set")
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.ENVIRONMENT,
        release=getattr(settings, "RELEASE", None) or getattr(settings, "APP_VERSION", None),
        traces_sample_rate=0.05,
        integrations=[FastApiIntegration()],
        before_send=before_send,
    )

    import structlog
    structlog.get_logger().info("sentry_initialized", environment=settings.ENVIRONMENT)
