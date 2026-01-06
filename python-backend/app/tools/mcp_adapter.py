from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.clients.web_gateway import mcp_tools, mcp_call


async def list_tools(trace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    r = await mcp_tools(trace_id=trace_id)
    r.raise_for_status()
    j = r.json()
    return j.get("tools") or []


async def call_tool(
    name: str,
    arguments: Dict[str, Any],
    *,
    trace_id: Optional[str] = None,
    write_token: Optional[str] = None,
) -> Dict[str, Any]:
    r = await mcp_call(name, arguments, trace_id=trace_id, write_token=write_token)
    try:
        j = r.json()
    except Exception:
        j = {"ok": False, "error": {"message": r.text}}
    if r.status_code >= 400:
        return {"ok": False, "error": j.get("error") or {"message": "tool error"}}
    return j
