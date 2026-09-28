"""Contract checks for migration 014 (Vectorize projection registry)."""

from pathlib import Path


def test_migration_014_exists_with_rebuild_only_registry_contract():
    migration_path = Path(__file__).resolve().parents[3] / "migrations" / "014_vector_index_registry.py"
    content = migration_path.read_text(encoding="utf-8")

    assert "vector_index_records" in content
    assert "embedding_model" in content
    assert "embedding_dimensions" in content
    assert "content_hash" in content
    assert "last_mutation_id" in content
    assert "embedding VECTOR" not in content
    assert "embedding BYTEA" not in content
    assert "CREATE TYPE vector_projection_status" in content
