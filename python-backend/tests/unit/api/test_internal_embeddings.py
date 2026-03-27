from __future__ import annotations

import pytest

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
