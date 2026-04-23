from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.openai_agents_contracts import RuntimeModelConfig
from app.services.openai_agents_gateway_model import (
    GatewayModelConfigurationError,
    build_gateway_transport_config,
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


def test_platform_attribution_token_is_used(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    transport = build_gateway_transport_config(
        surface="responses",
        model_config=_model_config(),
        attribution_token="platform-attribution-token",
    )

    assert transport.api_key == "platform-attribution-token"


def test_provider_api_key_in_request_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://gateway.internal")

    with pytest.raises(GatewayModelConfigurationError) as exc_info:
        build_gateway_transport_config(
            surface="skill",
            model_config=_model_config(),
            attribution_token="platform-attribution-token",
            provider_api_key="sk-live-direct-provider",
        )

    assert exc_info.value.code == "provider_api_key_rejected"
