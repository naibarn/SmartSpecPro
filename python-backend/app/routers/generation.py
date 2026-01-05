"""
SmartSpec Pro - Generation API Router
API endpoints for image, video, and audio generation.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from pydantic import BaseModel, Field

from app.services.generation.models import MediaType, list_models_summary, get_model
from app.services.generation.generation_service import (
    GenerationService,
    GenerationTaskCreate,
    GenerationTaskResponse,
    get_generation_service,
)
from app.services.generation.key_management import (
    KeyManagementService,
    APIKeyCreate,
    APIKeyInfo,
    APIKeyWithSecret,
    APIKeyScope,
    get_key_management_service,
)

router = APIRouter(prefix="/generation", tags=["Generation"])


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================

class GenerateImageRequest(BaseModel):
    """Request for image generation."""
    prompt: str = Field(..., min_length=1, max_length=20000)
    model_id: str = Field(default="nano-banana-pro")
    aspect_ratio: str = Field(default="1:1")
    resolution: str = Field(default="2K")
    output_format: str = Field(default="png")
    reference_images: Optional[List[str]] = Field(default=None)


class GenerateVideoRequest(BaseModel):
    """Request for video generation."""
    prompt: str = Field(..., min_length=1, max_length=5000)
    model_id: str = Field(default="wan/2-6-text-to-video")
    duration: int = Field(default=5, ge=5, le=60)
    resolution: str = Field(default="720p")
    multi_shots: bool = Field(default=False)
    reference_image: Optional[str] = Field(default=None)


class GenerateAudioRequest(BaseModel):
    """Request for audio/speech generation."""
    text: str = Field(..., min_length=1, max_length=10000)
    model_id: str = Field(default="elevenlabs/text-to-speech-turbo-2-5")
    voice: str = Field(default="Rachel")
    stability: float = Field(default=0.5, ge=0, le=1)
    similarity_boost: float = Field(default=0.75, ge=0, le=1)
    speed: float = Field(default=1.0, ge=0.7, le=1.2)


class TaskResponse(BaseModel):
    """Response for generation task."""
    id: str
    status: str
    task_type: str
    model_id: str
    prompt: str
    output_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    error_message: Optional[str] = None
    credits_used: float = 0
    progress: float = 0
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class ModelInfo(BaseModel):
    """Model information."""
    id: str
    name: str
    media_type: str
    description: str
    status: str
    is_featured: bool
    base_credits: float
    aspect_ratios: Optional[List[str]] = None
    resolutions: Optional[List[str]] = None
    durations: Optional[List[int]] = None
    output_formats: Optional[List[str]] = None
    tags: List[str] = []


class APIKeyCreateRequest(BaseModel):
    """Request for creating an API key."""
    name: str = Field(..., min_length=1, max_length=100)
    scopes: List[str] = Field(default_factory=lambda: ["*"])
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=365)
    rate_limit_per_minute: int = Field(default=60, ge=1, le=1000)
    rate_limit_per_day: int = Field(default=10000, ge=1, le=1000000)
    allowed_origins: Optional[List[str]] = Field(default=None)


class APIKeyResponse(BaseModel):
    """Response for API key."""
    id: str
    name: str
    key_prefix: str
    scopes: List[str]
    is_active: bool
    created_at: str
    expires_at: Optional[str] = None
    last_used_at: Optional[str] = None
    usage_count: int
    rate_limit_per_minute: int
    rate_limit_per_day: int


class APIKeyCreatedResponse(APIKeyResponse):
    """Response for newly created API key (includes the key)."""
    key: str  # Only shown once on creation


# =============================================================================
# DEPENDENCIES
# =============================================================================

async def get_current_user_id(
    authorization: Optional[str] = Header(None),
) -> str:
    """
    Get current user ID from authorization header.
    For demo, returns a default user ID.
    """
    # TODO: Implement proper authentication
    return "demo-user-id"


async def validate_api_key(
    x_api_key: Optional[str] = Header(None),
    request: Request = None,
) -> Optional[APIKeyInfo]:
    """
    Validate API key from header.
    """
    if not x_api_key:
        return None
    
    key_service = get_key_management_service()
    origin = request.headers.get("origin") if request else None
    
    return await key_service.validate_key(x_api_key, origin=origin)


# =============================================================================
# MODEL ENDPOINTS
# =============================================================================

@router.get("/models", response_model=List[ModelInfo])
async def list_models(
    media_type: Optional[str] = Query(None, description="Filter by media type"),
    include_beta: bool = Query(True, description="Include beta models"),
):
    """
    List available generation models.
    
    Returns all models or filtered by media type.
    """
    service = get_generation_service()
    
    mt = None
    if media_type:
        try:
            mt = MediaType(media_type)
        except ValueError:
            raise HTTPException(400, f"Invalid media type: {media_type}")
    
    models = service.list_models(media_type=mt, include_beta=include_beta)
    return models


@router.get("/models/{model_id}", response_model=Dict[str, Any])
async def get_model_details(model_id: str):
    """
    Get detailed information about a specific model.
    """
    service = get_generation_service()
    model_info = service.get_model_info(model_id)
    
    if not model_info:
        raise HTTPException(404, f"Model not found: {model_id}")
    
    return model_info


# =============================================================================
# IMAGE GENERATION
# =============================================================================

@router.post("/image", response_model=TaskResponse)
async def generate_image(
    request: GenerateImageRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate an image using AI.
    
    Supported models:
    - nano-banana-pro (Google Gemini 3.0)
    - z-image
    - seedream-4-5
    - flux-2
    """
    service = get_generation_service()
    
    # Validate model
    model = get_model(request.model_id)
    if not model or model.media_type != MediaType.IMAGE:
        raise HTTPException(400, f"Invalid image model: {request.model_id}")
    
    task_data = GenerationTaskCreate(
        user_id=user_id,
        model_id=request.model_id,
        prompt=request.prompt,
        media_type=MediaType.IMAGE,
        options={
            "aspect_ratio": request.aspect_ratio,
            "resolution": request.resolution,
            "output_format": request.output_format,
        },
        reference_files=request.reference_images,
    )
    
    result = await service.create_generation_task(task_data)
    
    return TaskResponse(
        id=result.id,
        status=result.status,
        task_type=result.task_type,
        model_id=result.model_id,
        prompt=result.prompt,
        output_url=result.output_url,
        thumbnail_url=result.thumbnail_url,
        error_message=result.error_message,
        credits_used=result.credits_used,
        progress=result.progress,
        created_at=result.created_at.isoformat() if result.created_at else None,
        completed_at=result.completed_at.isoformat() if result.completed_at else None,
    )


# =============================================================================
# VIDEO GENERATION
# =============================================================================

@router.post("/video", response_model=TaskResponse)
async def generate_video(
    request: GenerateVideoRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate a video using AI.
    
    Supported models:
    - wan/2-6-text-to-video
    - wan/2-6-image-to-video
    - seedance-1-5-pro
    - sora-2-pro-storyboard
    - veo-3-1
    - sora-2-pro
    - infinitalk
    """
    service = get_generation_service()
    
    # Validate model
    model = get_model(request.model_id)
    if not model or model.media_type != MediaType.VIDEO:
        raise HTTPException(400, f"Invalid video model: {request.model_id}")
    
    task_data = GenerationTaskCreate(
        user_id=user_id,
        model_id=request.model_id,
        prompt=request.prompt,
        media_type=MediaType.VIDEO,
        options={
            "duration": request.duration,
            "resolution": request.resolution,
            "multi_shots": request.multi_shots,
        },
        reference_files=[request.reference_image] if request.reference_image else None,
    )
    
    result = await service.create_generation_task(task_data)
    
    return TaskResponse(
        id=result.id,
        status=result.status,
        task_type=result.task_type,
        model_id=result.model_id,
        prompt=result.prompt,
        output_url=result.output_url,
        thumbnail_url=result.thumbnail_url,
        error_message=result.error_message,
        credits_used=result.credits_used,
        progress=result.progress,
        created_at=result.created_at.isoformat() if result.created_at else None,
        completed_at=result.completed_at.isoformat() if result.completed_at else None,
    )


# =============================================================================
# AUDIO GENERATION
# =============================================================================

@router.post("/audio", response_model=TaskResponse)
async def generate_audio(
    request: GenerateAudioRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate audio/speech using AI.
    
    Supported models:
    - elevenlabs/text-to-speech-turbo-2-5
    - elevenlabs/text-to-speech-multilingual-v2
    - elevenlabs/sound-effect
    """
    service = get_generation_service()
    
    # Validate model
    model = get_model(request.model_id)
    if not model or model.media_type != MediaType.AUDIO:
        raise HTTPException(400, f"Invalid audio model: {request.model_id}")
    
    task_data = GenerationTaskCreate(
        user_id=user_id,
        model_id=request.model_id,
        prompt=request.text,
        media_type=MediaType.AUDIO,
        options={
            "voice": request.voice,
            "stability": request.stability,
            "similarity_boost": request.similarity_boost,
            "speed": request.speed,
        },
    )
    
    result = await service.create_generation_task(task_data)
    
    return TaskResponse(
        id=result.id,
        status=result.status,
        task_type=result.task_type,
        model_id=result.model_id,
        prompt=result.prompt,
        output_url=result.output_url,
        thumbnail_url=result.thumbnail_url,
        error_message=result.error_message,
        credits_used=result.credits_used,
        progress=result.progress,
        created_at=result.created_at.isoformat() if result.created_at else None,
        completed_at=result.completed_at.isoformat() if result.completed_at else None,
    )


# =============================================================================
# TASK MANAGEMENT
# =============================================================================

@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task_status(
    task_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Get the status of a generation task.
    """
    service = get_generation_service()
    result = await service.get_task_status(task_id)
    
    if not result:
        raise HTTPException(404, f"Task not found: {task_id}")
    
    return TaskResponse(
        id=result.id,
        status=result.status,
        task_type=result.task_type,
        model_id=result.model_id,
        prompt=result.prompt,
        output_url=result.output_url,
        thumbnail_url=result.thumbnail_url,
        error_message=result.error_message,
        credits_used=result.credits_used,
        progress=result.progress,
        created_at=result.created_at.isoformat() if result.created_at else None,
        completed_at=result.completed_at.isoformat() if result.completed_at else None,
    )


@router.get("/tasks/{task_id}/wait", response_model=TaskResponse)
async def wait_for_task(
    task_id: str,
    timeout: int = Query(default=300, ge=1, le=600),
    user_id: str = Depends(get_current_user_id),
):
    """
    Wait for a generation task to complete.
    
    Long-polling endpoint that returns when the task completes or times out.
    """
    service = get_generation_service()
    result = await service.wait_for_task(task_id, timeout=timeout)
    
    if not result:
        raise HTTPException(404, f"Task not found: {task_id}")
    
    return TaskResponse(
        id=result.id,
        status=result.status,
        task_type=result.task_type,
        model_id=result.model_id,
        prompt=result.prompt,
        output_url=result.output_url,
        thumbnail_url=result.thumbnail_url,
        error_message=result.error_message,
        credits_used=result.credits_used,
        progress=result.progress,
        created_at=result.created_at.isoformat() if result.created_at else None,
        completed_at=result.completed_at.isoformat() if result.completed_at else None,
    )


@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    media_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user_id),
):
    """
    List generation tasks for the current user.
    """
    service = get_generation_service()
    
    mt = None
    if media_type:
        try:
            mt = MediaType(media_type)
        except ValueError:
            raise HTTPException(400, f"Invalid media type: {media_type}")
    
    results = await service.get_user_tasks(
        user_id=user_id,
        media_type=mt,
        status=status,
        limit=limit,
        offset=offset,
    )
    
    return [
        TaskResponse(
            id=r.id,
            status=r.status,
            task_type=r.task_type,
            model_id=r.model_id,
            prompt=r.prompt,
            output_url=r.output_url,
            thumbnail_url=r.thumbnail_url,
            error_message=r.error_message,
            credits_used=r.credits_used,
            progress=r.progress,
            created_at=r.created_at.isoformat() if r.created_at else None,
            completed_at=r.completed_at.isoformat() if r.completed_at else None,
        )
        for r in results
    ]


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Delete a generation task and its output files.
    """
    service = get_generation_service()
    deleted = await service.delete_task(task_id, user_id)
    
    if not deleted:
        raise HTTPException(404, f"Task not found: {task_id}")
    
    return {"message": "Task deleted successfully"}


# =============================================================================
# API KEY MANAGEMENT
# =============================================================================

@router.post("/api-keys", response_model=APIKeyCreatedResponse)
async def create_api_key(
    request: APIKeyCreateRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Create a new API key.
    
    The key is only shown once in the response. Store it securely.
    """
    key_service = get_key_management_service()
    
    key_data = APIKeyCreate(
        name=request.name,
        scopes=request.scopes,
        expires_in_days=request.expires_in_days,
        rate_limit_per_minute=request.rate_limit_per_minute,
        rate_limit_per_day=request.rate_limit_per_day,
        allowed_origins=request.allowed_origins,
    )
    
    result = await key_service.create_key(
        user_id=user_id,
        project_id="default",  # TODO: Support multiple projects
        key_data=key_data,
    )
    
    return APIKeyCreatedResponse(
        id=result.id,
        name=result.name,
        key_prefix=result.key_prefix,
        key=result.key,
        scopes=result.scopes,
        is_active=result.is_active,
        created_at=result.created_at.isoformat(),
        expires_at=result.expires_at.isoformat() if result.expires_at else None,
        last_used_at=result.last_used_at.isoformat() if result.last_used_at else None,
        usage_count=result.usage_count,
        rate_limit_per_minute=result.rate_limit_per_minute,
        rate_limit_per_day=result.rate_limit_per_day,
    )


@router.get("/api-keys", response_model=List[APIKeyResponse])
async def list_api_keys(
    include_inactive: bool = Query(False),
    user_id: str = Depends(get_current_user_id),
):
    """
    List all API keys for the current user.
    """
    key_service = get_key_management_service()
    
    keys = await key_service.list_keys(
        user_id=user_id,
        include_inactive=include_inactive,
    )
    
    return [
        APIKeyResponse(
            id=k.id,
            name=k.name,
            key_prefix=k.key_prefix,
            scopes=k.scopes,
            is_active=k.is_active,
            created_at=k.created_at.isoformat(),
            expires_at=k.expires_at.isoformat() if k.expires_at else None,
            last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
            usage_count=k.usage_count,
            rate_limit_per_minute=k.rate_limit_per_minute,
            rate_limit_per_day=k.rate_limit_per_day,
        )
        for k in keys
    ]


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Revoke (deactivate) an API key.
    """
    key_service = get_key_management_service()
    revoked = await key_service.revoke_key(key_id, user_id)
    
    if not revoked:
        raise HTTPException(404, f"API key not found: {key_id}")
    
    return {"message": "API key revoked successfully"}


@router.post("/api-keys/{key_id}/rotate", response_model=APIKeyCreatedResponse)
async def rotate_api_key(
    key_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Rotate an API key (generate new key, keep same settings).
    
    The new key is only shown once in the response.
    """
    key_service = get_key_management_service()
    result = await key_service.rotate_key(key_id, user_id)
    
    if not result:
        raise HTTPException(404, f"API key not found: {key_id}")
    
    return APIKeyCreatedResponse(
        id=result.id,
        name=result.name,
        key_prefix=result.key_prefix,
        key=result.key,
        scopes=result.scopes,
        is_active=result.is_active,
        created_at=result.created_at.isoformat(),
        expires_at=result.expires_at.isoformat() if result.expires_at else None,
        last_used_at=result.last_used_at.isoformat() if result.last_used_at else None,
        usage_count=result.usage_count,
        rate_limit_per_minute=result.rate_limit_per_minute,
        rate_limit_per_day=result.rate_limit_per_day,
    )
