"""
SmartSpec Pro - OpenCode Gateway API
Phase 1.4: OpenCode Integration

OpenAI-compatible API Gateway for external tools like OpenCode CLI.
This endpoint allows OpenCode to connect to SmartSpecPro's LLM Gateway
and use the existing credit system for billing.

Endpoints:
- POST /v1/opencode/chat/completions - Chat completions (OpenAI-compatible)
- GET /v1/opencode/models - List available models
- POST /v1/opencode/api-keys - Create API key for OpenCode
- GET /v1/opencode/usage - Get usage statistics
"""

import asyncio
import json
import time
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, AsyncGenerator

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
from app.services.credit_service import CreditService
from app.llm_proxy.gateway_unified import UnifiedGateway
from app.orchestrator.agents.token_budget_controller import (
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


class APIKeyRequest(BaseModel):
    """Request to create an API key."""
    name: str = Field(..., description="Name for the API key")
    expires_in_days: Optional[int] = Field(None, description="Days until expiration")


class APIKeyResponse(BaseModel):
    """API key response."""
    id: str
    name: str
    key: str  # Only shown once on creation
    created_at: str
    expires_at: Optional[str]


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
) -> User:
    """
    Validate API key and return the associated user.
    
    Supports both:
    - SmartSpec API keys (sk-smartspec-...)
    - JWT tokens (for backward compatibility)
    """
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization.split(" ", 1)[1].strip()
    
    # Check if it's a SmartSpec API key
    if token.startswith("sk-smartspec-"):
        user = await _validate_api_key(token, db)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid API key")
        return user
    
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
        
        return user
        
    except Exception as e:
        logger.warning("auth_failed", error=str(e))
        raise HTTPException(status_code=401, detail="Authentication failed")


async def _validate_api_key(api_key: str, db: AsyncSession) -> Optional[User]:
    """Validate a SmartSpec API key and return the associated user."""
    # TODO: Implement API key validation against database
    # For now, return None to indicate not implemented
    # This will be implemented when API Key Service is ready
    return None


# ==================== AVAILABLE MODELS ====================

AVAILABLE_MODELS = [
    {"id": "claude-3.5-sonnet", "owned_by": "anthropic"},
    {"id": "claude-3-opus", "owned_by": "anthropic"},
    {"id": "claude-3-haiku", "owned_by": "anthropic"},
    {"id": "gpt-4o", "owned_by": "openai"},
    {"id": "gpt-4o-mini", "owned_by": "openai"},
    {"id": "gpt-4-turbo", "owned_by": "openai"},
    {"id": "deepseek-chat", "owned_by": "deepseek"},
    {"id": "deepseek-coder", "owned_by": "deepseek"},
]


# ==================== ENDPOINTS ====================

@router.get("/models", response_model=ModelsResponse)
async def list_models(
    user: User = Depends(get_api_key_user),
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
    user: User = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a chat completion (OpenAI-compatible).
    
    This endpoint is compatible with the OpenAI API format,
    allowing tools like OpenCode to connect seamlessly.
    """
    request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    start_time = time.time()
    
    logger.info(
        "opencode_chat_request",
        request_id=request_id,
        user_id=str(user.id),
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
        
        # Validate model
        valid_models = [m["id"] for m in AVAILABLE_MODELS]
        if request.model not in valid_models:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid model. Available models: {', '.join(valid_models)}",
            )
        
        # Get unified gateway
        gateway = UnifiedGateway()
        
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
                    credit_service=credit_service,
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
    gateway: UnifiedGateway,
    request_id: str,
    model: str,
    messages: List[Dict],
    temperature: float,
    max_tokens: int,
    user: User,
    credit_service: CreditService,
) -> AsyncGenerator[str, None]:
    """Stream chat completion chunks."""
    total_input_tokens = 0
    total_output_tokens = 0
    
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
    user: User = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get usage statistics for the current billing period.
    """
    # TODO: Implement usage tracking
    # For now, return placeholder data
    now = datetime.utcnow()
    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    return UsageResponse(
        total_tokens=0,
        total_cost=0.0,
        requests_count=0,
        period_start=period_start.isoformat(),
        period_end=now.isoformat(),
        by_model={},
    )


@router.post("/api-keys", response_model=APIKeyResponse)
async def create_api_key(
    request: APIKeyRequest,
    user: User = Depends(get_api_key_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new API key for OpenCode access.
    
    The API key will only be shown once. Make sure to save it securely.
    """
    # Generate API key
    key_id = uuid.uuid4().hex[:8]
    key_secret = uuid.uuid4().hex
    api_key = f"sk-smartspec-{key_id}-{key_secret}"
    
    # TODO: Store API key in database (hashed)
    # For now, return the key without storing
    
    now = datetime.utcnow()
    expires_at = None
    if request.expires_in_days:
        from datetime import timedelta
        expires_at = now + timedelta(days=request.expires_in_days)
    
    logger.info(
        "api_key_created",
        user_id=str(user.id),
        key_id=key_id,
        name=request.name,
    )
    
    return APIKeyResponse(
        id=key_id,
        name=request.name,
        key=api_key,
        created_at=now.isoformat(),
        expires_at=expires_at.isoformat() if expires_at else None,
    )


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "opencode-gateway"}
