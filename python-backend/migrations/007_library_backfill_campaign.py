"""
Migration 007: add persistent backfill campaign checkpoint table.

Adds:
- library_backfill_campaigns table for resumable campaign state
- indexes for domain/status and tenant/domain scans
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
    """Apply migration 007."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS library_backfill_campaigns (
                        id SERIAL PRIMARY KEY,
                        tenant_id VARCHAR(36),
                        domain VARCHAR(16) NOT NULL DEFAULT 'library',
                        status VARCHAR(24) NOT NULL DEFAULT 'queued',
                        cursor INTEGER NOT NULL DEFAULT 0,
                        queued_count INTEGER NOT NULL DEFAULT 0,
                        processed_count INTEGER NOT NULL DEFAULT 0,
                        succeeded_count INTEGER NOT NULL DEFAULT 0,
                        failed_count INTEGER NOT NULL DEFAULT 0,
                        skipped_count INTEGER NOT NULL DEFAULT 0,
                        checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
                        diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
                        last_error TEXT,
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
                    CREATE INDEX IF NOT EXISTS ix_library_backfill_campaign_domain_status
                    ON library_backfill_campaigns (domain, status)
                    """
                )
            )
            await session.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_library_backfill_campaign_tenant_domain
                    ON library_backfill_campaigns (tenant_id, domain)
                    """
                )
            )
            await session.commit()
            logger.info("library_backfill_campaign_migration_upgraded")
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """Rollback migration 007."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(
                text(
                    """
                    DROP INDEX IF EXISTS ix_library_backfill_campaign_tenant_domain
                    """
                )
            )
            await session.execute(
                text(
                    """
                    DROP INDEX IF EXISTS ix_library_backfill_campaign_domain_status
                    """
                )
            )
            await session.execute(
                text(
                    """
                    DROP TABLE IF EXISTS library_backfill_campaigns
                    """
                )
            )
            await session.commit()
            logger.info("library_backfill_campaign_migration_downgraded")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
