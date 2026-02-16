"""Unit checks for migration 007 (library backfill campaign table)."""

from pathlib import Path


def test_migration_007_exists_with_campaign_contract():
    migration_path = Path("migrations/007_library_backfill_campaign.py")
    assert migration_path.exists()

    content = migration_path.read_text(encoding="utf-8")
    assert "library_backfill_campaigns" in content
    assert "queued_count" in content
    assert "processed_count" in content
    assert "succeeded_count" in content
    assert "failed_count" in content
    assert "skipped_count" in content
    assert "CREATE TABLE IF NOT EXISTS" in content
    assert "DROP TABLE IF EXISTS" in content
