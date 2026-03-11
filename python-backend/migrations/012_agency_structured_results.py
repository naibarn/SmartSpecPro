"""
Migration 012: Add structured-result persistence and agency_run_artifacts.

Adds nullable structured-result columns to agency_runs and creates the
agency_run_artifacts table for run-scoped preview tracking.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)


async def upgrade() -> None:
    """Apply migration 012."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(text(
                "ALTER TABLE agency_runs "
                "ADD COLUMN IF NOT EXISTS structured_result JSON"
            ))
            await session.execute(text(
                "ALTER TABLE agency_runs "
                "ADD COLUMN IF NOT EXISTS structured_result_parse_status VARCHAR(20)"
            ))
            await session.execute(text(
                "ALTER TABLE agency_runs "
                "ADD COLUMN IF NOT EXISTS structured_result_intent VARCHAR(50)"
            ))
            await session.execute(text(
                "ALTER TABLE agency_runs "
                "ADD COLUMN IF NOT EXISTS structured_result_summary TEXT"
            ))
            await session.execute(text(
                "ALTER TABLE agency_runs "
                "ADD COLUMN IF NOT EXISTS structured_result_error TEXT"
            ))
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS agency_run_artifacts (
                    id VARCHAR(36) PRIMARY KEY,
                    run_id VARCHAR(36) NOT NULL,
                    conversation_id VARCHAR(36) NOT NULL,
                    agency_id VARCHAR(36) NOT NULL,
                    tenant_id VARCHAR(36) NOT NULL,
                    artifact_type VARCHAR(50) NOT NULL,
                    intent VARCHAR(50) NOT NULL,
                    state VARCHAR(32) NOT NULL DEFAULT 'preview_generated',
                    summary TEXT,
                    payload_json JSON,
                    payload_storage_key VARCHAR(255),
                    provenance_json JSON,
                    commit_status VARCHAR(32) NOT NULL DEFAULT 'not_committed',
                    commit_token VARCHAR(64) NOT NULL UNIQUE,
                    target_type VARCHAR(64),
                    target_id VARCHAR(128),
                    committed_at TIMESTAMPTZ,
                    expired_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """))
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS agency_run_artifacts_run_idx "
                "ON agency_run_artifacts (run_id)"
            ))
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS agency_run_artifacts_conversation_idx "
                "ON agency_run_artifacts (conversation_id)"
            ))
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS agency_run_artifacts_tenant_idx "
                "ON agency_run_artifacts (tenant_id)"
            ))
            await session.commit()
            logger.info("migration_012_agency_structured_results_upgraded")
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """Rollback migration 012."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(text("DROP TABLE IF EXISTS agency_run_artifacts"))
            await session.execute(text(
                "ALTER TABLE agency_runs DROP COLUMN IF EXISTS structured_result_error"
            ))
            await session.execute(text(
                "ALTER TABLE agency_runs DROP COLUMN IF EXISTS structured_result_summary"
            ))
            await session.execute(text(
                "ALTER TABLE agency_runs DROP COLUMN IF EXISTS structured_result_intent"
            ))
            await session.execute(text(
                "ALTER TABLE agency_runs DROP COLUMN IF EXISTS structured_result_parse_status"
            ))
            await session.execute(text(
                "ALTER TABLE agency_runs DROP COLUMN IF EXISTS structured_result"
            ))
            await session.commit()
            logger.info("migration_012_agency_structured_results_downgraded")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
