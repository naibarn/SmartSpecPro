"""Unit tests for pgvector tenant RLS migration helpers (Section 04)."""

from importlib import util
from pathlib import Path

import pytest

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[3] / "migrations" / "006_pgvector_tenant_rls.py"
)
_SPEC = util.spec_from_file_location("migration_006_pgvector_tenant_rls", _MIGRATION_PATH)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError("Unable to load migration spec for 006_pgvector_tenant_rls.py")
migration = util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(migration)


@pytest.mark.unit
class TestPgvectorTenantRlsMigration:
    def test_upgrade_sql_creates_extension_table_indexes_and_rls(self):
        statements = migration.build_upgrade_sql()
        joined = "\n".join(statements)

        assert "CREATE EXTENSION IF NOT EXISTS vector" in joined
        assert "CREATE TABLE IF NOT EXISTS library_chunk_vectors" in joined
        assert "embedding vector(384)" in joined
        assert "ENABLE ROW LEVEL SECURITY" in joined
        assert "FORCE ROW LEVEL SECURITY" in joined
        assert "CREATE INDEX IF NOT EXISTS ix_library_chunk_vectors_embedding_hnsw" in joined
        assert "CREATE POLICY library_chunk_vectors_tenant_select" in joined
        assert "CREATE POLICY library_chunk_vectors_tenant_insert" in joined
        assert "CREATE POLICY library_chunk_vectors_tenant_update" in joined
        assert "CREATE POLICY library_chunk_vectors_tenant_delete" in joined

    def test_preflight_fails_when_extension_privilege_is_missing(self):
        snapshot = {
            "can_create_extension": False,
            "capacity_headroom_bytes": 10 * 1024 * 1024 * 1024,
            "server_version_num": 150000,
        }

        with pytest.raises(RuntimeError, match="create_extension_privilege_missing"):
            migration.assert_preflight_ok(snapshot)

    def test_preflight_fails_when_capacity_headroom_is_below_threshold(self):
        snapshot = {
            "can_create_extension": True,
            "capacity_headroom_bytes": 256 * 1024 * 1024,
            "server_version_num": 150000,
        }

        with pytest.raises(RuntimeError, match="insufficient_capacity_headroom"):
            migration.assert_preflight_ok(snapshot, min_capacity_headroom_bytes=1024 * 1024 * 1024)

    def test_verification_detects_missing_objects_and_policy_drift(self):
        bad_snapshot = {
            "extension_present": True,
            "table_present": True,
            "index_presence": {
                "ix_library_chunk_vectors_tenant_item": True,
                "ix_library_chunk_vectors_embedding_hnsw": False,
            },
            "embedding_dimensions": 384,
            "expected_embedding_dimensions": 384,
            "rls_enabled": True,
            "policy_names": {
                "library_chunk_vectors_tenant_select",
                "library_chunk_vectors_tenant_insert",
            },
        }

        with pytest.raises(RuntimeError, match="missing_indexes"):
            migration.assert_verification_ok(bad_snapshot)

    def test_verification_detects_embedding_dimension_drift(self):
        bad_snapshot = {
            "extension_present": True,
            "table_present": True,
            "index_presence": {
                "ix_library_chunk_vectors_tenant_item": True,
                "ix_library_chunk_vectors_embedding_hnsw": True,
            },
            "embedding_dimensions": 1536,
            "expected_embedding_dimensions": 384,
            "rls_enabled": True,
            "policy_names": {
                "library_chunk_vectors_tenant_select",
                "library_chunk_vectors_tenant_insert",
                "library_chunk_vectors_tenant_update",
                "library_chunk_vectors_tenant_delete",
            },
        }

        with pytest.raises(RuntimeError, match="embedding_dimension_drift"):
            migration.assert_verification_ok(bad_snapshot)

    def test_rollback_sql_drops_table_indexes_and_policies(self):
        statements = migration.build_rollback_sql(drop_extension=False)
        joined = "\n".join(statements)

        assert "DROP POLICY IF EXISTS library_chunk_vectors_tenant_select" in joined
        assert "DROP POLICY IF EXISTS library_chunk_vectors_tenant_insert" in joined
        assert "DROP POLICY IF EXISTS library_chunk_vectors_tenant_update" in joined
        assert "DROP POLICY IF EXISTS library_chunk_vectors_tenant_delete" in joined
        assert "DROP TABLE IF EXISTS library_chunk_vectors" in joined
        assert "DROP EXTENSION IF EXISTS vector" not in joined

    def test_rls_validation_queries_cover_allow_and_deny_cases(self):
        queries = migration.build_rls_validation_queries()

        allow = queries["allow_same_tenant_select"]
        deny = queries["deny_cross_tenant_select"]

        assert "app.current_tenant_id" in allow
        assert "app.current_tenant_id" in deny
        assert "tenant-alpha" in allow
        assert "tenant-beta" in deny
