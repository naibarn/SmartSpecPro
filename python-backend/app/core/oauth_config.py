"""
OAuth Configuration Loader

Reads OAuth credentials from the system_settings DB table (managed via SmartSpecWeb admin UI).
Falls back to environment variables if DB settings are not available.
"""

import os
from typing import Dict, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.smartspecweb_crypto import decrypt_smartspecweb

logger = structlog.get_logger(__name__)

# Keys that are encrypted in the DB
_SENSITIVE_KEYS = {"googleClientSecret", "githubClientSecret"}


async def get_oauth_config(db: AsyncSession) -> Dict[str, str]:
    """
    Fetch OAuth config from system_settings table, with env var fallback.

    Returns dict with keys:
        googleClientId, googleClientSecret, googleRedirectUri,
        githubClientId, githubClientSecret, githubRedirectUri
    """
    config: Dict[str, str] = {}

    try:
        result = await db.execute(
            text("SELECT key, value, \"isSensitive\" FROM system_settings WHERE category = 'oauth'")
        )
        rows = result.fetchall()

        for row in rows:
            key, value, is_sensitive = row[0], row[1], row[2]
            if value:
                if is_sensitive:
                    decrypted = decrypt_smartspecweb(value)
                    if decrypted:
                        config[key] = decrypted
                else:
                    config[key] = value

        if config:
            logger.debug("oauth_config_loaded_from_db", keys=list(config.keys()))
    except Exception as e:
        logger.warning("oauth_config_db_load_failed", error=str(e))

    # Fallback to env vars for any missing keys
    env_mapping = {
        "googleClientId": "GOOGLE_CLIENT_ID",
        "googleClientSecret": "GOOGLE_CLIENT_SECRET",
        "googleRedirectUri": "GOOGLE_REDIRECT_URI",
        "githubClientId": "GITHUB_CLIENT_ID",
        "githubClientSecret": "GITHUB_CLIENT_SECRET",
        "githubRedirectUri": "GITHUB_REDIRECT_URI",
    }

    defaults = {
        "googleRedirectUri": "http://localhost:3000/auth/callback/google",
        "githubRedirectUri": "http://localhost:3000/auth/callback/github",
    }

    for config_key, env_key in env_mapping.items():
        if config_key not in config:
            env_val = os.getenv(env_key, defaults.get(config_key, ""))
            if env_val:
                config[config_key] = env_val

    return config
