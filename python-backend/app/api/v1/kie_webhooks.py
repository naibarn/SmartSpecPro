"""Kie AI webhook handler.

Public endpoint for receiving Kie AI completion callbacks.
Validates HMAC signature, checks Redis dedup, updates DB,
and enqueues media-processing Cloud Tasks.

This is NOT behind the OIDC middleware (unlike /tasks/* handlers),
because it needs to accept external calls from Kie AI.
"""

import hashlib
import hmac
import json

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.v1.media_generation import (
    _coerce_json_dict,
    _extract_first_kie_result_url,
    _get_required_kie_webhook_secret,
    _normalize_kie_task_state,
    _redact_kie_webhook_payload,
    _submit_veo_4k_upgrade_for_task,
    _task_requests_veo_4k,
    _veo_4k_status,
)
from app.core.database import AsyncSessionLocal
from app.models.media_task import TaskStatus
from app.services.cloud_tasks import enqueue_task
from app.services.media_task_service import MediaTaskService
from app.services.webhook_dedup import WebhookDedupService

logger = structlog.get_logger()

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/kie")
async def kie_webhook_handler(request: Request):
    """Receive Kie AI completion callbacks. Public endpoint with HMAC validation.

    This endpoint is the Cloud Tasks-era replacement for /callback/kie-ai.
    It validates HMAC, checks Redis dedup, updates DB, and enqueues
    a media-processing Cloud Task.
    """
    # 1. Validate HMAC signature
    kie_webhook_secret = _get_required_kie_webhook_secret()
    body_bytes = await request.body()

    if not kie_webhook_secret:
        logger.error("kie_webhook_secret_missing")
        return JSONResponse(
            status_code=503,
            content={"success": False, "error": "Webhook secret is not configured"},
        )
    sig = request.headers.get("x-signature", "")
    expected = hmac.new(
        kie_webhook_secret.encode(), body_bytes, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        logger.warning("kie_webhook_invalid_signature")
        return JSONResponse(
            status_code=401,
            content={"success": False, "error": "Invalid signature"},
        )

    # 2. Parse body
    try:
        body = json.loads(body_bytes)
    except (json.JSONDecodeError, ValueError):
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Invalid JSON payload"},
        )

    kie_job_id = body.get("taskId") or body.get("task_id")
    if not kie_job_id:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Missing taskId"},
        )

    redacted_body = _redact_kie_webhook_payload(body)
    logger.info("kie_webhook_received", kie_job_id=kie_job_id)

    # 3. Redis dedup check
    dedup = WebhookDedupService()
    if await dedup.is_duplicate(kie_job_id):
        return JSONResponse(
            status_code=200,
            content={"success": True, "duplicate": True, "kie_job_id": kie_job_id},
        )

    # 4. Parse status and result URL
    normalized_state, raw_state = _normalize_kie_task_state(body)
    result_url = _extract_first_kie_result_url(body)

    # 5. Look up job in DB
    image_owner_to_advance = None
    async with AsyncSessionLocal() as db:
        task = await MediaTaskService.get_task_by_external_id(db, kie_job_id)
        if not task:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Job not found", "kie_job_id": kie_job_id},
            )

        # 6. Idempotency: already in terminal state
        if task.status in (
            TaskStatus.COMPLETED.value,
            TaskStatus.FAILED.value,
            TaskStatus.CANCELLED.value,
        ):
            await dedup.mark_processed(kie_job_id)
            return JSONResponse(
                status_code=200,
                content={"success": True, "already_terminal": True, "kie_job_id": kie_job_id},
            )

        # 7. Handle completed
        if normalized_state == "success" and result_url:
            should_enqueue_processing = True
            if _task_requests_veo_4k(task) and _veo_4k_status(task) in {"submitted", "processing"}:
                result_data = _coerce_json_dict(task.result_data)
                veo_4k = result_data.get("veo_4k") if isinstance(result_data.get("veo_4k"), dict) else {}
                result_data.update({
                    "webhook_payload": redacted_body,
                    "actual_resolution": "4K",
                    "veo_4k": {
                        **(veo_4k if isinstance(veo_4k, dict) else {}),
                        "status": "completed",
                        "upgrade_task_id": kie_job_id,
                        "result_url": result_url,
                    },
                })
                await MediaTaskService.update_task_status(
                    db,
                    task.id,
                    TaskStatus.COMPLETED,
                    result_url=result_url,
                    result_data=result_data,
                )
            elif _task_requests_veo_4k(task):
                from app.services.media_provider_service import initialize_kie_ai_client

                kie_client = await initialize_kie_ai_client()
                if not kie_client:
                    return JSONResponse(
                        status_code=503,
                        content={"success": False, "error": "Kie AI client unavailable for Veo 4K post-process"},
                    )
                await _submit_veo_4k_upgrade_for_task(
                    db,
                    task,
                    kie_client,
                    original_task_id=kie_job_id,
                    original_result_url=result_url,
                    original_response=body,
                )
                should_enqueue_processing = False
            else:
                await MediaTaskService.update_task_status(
                    db,
                    task.id,
                    TaskStatus.COMPLETED,
                    result_url=result_url,
                    result_data={"webhook_payload": redacted_body},
                )
            # Enqueue media processing (best-effort)
            if should_enqueue_processing:
                try:
                    await enqueue_task(
                        queue_name="media-jobs",
                        handler_path="/tasks/process-media",
                        payload={
                            "job_id": task.id,
                            "kie_job_id": kie_job_id,
                            "result_url": result_url,
                            "media_type": task.media_type,
                        },
                        task_id=f"process-{task.id}",
                    )
                except Exception as e:
                    logger.error(
                        "kie_webhook_enqueue_media_failed",
                        kie_job_id=kie_job_id,
                        job_id=task.id,
                        error=str(e),
                    )

        # 8. Handle failed
        elif normalized_state == "fail":
            error_msg = (
                body.get("failMsg")
                or body.get("data", {}).get("errorMessage")
                or body.get("error")
                or "Task failed on Kie AI"
            )
            await MediaTaskService.update_task_status(
                db,
                task.id,
                TaskStatus.FAILED,
                error_message=error_msg,
            )

        if (
            task.media_type == "image"
            and (normalized_state == "fail" or (normalized_state == "success" and result_url))
        ):
            image_owner_to_advance = task.user_id

    if image_owner_to_advance is not None:
        from app.tasks.media_tasks import _dispatch_pending_image_tasks_async

        await _dispatch_pending_image_tasks_async(image_owner_to_advance)

    # 9. Store dedup key
    await dedup.mark_processed(kie_job_id)

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "kie_job_id": kie_job_id,
            "state": normalized_state,
        },
    )
