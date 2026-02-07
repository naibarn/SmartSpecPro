"""
Internal Provider API
For CLI access to decrypted provider configs (not exposed to frontend)
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
    """Verify CLI proxy token"""
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")

    proxy_token = settings.SMARTSPEC_PROXY_TOKEN
    if not proxy_token:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")

    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")

    return True


@router.get("/configs")
async def get_decrypted_provider_configs(
    db: AsyncSession = Depends(get_db),
    _verified: bool = Depends(verify_cli_token)
) -> List[Dict[str, Any]]:
    """
    Get enabled provider configs with decrypted API keys.

    This endpoint is for CLI use only and returns decrypted API keys.
    Protected by proxy token authentication.
    """
    result = await db.execute(
        select(ProviderConfig).where(ProviderConfig.is_enabled == True)
    )
    configs = result.scalars().all()

    decrypted_configs = []
    for config in configs:
        # Decrypt API key
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

        decrypted_configs.append({
            "id": config.id,
            "provider_name": config.provider_name,
            "display_name": config.display_name,
            "api_key": api_key,  # Decrypted API key
            "base_url": config.base_url,
            "config_json": config.config_json,
            "is_enabled": config.is_enabled,
            "description": config.description
        })

    logger.info(
        "cli_fetched_provider_configs",
        count=len(decrypted_configs),
        providers=[c["provider_name"] for c in decrypted_configs]
    )

    return decrypted_configs
