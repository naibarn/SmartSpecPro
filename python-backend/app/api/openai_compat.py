from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from typing import Any, Dict, Optional

from app.core.config import settings
from app.clients.web_gateway import forward_chat_json, forward_chat_stream, forward_models


router = APIRouter(tags=["OpenAI Compatible"])


def _require_proxy_token(req: Request):
    """Protect Python proxy surface.
    - In production (DEBUG=false), require SMARTSPEC_PROXY_TOKEN.
    - In development, token is optional.
    """
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


@router.post("/v1/chat/completions")
async def chat_completions(req: Request):
    _require_localhost(req)
    _require_proxy_token(req)

    if not settings.SMARTSPEC_USE_WEB_GATEWAY:
        raise HTTPException(status_code=503, detail="SMARTSPEC_USE_WEB_GATEWAY disabled")
    if not settings.SMARTSPEC_WEB_GATEWAY_URL:
        raise HTTPException(status_code=500, detail="SMARTSPEC_WEB_GATEWAY_URL not configured")

    payload: Dict[str, Any] = await req.json()
    stream = bool(payload.get("stream"))
    tid = _trace_id(req)

    if stream:
        async def gen():
            async for chunk in forward_chat_stream(payload, trace_id=tid):
                yield chunk

        return StreamingResponse(gen(), media_type="text/event-stream")

    upstream = await forward_chat_json(payload, trace_id=tid)
    content_type = upstream.headers.get("content-type", "application/json")
    return Response(content=upstream.content, status_code=upstream.status_code, media_type=content_type)


@router.get("/v1/models")
async def models(req: Request):
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
