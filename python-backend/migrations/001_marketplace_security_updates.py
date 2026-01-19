"""
Marketplace Security Updates Migration
Date: 2026-01-19
Description: Applies security fixes including indexes and unique constraints

Changes:
- Add performance indexes to marketplace_templates
- Add unique constraint to template_purchases (prevent duplicate purchases)
- Add indexes for analytics queries
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
    """Apply migration"""
    logger.info("Starting marketplace security updates migration...")

    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            # Create indexes for marketplace_templates
            logger.info("Creating performance indexes on marketplace_templates...")

            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_template_creator_revenue
                ON marketplace_templates(creator_id, total_revenue_credits)
            """))

            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_template_purchase_count
                ON marketplace_templates(purchase_count DESC)
            """))

            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_template_rating
                ON marketplace_templates(rating_average DESC, rating_count)
            """))

            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_template_status_submitted
                ON marketplace_templates(status, submitted_at DESC)
            """))

            logger.info("Performance indexes created successfully")

            # Add unique constraint to template_purchases
            logger.info("Adding unique constraint to template_purchases...")

            # Check for existing duplicates before adding constraint
            check_duplicates = await session.execute(text("""
                SELECT buyer_id, template_id, COUNT(*) as count
                FROM template_purchases
                GROUP BY buyer_id, template_id
                HAVING COUNT(*) > 1
            """))

            duplicates = check_duplicates.fetchall()

            if duplicates:
                logger.warning(f"Found {len(duplicates)} duplicate purchases")
                logger.warning("Duplicate purchases:")
                for dup in duplicates:
                    logger.warning(f"  buyer_id={dup[0]}, template_id={dup[1]}, count={dup[2]}")

                # Keep only the first purchase, delete duplicates
                for buyer_id, template_id, _ in duplicates:
                    logger.info(f"Removing duplicate purchases for buyer={buyer_id}, template={template_id}")
                    await session.execute(text("""
                        DELETE FROM template_purchases
                        WHERE id NOT IN (
                            SELECT MIN(id)
                            FROM template_purchases
                            WHERE buyer_id = :buyer_id AND template_id = :template_id
                        )
                        AND buyer_id = :buyer_id AND template_id = :template_id
                    """), {"buyer_id": buyer_id, "template_id": template_id})

            # Add unique constraint
            await session.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_buyer_template
                ON template_purchases(buyer_id, template_id)
            """))

            logger.info("Unique constraint added successfully")

            # Commit all changes
            await session.commit()
            logger.info("Migration completed successfully!")

        except Exception as e:
            await session.rollback()
            logger.error(f"Migration failed: {e}")
            raise
        finally:
            await engine.dispose()


async def downgrade():
    """Rollback migration"""
    logger.info("Rolling back marketplace security updates migration...")

    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            # Drop indexes
            logger.info("Dropping performance indexes...")

            await session.execute(text("DROP INDEX IF EXISTS idx_template_creator_revenue"))
            await session.execute(text("DROP INDEX IF EXISTS idx_template_purchase_count"))
            await session.execute(text("DROP INDEX IF EXISTS idx_template_rating"))
            await session.execute(text("DROP INDEX IF EXISTS idx_template_status_submitted"))

            # Drop unique constraint
            logger.info("Dropping unique constraint...")
            await session.execute(text("DROP INDEX IF EXISTS uq_purchase_buyer_template"))

            await session.commit()
            logger.info("Rollback completed successfully!")

        except Exception as e:
            await session.rollback()
            logger.error(f"Rollback failed: {e}")
            raise
        finally:
            await engine.dispose()


async def check_migration_status():
    """Check if migration has been applied"""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            # Check for one of the indexes
            result = await session.execute(text("""
                SELECT name FROM sqlite_master
                WHERE type='index' AND name='idx_template_creator_revenue'
            """))

            index_exists = result.fetchone() is not None

            if index_exists:
                logger.info("Migration has already been applied")
            else:
                logger.info("Migration has not been applied yet")

            return index_exists

        finally:
            await engine.dispose()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "upgrade":
            asyncio.run(upgrade())
        elif command == "downgrade":
            asyncio.run(downgrade())
        elif command == "status":
            asyncio.run(check_migration_status())
        else:
            print("Usage: python 001_marketplace_security_updates.py [upgrade|downgrade|status]")
    else:
        # Default to upgrade
        asyncio.run(upgrade())
