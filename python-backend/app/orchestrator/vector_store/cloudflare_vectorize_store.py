"""
Cloudflare Vectorize Store — REST API adapter for vector operations.

Implements the same interface pattern as PgVectorStore for consistency.
Uses the Cloudflare Vectorize v2 REST API:
https://developers.cloudflare.com/vectorize/
"""

from __future__ import annotations

import asyncio
import json
import math
import re
from dataclasses import dataclass
from typing import Any, Callable

import httpx
import structlog

logger = structlog.get_logger(__name__)

CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4/accounts"
VECTORIZE_DIMENSIONS = 768
VECTORIZE_MAX_ID_BYTES = 64
VECTORIZE_MAX_NAMESPACE_BYTES = 64
VECTORIZE_MAX_METADATA_BYTES = 10 * 1024
VECTORIZE_MAX_FILTER_BYTES = 2048
VECTORIZE_MAX_INDEX_NAME_BYTES = 64
VECTORIZE_MAX_BATCH_SIZE = 5000
VECTORIZE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024
VECTORIZE_MAX_TOP_K_WITH_METADATA = 50


class VectorizeContractError(ValueError):
    """Raised when a request cannot be represented safely by Vectorize."""


class VectorizeAPIError(RuntimeError):
    """Safe provider error that does not include response bodies or credentials."""

    def __init__(self, code: str, status_code: int | None = None, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code
        self.retryable = retryable


def _utf8_size(value: str) -> int:
    return len(value.encode("utf-8"))


def validate_vectorize_index_name(index_name: str) -> None:
    if (
        not isinstance(index_name, str)
        or not index_name.strip()
        or index_name != index_name.strip()
        or _utf8_size(index_name) > VECTORIZE_MAX_INDEX_NAME_BYTES
        or re.fullmatch(r"[A-Za-z0-9_-]+", index_name) is None
    ):
        raise VectorizeContractError("VECTORIZE_INDEX_NAME_INVALID")


def validate_vectorize_namespace(namespace: str) -> None:
    if (
        not isinstance(namespace, str)
        or not namespace.strip()
        or namespace != namespace.strip()
        or _utf8_size(namespace) > VECTORIZE_MAX_NAMESPACE_BYTES
    ):
        raise VectorizeContractError("VECTORIZE_NAMESPACE_INVALID")


def validate_vectorize_ids(ids: list[str]) -> None:
    if not isinstance(ids, list) or not ids or len(ids) > VECTORIZE_MAX_BATCH_SIZE:
        raise VectorizeContractError("VECTORIZE_IDS_INVALID")
    if any(not isinstance(vector_id, str) or not vector_id or _utf8_size(vector_id) > VECTORIZE_MAX_ID_BYTES for vector_id in ids):
        raise VectorizeContractError("VECTORIZE_ID_INVALID")
    if len(set(ids)) != len(ids):
        raise VectorizeContractError("VECTORIZE_IDS_INVALID")


def _validate_metadata_value(value: Any, depth: int = 0) -> None:
    if value is None or isinstance(value, (str, bool)):
        return
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise VectorizeContractError("VECTORIZE_METADATA_INVALID")
        return
    if depth > 4:
        raise VectorizeContractError("VECTORIZE_METADATA_INVALID")
    if isinstance(value, list):
        for child in value:
            _validate_metadata_value(child, depth + 1)
        return
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str) or not key or any(marker in key for marker in (".", "$", "'", '"')):
                raise VectorizeContractError("VECTORIZE_METADATA_KEY_INVALID")
            _validate_metadata_value(child, depth + 1)
        return
    raise VectorizeContractError("VECTORIZE_METADATA_INVALID")


def validate_vectorize_vector(vector: dict[str, Any]) -> None:
    if not isinstance(vector, dict):
        raise VectorizeContractError("VECTORIZE_VECTOR_INVALID")
    vector_id = vector.get("id")
    if not isinstance(vector_id, str) or not vector_id or _utf8_size(vector_id) > VECTORIZE_MAX_ID_BYTES:
        raise VectorizeContractError("VECTORIZE_ID_INVALID")
    if "namespace" in vector:
        validate_vectorize_namespace(vector["namespace"])
    values = vector.get("values")
    if not isinstance(values, (list, tuple)) or len(values) != VECTORIZE_DIMENSIONS:
        raise VectorizeContractError("VECTORIZE_VALUES_INVALID")
    if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)) for value in values):
        raise VectorizeContractError("VECTORIZE_VALUES_INVALID")
    metadata = vector.get("metadata", {})
    if not isinstance(metadata, dict):
        raise VectorizeContractError("VECTORIZE_METADATA_INVALID")
    _validate_metadata_value(metadata)
    try:
        encoded = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise VectorizeContractError("VECTORIZE_METADATA_INVALID") from exc
    if _utf8_size(encoded) > VECTORIZE_MAX_METADATA_BYTES:
        raise VectorizeContractError("VECTORIZE_METADATA_INVALID")
    namespace = vector.get("namespace")
    if namespace is not None:
        tenant_id = str(metadata.get("tenantId") or metadata.get("tenant_id") or "").strip()
        if not tenant_id or namespace != f"tenant:{tenant_id}":
            raise VectorizeContractError("VECTORIZE_NAMESPACE_INVALID")


def validate_vectorize_vectors(vectors: list[dict[str, Any]]) -> None:
    if not isinstance(vectors, list) or not vectors or len(vectors) > VECTORIZE_MAX_BATCH_SIZE:
        raise VectorizeContractError("VECTORIZE_BATCH_INVALID")
    total_bytes = 0
    for vector in vectors:
        validate_vectorize_vector(vector)
        try:
            total_bytes += _utf8_size(json.dumps(vector, ensure_ascii=False, separators=(",", ":"), allow_nan=False)) + 1
        except (TypeError, ValueError) as exc:
            raise VectorizeContractError("VECTORIZE_VECTOR_INVALID") from exc
    if total_bytes > VECTORIZE_MAX_UPLOAD_BYTES:
        raise VectorizeContractError("VECTORIZE_UPLOAD_TOO_LARGE")


def validate_vectorize_query(
    vector: list[float],
    top_k: int,
    filter_metadata: dict[str, Any] | None,
    namespace: str | None = None,
) -> None:
    if namespace is not None:
        validate_vectorize_namespace(namespace)
        if filter_metadata and filter_metadata.get("tenantId") is not None:
            if namespace != f"tenant:{str(filter_metadata['tenantId']).strip()}":
                raise VectorizeContractError("VECTORIZE_NAMESPACE_INVALID")
    if not isinstance(vector, list) or len(vector) != VECTORIZE_DIMENSIONS:
        raise VectorizeContractError("VECTORIZE_QUERY_VECTOR_INVALID")
    if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)) for value in vector):
        raise VectorizeContractError("VECTORIZE_QUERY_VECTOR_INVALID")
    if not isinstance(top_k, int) or top_k < 1 or top_k > VECTORIZE_MAX_TOP_K_WITH_METADATA:
        raise VectorizeContractError("VECTORIZE_TOP_K_INVALID")
    if filter_metadata:
        _validate_metadata_value(filter_metadata)
        try:
            encoded = json.dumps(filter_metadata, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise VectorizeContractError("VECTORIZE_FILTER_INVALID") from exc
        if _utf8_size(encoded) > VECTORIZE_MAX_FILTER_BYTES:
            raise VectorizeContractError("VECTORIZE_FILTER_INVALID")


def _split_upsert_batches(vectors: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    batches: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_bytes = 0
    for vector in vectors:
        line = json.dumps(vector, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        line_bytes = _utf8_size(line) + 1
        if current and (len(current) >= VECTORIZE_MAX_BATCH_SIZE or current_bytes + line_bytes > VECTORIZE_MAX_UPLOAD_BYTES):
            batches.append(current)
            current = []
            current_bytes = 0
        current.append(vector)
        current_bytes += line_bytes
    if current:
        batches.append(current)
    return batches


def _require_mutation_id(result: Any) -> str:
    """Require provider mutation evidence before an async write can be acknowledged."""
    mutation_id = result.get("mutationId") if isinstance(result, dict) else None
    if not isinstance(mutation_id, str) or not mutation_id.strip():
        raise VectorizeAPIError("VECTORIZE_MUTATION_EVIDENCE_MISSING")
    return mutation_id.strip()


@dataclass
class VectorizeConfig:
    """Configuration for Cloudflare Vectorize."""

    account_id: str
    api_token: str
    index_name: str
    timeout: float = 30.0

    def __post_init__(self) -> None:
        if not self.account_id.strip() or not self.api_token.strip():
            raise VectorizeContractError("VECTORIZE_CONFIG_INVALID")
        validate_vectorize_index_name(self.index_name)
        if not isinstance(self.timeout, (int, float)) or self.timeout <= 0 or self.timeout > 300:
            raise VectorizeContractError("VECTORIZE_TIMEOUT_INVALID")


class CloudflareVectorizeStore:
    """Cloudflare Vectorize vector database adapter."""

    def __init__(
        self,
        config: VectorizeConfig,
        *,
        http_client_factory: Callable[..., Any] | None = None,
        retry_backoff_seconds: float = 0.25,
    ) -> None:
        self._config = config
        self._http_client_factory = http_client_factory or httpx.AsyncClient
        self._retry_backoff_seconds = max(0.0, min(float(retry_backoff_seconds), 10.0))
        self._base_url = (
            f"{CLOUDFLARE_API_BASE}/{config.account_id}/vectorize/v2/indexes"
        )
        self._headers = {
            "Authorization": f"Bearer {config.api_token}",
            "Content-Type": "application/json",
        }

    async def _request_json(
        self,
        method: str,
        url: str,
        *,
        json_payload: Any = None,
        content: str | None = None,
        content_type: str = "application/json",
    ) -> Any:
        headers = {**self._headers, "Content-Type": content_type}
        for attempt in range(3):
            try:
                async with self._http_client_factory(timeout=self._config.timeout) as client:
                    response = await client.request(
                        method,
                        url,
                        headers=headers,
                        json=json_payload if content is None else None,
                        content=content,
                    )
                if response.status_code == 429 or response.status_code >= 500:
                    error = VectorizeAPIError("VECTORIZE_PROVIDER_UNAVAILABLE", response.status_code, retryable=True)
                    if attempt < 2:
                        await asyncio.sleep(self._retry_backoff_seconds * (2**attempt))
                        continue
                    raise error
                if response.status_code >= 400:
                    raise VectorizeAPIError("VECTORIZE_PROVIDER_REQUEST_FAILED", response.status_code)
                try:
                    data = response.json()
                except (ValueError, json.JSONDecodeError) as exc:
                    raise VectorizeAPIError("VECTORIZE_PROVIDER_INVALID_RESPONSE") from exc
                if not isinstance(data, dict) or data.get("success") is False:
                    raise VectorizeAPIError("VECTORIZE_PROVIDER_REJECTED")
                return data.get("result", {})
            except VectorizeAPIError:
                raise
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt < 2:
                    await asyncio.sleep(self._retry_backoff_seconds * (2**attempt))
                    continue
                raise VectorizeAPIError("VECTORIZE_PROVIDER_UNAVAILABLE", retryable=True) from exc
        raise VectorizeAPIError("VECTORIZE_PROVIDER_UNAVAILABLE", retryable=True)

    # ── Index Info ────────────────────────────────────────────────────────

    async def get_info(self) -> dict[str, Any]:
        """Get index metadata (dimensions, vector count, metric)."""
        url = f"{self._base_url}/{self._config.index_name}"
        result = await self._request_json("GET", url)
        return result if isinstance(result, dict) else {}

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
        validate_vectorize_vectors(vectors)
        url = f"{self._base_url}/{self._config.index_name}/upsert"
        results = []
        for batch in _split_upsert_batches(vectors):
            ndjson = "\n".join(
                json.dumps(vector, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
                for vector in batch
            ) + "\n"
            result = await self._request_json(
                "POST",
                url,
                content=ndjson,
                content_type="application/x-ndjson",
            )
            if isinstance(result, dict):
                mutation_id = _require_mutation_id(result)
                results.append({"mutationId": mutation_id})
            else:
                raise VectorizeAPIError("VECTORIZE_MUTATION_EVIDENCE_MISSING")
        if len(results) == 1:
            return results[0]
        return {"mutationIds": [result["mutationId"] for result in results]}

    # ── Query ────────────────────────────────────────────────────────────

    async def query(
        self,
        vector: list[float],
        top_k: int = 10,
        filter_metadata: dict[str, Any] | None = None,
        namespace: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Query for similar vectors.

        Returns list of matches with id, score, and metadata.
        """
        validate_vectorize_query(vector, top_k, filter_metadata, namespace)
        url = f"{self._base_url}/{self._config.index_name}/query"
        payload: dict[str, Any] = {"vector": vector, "topK": top_k}
        payload["returnMetadata"] = "all"
        if namespace is not None:
            payload["namespace"] = namespace
        if filter_metadata:
            payload["filter"] = filter_metadata
        result = await self._request_json("POST", url, json_payload=payload)
        return result.get("matches", []) if isinstance(result, dict) else []

    # ── Delete ───────────────────────────────────────────────────────────

    async def delete_by_ids(self, ids: list[str]) -> dict[str, Any]:
        """Delete vectors by their IDs."""
        validate_vectorize_ids(ids)
        url = f"{self._base_url}/{self._config.index_name}/delete_by_ids"
        payload = {"ids": ids}
        result = await self._request_json("POST", url, json_payload=payload)
        return {"mutationId": _require_mutation_id(result)}

    # ── Get by IDs ───────────────────────────────────────────────────────

    async def get_by_ids(
        self,
        ids: list[str],
        expected_tenant_id: str | None = None,
        expected_item_id: int | None = None,
        allow_missing: bool = False,
    ) -> list[dict[str, Any]]:
        """Fetch vectors by their IDs."""
        validate_vectorize_ids(ids)
        url = f"{self._base_url}/{self._config.index_name}/get_by_ids"
        payload = {"ids": ids}
        result = await self._request_json("POST", url, json_payload=payload)
        vectors = result if isinstance(result, list) else result.get("vectors", []) if isinstance(result, dict) else []
        if expected_tenant_id is not None:
            requested_ids = set(ids)
            returned_ids = [
                str(vector.get("id", ""))
                for vector in vectors
                if isinstance(vector, dict)
            ]
            if len(set(returned_ids)) != len(returned_ids):
                raise PermissionError("vector_tenant_scope_invalid")
            if not allow_missing and (
                len(returned_ids) != len(requested_ids)
                or set(returned_ids) != requested_ids
            ):
                raise PermissionError("vector_tenant_scope_invalid")
            for vector in vectors:
                metadata = vector.get("metadata", {}) if isinstance(vector, dict) else {}
                owner = (
                    metadata.get("tenantId") or metadata.get("tenant_id")
                    if isinstance(metadata, dict)
                    else None
                )
                if owner != expected_tenant_id:
                    raise PermissionError("vector_tenant_scope_invalid")
                if expected_item_id is not None:
                    item_value = (
                        metadata.get("itemId") or metadata.get("item_id")
                        if isinstance(metadata, dict)
                        else None
                    )
                    try:
                        item_matches = int(item_value) == expected_item_id
                    except (TypeError, ValueError):
                        item_matches = False
                    if not item_matches:
                        raise PermissionError("vector_item_scope_invalid")
        return vectors

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
        except VectorizeAPIError as e:
            status = e.status_code
            if status == 401:
                msg = "Authentication failed — check your API token"
            elif status == 404:
                msg = f"Index '{self._config.index_name}' not found"
            else:
                msg = "Cloudflare Vectorize request failed"
            return {"success": False, "message": msg}
        except Exception:
            return {"success": False, "message": "Cloudflare Vectorize connection failed"}
