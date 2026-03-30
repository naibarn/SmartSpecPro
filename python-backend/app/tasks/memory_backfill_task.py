"""Celery task for backfilling agency memory embeddings (per-tenant)."""

from __future__ import annotations

import asyncio
import logging

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

BACKFILL_BATCH_SIZE = 100
REDIS_LOCK_KEY = "agency:backfill_embeddings:running"
REDIS_LOCK_TTL = 3600  # 1 hour max


@celery_app.task(name="agency.backfill_memory_embeddings", bind=True, max_retries=1)
def backfill_memory_embeddings(self, tenant_id: str | None = None):
    """Generate embeddings for existing active memories missing vectors.

    Args:
        tenant_id: If provided, only process this tenant. Otherwise iterate all tenants.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    result = loop.run_until_complete(_run_backfill(tenant_id=tenant_id))
    logger.info("memory_backfill_complete", extra=result)
    return result


async def _run_backfill(tenant_id: str | None = None) -> dict:
    """Batch-generate missing agency memory embeddings with per-tenant scoping."""
    from app.core.database import AsyncSessionLocal
    from app.services.embedding_service import get_embedding_service
    from app.services.long_term_memory import LongTermMemoryService

    # Redis-based concurrency lock to prevent duplicate runs
    try:
        import redis
        from app.core.config import settings
        r = redis.Redis.from_url(settings.REDIS_URL or "redis://localhost:6379/0")
        if not r.set(REDIS_LOCK_KEY, "1", nx=True, ex=REDIS_LOCK_TTL):
            logger.info("backfill_skipped_already_running")
            return {"processed": 0, "errors": 0, "batches": 0, "skipped_reason": "already_running"}
    except Exception:
        r = None  # Proceed without lock if Redis unavailable

    try:
        if tenant_id:
            # Single tenant mode
            async with AsyncSessionLocal() as session:
                service = LongTermMemoryService(
                    db_session=session,
                    embedding_service=get_embedding_service(),
                )
                return await service.backfill_missing_embeddings(
                    batch_size=BACKFILL_BATCH_SIZE, tenant_id=tenant_id,
                )
        else:
            # Global mode: iterate distinct tenants
            from sqlalchemy import select, distinct
            from app.models.agency_agent_memories import AgencyAgentMemory

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(distinct(AgencyAgentMemory.tenant_id))
                    .where(AgencyAgentMemory.embedding.is_(None))
                    .where(AgencyAgentMemory.is_active == True)
                )
                tenant_ids = [row[0] for row in result.all()]

            total = {"processed": 0, "errors": 0, "batches": 0, "tenants_processed": 0}
            for tid in tenant_ids:
                async with AsyncSessionLocal() as session:
                    service = LongTermMemoryService(
                        db_session=session,
                        embedding_service=get_embedding_service(),
                    )
                    tenant_result = await service.backfill_missing_embeddings(
                        batch_size=BACKFILL_BATCH_SIZE, tenant_id=tid,
                    )
                    if tenant_result.get("skipped_reason"):
                        continue
                    total["processed"] += tenant_result.get("processed", 0)
                    total["errors"] += tenant_result.get("errors", 0)
                    total["batches"] += tenant_result.get("batches", 0)
                    total["tenants_processed"] += 1

            return total
    finally:
        if r:
            try:
                r.delete(REDIS_LOCK_KEY)
            except Exception:
                pass
