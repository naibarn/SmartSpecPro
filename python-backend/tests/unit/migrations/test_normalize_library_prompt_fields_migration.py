"""Unit checks for migration 011 (library/media prompt normalization)."""

from pathlib import Path


def test_migration_011_exists_with_library_prompt_normalization_contract():
    migration_path = Path("migrations/011_normalize_library_prompt_fields.py")
    assert migration_path.exists()

    content = migration_path.read_text(encoding="utf-8")
    assert "normalize_media_prompt" in content
    assert "media_tasks" in content
    assert "library_items" in content
    assert "library_chunks" in content
    assert "metadata" in content
    assert "downgrade" in content
