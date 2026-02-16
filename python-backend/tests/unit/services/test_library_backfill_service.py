"""Unit tests for library backfill orchestration service (Section 05)."""

from datetime import datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.library import (
    LibraryBackfillCampaign,
    LibraryChunk,
    LibraryIndexJob,
    LibraryItem,
)
from app.models.user import User
from app.services.library_backfill_service import (
    create_backfill_campaign,
    load_backfill_candidates,
    run_backfill_campaign_batch,
    run_library_backfill_batch,
    validate_backfill_consistency,
)


@pytest.fixture
async def backfill_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn,
                tables=[
                    User.__table__,
                    LibraryItem.__table__,
                    LibraryChunk.__table__,
                    LibraryIndexJob.__table__,
                    LibraryBackfillCampaign.__table__,
                ],
            )
        )

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    await engine.dispose()


async def _seed_item(
    db: AsyncSession,
    tenant_id: str,
    suffix: int,
    *,
    source: str = "library_upload",
    item_type: str = "document",
) -> LibraryItem:
    user = User(email=f"backfill-{tenant_id}-{suffix}@example.com", password="hash", credits=100)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    item = LibraryItem(
        tenant_id=tenant_id,
        owner_user_id=user.id,
        item_type=item_type,
        source=source,
        title=f"Backfill Item {suffix}",
        description="seed",
        status="ready",
        visibility="private",
        metadata={"prompt": f"item-{suffix}"},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def _seed_gallery_item(db: AsyncSession, tenant_id: str, suffix: int) -> LibraryItem:
    return await _seed_item(
        db,
        tenant_id=tenant_id,
        suffix=suffix,
        source="media_history",
        item_type="image",
    )


@pytest.mark.unit
class TestLibraryBackfillService:
    @pytest.mark.asyncio
    async def test_scoped_loaders_return_domain_specific_records(self, backfill_db):
        library_item = await _seed_item(backfill_db, tenant_id="tenant-400", suffix=1)
        gallery_item = await _seed_gallery_item(backfill_db, tenant_id="tenant-400", suffix=2)

        library_rows = await load_backfill_candidates(
            backfill_db,
            domain="library",
            tenant_id="tenant-400",
            cursor=0,
            limit=10,
        )
        gallery_rows = await load_backfill_candidates(
            backfill_db,
            domain="gallery",
            tenant_id="tenant-400",
            cursor=0,
            limit=10,
        )

        assert [row["entity_id"] for row in library_rows] == [f"library:{library_item.id}"]
        assert [row["entity_id"] for row in gallery_rows] == [f"gallery:{gallery_item.id}"]

    @pytest.mark.asyncio
    async def test_backfill_dry_run_reports_work_without_writes(self, backfill_db):
        for i in range(3):
            await _seed_item(backfill_db, tenant_id="tenant-401", suffix=i)

        result = await run_library_backfill_batch(
            backfill_db,
            tenant_id="tenant-401",
            cursor=0,
            batch_size=2,
            dry_run=True,
            paused=False,
            max_enqueue=2,
        )

        assert result["dry_run"] is True
        assert result["enqueued_jobs"] == 0
        assert len(result["candidate_item_ids"]) == 2
        assert result["estimated_remaining"] == 3

        jobs_count = await backfill_db.scalar(select(func.count()).select_from(LibraryIndexJob))
        assert jobs_count == 0

    @pytest.mark.asyncio
    async def test_backfill_pause_resume_preserves_cursor_without_duplicates(self, backfill_db):
        for i in range(4):
            await _seed_item(backfill_db, tenant_id="tenant-402", suffix=i)

        first = await run_library_backfill_batch(
            backfill_db,
            tenant_id="tenant-402",
            cursor=0,
            batch_size=2,
            dry_run=False,
            paused=False,
            max_enqueue=2,
        )

        assert first["enqueued_jobs"] == 2
        assert first["next_cursor"] > 0

        paused = await run_library_backfill_batch(
            backfill_db,
            tenant_id="tenant-402",
            cursor=first["next_cursor"],
            batch_size=2,
            dry_run=False,
            paused=True,
            max_enqueue=2,
        )

        assert paused["paused"] is True
        assert paused["enqueued_jobs"] == 0
        assert paused["next_cursor"] == first["next_cursor"]

        resumed = await run_library_backfill_batch(
            backfill_db,
            tenant_id="tenant-402",
            cursor=first["next_cursor"],
            batch_size=2,
            dry_run=False,
            paused=False,
            max_enqueue=2,
        )
        assert resumed["enqueued_jobs"] == 2

        restarted = await run_library_backfill_batch(
            backfill_db,
            tenant_id="tenant-402",
            cursor=0,
            batch_size=10,
            dry_run=False,
            paused=False,
            max_enqueue=10,
        )
        assert restarted["enqueued_jobs"] == 0

        job_count = await backfill_db.scalar(select(func.count()).select_from(LibraryIndexJob))
        assert job_count == 4

    @pytest.mark.asyncio
    async def test_campaign_resume_persists_checkpoint_and_counters(self, backfill_db):
        for i in range(4):
            await _seed_item(backfill_db, tenant_id="tenant-450", suffix=i)

        campaign = await create_backfill_campaign(
            backfill_db,
            domain="library",
            tenant_id="tenant-450",
        )

        first = await run_backfill_campaign_batch(
            backfill_db,
            campaign_id=campaign.id,
            batch_size=2,
            dry_run=False,
            max_enqueue=2,
        )
        second = await run_backfill_campaign_batch(
            backfill_db,
            campaign_id=campaign.id,
            batch_size=2,
            dry_run=False,
            max_enqueue=2,
        )
        third = await run_backfill_campaign_batch(
            backfill_db,
            campaign_id=campaign.id,
            batch_size=2,
            dry_run=False,
            max_enqueue=2,
        )

        assert first["counters"]["processed"] == 2
        assert second["counters"]["processed"] == 4
        assert second["counters"]["succeeded"] == 4
        assert third["counters"]["processed"] == 4
        assert third["status"] == "completed"

        refreshed = await backfill_db.scalar(
            select(LibraryBackfillCampaign).where(LibraryBackfillCampaign.id == campaign.id)
        )
        assert refreshed is not None
        assert refreshed.cursor > 0
        assert refreshed.status == "completed"
        assert refreshed.processed_count == 4
        assert refreshed.succeeded_count == 4

    @pytest.mark.asyncio
    async def test_gallery_campaign_records_actionable_skip_diagnostics(self, backfill_db):
        for i in range(2):
            await _seed_gallery_item(backfill_db, tenant_id="tenant-451", suffix=i)

        campaign = await create_backfill_campaign(
            backfill_db,
            domain="gallery",
            tenant_id="tenant-451",
        )
        result = await run_backfill_campaign_batch(
            backfill_db,
            campaign_id=campaign.id,
            batch_size=2,
            dry_run=False,
            max_enqueue=2,
        )

        assert result["counters"]["processed"] == 2
        assert result["counters"]["skipped"] == 2
        assert result["counters"]["succeeded"] == 0
        assert result["diagnostics"]["skip_reason"] == "gallery_enqueue_not_yet_wired_in_python_worker"

    @pytest.mark.asyncio
    async def test_consistency_validator_reports_divergence_with_diagnostics(self, backfill_db):
        item_a = await _seed_item(backfill_db, tenant_id="tenant-460", suffix=1)
        item_b = await _seed_item(backfill_db, tenant_id="tenant-460", suffix=2)
        item_c = await _seed_item(backfill_db, tenant_id="tenant-460", suffix=3)

        backfill_db.add(
            LibraryChunk(
                tenant_id="tenant-460",
                library_item_id=item_a.id,
                chunk_index=0,
                content="seed",
                content_type="text",
                vector_ref_id="vec:tenant-460:a",
                metadata={},
                created_at=datetime.utcnow(),
            )
        )
        backfill_db.add(
            LibraryChunk(
                tenant_id="tenant-460",
                library_item_id=item_b.id,
                chunk_index=0,
                content="seed",
                content_type="text",
                vector_ref_id=None,
                metadata={},
                created_at=datetime.utcnow(),
            )
        )
        await backfill_db.commit()

        report = await validate_backfill_consistency(
            backfill_db,
            domain="library",
            tenant_id="tenant-460",
            tolerance=0.1,
        )

        assert report["passed"] is False
        assert report["source_count"] == 3
        assert report["indexed_count"] == 1
        assert report["missing_count"] == 2
        assert f"library:{item_c.id}" in report["missing_entities"]
