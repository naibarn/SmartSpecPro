from __future__ import annotations

import time
import secrets
import logging
from typing import Optional, Dict, Any

from app.core.cache import cache_manager

logger = logging.getLogger(__name__)

PREFIX = "ws_ticket:"


def _now() -> float:
    return time.time()


def _key(ticket: str) -> str:
    return f"{PREFIX}{ticket}"


async def mint_ws_ticket(channel: str, ttl_seconds: int = 60, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    ttl = max(10, min(int(ttl_seconds or 60), 300))  # clamp 10..300s
    ticket = secrets.token_urlsafe(32)
    payload: Dict[str, Any] = {"channel": channel, "meta": meta or {}, "iat": _now()}
    
    key = _key(ticket)
    logger.info(f"Minting WS ticket for channel '{channel}': key={key[:30]}..., ttl={ttl}s")
    
    await cache_manager.set(key, payload, ttl=ttl)
    
    # Verify it was stored
    verify = await cache_manager.get(key)
    logger.info(f"Ticket stored verification: {verify is not None}")
    
    return {"ticket": ticket, "ttl_seconds": ttl, "expires_at": _now() + ttl}


async def consume_ws_ticket(ticket: str, channel: str) -> bool:
    if not ticket:
        logger.warning("consume_ws_ticket: no ticket provided")
        return False
    
    key = _key(ticket)
    logger.info(f"Consuming WS ticket for channel '{channel}': key={key[:30]}...")
    
    data = await cache_manager.get(key)
    logger.info(f"Ticket data from cache: {data}")
    
    if not data:
        logger.warning(f"consume_ws_ticket: ticket not found in cache")
        return False
    
    if str(data.get("channel")) != str(channel):
        logger.warning(f"consume_ws_ticket: channel mismatch (expected={channel}, got={data.get('channel')})")
        # channel mismatch: still delete to prevent probing reuse
        await cache_manager.delete(key)
        return False
    
    # single-use
    await cache_manager.delete(key)
    logger.info(f"consume_ws_ticket: success for channel '{channel}'")
    return True
