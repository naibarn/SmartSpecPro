"""
Initialize database with marketplace tables
Run this script to create marketplace tables in your database
"""

import asyncio
import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from app.core.database import init_db, sanitize_db_url
from app.core.config import settings
import structlog

logger = structlog.get_logger()


async def main():
    """Initialize database with all tables including marketplace"""
    try:
        logger.info("Starting database initialization...")
        logger.info(f"Database URL: {sanitize_db_url(settings.DATABASE_URL)}")

        # Initialize database
        await init_db()

        logger.info("✅ Database initialization completed successfully!")
        logger.info("Marketplace tables created:")
        logger.info("  - marketplace_templates")
        logger.info("  - template_purchases")
        logger.info("  - template_reviews")
        logger.info("  - template_revenue_ledger")

    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
