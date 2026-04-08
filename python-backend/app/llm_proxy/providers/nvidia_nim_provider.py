"""Explicit NVIDIA NIM Hosted embedding provider."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx


@dataclass(frozen=True)
class NvidiaEmbeddingModelSpec:
    default_dimension: int | None = None
    allowed_dimensions: frozenset[int] | None = None


class NvidiaNimProvider:
    """Small explicit provider for NVIDIA hosted embedding models."""

    BASE_URL = "https://integrate.api.nvidia.com/v1"

    MODEL_SPECS: dict[str, NvidiaEmbeddingModelSpec] = {
        "nvidia/embed-qa-4": NvidiaEmbeddingModelSpec(default_dimension=1024),
        "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1": NvidiaEmbeddingModelSpec(),
        "nvidia/llama-3.2-nemoretriever-300m-embed-v1": NvidiaEmbeddingModelSpec(default_dimension=2048),
        "nvidia/llama-3.2-nv-embedqa-1b-v1": NvidiaEmbeddingModelSpec(default_dimension=2048),
        "nvidia/llama-3.2-nv-embedqa-1b-v2": NvidiaEmbeddingModelSpec(
            default_dimension=2048,
            allowed_dimensions=frozenset({384, 512, 768, 1024, 2048}),
        ),
        "nvidia/llama-nemotron-embed-1b-v2": NvidiaEmbeddingModelSpec(
            default_dimension=2048,
            allowed_dimensions=frozenset({384, 512, 768, 1024, 2048}),
        ),
        "nvidia/llama-nemotron-embed-vl-1b-v2": NvidiaEmbeddingModelSpec(),
        "nvidia/nv-embed-v1": NvidiaEmbeddingModelSpec(default_dimension=4096),
        "nvidia/nv-embedcode-7b-v1": NvidiaEmbeddingModelSpec(default_dimension=4096),
        "nvidia/nv-embedqa-e5-v5": NvidiaEmbeddingModelSpec(default_dimension=1024),
        "nvidia/nv-embedqa-mistral-7b-v2": NvidiaEmbeddingModelSpec(default_dimension=4096),
        "nvidia/nvclip": NvidiaEmbeddingModelSpec(),
    }

    def __init__(self, api_key: str, base_url: str | None = None):
        self.api_key = api_key
        self.base_url = self._normalize_base_url(base_url or self.BASE_URL)
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=5.0),
        )

    @staticmethod
    def _normalize_base_url(base_url: str) -> str:
        normalized = str(base_url or "").strip().rstrip("/")
        if not normalized:
            raise ValueError("NVIDIA_NIM_BASE_URL must be a non-empty http(s) URL")

        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("NVIDIA_NIM_BASE_URL must be an absolute http(s) URL")

        if normalized.endswith("/v1"):
            return normalized
        return f"{normalized}/v1"

    @classmethod
    def normalize_model_id(cls, model: str) -> str:
        normalized = str(model or "").strip().lower()
        if not normalized:
            raise ValueError("Model name is required")

        if normalized.startswith("nvidia_nim/"):
            normalized = normalized[len("nvidia_nim/") :]

        if normalized.startswith("nvidia/"):
            canonical = normalized
        elif "/" in normalized:
            raise ValueError(f"Unknown NVIDIA NIM embedding model: {model!r}")
        else:
            canonical = f"nvidia/{normalized}"

        if canonical not in cls.MODEL_SPECS:
            raise ValueError(f"Unknown NVIDIA NIM embedding model: {model!r}")

        return canonical

    @classmethod
    def _resolve_expected_dimension(cls, model_id: str, dimensions: int | None) -> int | None:
        spec = cls.MODEL_SPECS[model_id]
        if dimensions is None:
            return spec.default_dimension

        if spec.allowed_dimensions is not None:
            if dimensions not in spec.allowed_dimensions:
                allowed = ", ".join(str(value) for value in sorted(spec.allowed_dimensions))
                raise ValueError(
                    f"Model {model_id!r} supports dimensions {allowed}; received {dimensions}"
                )
            return dimensions

        if spec.default_dimension is not None and dimensions != spec.default_dimension:
            raise ValueError(
                f"Model {model_id!r} requires dimension {spec.default_dimension}; received {dimensions}"
            )

        return dimensions

    @staticmethod
    def _extract_embedding(data: Any) -> list[float]:
        if not isinstance(data, dict):
            raise ValueError("NVIDIA NIM response must be a JSON object")

        rows = data.get("data")
        if not isinstance(rows, list) or not rows:
            raise ValueError("NVIDIA NIM response missing embedding data")

        first_row = rows[0]
        if not isinstance(first_row, dict):
            raise ValueError("NVIDIA NIM response must contain object rows")

        embedding = first_row.get("embedding")
        if not isinstance(embedding, list) or not embedding:
            raise ValueError("NVIDIA NIM response missing numeric embedding vector")

        if any(not isinstance(value, (int, float)) or isinstance(value, bool) for value in embedding):
            raise ValueError("NVIDIA NIM response must contain a numeric embedding vector")

        return [float(value) for value in embedding]

    async def aclose(self) -> None:
        await self.client.aclose()

    async def __aenter__(self) -> NvidiaNimProvider:
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()

    async def create_embedding(
        self,
        model: str,
        input_text: str,
        dimensions: int | None = None,
    ) -> list[float]:
        model_id = self.normalize_model_id(model)
        expected_dimension = self._resolve_expected_dimension(model_id, dimensions)

        payload: dict[str, Any] = {"model": model_id, "input": input_text}
        if dimensions is not None:
            payload["dimensions"] = dimensions

        response = await self.client.post(
            f"{self.base_url}/embeddings",
            json=payload,
            headers=self._headers,
        )
        response.raise_for_status()

        embedding = self._extract_embedding(response.json())
        if expected_dimension is not None and len(embedding) != expected_dimension:
            raise ValueError(
                f"NVIDIA NIM model {model_id!r} returned dimension {len(embedding)}; "
                f"expected dimension {expected_dimension}"
            )

        return embedding
