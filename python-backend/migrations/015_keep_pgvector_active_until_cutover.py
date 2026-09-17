"""Migration 015: keep new provider-switch state conservative by default.

Existing switch-state rows are intentionally not modified. A later, explicit
cutover operation is the only operation allowed to change their read provider.
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
    """Change only the default for newly created switch-state rows."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with async_session() as session:
            await session.execute(
                text(
                    """
                    ALTER TABLE library_provider_switch_states
                    ALTER COLUMN current_read_provider SET DEFAULT 'pgvector'
                    """
                )
            )
            await session.commit()
            logger.info("pgvector_default_provider_migration_upgraded")
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """Restore the previous default without changing existing state rows."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with async_session() as session:
            await session.execute(
                text(
                    """
                    ALTER TABLE library_provider_switch_states
                    ALTER COLUMN current_read_provider SET DEFAULT 'cloudflare_vectorize'
                    """
                )
            )
            await session.commit()
            logger.info("pgvector_default_provider_migration_downgraded")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
