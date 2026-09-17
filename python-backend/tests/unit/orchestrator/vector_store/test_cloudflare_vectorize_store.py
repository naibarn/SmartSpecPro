"""Contract tests for the Cloudflare Vectorize REST adapter."""

import json

import httpx
import pytest

from app.orchestrator.vector_store.cloudflare_vectorize_store import (
    CloudflareVectorizeStore,
    VectorizeAPIError,
    VectorizeConfig,
    VectorizeContractError,
    validate_vectorize_vector,
)


def _vector(vector_id: str = "v-1") -> dict:
    return {
        "id": vector_id,
        "values": [0.1] * 768,
        "metadata": {
            "tenantId": "tenant-1",
            "type": "library_chunk",
            "itemId": 10,
            "chunkIndex": 0,
        },
    }


def test_vectorize_namespace_matches_tenant_metadata() -> None:
    vector = {**_vector(), "namespace": "tenant:tenant-1"}
    validate_vectorize_vector(vector)
    with pytest.raises(VectorizeContractError, match="VECTORIZE_NAMESPACE_INVALID"):
        validate_vectorize_vector({**vector, "namespace": "tenant-2"})


@pytest.mark.unit
@pytest.mark.asyncio
async def test_vectorize_v2_paths_ndjson_and_query_metadata() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/upsert"):
            assert request.headers["content-type"] == "application/x-ndjson"
            lines = [line for line in request.content.decode().splitlines() if line]
            assert len(lines) == 1
            assert json.loads(lines[0])["id"] == "v-1"
            assert json.loads(lines[0])["namespace"] == "tenant:tenant-1"
            return httpx.Response(200, json={"success": True, "result": {"mutationId": "upsert-1"}})
        if request.url.path.endswith("/query"):
            payload = json.loads(request.content)
            assert payload["returnMetadata"] == "all"
            assert payload["namespace"] == "tenant:tenant-1"
            return httpx.Response(200, json={"success": True, "result": {"matches": [{"id": "v-1"}]}})
        if request.url.path.endswith("/delete_by_ids"):
            return httpx.Response(200, json={"success": True, "result": {"mutationId": "delete-1"}})
        if request.url.path.endswith("/get_by_ids"):
            return httpx.Response(200, json={"success": True, "result": [_vector()]})
        return httpx.Response(200, json={"success": True, "result": {"config": {"dimensions": 768}}})

    def client_factory(*, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)

    store = CloudflareVectorizeStore(
        VectorizeConfig(account_id="account-1", api_token="token-1", index_name="library-index"),
        http_client_factory=client_factory,
    )

    assert await store.upsert([{**_vector(), "namespace": "tenant:tenant-1"}]) == {"mutationId": "upsert-1"}
    assert await store.query(
        [0.1] * 768,
        top_k=5,
        filter_metadata={"tenantId": "tenant-1"},
        namespace="tenant:tenant-1",
    ) == [{"id": "v-1"}]
    assert await store.delete_by_ids(["v-1"]) == {"mutationId": "delete-1"}
    assert await store.get_by_ids(["v-1"], expected_tenant_id="tenant-1") == [_vector()]

    assert "/vectorize/v2/indexes/library-index/upsert" in str(requests[0].url)
    assert "/vectorize/v2/indexes/library-index/query" in str(requests[1].url)
    assert "/vectorize/v2/indexes/library-index/delete_by_ids" in str(requests[2].url)
    assert "/vectorize/v2/indexes/library-index/get_by_ids" in str(requests[3].url)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_vectorize_rejects_wrong_dimensions_nan_and_cross_tenant_reads() -> None:
    store = CloudflareVectorizeStore(
        VectorizeConfig(account_id="account-1", api_token="token-1", index_name="library-index"),
        http_client_factory=lambda **_kwargs: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    json={"success": True, "result": [{"id": "v-1", "metadata": {"tenantId": "tenant-2"}}]},
                )
            )
        ),
    )

    with pytest.raises(VectorizeContractError, match="VECTORIZE_VALUES_INVALID"):
        await store.upsert([{**_vector(), "values": [0.1] * 767}])
    with pytest.raises(VectorizeContractError, match="VECTORIZE_VALUES_INVALID"):
        await store.upsert([{**_vector(), "values": [float("nan")] * 768}])
    with pytest.raises(PermissionError, match="vector_tenant_scope_invalid"):
        await store.get_by_ids(["v-1"], expected_tenant_id="tenant-1")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_tenant_verified_get_rejects_wrong_item() -> None:
    store = CloudflareVectorizeStore(
        VectorizeConfig(account_id="account-1", api_token="token-1", index_name="library-index"),
        http_client_factory=lambda **_kwargs: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    json={"success": True, "result": [{**_vector(), "metadata": {"tenantId": "tenant-1", "itemId": 11}}]},
                )
            )
        ),
    )

    with pytest.raises(PermissionError, match="vector_item_scope_invalid"):
        await store.get_by_ids(["v-1"], expected_tenant_id="tenant-1", expected_item_id=10)


@pytest.mark.unit
def test_vectorize_rejects_unsafe_index_names() -> None:
    with pytest.raises(VectorizeContractError, match="VECTORIZE_INDEX_NAME_INVALID"):
        VectorizeConfig(account_id="account-1", api_token="token-1", index_name="../other-index")


@pytest.mark.unit
def test_vectorize_rejects_unsafe_namespaces() -> None:
    from app.orchestrator.vector_store.cloudflare_vectorize_store import validate_vectorize_namespace

    with pytest.raises(VectorizeContractError, match="VECTORIZE_NAMESPACE_INVALID"):
        validate_vectorize_namespace(" ")
    with pytest.raises(VectorizeContractError, match="VECTORIZE_NAMESPACE_INVALID"):
        validate_vectorize_namespace("tenant:" + "x" * 100)


@pytest.mark.unit
def test_vectorize_rejects_duplicate_ids() -> None:
    with pytest.raises(VectorizeContractError, match="VECTORIZE_IDS_INVALID"):
        from app.orchestrator.vector_store.cloudflare_vectorize_store import validate_vectorize_ids

        validate_vectorize_ids(["v-1", "v-1"])


@pytest.mark.unit
@pytest.mark.asyncio
async def test_tenant_verified_get_rejects_partial_provider_response() -> None:
    store = CloudflareVectorizeStore(
        VectorizeConfig(account_id="account-1", api_token="token-1", index_name="library-index"),
        http_client_factory=lambda **_kwargs: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    json={"success": True, "result": [_vector()]},
                )
            )
        ),
    )

    with pytest.raises(PermissionError, match="vector_tenant_scope_invalid"):
        await store.get_by_ids(["v-1", "v-2"], expected_tenant_id="tenant-1")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_async_writes_require_mutation_evidence() -> None:
    store = CloudflareVectorizeStore(
        VectorizeConfig(account_id="account-1", api_token="token-1", index_name="library-index"),
        http_client_factory=lambda **_kwargs: httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200,
                    json={"success": True, "result": {}},
                )
            )
        ),
    )

    with pytest.raises(VectorizeAPIError, match="VECTORIZE_MUTATION_EVIDENCE_MISSING"):
        await store.upsert([_vector()])
    with pytest.raises(VectorizeAPIError, match="VECTORIZE_MUTATION_EVIDENCE_MISSING"):
        await store.delete_by_ids(["v-1"])
