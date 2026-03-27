"""Celery beat task for purging expired agency memory data."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="agency.purge_expired_memories", bind=True, max_retries=1)
def purge_expired_memories(self):
    """Run daily hard-delete cleanup for expired agency memory data."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    result = loop.run_until_complete(_run_purge())
    logger.info("memory_purge_complete", extra=result)
    return result


async def _run_purge() -> dict[str, int]:
    """Delete expired memory records and return deletion counts."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        memories_result = await session.execute(
            text(
                'DELETE FROM agency_agent_memories '
                'WHERE "isActive" = false AND "updatedAt" < NOW() - INTERVAL \'30 days\''
            )
        )
        chunks_result = await session.execute(
            text('DELETE FROM agency_memory_chunks WHERE "expiresAt" < NOW()')
        )
        traces_result = await session.execute(
            text(
                'DELETE FROM agency_run_traces '
                'WHERE "createdAt" < NOW() - INTERVAL \'30 days\''
            )
        )

        await session.commit()

        return {
            "memories_purged": memories_result.rowcount or 0,
            "chunks_purged": chunks_result.rowcount or 0,
            "traces_purged": traces_result.rowcount or 0,
        }
