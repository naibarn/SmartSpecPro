"""
Cloudflare Vectorize Store — REST API adapter for vector operations.

Implements the same interface pattern as PgVectorStore for consistency.
Uses the Cloudflare Vectorize v2 REST API:
https://developers.cloudflare.com/vectorize/
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4/accounts"


@dataclass
class VectorizeConfig:
    """Configuration for Cloudflare Vectorize."""

    account_id: str
    api_token: str
    index_name: str
    timeout: float = 30.0


class CloudflareVectorizeStore:
    """Cloudflare Vectorize vector database adapter."""

    def __init__(self, config: VectorizeConfig) -> None:
        self._config = config
        self._base_url = (
            f"{CLOUDFLARE_API_BASE}/{config.account_id}/vectorize/v2/indexes"
        )
        self._headers = {
            "Authorization": f"Bearer {config.api_token}",
            "Content-Type": "application/json",
        }

    # ── Index Info ────────────────────────────────────────────────────────

    async def get_info(self) -> dict[str, Any]:
        """Get index metadata (dimensions, vector count, metric)."""
        url = f"{self._base_url}/{self._config.index_name}"
        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            resp = await client.get(url, headers=self._headers)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                raise RuntimeError(
                    f"Vectorize API error: {data.get('errors', 'unknown')}"
                )
            return data.get("result", {})

    # ── Upsert ───────────────────────────────────────────────────────────

    async def upsert(
        self,
        vectors: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Upsert vectors into the index.

        Each vector dict must have:
          - id: str
          - values: List[float]
          - metadata: Dict[str, Any] (optional)
        """
        url = f"{self._base_url}/{self._config.index_name}/upsert"
        payload = {"vectors": vectors}

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            resp = await client.post(url, headers=self._headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                raise RuntimeError(
                    f"Vectorize upsert error: {data.get('errors', 'unknown')}"
                )
            return data.get("result", {})

    # ── Query ────────────────────────────────────────────────────────────

    async def query(
        self,
        vector: list[float],
        top_k: int = 10,
        filter_metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Query for similar vectors.

        Returns list of matches with id, score, and metadata.
        """
        url = f"{self._base_url}/{self._config.index_name}/query"
        payload: dict[str, Any] = {"vector": vector, "topK": top_k}
        if filter_metadata:
            payload["filter"] = filter_metadata

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            resp = await client.post(url, headers=self._headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                raise RuntimeError(
                    f"Vectorize query error: {data.get('errors', 'unknown')}"
                )
            return data.get("result", {}).get("matches", [])

    # ── Delete ───────────────────────────────────────────────────────────

    async def delete_by_ids(self, ids: list[str]) -> dict[str, Any]:
        """Delete vectors by their IDs."""
        url = f"{self._base_url}/{self._config.index_name}/delete-by-ids"
        payload = {"ids": ids}

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            resp = await client.post(url, headers=self._headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                raise RuntimeError(
                    f"Vectorize delete error: {data.get('errors', 'unknown')}"
                )
            return data.get("result", {})

    # ── Get by IDs ───────────────────────────────────────────────────────

    async def get_by_ids(self, ids: list[str]) -> list[dict[str, Any]]:
        """Fetch vectors by their IDs."""
        url = f"{self._base_url}/{self._config.index_name}/get-by-ids"
        payload = {"ids": ids}

        async with httpx.AsyncClient(timeout=self._config.timeout) as client:
            resp = await client.post(url, headers=self._headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success"):
                raise RuntimeError(
                    f"Vectorize get error: {data.get('errors', 'unknown')}"
                )
            return data.get("result", [])

    # ── Test Connection ──────────────────────────────────────────────────

    async def test_connection(self) -> dict[str, Any]:
        """Test connectivity by fetching index info."""
        try:
            info = await self.get_info()
            return {
                "success": True,
                "message": f"Connected to Vectorize index '{self._config.index_name}'",
                "index_name": self._config.index_name,
                "config": info.get("config", {}),
            }
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 401:
                msg = "Authentication failed — check your API token"
            elif status == 404:
                msg = f"Index '{self._config.index_name}' not found"
            else:
                msg = f"HTTP {status}: {e.response.text[:120]}"
            return {"success": False, "message": msg}
        except Exception as e:
            return {"success": False, "message": str(e)[:200]}
