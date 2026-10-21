from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.core.smartspecweb_crypto import decrypt_smartspecweb, encrypt_smartspecweb
from app.services.provider_config_service import ProviderConfigService


@pytest.mark.asyncio
async def test_loads_enabled_smartaihub_admin_provider_credentials(monkeypatch):
    monkeypatch.setenv("LLM_ENCRYPTION_KEY", "disposable-test-encryption-key")
    db = AsyncMock()
    result = Mock()
    result.mappings.return_value.all.return_value = [
        {
            "providerName": "openrouter",
            "displayName": "OpenRouter",
            "baseUrl": "https://openrouter.ai/api/v1",
            "apiKeyEncrypted": encrypt_smartspecweb("runtime-only-provider-secret"),
            "defaultModel": "openai/gpt-4.1-mini",
            "configJson": {"default_model": "openai/gpt-4.1-mini"},
            "isEnabled": True,
            "hasApiKey": True,
        }
    ]
    db.execute.return_value = result
    service = ProviderConfigService()
    service.get_enabled_providers = AsyncMock(return_value=[])

    with patch(
        "app.services.provider_config_service.decrypt_smartspecweb",
        wraps=decrypt_smartspecweb,
    ) as decrypt:
        configs = await service.get_all_provider_configs(db)

    assert configs == {
        "openrouter": {
            "provider_name": "openrouter",
            "display_name": "OpenRouter",
            "api_key": "runtime-only-provider-secret",
            "base_url": "https://openrouter.ai/api/v1",
            "is_enabled": True,
            "default_model": "openai/gpt-4.1-mini",
            "config": {"default_model": "openai/gpt-4.1-mini"},
        }
    }
    decrypt.assert_called_once()


@pytest.mark.asyncio
async def test_legacy_provider_configs_remain_available_when_admin_catalog_is_absent():
    db = AsyncMock()
    missing_table = Exception("relation llm_providers does not exist")
    missing_table.orig = SimpleNamespace(sqlstate="42P01")
    db.execute.side_effect = missing_table
    db.rollback = AsyncMock()
    service = ProviderConfigService()
    legacy = {
        "groq": {
            "provider_name": "groq",
            "api_key": "legacy-secret",
            "base_url": None,
            "is_enabled": True,
        }
    }
    service.get_enabled_providers = AsyncMock(return_value=[Mock(provider_name="groq")])
    service.get_decrypted_api_key = Mock(return_value="legacy-secret")
    service.get_provider_config_dict = Mock(return_value=legacy["groq"])

    assert await service.get_all_provider_configs(db) == legacy
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_legacy_provider_configs_support_sqlite_without_admin_catalog():
    db = AsyncMock()
    db.bind = SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))
    db.execute.side_effect = Exception("no such table: llm_providers")
    service = ProviderConfigService()
    service.get_enabled_providers = AsyncMock(return_value=[])

    assert await service.get_all_provider_configs(db) == {}
    db.rollback.assert_awaited_once()
