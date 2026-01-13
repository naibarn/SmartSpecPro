from __future__ import annotations

import time
import uuid
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.clients.web_gateway import forward_chat_json, forward_chat_stream, forward_models
from app.core.legacy_key import reject_legacy_key_http
from app.llm_proxy.unified_client import get_unified_client
from app.core.database import get_db
from app.core.auth import verify_token
from app.models.user import User
from app.services.credit_service import CreditService, InsufficientCreditsError
from app.core.rate_limiter import get_rate_limiter
from sqlalchemy import select
import structlog

logger = structlog.get_logger()

router = APIRouter(tags=["OpenAI Compatible"])

# Minimum credit balance required to make LLM calls (in credits)
# 100 credits = $0.10 USD - enough for a small request
MIN_CREDITS_REQUIRED = 100

# Estimated cost per request for pre-check (in USD)
# This is a conservative estimate to prevent overdraft
ESTIMATED_COST_PER_REQUEST = Decimal("0.05")


def _extract_user_token(req: Request) -> Optional[str]:
    """
    Extract user auth token from request headers.
    
    Returns:
        User's JWT token if present, None otherwise
    """
    auth_header = req.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return None


def _get_client_ip(req: Request) -> str:
    """Get client IP address from request"""
    # Check for forwarded headers (behind proxy/load balancer)
    forwarded = req.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    
    real_ip = req.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    
    # Fallback to direct client IP
    return req.client.host if req.client else "unknown"


def _require_proxy_token(req: Request):
    """
    Check for valid proxy token OR valid auth token (JWT)
    - Proxy token: matches SMARTSPEC_PROXY_TOKEN (for unauthenticated access)
    - Auth token: valid JWT token (for authenticated users)
    """
    if not settings.DEBUG and not settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN is required in production")

    if not settings.SMARTSPEC_PROXY_TOKEN:
        return

    # Get token from headers
    h = (req.headers.get("authorization") or "").strip()
    if h.lower().startswith("bearer "):
        token = h.split(" ", 1)[1].strip()
    else:
        token = req.headers.get("x-proxy-token", "").strip()

    # Check 1: Is it a valid proxy token?
    if token == settings.SMARTSPEC_PROXY_TOKEN:
        return

    # Check 2: Is it a valid auth token (JWT)?
    try:
        payload = verify_token(token)
        if payload and "user_id" in payload:
            # Valid auth token - allow access
            return
    except Exception:
        pass

    # Neither valid proxy token nor valid auth token
    raise HTTPException(status_code=401, detail="Unauthorized")


def _require_localhost(req: Request):
    if getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (req.client.host if req.client else "") or ""
        if host not in ("127.0.0.1", "::1", "localhost"):
            raise HTTPException(status_code=403, detail="Forbidden (localhost only)")


def _trace_id(req: Request) -> Optional[str]:
    return req.headers.get("x-trace-id") or req.headers.get("x-request-id")


async def _get_user_from_token(req: Request, db: AsyncSession) -> Optional[User]:
    """
    Get user from auth token (optional)

    Args:
        req: Request object
        db: Database session

    Returns:
        User object if valid token, None otherwise
    """
    auth_header = req.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    payload = verify_token(token)

    if not payload or "user_id" not in payload:
        return None

    try:
        result = await db.execute(
            select(User).where(User.id == payload["user_id"])
        )
        return result.scalar_one_or_none()
    except Exception as e:
        logger.error("failed_to_get_user_from_token", error=str(e))
        return None


async def _check_credit_balance(
    user: Optional[User],
    db: AsyncSession,
    estimated_cost: Decimal = ESTIMATED_COST_PER_REQUEST
) -> None:
    """
    Pre-check credit balance before making LLM call
    
    Args:
        user: User object (optional)
        db: Database session
        estimated_cost: Estimated cost in USD
    
    Raises:
        HTTPException: 402 if insufficient credits
    """
    if not user:
        # Anonymous request - skip credit check (use proxy token limits)
        return
    
    credit_service = CreditService(db)
    
    try:
        balance = await credit_service.get_balance(str(user.id))
        
        # Check minimum balance
        if balance < MIN_CREDITS_REQUIRED:
            logger.warning(
                "insufficient_credits_precheck",
                user_id=str(user.id),
                balance=balance,
                min_required=MIN_CREDITS_REQUIRED
            )
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "insufficient_credits",
                    "message": f"Insufficient credits. Minimum required: {MIN_CREDITS_REQUIRED:,} credits (${MIN_CREDITS_REQUIRED/1000:.2f})",
                    "balance_credits": balance,
                    "balance_usd": balance / 1000,
                    "min_required_credits": MIN_CREDITS_REQUIRED,
                    "min_required_usd": MIN_CREDITS_REQUIRED / 1000,
                    "topup_url": "/credits/topup"
                }
            )
        
        # Check if balance covers estimated cost
        has_sufficient = await credit_service.check_sufficient_credits(
            str(user.id),
            estimated_cost
        )
        
        if not has_sufficient:
            from app.core.credits import usd_to_credits
            required_credits = usd_to_credits(estimated_cost)
            
            logger.warning(
                "insufficient_credits_for_request",
                user_id=str(user.id),
                balance=balance,
                estimated_cost_usd=float(estimated_cost),
                required_credits=required_credits
            )
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "insufficient_credits",
                    "message": f"Insufficient credits for this request. Estimated cost: ${float(estimated_cost):.4f}",
                    "balance_credits": balance,
                    "balance_usd": balance / 1000,
                    "estimated_cost_usd": float(estimated_cost),
                    "estimated_cost_credits": required_credits,
                    "topup_url": "/credits/topup"
                }
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("credit_check_failed", user_id=str(user.id), error=str(e))
        # Don't block request on credit check errors - log and continue
        pass


def _check_rate_limit(
    user: Optional[User],
    ip: str,
    estimated_tokens: int = 0
) -> None:
    """
    Check rate limits before processing request
    
    Args:
        user: User object (optional)
        ip: Client IP address
        estimated_tokens: Estimated tokens for this request
    
    Raises:
        HTTPException: 429 if rate limited
    """
    rate_limiter = get_rate_limiter()
    
    user_id = str(user.id) if user else None
    allowed, error_message, retry_after = rate_limiter.check_rate_limit(
        user_id=user_id,
        ip=ip,
        estimated_tokens=estimated_tokens
    )
    
    if not allowed:
        logger.warning(
            "rate_limit_exceeded",
            user_id=user_id,
            ip=ip,
            error=error_message,
            retry_after=retry_after
        )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "message": error_message,
                "retry_after": retry_after
            },
            headers={"Retry-After": str(retry_after)}
        )


def _record_rate_limit(
    user: Optional[User],
    ip: str,
    tokens_used: int = 0
) -> None:
    """Record request for rate limiting"""
    rate_limiter = get_rate_limiter()
    user_id = str(user.id) if user else None
    rate_limiter.record_request(user_id=user_id, ip=ip, tokens_used=tokens_used)


def _estimate_tokens(messages: list, max_tokens: int = 4000) -> int:
    """
    Estimate total tokens for a request
    
    Simple estimation: ~4 chars per token for input + max_tokens for output
    """
    input_chars = sum(
        len(str(m.get("content", ""))) 
        for m in messages
    )
    estimated_input_tokens = input_chars // 4
    return estimated_input_tokens + max_tokens


def _convert_to_openai_format(llm_response, model: str) -> Dict[str, Any]:
    """Convert LLMResponse to OpenAI chat completion format"""
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": llm_response.content
                },
                "finish_reason": llm_response.finish_reason or "stop"
            }
        ],
        "usage": {
            "prompt_tokens": 0,  # Not tracked separately
            "completion_tokens": 0,  # Not tracked separately
            "total_tokens": llm_response.tokens_used
        }
    }


@router.post("/v1/chat/completions")
async def chat_completions(req: Request, db: AsyncSession = Depends(get_db)):
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    payload: Dict[str, Any] = await req.json()
    stream = bool(payload.get("stream"))
    tid = _trace_id(req)
    
    # Extract user token for forwarding to Web Gateway (for credit tracking)
    user_token = _extract_user_token(req)
    
    # Get user and client IP for rate limiting and credit checks
    user = await _get_user_from_token(req, db)
    client_ip = _get_client_ip(req)
    
    # Extract parameters for estimation
    messages = payload.get("messages", [])
    max_tokens = payload.get("max_tokens", 4000)
    
    # Estimate tokens for rate limiting
    estimated_tokens = _estimate_tokens(messages, max_tokens)
    
    # === PRE-CHECKS ===
    
    # 1. Rate limit check
    _check_rate_limit(user, client_ip, estimated_tokens)
    
    # 2. Credit balance pre-check (for authenticated users)
    await _check_credit_balance(user, db)

    # Mode 1: Web Gateway (if enabled)
    if settings.SMARTSPEC_USE_WEB_GATEWAY:
        if not settings.SMARTSPEC_WEB_GATEWAY_URL:
            raise HTTPException(status_code=500, detail="SMARTSPEC_WEB_GATEWAY_URL not configured")

        # Record rate limit usage
        _record_rate_limit(user, client_ip, estimated_tokens)

        if stream:
            async def gen():
                async for chunk in forward_chat_stream(payload, trace_id=tid, user_token=user_token):
                    yield chunk

            return StreamingResponse(gen(), media_type="text/event-stream")

        upstream = await forward_chat_json(payload, trace_id=tid, user_token=user_token)
        content_type = upstream.headers.get("content-type", "application/json")
        return Response(content=upstream.content, status_code=upstream.status_code, media_type=content_type)

    # Mode 2: Direct Proxy (using UnifiedLLMClient with database provider configs)
    else:
        if stream:
            raise HTTPException(
                status_code=501,
                detail="Streaming not supported in direct proxy mode. Use SMARTSPEC_USE_WEB_GATEWAY=true"
            )

        # Extract parameters
        model_requested = payload.get("model")  # Don't use default yet
        temperature = payload.get("temperature", 0.7)

        # Initialize client with database session to load provider configs
        client = get_unified_client()
        await client.initialize(db=db)

        # If no model specified, use the default model from enabled provider in Admin Settings
        if not model_requested:
            # Get default model from enabled provider configs
            from app.models.provider_config import ProviderConfig

            result = await db.execute(
                select(ProviderConfig).where(ProviderConfig.is_enabled == True).limit(1)
            )
            enabled_provider = result.scalar_one_or_none()

            if enabled_provider and enabled_provider.config_json:
                # default_model is stored in config_json
                default_model = enabled_provider.config_json.get("default_model")
                if default_model:
                    model = default_model
                else:
                    # No default model in config, use fallback
                    model = "anthropic/claude-3-5-sonnet-20241022"
            else:
                # No enabled provider or no config, use fallback
                model = "anthropic/claude-3-5-sonnet-20241022"
        else:
            model = model_requested

        try:
            # Call LLM through unified client
            response = await client.chat(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                use_openrouter=True  # Default to OpenRouter if available
            )

            # Record actual token usage for rate limiting
            actual_tokens = response.tokens_used or estimated_tokens
            _record_rate_limit(user, client_ip, actual_tokens)

            # Track credit usage if user is authenticated
            credits_used = None
            credits_balance = None

            if user and response.cost and response.cost > 0:
                try:
                    credit_service = CreditService(db)

                    # Deduct credits based on actual LLM cost
                    transaction = await credit_service.deduct_credits(
                        user_id=str(user.id),
                        llm_cost_usd=Decimal(str(response.cost)),
                        description=f"LLM usage: {model}",
                        metadata={
                            "model": model,
                            "provider": response.provider,
                            "tokens_used": response.tokens_used,
                            "endpoint": "/v1/chat/completions"
                        }
                    )

                    credits_used = transaction.amount
                    credits_balance = transaction.balance_after

                    logger.info(
                        "credits_deducted",
                        user_id=str(user.id),
                        cost_usd=float(response.cost),
                        credits_used=credits_used,
                        credits_balance=credits_balance,
                        model=model
                    )

                except InsufficientCreditsError as e:
                    # This shouldn't happen due to pre-check, but handle it anyway
                    logger.error(
                        "insufficient_credits_after_call",
                        user_id=str(user.id),
                        error=str(e)
                    )
                    # Still return the response, but log the issue
                    # The pre-check should prevent this in most cases

                except Exception as e:
                    # Log error but don't fail the request
                    logger.error(
                        "failed_to_deduct_credits",
                        user_id=str(user.id),
                        error=str(e),
                        cost_usd=float(response.cost) if response.cost else 0
                    )

            # Update response with credit info
            if credits_used is not None:
                response.credits_used = credits_used
                response.credits_balance = credits_balance

            # Convert to OpenAI format
            openai_response = _convert_to_openai_format(response, model)

            # Add credit info to response metadata if available
            if credits_used is not None:
                openai_response["credits_used"] = credits_used
                openai_response["credits_balance"] = credits_balance
                openai_response["cost_usd"] = float(response.cost) if response.cost else 0

            return openai_response

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"LLM call failed: {str(e)}"
            )


@router.get("/v1/models")
async def models(req: Request):
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    if not settings.SMARTSPEC_USE_WEB_GATEWAY:
        raise HTTPException(status_code=503, detail="SMARTSPEC_USE_WEB_GATEWAY disabled")
    if not settings.SMARTSPEC_WEB_GATEWAY_URL:
        raise HTTPException(status_code=500, detail="SMARTSPEC_WEB_GATEWAY_URL not configured")

    tid = _trace_id(req)
    user_token = _extract_user_token(req)
    upstream = await forward_models(trace_id=tid, user_token=user_token)
    content_type = upstream.headers.get("content-type", "application/json")
    return Response(content=upstream.content, status_code=upstream.status_code, media_type=content_type)


@router.get("/v1/rate-limit/status")
async def rate_limit_status(req: Request, db: AsyncSession = Depends(get_db)):
    """
    Get current rate limit status for the requesting user/IP
    
    Returns usage stats and remaining limits
    """
    _require_proxy_token(req)
    
    user = await _get_user_from_token(req, db)
    client_ip = _get_client_ip(req)
    
    rate_limiter = get_rate_limiter()
    user_id = str(user.id) if user else None
    
    usage = rate_limiter.get_usage(user_id=user_id, ip=client_ip)
    
    return {
        "user_id": user_id,
        "ip": client_ip,
        "usage": usage
    }
