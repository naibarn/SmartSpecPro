"""Unit checks for migration 010 (media_tasks prompt normalization)."""

from pathlib import Path


def test_migration_010_exists_with_prompt_normalization_contract():
    migration_path = Path("migrations/010_normalize_media_task_prompts.py")
    assert migration_path.exists()

    content = migration_path.read_text(encoding="utf-8")
    assert "normalize_media_prompt" in content
    assert "media_tasks" in content
    assert "prompt LIKE '%```%'" in content
    assert "UPDATE media_tasks" in content
    assert "downgrade" in content
