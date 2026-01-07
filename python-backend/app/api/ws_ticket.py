from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.core.ws_tickets import mint_ws_ticket
from app.core.legacy_key import reject_legacy_key_http


router = APIRouter(prefix="/api/v1/kilo", tags=["kilo-ws-ticket"])


class TicketRequest(BaseModel):
    channel: str  # "pty" | "media"
    ttl_seconds: int | None = 60


def _require_localhost(req: Request):
    if getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (req.client.host if req.client else "") or ""
        if host not in ("127.0.0.1", "::1", "localhost"):
            raise HTTPException(status_code=403, detail="Forbidden (localhost only)")


def _require_proxy_token(req: Request):
    if not settings.DEBUG and not settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN is required in production")
    if not settings.SMARTSPEC_PROXY_TOKEN:
        return

    h = (req.headers.get("authorization") or "").strip()
    token = ""
    if h.lower().startswith("bearer "):
        token = h.split(" ", 1)[1].strip()
    if not token:
        token = (req.headers.get("x-proxy-token") or "").strip()
    if token != settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/ws-ticket")
async def create_ws_ticket(body: TicketRequest, req: Request):
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    channel = body.channel.strip().lower()
    if channel not in ("pty", "media"):
        raise HTTPException(status_code=400, detail="Invalid channel")

    minted = await mint_ws_ticket(channel=channel, ttl_seconds=body.ttl_seconds or 60, meta={})
    return {"ticket": minted["ticket"], "expires_at": minted["expires_at"], "ttl_seconds": minted["ttl_seconds"]}
