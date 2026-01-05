"""
SmartSpec Pro - LLM Proxy API with Credit Gateway
Phase 0.5

This API provides endpoints for LLM operations with automatic
credit checking and deduction.
"""

from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any

from app.llm_proxy import (
    llm_proxy,
    LLMRequest,
    LLMResponse,
    LLMProvider,
    LLMUsageStats,
    LLMGateway,
)
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User

router = APIRouter()


@router.post("/invoke", response_model=LLMResponse, status_code=status.HTTP_200_OK)
async def invoke_llm(
    request: LLMRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Invoke LLM with automatic provider selection and credit deduction
    
    **Requires authentication.** Credits will be checked before the call
    and deducted after the call based on actual usage.
    
    The LLM Gateway will automatically select the best provider and model
    based on the task type and budget priority.
    
    Returns 402 if insufficient credits.
    """
    try:
        gateway = LLMGateway(db)
        response = await gateway.invoke(request, current_user)
        return response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM invocation failed: {str(e)}"
        )


@router.get("/balance", status_code=status.HTTP_200_OK)
async def get_balance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get user credit balance and transaction stats
    
    **Requires authentication.**
    
    Returns:
        - balance: Current credit balance
        - stats: Transaction statistics (total added, deducted, count)
    """
    try:
        gateway = LLMGateway(db)
        return await gateway.get_user_balance(current_user)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get balance: {str(e)}"
        )


@router.get("/models", status_code=status.HTTP_200_OK)
async def get_available_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get available models and providers
    
    **Requires authentication.**
    
    Returns:
        - openrouter: OpenRouter status and features
        - direct_providers: Direct provider availability
        - recommended_models: Recommended models by task type
    """
    try:
        gateway = LLMGateway(db)
        return await gateway.get_available_models()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get models: {str(e)}"
        )


@router.get("/providers", response_model=List[LLMProvider], status_code=status.HTTP_200_OK)
async def list_providers():
    """List all configured LLM providers (no auth required)"""
    return llm_proxy.get_providers()


@router.post("/providers/{provider_name}/enable", status_code=status.HTTP_200_OK)
async def enable_provider(
    provider_name: str,
    current_user: User = Depends(get_current_user)
):
    """Enable an LLM provider (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        llm_proxy.enable_provider(provider_name)
        return {"status": "enabled", "provider": provider_name}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to enable provider: {str(e)}"
        )


@router.post("/providers/{provider_name}/disable", status_code=status.HTTP_200_OK)
async def disable_provider(
    provider_name: str,
    current_user: User = Depends(get_current_user)
):
    """Disable an LLM provider (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        llm_proxy.disable_provider(provider_name)
        return {"status": "disabled", "provider": provider_name}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to disable provider: {str(e)}"
        )


@router.get("/usage", response_model=LLMUsageStats, status_code=status.HTTP_200_OK)
async def get_usage_stats(
    current_user: User = Depends(get_current_user)
):
    """Get LLM usage statistics (admin only)"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return llm_proxy.get_usage_stats()


@router.post("/test", status_code=status.HTTP_200_OK)
async def test_llm(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test LLM Proxy with a simple request
    
    **Requires authentication.** Credits will be deducted.
    """
    test_request = LLMRequest(
        prompt="Say 'Hello from SmartSpec Pro!' and nothing else.",
        task_type="simple",
        budget_priority="cost",
        max_tokens=50,
        temperature=0.7
    )
    
    try:
        gateway = LLMGateway(db)
        response = await gateway.invoke(test_request, current_user)
        return {
            "status": "success",
            "response": response.content,
            "provider": response.provider,
            "model": response.model,
            "tokens": response.tokens_used,
            "cost": response.cost,
            "latency_ms": response.latency_ms,
            "credits_used": getattr(response, 'credits_used', None),
            "credits_balance": getattr(response, 'credits_balance', None),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Test failed: {str(e)}"
        )
