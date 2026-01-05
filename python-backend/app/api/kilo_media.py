from __future__ import annotations
import os
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from app.kilo.pty_manager import PTY_MANAGER

router = APIRouter(prefix="/api/v1/kilo", tags=["kilo-media"])

ORCHESTRATOR_API_KEY = os.getenv("ORCHESTRATOR_API_KEY", "")

def _check_localhost(ws: WebSocket):
    host = (ws.client.host if ws.client else "")
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise HTTPException(status_code=403, detail="localhost_only")

def _check_key(ws: WebSocket):
    if not ORCHESTRATOR_API_KEY:
        return
    key = ws.query_params.get("key", "")
    if key != ORCHESTRATOR_API_KEY:
        raise HTTPException(status_code=401, detail="invalid_key")

class MediaEvent(BaseModel):
    sessionId: str
    type: str  # image|video|file
    title: str | None = None
    url: str
    mime: str | None = None
    meta: dict | None = None

@router.websocket("/media/ws")
async def media_ws(ws: WebSocket):
    _check_localhost(ws)
    _check_key(ws)
    await ws.accept()

    session_id = None
    last_seq = 0

    async def flush():
        nonlocal last_seq
        if not session_id:
            return
        buf = await PTY_MANAGER.media_since(session_id, last_seq)
        for seq, ev in buf:
            await ws.send_text(json.dumps({"type": "event", "seq": seq, "event": ev}, ensure_ascii=False))
            last_seq = seq

    try:
        while True:
            raw = await ws.receive_text()
            try:
                obj = json.loads(raw)
            except Exception:
                await ws.send_text(json.dumps({"type": "error", "message": "invalid_json"}))
                continue

            t = obj.get("type")
            if t == "attach":
                sid = obj.get("sessionId")
                from_seq = int(obj.get("from", 0) or 0)
                s = await PTY_MANAGER.get(sid)
                if not s:
                    await ws.send_text(json.dumps({"type": "error", "message": "session_not_found"}))
                    continue
                session_id = sid
                last_seq = from_seq
                await flush()
                await ws.send_text(json.dumps({"type": "status", "mediaSeq": s.media_seq}))
            elif t == "emit":
                try:
                    ev = MediaEvent(**(obj.get("event") or {})).dict()
                except Exception as e:
                    await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
                    continue
                sid = ev["sessionId"]
                s = await PTY_MANAGER.get(sid)
                if not s:
                    await ws.send_text(json.dumps({"type": "error", "message": "session_not_found"}))
                    continue
                seq = await PTY_MANAGER.append_media_event(sid, ev)
                await ws.send_text(json.dumps({"type": "ack", "seq": seq}))
                if session_id == sid:
                    await flush()
            else:
                await flush()

    except WebSocketDisconnect:
        return
