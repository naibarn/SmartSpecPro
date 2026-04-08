"""Celery maintenance tasks for chat memory index upkeep."""

from __future__ import annotations

import logging
from contextlib import contextmanager

from sqlalchemy import create_engine, text

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.sqlalchemy_sync import to_sync_sqlalchemy_url

logger = logging.getLogger(__name__)

_sync_engine = None

INDEX_NAMES = (
    "scoped_memories_embedding_hnsw_idx",
    "message_chunks_embedding_hnsw_idx",
)


def _get_sync_db_url() -> str:
    return to_sync_sqlalchemy_url(settings.DATABASE_URL)


@contextmanager
def get_sync_session():
    """Yield an autocommit connection for concurrent reindex operations."""
    global _sync_engine
    if _sync_engine is None:
        _sync_engine = create_engine(_get_sync_db_url(), pool_pre_ping=True, pool_size=2)
    connection = _sync_engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        yield connection
    finally:
        connection.close()


def _index_exists(connection, index_name: str) -> bool:
    result = connection.execute(
        text("SELECT to_regclass(:qualified_name) AS name"),
        {"qualified_name": f"public.{index_name}"},
    )
    row = result.fetchone()
    return bool(row and row[0])


def _index_is_valid(connection, index_name: str) -> bool:
    result = connection.execute(
        text(
            """
            SELECT i.indisvalid
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indexrelid
            WHERE c.relname = :index_name
            LIMIT 1
            """
        ),
        {"index_name": index_name},
    )
    row = result.fetchone()
    return bool(row and row[0])


def rebuild_hnsw_indexes() -> dict[str, object]:
    """Rebuild HNSW indexes for chat memory embeddings."""
    rebuilt: list[str] = []
    skipped: list[str] = []
    invalid: list[str] = []

    try:
        with get_sync_session() as connection:
            for index_name in INDEX_NAMES:
                if not _index_exists(connection, index_name):
                    skipped.append(index_name)
                    continue

                connection.execute(text(f"REINDEX INDEX CONCURRENTLY {index_name}"))
                rebuilt.append(index_name)

            for index_name in rebuilt:
                if not _index_is_valid(connection, index_name):
                    invalid.append(index_name)

        if invalid:
            logger.error(
                "memory_hnsw_index_rebuild_invalid",
                extra={"invalid_indexes": invalid},
            )

        result = {
            "rebuilt_indexes": rebuilt,
            "skipped_indexes": skipped,
            "invalid_indexes": invalid,
        }
        logger.info("memory_hnsw_index_rebuild_complete", extra=result)
        return result
    except Exception as exc:
        logger.error(
            "memory_hnsw_index_rebuild_failed",
            extra={"error": str(exc)},
        )
        return {
            "error": str(exc),
            "rebuilt_indexes": rebuilt,
            "skipped_indexes": skipped,
            "invalid_indexes": invalid,
        }


@celery_app.task(name="memory.rebuild_hnsw_indexes")
def rebuild_hnsw_indexes_task() -> dict[str, object]:
    return rebuild_hnsw_indexes()
