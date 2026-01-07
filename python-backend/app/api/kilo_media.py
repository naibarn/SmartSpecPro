from __future__ import annotations

import json
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.ws_tickets import consume_ws_ticket
from app.core.legacy_key import reject_legacy_key_ws
from app.kilo.pty_manager import PTY_MANAGER


router = APIRouter(prefix="/api/v1/kilo", tags=["kilo-media"])

WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "")


def _is_localhost(host: str) -> bool:
    return host in ("127.0.0.1", "::1", "localhost")


async def _preflight(ws: WebSocket, channel: str):
    if not await reject_legacy_key_ws(ws):
        return False

    if getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (ws.client.host if ws.client else "") or ""
        if not _is_localhost(host):
            await ws.close(code=1008)
            return False

    ticket = (ws.query_params.get("ticket") or "").strip()
    ok = await consume_ws_ticket(ticket=ticket, channel=channel)
    if not ok:
        await ws.close(code=1008)
        return False
    return True


@router.websocket("/media/ws")
async def media_ws(ws: WebSocket):
    if not await _preflight(ws, "media"):
        return
    await ws.accept()

    session_id: str | None = None
    last_seq = 0

    async def send_buffered():
        nonlocal last_seq
        if not session_id:
            return
        rows = await PTY_MANAGER.media_since(session_id, last_seq)
        for seq, ev in rows:
            last_seq = max(last_seq, seq)
            await ws.send_text(json.dumps({"type": "event", "seq": seq, "event": ev}))
        s = await PTY_MANAGER.get(session_id)
        if s:
            await ws.send_text(json.dumps({"type": "status", "mediaSeq": getattr(s, "media_seq", 0)}))

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw or "{}")
            t = msg.get("type")

            if t == "attach":
                session_id = str(msg.get("sessionId") or "")
                last_seq = int(msg.get("from") or 0)
                await ws.send_text(json.dumps({"type": "ack", "seq": last_seq}))
                await send_buffered()

            elif t == "emit":
                if not session_id:
                    await ws.send_text(json.dumps({"type": "error", "message": "no_session"}))
                    continue
                event = msg.get("event") or {}
                await PTY_MANAGER.append_media_event(session_id, event)
                await ws.send_text(json.dumps({"type": "ack", "seq": last_seq}))
                await send_buffered()

            elif t == "poll":
                await send_buffered()

            else:
                await ws.send_text(json.dumps({"type": "error", "message": f"unknown_type:{t}"}))

    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
        return
