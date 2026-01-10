from __future__ import annotations

import json
import os
import signal
import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Request
from typing import Optional

from app.core.config import settings
from app.core.ws_tickets import consume_ws_ticket
from app.core.legacy_key import reject_legacy_key_http, reject_legacy_key_ws
from app.kilo.pty_manager import PTY_MANAGER

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/kilo", tags=["kilo-pty"])

WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "")


def _is_localhost(host: str) -> bool:
    return host in ("127.0.0.1", "::1", "localhost")


def _require_localhost(req: Request):
    """Check if request is from localhost (if required)"""
    if getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (req.client.host if req.client else "") or ""
        if not _is_localhost(host):
            raise HTTPException(status_code=403, detail="Forbidden (localhost only)")


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


def _sig_from_name(name: str) -> int:
    n = name.strip().upper()
    if n in ("INT", "SIGINT"):
        return signal.SIGINT
    if n in ("TERM", "SIGTERM"):
        return signal.SIGTERM
    if n in ("KILL", "SIGKILL") and hasattr(signal, "SIGKILL"):
        return signal.SIGKILL
    if n in ("HUP", "SIGHUP") and hasattr(signal, "SIGHUP"):
        return signal.SIGHUP
    return signal.SIGINT


@router.get("/pty/sessions")
async def list_pty_sessions(req: Request):
    """List all active PTY sessions"""
    reject_legacy_key_http(req)
    _require_localhost(req)
    
    sessions = await PTY_MANAGER.list_sessions()
    return {"sessions": sessions}


@router.delete("/pty/sessions/{session_id}")
async def cleanup_pty_session(session_id: str, req: Request):
    """Cleanup a completed PTY session"""
    reject_legacy_key_http(req)
    _require_localhost(req)
    
    success = await PTY_MANAGER.cleanup_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found or still running")
    return {"ok": True, "message": "Session cleaned up"}


@router.websocket("/pty/ws")
async def pty_ws(ws: WebSocket):
    if not await _preflight(ws, "pty"):
        return
    await ws.accept()
    logger.info("PTY WebSocket connection accepted")

    session_id: Optional[str] = None
    last_seq = 0
    poll_task: Optional[asyncio.Task] = None

    async def poll_loop():
        """Periodically poll for new output and status"""
        nonlocal last_seq
        poll_count = 0
        while True:
            try:
                await asyncio.sleep(0.1)  # Poll every 100ms
                if not session_id:
                    continue
                
                s = await PTY_MANAGER.get(session_id)
                if not s:
                    continue
                
                # Get new output since last_seq
                rows = await PTY_MANAGER.buffer_since(session_id, last_seq)
                for seq, data in rows:
                    if seq > last_seq:
                        last_seq = seq
                        try:
                            await ws.send_text(json.dumps({"type": "stdout", "seq": seq, "data": data}))
                            poll_count += 1
                            if poll_count <= 10:
                                logger.debug(f"Sent stdout seq={seq}, {len(data)} bytes")
                        except Exception as e:
                            logger.error(f"Failed to send stdout: {e}")
                            return
                
                # Send status update periodically
                try:
                    await ws.send_text(json.dumps({
                        "type": "status",
                        "status": s.status,
                        "returncode": s.returncode,
                        "seq": s.seq
                    }))
                except Exception as e:
                    logger.error(f"Failed to send status: {e}")
                    return
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Poll loop error: {e}")
                await asyncio.sleep(0.5)

    async def send_buffered():
        """Send all buffered output since last_seq"""
        nonlocal last_seq
        if not session_id:
            return
        rows = await PTY_MANAGER.buffer_since(session_id, last_seq)
        logger.debug(f"send_buffered: {len(rows)} rows since seq {last_seq}")
        for seq, data in rows:
            last_seq = max(last_seq, seq)
            await ws.send_text(json.dumps({"type": "stdout", "seq": seq, "data": data}))
        s = await PTY_MANAGER.get(session_id)
        if s:
            await ws.send_text(json.dumps({
                "type": "status",
                "status": s.status,
                "returncode": s.returncode,
                "seq": s.seq
            }))

    # Start polling task
    poll_task = asyncio.create_task(poll_loop())

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw or "{}")
            t = msg.get("type")
            logger.debug(f"Received message type: {t}")

            if t == "create":
                workspace = str(msg.get("workspace") or "")
                command = str(msg.get("command") or "")
                logger.info(f"Creating PTY session: workspace={workspace}, command={command}")
                
                # Validate workspace
                if WORKSPACE_ROOT and workspace:
                    try:
                        from app.orchestrator.sandbox import validate_workspace
                        validate_workspace(WORKSPACE_ROOT, workspace)
                    except Exception as e:
                        logger.error(f"Invalid workspace: {e}")
                        await ws.send_text(json.dumps({"type": "error", "message": f"Invalid workspace: {str(e)}"}))
                        continue
                
                # Use home directory if no workspace specified
                if not workspace:
                    workspace = os.path.expanduser("~")
                
                sess = await PTY_MANAGER.create(workspace=workspace, command=command)
                session_id = sess.session_id
                last_seq = 0
                
                logger.info(f"PTY session created: {session_id}")
                await ws.send_text(json.dumps({"type": "created", "sessionId": session_id}))
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))
                
                # Wait for shell to initialize and send initial output
                await asyncio.sleep(0.3)
                await send_buffered()

            elif t == "attach":
                session_id = str(msg.get("sessionId") or "")
                last_seq = int(msg.get("from") or 0)
                logger.info(f"Attaching to session: {session_id}, from seq: {last_seq}")
                
                sess = await PTY_MANAGER.get(session_id)
                if not sess:
                    await ws.send_text(json.dumps({"type": "error", "message": "Session not found"}))
                    continue
                
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))
                await send_buffered()

            elif t == "input":
                if not session_id:
                    await ws.send_text(json.dumps({"type": "error", "message": "no_session"}))
                    continue
                data = str(msg.get("data") or "")
                logger.debug(f"Input to session {session_id}: {repr(data)}")
                success = await PTY_MANAGER.write(session_id, data)
                if not success:
                    logger.warning(f"Failed to write to session {session_id}")
                    await ws.send_text(json.dumps({"type": "error", "message": "write_failed"}))
                    continue
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))
                # Wait a bit for shell to process and respond
                await asyncio.sleep(0.05)
                await send_buffered()

            elif t == "resize":
                if not session_id:
                    await ws.send_text(json.dumps({"type": "error", "message": "no_session"}))
                    continue
                rows = int(msg.get("rows") or 24)
                cols = int(msg.get("cols") or 80)
                success = await PTY_MANAGER.resize(session_id, rows, cols)
                logger.debug(f"Resize session {session_id} to {rows}x{cols}: {success}")
                await ws.send_text(json.dumps({"type": "ack", "ok": success}))

            elif t == "signal":
                if not session_id:
                    await ws.send_text(json.dumps({"type": "error", "message": "no_session"}))
                    continue
                name = str(msg.get("name") or "SIGINT")
                sig = _sig_from_name(name)
                logger.info(f"Sending signal {name} to session {session_id}")
                await PTY_MANAGER.send_signal(session_id, sig)
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))
                await asyncio.sleep(0.1)
                await send_buffered()

            elif t == "cancel":
                if session_id:
                    logger.info(f"Cancelling session {session_id}")
                    await PTY_MANAGER.cancel(session_id)
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))
                await send_buffered()

            elif t == "kill":
                if session_id:
                    logger.info(f"Killing session {session_id}")
                    await PTY_MANAGER.kill(session_id)
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))
                await send_buffered()

            elif t == "poll":
                await send_buffered()

            else:
                logger.warning(f"Unknown message type: {t}")
                await ws.send_text(json.dumps({"type": "error", "message": f"unknown_type:{t}"}))

    except WebSocketDisconnect:
        logger.info("PTY WebSocket disconnected")
    except Exception as e:
        logger.error(f"PTY WebSocket error: {e}")
        try:
            await ws.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        # Cleanup
        if poll_task:
            poll_task.cancel()
            try:
                await poll_task
            except asyncio.CancelledError:
                pass
        logger.info("PTY WebSocket handler finished")
