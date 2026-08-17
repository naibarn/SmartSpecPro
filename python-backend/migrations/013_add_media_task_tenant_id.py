"""Add tenant isolation to legacy provider media tasks.

The column is nullable for historical rows. New authenticated task creation
and user-facing history endpoints require the verified request tenant, so old
unscoped rows are not exposed through tenant-scoped MCP/history calls.
"""

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def upgrade() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        try:
            await session.execute(text("""
                ALTER TABLE media_tasks
                ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36)
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_media_tasks_tenant_id
                ON media_tasks (tenant_id)
            """))
            await session.commit()
            logger.info("media task tenant isolation migration completed")
        except Exception:
            await session.rollback()
            logger.exception("media task tenant isolation migration failed")
            raise
    await engine.dispose()


async def downgrade() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        try:
            await session.execute(text("DROP INDEX IF EXISTS ix_media_tasks_tenant_id"))
            await session.execute(text("ALTER TABLE media_tasks DROP COLUMN IF EXISTS tenant_id"))
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("media task tenant isolation migration rollback failed")
            raise
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
