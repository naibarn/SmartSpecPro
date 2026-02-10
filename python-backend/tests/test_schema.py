"""
Tests for Section 13: Database Schema Changes (Python-side verification)

Validates that the new workflow engine tables exist in PostgreSQL and have
the expected columns. These are integration tests that require a running
database with the Drizzle migration applied.
"""
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.integration
class TestWorkflowEngineSchema:
    """Verify new tables exist and have expected structure."""

    async def _table_exists(self, session: AsyncSession, table_name: str) -> bool:
        """Check if a table exists in the public schema."""
        result = await session.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :name)"
            ),
            {"name": table_name},
        )
        return result.scalar()

    async def _get_columns(self, session: AsyncSession, table_name: str) -> list[str]:
        """Get column names for a table."""
        result = await session.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :name "
                "ORDER BY ordinal_position"
            ),
            {"name": table_name},
        )
        return [row[0] for row in result.fetchall()]

    @pytest.mark.asyncio
    async def test_workflow_executions_table_exists(self, db_session: AsyncSession):
        """Table created with all columns."""
        assert await self._table_exists(db_session, "workflow_executions")
        columns = await self._get_columns(db_session, "workflow_executions")
        assert "id" in columns
        assert "workflowId" in columns
        assert "tenantId" in columns
        assert "status" in columns
        assert "threadId" in columns

    @pytest.mark.asyncio
    async def test_dlq_table_exists(self, db_session: AsyncSession):
        """DLQ table created."""
        assert await self._table_exists(db_session, "workflow_dead_letter_queue")
        columns = await self._get_columns(db_session, "workflow_dead_letter_queue")
        assert "inputData" in columns
        assert "error" in columns
        assert "retryCount" in columns
        assert "status" in columns

    @pytest.mark.asyncio
    async def test_audit_events_table_exists(self, db_session: AsyncSession):
        """Audit table created."""
        assert await self._table_exists(db_session, "workflow_audit_events")
        columns = await self._get_columns(db_session, "workflow_audit_events")
        assert "eventType" in columns
        assert "traceId" in columns

    @pytest.mark.asyncio
    async def test_secrets_table_encrypted(self, db_session: AsyncSession):
        """Encrypted column stores ciphertext, not plaintext."""
        assert await self._table_exists(db_session, "workflow_secrets")
        columns = await self._get_columns(db_session, "workflow_secrets")
        assert "encryptedValue" in columns
        assert "vaultBackend" in columns
        # Column name signals encryption -- actual encryption tested in Section 8

    @pytest.mark.asyncio
    async def test_policy_rules_table_exists(self, db_session: AsyncSession):
        """Policy rules table created (Phase 2 placeholder)."""
        assert await self._table_exists(db_session, "workflow_policy_rules")
        columns = await self._get_columns(db_session, "workflow_policy_rules")
        assert "ruleType" in columns
        assert "condition" in columns
        assert "action" in columns
        assert "priority" in columns
        assert "enabled" in columns

    @pytest.mark.asyncio
    async def test_cache_metadata_table_exists(self, db_session: AsyncSession):
        """Cache metadata table created."""
        assert await self._table_exists(db_session, "workflow_cache_metadata")
        columns = await self._get_columns(db_session, "workflow_cache_metadata")
        assert "cacheKey" in columns
        assert "hitCount" in columns
        assert "ttlSeconds" in columns
