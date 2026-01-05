from fastapi import APIRouter, Request, HTTPException
import httpx
import os

router = APIRouter(prefix="/api/v1/control-plane", tags=["control-plane-proxy"])

CONTROL_PLANE_URL = os.getenv("CONTROL_PLANE_URL", "http://localhost:7070").rstrip("/")
CONTROL_PLANE_API_KEY = os.getenv("CONTROL_PLANE_API_KEY", "")

def _localhost_only(request: Request):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise HTTPException(status_code=403, detail="localhost_only")

@router.api_route("/{path:path}", methods=["GET","POST","PUT","PATCH","DELETE"])
async def proxy(path: str, request: Request):
    _localhost_only(request)
    if not CONTROL_PLANE_API_KEY:
        raise HTTPException(status_code=500, detail="CONTROL_PLANE_API_KEY_not_configured")

    # Mint a short-lived USER token for desktop (no API key on client)
    async with httpx.AsyncClient(timeout=30) as client:
        mint = await client.post(
            f"{CONTROL_PLANE_URL}/api/v1/auth/token",
            json={"apiKey": CONTROL_PLANE_API_KEY, "scope": {"role": "user"}, "ttlSeconds": 600},
        )
        mint.raise_for_status()
        token = mint.json()["token"]

        # Forward request
        url = f"{CONTROL_PLANE_URL}/{path}".rstrip("/")
        headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
        headers["authorization"] = f"Bearer {token}"

        body = await request.body()
        resp = await client.request(request.method, url, params=request.query_params, content=body, headers=headers)
        return resp.json()
