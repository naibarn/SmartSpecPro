"""
SmartSpec Pro - Authenticated Generation Router
API endpoints for generation with API key authentication.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.generation.authenticated_generation import (
    AuthenticatedGenerationService,
    get_authenticated_generation_service,
)

router = APIRouter(prefix="/v2/generation", tags=["Generation API v2"])


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================

class GenerateRequest(BaseModel):
    """Request to create a generation task."""
    model_id: str = Field(..., description="Model ID to use for generation")
    prompt: str = Field(..., min_length=1, max_length=10000, description="Generation prompt")
    options: Optional[dict] = Field(default=None, description="Generation options")
    reference_files: Optional[List[str]] = Field(default=None, description="Reference file URLs")
    callback_url: Optional[str] = Field(default=None, description="Webhook URL for completion")


class TaskResponse(BaseModel):
    """Generation task response."""
    success: bool
    task: Optional[dict] = None
    credits_reserved: Optional[float] = None
    error: Optional[str] = None
    message: Optional[str] = None


class TaskListResponse(BaseModel):
    """List of generation tasks."""
    success: bool
    tasks: List[dict] = []
    count: int = 0
    error: Optional[str] = None


class CreditsResponse(BaseModel):
    """Credits balance response."""
    success: bool
    balance: Optional[dict] = None
    error: Optional[str] = None


class UsageHistoryResponse(BaseModel):
    """Usage history response."""
    success: bool
    history: List[dict] = []
    error: Optional[str] = None


class ModelsResponse(BaseModel):
    """Available models response."""
    success: bool
    models: List[dict] = []
    error: Optional[str] = None


class ModelInfoResponse(BaseModel):
    """Model info response."""
    success: bool
    model: Optional[dict] = None
    error: Optional[str] = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
) -> str:
    """Extract API key from headers."""
    # Try X-API-Key header first
    if x_api_key:
        return x_api_key
    
    # Try Authorization header (Bearer token)
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="API key required. Provide via X-API-Key header or Authorization: Bearer <key>",
    )


# =============================================================================
# GENERATION ENDPOINTS
# =============================================================================

@router.post("/generate", response_model=TaskResponse)
async def create_generation(
    request: Request,
    data: GenerateRequest,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new generation task.
    
    Requires API key with `generation:create` scope.
    Credits will be reserved and committed upon completion.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.create_generation_task(
        api_key=api_key,
        model_id=data.model_id,
        prompt=data.prompt,
        options=data.options,
        reference_files=data.reference_files,
        callback_url=data.callback_url,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        elif result["error"] == "insufficient_credits":
            raise HTTPException(status_code=402, detail=result)
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return TaskResponse(**result)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task_status(
    request: Request,
    task_id: str,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Get the status of a generation task.
    
    Requires API key with `generation:read` scope.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.get_task_status(
        api_key=api_key,
        task_id=task_id,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        elif result["error"] == "task_not_found":
            raise HTTPException(status_code=404, detail=result["message"])
        elif result["error"] == "access_denied":
            raise HTTPException(status_code=403, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return TaskResponse(**result)


@router.get("/tasks/{task_id}/wait", response_model=TaskResponse)
async def wait_for_task(
    request: Request,
    task_id: str,
    timeout: int = 300,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Wait for a generation task to complete.
    
    Long-polling endpoint that waits up to `timeout` seconds.
    Requires API key with `generation:read` scope.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.wait_for_task(
        api_key=api_key,
        task_id=task_id,
        timeout=min(timeout, 300),  # Max 5 minutes
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        elif result["error"] == "task_not_found":
            raise HTTPException(status_code=404, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return TaskResponse(**result)


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    request: Request,
    media_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    List generation tasks for the authenticated user.
    
    Requires API key with `generation:read` scope.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.get_user_tasks(
        api_key=api_key,
        media_type=media_type,
        status=status,
        limit=min(limit, 100),
        offset=offset,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return TaskListResponse(**result)


@router.delete("/tasks/{task_id}")
async def delete_task(
    request: Request,
    task_id: str,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a generation task and its outputs.
    
    Requires API key with `generation:delete` scope.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.delete_task(
        api_key=api_key,
        task_id=task_id,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        elif result["error"] == "delete_failed":
            raise HTTPException(status_code=404, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return result


# =============================================================================
# CREDITS ENDPOINTS
# =============================================================================

@router.get("/credits", response_model=CreditsResponse)
async def get_credits_balance(
    request: Request,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Get credits balance for the authenticated user.
    
    Requires API key with `credits:read` scope.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.get_credits_balance(
        api_key=api_key,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return CreditsResponse(**result)


@router.get("/credits/history", response_model=UsageHistoryResponse)
async def get_usage_history(
    request: Request,
    limit: int = 50,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Get credits usage history for the authenticated user.
    
    Requires API key with `credits:read` scope.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.get_usage_history(
        api_key=api_key,
        limit=min(limit, 100),
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return UsageHistoryResponse(**result)


# =============================================================================
# MODELS ENDPOINTS
# =============================================================================

@router.get("/models", response_model=ModelsResponse)
async def list_models(
    request: Request,
    media_type: Optional[str] = None,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    List available generation models.
    
    Requires API key with `generation:read` scope.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.list_models(
        api_key=api_key,
        media_type=media_type,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return ModelsResponse(**result)


@router.get("/models/{model_id}", response_model=ModelInfoResponse)
async def get_model_info(
    request: Request,
    model_id: str,
    api_key: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed information about a specific model.
    
    Requires API key with `generation:read` scope.
    """
    service = get_authenticated_generation_service(db)
    
    result = await service.get_model_info(
        api_key=api_key,
        model_id=model_id,
        ip_address=get_client_ip(request),
    )
    
    if "error" in result:
        if result["error"] == "invalid_api_key":
            raise HTTPException(status_code=401, detail=result["message"])
        elif result["error"] == "model_not_found":
            raise HTTPException(status_code=404, detail=result["message"])
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    
    return ModelInfoResponse(**result)
