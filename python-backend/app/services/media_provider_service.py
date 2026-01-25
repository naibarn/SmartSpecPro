"""
Media Provider Service

Fetches media provider API keys directly from the shared PostgreSQL database.
The media_providers table is managed by SmartSpecWeb but shared with Python backend.
"""

import structlog
from typing import Optional, Dict, Any
from sqlalchemy import text
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import os

logger = structlog.get_logger()

# Cache for provider configs
_provider_cache: Dict[str, Dict[str, Any]] = {}
_cache_ttl = 60  # seconds
_last_fetch: Dict[str, float] = {}

# Encryption key (must match SmartSpecWeb's MEDIA_ENCRYPTION_KEY)
ENCRYPTION_KEY = os.environ.get("MEDIA_ENCRYPTION_KEY") or os.environ.get("LLM_ENCRYPTION_KEY") or "smartspec-media-key-32chars!"


def decrypt_api_key(encrypted_text: str) -> Optional[str]:
    """
    Decrypt API key using the same algorithm as SmartSpecWeb.
    Format: iv_hex:encrypted_hex
    """
    if not encrypted_text:
        return None

    try:
        parts = encrypted_text.split(":")
        if len(parts) != 2:
            return None

        iv = bytes.fromhex(parts[0])
        encrypted_data = bytes.fromhex(parts[1])

        # Pad key to 32 bytes (same as SmartSpecWeb)
        key = ENCRYPTION_KEY.ljust(32)[:32].encode()

        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(encrypted_data) + decryptor.finalize()

        # Remove PKCS7 padding
        padding_len = decrypted[-1]
        return decrypted[:-padding_len].decode('utf-8')

    except Exception as e:
        logger.error("decrypt_api_key_failed", error=str(e))
        return None


async def get_media_provider_key(provider_name: str = "kie_ai") -> Optional[Dict[str, Any]]:
    """
    Fetch media provider API key directly from database.

    Args:
        provider_name: Name of the provider (e.g., "kie_ai")

    Returns:
        Dict with apiKey, baseUrl, and configJson, or None if not found
    """
    import time
    from app.core.database import AsyncSessionLocal

    # Check cache
    now = time.time()
    if provider_name in _provider_cache:
        if now - _last_fetch.get(provider_name, 0) < _cache_ttl:
            logger.debug("media_provider_cache_hit", provider=provider_name)
            return _provider_cache[provider_name]

    try:
        async with AsyncSessionLocal() as session:
            # Query media_providers table directly
            # Column names use camelCase as defined in SmartSpecWeb schema
            result = await session.execute(
                text('''
                    SELECT "providerName", "displayName", "apiKeyEncrypted",
                           "baseUrl", "callbackUrl", "configJson", "isEnabled", "hasApiKey"
                    FROM media_providers
                    WHERE "providerName" = :provider_name
                      AND "isEnabled" = true
                    LIMIT 1
                '''),
                {"provider_name": provider_name}
            )
            row = result.fetchone()

            if not row:
                logger.warning("media_provider_not_found", provider=provider_name)
                return None

            # Decrypt API key
            api_key_encrypted = row[2]  # apiKeyEncrypted
            if not api_key_encrypted:
                logger.warning("media_provider_no_api_key", provider=provider_name)
                return None

            api_key = decrypt_api_key(api_key_encrypted)
            if not api_key:
                logger.error("media_provider_decrypt_failed", provider=provider_name)
                return None

            result_data = {
                "providerName": row[0],
                "displayName": row[1],
                "apiKey": api_key,
                "baseUrl": row[3],
                "callbackUrl": row[4],
                "configJson": row[5],
            }

            # Update cache
            _provider_cache[provider_name] = result_data
            _last_fetch[provider_name] = now

            logger.info(
                "media_provider_key_fetched",
                provider=provider_name,
                has_base_url=bool(result_data.get("baseUrl"))
            )
            return result_data

    except Exception as e:
        logger.error(
            "media_provider_fetch_error",
            provider=provider_name,
            error=str(e)
        )
        return None


async def initialize_kie_ai_client():
    """
    Initialize the Kie.ai client by fetching API key from database.

    Returns:
        KieAIProvider instance or None if not configured
    """
    from app.llm_proxy.providers import KieAIProvider

    provider_config = await get_media_provider_key("kie_ai")

    if not provider_config or not provider_config.get("apiKey"):
        logger.warning("kie_ai_not_configured", message="No API key found in media_providers table")
        return None

    api_key = provider_config["apiKey"]
    base_url = provider_config.get("baseUrl") or "https://api.kie.ai/api/v1"
    callback_url = provider_config.get("callbackUrl")

    try:
        client = KieAIProvider(
            api_key=api_key,
            base_url=base_url,
            callback_url=callback_url
        )
        logger.info(
            "kie_ai_client_initialized",
            base_url=base_url,
            has_callback_url=bool(callback_url)
        )
        return client
    except Exception as e:
        logger.error("kie_ai_client_init_failed", error=str(e))
        return None


def clear_cache():
    """Clear the provider cache"""
    global _provider_cache, _last_fetch
    _provider_cache = {}
    _last_fetch = {}
