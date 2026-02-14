"""
OAuth Connection Extensions for Google Drive Integration
Date: 2026-02-14
Description: Adds status, scopes, and tenant_id columns to oauth_connections.
             Adds unique constraint on (user_id, provider).

Changes:
- Add 'status' column (varchar(20), default 'active')
- Add 'scopes' column (text, nullable)
- Add 'tenant_id' column (varchar(36), nullable)
- Add unique index on (user_id, provider)
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
    """Apply migration — add Google Drive columns to oauth_connections."""
    logger.info("Starting OAuth Drive extensions migration...")

    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            # Add status column with default 'active'
            logger.info("Adding status column to oauth_connections...")
            await session.execute(text("""
                ALTER TABLE oauth_connections
                ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
            """))

            # Add scopes column
            logger.info("Adding scopes column to oauth_connections...")
            await session.execute(text("""
                ALTER TABLE oauth_connections
                ADD COLUMN IF NOT EXISTS scopes TEXT
            """))

            # Add tenant_id column
            logger.info("Adding tenant_id column to oauth_connections...")
            await session.execute(text("""
                ALTER TABLE oauth_connections
                ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36)
            """))

            # Add unique constraint on (user_id, provider)
            logger.info("Adding unique constraint on (user_id, provider)...")
            await session.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_connections_user_provider
                ON oauth_connections (user_id, provider)
            """))

            await session.commit()
            logger.info("OAuth Drive extensions migration completed successfully.")

        except Exception as e:
            await session.rollback()
            logger.error(f"Migration failed: {e}")
            raise

    await engine.dispose()


async def downgrade():
    """Reverse migration — remove added columns and constraint."""
    logger.info("Reverting OAuth Drive extensions migration...")

    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            await session.execute(text("""
                DROP INDEX IF EXISTS uq_oauth_connections_user_provider
            """))
            await session.execute(text("""
                ALTER TABLE oauth_connections DROP COLUMN IF EXISTS tenant_id
            """))
            await session.execute(text("""
                ALTER TABLE oauth_connections DROP COLUMN IF EXISTS scopes
            """))
            await session.execute(text("""
                ALTER TABLE oauth_connections DROP COLUMN IF EXISTS status
            """))

            await session.commit()
            logger.info("OAuth Drive extensions migration reverted successfully.")

        except Exception as e:
            await session.rollback()
            logger.error(f"Downgrade failed: {e}")
            raise

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())
