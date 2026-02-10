"""Unit tests for library backfill orchestration service (Section 09)."""

from datetime import datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
from app.models.user import User
from app.services.library_backfill_service import run_library_backfill_batch


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
                ],
            )
        )

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    await engine.dispose()


async def _seed_item(db: AsyncSession, tenant_id: int, suffix: int) -> LibraryItem:
    user = User(email=f"backfill-{tenant_id}-{suffix}@example.com", password="hash", credits=100)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    item = LibraryItem(
        tenant_id=tenant_id,
        owner_user_id=user.id,
        item_type="image",
        source="media_history",
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


@pytest.mark.unit
class TestLibraryBackfillService:
    @pytest.mark.asyncio
    async def test_backfill_dry_run_reports_work_without_writes(self, backfill_db):
        for i in range(3):
            await _seed_item(backfill_db, tenant_id=401, suffix=i)

        result = await run_library_backfill_batch(
            backfill_db,
            tenant_id=401,
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
            await _seed_item(backfill_db, tenant_id=402, suffix=i)

        first = await run_library_backfill_batch(
            backfill_db,
            tenant_id=402,
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
            tenant_id=402,
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
            tenant_id=402,
            cursor=first["next_cursor"],
            batch_size=2,
            dry_run=False,
            paused=False,
            max_enqueue=2,
        )
        assert resumed["enqueued_jobs"] == 2

        restarted = await run_library_backfill_batch(
            backfill_db,
            tenant_id=402,
            cursor=0,
            batch_size=10,
            dry_run=False,
            paused=False,
            max_enqueue=10,
        )
        assert restarted["enqueued_jobs"] == 0

        job_count = await backfill_db.scalar(select(func.count()).select_from(LibraryIndexJob))
        assert job_count == 4

