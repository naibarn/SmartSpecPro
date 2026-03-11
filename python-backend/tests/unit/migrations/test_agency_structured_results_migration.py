"""Unit checks for migration 012 (agency structured-result persistence)."""

from pathlib import Path


def test_migration_012_exists_with_structured_result_contract():
    migration_path = Path(__file__).resolve().parents[3] / "migrations" / "012_agency_structured_results.py"
    assert migration_path.exists()

    content = migration_path.read_text(encoding="utf-8")
    assert "ALTER TABLE agency_runs " in content
    assert "ADD COLUMN IF NOT EXISTS structured_result JSON" in content
    assert "structured_result_parse_status" in content
    assert "structured_result_intent" in content
    assert "structured_result_summary" in content
    assert "structured_result_error" in content
    assert "CREATE TABLE IF NOT EXISTS agency_run_artifacts" in content
    assert "commit_token VARCHAR(64) NOT NULL UNIQUE" in content
    assert "CREATE INDEX IF NOT EXISTS agency_run_artifacts_run_idx" in content
    assert "CREATE INDEX IF NOT EXISTS agency_run_artifacts_conversation_idx" in content
    assert "CREATE INDEX IF NOT EXISTS agency_run_artifacts_tenant_idx" in content
    assert "DROP TABLE IF EXISTS agency_run_artifacts" in content
    assert "downgrade" in content
