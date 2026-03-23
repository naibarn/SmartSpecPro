"""Celery Beat task for daily confidence decay of agent memories."""

import asyncio
import logging

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="agency.decay_agent_memories", bind=True, max_retries=1)
def decay_agent_memories(self):
    """Run confidence decay on all active agent memories.

    Scheduled daily at 4:00 AM UTC via Celery Beat.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    result = loop.run_until_complete(_run_decay())
    logger.info("memory_decay_complete", extra=result)
    return result


async def _run_decay():
    from app.core.database import AsyncSessionLocal
    from app.services.long_term_memory import LongTermMemoryService

    async with AsyncSessionLocal() as session:
        service = LongTermMemoryService(db_session=session)
        return await service.decay_memories()
