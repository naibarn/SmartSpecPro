"""Focused pgvector tests for library indexing/delete flows."""

from __future__ import annotations

import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import library_indexing_service
from app.services.library_pgvector_service import upsert_library_chunk_vectors
from app.services.library_indexing_service import (
    _pgvector_vector_upsert,
    delete_library_item_vectors,
    process_library_index_job,
)


class _ChunkRowsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


@pytest.mark.asyncio
async def test_delete_library_item_vectors_calls_pgvector_cleanup(monkeypatch):
    db = AsyncMock()
    item = SimpleNamespace(id=42, tenant_id="tenant-410", deleted_at=None, status="ready", updated_at=None)
    db.scalar = AsyncMock(return_value=item)
    db.execute = AsyncMock(
        side_effect=[
            _ChunkRowsResult(
                [
                    SimpleNamespace(id=1, vector_ref_id="vec:1"),
                    SimpleNamespace(id=2, vector_ref_id=None),
                    SimpleNamespace(id=3, vector_ref_id="vec:3"),
                ]
            ),
            MagicMock(),
        ]
    )
    db.commit = AsyncMock()

    delete_pgvector_rows = AsyncMock(return_value=7)
    monkeypatch.setattr(
        library_indexing_service,
        "resolve_library_vector_provider",
        lambda: ("pgvector", {}),
    )
    monkeypatch.setattr(
        library_indexing_service,
        "delete_library_chunk_vectors",
        delete_pgvector_rows,
    )
    monkeypatch.setattr(library_indexing_service, "emit_metric", MagicMock())
    monkeypatch.setattr(library_indexing_service, "log_observability_event", MagicMock())
    monkeypatch.setattr(library_indexing_service, "_safe_record_vector_audit_event", MagicMock())

    result = await delete_library_item_vectors(
        db,
        42,
        tenant_id="tenant-410",
        soft_delete_item=False,
    )

    delete_pgvector_rows.assert_awaited_once_with(
        db,
        tenant_id="tenant-410",
        item_id=42,
    )
    db.commit.assert_awaited_once()
    assert result == {
        "library_item_id": 42,
        "tenant_id": "tenant-410",
        "removed_chunks": 3,
        "removed_vector_refs": 2,
        "removed_pgvector_rows": 7,
        "soft_delete_item": False,
        "not_found": False,
    }


def test_pgvector_upsert_delegates_to_canonical_helper(monkeypatch):
    captured = {}

    def fake_upsert_library_chunk_vectors(*, tenant_id, item_id, chunks, embeddings, pgvector_config):
        captured["tenant_id"] = tenant_id
        captured["item_id"] = item_id
        captured["chunks"] = chunks
        captured["embeddings"] = embeddings
        captured["pgvector_config"] = pgvector_config
        return ["vec:tenant-410:42:0"]

    monkeypatch.setattr(
        library_indexing_service,
        "upsert_library_chunk_vectors",
        fake_upsert_library_chunk_vectors,
    )

    vector_ids = _pgvector_vector_upsert(
        tenant_id="tenant-410",
        item_id=42,
        chunks=[
            {
                "chunk_index": 0,
                "content": "hello pgvector",
                "token_count": 2,
                "content_type": "text",
            }
        ],
        embeddings=[[1.0, 2.0, 3.0]],
        pgvector_config={"pgvectorHost": "localhost"},
    )

    assert vector_ids == ["vec:tenant-410:42:0"]
    assert captured == {
        "tenant_id": "tenant-410",
        "item_id": 42,
        "chunks": [
            {
                "chunk_index": 0,
                "content": "hello pgvector",
                "token_count": 2,
                "content_type": "text",
            }
        ],
        "embeddings": [[1.0, 2.0, 3.0]],
        "pgvector_config": {"pgvectorHost": "localhost"},
    }


def test_canonical_pgvector_upsert_uses_structured_connection_kwargs(monkeypatch):
    captured: dict[str, object] = {}

    class FakeCursor:
        def __init__(self):
            self._last_sql = ""

        def execute(self, sql, params=None):
            self._last_sql = sql
            captured.setdefault("executed", []).append((sql, params))

        def fetchone(self):
            if "pg_attribute" in self._last_sql:
                return (3,)
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeConnection:
        def cursor(self):
            return FakeCursor()

        def commit(self):
            captured["committed"] = True

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakePsycopgModule:
        @staticmethod
        def connect(**kwargs):
            captured["connect_kwargs"] = kwargs
            return FakeConnection()

    monkeypatch.setitem(sys.modules, "psycopg", FakePsycopgModule())

    vector_ids = upsert_library_chunk_vectors(
        tenant_id="tenant-411",
        item_id=77,
        chunks=[
            {
                "chunk_index": 0,
                "content": "hello pgvector",
                "token_count": 2,
                "content_type": "text",
                "allowed_scopes": ["u:7"],
            }
        ],
        embeddings=[[1.0, 2.0, 3.0]],
        pgvector_config={
            "pgvectorHost": "db.internal",
            "pgvectorPort": "6543",
            "pgvectorDatabase": "vectors",
            "pgvectorUser": "svc",
            "pgvectorPassword": "pa:ss@word",
            "pgvectorConnectTimeout": "9",
        },
    )

    assert vector_ids == ["lib:tenant-411:77:0"]
    assert captured["connect_kwargs"] == {
        "host": "db.internal",
        "port": 6543,
        "dbname": "vectors",
        "user": "svc",
        "password": "pa:ss@word",
        "connect_timeout": 9,
    }
    assert captured["committed"] is True


def test_canonical_pgvector_upsert_fails_fast_on_dimension_drift(monkeypatch):
    class FakeCursor:
        def __init__(self):
            self._last_sql = ""

        def execute(self, sql, params=None):
            self._last_sql = sql

        def fetchone(self):
            if "pg_attribute" in self._last_sql:
                return (1536,)
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeConnection:
        def cursor(self):
            return FakeCursor()

        def commit(self):
            raise AssertionError("commit should not be reached when dimensions drift")

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakePsycopgModule:
        @staticmethod
        def connect(**_kwargs):
            return FakeConnection()

    monkeypatch.setitem(sys.modules, "psycopg", FakePsycopgModule())

    with pytest.raises(RuntimeError, match="pgvector_dimension_mismatch:table=1536:embedding=384"):
        upsert_library_chunk_vectors(
            tenant_id="tenant-412",
            item_id=78,
            chunks=[
                {
                    "chunk_index": 0,
                    "content": "hello pgvector",
                }
            ],
            embeddings=[[0.1] * 384],
            pgvector_config={"pgvectorHost": "localhost"},
        )


@pytest.mark.asyncio
async def test_process_library_index_job_delete_payload_uses_delete_vectors(monkeypatch):
    db = AsyncMock()
    job = SimpleNamespace(
        id=99,
        status="pending",
        attempt_count=0,
        started_at=None,
        completed_at=None,
        next_retry_at=None,
        last_error=None,
        updated_at=None,
        max_attempts=5,
        library_item_id=42,
        tenant_id="tenant-410",
        job_type="delete_index",
    )
    db.scalar = AsyncMock(return_value=job)
    db.commit = AsyncMock()

    delete_result = {
        "library_item_id": 42,
        "tenant_id": "tenant-410",
        "removed_chunks": 3,
        "removed_vector_refs": 2,
        "removed_pgvector_rows": 7,
        "soft_delete_item": True,
        "not_found": False,
    }
    delete_vectors = AsyncMock(return_value=delete_result)

    monkeypatch.setattr(
        library_indexing_service,
        "_find_duplicate_completed_job_by_dedupe_key",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        library_indexing_service,
        "delete_library_item_vectors",
        delete_vectors,
    )
    monkeypatch.setattr(
        library_indexing_service,
        "_safe_record_vector_audit_event",
        MagicMock(),
    )
    monkeypatch.setattr(library_indexing_service, "emit_metric", MagicMock())
    monkeypatch.setattr(library_indexing_service, "log_observability_event", MagicMock())

    result = await process_library_index_job(
        db,
        99,
        job_payload={
            "version": "v2",
            "domain": "library",
            "operation": "delete",
            "tenantId": "tenant-410",
            "entityId": "library:42",
            "dedupeKey": "libidx:v2:library:delete:tenant-410:library:42",
            "source": "library.delete",
            "sourceMetadata": {"route": "library.delete"},
        },
    )

    delete_vectors.assert_awaited_once_with(
        db,
        42,
        tenant_id="tenant-410",
        soft_delete_item=True,
        fail_on_missing=False,
    )
    assert db.commit.await_count == 2
    assert result == {
        "job_id": 99,
        "status": "completed",
        "chunks_written": 0,
        "operation": "delete",
        "removed_chunks": 3,
        "removed_vector_refs": 2,
        "not_found": False,
        "provider_payload_version": "v2",
    }
