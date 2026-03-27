"""Tests for chat memory maintenance Celery tasks."""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

from app.core.celery_app import celery_app
from app.tasks.memory_maintenance_tasks import INDEX_NAMES, rebuild_hnsw_indexes

pytestmark = [pytest.mark.unit]


def _mock_session_ctx(mock_connection):
    @contextmanager
    def ctx():
        yield mock_connection

    return ctx


def _result(fetchone_value=None):
    result = MagicMock()
    result.fetchone.return_value = fetchone_value
    return result


@patch("app.tasks.memory_maintenance_tasks.get_sync_session")
def test_rebuild_hnsw_indexes_reindexes_valid_indexes(mock_get_session):
    connection = MagicMock()
    connection.execute.side_effect = [
        _result(("public.scoped_memories_embedding_hnsw_idx",)),
        _result(("public.message_chunks_embedding_hnsw_idx",)),
        MagicMock(),
        MagicMock(),
        _result((True,)),
        _result((True,)),
    ]
    mock_get_session.side_effect = _mock_session_ctx(connection)

    result = rebuild_hnsw_indexes()

    assert result == {
        "rebuilt_indexes": list(INDEX_NAMES),
        "skipped_indexes": [],
        "invalid_indexes": [],
    }
    sql_calls = [str(call.args[0]) for call in connection.execute.call_args_list]
    assert "REINDEX INDEX CONCURRENTLY scoped_memories_embedding_hnsw_idx" in sql_calls[1]
    assert "REINDEX INDEX CONCURRENTLY message_chunks_embedding_hnsw_idx" in sql_calls[3]


@patch("app.tasks.memory_maintenance_tasks.get_sync_session")
def test_rebuild_hnsw_indexes_skips_missing_indexes(mock_get_session):
    connection = MagicMock()
    connection.execute.side_effect = [
        _result(None),
        _result(None),
    ]
    mock_get_session.side_effect = _mock_session_ctx(connection)

    result = rebuild_hnsw_indexes()

    assert result["rebuilt_indexes"] == []
    assert result["skipped_indexes"] == list(INDEX_NAMES)
    assert result["invalid_indexes"] == []
    assert connection.execute.call_count == 2


@patch("app.tasks.memory_maintenance_tasks.get_sync_session")
def test_rebuild_hnsw_indexes_logs_invalid_indexes(mock_get_session):
    connection = MagicMock()
    connection.execute.side_effect = [
        _result(("public.scoped_memories_embedding_hnsw_idx",)),
        _result(("public.message_chunks_embedding_hnsw_idx",)),
        MagicMock(),
        MagicMock(),
        _result((True,)),
        _result((False,)),
    ]
    mock_get_session.side_effect = _mock_session_ctx(connection)

    with patch("app.tasks.memory_maintenance_tasks.logger.error") as mock_error:
        result = rebuild_hnsw_indexes()

    assert result["invalid_indexes"] == ["message_chunks_embedding_hnsw_idx"]
    mock_error.assert_any_call(
        "memory_hnsw_index_rebuild_invalid",
        extra={"invalid_indexes": ["message_chunks_embedding_hnsw_idx"]},
    )


def test_rebuild_hnsw_indexes_registered_in_beat_schedule():
    schedule = celery_app.conf.beat_schedule["rebuild-hnsw-indexes"]
    assert schedule["task"] == "memory.rebuild_hnsw_indexes"
    assert "0 4 * * 0" in str(schedule["schedule"])
