"""
Internal Provider API
For CLI access to provider configs (not exposed to frontend or the public
internet).

SECURITY: this route lives under /api/v1/internal/ and is blocked from the
public internet by nginx (`location ~ ^/api/v[0-9]+/internal/ { deny all }`
in nginx/conf.d/dev-host.conf). Its only legitimate caller is the
server-local ss_autopilot CLI (.smartspec/ss_autopilot/llm_client.py), which
connects directly to http://localhost:8000 and needs the decrypted provider
key to call the provider. Access is additionally gated by the
SMARTSPEC_PROXY_TOKEN header (constant-time compare, fail-closed). Do NOT
expose this route through nginx or hand its payload to any browser/frontend
client. Future hardening: proxy the provider call server-side so the raw key
never leaves the backend.
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List, Dict, Any
import secrets
import structlog

from app.core.database import get_db
from app.models.provider_config import ProviderConfig
from app.core.encryption import encryption_service
from app.core.config import settings

logger = structlog.get_logger()
router = APIRouter(prefix="/api/v1/internal/provider", tags=["internal"])


async def verify_cli_token(x_proxy_token: Optional[str] = Header(None)):
    """Verify CLI proxy token (constant-time compare; fail-closed if unset)."""
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")

    proxy_token = settings.SMARTSPEC_PROXY_TOKEN
    if not proxy_token:
        raise HTTPException(
            status_code=503, detail="SMARTSPEC_PROXY_TOKEN not configured"
        )

    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")

    return True


@router.get("/configs")
async def get_provider_configs(
    db: AsyncSession = Depends(get_db),
    _verified: bool = Depends(verify_cli_token)
) -> List[Dict[str, Any]]:
    """
    Get enabled provider configs for the server-local CLI.

    Returns the decrypted ``api_key`` because the sole caller (ss_autopilot,
    localhost-only — see module docstring) calls the provider directly. This
    route is nginx-blocked from the public internet and proxy-token gated; it
    must never be reachable from a browser/frontend.
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.is_enabled == True)
    )
    configs = result.scalars().all()

    safe_configs = []
    for config in configs:
        api_key = None
        if config.api_key_encrypted:
            try:
                api_key = encryption_service.decrypt(config.api_key_encrypted)
            except Exception as e:
                logger.error(
                    "failed_to_decrypt_api_key",
                    provider=config.provider_name,
                    error=str(e)
                )

        safe_configs.append({
            "id": config.id,
            "provider_name": config.provider_name,
            "display_name": config.display_name,
            "configured": bool(config.api_key_encrypted),
            "api_key": api_key,
            "base_url": config.base_url,
            "config_json": config.config_json,
            "is_enabled": config.is_enabled,
            "description": config.description
        })

    logger.info(
        "cli_fetched_provider_configs",
        count=len(safe_configs),
        providers=[c["provider_name"] for c in safe_configs]
    )

    return safe_configs
