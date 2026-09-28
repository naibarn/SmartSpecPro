"""Unit tests for the SQL/R2-to-Vectorize projection registry contract."""

from app.services.vector_projection_registry import (
    VECTORIZE_EMBEDDING_DIMENSIONS,
    VECTORIZE_EMBEDDING_MODEL,
    VECTORIZE_EMBEDDING_VERSION,
    build_library_vector_projection_records,
    vectorize_namespace_for_tenant,
)


def test_library_projection_registry_is_rebuild_only_and_deterministic():
    chunks = [{"chunk_index": 0, "content": "rabbit product photo"}]

    first = build_library_vector_projection_records(
        tenant_id="tenant-194",
        item_id=42,
        chunks=chunks,
        vector_index="smartaihub-library",
        source_revision="library-item:42:revision-7",
        owner_user_id=9,
        source_locator_kind="r2_or_sql",
    )
    second = build_library_vector_projection_records(
        tenant_id="tenant-194",
        item_id=42,
        chunks=chunks,
        vector_index="smartaihub-library",
        source_revision="library-item:42:revision-7",
        owner_user_id=9,
        source_locator_kind="r2_or_sql",
    )

    assert first == second
    assert first[0]["status"] == "queued"
    assert first[0]["namespace"] == "tenant:tenant-194"
    assert first[0]["embedding_model"] == VECTORIZE_EMBEDDING_MODEL
    assert first[0]["embedding_dimensions"] == VECTORIZE_EMBEDDING_DIMENSIONS
    assert first[0]["embedding_version"] == VECTORIZE_EMBEDDING_VERSION
    assert len(first[0]["content_hash"]) == 64
    assert first[0]["vector_id"].startswith("v:")


def test_library_projection_registry_changes_id_when_source_revision_changes():
    common = {
        "tenant_id": "tenant-194",
        "item_id": 42,
        "chunks": [{"chunk_index": 0, "content": "rabbit product photo"}],
        "vector_index": "smartaihub-library",
    }

    first = build_library_vector_projection_records(
        **common,
        source_revision="revision-1",
    )
    second = build_library_vector_projection_records(
        **common,
        source_revision="revision-2",
    )

    assert first[0]["vector_id"] != second[0]["vector_id"]
    assert first[0]["content_hash"] == second[0]["content_hash"]


def test_projection_namespace_matches_vectorize_limit():
    assert vectorize_namespace_for_tenant("tenant-1") == "tenant:tenant-1"
    try:
        vectorize_namespace_for_tenant("x" * 100)
    except ValueError as exc:
        assert str(exc) == "VECTORIZE_NAMESPACE_INVALID"
    else:
        raise AssertionError("expected an oversized namespace to be rejected")
