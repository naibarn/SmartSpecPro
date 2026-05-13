"""
Celery Tasks for Media Generation
Handles async image, video, and audio generation
"""

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models.media_task import MediaTask, TaskStatus, MediaType
from app.models.user import User
from app.services.media_task_service import MediaTaskService
from app.services.media_callback_service import retry_due_callback_events
from app.services.library_indexing_service import (
    process_library_index_job,
    reindex_all_library_items,
    retry_due_library_index_jobs,
)
from app.services.library_backfill_service import run_library_backfill_batch
from app.services.media_thumbnail_backfill_service import run_missing_media_thumbnail_backfill_batch
from app.services.media_debug_trace import write_media_debug_event
from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import (
    ImageGenerationRequest,
    VideoGenerationRequest,
    AudioGenerationRequest,
)
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from uuid import UUID
from sqlalchemy import or_, select, text
from typing import Any, Optional
import re
import structlog
import asyncio
import json
import shutil
import tempfile

logger = structlog.get_logger()


def _run_async(coro):
    """
    Safely run async coroutine in Celery worker context.
    Reuses the existing event loop if available, or creates a persistent one.

    This prevents "Event loop is closed" errors that occur when using asyncio.run()
    repeatedly in Celery workers. asyncio.run() creates and closes loops, which
    causes state corruption. This function maintains a persistent loop for the
    worker process lifetime.
    """
    try:
        loop = asyncio.get_running_loop()
        # Already in async context — should not happen in Celery prefork workers
        raise RuntimeError("Already in async context - cannot run nested async")
    except RuntimeError as e:
        if "Already in async context" in str(e):
            raise
        # No running loop - this is expected in Celery workers

    try:
        # Try to get the existing event loop
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            # Loop was closed (e.g., by previous asyncio.run() call)
            # Create a new one and set it as the current loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        # No event loop exists at all - create one
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Run the coroutine to completion WITHOUT closing the loop
    # The loop will persist for subsequent tasks in this worker process
    return loop.run_until_complete(coro)


def _make_json_safe(value: Any) -> Any:
    """Convert provider payloads into JSON-serializable primitives."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, Decimal):
        try:
            if value == value.to_integral_value():
                return int(value)
            return float(value)
        except Exception:
            return str(value)

    if isinstance(value, (datetime,)):
        return value.isoformat()

    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, Enum):
        return _make_json_safe(value.value)

    if isinstance(value, dict):
        return {str(key): _make_json_safe(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_make_json_safe(item) for item in value]

    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return _make_json_safe(model_dump())
        except Exception:
            return str(value)

    to_dict = getattr(value, "dict", None)
    if callable(to_dict):
        try:
            return _make_json_safe(to_dict())
        except Exception:
            return str(value)

    return str(value)


def _merge_task_result_data(
    existing: Any,
    patch: dict[str, Any],
    *,
    remove_keys: tuple[str, ...] = (),
) -> dict[str, Any]:
    """Merge task.result_data safely while allowing selected keys to be removed."""
    merged = dict(existing) if isinstance(existing, dict) else {}
    for key in remove_keys:
        merged.pop(key, None)
    merged.update(patch)
    return _make_json_safe(merged)


def _enum_value_or_str(value: Any) -> Optional[str]:
    """Return the persisted string value for SQLAlchemy enum-or-string columns."""
    if value is None:
        return None
    return value.value if hasattr(value, "value") else str(value)


def _has_wavespeed_terminal_state_bug(error_message: Any) -> bool:
    if not isinstance(error_message, str):
        return False
    return "has no attribute 'value'" in error_message.lower()


def _is_recoverable_wavespeed_failure(
    task: MediaTask,
    submission: Any,
) -> bool:
    if _enum_value_or_str(task.status) != TaskStatus.FAILED.value:
        return False
    if not isinstance(submission, dict) or submission.get("provider") != "wavespeed_ai":
        return False
    provider_task_id = str(task.task_id or submission.get("provider_task_id") or "").strip()
    if not provider_task_id:
        return False
    return _has_wavespeed_terminal_state_bug(task.error_message)


MAGNIFIC_IMAGE_POLL_POLICY = {
    "initial": 2,
    "base": 3,
    "max": 20,
    "timeout": 15 * 60,
}
MAGNIFIC_VIDEO_POLL_POLICY = {
    "initial": 5,
    "base": 10,
    "max": 60,
    "timeout": 60 * 60,
}
MAGNIFIC_UPSCALER_POLL_POLICY = {
    "initial": 10,
    "base": 20,
    "max": 90,
    "timeout": 90 * 60,
}


def _is_magnific_task(task: MediaTask, submission: Any = None) -> bool:
    if isinstance(submission, dict) and submission.get("provider") == "magnific":
        return True
    return str(task.model or "").strip().lower().startswith("magnific/")


def _get_magnific_poll_policy(model_id: str) -> dict[str, int]:
    if str(model_id or "").strip().lower() == "magnific/video-upscaler-precision":
        return MAGNIFIC_UPSCALER_POLL_POLICY
    if str(model_id or "").strip().lower().startswith("magnific/") and "video" in str(model_id or "").lower():
        return MAGNIFIC_VIDEO_POLL_POLICY
    return MAGNIFIC_IMAGE_POLL_POLICY


def _next_magnific_poll_delay(model_id: str, previous_delay: int | None = None, retry_after: int | None = None) -> int:
    policy = _get_magnific_poll_policy(model_id)
    if retry_after and retry_after > 0:
        return min(int(retry_after), policy["max"])
    if not previous_delay or previous_delay <= 0:
        return policy["initial"]
    return min(max(policy["base"], previous_delay * 2), policy["max"])


def _build_magnific_submission_record(
    *,
    provider_task_id: str | None,
    model_id: str,
    media_type: str,
    request_data: dict[str, Any],
) -> dict[str, Any]:
    from app.llm_proxy.providers.magnific_provider import MagnificProvider

    spec = MagnificProvider.MODEL_SPECS.get(model_id)
    endpoint = spec.endpoint if spec else None
    extra_params = request_data.get("extra_params") if isinstance(request_data.get("extra_params"), dict) else {}
    return _make_json_safe({
        "provider": "magnific",
        "provider_model_id": model_id,
        "provider_task_id": provider_task_id,
        "submit_endpoint": endpoint,
        "status_endpoint": f"{endpoint}/{{taskId}}" if endpoint else None,
        "dispatch_mode": spec.dispatch_mode if spec else "async-polling",
        "media_type": media_type,
        "pricing_snapshot": {
            "reserved_credits": extra_params.get("__reserved_credits"),
            "reserved_resolution": extra_params.get("__reserved_resolution"),
            "reserved_duration": extra_params.get("__reserved_duration"),
        },
        "sanitized_submission": {
            "prompt_length": len(str(request_data.get("prompt") or "")),
            "has_negative_prompt": bool(request_data.get("negative_prompt") or extra_params.get("negative_prompt")),
            "reference_image_count": len(request_data.get("reference_image_urls") or []),
            "reference_video_count": len(request_data.get("reference_video_urls") or ([] if not request_data.get("reference_video_url") else [request_data.get("reference_video_url")])),
            "resolution": request_data.get("resolution") or extra_params.get("resolution"),
            "duration": request_data.get("duration") or extra_params.get("duration"),
        },
    })


async def _rehost_provider_result_url(
    *,
    user_id: str | int,
    task_id: str,
    result_url: str,
    media_type: str,
) -> dict[str, Any]:
    from app.services.media_pipeline import (
        download_media,
        extract_metadata,
        generate_thumbnail,
        upload_to_r2,
    )

    tmp_dir = tempfile.mkdtemp(prefix=f"magnific_rehost_{task_id}_")
    try:
        file_path, file_size, content_type = await download_media(result_url, tmp_dir)
        thumb_path = await generate_thumbnail(file_path, media_type, tmp_dir)
        metadata = await extract_metadata(file_path, media_type)
        r2_info = await upload_to_r2(str(user_id), task_id, file_path, thumb_path, media_type)
        return _make_json_safe({
            "result_url": r2_info["result_url"],
            "thumbnail_url": r2_info.get("thumbnail_url"),
            "r2_keys": {
                "result": r2_info.get("result_key"),
                "thumbnail": r2_info.get("thumbnail_key"),
            },
            "metadata": {
                **metadata,
                "downloaded_content_type": content_type,
                "downloaded_file_size_bytes": file_size,
            },
        })
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def _mark_task_retrying_async(task_id: str, error: Exception, retry_after_seconds: int) -> None:
    """Move a task back to a non-terminal state while a Celery retry is pending."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(MediaTask).filter(MediaTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if task is None:
            return

        task.status = TaskStatus.PENDING
        task.error_message = None
        task.started_at = None
        task.completed_at = None
        task.result_data = _merge_task_result_data(
            task.result_data,
            {
                "retry": {
                    "scheduled": True,
                    "retry_after_seconds": retry_after_seconds,
                    "last_error": str(error),
                    "error_type": type(error).__name__,
                },
            },
            remove_keys=("failure",),
        )
        await db.commit()


async def _mark_task_failed_async(task_id: str, error: Exception) -> None:
    """Persist terminal failure only after retries are exhausted."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(MediaTask).filter(MediaTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if task is None:
            return

        task.status = TaskStatus.FAILED
        task.error_message = str(error)
        task.completed_at = datetime.utcnow()
        task.result_data = _merge_task_result_data(
            task.result_data,
            {
                "failure": {
                    "error": str(error),
                    "error_type": type(error).__name__,
                },
            },
            remove_keys=("retry",),
        )
        await db.commit()


def _is_non_retryable_media_error(error: Exception) -> bool:
    """Return true for provider refusals that another Celery retry cannot fix."""
    message = str(error).lower()
    if not message:
        return False
    permanent_markers = (
        "content policy",
        "safety policy",
        "moderation",
        "prohibited",
        "disallowed",
        "not allowed",
        "violat",
        "nsfw",
        "invalid prompt",
        "invalid voice parameter",
        "insufficient credits",
        "credits insufficient",
        "not enough credits",
        "current balance",
        "sensitive content",
    )
    if any(marker in message for marker in permanent_markers):
        return True
    return ("we're so sorry" in message or "we are so sorry" in message) and "prompt" in message


def _extract_model_query_endpoint(config_json: Any) -> Optional[str]:
    """Extract model-specific status/query endpoint from configJson."""
    if not config_json:
        return None

    cfg = config_json
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except json.JSONDecodeError:
            return None

    if not isinstance(cfg, dict):
        return None

    endpoint = (
        cfg.get("apiQueryEndpoint")
        or cfg.get("queryEndpoint")
        or cfg.get("statusEndpoint")
        or cfg.get("apiStatusEndpoint")
    )
    if isinstance(endpoint, str) and endpoint.strip():
        return endpoint.strip()
    return None


def _normalize_kie_task_state(status_response: dict) -> tuple[str, str]:
    """Normalize provider state to one of: success, fail, processing, unknown."""
    if not isinstance(status_response, dict):
        return "unknown", ""

    data = status_response.get("data", {})
    if not isinstance(data, dict):
        data = {}

    def _normalize_success_flag(value: Any) -> Any:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized.isdigit():
                return int(normalized)
            if normalized == "true":
                return 1
            if normalized == "false":
                return 0
        return value

    result_url = _extract_first_kie_result_url(status_response)
    if result_url:
        return "success", "result_url"

    success_flag = _normalize_success_flag(data.get("successFlag"))
    if success_flag == 1:
        return "success", "successflag_1"
    if success_flag in (2, 3):
        return "fail", f"successflag_{success_flag}"
    if success_flag == 0:
        error_code = data.get("errorCode")
        error_message = data.get("errorMessage")
        if error_code or error_message:
            return "fail", "successflag_error"
        return "processing", "successflag_0"

    error_code = data.get("errorCode")
    error_message = data.get("errorMessage")
    if error_code or error_message:
        return "fail", "provider_error"

    complete_time = data.get("completeTime") or data.get("complete_time")
    if complete_time:
        return "success", "complete_time"

    raw_state = str(
        status_response.get("state", "")
        or data.get("state", "")
        or status_response.get("status", "")
        or data.get("status", "")
        or (data.get("response", {}) if isinstance(data.get("response"), dict) else {}).get("state", "")
        or (data.get("response", {}) if isinstance(data.get("response"), dict) else {}).get("status", "")
        or (data.get("taskResult", {}) if isinstance(data.get("taskResult"), dict) else {}).get("state", "")
        or (data.get("taskResult", {}) if isinstance(data.get("taskResult"), dict) else {}).get("status", "")
    ).strip().lower()

    if raw_state in {"success", "completed", "complete", "done", "finished", "finish"}:
        return "success", raw_state
    if raw_state in {"fail", "failed", "error", "cancelled", "canceled"}:
        return "fail", raw_state
    if raw_state in {"pending", "processing", "running", "created", "queued", "queueing", "in_progress", "in-progress"}:
        return "processing", raw_state
    if raw_state:
        return "unknown", raw_state

    code = status_response.get("code")
    if isinstance(code, int) and code != 200:
        msg = str(status_response.get("msg") or status_response.get("message") or "").lower()
        if any(x in msg for x in ("null", "not found", "not success", "processing", "pending")):
            return "processing", msg or f"code_{code}"
        return "fail", msg or f"code_{code}"

    return "unknown", ""


def _extract_kie_failure_message(status_response: dict) -> str:
    """Extract a provider failure message without treating top-level msg=success as an error."""
    if not isinstance(status_response, dict):
        return "Unknown error from provider"

    data = status_response.get("data", {})
    if not isinstance(data, dict):
        data = {}

    def _message_from(value: Any) -> Optional[str]:
        if isinstance(value, str):
            text = value.strip()
            if text and text.lower() not in {"success", "ok"}:
                return text
            return None
        if isinstance(value, dict):
            for key in ("message", "detail", "error", "errorMessage", "msg"):
                nested = _message_from(value.get(key))
                if nested:
                    return nested
        return None

    for candidate in (
        data.get("failMsg"),
        data.get("errorMessage"),
        data.get("error"),
        data.get("message"),
        data.get("msg"),
        status_response.get("failMsg"),
        status_response.get("error"),
        status_response.get("message"),
        status_response.get("msg"),
    ):
        message = _message_from(candidate)
        if message:
            return message

    error_code = data.get("errorCode") or status_response.get("errorCode")
    if error_code not in (None, ""):
        return f"Provider error code: {error_code}"
    return "Unknown error from provider"


def _normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]:
    """Normalize BytePlus task status to internal state.

    Returns a (normalized_state, raw_status) tuple where normalized_state is
    one of: 'success', 'fail', 'processing', 'unknown'.

    BytePlus status values: succeeded, failed, cancelled, queued, processing.
    """
    raw_status = status_response.get("status", "")
    if raw_status == "succeeded":
        return "success", "succeeded"
    if raw_status in ("failed", "cancelled"):
        return "fail", raw_status
    if raw_status in ("queued", "processing"):
        return "processing", raw_status
    return "unknown", raw_status


def _extract_byteplus_result_url(status_response: dict) -> Optional[str]:
    """Extract result URL from BytePlus task status response.

    Iterates over status_response['content'] items. Returns the first URL found
    in a 'video_url' or 'image_url' item that starts with 'http'. Returns None
    if no valid URL is found.
    """
    for item in status_response.get("content", []):
        item_type = item.get("type")
        if item_type == "video_url":
            url = item.get("video_url", {}).get("url", "")
            if url.startswith("http"):
                return url
        elif item_type == "image_url":
            url = item.get("image_url", {}).get("url", "")
            if url.startswith("http"):
                return url
    return None


def _extract_url_from_value(value: Any) -> Optional[str]:
    """Extract a media URL from common provider response value shapes."""
    if isinstance(value, str) and value.startswith("http"):
        return value

    if isinstance(value, dict):
        for key in ("url", "image_url", "video_url", "audio_url", "imageUrl", "videoUrl", "audioUrl", "result_url"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.startswith("http"):
                return candidate

    return None


def _extract_first_kie_result_url(status_response: dict) -> Optional[str]:
    """Extract the first result URL from known Kie response shapes."""
    if not isinstance(status_response, dict):
        return None

    data = status_response.get("data", {})
    if not isinstance(data, dict):
        data = {}

    result_json = data.get("resultJson")
    if isinstance(result_json, str):
        try:
            result_json = json.loads(result_json)
        except json.JSONDecodeError:
            result_json = {}
    if isinstance(result_json, dict):
        result_urls = result_json.get("resultUrls")
        if isinstance(result_urls, list):
            for item in result_urls:
                url = _extract_url_from_value(item)
                if url:
                    return url
        url = _extract_url_from_value(result_json)
        if url:
            return url

    task_result = data.get("taskResult")
    if isinstance(task_result, dict):
        for key in ("images", "videos", "audios", "files", "outputs", "resultUrls"):
            items = task_result.get(key)
            if isinstance(items, list):
                for item in items:
                    url = _extract_url_from_value(item)
                    if url:
                        return url
            elif items is not None:
                url = _extract_url_from_value(items)
                if url:
                    return url
        url = _extract_url_from_value(task_result)
        if url:
            return url

    provider_response = data.get("response")
    if isinstance(provider_response, dict):
        result_urls = provider_response.get("resultUrls") or provider_response.get("urls")
        if isinstance(result_urls, list):
            for item in result_urls:
                url = _extract_url_from_value(item)
                if url:
                    return url
        url = _extract_url_from_value(provider_response)
        if url:
            return url

    output = data.get("output")
    if isinstance(output, list):
        for item in output:
            url = _extract_url_from_value(item)
            if url:
                return url
    elif output is not None:
        url = _extract_url_from_value(output)
        if url:
            return url

    url = _extract_url_from_value(data)
    if url:
        return url
    return _extract_url_from_value(status_response)


def _coerce_json_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def _normalize_utc_datetime(value: Any) -> Optional[datetime]:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _get_wavespeed_poll_age_seconds(task: MediaTask) -> float:
    anchor = _normalize_utc_datetime(task.started_at) or _normalize_utc_datetime(task.created_at)
    if anchor is None:
        return 0.0
    return max(0.0, (datetime.now(timezone.utc) - anchor).total_seconds())


def _get_wavespeed_requested_duration(
    request_data: dict[str, Any],
    submission: dict[str, Any],
) -> int:
    request_summary = submission.get("request_summary")
    if isinstance(request_summary, dict):
        requested_duration = request_summary.get("requested_duration") or request_summary.get("duration")
        if isinstance(requested_duration, (int, float)) and requested_duration > 0:
            return int(requested_duration)
        if isinstance(requested_duration, str) and requested_duration.strip().isdigit():
            return int(requested_duration.strip())

    raw_duration = request_data.get("duration")
    if isinstance(raw_duration, (int, float)) and raw_duration > 0:
        return int(raw_duration)

    extra_params = request_data.get("extra_params")
    if isinstance(extra_params, dict):
        extra_duration = extra_params.get("duration") or extra_params.get("seconds")
        if isinstance(extra_duration, (int, float)) and extra_duration > 0:
            return int(extra_duration)
        if isinstance(extra_duration, str) and extra_duration.strip().isdigit():
            return int(extra_duration.strip())

    return 5


def _enqueue_wavespeed_poll(task_id: str, delay_seconds: int) -> None:
    poll_wavespeed_video_task.apply_async(args=[task_id], countdown=max(0, int(delay_seconds)))


def _enqueue_magnific_poll(task_id: str, delay_seconds: int) -> None:
    poll_magnific_media_task.apply_async(args=[task_id], countdown=max(0, int(delay_seconds)))


async def _poll_wavespeed_video_task_async(
    task_id: str,
    *,
    schedule_next_poll: bool = True,
) -> dict[str, Any]:
    from app.llm_proxy.providers.wavespeed_media_provider import (
        WAVESPEED_RETRYABLE_POLL_STATUS_CODES,
        WaveSpeedMediaProvider,
    )
    from app.services.media_provider_service import get_media_provider_key
    import httpx

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(MediaTask).filter(MediaTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if task is None:
            return {"status": "missing", "task_id": task_id}

        result_data = _coerce_json_dict(task.result_data)
        submission = result_data.get("submission")
        persisted_state = _enum_value_or_str(task.status)

        if (
            persisted_state == TaskStatus.FAILED.value
            and _is_recoverable_wavespeed_failure(task, submission)
            and isinstance(task.result_url, str)
            and task.result_url.strip()
        ):
            task.status = TaskStatus.COMPLETED
            task.error_message = None
            task.completed_at = task.completed_at or datetime.now(timezone.utc)
            await db.commit()
            return {
                "status": "completed",
                "task_id": task_id,
                "result_url": task.result_url,
                "recovered": True,
            }

        if persisted_state in {TaskStatus.COMPLETED.value, TaskStatus.FAILED.value, TaskStatus.CANCELLED.value} and not (
            persisted_state == TaskStatus.FAILED.value
            and _is_recoverable_wavespeed_failure(task, submission)
        ):
            return {
                "status": "terminal",
                "task_id": task_id,
                "state": persisted_state,
            }

        if not isinstance(submission, dict) or submission.get("provider") != "wavespeed_ai":
            return {"status": "skipped", "task_id": task_id}

        polling_state = result_data.get("polling")
        polling_state = polling_state if isinstance(polling_state, dict) else {}
        attempts = int(polling_state.get("attempts") or 0)
        previous_delay = int(
            polling_state.get("next_delay_seconds")
            or polling_state.get("last_delay_seconds")
            or WaveSpeedMediaProvider.POLL_INITIAL_SECONDS
        )
        now = datetime.now(timezone.utc)
        provider_task_id = str(task.task_id or submission.get("provider_task_id") or "").strip()

        if not provider_task_id:
            task.status = TaskStatus.FAILED
            task.error_message = "WaveSpeed submission metadata is missing provider_task_id"
            task.completed_at = now
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "failure": {
                        "error": task.error_message,
                        "error_type": "WaveSpeedSubmissionError",
                    },
                },
                remove_keys=("retry",),
            )
            await db.commit()
            return {"status": "failed", "task_id": task_id}

        age_seconds = _get_wavespeed_poll_age_seconds(task)
        if age_seconds >= WaveSpeedMediaProvider.POLL_TIMEOUT_SECONDS:
            last_raw_status = str(polling_state.get("raw_status") or "unknown")
            error_message = f"WaveSpeed polling timed out after 30 minutes (last status: {last_raw_status})"
            task.status = TaskStatus.FAILED
            task.error_message = error_message
            task.completed_at = now
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "wavespeed_ai",
                        "state": "timeout",
                        "attempts": attempts,
                        "raw_status": last_raw_status,
                        "last_polled_at": now.isoformat(),
                        "last_delay_seconds": previous_delay,
                    },
                    "failure": {
                        "error": error_message,
                        "error_type": "WaveSpeedPollingTimeoutError",
                        "raw_status": last_raw_status,
                    },
                },
                remove_keys=("retry",),
            )
            await db.commit()
            return {"status": "failed", "task_id": task_id, "reason": "timeout"}

        provider_config = await get_media_provider_key("wavespeed_ai")
        if not provider_config or not provider_config.get("apiKey"):
            next_delay = WaveSpeedMediaProvider.calculate_next_poll_delay(previous_delay)
            task.status = TaskStatus.PROCESSING
            task.error_message = None
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "wavespeed_ai",
                        "state": "processing",
                        "attempts": attempts + 1,
                        "raw_status": str(polling_state.get("raw_status") or ""),
                        "last_polled_at": now.isoformat(),
                        "last_delay_seconds": previous_delay,
                        "next_delay_seconds": next_delay,
                        "last_error": "WaveSpeed provider configuration unavailable during polling",
                    },
                },
                remove_keys=("failure",),
            )
            await db.commit()
            if schedule_next_poll:
                _enqueue_wavespeed_poll(task.id, next_delay)
            return {"status": "processing", "task_id": task_id, "next_delay_seconds": next_delay}

        provider = None
        try:
            provider = WaveSpeedMediaProvider(
                api_key=provider_config["apiKey"],
                base_url=submission.get("base_url"),
                submit_endpoint=submission.get("submit_endpoint"),
                result_endpoint_template=submission.get("result_endpoint_template"),
                provider_model_id=submission.get("provider_model_id"),
            )
            poll_result = await provider.poll_prediction(provider_task_id)
        except httpx.TimeoutException:
            next_delay = WaveSpeedMediaProvider.calculate_next_poll_delay(previous_delay)
            task.status = TaskStatus.PROCESSING
            task.error_message = None
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "wavespeed_ai",
                        "state": "processing",
                        "attempts": attempts + 1,
                        "raw_status": str(polling_state.get("raw_status") or ""),
                        "last_polled_at": now.isoformat(),
                        "last_delay_seconds": previous_delay,
                        "next_delay_seconds": next_delay,
                        "last_error": "WaveSpeed polling request timed out",
                    },
                },
                remove_keys=("failure",),
            )
            await db.commit()
            if schedule_next_poll:
                _enqueue_wavespeed_poll(task.id, next_delay)
            return {"status": "processing", "task_id": task_id, "next_delay_seconds": next_delay}
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in WAVESPEED_RETRYABLE_POLL_STATUS_CODES:
                retry_after = WaveSpeedMediaProvider.extract_retry_after_seconds(exc.response.headers)
                next_delay = WaveSpeedMediaProvider.calculate_next_poll_delay(previous_delay, retry_after)
                task.status = TaskStatus.PROCESSING
                task.error_message = None
                task.result_data = _merge_task_result_data(
                    result_data,
                    {
                        "polling": {
                            "provider": "wavespeed_ai",
                            "state": "processing",
                            "attempts": attempts + 1,
                            "raw_status": str(polling_state.get("raw_status") or ""),
                            "last_polled_at": now.isoformat(),
                            "last_delay_seconds": previous_delay,
                            "next_delay_seconds": next_delay,
                            "last_error": f"WaveSpeed poll HTTP {exc.response.status_code}",
                            "last_http_status": exc.response.status_code,
                        },
                    },
                    remove_keys=("failure",),
                )
                await db.commit()
                if schedule_next_poll:
                    _enqueue_wavespeed_poll(task.id, next_delay)
                return {"status": "processing", "task_id": task_id, "next_delay_seconds": next_delay}

            task.status = TaskStatus.FAILED
            task.error_message = f"WaveSpeed poll HTTP {exc.response.status_code}"
            task.completed_at = now
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "wavespeed_ai",
                        "state": "failed",
                        "attempts": attempts + 1,
                        "raw_status": str(polling_state.get("raw_status") or ""),
                        "last_polled_at": now.isoformat(),
                        "last_delay_seconds": previous_delay,
                        "last_http_status": exc.response.status_code,
                    },
                    "failure": {
                        "error": task.error_message,
                        "error_type": "WaveSpeedPollingHttpError",
                        "http_status_code": exc.response.status_code,
                    },
                },
                remove_keys=("retry",),
            )
            await db.commit()
            return {"status": "failed", "task_id": task_id}
        finally:
            if provider is not None:
                await provider.aclose()

        if poll_result.state == "success" and poll_result.result_url:
            actual_duration = _get_wavespeed_requested_duration(
                _coerce_json_dict(task.parameters),
                submission,
            )
            task.status = TaskStatus.COMPLETED
            task.error_message = None
            task.result_url = poll_result.result_url
            task.completed_at = now
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "wavespeed_ai",
                        "state": "completed",
                        "attempts": attempts + 1,
                        "raw_status": poll_result.raw_status,
                        "last_polled_at": now.isoformat(),
                        "last_delay_seconds": previous_delay,
                    },
                    "provider_status": poll_result.raw_status,
                    "provider_response": poll_result.raw_response,
                    "actual_duration": actual_duration,
                },
                remove_keys=("failure", "retry"),
            )
            await db.commit()
            return {"status": "completed", "task_id": task_id, "result_url": poll_result.result_url}

        if poll_result.state == "failure":
            task.status = TaskStatus.FAILED
            task.error_message = f"WaveSpeed failed: {(poll_result.error_message or 'Unknown error')[:200]}"
            task.completed_at = now
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "wavespeed_ai",
                        "state": "failed",
                        "attempts": attempts + 1,
                        "raw_status": poll_result.raw_status,
                        "last_polled_at": now.isoformat(),
                        "last_delay_seconds": previous_delay,
                    },
                    "provider_status": poll_result.raw_status,
                    "provider_response": poll_result.raw_response,
                    "failure": {
                        "error": poll_result.error_message or "WaveSpeed returned a terminal failure",
                        "error_type": "WaveSpeedTerminalError",
                        "raw_status": poll_result.raw_status,
                    },
                },
                remove_keys=("retry",),
            )
            await db.commit()
            return {"status": "failed", "task_id": task_id}

        next_delay = WaveSpeedMediaProvider.calculate_next_poll_delay(previous_delay)
        task.status = TaskStatus.PROCESSING
        task.error_message = None
        task.result_data = _merge_task_result_data(
            result_data,
            {
                "polling": {
                    "provider": "wavespeed_ai",
                    "state": "processing",
                    "attempts": attempts + 1,
                    "raw_status": poll_result.raw_status,
                    "last_polled_at": now.isoformat(),
                    "last_delay_seconds": previous_delay,
                    "next_delay_seconds": next_delay,
                },
                "provider_status": poll_result.raw_status,
            },
            remove_keys=("failure",),
        )
        await db.commit()
        if schedule_next_poll:
            _enqueue_wavespeed_poll(task.id, next_delay)
        return {"status": "processing", "task_id": task_id, "next_delay_seconds": next_delay}


async def _poll_magnific_media_task_async(
    task_id: str,
    *,
    schedule_next_poll: bool = True,
) -> dict[str, Any]:
    from app.llm_proxy.providers.magnific_provider import MagnificProvider, MagnificProviderError
    from app.services.media_provider_service import get_media_provider_key

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(MediaTask).filter(MediaTask.id == task_id))
        task = result.scalar_one_or_none()
        if task is None:
            return {"status": "missing", "task_id": task_id}

        result_data = _coerce_json_dict(task.result_data)
        submission = result_data.get("submission")
        persisted_state = _enum_value_or_str(task.status)
        if persisted_state in {TaskStatus.COMPLETED.value, TaskStatus.FAILED.value, TaskStatus.CANCELLED.value}:
            return {"status": "terminal", "task_id": task_id, "state": persisted_state}
        if not _is_magnific_task(task, submission):
            return {"status": "skipped", "task_id": task_id}

        provider_task_id = str(task.task_id or (submission or {}).get("provider_task_id") or "").strip()
        now = datetime.now(timezone.utc)
        if not provider_task_id:
            task.status = TaskStatus.FAILED
            task.error_message = "Magnific submission metadata is missing provider_task_id"
            task.completed_at = now
            task.result_data = _merge_task_result_data(
                result_data,
                {"failure": {"error": task.error_message, "error_type": "MagnificSubmissionMetadataError"}},
                remove_keys=("retry",),
            )
            await db.commit()
            return {"status": "failed", "task_id": task_id}

        model_id = str((submission or {}).get("provider_model_id") or task.model or "").strip()
        media_type = str((submission or {}).get("media_type") or task.media_type or "image").strip().lower()
        policy = _get_magnific_poll_policy(model_id)
        polling_state = result_data.get("polling") if isinstance(result_data.get("polling"), dict) else {}
        attempts = int(polling_state.get("attempts") or 0)
        previous_delay = int(polling_state.get("next_delay_seconds") or polling_state.get("last_delay_seconds") or 0)
        started_at = task.started_at or task.created_at or now
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        age_seconds = (now - started_at).total_seconds()
        if age_seconds >= policy["timeout"]:
            task.status = TaskStatus.FAILED
            task.error_message = "Magnific polling timed out"
            task.completed_at = now
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "magnific",
                        "state": "timeout",
                        "attempts": attempts,
                        "last_polled_at": now.isoformat(),
                    },
                    "failure": {
                        "error": task.error_message,
                        "error_type": "MagnificPollingTimeoutError",
                    },
                },
                remove_keys=("retry",),
            )
            await db.commit()
            return {"status": "failed", "task_id": task_id, "reason": "timeout"}

        provider_config = await get_media_provider_key("magnific")
        if not provider_config or not provider_config.get("apiKey"):
            next_delay = _next_magnific_poll_delay(model_id, previous_delay)
            task.status = TaskStatus.PROCESSING
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "magnific",
                        "state": "processing",
                        "attempts": attempts + 1,
                        "last_polled_at": now.isoformat(),
                        "last_delay_seconds": previous_delay,
                        "next_delay_seconds": next_delay,
                        "last_error": "Magnific provider configuration unavailable during polling",
                    },
                },
                remove_keys=("failure",),
            )
            await db.commit()
            if schedule_next_poll:
                _enqueue_magnific_poll(task.id, next_delay)
            return {"status": "processing", "task_id": task_id, "next_delay_seconds": next_delay}

        client = None
        try:
            client = MagnificProvider(
                api_key=provider_config["apiKey"],
                base_url=provider_config.get("baseUrl"),
            )
            status_result = await client.get_task_status(model_id, provider_task_id, media_type)
        except MagnificProviderError as exc:
            if exc.category in {"timeout", "provider_unavailable", "rate_limit"}:
                retry_after = None
                next_delay = _next_magnific_poll_delay(model_id, previous_delay, retry_after)
                task.status = TaskStatus.PROCESSING
                task.result_data = _merge_task_result_data(
                    result_data,
                    {
                        "polling": {
                            "provider": "magnific",
                            "state": "processing",
                            "attempts": attempts + 1,
                            "last_polled_at": now.isoformat(),
                            "last_delay_seconds": previous_delay,
                            "next_delay_seconds": next_delay,
                            "last_error": str(exc),
                            "last_error_category": exc.category,
                        },
                    },
                    remove_keys=("failure",),
                )
                await db.commit()
                if schedule_next_poll:
                    _enqueue_magnific_poll(task.id, next_delay)
                return {"status": "processing", "task_id": task_id, "next_delay_seconds": next_delay}

            task.status = TaskStatus.FAILED
            task.error_message = str(exc)
            task.completed_at = now
            provider_detail = getattr(exc, "provider_detail", None)
            failure_payload = {
                "error": str(exc),
                "error_type": "MagnificProviderError",
                "category": exc.category,
            }
            if isinstance(provider_detail, dict):
                failure_payload["provider_message"] = _extract_first_string(
                    provider_detail.get("message"),
                    provider_detail.get("detail"),
                    provider_detail.get("error"),
                )
                failure_payload["provider_detail"] = _mask_sensitive_debug_value(provider_detail)
                provider_response = provider_detail.get("response")
                if provider_response is not None:
                    failure_payload["provider_response"] = _mask_sensitive_debug_value(provider_response)
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "magnific",
                        "state": "failed",
                        "attempts": attempts + 1,
                        "last_polled_at": now.isoformat(),
                        "last_error_category": exc.category,
                    },
                    "failure": failure_payload,
                },
                remove_keys=("retry",),
            )
            await db.commit()
            return {"status": "failed", "task_id": task_id}
        finally:
            if client is not None:
                await client.aclose()

        provider_status = str(status_result.get("status") or "processing")
        if provider_status == "completed":
            data = status_result.get("data") if isinstance(status_result.get("data"), list) else []
            provider_url = data[0].get("url") if data and isinstance(data[0], dict) else None
            if not provider_url:
                task.status = TaskStatus.FAILED
                task.error_message = "Magnific completed without a result URL"
                task.completed_at = now
                task.result_data = _merge_task_result_data(
                    result_data,
                    {"failure": {"error": task.error_message, "error_type": "MagnificResultExtractionError"}},
                    remove_keys=("retry",),
                )
                await db.commit()
                return {"status": "failed", "task_id": task_id}

            try:
                rehosted = await _rehost_provider_result_url(
                    user_id=task.user_id,
                    task_id=task.id,
                    result_url=provider_url,
                    media_type=media_type,
                )
            except Exception as exc:
                task.status = TaskStatus.FAILED
                task.error_message = "Magnific result re-hosting failed"
                task.completed_at = now
                task.result_data = _merge_task_result_data(
                    result_data,
                    {
                        "failure": {
                            "error": task.error_message,
                            "error_type": type(exc).__name__,
                        },
                    },
                    remove_keys=("retry",),
                )
                await db.commit()
                return {"status": "failed", "task_id": task_id, "reason": "rehost_failed"}

            task.status = TaskStatus.COMPLETED
            task.error_message = None
            task.result_url = rehosted["result_url"]
            task.completed_at = now
            task.result_data = _merge_task_result_data(
                result_data,
                {
                    "polling": {
                        "provider": "magnific",
                        "state": "completed",
                        "attempts": attempts + 1,
                        "provider_status": provider_status,
                        "last_polled_at": now.isoformat(),
                    },
                    "provider_status": provider_status,
                    "result": {
                        "url": rehosted["result_url"],
                        "thumbnail_url": rehosted.get("thumbnail_url"),
                    },
                    "r2_keys": rehosted.get("r2_keys"),
                    "metadata": rehosted.get("metadata"),
                },
                remove_keys=("failure", "retry"),
            )
            await db.commit()
            return {"status": "completed", "task_id": task_id, "result_url": task.result_url}

        next_delay = _next_magnific_poll_delay(model_id, previous_delay)
        task.status = TaskStatus.PROCESSING
        task.error_message = None
        task.result_data = _merge_task_result_data(
            result_data,
            {
                "polling": {
                    "provider": "magnific",
                    "state": provider_status if provider_status in {"queued", "processing"} else "processing",
                    "attempts": attempts + 1,
                    "provider_status": provider_status,
                    "last_polled_at": now.isoformat(),
                    "last_delay_seconds": previous_delay,
                    "next_delay_seconds": next_delay,
                },
            },
            remove_keys=("failure",),
        )
        await db.commit()
        if schedule_next_poll:
            _enqueue_magnific_poll(task.id, next_delay)
        return {"status": "processing", "task_id": task_id, "next_delay_seconds": next_delay}


SENSITIVE_DEBUG_FIELD_MARKERS = (
    "api_key",
    "apikey",
    "authorization",
    "token",
    "secret",
    "password",
)


def _truncate_debug_text(value: Optional[str], limit: int = 2000) -> Optional[str]:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if len(trimmed) <= limit:
        return trimmed
    return f"{trimmed[:limit]}...(truncated)"


def _mask_sensitive_debug_value(value: Any, key_hint: Optional[str] = None) -> Any:
    normalized_key = str(key_hint or "").lower()
    if any(marker in normalized_key for marker in SENSITIVE_DEBUG_FIELD_MARKERS):
        return "***redacted***"

    if isinstance(value, dict):
        return {
            str(k): _mask_sensitive_debug_value(v, str(k))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_mask_sensitive_debug_value(item, key_hint) for item in value]
    if isinstance(value, str):
        return _truncate_debug_text(value, limit=3000)
    return value


def _extract_first_string(*values: Any) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _infer_audio_provider_hint(model: Any, api_config: dict[str, Any]) -> str:
    provider_raw = str(api_config.get("provider") or "").strip().lower()
    if "uvoice" in provider_raw:
        return "uvoice"
    if "wavespeed" in provider_raw:
        return "wavespeed_ai"
    if "elevenlabs" in provider_raw or "eleven_labs" in provider_raw:
        return "elevenlabs"
    if "kie" in provider_raw:
        return "kie_ai"

    model_raw = str(model or "").strip().lower()
    if model_raw.startswith("uvoice/"):
        return "uvoice"
    if (
        model_raw.startswith("wavespeed/")
        or model_raw.startswith("wavespeed-ai/elevenlabs/")
        or model_raw.startswith("google/lyria-")
        or model_raw.startswith("google/gemini-")
        or model_raw.startswith("alibaba/qwen3-tts")
    ):
        return "wavespeed_ai"
    if model_raw.startswith("elevenlabs/"):
        return "elevenlabs"
    return "kie_ai"


def _resolve_audio_api_target(provider_hint: str, api_config: dict[str, Any]) -> tuple[str, str]:
    endpoint = _extract_first_string(
        api_config.get("endpoint"),
        api_config.get("api_endpoint"),
        api_config.get("apiEndpoint"),
    )
    if not endpoint:
        if provider_hint == "uvoice":
            endpoint = "/generate"
        elif provider_hint == "elevenlabs":
            endpoint = "/v1"
        else:
            endpoint = "/api/v1/jobs/createTask"

    if endpoint.startswith("http://") or endpoint.startswith("https://"):
        return endpoint, endpoint

    base_url = _extract_first_string(
        api_config.get("base_url"),
        api_config.get("baseUrl"),
        api_config.get("url"),
    )
    if not base_url:
        if provider_hint == "uvoice":
            base_url = "https://api.uvoice.ai"
        elif provider_hint == "wavespeed_ai":
            base_url = "https://api.wavespeed.ai/api/v3"
        elif provider_hint == "elevenlabs":
            base_url = "https://api.elevenlabs.io"
        else:
            base_url = "https://api.kie.ai/api/v1"

    if provider_hint == "kie_ai" and endpoint.startswith("/api/v1/"):
        endpoint = endpoint[len("/api/v1/"):]

    request_url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    return endpoint, request_url


def _build_uvoice_payload_preview(
    request_data: dict[str, Any],
    api_config: dict[str, Any],
    selected_voice_id: Optional[str],
) -> dict[str, Any]:
    extra_params = request_data.get("extra_params") if isinstance(request_data.get("extra_params"), dict) else {}
    settings: dict[str, Any] = {}

    text_value = request_data.get("text")
    if isinstance(text_value, str):
        settings["text"] = _truncate_debug_text(text_value, limit=1200)

    if selected_voice_id:
        settings["voiceID"] = selected_voice_id

    for key in ("speed", "volume", "pitch", "key"):
        value = request_data.get(key)
        if value is None and isinstance(extra_params, dict):
            value = extra_params.get(key)
        if value is not None:
            settings[key] = value

    auto_break = request_data.get("auto_break")
    if auto_break is None and isinstance(extra_params, dict):
        auto_break = (
            extra_params.get("autoBreak")
            if "autoBreak" in extra_params
            else extra_params.get("auto_break")
        )
    if auto_break is not None:
        settings["autoBreak"] = auto_break

    output_format = _extract_first_string(
        request_data.get("output_format"),
        request_data.get("outputFormat"),
        extra_params.get("output_format") if isinstance(extra_params, dict) else None,
        extra_params.get("outputFormat") if isinstance(extra_params, dict) else None,
    ) or "mp3"
    output_type = _extract_first_string(
        request_data.get("output_type"),
        request_data.get("outputType"),
        extra_params.get("output_type") if isinstance(extra_params, dict) else None,
        extra_params.get("outputType") if isinstance(extra_params, dict) else None,
    ) or "url"
    settings["outputFormat"] = output_format
    settings["outputType"] = output_type

    payload: dict[str, Any] = {"settings": settings}
    explicit_model = _extract_first_string(
        api_config.get("uvoice_model_id"),
        api_config.get("uvoiceModelId"),
        api_config.get("model_id"),
        api_config.get("modelId"),
    )
    if explicit_model:
        payload["model"] = explicit_model
    return payload


def _build_audio_debug_request_snapshot(request_data: dict[str, Any]) -> dict[str, Any]:
    api_config_raw = request_data.get("api_config")
    api_config = api_config_raw if isinstance(api_config_raw, dict) else {}
    extra_params_raw = request_data.get("extra_params")
    extra_params = extra_params_raw if isinstance(extra_params_raw, dict) else {}

    selected_voice_id = _extract_first_string(
        request_data.get("voice_id"),
        request_data.get("voice"),
        extra_params.get("voiceID"),
        extra_params.get("voiceId"),
        extra_params.get("voice_id"),
        extra_params.get("voice"),
    )
    provider_hint = _infer_audio_provider_hint(request_data.get("model"), api_config)
    endpoint, request_url = _resolve_audio_api_target(provider_hint, api_config)

    if provider_hint == "uvoice":
        provider_payload = _build_uvoice_payload_preview(request_data, api_config, selected_voice_id)
    elif provider_hint == "wavespeed_ai":
        text_input_key = _extract_first_string(
            api_config.get("text_input_key"),
            api_config.get("textInputKey"),
        ) or "text"
        provider_payload = {
            key: _mask_sensitive_debug_value(value, key)
            for key, value in extra_params.items()
            if value is not None
        }
        provider_payload[text_input_key] = _truncate_debug_text(
            str(request_data.get("text") or ""),
            limit=1200,
        )
        if request_data.get("voice"):
            provider_payload.setdefault("voice", request_data.get("voice"))
        if request_data.get("voice_id"):
            provider_payload.setdefault("voice_id", request_data.get("voice_id"))
        if request_data.get("speed") is not None:
            provider_payload.setdefault("speed", request_data.get("speed"))
        if request_data.get("output_format"):
            provider_payload.setdefault("format", request_data.get("output_format"))
    else:
        provider_payload = {
            "model": request_data.get("model"),
            "text": _truncate_debug_text(str(request_data.get("text") or ""), limit=1200),
            "voice": request_data.get("voice"),
            "voice_id": request_data.get("voice_id"),
            "speed": request_data.get("speed"),
            "extra_params": extra_params,
        }

    text_value = str(request_data.get("text") or "")
    return _mask_sensitive_debug_value({
        "provider_hint": provider_hint,
        "selected_voice_id": selected_voice_id,
        "text_length": len(text_value),
        "text_preview": _truncate_debug_text(text_value, limit=320),
        "api": {
            "provider": provider_hint,
            "method": "POST",
            "endpoint": endpoint,
            "request_url": request_url,
            "voice_id": selected_voice_id,
            "request_payload": provider_payload,
        },
    })


def _extract_exception_debug_payload(error: Exception) -> dict[str, Any]:
    status_code = getattr(error, "status_code", None)
    detail = getattr(error, "detail", None)

    parsed_message = None
    provider_detail: Any = None
    if isinstance(detail, dict):
        parsed_message = _extract_first_string(
            detail.get("message"),
            detail.get("detail"),
            detail.get("error"),
        )
        provider_detail = detail
    elif isinstance(detail, str):
        parsed_message = detail.strip() or None
        provider_detail = detail

    return {
        "status_code": int(status_code) if isinstance(status_code, int) else None,
        "message": parsed_message or str(error),
        "detail": _mask_sensitive_debug_value(provider_detail),
    }


async def _send_failure_notifications(task_id: str, user_id: str, media_type: str, error: str):
    """Send in-app + email notifications on final task failure."""
    async with AsyncSessionLocal() as db:
        try:
            from app.services.notification_service import notify_task_failed, notify_admin_task_alert

            # Notify the user who owns the task
            await notify_task_failed(
                db=db, user_id=str(user_id), task_id=task_id,
                media_type=media_type, error=error,
            )

            # Notify all admins
            await notify_admin_task_alert(
                db=db,
                title=f"Media task failed after max retries",
                message=f"User {user_id} — {media_type} task {task_id}: {error[:200]}",
                data={"task_id": task_id, "user_id": user_id, "media_type": media_type},
                send_email=True,
            )
        except Exception as notify_err:
            logger.warning("failure_notification_error", task_id=task_id, error=str(notify_err))


async def _generate_image_async(task_id: str, user_id: str, request_data: dict):
    """
    Async implementation of image generation
    """
    async with AsyncSessionLocal() as db:
        task = None
        user = None
        api_config = request_data.get("api_config") if isinstance(request_data, dict) else None
        if not isinstance(api_config, dict):
            api_config = {}
        trace_id = str(
            api_config.get("trace_id")
            or api_config.get("debug_trace_id")
            or ""
        ).strip() or None
        try:
            debug_log_file = write_media_debug_event("image.task.start", {
                "trace_id": trace_id,
                "task_id": task_id,
                "user_id": user_id,
                "model": request_data.get("model"),
                "provider_hint": api_config.get("provider"),
                "request_keys": sorted(list(request_data.keys())) if isinstance(request_data, dict) else [],
            })
            # Get task and user from database
            result = await db.execute(
                select(MediaTask).filter(MediaTask.id == task_id)
            )
            task = result.scalar_one_or_none()

            result = await db.execute(
                select(User).filter(User.id == user_id)
            )
            user = result.scalar_one_or_none()

            if not task or not user:
                logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
                return {"status": "failed", "error": "Task or user not found"}

            # Update status to processing
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.utcnow()
            await db.commit()

            # Create generation request
            request = ImageGenerationRequest(**request_data)

            # Call LLM Gateway
            gateway = LLMGateway(db)
            response = await gateway.generate_image(request, user)

            provider_task_id = response.id or None
            if provider_task_id:
                task.task_id = provider_task_id

            result_url = response.data[0].get("url") if response.data else None
            task.result_url = result_url
            submission_record = None
            if response.provider == "magnific":
                submission_record = _build_magnific_submission_record(
                    provider_task_id=provider_task_id,
                    model_id=request.model,
                    media_type="image",
                    request_data=request_data,
                )
            task.result_data = _make_json_safe({
                "response": response.dict(),
                **({"submission": submission_record} if submission_record else {}),
                **(
                    {
                        "polling": {
                            "provider": "magnific",
                            "state": "scheduled",
                            "attempts": 0,
                            "raw_status": "created",
                            "last_delay_seconds": 0,
                            "next_delay_seconds": _get_magnific_poll_policy(request.model)["initial"],
                        },
                    }
                    if response.provider == "magnific" and provider_task_id and not result_url
                    else {}
                ),
            })
            task.credits_used = int(response.credits_used) if response.credits_used else None
            task.credits_balance = int(response.credits_balance) if response.credits_balance else None
            if result_url:
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.utcnow()
            await db.commit()
            write_media_debug_event("image.task.completed", {
                "trace_id": trace_id,
                "task_id": task_id,
                "provider_task_id": provider_task_id,
                "result_url": task.result_url,
                "provider": response.provider,
                "log_file": debug_log_file,
            })

            if result_url:
                logger.info("generate_image_task_completed", task_id=task_id, provider_task_id=provider_task_id)
                return {
                    "status": "completed",
                    "task_id": task_id,
                    "external_task_id": provider_task_id,
                    "result_url": task.result_url,
                }

            if response.provider == "magnific" and provider_task_id:
                _enqueue_magnific_poll(task_id, _get_magnific_poll_policy(request.model)["initial"])

            logger.info("generate_image_task_submitted", task_id=task_id, provider_task_id=provider_task_id)
            return {
                "status": "submitted",
                "task_id": task_id,
                "external_task_id": provider_task_id,
                "result_url": None,
            }

        except Exception as e:
            logger.error("generate_image_task_failed", task_id=task_id, error=str(e))
            debug_log_file = write_media_debug_event("image.task.failed", {
                "trace_id": trace_id,
                "task_id": task_id,
                "user_id": user_id,
                "model": request_data.get("model") if isinstance(request_data, dict) else None,
                "provider_hint": api_config.get("provider"),
                "error": str(e),
            })

            # Update task status to failed
            try:
                if task is not None:
                    task.result_data = _merge_task_result_data(
                        task.result_data,
                        {
                        "debug": {
                            "trace_id": trace_id,
                            "provider_hint": api_config.get("provider"),
                            "log_file": debug_log_file,
                        },
                        "failure": {
                            "error": str(e),
                            "error_type": type(e).__name__,
                        },
                        },
                        remove_keys=("retry",),
                    )
                    await db.commit()
            except:
                pass

            raise


@celery_app.task(bind=True, max_retries=3)
def generate_image_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async image generation
    """
    logger.info("generate_image_task_started", task_id=task_id, user_id=user_id)

    try:
        result = _run_async(_generate_image_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_image_task_exception", task_id=task_id, error=str(e))

        if _is_non_retryable_media_error(e):
            try:
                _run_async(_mark_task_failed_async(task_id, e))
            except Exception as fail_state_error:
                logger.warning("generate_image_task_non_retryable_state_update_failed", task_id=task_id, error=str(fail_state_error))
            _run_async(_send_failure_notifications(task_id, user_id, "image", str(e)))
            return {"status": "failed", "task_id": task_id, "error": str(e), "retryable": False}

        # Retry if max_retries not reached
        if self.request.retries < self.max_retries:
            try:
                _run_async(_mark_task_retrying_async(task_id, e, retry_after_seconds=60))
            except Exception as retry_state_error:
                logger.warning("generate_image_task_retry_state_update_failed", task_id=task_id, error=str(retry_state_error))
            raise self.retry(exc=e, countdown=60)  # Retry after 1 minute

        # Max retries exhausted — notify user + admins
        try:
            _run_async(_mark_task_failed_async(task_id, e))
        except Exception as fail_state_error:
            logger.warning("generate_image_task_final_state_update_failed", task_id=task_id, error=str(fail_state_error))
        _run_async(_send_failure_notifications(task_id, user_id, "image", str(e)))
        return {"status": "failed", "task_id": task_id, "error": str(e)}


async def _generate_video_async(task_id: str, user_id: str, request_data: dict):
    """
    Async implementation of video generation
    """
    async with AsyncSessionLocal() as db:
        task = None
        try:
            result = await db.execute(
                select(MediaTask).filter(MediaTask.id == task_id)
            )
            task = result.scalar_one_or_none()

            result = await db.execute(
                select(User).filter(User.id == user_id)
            )
            user = result.scalar_one_or_none()

            if not task or not user:
                logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
                return {"status": "failed", "error": "Task or user not found"}

            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.utcnow()
            await db.commit()

            request = VideoGenerationRequest(**request_data)
            gateway = LLMGateway(db)
            # Async queue mode: submit to provider quickly and avoid blocking worker on long polling.
            response = await gateway.generate_video(request, user, wait_for_completion=False)

            external_task_id = response.id or None
            if external_task_id:
                task.task_id = external_task_id

            submission_record: dict[str, Any] | None = None
            if response.provider == "wavespeed_ai" and external_task_id:
                from app.llm_proxy.providers.wavespeed_media_provider import WaveSpeedMediaProvider
                from app.services.media_provider_service import get_media_provider_key

                provider_config = await get_media_provider_key("wavespeed_ai")
                if not provider_config or not provider_config.get("apiKey"):
                    raise RuntimeError("WaveSpeed provider configuration unavailable after submission")

                extra_params = request.extra_params if isinstance(request.extra_params, dict) else {}
                api_config = request.api_config if isinstance(request.api_config, dict) else {}
                aspect_ratio = (
                    request.aspect_ratio
                    or gateway._get_api_config_string(extra_params, "aspect_ratio", "aspectRatio")
                    or "16:9"
                )
                duration = request.duration or int(
                    gateway._get_api_config_string(extra_params, "duration", "seconds") or 5
                )
                resolution = request.resolution or gateway._get_api_config_string(extra_params, "resolution", "size")

                wavespeed_provider = WaveSpeedMediaProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                    submit_endpoint=WaveSpeedMediaProvider.resolve_submit_endpoint(api_config),
                    result_endpoint_template=WaveSpeedMediaProvider.resolve_result_endpoint_template(api_config),
                    provider_model_id=WaveSpeedMediaProvider.resolve_provider_model_id(request.model, api_config),
                )
                try:
                    submission_record = wavespeed_provider.build_submission_record(
                        provider_task_id=external_task_id,
                        prompt=request.prompt,
                        reference_image_urls=request.reference_image_urls,
                        aspect_ratio=aspect_ratio,
                        duration=duration,
                        resolution=resolution,
                        used_sync_mode=False,
                    )
                finally:
                    await wavespeed_provider.aclose()
            elif response.provider == "magnific" and external_task_id:
                submission_record = _build_magnific_submission_record(
                    provider_task_id=external_task_id,
                    model_id=request.model,
                    media_type="video",
                    request_data=request_data,
                )

            task.result_data = _make_json_safe({
                **({"submission": submission_record} if submission_record else {"submission": response.dict()}),
                "response": response.dict(),
                **(
                    {
                        "polling": {
                            "provider": "wavespeed_ai",
                            "state": "scheduled",
                            "attempts": 0,
                            "raw_status": "created",
                            "last_delay_seconds": 0,
                            "next_delay_seconds": 3,
                        },
                    }
                    if response.provider == "wavespeed_ai"
                    else {}
                ),
                **(
                    {
                        "polling": {
                            "provider": "magnific",
                            "state": "scheduled",
                            "attempts": 0,
                            "raw_status": "created",
                            "last_delay_seconds": 0,
                            "next_delay_seconds": _get_magnific_poll_policy(request.model)["initial"],
                        },
                    }
                    if response.provider == "magnific"
                    else {}
                ),
            })
            task.credits_used = int(response.credits_used) if response.credits_used else None
            task.credits_balance = int(response.credits_balance) if response.credits_balance else None

            # If provider returns a ready URL immediately, finish now. Otherwise stay processing.
            immediate_url = response.data[0].get("url") if response.data else None
            if immediate_url:
                task.status = TaskStatus.COMPLETED
                task.result_url = immediate_url
                task.completed_at = datetime.utcnow()
                await db.commit()
                logger.info("generate_video_task_completed_immediate", task_id=task_id, external_task_id=external_task_id)
                return {"status": "completed", "task_id": task_id, "external_task_id": external_task_id, "result_url": task.result_url}

            await db.commit()
            if response.provider == "wavespeed_ai":
                _enqueue_wavespeed_poll(task_id, 3)
            if response.provider == "magnific":
                _enqueue_magnific_poll(task_id, _get_magnific_poll_policy(request.model)["initial"])
            logger.info("generate_video_task_submitted", task_id=task_id, external_task_id=external_task_id)
            return {"status": "submitted", "task_id": task_id, "external_task_id": external_task_id}

        except Exception as e:
            logger.error("generate_video_task_failed", task_id=task_id, error=str(e))

            try:
                if task is not None:
                    task.result_data = _merge_task_result_data(
                        task.result_data,
                        {
                            "failure": {
                                "error": str(e),
                                "error_type": type(e).__name__,
                            },
                        },
                        remove_keys=("retry",),
                    )
                    await db.commit()
            except:
                pass

            raise


@celery_app.task(bind=True, max_retries=3)
def generate_video_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async video generation
    """
    logger.info("generate_video_task_started", task_id=task_id, user_id=user_id)

    try:
        result = _run_async(_generate_video_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_video_task_exception", task_id=task_id, error=str(e))

        if _is_non_retryable_media_error(e):
            try:
                _run_async(_mark_task_failed_async(task_id, e))
            except Exception as fail_state_error:
                logger.warning("generate_video_task_non_retryable_state_update_failed", task_id=task_id, error=str(fail_state_error))
            _run_async(_send_failure_notifications(task_id, user_id, "video", str(e)))
            return {"status": "failed", "task_id": task_id, "error": str(e), "retryable": False}

        if self.request.retries < self.max_retries:
            try:
                _run_async(_mark_task_retrying_async(task_id, e, retry_after_seconds=120))
            except Exception as retry_state_error:
                logger.warning("generate_video_task_retry_state_update_failed", task_id=task_id, error=str(retry_state_error))
            raise self.retry(exc=e, countdown=120)  # Retry after 2 minutes

        # Max retries exhausted — notify user + admins
        try:
            _run_async(_mark_task_failed_async(task_id, e))
        except Exception as fail_state_error:
            logger.warning("generate_video_task_final_state_update_failed", task_id=task_id, error=str(fail_state_error))
        _run_async(_send_failure_notifications(task_id, user_id, "video", str(e)))
        return {"status": "failed", "task_id": task_id, "error": str(e)}


@celery_app.task(bind=True, max_retries=3)
def poll_wavespeed_video_task(self, task_id: str):
    """Poll a submitted WaveSpeed task and reschedule until terminal or timed out."""
    logger.info("poll_wavespeed_video_task_started", task_id=task_id)

    try:
        return _run_async(_poll_wavespeed_video_task_async(task_id, schedule_next_poll=True))
    except Exception as e:
        logger.error("poll_wavespeed_video_task_exception", task_id=task_id, error=str(e))

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=15)

        try:
            _run_async(_mark_task_failed_async(task_id, e))
        except Exception as fail_state_error:
            logger.warning(
                "poll_wavespeed_video_task_final_state_update_failed",
                task_id=task_id,
                error=str(fail_state_error),
            )
        return {"status": "failed", "task_id": task_id, "error": str(e)}


@celery_app.task(bind=True, max_retries=3)
def poll_magnific_media_task(self, task_id: str):
    """Poll a submitted Magnific task and reschedule until terminal or timed out."""
    logger.info("poll_magnific_media_task_started", task_id=task_id)

    try:
        return _run_async(_poll_magnific_media_task_async(task_id, schedule_next_poll=True))
    except Exception as e:
        logger.error("poll_magnific_media_task_exception", task_id=task_id, error=str(e))

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=15)

        try:
            _run_async(_mark_task_failed_async(task_id, e))
        except Exception as fail_state_error:
            logger.warning(
                "poll_magnific_media_task_final_state_update_failed",
                task_id=task_id,
                error=str(fail_state_error),
            )
        return {"status": "failed", "task_id": task_id, "error": str(e)}


async def _generate_audio_async(task_id: str, user_id: str, request_data: dict):
    """
    Async implementation of audio generation
    """
    async with AsyncSessionLocal() as db:
        task = None
        api_config = request_data.get("api_config") if isinstance(request_data, dict) else None
        if not isinstance(api_config, dict):
            api_config = {}
        trace_id = str(
            api_config.get("trace_id")
            or api_config.get("debug_trace_id")
            or ""
        ).strip() or None
        audio_debug_snapshot = _build_audio_debug_request_snapshot(
            request_data if isinstance(request_data, dict) else {}
        )
        debug_log_file = write_media_debug_event("audio.task.start", {
            "trace_id": trace_id,
            "task_id": task_id,
            "user_id": user_id,
            "model": request_data.get("model") if isinstance(request_data, dict) else None,
            "provider_hint": audio_debug_snapshot.get("provider_hint"),
            "selected_voice_id": audio_debug_snapshot.get("selected_voice_id"),
            "api": audio_debug_snapshot.get("api"),
            "request_keys": sorted(list(request_data.keys())) if isinstance(request_data, dict) else [],
        })
        try:
            result = await db.execute(
                select(MediaTask).filter(MediaTask.id == task_id)
            )
            task = result.scalar_one_or_none()

            result = await db.execute(
                select(User).filter(User.id == user_id)
            )
            user = result.scalar_one_or_none()

            if not task or not user:
                logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
                return {"status": "failed", "error": "Task or user not found"}

            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.utcnow()
            await db.commit()

            request = AudioGenerationRequest(**request_data)
            gateway = LLMGateway(db)
            response = await gateway.generate_audio(request, user)

            provider_task_id = response.id or None
            if provider_task_id:
                task.task_id = provider_task_id

            result_url = response.data[0].get("url") if response.data else None
            task.result_url = result_url
            response_metadata = response.metadata if isinstance(response.metadata, dict) else {}
            task.result_data = _make_json_safe({
                "response": response.dict(),
                **response_metadata,
                "debug": {
                    "trace_id": trace_id,
                    "provider_hint": audio_debug_snapshot.get("provider_hint"),
                    "selected_voice_id": audio_debug_snapshot.get("selected_voice_id"),
                    "log_file": debug_log_file,
                    "api": audio_debug_snapshot.get("api"),
                },
            })
            task.credits_used = int(response.credits_used) if response.credits_used else None
            task.credits_balance = int(response.credits_balance) if response.credits_balance else None
            if result_url or response_metadata.get("artifactKind") == "transcript":
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.utcnow()
            await db.commit()
            write_media_debug_event("audio.task.completed", {
                "trace_id": trace_id,
                "task_id": task_id,
                "provider_task_id": provider_task_id,
                "result_url": task.result_url,
                "provider": response.provider,
                "log_file": debug_log_file,
            })

            if result_url or response_metadata.get("artifactKind") == "transcript":
                logger.info("generate_audio_task_completed", task_id=task_id, provider_task_id=provider_task_id)
                return {
                    "status": "completed",
                    "task_id": task_id,
                    "external_task_id": provider_task_id,
                    "result_url": task.result_url,
                }

            logger.info("generate_audio_task_submitted", task_id=task_id, provider_task_id=provider_task_id)
            return {
                "status": "submitted",
                "task_id": task_id,
                "external_task_id": provider_task_id,
                "result_url": None,
            }

        except Exception as e:
            logger.error("generate_audio_task_failed", task_id=task_id, error=str(e))
            exception_debug = _extract_exception_debug_payload(e)
            write_media_debug_event("audio.task.failed", {
                "trace_id": trace_id,
                "task_id": task_id,
                "user_id": user_id,
                "model": request_data.get("model") if isinstance(request_data, dict) else None,
                "provider_hint": audio_debug_snapshot.get("provider_hint"),
                "selected_voice_id": audio_debug_snapshot.get("selected_voice_id"),
                "error": str(e),
                "error_type": type(e).__name__,
                "api": {
                    **(audio_debug_snapshot.get("api") if isinstance(audio_debug_snapshot.get("api"), dict) else {}),
                    "response_status": exception_debug.get("status_code"),
                },
                "provider_detail": exception_debug.get("detail"),
                "log_file": debug_log_file,
            })

            try:
                if task is not None:
                    existing_result_data = task.result_data if isinstance(task.result_data, dict) else {}
                    api_debug = (
                        audio_debug_snapshot.get("api")
                        if isinstance(audio_debug_snapshot.get("api"), dict)
                        else {}
                    )
                    task.result_data = _make_json_safe({
                        **{
                            key: value
                            for key, value in existing_result_data.items()
                            if key != "retry"
                        },
                        "debug": {
                            "trace_id": trace_id,
                            "provider_hint": audio_debug_snapshot.get("provider_hint"),
                            "selected_voice_id": audio_debug_snapshot.get("selected_voice_id"),
                            "log_file": debug_log_file,
                            "api": {
                                **api_debug,
                                "response_status": exception_debug.get("status_code"),
                            },
                        },
                        "failure": {
                            "error": str(e),
                            "error_type": type(e).__name__,
                            "http_status_code": exception_debug.get("status_code"),
                            "provider_message": exception_debug.get("message"),
                            "provider_detail": exception_debug.get("detail"),
                        },
                    })
                    await db.commit()
            except Exception:
                pass

            raise


@celery_app.task(bind=True, max_retries=3)
def generate_audio_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async audio generation
    """
    logger.info("generate_audio_task_started", task_id=task_id, user_id=user_id)

    try:
        result = _run_async(_generate_audio_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_audio_task_exception", task_id=task_id, error=str(e))

        if _is_non_retryable_media_error(e):
            try:
                _run_async(_mark_task_failed_async(task_id, e))
            except Exception as fail_state_error:
                logger.warning("generate_audio_task_non_retryable_state_update_failed", task_id=task_id, error=str(fail_state_error))
            _run_async(_send_failure_notifications(task_id, user_id, "audio", str(e)))
            return {"status": "failed", "task_id": task_id, "error": str(e), "retryable": False}

        if self.request.retries < self.max_retries:
            try:
                _run_async(_mark_task_retrying_async(task_id, e, retry_after_seconds=60))
            except Exception as retry_state_error:
                logger.warning("generate_audio_task_retry_state_update_failed", task_id=task_id, error=str(retry_state_error))
            raise self.retry(exc=e, countdown=60)

        # Max retries exhausted — notify user + admins
        try:
            _run_async(_mark_task_failed_async(task_id, e))
        except Exception as fail_state_error:
            logger.warning("generate_audio_task_final_state_update_failed", task_id=task_id, error=str(fail_state_error))
        _run_async(_send_failure_notifications(task_id, user_id, "audio", str(e)))
        return {"status": "failed", "task_id": task_id, "error": str(e)}


async def _cleanup_expired_tasks_async():
    """
    Async implementation of cleanup expired tasks.
    Deletes tasks older than 12 days to manage storage.
    Also prunes stale entries from Redis active-job sets.
    """
    async with AsyncSessionLocal() as db:
        try:
            # Delete tasks older than 12 days (data retention policy)
            cutoff_date = datetime.utcnow() - timedelta(days=12)

            result = await db.execute(
                select(MediaTask).filter(
                    MediaTask.status.in_([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]),
                    MediaTask.completed_at < cutoff_date
                )
            )
            tasks = result.scalars().all()

            deleted_count = 0
            for task in tasks:
                await db.delete(task)
                deleted_count += 1

            await db.commit()

            # Prune stale Redis active-job set entries
            stale_removed = 0
            try:
                from app.core.config import settings
                import redis.asyncio as aioredis

                redis_client = aioredis.from_url(
                    settings.CELERY_BROKER_URL or "redis://localhost:6379/0"
                )
                cursor = 0
                while True:
                    cursor, keys = await redis_client.scan(
                        cursor, match="media-jobs:user:*:active", count=100
                    )
                    for key in keys:
                        members = await redis_client.smembers(key)
                        for job_id_bytes in members:
                            job_id = job_id_bytes.decode() if isinstance(job_id_bytes, bytes) else str(job_id_bytes)
                            status_raw = await redis_client.get(f"media-job:{job_id}:status")
                            if status_raw is None:
                                # Job key expired (24h TTL) → stale entry
                                await redis_client.srem(key, job_id_bytes)
                                stale_removed += 1
                    if cursor == 0:
                        break
                await redis_client.aclose()
            except Exception as redis_err:
                logger.warning("cleanup_redis_active_sets_failed", error=str(redis_err))

            logger.info(
                "cleanup_expired_tasks_completed",
                deleted_count=deleted_count,
                stale_redis_removed=stale_removed,
            )
            return {"status": "success", "deleted_count": deleted_count, "stale_redis_removed": stale_removed}

        except Exception as e:
            logger.error("cleanup_expired_tasks_failed", error=str(e))
            raise


@celery_app.task
def cleanup_expired_tasks():
    """
    Periodic task to cleanup old completed/failed tasks.
    Runs daily at 3:00 AM UTC.
    Deletes tasks older than 12 days to manage storage.
    """
    logger.info("cleanup_expired_tasks_started")

    try:
        result = _run_async(_cleanup_expired_tasks_async())
        return result

    except Exception as e:
        logger.error("cleanup_expired_tasks_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _retry_failed_tasks_async():
    """
    Async implementation of retry failed tasks
    """
    async with AsyncSessionLocal() as db:
        try:
            # Find recently failed tasks (last 1 hour) that might be retryable
            cutoff_date = datetime.utcnow() - timedelta(hours=1)

            result = await db.execute(
                select(MediaTask).filter(
                    MediaTask.status == TaskStatus.FAILED,
                    MediaTask.completed_at > cutoff_date,
                    (MediaTask.error_message.like("%timeout%") |
                     MediaTask.error_message.like("%connection%") |
                     MediaTask.error_message.like("%temporary%"))
                ).limit(10)
            )
            failed_tasks = result.scalars().all()

            retried_count = 0
            for task in failed_tasks:
                # Reset task to pending
                task.status = TaskStatus.PENDING
                task.error_message = None
                task.completed_at = None

                # Re-submit to Celery based on media type
                if task.media_type == MediaType.IMAGE:
                    generate_image_task.delay(task.id, task.user_id, task.parameters or {})
                elif task.media_type == MediaType.VIDEO:
                    generate_video_task.delay(task.id, task.user_id, task.parameters or {})
                elif task.media_type == MediaType.AUDIO:
                    generate_audio_task.delay(task.id, task.user_id, task.parameters or {})

                retried_count += 1

            await db.commit()

            logger.info("retry_failed_tasks_completed", retried_count=retried_count)
            return {"status": "success", "retried_count": retried_count}

        except Exception as e:
            logger.error("retry_failed_tasks_failed", error=str(e))
            raise


@celery_app.task
def retry_failed_tasks():
    """
    Periodic task to retry failed tasks with transient errors
    Runs every 15 minutes
    """
    logger.info("retry_failed_tasks_started")

    try:
        result = _run_async(_retry_failed_tasks_async())
        return result

    except Exception as e:
        logger.error("retry_failed_tasks_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _retry_media_callback_events_async():
    """Retry due durable callback events from retry queue."""
    async with AsyncSessionLocal() as db:
        try:
            result = await retry_due_callback_events(db, limit=100)
            logger.info("retry_media_callback_events_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error("retry_media_callback_events_failed", error=str(e))
            raise


@celery_app.task
def retry_media_callback_events():
    """Periodic retry for callback events in retry_pending status."""
    logger.info("retry_media_callback_events_started")
    try:
        result = _run_async(_retry_media_callback_events_async())
        return result
    except Exception as e:
        logger.error("retry_media_callback_events_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _process_library_index_job_async(job_id: int):
    """Async worker entrypoint for a single library index job."""
    async with AsyncSessionLocal() as db:
        try:
            result = await process_library_index_job(db, job_id)
            logger.info("process_library_index_job_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error("process_library_index_job_failed", job_id=job_id, error=str(e))
            raise


@celery_app.task
def process_library_index_job_task(job_id: int):
    """Queue worker task for extract/chunk/embed/upsert pipeline."""
    logger.info("process_library_index_job_started", job_id=job_id)
    try:
        return _run_async(_process_library_index_job_async(job_id))
    except Exception as e:
        logger.error("process_library_index_job_exception", job_id=job_id, error=str(e))
        return {"status": "failed", "error": str(e), "job_id": job_id}


async def _retry_library_index_jobs_async():
    """Retry due library index jobs in retry_pending/pending state."""
    async with AsyncSessionLocal() as db:
        try:
            result = await retry_due_library_index_jobs(db, limit=100)
            logger.info("retry_library_index_jobs_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error("retry_library_index_jobs_failed", error=str(e))
            raise


@celery_app.task
def retry_library_index_jobs():
    """Periodic retry for library index jobs due for execution."""
    logger.info("retry_library_index_jobs_started")
    try:
        return _run_async(_retry_library_index_jobs_async())
    except Exception as e:
        logger.error("retry_library_index_jobs_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _run_library_backfill_batch_async(
    *,
    tenant_id: int | None,
    cursor: int,
    batch_size: int,
    dry_run: bool,
    paused: bool,
    max_enqueue: int,
):
    """Run one operator-controlled backfill batch for library indexing."""
    async with AsyncSessionLocal() as db:
        try:
            result = await run_library_backfill_batch(
                db,
                tenant_id=tenant_id,
                cursor=cursor,
                batch_size=batch_size,
                dry_run=dry_run,
                paused=paused,
                max_enqueue=max_enqueue,
            )
            logger.info("library_backfill_batch_task_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error(
                "library_backfill_batch_task_failed",
                tenant_id=tenant_id,
                cursor=cursor,
                error=str(e),
            )
            raise


@celery_app.task
def run_library_backfill_batch_task(
    tenant_id: int | None = None,
    cursor: int = 0,
    batch_size: int = 100,
    dry_run: bool = True,
    paused: bool = False,
    max_enqueue: int = 25,
):
    """Operator-triggered backfill batch with dry-run/pause/resume controls."""
    logger.info(
        "library_backfill_batch_task_started",
        tenant_id=tenant_id,
        cursor=cursor,
        batch_size=batch_size,
        dry_run=dry_run,
        paused=paused,
        max_enqueue=max_enqueue,
    )
    try:
        return _run_async(
            _run_library_backfill_batch_async(
                tenant_id=tenant_id,
                cursor=cursor,
                batch_size=batch_size,
                dry_run=dry_run,
                paused=paused,
                max_enqueue=max_enqueue,
            )
        )
    except Exception as e:
        logger.error("library_backfill_batch_task_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _reindex_all_library_async(tenant_id: int | None):
    """Reindex all library items for the specified tenant (or all tenants)."""
    async with AsyncSessionLocal() as db:
        try:
            result = await reindex_all_library_items(
                db,
                tenant_id=str(tenant_id) if tenant_id else None,
            )
            logger.info("reindex_all_library_task_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error("reindex_all_library_task_failed", error=str(e))
            raise


@celery_app.task
def reindex_all_library_task(tenant_id: int | None = None):
    """Admin-triggered full reindex of all library items."""
    logger.info("reindex_all_library_task_started", tenant_id=tenant_id)
    try:
        return _run_async(_reindex_all_library_async(tenant_id))
    except Exception as e:
        logger.error("reindex_all_library_task_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _recover_stuck_tasks_async():
    """
    Find and recover tasks stuck in 'processing' status
    This handles tasks that were interrupted by worker restarts or timeouts
    """
    async with AsyncSessionLocal() as db:
        try:
            from datetime import timezone

            # Poll tasks that have been processing for at least a short period.
            # This keeps status fresh even when provider callbacks are unavailable.
            cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=2)

            result = await db.execute(
                select(MediaTask).filter(
                    MediaTask.status == TaskStatus.PROCESSING,
                    MediaTask.started_at < cutoff_time,
                    MediaTask.task_id.isnot(None)  # Must have external task_id
                ).limit(20)
            )
            stuck_tasks = list(result.scalars().all())

            failed_cutoff_time = datetime.now(timezone.utc) - timedelta(hours=1)
            failed_result = await db.execute(
                select(MediaTask).filter(
                    MediaTask.status == TaskStatus.FAILED,
                    MediaTask.task_id.isnot(None),
                    MediaTask.completed_at > failed_cutoff_time,
                    or_(
                        MediaTask.error_message.like("%has no attribute 'value'%"),
                        MediaTask.error_message.like("%object has no attribute 'value'%"),
                    ),
                ).limit(20)
            )
            recoverable_failed_tasks = [
                task
                for task in failed_result.scalars().all()
                if _is_recoverable_wavespeed_failure(
                    task,
                    _coerce_json_dict(task.result_data).get("submission"),
                )
            ]

            if recoverable_failed_tasks:
                deduped_tasks = {task.id: task for task in stuck_tasks}
                for task in recoverable_failed_tasks:
                    deduped_tasks.setdefault(task.id, task)
                stuck_tasks = list(deduped_tasks.values())

            if not stuck_tasks:
                logger.info("recover_stuck_tasks_none_found")
                return {"status": "success", "recovered_count": 0}

            logger.info(
                "recover_stuck_tasks_found",
                count=len(stuck_tasks),
                recoverable_failed_count=len(recoverable_failed_tasks),
            )

            recovered_count = 0
            failed_count = 0

            for task in stuck_tasks:
                try:
                    raw_task_model = str(task.model or "").strip().lower()
                    task_model_name = raw_task_model.split("/", 1)[-1]
                    normalized_task_model = re.sub(r"[^a-z0-9]+", "-", task_model_name).strip("-")
                    logger.info(
                        "recover_stuck_task_polling",
                        task_id=task.id,
                        external_task_id=task.task_id,
                        model=task.model,
                        stuck_since=task.started_at.isoformat() if task.started_at else None,
                    )

                    from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
                    from app.llm_proxy.providers.knplabai_provider import KNPLabsProvider
                    from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
                    import httpx
                    task_result_data = _coerce_json_dict(task.result_data)
                    wavespeed_submission = task_result_data.get("submission")

                    if isinstance(wavespeed_submission, dict) and wavespeed_submission.get("provider") == "wavespeed_ai":
                        wavespeed_result = await _poll_wavespeed_video_task_async(
                            task.id,
                            schedule_next_poll=True,
                        )
                        if wavespeed_result.get("status") == "completed":
                            recovered_count += 1
                        elif wavespeed_result.get("status") == "failed":
                            failed_count += 1
                        continue

                    if _is_magnific_task(task, task_result_data.get("submission")):
                        magnific_result = await _poll_magnific_media_task_async(
                            task.id,
                            schedule_next_poll=True,
                        )
                        if magnific_result.get("status") == "completed":
                            recovered_count += 1
                        elif magnific_result.get("status") == "failed":
                            failed_count += 1
                        continue

                    if task.model in BytePlusModelArkProvider.VIDEO_MODELS:
                        # --- BytePlus polling branch ---
                        from app.services.media_provider_service import get_media_provider_key
                        provider_config = await get_media_provider_key("byteplus_modelark")
                        if not provider_config or not provider_config.get("apiKey"):
                            logger.warning(
                                "recover_stuck_task_byteplus_not_configured",
                                task_id=task.id,
                            )
                            continue

                        byteplus_client = None
                        try:
                            byteplus_client = BytePlusModelArkProvider(
                                api_key=provider_config["apiKey"],
                                base_url=provider_config.get("baseUrl"),
                            )
                            import httpx
                            try:
                                status_response = await byteplus_client.get_task_status(task.task_id)
                            except httpx.HTTPStatusError as http_err:
                                if http_err.response.status_code == 429:
                                    logger.warning(
                                        "recover_stuck_task_byteplus_rate_limited",
                                        task_id=task.id,
                                        external_task_id=task.task_id,
                                    )
                                    # `continue` propagates through the outer try/finally,
                                    # so byteplus_client.aclose() is called before the loop advances.
                                    continue
                                raise

                            task_state, raw_state = _normalize_byteplus_task_state(status_response)
                            logger.info(
                                "recover_stuck_task_byteplus_status",
                                task_id=task.id,
                                task_state=task_state,
                                raw_state=raw_state,
                            )

                            if task_state == "success":
                                result_url = _extract_byteplus_result_url(status_response)
                                if result_url:
                                    task.status = TaskStatus.COMPLETED
                                    task.result_url = result_url
                                    task.result_data = _make_json_safe(status_response)
                                    task.completed_at = datetime.now(timezone.utc)
                                    recovered_count += 1
                                    logger.info(
                                        "recover_stuck_task_byteplus_completed",
                                        task_id=task.id,
                                        result_url=result_url,
                                    )
                                else:
                                    logger.warning(
                                        "recover_stuck_task_byteplus_success_no_url",
                                        task_id=task.id,
                                    )

                            elif task_state == "fail":
                                error_msg = (
                                    (status_response.get("error") or {}).get("message")
                                    or "Task failed"
                                )
                                task.status = TaskStatus.FAILED
                                task.error_message = f"BytePlus failed: {error_msg[:200]}"
                                task.result_data = _make_json_safe(status_response)
                                task.completed_at = datetime.now(timezone.utc)
                                failed_count += 1
                                logger.warning(
                                    "recover_stuck_task_byteplus_failed",
                                    task_id=task.id,
                                    error=error_msg,
                                )

                            # "processing"/"unknown": do nothing, re-check next cycle

                        finally:
                            if byteplus_client is not None:
                                await byteplus_client.aclose()

                    elif normalized_task_model in {
                        re.sub(r"[^a-z0-9]+", "-", model_name.strip().lower()).strip("-")
                        for model_name in KNPLabsProvider.VIDEO_MODELS
                    }:
                        # --- KNPLabs polling branch ---
                        from app.services.media_provider_service import get_media_provider_key
                        provider_config = await get_media_provider_key("knplabai")
                        if not provider_config or not provider_config.get("apiKey"):
                            provider_config = await get_media_provider_key("knplabs")

                        if not provider_config or not provider_config.get("apiKey"):
                            logger.warning(
                                "recover_stuck_task_knplabs_not_configured",
                                task_id=task.id,
                            )
                            continue

                        knplabs_client = None
                        try:
                            knplabs_client = KNPLabsProvider(
                                api_key=provider_config["apiKey"],
                                base_url=provider_config.get("baseUrl"),
                            )

                            status_response = await knplabs_client.poll_video_status(task.task_id, task.model)
                            task_state = str(status_response.get("status") or status_response.get("state") or "").lower()
                            logger.info(
                                "recover_stuck_task_knplabs_status",
                                task_id=task.id,
                                task_state=task_state,
                                raw_state=status_response.get("status") or status_response.get("state"),
                            )

                            if task_state in {"completed", "complete", "success", "succeeded"}:
                                result_url = knplabs_client.extract_result_url(status_response)
                                if result_url:
                                    task.status = TaskStatus.COMPLETED
                                    task.result_url = result_url
                                    task.result_data = _make_json_safe(status_response)
                                    task.completed_at = datetime.now(timezone.utc)
                                    recovered_count += 1
                                    logger.info(
                                        "recover_stuck_task_knplabs_completed",
                                        task_id=task.id,
                                        result_url=result_url,
                                    )
                                else:
                                    logger.warning(
                                        "recover_stuck_task_knplabs_success_no_url",
                                        task_id=task.id,
                                    )
                            elif task_state in {"failed", "fail", "error", "cancelled", "canceled"}:
                                error_msg = (
                                    status_response.get("error")
                                    or status_response.get("message")
                                    or "Task failed"
                                )
                                task.status = TaskStatus.FAILED
                                task.error_message = f"KNPLabs failed: {str(error_msg)[:200]}"
                                task.result_data = _make_json_safe(status_response)
                                task.completed_at = datetime.now(timezone.utc)
                                failed_count += 1
                                logger.warning(
                                    "recover_stuck_task_knplabs_failed",
                                    task_id=task.id,
                                    error=str(error_msg)[:200],
                                )

                        except httpx.HTTPStatusError as http_err:
                            if http_err.response.status_code == 429:
                                logger.warning(
                                    "recover_stuck_task_knplabs_rate_limited",
                                    task_id=task.id,
                                    external_task_id=task.task_id,
                                )
                                continue
                            raise
                        finally:
                            if knplabs_client is not None:
                                await knplabs_client.aclose()

                    elif task.model in FalAIProvider.VIDEO_MODELS or task.model in FalAIProvider.AUDIO_MODELS:
                        # --- fal.ai polling branch ---
                        from app.services.media_provider_service import get_media_provider_key as get_fal_key
                        provider_config = await get_fal_key("fal_ai")
                        if not provider_config or not provider_config.get("apiKey"):
                            logger.warning("recover_stuck_task_fal_ai_not_configured", task_id=task.id)
                            continue

                        fal_client = None
                        try:
                            fal_client = FalAIProvider(api_key=provider_config["apiKey"])

                            # Check timeout first (avoid unnecessary API calls)
                            FAL_QUEUE_TIMEOUT_MINUTES = 30
                            age = (datetime.now(timezone.utc) - task.created_at).total_seconds() / 60
                            if age > FAL_QUEUE_TIMEOUT_MINUTES:
                                task.status = TaskStatus.FAILED
                                task.error_message = "fal.ai queue timeout (>30 min)"
                                task.completed_at = datetime.now(timezone.utc)
                                failed_count += 1
                                continue

                            status_response = await fal_client.get_queue_status(task.model, task.task_id)

                            if status_response.get("status") == "COMPLETED":
                                # get_queue_result returns normalized:
                                # {data: [{url}], actual_duration, actual_resolution}
                                result = await fal_client.get_queue_result(task.model, task.task_id)
                                task.status = TaskStatus.COMPLETED
                                data_list = result.get("data", [])
                                raw_url = data_list[0]["url"] if data_list else None
                                # SECURITY: Validate result URL from fal.ai before storing
                                if raw_url:
                                    try:
                                        from app.core.media_job_validators import validate_uri_strict
                                        validate_uri_strict(raw_url)
                                        task.result_url = raw_url
                                    except ValueError:
                                        logger.warning(
                                            "recover_stuck_task_fal_invalid_result_url",
                                            task_id=task.id,
                                            url_prefix=raw_url[:80] if raw_url else "",
                                        )
                                        task.result_url = None
                                else:
                                    task.result_url = None
                                task.result_data = _make_json_safe(result)
                                task.completed_at = datetime.now(timezone.utc)
                                recovered_count += 1
                                logger.info(
                                    "recover_stuck_task_fal_completed",
                                    task_id=task.id,
                                    has_url=task.result_url is not None,
                                )

                            elif status_response.get("status") == "FAILED":
                                error_msg = status_response.get("error", "Unknown error")
                                task.status = TaskStatus.FAILED
                                task.error_message = f"fal.ai failed: {str(error_msg)[:200]}"
                                task.completed_at = datetime.now(timezone.utc)
                                failed_count += 1
                                logger.warning(
                                    "recover_stuck_task_fal_failed",
                                    task_id=task.id,
                                    error=str(error_msg)[:200],
                                )

                            # IN_QUEUE / IN_PROGRESS: skip, re-check next cycle

                        except httpx.HTTPStatusError as http_err:
                            if http_err.response.status_code == 429:
                                logger.warning(
                                    "recover_stuck_task_fal_rate_limited",
                                    task_id=task.id,
                                    external_task_id=task.task_id,
                                )
                                continue
                            if 400 <= http_err.response.status_code < 500:
                                task.status = TaskStatus.FAILED
                                task.error_message = f"fal.ai HTTP {http_err.response.status_code}"
                                task.completed_at = datetime.now(timezone.utc)
                                failed_count += 1
                                continue
                            raise
                        finally:
                            if fal_client is not None:
                                await fal_client.aclose()

                    else:
                        # --- Kie.ai polling branch ---
                        # Get Kie.ai provider config from shared media_providers table
                        from app.services.media_provider_service import get_media_provider_key
                        provider_config = await get_media_provider_key("kie_ai")
                        if not provider_config or not provider_config.get("apiKey"):
                            logger.warning("recover_stuck_task_provider_not_configured", task_id=task.id)
                            continue

                        from app.llm_proxy.providers.kie_ai_provider import KieAIProvider
                        provider = KieAIProvider(
                            api_key=provider_config["apiKey"],
                            base_url=provider_config.get("baseUrl") or "https://api.kie.ai/api/v1",
                            callback_url=provider_config.get("callbackUrl"),
                        )

                        preferred_query_endpoint = None

                        task_parameters = task.parameters
                        if isinstance(task_parameters, str):
                            try:
                                task_parameters = json.loads(task_parameters)
                            except json.JSONDecodeError:
                                task_parameters = {}

                        if isinstance(task_parameters, dict):
                            api_cfg = task_parameters.get("api_config")
                            if isinstance(api_cfg, dict):
                                preferred_query_endpoint = (
                                    api_cfg.get("query_endpoint")
                                    or api_cfg.get("status_endpoint")
                                    or api_cfg.get("api_query_endpoint")
                                    or api_cfg.get("api_status_endpoint")
                                )

                        if not preferred_query_endpoint and task.model:
                            try:
                                model_result = await db.execute(
                                    text('SELECT "configJson" FROM media_models WHERE "modelId" = :model_id LIMIT 1'),
                                    {"model_id": task.model}
                                )
                                model_row = model_result.fetchone()
                                if model_row:
                                    preferred_query_endpoint = _extract_model_query_endpoint(model_row[0])
                            except Exception as lookup_error:
                                logger.warning(
                                    "recover_stuck_task_query_endpoint_lookup_failed",
                                    task_id=task.id,
                                    model=task.model,
                                    error=str(lookup_error),
                                )

                        # Poll for current status (single check, no wait)
                        status_response = await provider.get_task_status(
                            task.task_id,
                            preferred_status_endpoint=preferred_query_endpoint,
                        )
                        task_state, raw_state = _normalize_kie_task_state(status_response)

                        logger.info(
                            "recover_stuck_task_status",
                            task_id=task.id,
                            task_state=task_state,
                            raw_state=raw_state,
                            preferred_query_endpoint=preferred_query_endpoint,
                        )

                        if task_state == "success":
                            result_url = _extract_first_kie_result_url(status_response)
                            if result_url:
                                task.status = TaskStatus.COMPLETED
                                task.result_url = result_url
                                task.result_data = _make_json_safe(status_response)
                                task.completed_at = datetime.now(timezone.utc)
                                recovered_count += 1
                                logger.info("recover_stuck_task_completed", task_id=task.id, result_url=result_url)
                            else:
                                logger.warning(
                                    "recover_stuck_task_success_without_result_url",
                                    task_id=task.id,
                                    external_task_id=task.task_id,
                                )

                        elif task_state == "fail":
                            # Task failed on provider side
                            error_msg = _extract_kie_failure_message(status_response)
                            task.status = TaskStatus.FAILED
                            task.error_message = f"Provider failed: {error_msg}"
                            task.result_data = _make_json_safe(status_response)
                            task.completed_at = datetime.now(timezone.utc)
                            failed_count += 1
                            logger.warning("recover_stuck_task_failed", task_id=task.id, error=error_msg)

                        else:
                            # Still processing or unknown: keep task as-is and retry on next cycle.
                            logger.info(
                                "recover_stuck_task_still_processing",
                                task_id=task.id,
                                task_state=task_state,
                                raw_state=raw_state,
                            )

                except Exception as task_error:
                    logger.error(
                        "recover_stuck_task_error",
                        task_id=task.id,
                        error=str(task_error)
                    )
                    # Don't mark as failed yet - will retry on next recovery cycle
                    continue

            await db.commit()

            logger.info(
                "recover_stuck_tasks_completed",
                recovered_count=recovered_count,
                failed_count=failed_count,
                total_processed=len(stuck_tasks)
            )

            return {
                "status": "success",
                "recovered_count": recovered_count,
                "failed_count": failed_count,
                "total_processed": len(stuck_tasks)
            }

        except Exception as e:
            logger.error("recover_stuck_tasks_failed", error=str(e))
            raise


async def _recover_stuck_pending_tasks_async():
    """
    Recover tasks stuck in 'pending' status.

    This catches tasks where the Celery worker failed (e.g. asyncpg connection error)
    but never updated the DB status. These tasks have a celery_task_id but never
    transitioned to 'processing' — they were silently dropped.

    Strategy: check the Celery result backend for the task's state.
    - If Celery says the task completed (SUCCESS/FAILURE/REVOKED) but DB is still
      pending, mark the DB task as failed. Do NOT re-submit: the original Celery
      task already ran and either silently failed or returned a failure dict.
    - If Celery state is still PENDING/STARTED/RETRY, the task might still be
      queued or retrying — leave it alone unless it's been > 30 minutes.
    """
    from celery.result import AsyncResult
    from datetime import timezone

    async with AsyncSessionLocal() as db:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)

            result = await db.execute(
                select(MediaTask).filter(
                    MediaTask.status == TaskStatus.PENDING,
                    MediaTask.created_at < cutoff,
                    MediaTask.celery_task_id.isnot(None),  # Was submitted to Celery
                    MediaTask.started_at.is_(None),  # But never started
                ).limit(10)
            )
            stuck_pending = result.scalars().all()

            if not stuck_pending:
                return {"status": "success", "recovered": 0}

            recovered = 0
            now = datetime.now(timezone.utc)

            for task in stuck_pending:
                # Ensure created_at is timezone-aware for comparison
                task_created = task.created_at
                if task_created.tzinfo is None:
                    task_created = task_created.replace(tzinfo=timezone.utc)
                age_minutes = int((now - task_created).total_seconds() / 60)

                # Check Celery task state to avoid duplicate execution
                celery_state = "UNKNOWN"
                celery_result_info = None
                try:
                    ar = AsyncResult(task.celery_task_id, app=celery_app)
                    celery_state = ar.state  # PENDING, STARTED, RETRY, SUCCESS, FAILURE, REVOKED
                    if celery_state in ("SUCCESS", "FAILURE"):
                        celery_result_info = ar.result
                except Exception:
                    pass  # Redis unavailable — fall back to age-based logic

                # Terminal Celery states: task already ran but DB wasn't updated
                if celery_state in ("SUCCESS", "FAILURE", "REVOKED"):
                    error_detail = ""
                    if isinstance(celery_result_info, dict):
                        error_detail = celery_result_info.get("error", "")[:200]
                    elif isinstance(celery_result_info, Exception):
                        error_detail = str(celery_result_info)[:200]

                    task.status = TaskStatus.FAILED
                    task.error_message = (
                        f"Celery task finished ({celery_state}) but DB status was never updated. "
                        f"{error_detail}"
                    ).strip()
                    task.completed_at = now
                    recovered += 1
                    logger.warning(
                        "recover_stuck_pending_celery_terminal",
                        task_id=task.id,
                        celery_state=celery_state,
                        age_minutes=age_minutes,
                    )

                elif age_minutes >= 30:
                    # Very old pending task with non-terminal Celery state — give up
                    task.status = TaskStatus.FAILED
                    task.error_message = (
                        f"Task stuck in pending state for {age_minutes} minutes "
                        f"(celery_state={celery_state}). Likely lost."
                    )
                    task.completed_at = now
                    recovered += 1
                    logger.warning(
                        "recover_stuck_pending_timeout",
                        task_id=task.id,
                        celery_state=celery_state,
                        age_minutes=age_minutes,
                    )
                else:
                    # Non-terminal Celery state, < 30 min old — leave it alone
                    logger.info(
                        "recover_stuck_pending_waiting",
                        task_id=task.id,
                        celery_state=celery_state,
                        age_minutes=age_minutes,
                    )

            await db.commit()

            logger.info(
                "recover_stuck_pending_completed",
                recovered=recovered,
                total_checked=len(stuck_pending),
            )
            return {"status": "success", "recovered": recovered}

        except Exception as e:
            logger.error("recover_stuck_pending_failed_error", error=str(e))
            raise


@celery_app.task
def recover_stuck_tasks():
    """
    Periodic task to recover tasks stuck in 'processing' or 'pending' status.
    Handles cases where worker restarts, asyncpg errors, or other failures
    left tasks in a non-terminal state.
    Runs every 2 minutes (see celery beat schedule)
    """
    logger.info("recover_stuck_tasks_started")

    try:
        result = _run_async(_recover_stuck_tasks_async())

        # Also recover tasks stuck in 'pending' (silently dropped by Celery)
        try:
            pending_result = _run_async(_recover_stuck_pending_tasks_async())
            result["pending_recovered"] = pending_result.get("recovered", 0)
        except Exception as e:
            logger.error("recover_stuck_pending_exception", error=str(e))

        return result

    except Exception as e:
        logger.error("recover_stuck_tasks_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _backfill_missing_media_thumbnails_async(
    *,
    limit: int = 10,
    media_type: str | None = None,
):
    async with AsyncSessionLocal() as db:
        return await run_missing_media_thumbnail_backfill_batch(
            db,
            limit=limit,
            media_type=media_type,
        )


@celery_app.task
def backfill_missing_media_thumbnails(limit: int = 10, media_type: str | None = None):
    """Create lightweight thumbnails for historical completed image/video tasks."""
    logger.info("backfill_missing_media_thumbnails_started", limit=limit, media_type=media_type)
    try:
        result = _run_async(_backfill_missing_media_thumbnails_async(limit=limit, media_type=media_type))
        logger.info("backfill_missing_media_thumbnails_completed", **result)
        return result
    except Exception as e:
        logger.error("backfill_missing_media_thumbnails_exception", error=str(e))
        return {"status": "failed", "error": str(e)}
