from __future__ import annotations

from fastapi import HTTPException, Request, WebSocket


def reject_legacy_key_http(req: Request):
    """Hard fail if legacy `?key=` is present, even in DEBUG."""
    if "key" in req.query_params:
        raise HTTPException(status_code=400, detail="Legacy key query parameter is disabled")


async def reject_legacy_key_ws(ws: WebSocket):
    """Hard close websocket if legacy `?key=` is present, even in DEBUG."""
    if "key" in ws.query_params:
        await ws.close(code=1008)
        return False
    return True
