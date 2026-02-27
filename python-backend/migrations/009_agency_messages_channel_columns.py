"""
Migration 009: Add channel metadata columns to agency_messages.

Adds three nullable columns for Chat Bridge integration:
- source_channel: originating channel (web, telegram, system)
- source_connection_id: FK reference to telegram_connections
- external_source_id: external platform message ID

All columns are nullable -- zero risk to existing data.
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
    """Apply migration 009 -- add channel columns to agency_messages."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(text(
                "ALTER TABLE agency_messages "
                "ADD COLUMN IF NOT EXISTS source_channel VARCHAR(20)"
            ))
            await session.execute(text(
                "ALTER TABLE agency_messages "
                "ADD COLUMN IF NOT EXISTS source_connection_id VARCHAR(36)"
            ))
            await session.execute(text(
                "ALTER TABLE agency_messages "
                "ADD COLUMN IF NOT EXISTS external_source_id VARCHAR(64)"
            ))
            await session.commit()
            logger.info("migration_009_agency_messages_channel_columns_upgraded")
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """Rollback migration 009."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(text(
                "ALTER TABLE agency_messages DROP COLUMN IF EXISTS external_source_id"
            ))
            await session.execute(text(
                "ALTER TABLE agency_messages DROP COLUMN IF EXISTS source_connection_id"
            ))
            await session.execute(text(
                "ALTER TABLE agency_messages DROP COLUMN IF EXISTS source_channel"
            ))
            await session.commit()
            logger.info("migration_009_agency_messages_channel_columns_downgraded")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
