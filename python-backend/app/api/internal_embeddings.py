"""Internal embeddings API for the web backend."""

from __future__ import annotations

import secrets
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.llm_proxy.providers import KNPLabsProvider, NvidiaNimProvider
from app.services.embedding_service import OpenAIEmbedding

router = APIRouter(prefix="/api/internal/embeddings", tags=["Internal Embeddings"])


async def _verify_proxy_token(
    x_proxy_token: str | None = Header(None),
    x_internal_token: str | None = Header(None),
) -> None:
    token = x_proxy_token or x_internal_token
    if not token:
        raise HTTPException(status_code=401, detail="Missing proxy token")
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if not proxy_token:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
    if not secrets.compare_digest(token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")


class EmbeddingRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    model: str = Field(default="text-embedding-3-small")
    provider: str = Field(default="openai")


class BatchEmbeddingRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=256)
    model: str = Field(default="text-embedding-3-small")
    provider: str = Field(default="openai")
    collection: str | None = None
    metadata: list[dict[str, Any]] | None = None


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    dimension: int
    model: str


class BatchEmbeddingResponse(BaseModel):
    embeddings: list[list[float]]
    dimension: int
    model: str
    count: int


def _create_nvidia_provider() -> NvidiaNimProvider:
    api_key = getattr(settings, "NVIDIA_NIM_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="NVIDIA_NIM_API_KEY not configured")

    try:
        return NvidiaNimProvider(
            api_key=api_key,
            base_url=getattr(settings, "NVIDIA_NIM_BASE_URL", None),
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _raise_nvidia_provider_http_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail=str(exc))


async def _embed_with_nvidia_provider(
    provider: NvidiaNimProvider,
    model: str,
    text: str,
) -> tuple[list[float], str]:
    try:
        embedding = await provider.create_embedding(model, text)
        return embedding, provider.normalize_model_id(model)
    except (ValueError, TypeError, httpx.HTTPError) as exc:
        raise _raise_nvidia_provider_http_error(exc) from exc


@router.post("")
async def embed_text(
    payload: EmbeddingRequest,
    x_proxy_token: str | None = Header(None),
    x_internal_token: str | None = Header(None),
) -> EmbeddingResponse:
    await _verify_proxy_token(x_proxy_token, x_internal_token)

    provider_name = payload.provider.strip().lower()
    if provider_name in {"knplabs", "knplabai"}:
        api_key = getattr(settings, "KNPLABAI_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="KNPLABAI_API_KEY not configured")
        provider = KNPLabsProvider(api_key=api_key, base_url=getattr(settings, "KNPLABAI_BASE_URL", None))
        embedding = await provider.create_embedding(payload.model, payload.text)
        dimension = len(embedding)
        model_name = payload.model
    elif provider_name in {"nvidia", "nvidia_nim"}:
        provider = _create_nvidia_provider()
        try:
            embedding, model_name = await _embed_with_nvidia_provider(provider, payload.model, payload.text)
            dimension = len(embedding)
        finally:
            await provider.aclose()
    else:
        api_key = getattr(settings, "OPENAI_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")

        provider = OpenAIEmbedding(model=payload.model, api_key=api_key)
        embedding = await run_in_threadpool(provider.embed_text, payload.text)
        dimension = provider.dimension
        model_name = provider.model_name

    if len(embedding) != dimension:
        raise HTTPException(status_code=502, detail="Embedding provider returned unexpected dimension")

    return EmbeddingResponse(
        embedding=embedding,
        dimension=dimension,
        model=model_name,
    )


@router.post("/batch")
async def embed_text_batch(
    payload: BatchEmbeddingRequest,
    x_proxy_token: str | None = Header(None),
    x_internal_token: str | None = Header(None),
) -> BatchEmbeddingResponse:
    await _verify_proxy_token(x_proxy_token, x_internal_token)

    provider_name = payload.provider.strip().lower()
    if provider_name in {"knplabs", "knplabai"}:
        api_key = getattr(settings, "KNPLABAI_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="KNPLABAI_API_KEY not configured")
        provider = KNPLabsProvider(api_key=api_key, base_url=getattr(settings, "KNPLABAI_BASE_URL", None))
        embeddings = [await provider.create_embedding(payload.model, text) for text in payload.texts]
        dimension = len(embeddings[0]) if embeddings else 0
        model_name = payload.model
    elif provider_name in {"nvidia", "nvidia_nim"}:
        provider = _create_nvidia_provider()
        try:
            model_name = provider.normalize_model_id(payload.model)
            embeddings: list[list[float]] = []
            for text in payload.texts:
                embedding, _ = await _embed_with_nvidia_provider(provider, payload.model, text)
                embeddings.append(embedding)
            dimension = len(embeddings[0]) if embeddings else 0
        except (ValueError, TypeError, httpx.HTTPError) as exc:
            raise _raise_nvidia_provider_http_error(exc) from exc
        finally:
            await provider.aclose()
    else:
        api_key = getattr(settings, "OPENAI_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")

        provider = OpenAIEmbedding(model=payload.model, api_key=api_key)
        embeddings = await run_in_threadpool(provider.embed_batch, payload.texts)
        dimension = provider.dimension
        model_name = provider.model_name

    if len(embeddings) != len(payload.texts):
        raise HTTPException(status_code=502, detail="Embedding provider returned unexpected batch size")
    if any(len(vector) != dimension for vector in embeddings):
        raise HTTPException(status_code=502, detail="Embedding provider returned unexpected dimension")

    return BatchEmbeddingResponse(
        embeddings=embeddings,
        dimension=dimension,
        model=model_name,
        count=len(embeddings),
    )
