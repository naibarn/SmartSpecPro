
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
    logger.info(f"PTY preflight check for channel: {channel}")
    
    # Check legacy key
    legacy_ok = await reject_legacy_key_ws(ws)
    if not legacy_ok:
        logger.warning("PTY preflight failed: legacy key present")
        return False

    # Check localhost restriction
    if getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (ws.client.host if ws.client else "") or ""
        logger.info(f"PTY preflight localhost check: host={host}")
        if not _is_localhost(host):
            logger.warning(f"PTY preflight failed: not localhost (host={host})")
            await ws.close(code=1008)
            return False

    # Check ticket
    ticket = (ws.query_params.get("ticket") or "").strip()
    logger.info(f"PTY preflight ticket check: ticket={ticket[:20]}..." if ticket else "PTY preflight: no ticket")
    
    if not ticket:
        logger.warning("PTY preflight failed: no ticket provided")
        await ws.close(code=1008)
        return False
    
    ok = await consume_ws_ticket(ticket=ticket, channel=channel)
    logger.info(f"PTY preflight ticket consume result: {ok}")
    
    if not ok:
        logger.warning(f"PTY preflight failed: invalid or expired ticket")
        await ws.close(code=1008)
        return False
    
    logger.info("PTY preflight passed")
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
    logger.info("PTY WebSocket connection attempt")
    
    if not await _preflight(ws, "pty"):
        logger.warning("PTY WebSocket preflight failed, connection rejected")
        return
    
    await ws.accept()
    logger.info("PTY WebSocket connection accepted")

    session_id: Optional[str] = None
    last_seq = 0
    last_status: Optional[str] = None
    poll_task: Optional[asyncio.Task] = None

    async def poll_loop():
        """Periodically poll for new output only"""
        nonlocal last_seq, last_status
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
                        except Exception as e:
                            logger.error(f"Failed to send stdout: {e}")
                            return
                
                # Only send status if it changed
                current_status = f"{s.status}:{s.returncode}"
                if current_status != last_status:
                    last_status = current_status
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
        nonlocal last_seq, last_status
        if not session_id:
            return
        rows = await PTY_MANAGER.buffer_since(session_id, last_seq)
        for seq, data in rows:
            last_seq = max(last_seq, seq)
            await ws.send_text(json.dumps({"type": "stdout", "seq": seq, "data": data}))
        s = await PTY_MANAGER.get(session_id)
        if s:
            current_status = f"{s.status}:{s.returncode}"
            # Always send status after buffered output
            last_status = current_status
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
                last_status = None
                
                logger.info(f"PTY session created: {session_id}")
                await ws.send_text(json.dumps({"type": "created", "sessionId": session_id}))
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))
                
                # Wait for shell to initialize and send initial output
                await asyncio.sleep(0.3)
                await send_buffered()

            elif t == "attach":
                session_id = str(msg.get("sessionId") or "")
                last_seq = int(msg.get("from") or 0)
                last_status = None
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
                success = await PTY_MANAGER.write(session_id, data)
                if not success:
                    logger.warning(f"Failed to write to session {session_id}")
                    await ws.send_text(json.dumps({"type": "error", "message": "write_failed"}))
                    continue
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))

            elif t == "resize":
                if not session_id:
                    await ws.send_text(json.dumps({"type": "error", "message": "no_session"}))
                    continue
                rows = int(msg.get("rows") or 24)
                cols = int(msg.get("cols") or 80)
                success = await PTY_MANAGER.resize(session_id, rows, cols)
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

            elif t == "cancel":
                if session_id:
                    logger.info(f"Cancelling session {session_id}")
                    await PTY_MANAGER.cancel(session_id)
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))

            elif t == "kill":
                if session_id:
                    logger.info(f"Killing session {session_id}")
                    await PTY_MANAGER.kill(session_id)
                await ws.send_text(json.dumps({"type": "ack", "ok": True}))

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
