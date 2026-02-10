"""Unit tests for library indexing pipeline service (Section 04)."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
from app.models.user import User
from app.services.library_indexing_service import (
    enqueue_library_index_job,
    process_library_index_job,
    retry_due_library_index_jobs,
)
from app.services.library_observability import (
    get_metric_count,
    reset_library_observability_metrics,
)


class FakeEmbeddingService:
    """Deterministic embedding stub for unit tests."""

    def embed_batch(self, texts):
        return [[float(len(t)), 1.0, 0.5] for t in texts]


@pytest.fixture
async def indexing_db():
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


async def _create_library_item(db: AsyncSession, tenant_id: int, title: str, metadata=None):
    user = User(email=f"lib-index-{tenant_id}-{title}@example.com", password="hash", credits=100)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    item = LibraryItem(
        tenant_id=tenant_id,
        owner_user_id=user.id,
        item_type="document",
        source="media_history",
        title=title,
        description="Index this item",
        status="ready",
        visibility="private",
        metadata=metadata or {},
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@pytest.mark.unit
class TestLibraryIndexingService:
    @pytest.mark.asyncio
    async def test_enqueue_and_success_pipeline_persists_chunks(self, indexing_db):
        item = await _create_library_item(
            indexing_db,
            tenant_id=301,
            title="Launch Checklist",
            metadata={"prompt": "Generate launch checklist", "tags": ["ops", "release"]},
        )

        enqueue_result = await enqueue_library_index_job(
            indexing_db,
            item.id,
            tenant_id=item.tenant_id,
        )

        assert enqueue_result["created"] is True

        job = await indexing_db.scalar(
            select(LibraryIndexJob).where(LibraryIndexJob.id == enqueue_result["job_id"])
        )
        assert job is not None
        assert job.status == "pending"

        item = await indexing_db.scalar(select(LibraryItem).where(LibraryItem.id == item.id))
        assert item is not None
        assert item.status == "indexing"

        def fake_upsert(*, tenant_id, item_id, chunks, embeddings):
            assert tenant_id == 301
            assert item_id > 0
            assert len(chunks) == len(embeddings)
            return [f"vec:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks]

        process_result = await process_library_index_job(
            indexing_db,
            job.id,
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=fake_upsert,
        )

        assert process_result["status"] == "completed"
        assert process_result["chunks_written"] > 0

        refreshed_job = await indexing_db.scalar(select(LibraryIndexJob).where(LibraryIndexJob.id == job.id))
        assert refreshed_job is not None
        assert refreshed_job.status == "completed"
        assert refreshed_job.attempt_count == 1
        assert refreshed_job.started_at is not None
        assert refreshed_job.completed_at is not None

        refreshed_item = await indexing_db.scalar(select(LibraryItem).where(LibraryItem.id == item.id))
        assert refreshed_item is not None
        assert refreshed_item.status == "ready"

        chunk_count = await indexing_db.scalar(
            select(func.count()).select_from(LibraryChunk).where(LibraryChunk.library_item_id == item.id)
        )
        assert (chunk_count or 0) > 0

        one_chunk = await indexing_db.scalar(
            select(LibraryChunk).where(LibraryChunk.library_item_id == item.id).limit(1)
        )
        assert one_chunk is not None
        assert one_chunk.vector_ref_id is not None

    @pytest.mark.asyncio
    async def test_transient_failure_retries_and_increments_attempt_count(self, indexing_db):
        item = await _create_library_item(
            indexing_db,
            tenant_id=302,
            title="Retryable item",
            metadata={"prompt": "retry me"},
        )

        enqueue_result = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)
        job_id = enqueue_result["job_id"]

        def failing_upsert(**_kwargs):
            raise RuntimeError("vector backend timeout")

        first = await process_library_index_job(
            indexing_db,
            job_id,
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=failing_upsert,
        )

        assert first["status"] == "retry_pending"

        job = await indexing_db.scalar(select(LibraryIndexJob).where(LibraryIndexJob.id == job_id))
        assert job is not None
        assert job.attempt_count == 1
        assert job.status == "retry_pending"
        assert job.next_retry_at is not None

        job.next_retry_at = datetime.utcnow() - timedelta(seconds=1)
        await indexing_db.commit()

        def successful_upsert(*, tenant_id, item_id, chunks, embeddings):
            return [f"vec:{tenant_id}:{item_id}:{i}" for i in range(len(chunks))]

        retried = await retry_due_library_index_jobs(
            indexing_db,
            limit=10,
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=successful_upsert,
        )

        assert retried["processed"] >= 1
        assert retried["completed"] >= 1

        refreshed_job = await indexing_db.scalar(select(LibraryIndexJob).where(LibraryIndexJob.id == job_id))
        assert refreshed_job is not None
        assert refreshed_job.status == "completed"
        assert refreshed_job.attempt_count == 2

    @pytest.mark.asyncio
    async def test_terminal_failure_preserves_last_error_metadata(self, indexing_db):
        item = await _create_library_item(
            indexing_db,
            tenant_id=303,
            title="   ",
            metadata={},
        )
        item.description = None
        await indexing_db.commit()

        enqueue_result = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)
        job_id = enqueue_result["job_id"]

        result = await process_library_index_job(
            indexing_db,
            job_id,
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda **_kwargs: [],
        )

        assert result["status"] == "failed"
        assert "No indexable text content" in result["error"]

        job = await indexing_db.scalar(select(LibraryIndexJob).where(LibraryIndexJob.id == job_id))
        assert job is not None
        assert job.status == "failed"
        assert "No indexable text content" in (job.last_error or "")

        refreshed_item = await indexing_db.scalar(select(LibraryItem).where(LibraryItem.id == item.id))
        assert refreshed_item is not None
        assert refreshed_item.status == "failed"

    @pytest.mark.asyncio
    async def test_indexing_metrics_emit_for_success_and_failure(self, indexing_db):
        reset_library_observability_metrics()

        success_item = await _create_library_item(
            indexing_db,
            tenant_id=304,
            title="Metrics success",
            metadata={"prompt": "index me"},
        )
        fail_item = await _create_library_item(
            indexing_db,
            tenant_id=304,
            title="   ",
            metadata={},
        )
        fail_item.description = None
        await indexing_db.commit()

        success_job = await enqueue_library_index_job(indexing_db, success_item.id, tenant_id=success_item.tenant_id)
        fail_job = await enqueue_library_index_job(indexing_db, fail_item.id, tenant_id=fail_item.tenant_id)

        await process_library_index_job(
            indexing_db,
            success_job["job_id"],
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda tenant_id, item_id, chunks, embeddings: [
                f"vec:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks
            ],
        )
        await process_library_index_job(
            indexing_db,
            fail_job["job_id"],
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda **_kwargs: [],
        )

        assert get_metric_count("library.index.job.enqueued_total") == 2
        assert get_metric_count("library.index.job.completed_total") == 1
        assert get_metric_count("library.index.job.failed_total") == 1
