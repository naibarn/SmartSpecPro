"""Unit tests for library indexing pipeline service (Section 04)."""

from datetime import datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import pytest_asyncio
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import Base
from app.models.library import LibraryChunk, LibraryIndexJob, LibraryItem
from app.models.user import User
from app.services import library_indexing_service
from app.services.library_indexing_service import (
    build_library_job_dedupe_key,
    delete_library_item_vectors,
    enqueue_library_index_job,
    extract_library_item_text,
    parse_library_index_job_payload,
    process_library_index_job,
    resolve_library_vector_provider,
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


class AsyncSessionAdapter:
    """Small async shim over a sync SQLAlchemy session for deterministic unit tests."""

    def __init__(self, session: Session):
        self._session = session
        self.info = {}

    def add(self, instance):
        self._session.add(instance)

    async def scalar(self, statement):
        return self._session.scalar(statement)

    async def execute(self, statement, *args, **kwargs):
        return self._session.execute(statement, *args, **kwargs)

    async def commit(self):
        self._session.commit()

    async def rollback(self):
        self._session.rollback()

    async def refresh(self, instance):
        self._session.refresh(instance)

    async def close(self):
        self._session.close()


@pytest.fixture(autouse=True)
def stub_credit_billing(monkeypatch):
    async def fake_charge_credits_post_deduct(**_kwargs):
        return None

    monkeypatch.setenv("LIBRARY_VECTOR_PROVIDER", "chroma")
    monkeypatch.delenv("VECTOR_DB_PROVIDER", raising=False)
    monkeypatch.setattr(
        library_indexing_service,
        "charge_credits_post_deduct",
        fake_charge_credits_post_deduct,
    )


def test_provider_resolution_accepts_vectordb_provider_alias(monkeypatch):
    monkeypatch.delenv("LIBRARY_VECTOR_PROVIDER", raising=False)
    monkeypatch.delenv("VECTOR_DB_PROVIDER", raising=False)
    monkeypatch.setenv("VECTORDB_PROVIDER", "pgvector")

    provider, config = resolve_library_vector_provider()

    assert provider == "pgvector"
    assert isinstance(config, dict)


def test_provider_resolution_falls_back_to_database_url_for_pgvector(monkeypatch):
    monkeypatch.setenv("LIBRARY_VECTOR_PROVIDER", "pgvector")
    monkeypatch.delenv("PGVECTOR_HOST", raising=False)
    monkeypatch.delenv("PGVECTOR_PORT", raising=False)
    monkeypatch.delenv("PGVECTOR_DATABASE", raising=False)
    monkeypatch.delenv("PGVECTOR_USER", raising=False)
    monkeypatch.delenv("PGVECTOR_PASSWORD", raising=False)
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://vector_user:vector_pass@db.internal:5433/vector_db",
    )

    provider, config = resolve_library_vector_provider()

    assert provider == "pgvector"
    assert config["pgvectorHost"] == "db.internal"
    assert config["pgvectorPort"] == "5433"
    assert config["pgvectorDatabase"] == "vector_db"
    assert config["pgvectorUser"] == "vector_user"
    assert config["pgvectorPassword"] == "vector_pass"


@pytest_asyncio.fixture
async def indexing_db():
    temp_dir = TemporaryDirectory(prefix="library-indexing-test-")
    db_path = Path(temp_dir.name) / "indexing.sqlite3"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            LibraryItem.__table__,
            LibraryChunk.__table__,
            LibraryIndexJob.__table__,
        ],
    )

    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    session = AsyncSessionAdapter(session_factory())
    session.info["_fixture_engine"] = engine
    session.info["_fixture_temp_dir"] = temp_dir
    try:
        yield session
    finally:
        await session.close()
        engine.dispose()
        temp_dir.cleanup()


async def _create_library_item(db: AsyncSessionAdapter, tenant_id: str, title: str, metadata=None):
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
    def test_extract_library_item_text_normalizes_media_task_prompt_fields(self):
        item = LibraryItem(
            tenant_id="tenant-300",
            owner_user_id=1,
            item_type="image",
            source="media_task",
            title="Media Task Prompt",
            description="""```json
{
  "prompt": "A soft portrait"
}
```""",
            metadata={
                "prompt": """```json
{
  "prompt": "A vibrant studio image"
}
```""",
            },
            status="ready",
            visibility="private",
        )

        extracted = extract_library_item_text(item)
        assert "```" not in extracted
        assert extracted.count('"prompt"') >= 2

    @pytest.mark.asyncio
    async def test_enqueue_and_success_pipeline_persists_chunks(self, indexing_db):
        item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-301",
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
            assert tenant_id == "tenant-301"
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
            select(LibraryChunk).where(
                LibraryChunk.library_item_id == item.id,
                LibraryChunk.vector_ref_id.is_not(None),
            )
        )
        assert one_chunk is not None
        assert one_chunk.vector_ref_id is not None

    @pytest.mark.asyncio
    async def test_transient_failure_retries_and_increments_attempt_count(self, indexing_db):
        item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-302",
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
            tenant_id="tenant-303",
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
            tenant_id="tenant-304",
            title="Metrics success",
            metadata={"prompt": "index me"},
        )
        fail_item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-304",
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

    @pytest.mark.asyncio
    async def test_worker_uses_resolved_provider_when_upsert_not_injected(self, indexing_db, monkeypatch):
        reset_library_observability_metrics()
        item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-305",
            title="Provider resolve",
            metadata={"prompt": "provider"},
        )
        enqueue_result = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)

        captured: dict[str, object] = {}

        def fake_resolver(provider, config=None):
            captured["provider"] = provider
            captured["config"] = config or {}

            def fake_upsert(*, tenant_id, item_id, chunks, embeddings):
                return [f"vec:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks]

            return fake_upsert

        monkeypatch.setenv("LIBRARY_VECTOR_PROVIDER", "pgvector")
        monkeypatch.setattr(library_indexing_service, "get_vector_upsert_fn", fake_resolver)

        result = await process_library_index_job(
            indexing_db,
            enqueue_result["job_id"],
            embedding_service=FakeEmbeddingService(),
        )

        assert result["status"] == "completed"
        assert captured["provider"] == "pgvector"
        assert isinstance(captured["config"], dict)

    @pytest.mark.asyncio
    async def test_duplicate_dedupe_key_short_circuits_duplicate_job_processing(self, indexing_db):
        item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-306",
            title="Dedupe entry",
            metadata={"prompt": "dedupe me"},
        )
        first_job = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)
        dedupe_payload = {
            "version": "v2",
            "domain": "library",
            "operation": "index",
            "tenantId": item.tenant_id,
            "entityId": f"library:{item.id}",
            "dedupeKey": build_library_job_dedupe_key(
                domain="library",
                operation="index",
                tenant_id=item.tenant_id,
                entity_id=f"library:{item.id}",
            ),
            "source": "library.upload",
            "sourceMetadata": {"route": "library.upload"},
        }

        first_result = await process_library_index_job(
            indexing_db,
            first_job["job_id"],
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda tenant_id, item_id, chunks, embeddings: [
                f"vec:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks
            ],
            job_payload=dedupe_payload,
        )
        assert first_result["status"] == "completed"

        second_job = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)
        second_result = await process_library_index_job(
            indexing_db,
            second_job["job_id"],
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("upsert_should_not_run")),
            job_payload=dedupe_payload,
        )

        assert second_result["status"] == "completed"
        assert second_result["duplicate"] is True
        assert second_result["chunks_written"] == 0

    @pytest.mark.asyncio
    async def test_payload_tenant_mismatch_is_terminal_and_dead_lettered(self, indexing_db):
        reset_library_observability_metrics()
        item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-307",
            title="Tenant guardrail",
            metadata={"prompt": "tenant mismatch"},
        )
        enqueue_result = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)

        result = await process_library_index_job(
            indexing_db,
            enqueue_result["job_id"],
            embedding_service=FakeEmbeddingService(),
            job_payload={
                "version": "v2",
                "domain": "library",
                "operation": "index",
                "tenantId": "other-tenant",
                "entityId": f"library:{item.id}",
                "dedupeKey": "libidx:v2:library:index:other-tenant:mismatch",
                "source": "library.upload",
                "sourceMetadata": {},
            },
        )

        assert result["status"] == "failed"
        assert result["failure_classification"] == "permanent"
        assert result["dead_lettered"] is True
        assert get_metric_count("library.index.job.dead_letter_total") == 1

    @pytest.mark.asyncio
    async def test_non_transient_runtime_error_is_terminal_failure(self, indexing_db):
        item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-308",
            title="Permanent runtime",
            metadata={"prompt": "permanent"},
        )
        enqueue_result = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)

        result = await process_library_index_job(
            indexing_db,
            enqueue_result["job_id"],
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("schema mismatch")),
        )

        assert result["status"] == "failed"
        assert result["failure_classification"] == "permanent"

    @pytest.mark.asyncio
    async def test_delete_payload_executes_and_is_idempotent(self, indexing_db):
        item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-309",
            title="Delete me",
            metadata={"prompt": "delete path"},
        )

        initial_job = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)
        await process_library_index_job(
            indexing_db,
            initial_job["job_id"],
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda tenant_id, item_id, chunks, embeddings: [
                f"vec:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks
            ],
        )

        chunk_count_before = await indexing_db.scalar(
            select(func.count()).select_from(LibraryChunk).where(LibraryChunk.library_item_id == item.id)
        )
        assert int(chunk_count_before or 0) > 0

        delete_job = await enqueue_library_index_job(
            indexing_db,
            item.id,
            tenant_id=item.tenant_id,
            job_type="delete_index",
        )
        delete_payload = {
            "version": "v2",
            "domain": "library",
            "operation": "delete",
            "tenantId": item.tenant_id,
            "entityId": f"library:{item.id}",
            "dedupeKey": build_library_job_dedupe_key(
                domain="library",
                operation="delete",
                tenant_id=item.tenant_id,
                entity_id=f"library:{item.id}",
            ),
            "source": "library.delete",
            "sourceMetadata": {"route": "library.delete"},
        }

        delete_result = await process_library_index_job(
            indexing_db,
            delete_job["job_id"],
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("upsert_should_not_run")),
            job_payload=delete_payload,
        )
        assert delete_result["status"] == "completed"
        assert delete_result["operation"] == "delete"
        assert delete_result["removed_chunks"] > 0
        assert delete_result["not_found"] is False

        remaining_chunks = await indexing_db.scalar(
            select(func.count()).select_from(LibraryChunk).where(LibraryChunk.library_item_id == item.id)
        )
        assert int(remaining_chunks or 0) == 0

        second_delete_job = LibraryIndexJob(
            library_item_id=item.id,
            tenant_id=item.tenant_id,
            job_type="delete_index",
            status="pending",
            run_at=datetime.utcnow(),
        )
        indexing_db.add(second_delete_job)
        await indexing_db.commit()
        await indexing_db.refresh(second_delete_job)
        duplicate_result = await process_library_index_job(
            indexing_db,
            second_delete_job.id,
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("upsert_should_not_run")),
            job_payload=delete_payload,
        )
        assert duplicate_result["status"] == "completed"
        assert duplicate_result["duplicate"] is True

    @pytest.mark.asyncio
    async def test_delete_library_item_vectors_removes_pgvector_rows_when_provider_is_pgvector(
        self,
        indexing_db,
        monkeypatch,
    ):
        item = await _create_library_item(
            indexing_db,
            tenant_id="tenant-310",
            title="Delete pgvector rows",
            metadata={"prompt": "cleanup pgvector rows"},
        )
        initial_job = await enqueue_library_index_job(indexing_db, item.id, tenant_id=item.tenant_id)
        await process_library_index_job(
            indexing_db,
            initial_job["job_id"],
            embedding_service=FakeEmbeddingService(),
            vector_upsert_fn=lambda tenant_id, item_id, chunks, embeddings: [
                f"vec:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks
            ],
        )

        async def fake_delete_pgvector_rows(_db, *, tenant_id, item_id):
            assert tenant_id == item.tenant_id
            assert item_id == item.id
            return 7

        monkeypatch.setattr(
            library_indexing_service,
            "resolve_library_vector_provider",
            lambda: ("pgvector", {}),
        )
        monkeypatch.setattr(
            library_indexing_service,
            "delete_library_chunk_vectors",
            fake_delete_pgvector_rows,
        )

        result = await delete_library_item_vectors(
            indexing_db,
            item.id,
            tenant_id=item.tenant_id,
            soft_delete_item=False,
        )

        assert result["not_found"] is False
        assert result["removed_chunks"] > 0
        assert result["removed_vector_refs"] > 0
        assert result["removed_pgvector_rows"] == 7


def test_payload_parser_supports_v2_and_legacy_contracts():
    v2 = parse_library_index_job_payload(
        {
            "version": "v2",
            "domain": "library",
            "operation": "index",
            "tenantId": "tenant-900",
            "entityId": "library:22",
            "dedupeKey": "libidx:v2:library:index:tenant-900:library:22",
            "source": "library.upload",
            "sourceMetadata": {"origin": "upload"},
        }
    )
    legacy = parse_library_index_job_payload(
        {
            "tenantId": "tenant-legacy",
            "libraryItemId": 45,
            "jobType": "initial_index",
        }
    )

    assert v2["version"] == "v2"
    assert v2["tenant_id"] == "tenant-900"
    assert v2["source_metadata"] == {"origin": "upload"}
    assert legacy["version"] == "legacy"
    assert legacy["entity_id"] == "library:45"
    assert legacy["operation"] == "index"

    with pytest.raises(ValueError):
        parse_library_index_job_payload(
            {
                "version": "v2",
                "domain": "library",
                "operation": "reindex",
                "tenantId": "tenant-900",
                "entityId": "library:22",
            }
        )


def test_provider_resolution_falls_back_to_chroma(monkeypatch):
    monkeypatch.delenv("LIBRARY_VECTOR_PROVIDER", raising=False)
    monkeypatch.delenv("VECTOR_DB_PROVIDER", raising=False)
    provider, _config = resolve_library_vector_provider()
    assert provider == "chroma"
