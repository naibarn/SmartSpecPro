from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel
import structlog
import os

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

logger = structlog.get_logger()
router = APIRouter()


# ==================== Request/Response Models ====================

class TaskResponse(BaseModel):
    """Response model for task status"""
    id: str
    user_id: str
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

@router.post("/image", response_model=ImageGenerationResponse)
async def generate_image_endpoint(
    request: ImageGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate an image using Kie.ai and handle credit deduction.
    """
    gateway = LLMGateway(db)
    try:
        response = await gateway.generate_image(request, current_user)
        return response
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error("image_generation_endpoint_error", user_id=current_user.id, error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")

@router.post("/video", response_model=VideoGenerationResponse)
async def generate_video_endpoint(
    request: VideoGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate a video using Kie.ai and handle credit deduction.
    """
    gateway = LLMGateway(db)
    try:
        response = await gateway.generate_video(request, current_user)
        return response
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error("video_generation_endpoint_error", user_id=current_user.id, error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")

@router.post("/audio", response_model=AudioGenerationResponse)
async def generate_audio_endpoint(
    request: AudioGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint to generate audio using Kie.ai and handle credit deduction.
    """
    gateway = LLMGateway(db)
    try:
        response = await gateway.generate_audio(request, current_user)
        return response
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error("audio_generation_endpoint_error", user_id=current_user.id, error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")


# ==================== Task Management Endpoints ====================

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


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    media_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all media generation tasks for the current user.
    Supports filtering by media type and status.
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
        offset=offset
    )

    total = await MediaTaskService.get_task_count(
        db,
        current_user.id,
        media_type=media_type_enum,
        status=status_enum
    )

    return TaskListResponse(
        tasks=[TaskResponse(**task.to_dict()) for task in tasks],
        total=total,
        limit=limit,
        offset=offset
    )


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
