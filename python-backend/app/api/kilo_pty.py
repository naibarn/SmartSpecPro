from __future__ import annotations
import os
import json
import signal
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from app.kilo.pty_manager import PTY_MANAGER
from app.orchestrator.sandbox import validate_workspace

router = APIRouter(prefix="/api/v1/kilo", tags=["kilo-pty"])

WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "")
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

def _safe_command(cmd: str) -> None:
    c = cmd.strip()
    if not c.startswith("/"):
        raise ValueError("command_must_start_with_slash")
    first = c.split()[0]
    if not first.endswith(".md"):
        raise ValueError("command_must_target_/name.md")
    for bad in [";", "|", "&", "`", "$(", "${", ">", "<"]:
        if bad in c:
            raise ValueError(f"disallowed_token:{bad}")

class CreatePayload(BaseModel):
    workspace: str
    command: str

@router.websocket("/pty/ws")
async def pty_ws(ws: WebSocket):
    _check_localhost(ws)
    _check_key(ws)
    await ws.accept()

    session_id = None
    last_sent_seq = 0

    async def send_buffered():
        nonlocal last_sent_seq
        if not session_id:
            return
        buf = await PTY_MANAGER.buffer_since(session_id, last_sent_seq)
        for seq, data in buf:
            await ws.send_text(json.dumps({"type": "stdout", "seq": seq, "data": data}, ensure_ascii=False))
            last_sent_seq = seq

    try:
        while True:
            raw = await ws.receive_text()
            try:
                obj = json.loads(raw)
            except Exception:
                await ws.send_text(json.dumps({"type": "error", "message": "invalid_json"}))
                continue

            t = obj.get("type")
            if t == "create":
                try:
                    payload = CreatePayload(**obj)
                    cwd = validate_workspace(payload.workspace, WORKSPACE_ROOT)
                    _safe_command(payload.command)
                    sess = await PTY_MANAGER.create(workspace=cwd, command=payload.command)
                    session_id = sess.session_id
                    last_sent_seq = 0
                    await ws.send_text(json.dumps({"type": "created", "sessionId": session_id}))
                except Exception as e:
                    await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
                    continue

            elif t == "attach":
                sid = obj.get("sessionId")
                from_seq = int(obj.get("from", 0) or 0)
                s = await PTY_MANAGER.get(sid)
                if not s:
                    await ws.send_text(json.dumps({"type": "error", "message": "session_not_found"}))
                    continue
                session_id = sid
                last_sent_seq = from_seq
                await send_buffered()

            elif t == "input":
                if not session_id:
                    await ws.send_text(json.dumps({"type": "error", "message": "no_session"}))
                    continue
                data = obj.get("data", "")
                ok = await PTY_MANAGER.write(session_id, data)
                await ws.send_text(json.dumps({"type": "ack", "ok": ok}))

            elif t == "signal":
                if not session_id:
                    await ws.send_text(json.dumps({"type": "error", "message": "no_session"}))
                    continue
                name = (obj.get("name") or "SIGINT").upper()
                sig = getattr(signal, name, signal.SIGINT)
                ok = await PTY_MANAGER.send_signal(session_id, sig)
                await ws.send_text(json.dumps({"type": "ack", "ok": ok}))

            elif t == "poll":
                await send_buffered()
                if session_id:
                    s = await PTY_MANAGER.get(session_id)
                    if s:
                        await ws.send_text(json.dumps({"type": "status", "status": s.status, "returncode": s.returncode, "seq": s.seq}))
            else:
                await ws.send_text(json.dumps({"type": "error", "message": f"unknown_type:{t}"}))

            await send_buffered()

    except WebSocketDisconnect:
        return
