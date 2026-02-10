"""Unit tests for library schema models (Section 02)."""

from datetime import datetime

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.library import (
    LibraryChunk,
    LibraryIndexJob,
    LibraryItem,
    LibraryLink,
    LibraryPermission,
)
from app.models.user import User


@pytest.fixture
async def library_db():
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
                    LibraryLink.__table__,
                    LibraryPermission.__table__,
                    LibraryIndexJob.__table__,
                ],
            )
        )

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.mark.unit
class TestLibraryModels:
    @pytest.mark.asyncio
    async def test_library_tables_created(self, library_db):
        names = await library_db.run_sync(lambda sync_sess: inspect(sync_sess.bind).get_table_names())

        assert "library_items" in names
        assert "library_chunks" in names
        assert "library_links" in names
        assert "library_permissions" in names
        assert "library_index_jobs" in names

    @pytest.mark.asyncio
    async def test_library_item_soft_delete_and_status_transition(self, library_db):
        user = User(email="lib-owner@example.com", password="hash", credits=100)
        library_db.add(user)
        await library_db.commit()
        await library_db.refresh(user)

        item = LibraryItem(
            tenant_id=101,
            owner_user_id=user.id,
            item_type="image",
            source="media_history",
            title="Cover image",
            status="ready",
            visibility="private",
            metadata={"model": "nano-banana"},
        )
        library_db.add(item)
        await library_db.commit()
        await library_db.refresh(item)

        assert item.status == "ready"
        assert item.deleted_at is None

        item.status = "archived"
        item.deleted_at = datetime.utcnow()
        await library_db.commit()
        await library_db.refresh(item)

        assert item.status == "archived"
        assert item.deleted_at is not None

    @pytest.mark.asyncio
    async def test_library_link_unique_constraint(self, library_db):
        user = User(email="lib-link@example.com", password="hash", credits=100)
        library_db.add(user)
        await library_db.commit()
        await library_db.refresh(user)

        item = LibraryItem(
            tenant_id=102,
            owner_user_id=user.id,
            item_type="video",
            source="media_studio",
            title="Demo clip",
            status="ready",
            visibility="private",
        )
        library_db.add(item)
        await library_db.commit()
        await library_db.refresh(item)

        first_link = LibraryLink(
            library_item_id=item.id,
            link_type="media_task",
            link_id="task-001",
            provider_task_id="provider-task-001",
        )
        second_link = LibraryLink(
            library_item_id=item.id,
            link_type="media_task",
            link_id="task-001",
            provider_task_id="provider-task-001",
        )

        library_db.add(first_link)
        await library_db.commit()

        library_db.add(second_link)
        with pytest.raises(IntegrityError):
            await library_db.commit()

        await library_db.rollback()

    @pytest.mark.asyncio
    async def test_index_job_attempt_tracking(self, library_db):
        user = User(email="lib-job@example.com", password="hash", credits=100)
        library_db.add(user)
        await library_db.commit()
        await library_db.refresh(user)

        item = LibraryItem(
            tenant_id=103,
            owner_user_id=user.id,
            item_type="document",
            source="upload",
            title="Spec doc",
            status="indexing",
            visibility="private",
        )
        library_db.add(item)
        await library_db.commit()
        await library_db.refresh(item)

        job = LibraryIndexJob(
            tenant_id=item.tenant_id,
            library_item_id=item.id,
            job_type="initial_index",
            status="pending",
            attempt_count=0,
        )
        library_db.add(job)
        await library_db.commit()
        await library_db.refresh(job)

        assert job.attempt_count == 0

        job.status = "failed"
        job.attempt_count += 1
        job.last_error = "embedding timeout"
        await library_db.commit()
        await library_db.refresh(job)

        assert job.status == "failed"
        assert job.attempt_count == 1
        assert "timeout" in (job.last_error or "")
