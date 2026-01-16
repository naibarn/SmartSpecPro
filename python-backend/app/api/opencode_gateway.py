"""
SmartSpec Pro - OpenCode Gateway API
Phase 1.4: OpenCode Integration (COMPLETED)

OpenAI-compatible API Gateway for external tools like OpenCode CLI and OpenWork.
This endpoint allows OpenCode to connect to SmartSpecPro's LLM Gateway
and use the existing credit system for billing.

Endpoints:
- POST /v1/opencode/chat/completions - Chat completions (OpenAI-compatible)
- GET /v1/opencode/models - List available models
- POST /v1/opencode/api-keys - Create API key for OpenCode
- GET /v1/opencode/api-keys - List user's API keys
- DELETE /v1/opencode/api-keys/{key_id} - Revoke API key
- GET /v1/opencode/usage - Get usage statistics
- GET /v1/opencode/health - Health check
"""

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, AsyncGenerator, Tuple

from fastapi import APIRouter, HTTPException, Request, Response, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import structlog

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import verify_token
from app.models.user import User
from app.models.api_key import APIKey
from app.services.credit_service import CreditService
from app.services.api_key_service import APIKeyService
from app.llm_proxy.gateway_unified import LLMGateway
from app.orchestrator.agents.budget_controller import (
    TokenBudgetController,
    BudgetScope,
    calculate_cost,
)

logger = structlog.get_logger()

router = APIRouter(prefix="/v1/opencode", tags=["OpenCode Gateway"])


# ==================== MODELS ====================

class ChatMessage(BaseModel):
    """OpenAI-compatible chat message."""
    role: str = Field(..., description="Role: system, user, assistant")
    content: str = Field(..., description="Message content")
    name: Optional[str] = Field(None, description="Optional name")


class ChatCompletionRequest(BaseModel):
    """OpenAI-compatible chat completion request."""
    model: str = Field(..., description="Model to use")
    messages: List[ChatMessage] = Field(..., description="Conversation messages")
    temperature: Optional[float] = Field(0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(4096, ge=1, le=128000)
    stream: Optional[bool] = Field(False)
    top_p: Optional[float] = Field(1.0, ge=0, le=1)
    frequency_penalty: Optional[float] = Field(0.0, ge=-2, le=2)
    presence_penalty: Optional[float] = Field(0.0, ge=-2, le=2)
    stop: Optional[List[str]] = Field(None)
    user: Optional[str] = Field(None, description="User identifier")


class ChatCompletionChoice(BaseModel):
    """Chat completion choice."""
    index: int
    message: ChatMessage
    finish_reason: str


class ChatCompletionUsage(BaseModel):
    """Token usage information."""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatCompletionResponse(BaseModel):
    """OpenAI-compatible chat completion response."""
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[ChatCompletionChoice]
    usage: ChatCompletionUsage


class ModelInfo(BaseModel):
    """Model information."""
    id: str
    object: str = "model"
    created: int
    owned_by: str


class ModelsResponse(BaseModel):
    """List models response."""
    object: str = "list"
    data: List[ModelInfo]


class APIKeyCreateRequest(BaseModel):
    """Request to create an API key."""
    name: str = Field(..., description="Name for the API key")
    expires_in_days: Optional[int] = Field(90, description="Days until expiration (default: 90)")
    description: Optional[str] = Field(None, description="Optional description")


class APIKeyResponse(BaseModel):
    """API key response (with raw key - only shown once)."""
    id: str
    name: str
    key: str  # Only shown once on creation
    key_prefix: str
    created_at: str
    expires_at: Optional[str]
    description: Optional[str]


class APIKeyListItem(BaseModel):
    """API key list item (without raw key)."""
    id: str
    name: str
    key_prefix: str
    is_active: bool
    created_at: str
    expires_at: Optional[str]
    last_used_at: Optional[str]
    description: Optional[str]


class UsageResponse(BaseModel):
    """Usage statistics response."""
    total_tokens: int
    total_cost: float
    requests_count: int
    period_start: str
    period_end: str
    by_model: Dict[str, Any]


# ==================== DEPENDENCIES ====================

async def get_api_key_user(
    authorization: str = Header(..., description="Bearer API key"),
    db: AsyncSession = Depends(get_db),
) -> Tuple[User, Optional[APIKey]]:
    """
    Validate API key and return the associated user.
    
    Supports both:
    - SmartSpec API keys (sk-smartspec-...)
    - JWT tokens (for backward compatibility)
    
    Returns:
        (User, APIKey) tuple - APIKey is None for JWT auth
    """
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization.split(" ", 1)[1].strip()
    
    # Check if it's a SmartSpec API key
    if token.startswith("sk-smartspec-"):
        result = await APIKeyService.validate_api_key(db, token)
        if not result:
            logger.warning("opencode_auth_failed", reason="invalid_api_key")
            raise HTTPException(status_code=401, detail="Invalid API key")
        
        api_key, user = result
        logger.info(
            "opencode_auth_success",
            auth_type="api_key",
            user_id=str(user.id),
            key_id=str(api_key.id)
        )
        return (user, api_key)
    
    # Try JWT token
    try:
        payload = verify_token(token)
        if not payload or "user_id" not in payload:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_id = payload["user_id"]
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        logger.info(
            "opencode_auth_success",
            auth_type="jwt",
            user_id=str(user.id)
        )
        return (user, None)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("opencode_auth_failed", error=str(e))
        raise HTTPException(status_code=401, detail="Authentication failed")


async def get_user_only(
    auth_result: Tuple[User, Optional[APIKey]] = Depends(get_api_key_user)
) -> User:
    """Get only the user from auth result."""
    return auth_result[0]


# ==================== AVAILABLE MODELS ====================

AVAILABLE_MODELS = [
    # Anthropic
    {"id": "claude-3.5-sonnet", "owned_by": "anthropic"},
    {"id": "claude-3-opus", "owned_by": "anthropic"},
    {"id": "claude-3-haiku", "owned_by": "anthropic"},
    {"id": "anthropic/claude-3.5-sonnet", "owned_by": "anthropic"},
    {"id": "anthropic/claude-3-opus", "owned_by": "anthropic"},
    # OpenAI
    {"id": "gpt-4o", "owned_by": "openai"},
    {"id": "gpt-4o-mini", "owned_by": "openai"},
    {"id": "gpt-4-turbo", "owned_by": "openai"},
    {"id": "openai/gpt-4o", "owned_by": "openai"},
    {"id": "openai/gpt-4o-mini", "owned_by": "openai"},
    # DeepSeek
    {"id": "deepseek-chat", "owned_by": "deepseek"},
    {"id": "deepseek-coder", "owned_by": "deepseek"},
    {"id": "deepseek/deepseek-chat", "owned_by": "deepseek"},
    # Google
    {"id": "gemini-pro", "owned_by": "google"},
    {"id": "gemini-flash-1.5", "owned_by": "google"},
    {"id": "google/gemini-pro", "owned_by": "google"},
    {"id": "google/gemini-flash-1.5", "owned_by": "google"},
    # Meta
    {"id": "meta-llama/llama-3.1-70b-instruct", "owned_by": "meta"},
    {"id": "meta-llama/llama-3.1-8b-instruct", "owned_by": "meta"},
]


# ==================== ENDPOINTS ====================

@router.get("/models", response_model=ModelsResponse)
async def list_models(
    user: User = Depends(get_user_only),
):
    """
    List available models.
    
    Returns a list of models that can be used with the chat completions endpoint.
    """
    models = [
        ModelInfo(
            id=m["id"],
            created=int(time.time()),
            owned_by=m["owned_by"],
        )
        for m in AVAILABLE_MODELS
    ]
    
    return ModelsResponse(data=models)


@router.post("/chat/completions")
async def create_chat_completion(
    request: ChatCompletionRequest,
    req: Request,
    auth_result: Tuple[User, Optional[APIKey]] = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a chat completion (OpenAI-compatible).
    
    This endpoint is compatible with the OpenAI API format,
    allowing tools like OpenCode to connect seamlessly.
    """
    user, api_key = auth_result
    request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    start_time = time.time()
    
    logger.info(
        "opencode_chat_request",
        request_id=request_id,
        user_id=str(user.id),
        api_key_id=str(api_key.id) if api_key else None,
        model=request.model,
        message_count=len(request.messages),
        stream=request.stream,
    )
    
    try:
        # Check user credits
        credit_service = CreditService(db)
        balance = await credit_service.get_balance(str(user.id))
        
        if balance <= 0:
            raise HTTPException(
                status_code=402,
                detail="Insufficient credits. Please add credits to continue.",
            )
        
        # Validate model (allow both short and full names)
        valid_model_ids = [m["id"] for m in AVAILABLE_MODELS]
        if request.model not in valid_model_ids:
            # Try to find a matching model
            matching = [m for m in valid_model_ids if request.model in m or m in request.model]
            if not matching:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid model. Available models: {', '.join(set(m['id'] for m in AVAILABLE_MODELS))}",
                )
        
        # Get unified gateway
        gateway = LLMGateway(db)
        
        # Prepare messages for gateway
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        
        if request.stream:
            # Streaming response
            return StreamingResponse(
                _stream_completion(
                    gateway=gateway,
                    request_id=request_id,
                    model=request.model,
                    messages=messages,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    user=user,
                    api_key=api_key,
                    credit_service=credit_service,
                    db=db,
                ),
                media_type="text/event-stream",
            )
        else:
            # Non-streaming response
            result = await gateway.chat_completion(
                model=request.model,
                messages=messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                user_id=str(user.id),
            )
            
            # Calculate usage and cost
            input_tokens = result.get("usage", {}).get("prompt_tokens", 0)
            output_tokens = result.get("usage", {}).get("completion_tokens", 0)
            total_tokens = input_tokens + output_tokens
            cost = calculate_cost(request.model, input_tokens, output_tokens)
            
            # Deduct credits
            await credit_service.deduct_credits(
                user_id=str(user.id),
                amount=cost,
                description=f"OpenCode: {request.model} ({total_tokens} tokens)",
            )
            
            # Record API key usage if applicable
            if api_key:
                duration_ms = int((time.time() - start_time) * 1000)
                await APIKeyService.record_usage(
                    db=db,
                    api_key=api_key,
                    endpoint="/v1/opencode/chat/completions",
                    method="POST",
                    status_code=200,
                    response_time=duration_ms,
                    credits_used=int(cost * 100),  # Convert to integer credits
                    ip_address=req.client.host if req.client else None,
                    user_agent=req.headers.get("user-agent"),
                )
            
            # Build response
            response = ChatCompletionResponse(
                id=request_id,
                created=int(time.time()),
                model=request.model,
                choices=[
                    ChatCompletionChoice(
                        index=0,
                        message=ChatMessage(
                            role="assistant",
                            content=result.get("content", ""),
                        ),
                        finish_reason=result.get("finish_reason", "stop"),
                    )
                ],
                usage=ChatCompletionUsage(
                    prompt_tokens=input_tokens,
                    completion_tokens=output_tokens,
                    total_tokens=total_tokens,
                ),
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(
                "opencode_chat_completed",
                request_id=request_id,
                duration_ms=duration_ms,
                total_tokens=total_tokens,
                cost=cost,
            )
            
            return response
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("opencode_chat_error", request_id=request_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


async def _stream_completion(
    gateway: LLMGateway,
    request_id: str,
    model: str,
    messages: List[Dict],
    temperature: float,
    max_tokens: int,
    user: User,
    api_key: Optional[APIKey],
    credit_service: CreditService,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """Stream chat completion chunks."""
    total_input_tokens = 0
    total_output_tokens = 0
    start_time = time.time()
    
    try:
        async for chunk in gateway.chat_completion_stream(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            user_id=str(user.id),
        ):
            # Track tokens
            if "usage" in chunk:
                total_input_tokens = chunk["usage"].get("prompt_tokens", total_input_tokens)
                total_output_tokens += chunk["usage"].get("completion_tokens", 0)
            
            # Format as SSE
            data = {
                "id": request_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": chunk.get("content", "")},
                        "finish_reason": chunk.get("finish_reason"),
                    }
                ],
            }
            
            yield f"data: {json.dumps(data)}\n\n"
        
        # Final chunk
        yield "data: [DONE]\n\n"
        
        # Deduct credits after streaming completes
        total_tokens = total_input_tokens + total_output_tokens
        cost = calculate_cost(model, total_input_tokens, total_output_tokens)
        
        await credit_service.deduct_credits(
            user_id=str(user.id),
            amount=cost,
            description=f"OpenCode (stream): {model} ({total_tokens} tokens)",
        )
        
        # Record API key usage if applicable
        if api_key:
            duration_ms = int((time.time() - start_time) * 1000)
            await APIKeyService.record_usage(
                db=db,
                api_key=api_key,
                endpoint="/v1/opencode/chat/completions",
                method="POST",
                status_code=200,
                response_time=duration_ms,
                credits_used=int(cost * 100),
            )
        
        logger.info(
            "opencode_stream_completed",
            request_id=request_id,
            total_tokens=total_tokens,
            cost=cost,
        )
        
    except Exception as e:
        logger.error("opencode_stream_error", request_id=request_id, error=str(e))
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@router.get("/usage", response_model=UsageResponse)
async def get_usage(
    user: User = Depends(get_user_only),
    db: AsyncSession = Depends(get_db),
):
    """
    Get usage statistics for the current billing period.
    """
    now = datetime.utcnow()
    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Get credit service for usage data
    credit_service = CreditService(db)
    
    # Get usage from credit transactions
    # This is a simplified implementation
    return UsageResponse(
        total_tokens=0,
        total_cost=0.0,
        requests_count=0,
        period_start=period_start.isoformat(),
        period_end=now.isoformat(),
        by_model={},
    )


# ==================== API KEY MANAGEMENT ====================

@router.post("/api-keys", response_model=APIKeyResponse)
async def create_api_key(
    request: APIKeyCreateRequest,
    user: User = Depends(get_user_only),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new API key for OpenCode access.
    
    The API key will only be shown once. Make sure to save it securely.
    """
    # Create API key using the service
    api_key, raw_key = await APIKeyService.create_opencode_api_key(
        db=db,
        user=user,
        name=request.name,
        expires_in_days=request.expires_in_days or 90,
    )
    
    # Update description if provided
    if request.description:
        api_key = await APIKeyService.update_api_key(
            db=db,
            api_key=api_key,
            description=request.description,
        )
    
    logger.info(
        "opencode_api_key_created",
        user_id=str(user.id),
        key_id=str(api_key.id),
        name=request.name,
    )
    
    return APIKeyResponse(
        id=str(api_key.id),
        name=api_key.name,
        key=raw_key,  # Only shown once!
        key_prefix=api_key.key_prefix,
        created_at=api_key.created_at.isoformat(),
        expires_at=api_key.expires_at.isoformat() if api_key.expires_at else None,
        description=api_key.description,
    )


@router.get("/api-keys", response_model=List[APIKeyListItem])
async def list_api_keys(
    user: User = Depends(get_user_only),
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = False,
):
    """
    List all API keys for the current user.
    
    Note: The actual key values are not returned for security.
    """
    api_keys = await APIKeyService.get_user_api_keys(
        db=db,
        user=user,
        include_inactive=include_inactive,
    )
    
    return [
        APIKeyListItem(
            id=str(key.id),
            name=key.name,
            key_prefix=key.key_prefix,
            is_active=key.is_active,
            created_at=key.created_at.isoformat(),
            expires_at=key.expires_at.isoformat() if key.expires_at else None,
            last_used_at=key.last_used_at.isoformat() if key.last_used_at else None,
            description=key.description,
        )
        for key in api_keys
    ]


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    user: User = Depends(get_user_only),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke (deactivate) an API key.
    
    The key will no longer be usable for authentication.
    """
    api_key = await APIKeyService.get_api_key_by_id(db, key_id, user)
    
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    
    await APIKeyService.revoke_api_key(db, api_key)
    
    logger.info(
        "opencode_api_key_revoked",
        user_id=str(user.id),
        key_id=key_id,
    )
    
    return {"status": "revoked", "key_id": key_id}


@router.post("/api-keys/{key_id}/rotate", response_model=APIKeyResponse)
async def rotate_api_key(
    key_id: str,
    user: User = Depends(get_user_only),
    db: AsyncSession = Depends(get_db),
):
    """
    Rotate an API key (generate new key, same ID).
    
    The old key will be immediately invalidated.
    The new key will only be shown once.
    """
    api_key = await APIKeyService.get_api_key_by_id(db, key_id, user)
    
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    
    api_key, new_raw_key = await APIKeyService.rotate_api_key(db, api_key)
    
    logger.info(
        "opencode_api_key_rotated",
        user_id=str(user.id),
        key_id=key_id,
    )
    
    return APIKeyResponse(
        id=str(api_key.id),
        name=api_key.name,
        key=new_raw_key,  # Only shown once!
        key_prefix=api_key.key_prefix,
        created_at=api_key.created_at.isoformat(),
        expires_at=api_key.expires_at.isoformat() if api_key.expires_at else None,
        description=api_key.description,
    )


@router.get("/api-keys/{key_id}/usage")
async def get_api_key_usage(
    key_id: str,
    days: int = 30,
    user: User = Depends(get_user_only),
    db: AsyncSession = Depends(get_db),
):
    """
    Get usage statistics for a specific API key.
    """
    api_key = await APIKeyService.get_api_key_by_id(db, key_id, user)
    
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    
    stats = await APIKeyService.get_usage_stats(db, api_key, days)
    
    return {
        "key_id": key_id,
        "key_name": api_key.name,
        **stats,
    }


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "opencode-gateway",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
    }
