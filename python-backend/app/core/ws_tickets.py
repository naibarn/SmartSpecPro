from __future__ import annotations

import time
import secrets
from typing import Optional, Dict, Any

from app.core.cache import cache_manager


PREFIX = "ws_ticket:"


def _now() -> float:
    return time.time()


def _key(ticket: str) -> str:
    return f"{PREFIX}{ticket}"


async def mint_ws_ticket(channel: str, ttl_seconds: int = 60, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    ttl = max(10, min(int(ttl_seconds or 60), 300))  # clamp 10..300s
    ticket = secrets.token_urlsafe(32)
    payload: Dict[str, Any] = {"channel": channel, "meta": meta or {}, "iat": _now()}
    await cache_manager.set(_key(ticket), payload, ttl=ttl)
    return {"ticket": ticket, "ttl_seconds": ttl, "expires_at": _now() + ttl}


async def consume_ws_ticket(ticket: str, channel: str) -> bool:
    if not ticket:
        return False
    data = await cache_manager.get(_key(ticket))
    if not data:
        return False
    if str(data.get("channel")) != str(channel):
        # channel mismatch: still delete to prevent probing reuse
        await cache_manager.delete(_key(ticket))
        return False
    # single-use
    await cache_manager.delete(_key(ticket))
    return True
