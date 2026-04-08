from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api import internal_embeddings
from app.core.config import settings


class _FakeEmbeddingProvider:
    dimension = 3
    model_name = "text-embedding-3-small"

    def __init__(self, *args, **kwargs):
        pass

    def embed_batch(self, texts):
        return [[float(index)] * self.dimension for index, _ in enumerate(texts, start=1)]


class _FakeKnplabsProvider:
    def __init__(self, *args, **kwargs):
        self.dimension = 3
        self.model_name = "text-embedding-3-small"

    async def create_embedding(self, model: str, input_text: str, dimensions: int | None = None):
        return [1.0, 2.0, 3.0]


class _FakeNvidiaProvider:
    last_init: dict[str, str | None] | None = None
    last_calls: list[tuple[str, str, int | None]] = []
    init_count = 0

    def __init__(self, api_key: str, base_url: str | None = None):
        self.api_key = api_key
        self.base_url = base_url
        _FakeNvidiaProvider.init_count += 1
        _FakeNvidiaProvider.last_init = {"api_key": api_key, "base_url": base_url}

    @staticmethod
    def normalize_model_id(model: str) -> str:
        normalized = str(model).strip().lower()
        if normalized.startswith("nvidia/"):
            return normalized
        return f"nvidia/{normalized}"

    async def create_embedding(self, model: str, input_text: str, dimensions: int | None = None):
        _FakeNvidiaProvider.last_calls.append((model, input_text, dimensions))
        return [0.1, 0.2, 0.3]

    async def aclose(self) -> None:
        return None


class _BrokenNvidiaProvider(_FakeNvidiaProvider):
    async def create_embedding(self, model: str, input_text: str, dimensions: int | None = None):
        raise ValueError("Embedding provider returned unexpected dimension")


async def _run_in_threadpool(func, *args, **kwargs):
    return func(*args, **kwargs)


@pytest.mark.asyncio
async def test_embed_text_batch_returns_batch_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "secret-token", raising=False)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "openai-key", raising=False)
    monkeypatch.setattr(internal_embeddings, "OpenAIEmbedding", _FakeEmbeddingProvider)
    monkeypatch.setattr(internal_embeddings, "run_in_threadpool", _run_in_threadpool)

    response = await internal_embeddings.embed_text_batch(
        internal_embeddings.BatchEmbeddingRequest(texts=["hello", "world"]),
        x_proxy_token=None,
        x_internal_token="secret-token",
    )

    assert response.count == 2
    assert response.dimension == 3
    assert response.model == "text-embedding-3-small"
    assert response.embeddings == [[1.0, 1.0, 1.0], [2.0, 2.0, 2.0]]


@pytest.mark.asyncio
async def test_embed_text_uses_knplabs_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "secret-token", raising=False)
    monkeypatch.setattr(settings, "KNPLABAI_API_KEY", "knp-key", raising=False)
    monkeypatch.setattr(internal_embeddings, "KNPLabsProvider", _FakeKnplabsProvider)

    response = await internal_embeddings.embed_text(
        internal_embeddings.EmbeddingRequest(text="hello", provider="knplabs"),
        x_proxy_token="secret-token",
        x_internal_token=None,
    )

    assert response.embedding == [1.0, 2.0, 3.0]
    assert response.dimension == 3
    assert response.model == "text-embedding-3-small"


@pytest.mark.asyncio
async def test_embed_text_uses_nvidia_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeNvidiaProvider.last_init = None
    _FakeNvidiaProvider.last_calls = []
    _FakeNvidiaProvider.init_count = 0
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "secret-token", raising=False)
    monkeypatch.setattr(settings, "NVIDIA_NIM_API_KEY", "nvidia-key", raising=False)
    monkeypatch.setattr(
        settings,
        "NVIDIA_NIM_BASE_URL",
        "https://example.test/nim/v1",
        raising=False,
    )
    monkeypatch.setattr(internal_embeddings, "NvidiaNimProvider", _FakeNvidiaProvider)

    response = await internal_embeddings.embed_text(
        internal_embeddings.EmbeddingRequest(
            text="hello",
            model="nvidia/embed-qa-4",
            provider="nvidia_nim",
        ),
        x_proxy_token="secret-token",
        x_internal_token=None,
    )

    assert response.embedding == [0.1, 0.2, 0.3]
    assert response.dimension == 3
    assert response.model == "nvidia/embed-qa-4"
    assert _FakeNvidiaProvider.last_init == {
        "api_key": "nvidia-key",
        "base_url": "https://example.test/nim/v1",
    }
    assert _FakeNvidiaProvider.init_count == 1
    assert _FakeNvidiaProvider.last_calls == [("nvidia/embed-qa-4", "hello", None)]


@pytest.mark.asyncio
async def test_embed_text_batch_uses_nvidia_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeNvidiaProvider.last_init = None
    _FakeNvidiaProvider.last_calls = []
    _FakeNvidiaProvider.init_count = 0
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "secret-token", raising=False)
    monkeypatch.setattr(settings, "NVIDIA_NIM_API_KEY", "nvidia-key", raising=False)
    monkeypatch.setattr(internal_embeddings, "NvidiaNimProvider", _FakeNvidiaProvider)

    response = await internal_embeddings.embed_text_batch(
        internal_embeddings.BatchEmbeddingRequest(
            texts=["hello", "world"],
            model="nvidia/embed-qa-4",
            provider="nvidia",
        ),
        x_proxy_token="secret-token",
        x_internal_token=None,
    )

    assert response.count == 2
    assert response.dimension == 3
    assert response.model == "nvidia/embed-qa-4"
    assert response.embeddings == [[0.1, 0.2, 0.3], [0.1, 0.2, 0.3]]
    assert _FakeNvidiaProvider.init_count == 1
    assert _FakeNvidiaProvider.last_calls == [
        ("nvidia/embed-qa-4", "hello", None),
        ("nvidia/embed-qa-4", "world", None),
    ]


@pytest.mark.asyncio
async def test_embed_text_returns_503_when_nvidia_api_key_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "secret-token", raising=False)
    monkeypatch.setattr(settings, "NVIDIA_NIM_API_KEY", "", raising=False)

    with pytest.raises(HTTPException, match="NVIDIA_NIM_API_KEY not configured") as exc_info:
        await internal_embeddings.embed_text(
            internal_embeddings.EmbeddingRequest(
                text="hello",
                model="nvidia/embed-qa-4",
                provider="nvidia_nim",
            ),
            x_proxy_token="secret-token",
            x_internal_token=None,
        )

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_embed_text_returns_503_when_nvidia_base_url_is_invalid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "secret-token", raising=False)
    monkeypatch.setattr(settings, "NVIDIA_NIM_API_KEY", "nvidia-key", raising=False)
    monkeypatch.setattr(settings, "NVIDIA_NIM_BASE_URL", "not-a-url", raising=False)

    with pytest.raises(HTTPException, match="absolute http\\(s\\) URL") as exc_info:
        await internal_embeddings.embed_text(
            internal_embeddings.EmbeddingRequest(
                text="hello",
                model="nvidia/embed-qa-4",
                provider="nvidia_nim",
            ),
            x_proxy_token="secret-token",
            x_internal_token=None,
        )

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_embed_text_returns_502_on_nvidia_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "secret-token", raising=False)
    monkeypatch.setattr(settings, "NVIDIA_NIM_API_KEY", "nvidia-key", raising=False)
    monkeypatch.setattr(internal_embeddings, "NvidiaNimProvider", _BrokenNvidiaProvider)

    with pytest.raises(HTTPException, match="Embedding provider returned unexpected dimension") as exc_info:
        await internal_embeddings.embed_text(
            internal_embeddings.EmbeddingRequest(
                text="hello",
                model="nvidia/embed-qa-4",
                provider="nvidia_nim",
            ),
            x_proxy_token="secret-token",
            x_internal_token=None,
        )

    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_embed_text_batch_returns_502_on_nvidia_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "secret-token", raising=False)
    monkeypatch.setattr(settings, "NVIDIA_NIM_API_KEY", "nvidia-key", raising=False)
    monkeypatch.setattr(internal_embeddings, "NvidiaNimProvider", _BrokenNvidiaProvider)

    with pytest.raises(HTTPException, match="Embedding provider returned unexpected dimension") as exc_info:
        await internal_embeddings.embed_text_batch(
            internal_embeddings.BatchEmbeddingRequest(
                texts=["hello", "world"],
                model="nvidia/embed-qa-4",
                provider="nvidia_nim",
            ),
            x_proxy_token="secret-token",
            x_internal_token=None,
        )

    assert exc_info.value.status_code == 502
