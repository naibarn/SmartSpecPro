from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.llm_proxy.providers.nvidia_nim_provider import NvidiaNimProvider


@pytest.mark.asyncio
async def test_nvidia_nim_provider_accepts_allowlisted_model_and_calls_embeddings_endpoint() -> None:
    provider = NvidiaNimProvider(
        api_key="test-key",
        base_url="https://integrate.api.nvidia.com/v1",
    )
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "data": [{"embedding": [float(index) for index in range(1024)]}],
    }
    provider.client.post = AsyncMock(return_value=mock_response)

    embedding = await provider.create_embedding("embed-qa-4", "hello world")

    assert len(embedding) == 1024
    assert embedding[0] == 0.0
    provider.client.post.assert_awaited_once_with(
        "https://integrate.api.nvidia.com/v1/embeddings",
        json={"model": "nvidia/embed-qa-4", "input": "hello world"},
        headers=provider._headers,
    )


@pytest.mark.asyncio
async def test_nvidia_nim_provider_rejects_unknown_models_before_http_call() -> None:
    provider = NvidiaNimProvider(api_key="test-key")
    provider.client.post = AsyncMock()

    with pytest.raises(ValueError, match="Unknown NVIDIA NIM embedding model"):
        await provider.create_embedding("mystery-model", "hello world")

    provider.client.post.assert_not_called()


@pytest.mark.asyncio
async def test_nvidia_nim_provider_normalizes_provider_qualified_ids() -> None:
    provider = NvidiaNimProvider(api_key="test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "data": [{"embedding": [float(index) for index in range(2048)]}],
    }
    provider.client.post = AsyncMock(return_value=mock_response)

    embedding = await provider.create_embedding(
        "nvidia_nim/nvidia/llama-3.2-nv-embedqa-1b-v1",
        "hello world",
    )

    assert len(embedding) == 2048
    payload = provider.client.post.await_args.kwargs["json"]
    assert payload["model"] == "nvidia/llama-3.2-nv-embedqa-1b-v1"


@pytest.mark.asyncio
async def test_nvidia_nim_provider_rejects_malformed_embedding_vectors() -> None:
    provider = NvidiaNimProvider(api_key="test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"data": [{"embedding": [1.0, "oops", 3.0]}]}
    provider.client.post = AsyncMock(return_value=mock_response)

    with pytest.raises(ValueError, match="numeric embedding vector"):
        await provider.create_embedding("nvidia/embed-qa-4", "hello world")


@pytest.mark.asyncio
async def test_nvidia_nim_provider_enforces_known_dimensions() -> None:
    provider = NvidiaNimProvider(api_key="test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"data": [{"embedding": [1.0, 2.0, 3.0]}]}
    provider.client.post = AsyncMock(return_value=mock_response)

    with pytest.raises(ValueError, match="expected dimension 1024"):
        await provider.create_embedding("nvidia/embed-qa-4", "hello world")


@pytest.mark.asyncio
async def test_nvidia_nim_provider_enforces_requested_dynamic_dimensions() -> None:
    provider = NvidiaNimProvider(api_key="test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "data": [{"embedding": [float(index) for index in range(1024)]}],
    }
    provider.client.post = AsyncMock(return_value=mock_response)

    with pytest.raises(ValueError, match="expected dimension 768"):
        await provider.create_embedding(
            "nvidia/llama-nemotron-embed-1b-v2",
            "hello world",
            dimensions=768,
        )


@pytest.mark.asyncio
async def test_nvidia_nim_provider_supports_nv_embedqa_mistral_inventory_model() -> None:
    provider = NvidiaNimProvider(api_key="test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "data": [{"embedding": [float(index) for index in range(4096)]}],
    }
    provider.client.post = AsyncMock(return_value=mock_response)

    embedding = await provider.create_embedding(
        "nvidia/nv-embedqa-mistral-7b-v2",
        "hello world",
    )

    assert len(embedding) == 4096


@pytest.mark.asyncio
async def test_nvidia_nim_provider_allows_inventory_models_without_known_dimensions() -> None:
    provider = NvidiaNimProvider(api_key="test-key")
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "data": [{"embedding": [1.0, 2.0, 3.0]}],
    }
    provider.client.post = AsyncMock(return_value=mock_response)

    embedding = await provider.create_embedding(
        "nvidia/llama-nemotron-embed-vl-1b-v2",
        "hello world",
    )

    assert embedding == [1.0, 2.0, 3.0]


def test_nvidia_nim_provider_rejects_invalid_base_url() -> None:
    with pytest.raises(ValueError, match="absolute http\\(s\\) URL"):
        NvidiaNimProvider(api_key="test-key", base_url="not-a-url")
