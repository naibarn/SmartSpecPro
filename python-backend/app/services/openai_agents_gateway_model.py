from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.openai_agents_contracts import RuntimeModelConfig, RuntimeSurface

GatewayTransport = Literal["responses", "chat_completions"]
_PRODUCTION_RUNTIME_SURFACES = frozenset({"chat", "team", "responses", "skill"})
_DIRECT_PROVIDER_HOSTS = frozenset(
    {
        "api.openai.com",
        "api.anthropic.com",
        "openrouter.ai",
        "api.groq.com",
        "generativelanguage.googleapis.com",
        "localhost:11434",
    }
)


class GatewayModelConfigurationError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class GatewayTransportConfig:
    surface: RuntimeSurface
    provider_id: str
    model_id: str
    gateway_route_id: str | None
    resolved_gateway_model_id: str
    base_url: str
    api_key: str
    transport: GatewayTransport = "responses"


def _gateway_base_url_candidate(override: str | None = None) -> str:
    candidate = (
        override
        or getattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", None)
        or os.getenv("SMARTSPEC_WEB_GATEWAY_URL")
        or os.getenv("NODEJS_INTERNAL_URL")
        or "http://localhost:3000"
    )
    return str(candidate).strip()


def _normalize_gateway_base_url(url: str) -> str:
    normalized = url.rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        raise GatewayModelConfigurationError(
            "invalid_gateway_base_url",
            f"Unsupported gateway base URL: {url!r}",
        )
    if normalized.endswith("/v1"):
        return normalized
    return f"{normalized}/v1"


def _looks_like_direct_provider_url(url: str) -> bool:
    hostname = (urlparse(url).hostname or "").lower()
    return hostname in _DIRECT_PROVIDER_HOSTS


def build_gateway_transport_config(
    *,
    surface: RuntimeSurface,
    model_config: RuntimeModelConfig,
    attribution_token: str,
    gateway_base_url: str | None = None,
    provider_base_url: str | None = None,
    provider_api_key: str | None = None,
    transport: GatewayTransport = "responses",
) -> GatewayTransportConfig:
    if not attribution_token:
        raise GatewayModelConfigurationError(
            "missing_attribution_token",
            "Gateway attribution token is required.",
        )

    base_url = _normalize_gateway_base_url(_gateway_base_url_candidate(gateway_base_url))

    if surface in _PRODUCTION_RUNTIME_SURFACES and provider_api_key:
        raise GatewayModelConfigurationError(
            "provider_api_key_rejected",
            "Direct provider API keys are not accepted for production runtime surfaces.",
        )

    if surface in _PRODUCTION_RUNTIME_SURFACES and provider_base_url:
        normalized_provider_base = _normalize_gateway_base_url(provider_base_url)
        if normalized_provider_base != base_url or _looks_like_direct_provider_url(provider_base_url):
            raise GatewayModelConfigurationError(
                "provider_base_url_rejected",
                "Direct provider base URLs are not allowed for production runtime surfaces.",
            )

    return GatewayTransportConfig(
        surface=surface,
        provider_id=model_config.providerId,
        model_id=model_config.modelId,
        gateway_route_id=model_config.gatewayRouteId,
        resolved_gateway_model_id=model_config.resolvedGatewayModelId or model_config.modelId,
        base_url=base_url,
        api_key=attribution_token,
        transport=transport,
    )


def create_gateway_async_openai_client(
    transport_config: GatewayTransportConfig,
) -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=transport_config.api_key,
        base_url=transport_config.base_url,
    )
