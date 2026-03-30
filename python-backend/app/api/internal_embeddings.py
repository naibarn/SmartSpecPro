"""Internal embeddings API for the web backend."""

from __future__ import annotations

import secrets
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.services.embedding_service import OpenAIEmbedding
from app.llm_proxy.providers import KNPLabsProvider

router = APIRouter(prefix="/api/internal/embeddings", tags=["Internal Embeddings"])


async def _verify_proxy_token(
    x_proxy_token: Optional[str] = Header(None),
    x_internal_token: Optional[str] = Header(None),
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


@router.post("")
async def embed_text(
    payload: EmbeddingRequest,
    x_proxy_token: Optional[str] = Header(None),
    x_internal_token: Optional[str] = Header(None),
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
    x_proxy_token: Optional[str] = Header(None),
    x_internal_token: Optional[str] = Header(None),
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
