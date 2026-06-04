from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.openai_agents_contracts import RuntimeModelConfig
from app.services.openai_agents_gateway_model import (
    GatewayModelConfigurationError,
    build_gateway_transport_config,
    create_gateway_async_openai_client,
)


def _model_config() -> RuntimeModelConfig:
    return RuntimeModelConfig.model_validate(
        {
            "providerId": "openai",
            "modelId": "gpt-4.1-mini",
            "gatewayRouteId": "gateway_default",
            "resolvedGatewayModelId": "openai/gpt-4.1-mini",
        }
    )


def test_gateway_base_url_is_used(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    transport = build_gateway_transport_config(
        surface="chat",
        model_config=_model_config(),
        attribution_token="platform-attribution-token",
    )

    assert transport.base_url == "https://gateway.internal/v1"


def test_arbitrary_gateway_url_is_rejected_for_production_runtime_surfaces(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.example.net")

    with pytest.raises(GatewayModelConfigurationError) as exc_info:
        build_gateway_transport_config(
            surface="media_production",
            model_config=_model_config(),
            attribution_token="platform-attribution-token",
        )

    assert exc_info.value.code == "gateway_base_url_rejected"


def test_node_internal_gateway_url_is_accepted_for_production_runtime_surfaces(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "")
    monkeypatch.delenv("SMARTSPEC_WEB_GATEWAY_URL", raising=False)
    monkeypatch.setenv("NODEJS_INTERNAL_URL", "http://host.docker.internal:3000")

    transport = build_gateway_transport_config(
        surface="media_production",
        model_config=_model_config(),
        attribution_token="platform-attribution-token",
    )

    assert transport.base_url == "http://host.docker.internal:3000/v1"


def test_missing_gateway_base_url_fails_closed_for_production_runtime_surfaces(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "")
    monkeypatch.delenv("SMARTSPEC_WEB_GATEWAY_URL", raising=False)
    monkeypatch.delenv("NODEJS_INTERNAL_URL", raising=False)

    with pytest.raises(GatewayModelConfigurationError) as exc_info:
        build_gateway_transport_config(
            surface="media_production",
            model_config=_model_config(),
            attribution_token="platform-attribution-token",
        )

    assert exc_info.value.code == "missing_gateway_base_url"


def test_direct_provider_base_url_is_rejected_for_production_runtime_surfaces(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    with pytest.raises(GatewayModelConfigurationError) as exc_info:
        build_gateway_transport_config(
            surface="team",
            model_config=_model_config(),
            attribution_token="platform-attribution-token",
            provider_base_url="https://api.openai.com/v1",
        )

    assert exc_info.value.code == "provider_base_url_rejected"


def test_direct_provider_gateway_override_is_rejected_for_production_runtime_surfaces(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    with pytest.raises(GatewayModelConfigurationError) as exc_info:
        build_gateway_transport_config(
            surface="media_production",
            model_config=_model_config(),
            attribution_token="platform-attribution-token",
            gateway_base_url="https://api.openai.com/v1",
        )

    assert exc_info.value.code == "gateway_base_url_rejected"


def test_direct_provider_gateway_env_is_rejected_for_production_runtime_surfaces(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://api.openai.com")

    with pytest.raises(GatewayModelConfigurationError) as exc_info:
        build_gateway_transport_config(
            surface="responses",
            model_config=_model_config(),
            attribution_token="platform-attribution-token",
        )

    assert exc_info.value.code == "gateway_base_url_rejected"


def test_platform_attribution_token_is_used(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    transport = build_gateway_transport_config(
        surface="responses",
        model_config=_model_config(),
        attribution_token="platform-attribution-token",
        tenant_id="tenant-demo",
    )

    assert transport.api_key == "platform-attribution-token"


def test_gateway_client_sends_internal_auth_headers(monkeypatch):
    captured = {}

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(
        "app.services.openai_agents_gateway_model.AsyncOpenAI",
        FakeAsyncOpenAI,
    )
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    transport = build_gateway_transport_config(
        surface="media_production",
        model_config=_model_config(),
        attribution_token="platform-attribution-token",
        tenant_id="tenant-demo",
    )

    create_gateway_async_openai_client(transport)

    assert captured["api_key"] == "platform-attribution-token"
    assert captured["default_headers"]["x-internal-token"] == "platform-attribution-token"
    assert captured["default_headers"]["x-gateway-attribution-token"] == "platform-attribution-token"
    assert captured["default_headers"]["x-tenant-id"] == "tenant-demo"


def test_provider_api_key_in_request_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    with pytest.raises(GatewayModelConfigurationError) as exc_info:
        build_gateway_transport_config(
            surface="skill",
            model_config=_model_config(),
            attribution_token="platform-attribution-token",
            provider_api_key="provider-key.test",
        )

    assert exc_info.value.code == "provider_api_key_rejected"


def test_media_production_requires_gateway_attribution_and_rejects_direct_provider(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    with pytest.raises(GatewayModelConfigurationError) as missing_token:
        build_gateway_transport_config(
            surface="media_production",
            model_config=_model_config(),
            attribution_token="",
        )
    assert missing_token.value.code == "missing_attribution_token"

    with pytest.raises(GatewayModelConfigurationError) as direct_provider:
        build_gateway_transport_config(
            surface="media_production",
            model_config=_model_config(),
            attribution_token="platform-attribution-token",
            provider_base_url="https://api.openai.com/v1",
        )
    assert direct_provider.value.code == "provider_base_url_rejected"
