from __future__ import annotations

import time
import uuid
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.clients.web_gateway import forward_chat_json, forward_chat_stream, forward_models
from app.core.legacy_key import reject_legacy_key_http
from app.llm_proxy.unified_client import get_unified_client
from app.core.database import get_db


router = APIRouter(tags=["OpenAI Compatible"])


def _require_proxy_token(req: Request):
    if not settings.DEBUG and not settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN is required in production")

    if not settings.SMARTSPEC_PROXY_TOKEN:
        return

    h = (req.headers.get("authorization") or "").strip()
    if h.lower().startswith("bearer "):
        token = h.split(" ", 1)[1].strip()
    else:
        token = req.headers.get("x-proxy-token", "").strip()

    if token != settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _require_localhost(req: Request):
    if getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (req.client.host if req.client else "") or ""
        if host not in ("127.0.0.1", "::1", "localhost"):
            raise HTTPException(status_code=403, detail="Forbidden (localhost only)")


def _trace_id(req: Request) -> Optional[str]:
    return req.headers.get("x-trace-id") or req.headers.get("x-request-id")


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

    # Mode 1: Web Gateway (if enabled)
    if settings.SMARTSPEC_USE_WEB_GATEWAY:
        if not settings.SMARTSPEC_WEB_GATEWAY_URL:
            raise HTTPException(status_code=500, detail="SMARTSPEC_WEB_GATEWAY_URL not configured")

        if stream:
            async def gen():
                async for chunk in forward_chat_stream(payload, trace_id=tid):
                    yield chunk

            return StreamingResponse(gen(), media_type="text/event-stream")

        upstream = await forward_chat_json(payload, trace_id=tid)
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

        # Initialize client with database session to load provider configs
        client = get_unified_client()
        await client.initialize(db=db)

        # If no model specified, use the default model from enabled provider in Admin Settings
        if not model_requested:
            # Get default model from enabled provider configs
            from app.models.provider_config import ProviderConfig
            from sqlalchemy import select

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

            # Convert to OpenAI format
            openai_response = _convert_to_openai_format(response, model)

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
    upstream = await forward_models(trace_id=tid)
    content_type = upstream.headers.get("content-type", "application/json")
    return Response(content=upstream.content, status_code=upstream.status_code, media_type=content_type)
