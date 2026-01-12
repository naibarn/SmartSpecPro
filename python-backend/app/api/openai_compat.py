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
from app.services.credit_service import CreditService
from sqlalchemy import select
import structlog

logger = structlog.get_logger()

router = APIRouter(tags=["OpenAI Compatible"])


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

    # Mode 1: Web Gateway (if enabled)
    if settings.SMARTSPEC_USE_WEB_GATEWAY:
        if not settings.SMARTSPEC_WEB_GATEWAY_URL:
            raise HTTPException(status_code=500, detail="SMARTSPEC_WEB_GATEWAY_URL not configured")

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
        messages = payload.get("messages", [])
        model_requested = payload.get("model")  # Don't use default yet
        temperature = payload.get("temperature", 0.7)
        max_tokens = payload.get("max_tokens", 4000)

        # Get user from auth token (optional - for credit tracking)
        user = await _get_user_from_token(req, db)

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
