"""
Add cloud_task_id column to media_tasks table.
Date: 2026-02-15
Description: Adds cloud_task_id column for Cloud Tasks tracking correlation.

Changes:
- Add 'cloud_task_id' column (varchar(512), nullable, indexed)
"""

import asyncio
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def upgrade():
    """Apply migration — add cloud_task_id to media_tasks."""
    logger.info("Starting cloud_task_id migration...")

    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            logger.info("Adding cloud_task_id column to media_tasks...")
            await session.execute(text("""
                ALTER TABLE media_tasks
                ADD COLUMN IF NOT EXISTS cloud_task_id VARCHAR(512)
            """))

            logger.info("Creating index on cloud_task_id...")
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_media_tasks_cloud_task_id
                ON media_tasks (cloud_task_id)
            """))

            await session.commit()
            logger.info("cloud_task_id migration completed successfully.")

        except Exception as e:
            await session.rollback()
            logger.error(f"Migration failed: {e}")
            raise

    await engine.dispose()


async def downgrade():
    """Reverse migration — remove cloud_task_id column."""
    logger.info("Reverting cloud_task_id migration...")

    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            await session.execute(text("""
                DROP INDEX IF EXISTS ix_media_tasks_cloud_task_id
            """))
            await session.execute(text("""
                ALTER TABLE media_tasks DROP COLUMN IF EXISTS cloud_task_id
            """))

            await session.commit()
            logger.info("cloud_task_id migration reverted successfully.")

        except Exception as e:
            await session.rollback()
            logger.error(f"Downgrade failed: {e}")
            raise

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
