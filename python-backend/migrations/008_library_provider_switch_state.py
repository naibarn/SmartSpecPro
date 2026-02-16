"""
Migration 008: add provider switch-state governance table.

Adds:
- library_provider_switch_states table for staged cutover and rollback governance
- indexes for tenant/status and campaign/status scans
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
    """Apply migration 008."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS library_provider_switch_states (
                        id SERIAL PRIMARY KEY,
                        tenant_id VARCHAR(36),
                        current_read_provider VARCHAR(64) NOT NULL DEFAULT 'cloudflare_vectorize',
                        target_provider VARCHAR(64),
                        previous_read_provider VARCHAR(64),
                        campaign_id INTEGER,
                        campaign_status VARCHAR(24) NOT NULL DEFAULT 'idle',
                        status VARCHAR(24) NOT NULL DEFAULT 'idle',
                        switch_version INTEGER NOT NULL DEFAULT 1,
                        readiness_gate VARCHAR(64) NOT NULL DEFAULT 'coverage_95_plus_smoke',
                        freeze_non_emergency_edits BOOLEAN NOT NULL DEFAULT FALSE,
                        mirror_writes BOOLEAN NOT NULL DEFAULT FALSE,
                        readiness JSONB NOT NULL DEFAULT '{}'::jsonb,
                        reconciliation JSONB NOT NULL DEFAULT '{}'::jsonb,
                        last_rollback_reason TEXT,
                        started_at TIMESTAMPTZ NULL,
                        completed_at TIMESTAMPTZ NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )
            await session.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_library_provider_switch_state_tenant_status
                    ON library_provider_switch_states (tenant_id, status)
                    """
                )
            )
            await session.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_library_provider_switch_state_campaign
                    ON library_provider_switch_states (campaign_status, status)
                    """
                )
            )
            await session.commit()
            logger.info("library_provider_switch_state_migration_upgraded")
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """Rollback migration 008."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(
                text(
                    """
                    DROP INDEX IF EXISTS ix_library_provider_switch_state_campaign
                    """
                )
            )
            await session.execute(
                text(
                    """
                    DROP INDEX IF EXISTS ix_library_provider_switch_state_tenant_status
                    """
                )
            )
            await session.execute(
                text(
                    """
                    DROP TABLE IF EXISTS library_provider_switch_states
                    """
                )
            )
            await session.commit()
            logger.info("library_provider_switch_state_migration_downgraded")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
