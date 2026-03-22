"""
Helpers for loading SmartSpecWeb-managed system settings from the shared database.

These settings are typically written by the Node.js admin UI and may be encrypted
with SmartSpecWeb's AES-256-GCM format.
"""

from __future__ import annotations

import os
from typing import Iterable, Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.smartspecweb_crypto import decrypt_smartspecweb

logger = structlog.get_logger(__name__)


def _decode_system_setting(value: str | None, is_sensitive: bool) -> str:
    if not value:
        return ""
    if not is_sensitive:
        return str(value)
    try:
        return decrypt_smartspecweb(str(value))
    except Exception:
        logger.warning("system_setting_decrypt_failed")
        return ""


async def _load_category_settings(session: AsyncSession, category: str) -> dict[str, str]:
    result = await session.execute(
        text('SELECT key, value, "isSensitive" FROM system_settings WHERE category = :category'),
        {"category": category},
    )
    rows = result.fetchall()

    settings: dict[str, str] = {}
    for row in rows:
        key = str(row[0])
        value = _decode_system_setting(row[1], bool(row[2]))
        if value:
            settings[key] = value
    return settings


async def get_category_settings(
    category: str,
    db: AsyncSession | None = None,
) -> dict[str, str]:
    if db is not None:
        return await _load_category_settings(db, category)

    async with AsyncSessionLocal() as session:
        return await _load_category_settings(session, category)


async def get_first_system_setting(
    *,
    category: str,
    keys: Iterable[str],
    db: AsyncSession | None = None,
    env_fallback: str | None = None,
) -> Optional[str]:
    loaded = await get_category_settings(category, db)
    for key in keys:
        value = (loaded.get(key) or "").strip()
        if value:
            return value

    if env_fallback:
        configured_value = str(getattr(settings, env_fallback, "") or "").strip()
        if configured_value:
            return configured_value
        fallback = os.getenv(env_fallback, "").strip()
        if fallback:
            return fallback
    return None


async def get_google_ai_api_key(db: AsyncSession | None = None) -> Optional[str]:
    """Resolve the Google AI API key from DB-first admin settings, then env fallback."""
    return await get_first_system_setting(
        category="multimodal_embedding",
        keys=("google_api_key", "gemini_api_key"),
        db=db,
        env_fallback="GOOGLE_API_KEY",
    )
