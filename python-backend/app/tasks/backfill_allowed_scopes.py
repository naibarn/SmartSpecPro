"""
Backfill allowed_scopes for existing library items.

Computes and sets allowed_scopes on library_items and library_chunks
that have NULL or empty allowed_scopes. Processes in batches to limit
memory and lock duration.

Usage:
    from app.tasks.backfill_allowed_scopes import backfill_allowed_scopes
    result = await backfill_allowed_scopes(tenant_id="optional-filter")
"""

from __future__ import annotations

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.orchestrator.rag.scope_engine import recompute_allowed_scopes

logger = structlog.get_logger()


async def backfill_allowed_scopes(
    session: AsyncSession,
    tenant_id: str | None = None,
    batch_size: int = 100,
) -> dict[str, int]:
    """
    Backfill allowed_scopes for existing library items.

    Finds items where allowed_scopes is NULL or empty, then calls
    recompute_allowed_scopes() for each. That function updates both
    the item and all its chunks.

    Args:
        session: An async SQLAlchemy session.
        tenant_id: If provided, only backfill items in this tenant.
        batch_size: Number of items to process per batch.

    Returns:
        {"items_updated": N, "chunks_updated": M}
    """
    # Build query for items needing backfill
    where_clause = "deleted_at IS NULL AND (allowed_scopes IS NULL OR allowed_scopes = '{}')"
    params: dict = {}

    if tenant_id is not None:
        where_clause += " AND tenant_id = :tenant_id"
        params["tenant_id"] = tenant_id

    items_updated = 0
    chunks_updated = 0

    while True:
        # Fetch a batch of item IDs
        batch_query = text(
            f"SELECT id FROM library_items WHERE {where_clause} "
            f"ORDER BY id LIMIT :batch_size"
        )
        params["batch_size"] = batch_size
        result = await session.execute(batch_query, params)
        item_ids = result.scalars().all()

        if not item_ids:
            break

        for item_id in item_ids:
            scopes = await recompute_allowed_scopes(item_id, session)
            if scopes:
                items_updated += 1
                # Count chunks updated for this item
                chunk_count_result = await session.execute(
                    text(
                        "SELECT COUNT(*) FROM library_chunks "
                        "WHERE library_item_id = :item_id"
                    ),
                    {"item_id": item_id},
                )
                chunks_updated += chunk_count_result.scalar() or 0

        await session.commit()

        logger.info(
            "backfill_batch_complete",
            batch_items=len(item_ids),
            total_items_updated=items_updated,
            total_chunks_updated=chunks_updated,
        )

        # If we got fewer than batch_size, we're done
        if len(item_ids) < batch_size:
            break

    logger.info(
        "backfill_complete",
        items_updated=items_updated,
        chunks_updated=chunks_updated,
        tenant_id=tenant_id,
    )

    return {"items_updated": items_updated, "chunks_updated": chunks_updated}
