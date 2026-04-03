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
import hashlib
import os
import re

logger = structlog.get_logger()

# Cache for provider configs
_provider_cache: Dict[str, Dict[str, Any]] = {}
_cache_ttl = 60  # seconds
_last_fetch: Dict[str, float] = {}

# Encryption key (must match SmartSpecWeb's LLM_ENCRYPTION_KEY)
_RAW_KEY = os.environ.get("LLM_ENCRYPTION_KEY") or os.environ.get("MEDIA_ENCRYPTION_KEY")
if not _RAW_KEY:
    raise RuntimeError(
        "Missing encryption key: set LLM_ENCRYPTION_KEY or MEDIA_ENCRYPTION_KEY environment variable"
    )


def _derive_key(raw_key: str) -> bytes:
    """Derive 32-byte key using SHA-256 (matches SmartSpecWeb crypto.ts)."""
    return hashlib.sha256(raw_key.encode()).digest()


def normalize_media_provider_name(provider_name: str | None) -> str:
    normalized = re.sub(r"[\s.\-]+", "_", str(provider_name or "").strip().lower()).strip("_")
    if not normalized:
        return ""
    if normalized in {"kie", "kie_ai", "kieai"}:
        return "kie_ai"
    if normalized in {"uvoice", "u_voice", "uvoice_ai", "uvoiceapp"}:
        return "uvoice"
    if normalized in {"byteplus", "modelark", "byteplus_modelark", "byteplus_model_ark"}:
        return "byteplus_modelark"
    if normalized in {"knplabs", "knplabai", "knplabs_ai", "knplabsai"}:
        return "knplabai"
    if normalized in {"fal", "fal_ai", "falai", "fal_ai_provider"}:
        return "fal_ai"
    if normalized in {"wavespeed_ai", "wavespeedai"}:
        return "wavespeed_ai"
    return normalized


def decrypt_api_key(encrypted_text: str) -> Optional[str]:
    """
    Decrypt API key using AES-256-GCM (matches SmartSpecWeb server/services/crypto.ts).
    Format: iv_hex:authTag_hex:ciphertext_hex
    Also supports legacy CBC format: iv_hex:ciphertext_hex
    """
    if not encrypted_text:
        return None

    try:
        parts = encrypted_text.split(":")
        key = _derive_key(_RAW_KEY)

        if len(parts) == 3:
            # AES-256-GCM format: iv:authTag:ciphertext
            iv = bytes.fromhex(parts[0])
            auth_tag = bytes.fromhex(parts[1])
            encrypted_data = bytes.fromhex(parts[2])

            cipher = Cipher(algorithms.AES(key), modes.GCM(iv, auth_tag), backend=default_backend())
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(encrypted_data) + decryptor.finalize()
            return decrypted.decode('utf-8')

        elif len(parts) == 2:
            # Legacy AES-256-CBC format: iv:ciphertext
            logger.warning("decrypt_legacy_cbc", message="Legacy CBC format detected, please re-save the key")
            iv = bytes.fromhex(parts[0])
            encrypted_data = bytes.fromhex(parts[1])
            legacy_key = _RAW_KEY.ljust(32)[:32].encode()
            cipher = Cipher(algorithms.AES(legacy_key), modes.CBC(iv), backend=default_backend())
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(encrypted_data) + decryptor.finalize()
            padding_len = decrypted[-1]
            return decrypted[:-padding_len].decode('utf-8')

        else:
            logger.error("decrypt_api_key_invalid_format", parts_count=len(parts))
            return None

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
    normalized_provider_name = normalize_media_provider_name(provider_name)
    if normalized_provider_name in _provider_cache:
        if now - _last_fetch.get(normalized_provider_name, 0) < _cache_ttl:
            logger.debug("media_provider_cache_hit", provider=normalized_provider_name)
            return _provider_cache[normalized_provider_name]

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
                {"provider_name": normalized_provider_name}
            )
            row = result.fetchone()

            if not row:
                fallback_result = await session.execute(
                    text('''
                        SELECT "providerName", "displayName", "apiKeyEncrypted",
                               "baseUrl", "callbackUrl", "configJson", "isEnabled", "hasApiKey"
                        FROM media_providers
                        WHERE "isEnabled" = true
                    ''')
                )
                for candidate in fallback_result.fetchall():
                    if normalize_media_provider_name(candidate[0]) == normalized_provider_name:
                        row = candidate
                        break

            if not row:
                logger.warning("media_provider_not_found", provider=normalized_provider_name)
                return None

            # Decrypt API key
            api_key_encrypted = row[2]  # apiKeyEncrypted
            if not api_key_encrypted:
                logger.warning("media_provider_no_api_key", provider=normalized_provider_name)
                return None

            api_key = decrypt_api_key(api_key_encrypted)
            if not api_key:
                logger.error("media_provider_decrypt_failed", provider=normalized_provider_name)
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
            _provider_cache[normalized_provider_name] = result_data
            _last_fetch[normalized_provider_name] = now

            logger.info(
                "media_provider_key_fetched",
                provider=normalized_provider_name,
                has_base_url=bool(result_data.get("baseUrl"))
            )
            return result_data

    except Exception as e:
        logger.error(
            "media_provider_fetch_error",
            provider=normalized_provider_name,
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
    from app.core.config import settings

    provider_config = await get_media_provider_key("kie_ai")

    if not provider_config or not provider_config.get("apiKey"):
        logger.warning("kie_ai_not_configured", message="No API key found in media_providers table")
        return None

    api_key = provider_config["apiKey"]
    base_url = provider_config.get("baseUrl") or "https://api.kie.ai/api/v1"
    callback_url = provider_config.get("callbackUrl") or settings.KIE_AI_CALLBACK_URL or None

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


async def initialize_knplabs_client():
    """
    Initialize the KNPLabs client by fetching API key from database.

    Returns:
        KNPLabsProvider instance or None if not configured
    """
    from app.llm_proxy.providers import KNPLabsProvider
    from app.core.config import settings

    provider_config = await get_media_provider_key("knplabai")
    if not provider_config:
        provider_config = await get_media_provider_key("knplabs")

    api_key = (provider_config or {}).get("apiKey") or settings.KNPLABAI_API_KEY
    if not api_key:
        logger.warning("knplabs_not_configured", message="No API key found in media_providers table or env")
        return None

    base_url = (provider_config or {}).get("baseUrl") or settings.KNPLABAI_BASE_URL or KNPLabsProvider.BASE_URL

    try:
        client = KNPLabsProvider(
            api_key=api_key,
            base_url=base_url,
        )
        logger.info("knplabs_client_initialized", base_url=base_url)
        return client
    except Exception as e:
        logger.error("knplabs_client_init_failed", error=str(e))
        return None


async def initialize_uvoice_client():
    """
    Initialize the UVoice client by fetching API key from database.

    Returns:
        UVoiceProvider instance or None if not configured
    """
    from app.llm_proxy.providers import UVoiceProvider

    provider_config = await get_media_provider_key("uvoice")

    if not provider_config or not provider_config.get("apiKey"):
        logger.warning("uvoice_not_configured", message="No API key found in media_providers table")
        return None

    api_key = provider_config["apiKey"]
    base_url = provider_config.get("baseUrl") or "https://api.uvoice.ai"

    try:
        client = UVoiceProvider(
            api_key=api_key,
            base_url=base_url,
        )
        logger.info("uvoice_client_initialized", base_url=base_url)
        return client
    except Exception as e:
        logger.error("uvoice_client_init_failed", error=str(e))
        return None


def clear_cache():
    """Clear the provider cache"""
    global _provider_cache, _last_fetch
    _provider_cache = {}
    _last_fetch = {}
# mypy: ignore-errors
