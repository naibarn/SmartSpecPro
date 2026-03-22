from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.system_settings_loader import get_first_system_setting, get_google_ai_api_key


@pytest.mark.asyncio
async def test_get_google_ai_api_key_prefers_db_value(monkeypatch):
    session = AsyncMock()
    result = MagicMock()
    result.fetchall.return_value = [
        ("google_api_key", "plain-db-key", False),
    ]
    session.execute.return_value = result

    monkeypatch.setattr("app.core.system_settings_loader.settings.GOOGLE_API_KEY", "", raising=False)

    value = await get_google_ai_api_key(session)

    assert value == "plain-db-key"


@pytest.mark.asyncio
async def test_get_first_system_setting_falls_back_to_runtime_settings(monkeypatch):
    session = AsyncMock()
    result = MagicMock()
    result.fetchall.return_value = []
    session.execute.return_value = result

    monkeypatch.setattr(
        "app.core.system_settings_loader.settings.GOOGLE_API_KEY",
        "AIza-runtime-fallback",
        raising=False,
    )

    value = await get_first_system_setting(
        category="multimodal_embedding",
        keys=("google_api_key",),
        db=session,
        env_fallback="GOOGLE_API_KEY",
    )

    assert value == "AIza-runtime-fallback"
