"""
Celery entrypoint for Storyboard Preview Match browser capture.

This task intentionally mirrors presentation_render's internal-render security
shape: short-lived JWT in X-Internal-Token only, localhost/internal URL, and
window readiness polling before any recording or publishing step.
"""

import os
import time
from typing import Any

import jwt
import structlog
from celery.exceptions import SoftTimeLimitExceeded
from playwright.sync_api import sync_playwright

from app.core.celery_app import celery_app
from app.core.config import settings

logger = structlog.get_logger(__name__)

_CAPTURE_READY_POLL_INTERVAL_MS = 200
_CAPTURE_READY_ATTEMPTS = 75
_CAPTURE_SCOPE = "internal:storyboard-final-capture"


def _make_storyboard_capture_token(
    *,
    capture_job_id: str,
    attempt_id: str,
    tenant_id: str,
    user_id: int,
    preview_composition_hash: str,
    timeline_hash: str,
) -> str:
    """Generate a short-lived JWT for one storyboard capture attempt."""
    secret = os.getenv("JWT_SECRET") or settings.JWT_SECRET
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured for storyboard capture worker")
    return jwt.encode(
        {
            "sub": "storyboard-capture-worker",
            "scopes": [_CAPTURE_SCOPE],
            "captureJobId": capture_job_id,
            "attemptId": attempt_id,
            "tenantId": tenant_id,
            "userId": user_id,
            "previewCompositionHash": preview_composition_hash,
            "timelineHash": timeline_hash,
            "exp": int(time.time()) + 300,
        },
        secret,
        algorithm="HS256",
    )


def _read_storyboard_capture_state(page) -> dict[str, Any] | None:
    try:
        raw_state = page.evaluate("() => window.__storyboardCaptureState || null")
    except Exception:
        return None
    return raw_state if isinstance(raw_state, dict) else None


def _poll_storyboard_capture_ready(page) -> dict[str, Any]:
    last_state: dict[str, Any] | None = None
    for _ in range(_CAPTURE_READY_ATTEMPTS):
        last_state = _read_storyboard_capture_state(page)
        if last_state and last_state.get("status") in {"ready", "degraded"}:
            return last_state
        if last_state and last_state.get("status") == "error":
            raise RuntimeError(str(last_state.get("code") or "capture_ready_failed"))
        page.wait_for_timeout(_CAPTURE_READY_POLL_INTERVAL_MS)
    return {
        "status": "error",
        "code": "capture_ready_timeout",
        "reason": "Timed out waiting for storyboard capture runtime readiness.",
        "lastState": last_state,
    }


@celery_app.task(
    bind=True,
    soft_time_limit=660,
    time_limit=720,
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=2,
    retry_backoff=30,
    retry_backoff_max=120,
    retry_jitter=True,
    queue="storyboard_capture",
)
def capture_storyboard_preview_match(self, capture_spec: dict[str, Any]) -> dict[str, Any]:
    """
    Load the trusted browser-capture runtime and verify readiness.

    Recording/encoding/upload are delegated to the runtime pack integration; this
    entrypoint establishes the exact internal route/token contract and produces a
    safe diagnostic envelope when readiness fails.
    """
    capture_job_id = str(capture_spec.get("captureJobId") or "")
    attempt_id = str(capture_spec.get("attemptId") or "")
    tenant_id = str(capture_spec.get("tenantId") or "")
    if not capture_job_id or not attempt_id or not tenant_id:
        raise ValueError("capture_spec missing captureJobId, attemptId, or tenantId")

    base_url = (
        os.getenv("STORYBOARD_CAPTURE_BASE_URL")
        or os.getenv("INTERNAL_RENDER_BASE_URL")
        or "http://127.0.0.1:3000"
    ).rstrip("/")
    token = _make_storyboard_capture_token(
        capture_job_id=capture_job_id,
        attempt_id=attempt_id,
        tenant_id=tenant_id,
        user_id=int(capture_spec.get("userId") or 0),
        preview_composition_hash=str(capture_spec.get("previewCompositionHash") or ""),
        timeline_hash=str(capture_spec.get("timelineHash") or ""),
    )
    url = f"{base_url}/internal/storyboard-final-capture/{capture_job_id}"

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(
                    viewport={
                        "width": int(capture_spec.get("width") or 1080),
                        "height": int(capture_spec.get("height") or 1920),
                    },
                    device_scale_factor=1,
                )
                page.set_extra_http_headers({"X-Internal-Token": token})
                page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                state = _poll_storyboard_capture_ready(page)
                if state.get("status") == "error":
                    return {
                        "ok": False,
                        "failureCode": state.get("code") or "capture_ready_timeout",
                        "safeDiagnostics": [str(state.get("reason") or "Capture runtime was not ready.")],
                    }
                return {
                    "ok": True,
                    "captureJobId": capture_job_id,
                    "attemptId": attempt_id,
                    "readyState": state,
                }
            finally:
                browser.close()
    except SoftTimeLimitExceeded:
        logger.warning("storyboard_capture_soft_time_limit_exceeded", capture_job_id=capture_job_id)
        raise
    except Exception as exc:
        logger.error("storyboard_capture_failed", capture_job_id=capture_job_id, error=str(exc))
        raise
