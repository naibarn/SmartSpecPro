from __future__ import annotations

from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import StreamingResponse
from typing import Any, Dict

from app.core.settings import settings
from app.clients.web_gateway import forward_chat_json, forward_chat_stream

router = APIRouter()


@router.post("/v1/chat/completions")
async def chat_completions(req: Request):
    if not settings.USE_WEB_GATEWAY or not settings.WEB_GATEWAY_URL:
        raise HTTPException(status_code=500, detail="SMARTSPEC_WEB_GATEWAY_URL not configured")

    payload: Dict[str, Any] = await req.json()
    stream = bool(payload.get("stream"))

    if stream:

        async def gen():
            async for chunk in forward_chat_stream(payload):
                yield chunk

        return StreamingResponse(gen(), media_type="text/event-stream")

    upstream = await forward_chat_json(payload)
    content_type = upstream.headers.get("content-type", "application/json")
    return Response(content=upstream.content, status_code=upstream.status_code, media_type=content_type)
