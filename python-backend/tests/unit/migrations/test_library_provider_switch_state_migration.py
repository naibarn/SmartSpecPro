"""Unit checks for migration 008 (provider switch-state governance table)."""

from pathlib import Path


def test_migration_008_exists_with_switch_state_contract():
    migration_path = Path("migrations/008_library_provider_switch_state.py")
    assert migration_path.exists()

    content = migration_path.read_text(encoding="utf-8")
    assert "library_provider_switch_states" in content
    assert "current_read_provider" in content
    assert "target_provider" in content
    assert "switch_version" in content
    assert "freeze_non_emergency_edits" in content
    assert "mirror_writes" in content
    assert "CREATE TABLE IF NOT EXISTS" in content
    assert "DROP TABLE IF EXISTS" in content
