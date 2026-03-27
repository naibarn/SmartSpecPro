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
    from sqlalchemy import select, distinct
    from app.core.database import AsyncSessionLocal
    from app.models.agency_agent_memories import AgencyAgentMemory
    from app.services.long_term_memory import LongTermMemoryService

    # Iterate per-tenant for isolation
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(distinct(AgencyAgentMemory.tenant_id))
            .where(AgencyAgentMemory.is_active == True)
        )
        tenant_ids = [row[0] for row in result.all()]

    total = {"decayed": 0, "deactivated": 0, "tenants_processed": 0, "tenants_skipped": 0}
    for tid in tenant_ids:
        # Skip tenants with long-term memory disabled
        try:
            from app.services.agentic_feature_flags import check_agentic_flag
            async with AsyncSessionLocal() as flag_session:
                flag_enabled = await check_agentic_flag("agencyLongTermMemoryEnabled", tid)
            if not flag_enabled:
                total["tenants_skipped"] += 1
                continue
        except Exception:
            pass  # Proceed if flag check fails — decay is safe even when disabled

        async with AsyncSessionLocal() as session:
            service = LongTermMemoryService(db_session=session)
            tenant_result = await service.decay_memories(tenant_id=tid)
            total["decayed"] += tenant_result.get("decayed", 0)
            total["deactivated"] += tenant_result.get("deactivated", 0)
            total["tenants_processed"] += 1

    return total
