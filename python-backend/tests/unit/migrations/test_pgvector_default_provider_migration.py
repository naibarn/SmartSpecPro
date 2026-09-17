"""Contract checks for migration 015 provider safety."""

from pathlib import Path


def test_migration_015_changes_only_new_state_default():
    migration_path = Path(__file__).resolve().parents[3] / "migrations" / "015_keep_pgvector_active_until_cutover.py"
    content = migration_path.read_text(encoding="utf-8")

    assert "SET DEFAULT 'pgvector'" in content
    assert "Existing switch-state rows are intentionally not modified" in content
    assert "UPDATE library_provider_switch_states" not in content
