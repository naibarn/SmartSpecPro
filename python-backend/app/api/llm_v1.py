"""
LLM API v1
Enhanced LLM endpoints with streaming and moderation
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.streaming_service import StreamingService
from app.services.moderation_service import ModerationService
from app.services.credit_service import CreditService
from app.llm_proxy.unified_client import get_unified_client

router = APIRouter(prefix="/api/v1/llm", tags=["LLM v1"])


# ============================================================
# Request/Response Models
# ============================================================

class ChatMessage(BaseModel):
    """Chat message"""
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str


class ChatCompletionRequest(BaseModel):
    """Chat completion request"""
    messages: List[ChatMessage]
    model: Optional[str] = None
    provider: Optional[str] = None
    temperature: float = Field(0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(None, ge=1, le=32000)
    task_type: str = Field("general", pattern="^(general|coding|creative|analysis|translation|summarization)$")
    budget_priority: str = Field("balanced", pattern="^(cost|balanced|performance)$")
    stream: bool = False
    moderate: bool = True


class ChatCompletionResponse(BaseModel):
    """Chat completion response"""
    content: str
    model: str
    provider: str
    usage: Dict[str, int]
    cost_usd: float
    credits_used: int
    moderation: Optional[Dict[str, Any]] = None


class ModerationResponse(BaseModel):
    """Moderation response"""
    flagged: bool
    categories: Dict[str, Any]
    action: str
    reason: str


# ============================================================
# Endpoints
# ============================================================

@router.post("/chat/completions", response_model=ChatCompletionResponse)
async def chat_completion(
    request: ChatCompletionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Chat completion (non-streaming)
    
    - Requires authentication
    - Supports multiple providers and models
    - Automatic model selection based on task type
    - Optional content moderation
    - Credits deducted based on usage
    
    Args:
        request: Chat completion request
    
    Returns:
        Chat completion response
    """
    llm_client = get_unified_client()
    credit_service = CreditService(db)
    moderation_service = ModerationService(db)
    
    # Check credits
    balance = await credit_service.get_balance(str(current_user.id))
    if balance <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits"
        )
    
    # Moderate request if enabled
    moderation_result = None
    if request.moderate:
        # Combine all user messages for moderation
        user_content = " ".join([
            msg.content for msg in request.messages 
            if msg.role == "user"
        ])
        
        moderation_result = await moderation_service.moderate_request(
            user_id=str(current_user.id),
            content=user_content,
            strict_mode=True
        )
        
        if moderation_result["action"] == "blocked":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Content moderation failed: {moderation_result['reason']}"
            )
    
    # Convert messages to dict format
    messages_dict = [
        {"role": msg.role, "content": msg.content}
        for msg in request.messages
    ]
    
    # Call LLM
    try:
        response = await llm_client.chat_completion(
            messages=messages_dict,
            model=request.model,
            provider=request.provider,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            task_type=request.task_type,
            budget_priority=request.budget_priority
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM request failed: {str(e)}"
        )
    
    # Moderate response if enabled
    if request.moderate:
        response_moderation = await moderation_service.moderate_response(
            user_id=str(current_user.id),
            content=response["content"]
        )
        
        if response_moderation["action"] == "filtered":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Response moderation failed: {response_moderation['reason']}"
            )
    
    # Calculate cost
    cost_usd = response.get("cost_usd", 0)
    credits_used = int(cost_usd * 1000)
    
    # Deduct credits
    try:
        await credit_service.deduct_credits(
            user_id=str(current_user.id),
            amount=credits_used,
            description=f"LLM: {response['provider']}/{response['model']}",
            metadata={
                "provider": response["provider"],
                "model": response["model"],
                "tokens": response.get("usage", {}).get("total_tokens", 0),
                "cost_usd": cost_usd
            }
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=str(e)
        )
    
    return ChatCompletionResponse(
        content=response["content"],
        model=response["model"],
        provider=response["provider"],
        usage=response.get("usage", {}),
        cost_usd=cost_usd,
        credits_used=credits_used,
        moderation=moderation_result
    )


@router.post("/chat/stream")
async def chat_completion_stream(
    request: ChatCompletionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Chat completion with streaming (Server-Sent Events)
    
    - Requires authentication
    - Real-time token streaming
    - Automatic model selection
    - Optional content moderation
    - Credits deducted after completion
    
    Args:
        request: Chat completion request
    
    Returns:
        Server-Sent Events stream
    
    Event Format:
        data: {"type": "start", "model": "gpt-4", "provider": "openai"}
        data: {"type": "token", "content": "Hello"}
        data: {"type": "done", "total_tokens": 150, "cost_usd": 0.003, "credits_used": 3}
        data: {"type": "error", "error": "Error message"}
    """
    llm_client = get_unified_client()
    credit_service = CreditService(db)
    moderation_service = ModerationService(db)
    streaming_service = StreamingService(llm_client, credit_service)
    
    # Moderate request if enabled
    if request.moderate:
        user_content = " ".join([
            msg.content for msg in request.messages 
            if msg.role == "user"
        ])
        
        moderation_result = await moderation_service.moderate_request(
            user_id=str(current_user.id),
            content=user_content,
            strict_mode=True
        )
        
        if moderation_result["action"] == "blocked":
            # Return error event
            async def error_stream():
                yield f"data: {{\"type\": \"error\", \"error\": \"{moderation_result['reason']}\"}}\n\n"
            
            return StreamingResponse(
                error_stream(),
                media_type="text/event-stream"
            )
    
    # Convert messages
    messages_dict = [
        {"role": msg.role, "content": msg.content}
        for msg in request.messages
    ]
    
    # Stream response
    return StreamingResponse(
        streaming_service.stream_chat_completion(
            user_id=str(current_user.id),
            messages=messages_dict,
            model=request.model,
            provider=request.provider,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            task_type=request.task_type,
            budget_priority=request.budget_priority
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@router.post("/moderate", response_model=ModerationResponse)
async def moderate_content(
    content: str,
    strict_mode: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Moderate content
    
    - Requires authentication
    - Check content for policy violations
    - Returns moderation result
    
    Args:
        content: Content to moderate
        strict_mode: Enable strict moderation
    
    Returns:
        Moderation result
    """
    moderation_service = ModerationService(db)
    
    result = await moderation_service.moderate_request(
        user_id=str(current_user.id),
        content=content,
        strict_mode=strict_mode
    )
    
    return ModerationResponse(**result)


@router.get("/moderation/history")
async def get_moderation_history(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get user's moderation history
    
    - Requires authentication
    - Returns list of moderation checks
    """
    moderation_service = ModerationService(db)
    
    history = await moderation_service.get_user_moderation_history(
        user_id=str(current_user.id),
        limit=limit
    )
    
    return {"history": history}


@router.get("/moderation/flagged")
async def get_flagged_content(
    limit: int = 100,
    content_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get flagged content (Admin only)
    
    - Requires admin authentication
    - Returns list of flagged content for review
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    moderation_service = ModerationService(db)
    
    flagged = await moderation_service.get_flagged_content(
        limit=limit,
        content_type=content_type
    )
    
    return {"flagged_content": flagged}
