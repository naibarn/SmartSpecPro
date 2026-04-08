from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Optional, Any
from pydantic import BaseModel
import structlog
import os
import json

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import (
    ImageGenerationRequest, ImageGenerationResponse,
    VideoGenerationRequest, VideoGenerationResponse,
    AudioGenerationRequest, AudioGenerationResponse
)
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.media_task import MediaTask, TaskStatus, MediaType
from app.services.media_task_service import MediaTaskService
from app.services.media_callback_service import (
    get_latest_callback_event_by_provider_task_id,
    process_kie_callback_payload,
)

# Import Celery tasks
try:
    from app.tasks.media_tasks import (
        generate_image_task,
        generate_video_task,
        generate_audio_task,
    )
    CELERY_ENABLED = True
except ImportError:
    CELERY_ENABLED = False
    logger = structlog.get_logger()
    logger.warning("celery_not_available", message="Celery tasks not available, using synchronous processing")

logger = structlog.get_logger()
router = APIRouter()


def _is_persistent_callback_pipeline_enabled() -> bool:
    """Feature flag for durable callback pipeline rollout."""
    raw = str(os.getenv("MEDIA_CALLBACK_PERSISTENT_PIPELINE_ENABLED", "true")).strip().lower()
    return raw not in {"0", "false", "no", "off"}


# ==================== Request/Response Models ====================

class TaskResponse(BaseModel):
    """Response model for task status"""
    id: str
    task_id: Optional[str] = None  # External provider task ID (e.g., Kie.ai)
    user_id: Any  # Can be int (from DB) or str (from JSON)
    media_type: str
    status: str
    model: str
    prompt: str
    parameters: Optional[dict] = None
    result_url: Optional[str] = None
    result_data: Optional[dict] = None
    error_message: Optional[str] = None
    credits_used: Optional[int] = None
    credits_balance: Optional[int] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class TaskListResponse(BaseModel):
    """Response model for task list"""
    tasks: List[TaskResponse]
    total: int
    limit: int
    offset: int


class BatchGenerationRequest(BaseModel):
    """Request model for batch generation"""
    prompts: List[str]
    model: str
    media_type: str  # "image", "video", "audio"
    parameters: Optional[dict] = None


class BatchGenerationResponse(BaseModel):
    """Response model for batch generation"""
    task_ids: List[str]
    total_tasks: int


class ModelInfo(BaseModel):
    """Model information"""
    id: str
    name: str
    provider: str
    media_type: str
    description: Optional[str] = None
    capabilities: List[str]
    cost_per_unit: Optional[float] = None


class ModelsListResponse(BaseModel):
    """Response model for models list"""
    models: List[ModelInfo]
    total: int


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


def _detect_task_provider(task: MediaTask) -> str:
    result_data = _coerce_json_dict(task.result_data)
    submission = result_data.get("submission")
    if isinstance(submission, dict):
        provider = submission.get("provider")
        if isinstance(provider, str) and provider.strip():
            return provider.strip().lower()

    response = result_data.get("response")
    if isinstance(response, dict):
        provider = response.get("provider")
        if isinstance(provider, str) and provider.strip():
            return provider.strip().lower()

    model = str(task.model or "").strip().lower()
    if model.startswith("wavespeed-ai/"):
        return "wavespeed_ai"
    return "kie_ai"


def _normalize_kie_task_state(status_response: dict) -> tuple[str, str]:
    """
    Normalize Kie task state to one of: success, fail, processing, unknown.
    Returns (normalized_state, raw_state).
    """
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

    # Some Kie/Veo responses expose a usable result URL without a conventional state field.
    result_url = _extract_first_kie_result_url(status_response)
    if result_url:
        return "success", "result_url"

    # Veo-style response can report completion or failure via successFlag without state/status fields.
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

    # Some Kie endpoints return only code/msg when record is not ready/not found on that route.
    code = status_response.get("code")
    if isinstance(code, int) and code != 200:
        msg = str(status_response.get("msg") or status_response.get("message") or "").lower()
        # Keep this as processing so caller can retry or use alternative route.
        if any(x in msg for x in ("null", "not found", "not success", "processing", "pending")):
            return "processing", msg or f"code_{code}"
        return "fail", msg or f"code_{code}"

    return "unknown", ""


def _extract_url_from_value(value: Any) -> Optional[str]:
    """Extract a media URL from common Kie response value shapes."""
    if isinstance(value, str) and value.startswith("http"):
        return value

    if isinstance(value, dict):
        for key in ("url", "image_url", "video_url", "audio_url", "imageUrl", "videoUrl", "audioUrl", "result_url"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.startswith("http"):
                return candidate

    return None


def _extract_first_kie_result_url(status_response: dict) -> Optional[str]:
    """
    Extract first result URL from Kie response.
    Handles resultJson, taskResult.images/videos/audios, output, and direct URL fields.
    """
    if not isinstance(status_response, dict):
        return None

    data = status_response.get("data", {})
    if not isinstance(data, dict):
        data = {}

    # 1) resultJson can be JSON string or dict
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

    # 2) taskResult often contains images/videos/audios arrays
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

    # 3) Veo-style payload often puts outputs under data.response.resultUrls
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

    # 4) output can be dict/list/string
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

    # 5) direct fields in data, then top-level
    url = _extract_url_from_value(data)
    if url:
        return url
    return _extract_url_from_value(status_response)


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

@router.post("/image", response_model=ImageGenerationResponse)
async def generate_image_endpoint(
    request: ImageGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate an image using Kie.ai and handle credit deduction.
    Also saves task to media_tasks table for history tracking.
    """
    gateway = LLMGateway(db)
    task = None
    external_task_id = None
    try:
        # Create task record before generation
        task = await MediaTaskService.create_task(
            db,
            current_user,
            MediaType.IMAGE,
            request.model,
            request.prompt,
            request.dict(exclude={'model', 'prompt'})
        )

        # Update task to processing
        await MediaTaskService.update_task_status(db, task.id, TaskStatus.PROCESSING)

        response = await gateway.generate_image(request, current_user)

        # Store external task ID for reference (available after Kie.ai responds)
        external_task_id = response.id
        logger.info("image_generation_got_external_id", task_id=task.id, external_task_id=external_task_id)

        # Update task with result
        result_url = response.data[0].get("url") if response.data else None
        await MediaTaskService.update_task_status(
            db,
            task.id,
            TaskStatus.COMPLETED,
            result_url=result_url,
            result_data={"response": response.dict(), "data": response.data},
            credits_used=int(response.credits_used) if response.credits_used else None,
            credits_balance=int(response.credits_balance) if response.credits_balance else None,
            external_task_id=external_task_id  # Store Kie.ai task ID for reference
        )

        # Store task_id in response for reference
        if task:
            response.task_id = task.id

        return response
    except HTTPException as e:
        # Update task as failed, but preserve external_task_id if available
        if task:
            await MediaTaskService.update_task_status(
                db, task.id, TaskStatus.FAILED,
                error_message=str(e.detail),
                external_task_id=external_task_id
            )
        raise e
    except Exception as e:
        logger.error("image_generation_endpoint_error", user_id=current_user.id, error=str(e))
        # Try to extract external task ID from exception message
        error_str = str(e)
        if not external_task_id:
            import re
            match = re.search(r'[a-f0-9]{32}', error_str)
            if match:
                external_task_id = match.group(0)
                logger.info("extracted_task_id_from_error", external_task_id=external_task_id)

        # Update task as failed, preserving external_task_id if available
        if task:
            await MediaTaskService.update_task_status(
                db, task.id, TaskStatus.FAILED,
                error_message=error_str,
                external_task_id=external_task_id
            )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")

@router.post("/video", response_model=VideoGenerationResponse)
async def generate_video_endpoint(
    request: VideoGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate a video using Kie.ai and handle credit deduction.
    Also saves task to media_tasks table for history tracking.
    """
    gateway = LLMGateway(db)
    task = None
    try:
        # Create task record before generation
        task = await MediaTaskService.create_task(
            db,
            current_user,
            MediaType.VIDEO,
            request.model,
            request.prompt,
            request.dict(exclude={'model', 'prompt'})
        )

        await MediaTaskService.update_task_status(db, task.id, TaskStatus.PROCESSING)

        response = await gateway.generate_video(request, current_user)

        # Update task with result
        result_url = response.data[0].get("url") if response.data else None
        await MediaTaskService.update_task_status(
            db,
            task.id,
            TaskStatus.COMPLETED,
            result_url=result_url,
            result_data={"response": response.dict(), "data": response.data},
            credits_used=int(response.credits_used) if response.credits_used else None,
            credits_balance=int(response.credits_balance) if response.credits_balance else None,
            external_task_id=response.id  # Store Kie.ai task ID for reference
        )

        if task:
            response.task_id = task.id

        return response
    except HTTPException as e:
        if task:
            await MediaTaskService.update_task_status(
                db, task.id, TaskStatus.FAILED, error_message=str(e.detail)
            )
        raise e
    except Exception as e:
        logger.error("video_generation_endpoint_error", user_id=current_user.id, error=str(e))
        if task:
            await MediaTaskService.update_task_status(
                db, task.id, TaskStatus.FAILED, error_message=str(e)
            )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")

@router.post("/audio", response_model=AudioGenerationResponse)
async def generate_audio_endpoint(
    request: AudioGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate audio using Kie.ai and handle credit deduction.
    Also saves task to media_tasks table for history tracking.
    """
    gateway = LLMGateway(db)
    task = None
    try:
        # Create task record before generation
        task = await MediaTaskService.create_task(
            db,
            current_user,
            MediaType.AUDIO,
            request.model,
            request.text,
            request.dict(exclude={'model', 'text'})
        )

        await MediaTaskService.update_task_status(db, task.id, TaskStatus.PROCESSING)

        response = await gateway.generate_audio(request, current_user)

        # Update task with result
        result_url = response.data[0].get("url") if response.data else None
        await MediaTaskService.update_task_status(
            db,
            task.id,
            TaskStatus.COMPLETED,
            result_url=result_url,
            result_data={"response": response.dict(), "data": response.data},
            credits_used=int(response.credits_used) if response.credits_used else None,
            credits_balance=int(response.credits_balance) if response.credits_balance else None,
            external_task_id=response.id  # Store Kie.ai task ID for reference
        )

        if task:
            response.task_id = task.id

        return response
    except HTTPException as e:
        if task:
            await MediaTaskService.update_task_status(
                db, task.id, TaskStatus.FAILED, error_message=str(e.detail)
            )
        raise e
    except Exception as e:
        logger.error("audio_generation_endpoint_error", user_id=current_user.id, error=str(e))
        if task:
            await MediaTaskService.update_task_status(
                db, task.id, TaskStatus.FAILED, error_message=str(e)
            )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")


# ==================== Task Management Endpoints ====================

# IMPORTANT: Static routes (/tasks/admin, /tasks) MUST be declared before
# parameterized routes (/tasks/{task_id}) so FastAPI matches them first.

@router.get("/tasks/admin", response_model=TaskListResponse)
async def list_all_tasks(
    media_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List ALL media tasks across all users (admin only).
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    media_type_enum = MediaType(media_type) if media_type else None
    status_enum = TaskStatus(status_filter) if status_filter else None

    tasks = await MediaTaskService.list_all_tasks(
        db,
        media_type=media_type_enum,
        status=status_enum,
        limit=limit,
        offset=offset,
    )

    total = await MediaTaskService.count_all_tasks(
        db,
        media_type=media_type_enum,
        status=status_enum,
    )

    return TaskListResponse(
        tasks=[TaskResponse(**task.to_dict()) for task in tasks],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    media_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    days_ago: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all media generation tasks for the current user.
    Supports filtering by media type, status, and days ago.
    """
    # Convert string filters to enums
    media_type_enum = MediaType(media_type) if media_type else None
    status_enum = TaskStatus(status_filter) if status_filter else None

    tasks = await MediaTaskService.list_user_tasks(
        db,
        current_user.id,
        media_type=media_type_enum,
        status=status_enum,
        limit=limit,
        offset=offset,
        days_ago=days_ago
    )

    total = await MediaTaskService.get_task_count(
        db,
        current_user.id,
        media_type=media_type_enum,
        status=status_enum,
        days_ago=days_ago
    )

    return TaskListResponse(
        tasks=[TaskResponse(**task.to_dict()) for task in tasks],
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task_status(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the status of a media generation task.
    Supports polling for async task completion.
    """
    task = await MediaTaskService.get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found"
        )

    return TaskResponse(**task.to_dict())


@router.patch("/tasks/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cancel a pending or processing task.
    Only the task owner can cancel it.
    """
    task = await MediaTaskService.cancel_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found or cannot be cancelled"
        )

    return {"success": True, "message": f"Task {task_id} cancelled", "task": TaskResponse(**task.to_dict())}


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a task from history.
    Only allows deletion of tasks that belong to the current user.
    """
    # Get task to verify ownership
    task = await MediaTaskService.get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found"
        )

    # Delete the task
    success = await MediaTaskService.delete_task(db, task_id, current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete task {task_id}"
        )

    return {"success": True, "message": f"Task {task_id} deleted"}


@router.post("/tasks/{task_id}/fetch-result")
async def fetch_task_result(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetch task result from Kie.ai using the external task ID.
    If the task is completed on Kie.ai, update our database with the result URL.

    This is useful when:
    - Callback wasn't received
    - Task is stuck in "processing" status
    - User wants to manually check status
    """
    # Get our task from database
    task = await MediaTaskService.get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found"
        )

    # If task already has result, return it
    if task.result_url and task.status == TaskStatus.COMPLETED.value:
        return {
            "success": True,
            "message": "Task already completed",
            "task": TaskResponse(**task.to_dict()),
            "fetched": False
        }

    # Get external task ID (provider task ID)
    external_task_id = task.task_id
    if not external_task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing provider_task_id for this task. Result queries require provider_task_id."
        )

    provider_name = _detect_task_provider(task)
    if provider_name == "wavespeed_ai":
        from app.tasks.media_tasks import _poll_wavespeed_video_task_async

        try:
            poll_result = await _poll_wavespeed_video_task_async(task_id, schedule_next_poll=False)
            await db.refresh(task)
        except Exception as e:
            logger.error("fetch_task_result_wavespeed_error", task_id=task_id, external_task_id=external_task_id, error=str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch task result: {str(e)}"
            )

        poll_status = str(poll_result.get("status") or "").strip().lower()
        if task.result_url and task.status == TaskStatus.COMPLETED.value:
            return {
                "success": True,
                "message": "Task completed, result fetched",
                "task": TaskResponse(**task.to_dict()),
                "fetched": poll_status != "terminal",
                "provider_state": "completed",
            }

        if task.status == TaskStatus.FAILED.value:
            error_message = task.error_message or "Task failed on WaveSpeed"
            return {
                "success": False,
                "message": f"Task failed: {error_message}",
                "task": TaskResponse(**task.to_dict()),
                "fetched": poll_status == "failed",
                "provider_state": "failed",
            }

        polling_state = _coerce_json_dict(task.result_data).get("polling")
        raw_status = polling_state.get("raw_status") if isinstance(polling_state, dict) else None
        return {
            "success": True,
            "message": f"Task still in progress (state: {raw_status or poll_status or 'processing'})",
            "task": TaskResponse(**task.to_dict()),
            "fetched": False,
            "provider_state": raw_status or poll_status or "processing",
        }

    # Initialize Kie.ai client
    from app.services.media_provider_service import initialize_kie_ai_client
    kie_client = await initialize_kie_ai_client()

    if not kie_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kie.ai client not configured"
        )

    try:
        # Resolve model-specific query endpoint from:
        # 1) task.parameters.api_config.query_endpoint (if request carried it)
        # 2) media_models.configJson.* (admin-configured per model)
        preferred_query_endpoint = None

        if isinstance(task.parameters, dict):
            api_cfg = task.parameters.get("api_config")
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
            except Exception as e:
                logger.warning("model_query_endpoint_lookup_failed", model=task.model, error=str(e))

        # Fetch status from Kie.ai
        status_response = await kie_client.get_task_status(
            external_task_id,
            preferred_status_endpoint=preferred_query_endpoint,
        )
        logger.info(
            "fetch_task_status_response",
            task_id=task_id,
            external_task_id=external_task_id,
            preferred_query_endpoint=preferred_query_endpoint,
            response=status_response,
        )

        # Normalize task state from multiple possible Kie formats
        task_state, raw_state = _normalize_kie_task_state(status_response)

        if task_state == "success":
            # Extract result URL from response
            result_url = _extract_first_kie_result_url(status_response)

            if result_url:
                # Look up actual credit cost from media_models table
                actual_credits = task.credits_used  # Use existing if already set
                if not actual_credits and task.model:
                    try:
                        # Query media_models table for credit cost
                        model_result = await db.execute(
                            text('SELECT "creditCost" FROM media_models WHERE "modelId" = :model_id'),
                            {"model_id": task.model}
                        )
                        model_row = model_result.fetchone()
                        if model_row and model_row[0]:
                            actual_credits = model_row[0]
                            logger.info("found_model_credit_cost", model=task.model, credits=actual_credits)
                        else:
                            actual_credits = 10  # Default fallback
                            logger.warning("model_credit_cost_not_found", model=task.model, using_default=actual_credits)
                    except Exception as e:
                        logger.error("failed_to_lookup_model_credits", model=task.model, error=str(e))
                        actual_credits = 10  # Default fallback

                # Update our database with result and actual credits
                updated_task = await MediaTaskService.update_task_status(
                    db,
                    task_id,
                    TaskStatus.COMPLETED,
                    result_url=result_url,
                    result_data={"kie_ai_response": status_response},
                    credits_used=actual_credits
                )
                return {
                    "success": True,
                    "message": "Task completed, result fetched",
                    "task": TaskResponse(**updated_task.to_dict()),
                    "fetched": True,
                    "kie_state": raw_state or task_state,
                }
            else:
                return {
                    "success": True,
                    "message": "Task completed but no result URL found in response",
                    "task": TaskResponse(**task.to_dict()),
                    "fetched": False,
                    "kie_response": status_response,
                    "kie_state": raw_state or task_state,
                }

        elif task_state == "fail":
            status_data = status_response.get("data", {})
            if not isinstance(status_data, dict):
                status_data = {}
            error_msg = (
                status_response.get("failMsg") or
                status_data.get("failMsg") or
                status_data.get("errorMessage") or
                status_response.get("message") or
                status_response.get("msg") or
                status_response.get("error") or
                "Task failed on Kie.ai"
            )
            if isinstance(error_msg, dict):
                error_msg = error_msg.get("message") or error_msg.get("detail") or json.dumps(error_msg, ensure_ascii=False)
            error_msg = str(error_msg)
            updated_task = await MediaTaskService.update_task_status(
                db,
                task_id,
                TaskStatus.FAILED,
                error_message=error_msg,
                result_data={
                    "kie_ai_response": status_response,
                    "normalized_state": task_state,
                    "raw_state": raw_state,
                },
            )
            return {
                "success": False,
                "message": f"Task failed: {error_msg}",
                "task": TaskResponse(**updated_task.to_dict()),
                "fetched": True,
                "kie_state": raw_state or task_state,
            }
        else:
            # Still processing or unknown state
            return {
                "success": True,
                "message": f"Task still in progress (state: {raw_state or task_state or 'unknown'})",
                "task": TaskResponse(**task.to_dict()),
                "fetched": False,
                "kie_state": raw_state or task_state or "unknown",
            }

    except Exception as e:
        logger.error("fetch_task_result_error", task_id=task_id, external_task_id=external_task_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch task result: {str(e)}"
        )


# ==================== Video Render Pipeline (Cloud Run Job) ====================


class VideoRenderRequest(BaseModel):
    """Request model for video render task from Cloud Tasks."""
    render_spec: dict
    queue_name: Optional[str] = None


@router.post("/tasks/process-video")
async def process_video_task(request: Request):
    """Handle video render task from Cloud Tasks.

    Launches a Cloud Run Job execution with the render spec
    passed as an environment variable.

    This endpoint is protected by OIDC validation middleware
    (see Section 04).
    """
    try:
        body = await request.json()
        render_spec = body.get("render_spec") or body.get("renderSpec")
        if not render_spec:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing render_spec in request body",
            )

        # Validate required fields
        render_hash = render_spec.get("renderHash")
        profile = render_spec.get("profile", "standard")
        if not render_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing renderHash in render spec",
            )
        if profile not in ("preview", "standard", "high"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid profile: {profile}. Must be preview, standard, or high.",
            )

        queue_name = body.get("queue_name", "video-jobs-short")

        # Determine CPU/memory based on queue
        if queue_name == "video-jobs-long":
            cpu = "4"
            memory = "16Gi"
            timeout = "1800s"
        else:
            cpu = "2"
            memory = "8Gi"
            timeout = "600s"

        logger.info(
            "process_video_task_received",
            render_hash=render_hash,
            profile=profile,
            queue=queue_name,
            cpu=cpu,
            memory=memory,
        )

        # In production, this would launch a Cloud Run Job execution.
        # For now, we execute the pipeline inline using the entrypoint logic.
        try:
            gcp_project = os.environ.get("GCP_PROJECT_ID")
            gcp_region = os.environ.get("GCP_REGION", "us-central1")

            if gcp_project:
                # Cloud Run Jobs API - launch async execution
                from google.cloud import run_v2

                client = run_v2.JobsClient()
                job_name = f"projects/{gcp_project}/locations/{gcp_region}/jobs/video-job-runner"

                execution = client.run_job(
                    request=run_v2.RunJobRequest(
                        name=job_name,
                        overrides=run_v2.RunJobRequest.Overrides(
                            container_overrides=[
                                run_v2.RunJobRequest.Overrides.ContainerOverride(
                                    env=[
                                        run_v2.EnvVar(
                                            name="RENDER_SPEC",
                                            value=json.dumps(render_spec),
                                        ),
                                    ],
                                ),
                            ],
                            timeout=timeout,
                        ),
                    ),
                )
                logger.info(
                    "cloud_run_job_launched",
                    render_hash=render_hash,
                    execution_name=execution.metadata.name if hasattr(execution, 'metadata') else "unknown",
                )
            else:
                logger.info(
                    "cloud_run_not_configured_inline_render",
                    render_hash=render_hash,
                )
                # Fallback: call entrypoint directly with spec as argument
                from app.video.entrypoint import main as render_main
                import threading
                spec_copy = dict(render_spec)
                thread = threading.Thread(target=render_main, args=(spec_copy,), daemon=True)
                thread.start()

        except ImportError:
            logger.warning("google_cloud_run_sdk_not_available", render_hash=render_hash)
            # Fallback to inline execution
            from app.video.entrypoint import main as render_main
            import threading
            spec_copy = dict(render_spec)
            thread = threading.Thread(target=render_main, args=(spec_copy,), daemon=True)
            thread.start()

        return JSONResponse(
            status_code=200,
            content={"success": True, "render_hash": render_hash, "profile": profile},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("process_video_task_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process video task: {str(e)}",
        )


# ==================== Batch Generation ====================

async def process_batch_task(
    db: AsyncSession,
    task_id: str,
    media_type: MediaType,
    model: str,
    prompt: str,
    parameters: dict,
    current_user: User
):
    """Background task to process media generation"""
    try:
        # Update task status to processing
        await MediaTaskService.update_task_status(db, task_id, TaskStatus.PROCESSING)

        gateway = LLMGateway(db)

        # Generate based on media type
        if media_type == MediaType.IMAGE:
            request = ImageGenerationRequest(
                model=model,
                prompt=prompt,
                **parameters
            )
            response = await gateway.generate_image(request, current_user)
        elif media_type == MediaType.VIDEO:
            request = VideoGenerationRequest(
                model=model,
                prompt=prompt,
                **parameters
            )
            response = await gateway.generate_video(request, current_user)
        elif media_type == MediaType.AUDIO:
            request = AudioGenerationRequest(
                model=model,
                text=prompt,
                **parameters
            )
            response = await gateway.generate_audio(request, current_user)
        else:
            raise ValueError(f"Unknown media type: {media_type}")

        # Update task with results
        await MediaTaskService.update_task_status(
            db,
            task_id,
            TaskStatus.COMPLETED,
            result_url=response.data[0].get("url") if response.data else None,
            result_data={"response": response.dict()},
            credits_used=int(response.credits_used) if response.credits_used else None,
            credits_balance=int(response.credits_balance) if response.credits_balance else None
        )

    except Exception as e:
        logger.error("batch_task_error", task_id=task_id, error=str(e))
        await MediaTaskService.update_task_status(
            db,
            task_id,
            TaskStatus.FAILED,
            error_message=str(e)
        )


@router.post("/batch", response_model=BatchGenerationResponse)
async def batch_generate(
    request: BatchGenerationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create multiple media generation tasks in batch.
    Tasks are processed asynchronously in the background.
    """
    media_type = MediaType(request.media_type)
    task_ids = []

    for prompt in request.prompts:
        # Create task
        task = await MediaTaskService.create_task(
            db,
            current_user,
            media_type,
            request.model,
            prompt,
            request.parameters
        )
        task_ids.append(task.id)

        # Add to background tasks
        background_tasks.add_task(
            process_batch_task,
            db,
            task.id,
            media_type,
            request.model,
            prompt,
            request.parameters or {},
            current_user
        )

    return BatchGenerationResponse(
        task_ids=task_ids,
        total_tasks=len(task_ids)
    )


# ==================== Models Listing ====================

@router.get("/models", response_model=ModelsListResponse)
async def list_available_models(
    media_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all available media generation models.
    Optionally filter by media type (image, video, audio).
    """
    # This is a simplified version - in production, this would query
    # from a models configuration or database
    all_models = [
        # Image models
        ModelInfo(
            id="dall-e-3",
            name="DALL-E 3",
            provider="openai",
            media_type="image",
            description="OpenAI's latest image generation model",
            capabilities=["text-to-image", "high-quality", "1024x1024"],
            cost_per_unit=0.04
        ),
        ModelInfo(
            id="stable-diffusion-xl",
            name="Stable Diffusion XL",
            provider="stability",
            media_type="image",
            description="High-quality open-source image generation",
            capabilities=["text-to-image", "style-transfer", "inpainting"],
            cost_per_unit=0.02
        ),
        ModelInfo(
            id="midjourney-v6",
            name="Midjourney V6",
            provider="midjourney",
            media_type="image",
            description="Advanced artistic image generation",
            capabilities=["text-to-image", "artistic", "photorealistic"],
            cost_per_unit=0.05
        ),
        # Video models
        ModelInfo(
            id="runway-gen2",
            name="Runway Gen-2",
            provider="runway",
            media_type="video",
            description="Text and image to video generation",
            capabilities=["text-to-video", "image-to-video", "720p", "1080p"],
            cost_per_unit=0.5
        ),
        ModelInfo(
            id="pika-1.0",
            name="Pika 1.0",
            provider="pika",
            media_type="video",
            description="Creative video generation",
            capabilities=["text-to-video", "3d-animation", "720p"],
            cost_per_unit=0.4
        ),
        # Audio models
        ModelInfo(
            id="elevenlabs-turbo",
            name="ElevenLabs Turbo",
            provider="elevenlabs",
            media_type="audio",
            description="High-quality text-to-speech",
            capabilities=["text-to-speech", "voice-cloning", "multilingual"],
            cost_per_unit=0.15
        ),
        ModelInfo(
            id="openai-tts-1",
            name="OpenAI TTS",
            provider="openai",
            media_type="audio",
            description="Natural text-to-speech",
            capabilities=["text-to-speech", "multiple-voices"],
            cost_per_unit=0.015
        ),
    ]

    # Filter by media type if specified
    if media_type:
        all_models = [m for m in all_models if m.media_type == media_type]

    return ModelsListResponse(
        models=all_models,
        total=len(all_models)
    )


# ==================== Download Endpoint ====================

@router.get("/download/{task_id}")
async def download_media(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Download generated media file.
    Only the task owner can download.
    """
    task = await MediaTaskService.get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found"
        )

    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task is not completed yet (status: {task.status})"
        )

    if not task.result_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No media file available for this task"
        )

    # If result_url is a local file path
    if os.path.exists(task.result_url):
        return FileResponse(
            task.result_url,
            media_type="application/octet-stream",
            filename=os.path.basename(task.result_url)
        )

    # If result_url is a remote URL, redirect
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=task.result_url)


# ==================== Render File Serving ====================

@router.get("/files/renders/{user_id}/{job_id}/{filename}")
async def serve_render_file(
    user_id: str,
    job_id: str,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """
    Serve a rendered video file from media_storage/renders/.
    Only the file owner (or admin) can access.
    """
    # Ownership check
    if str(current_user.id) != user_id and getattr(current_user, "role", None) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Path traversal prevention — use only the basename
    safe_filename = os.path.basename(filename)
    media_storage = os.getenv("MEDIA_STORAGE_PATH", "./media_storage")
    file_path = os.path.join(media_storage, "renders", user_id, job_id, safe_filename)

    real_path = os.path.realpath(file_path)
    real_base = os.path.realpath(media_storage)
    if not real_path.startswith(real_base + os.sep):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(file_path, media_type="video/mp4", filename=safe_filename)


@router.get("/files/transcoded/{user_id}/{job_id}/{filename}")
async def serve_transcoded_file(
    user_id: str,
    job_id: str,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """
    Serve a transcoded video file from media_storage/transcoded/.
    Only the file owner (or admin) can access.
    """
    if str(current_user.id) != user_id and getattr(current_user, "role", None) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    safe_filename = os.path.basename(filename)
    media_storage = os.getenv("MEDIA_STORAGE_PATH", "./media_storage")
    file_path = os.path.join(media_storage, "transcoded", user_id, job_id, safe_filename)

    real_path = os.path.realpath(file_path)
    real_base = os.path.realpath(media_storage)
    if not real_path.startswith(real_base + os.sep):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(file_path, media_type="video/mp4", filename=safe_filename)


@router.get("/files/audio_extracts/{user_id}/{job_id}/{filename}")
async def serve_audio_extract_file(
    user_id: str,
    job_id: str,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """
    Serve an extracted audio file from media_storage/audio_extracts/.
    Only the file owner (or admin) can access.
    """
    if str(current_user.id) != user_id and getattr(current_user, "role", None) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    safe_filename = os.path.basename(filename)
    media_storage = os.getenv("MEDIA_STORAGE_PATH", "./media_storage")
    file_path = os.path.join(media_storage, "audio_extracts", user_id, job_id, safe_filename)

    real_path = os.path.realpath(file_path)
    real_base = os.path.realpath(media_storage)
    if not real_path.startswith(real_base + os.sep):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(file_path, media_type="audio/mp4", filename=safe_filename)


# ==================== Async Endpoints with Celery ====================

@router.post("/async/image", response_model=TaskResponse)
async def generate_image_async(
    request: ImageGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit image generation to Celery queue (async processing).
    Returns immediately with task_id for status polling.
    """
    if not CELERY_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Async processing not available. Use /image endpoint instead."
        )

    # Create task in database
    task = await MediaTaskService.create_task(
        db,
        current_user,
        MediaType.IMAGE,
        request.model,
        request.prompt,
        request.dict(exclude={'model', 'prompt'})
    )

    # Submit to Celery
    celery_task = generate_image_task.delay(task.id, current_user.id, request.dict())

    # Store Celery task ID for tracking/monitoring
    task.celery_task_id = celery_task.id
    await db.commit()

    logger.info("async_image_task_submitted", task_id=task.id, celery_task_id=celery_task.id, user_id=current_user.id)
    return TaskResponse(**task.to_dict())


@router.post("/async/video", response_model=TaskResponse)
async def generate_video_async(
    request: VideoGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit video generation to Celery queue (async processing).
    Returns immediately with task_id for status polling.
    """
    if not CELERY_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Async processing not available. Use /video endpoint instead."
        )

    task = await MediaTaskService.create_task(
        db,
        current_user,
        MediaType.VIDEO,
        request.model,
        request.prompt,
        request.dict(exclude={'model', 'prompt'})
    )

    try:
        celery_task = generate_video_task.delay(task.id, current_user.id, request.dict())
        logger.info("async_video_task_submitted", task_id=task.id, celery_task_id=celery_task.id, user_id=current_user.id)

        # Store Celery task ID for tracking/monitoring
        task.celery_task_id = celery_task.id
        # task_id will be set by the Celery worker after getting response from provider
        # Do NOT overwrite it here with Celery task ID
        await db.commit()
    except Exception as e:
        logger.error("celery_task_submission_failed", task_id=task.id, error=str(e), error_type=type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit task to queue: {str(e)}"
        )

    return TaskResponse(**task.to_dict())


@router.post("/async/audio", response_model=TaskResponse)
async def generate_audio_async(
    request: AudioGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit audio generation to Celery queue (async processing).
    Returns immediately with task_id for status polling.
    """
    if not CELERY_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Async processing not available. Use /audio endpoint instead."
        )

    task = await MediaTaskService.create_task(
        db,
        current_user,
        MediaType.AUDIO,
        request.model,
        request.text,
        request.dict(exclude={'model', 'text'})
    )

    celery_task = generate_audio_task.delay(task.id, current_user.id, request.dict())

    # Store Celery task ID for tracking/monitoring
    task.celery_task_id = celery_task.id
    await db.commit()

    logger.info("async_audio_task_submitted", task_id=task.id, celery_task_id=celery_task.id, user_id=current_user.id)
    return TaskResponse(**task.to_dict())


# ==================== Kie.ai Callback Endpoint ====================

class KieAICallbackPayload(BaseModel):
    """Payload received from Kie.ai callback"""
    taskId: str
    status: str  # "completed", "failed", "cancelled"
    output: Optional[dict] = None
    error: Optional[str] = None


# Store pending task callbacks (in production, use Redis or database)
_pending_callbacks: dict[str, dict[str, Any]] = {}


def store_pending_callback(task_id: str, data: dict):
    """Store callback data for a pending task"""
    _pending_callbacks[task_id] = data
    logger.info("callback_stored", task_id=task_id)


def get_pending_callback(task_id: str) -> Optional[dict]:
    """Get and remove callback data for a task"""
    return _pending_callbacks.pop(task_id, None)


@router.post("/callback/kie-ai")
async def kie_ai_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Callback endpoint for Kie.ai task completion notifications.

    This endpoint is called by Kie.ai when a media generation task completes.
    The URL should be configured in Admin > Media Providers > Kie AI > Callback URL.

    For local development with cloudflared tunnel:
    1. Run: cloudflared tunnel --url http://localhost:8001
    2. Copy the generated URL (e.g., https://abc123.trycloudflare.com)
    3. Set callback URL to: https://abc123.trycloudflare.com/api/v1/media/callback/kie-ai
    """
    try:
        # Verify HMAC signature if webhook secret is configured
        import hmac
        import hashlib
        kie_webhook_secret = os.environ.get("KIE_AI_WEBHOOK_SECRET", "")
        if kie_webhook_secret:
            sig = request.headers.get("x-signature", "")
            body_bytes = await request.body()
            expected = hmac.new(
                kie_webhook_secret.encode(), body_bytes, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(sig, expected):
                logger.warning("kie_ai_callback_invalid_signature")
                return JSONResponse(
                    status_code=401,
                    content={"success": False, "error": "Invalid signature"},
                )
            import json
            body = json.loads(body_bytes)
        else:
            # No secret configured — accept without verification (log warning)
            logger.warning("kie_ai_callback_no_webhook_secret_configured")
            body = await request.json()
        logger.info("kie_ai_callback_received", body=body)
        task_id = body.get("taskId") or body.get("task_id")

        # Durable pipeline: persist callback event first, then process idempotently.
        if _is_persistent_callback_pipeline_enabled():
            try:
                result = await process_kie_callback_payload(db, body)
                return JSONResponse(
                    status_code=200,
                    content={
                        "success": result.get("status") in {"completed", "retry_pending"},
                        "message": "Callback persisted and processed",
                        "event_id": result.get("event_id"),
                        "status": result.get("status"),
                        "duplicate": result.get("duplicate", False),
                        "provider_task_id": result.get("provider_task_id"),
                        "error": result.get("error"),
                    },
                )
            except Exception as persistent_err:
                # Transition-safe fallback while rolling out durable callback pipeline.
                logger.error(
                    "kie_ai_persistent_callback_pipeline_error",
                    error=str(persistent_err),
                    task_id=task_id,
                )

        # Legacy fallback path (feature-flagged off durable pipeline).
        status_str = str(body.get("status", "")).lower()
        data = body.get("data", {}) if isinstance(body.get("data"), dict) else {}
        output = body.get("output", {})
        error = body.get("error")

        if not status_str:
            success_flag = data.get("successFlag")
            if success_flag in (1, True):
                status_str = "completed"
            elif success_flag in (0, False):
                status_str = "failed"
            elif data:
                status_str = "processing"

        if (not output or not isinstance(output, dict)) and isinstance(data.get("response"), dict):
            output = data.get("response")

        if not error and isinstance(data, dict):
            error = data.get("errorMessage") or data.get("msg")

        if not task_id:
            logger.warning("kie_ai_callback_missing_task_id", body=body)
            return JSONResponse(status_code=400, content={"success": False, "error": "Missing taskId"})

        result_url = None
        if isinstance(output, dict):
            result_url = (
                output.get("url")
                or output.get("image_url")
                or output.get("video_url")
                or output.get("audio_url")
            )
            if not result_url and "urls" in output:
                urls = output.get("urls", [])
                if urls:
                    result_url = urls[0] if isinstance(urls[0], str) else urls[0].get("url")
            if not result_url and "resultUrls" in output:
                result_urls = output.get("resultUrls", [])
                if result_urls:
                    result_url = result_urls[0] if isinstance(result_urls[0], str) else result_urls[0].get("url")

        callback_data = {
            "task_id": task_id,
            "status": status_str,
            "result_url": result_url,
            "output": output,
            "error": error,
        }
        store_pending_callback(task_id, callback_data)

        try:
            if status_str == "completed" and result_url:
                await MediaTaskService.update_task_by_external_id(
                    db,
                    task_id,
                    TaskStatus.COMPLETED,
                    result_url=result_url,
                    result_data={"output": output},
                )
            elif status_str == "failed":
                await MediaTaskService.update_task_by_external_id(
                    db,
                    task_id,
                    TaskStatus.FAILED,
                    error_message=error or "Task failed",
                )
        except Exception as e:
            logger.warning("kie_ai_callback_db_update_failed", task_id=task_id, error=str(e))

        return JSONResponse(status_code=200, content={"success": True, "message": "Callback processed (legacy mode)"})

    except Exception as e:
        logger.error("kie_ai_callback_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@router.get("/callback/status/{task_id}")
async def get_callback_status(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Check if a callback has been received for a task.
    Used for polling when waiting for async task completion.
    """
    callback_data = get_pending_callback(task_id)

    if callback_data:
        return {
            "received": True,
            "task_id": task_id,
            "status": callback_data.get("status"),
            "result_url": callback_data.get("result_url"),
            "error": callback_data.get("error")
        }

    # Check database for task status
    task = await MediaTaskService.get_task(db, task_id, current_user.id)
    if task:
        callback_event = await get_latest_callback_event_by_provider_task_id(db, task.task_id or "")
        return {
            "received": task.status in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value],
            "task_id": task_id,
            "status": task.status,
            "result_url": task.result_url,
            "error": task.error_message,
            "callback_event_status": callback_event.status if callback_event else None,
            "callback_event_attempts": callback_event.attempt_count if callback_event else None,
            "provider_task_id": task.task_id,
        }

    return {"received": False, "task_id": task_id}


# ==================== Admin Endpoints ====================

@router.post("/admin/clear-cache")
async def clear_provider_cache(
    current_user: User = Depends(get_current_user)
):
    """
    Clear the media provider cache and force re-initialization.

    Use this after updating provider settings (API key, callback URL, etc.)
    to ensure the new settings are picked up without restarting the server.
    """
    # Check if user is admin
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    from app.services.media_provider_service import clear_cache
    from app.llm_proxy.gateway_unified import LLMGateway

    # Clear the provider config cache
    clear_cache()

    # Clear the cached kie_ai_client in LLMGateway
    gateway = LLMGateway()
    if gateway.unified_client.kie_ai_client:
        gateway.unified_client.kie_ai_client = None
        logger.info("kie_ai_client_cleared")

    logger.info("provider_cache_cleared", user_id=current_user.id)

    return {
        "success": True,
        "message": "Provider cache cleared. Next request will use updated settings."
    }
