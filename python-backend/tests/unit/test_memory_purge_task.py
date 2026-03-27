"""Tests for agency memory purge task."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tasks.memory_purge_task import _run_purge, purge_expired_memories

pytestmark = [pytest.mark.unit]


def _make_session():
    session = AsyncMock()
    session.commit = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            MagicMock(rowcount=3),
            MagicMock(rowcount=5),
            MagicMock(rowcount=7),
        ]
    )
    return session


@pytest.mark.asyncio
async def test_purge_deletes_soft_deleted_memories_chunks_and_traces():
    session = _make_session()

    class _Ctx:
        async def __aenter__(self):
            return session

        async def __aexit__(self, exc_type, exc, tb):
            return False

    with patch("app.core.database.AsyncSessionLocal", return_value=_Ctx()):
        result = await _run_purge()

    assert result == {
        "memories_purged": 3,
        "chunks_purged": 5,
        "traces_purged": 7,
    }
    assert session.execute.call_count == 3
    sql_texts = [str(call.args[0]) for call in session.execute.call_args_list]
    assert 'DELETE FROM agency_agent_memories' in sql_texts[0]
    assert '"isActive" = false' in sql_texts[0]
    assert 'DELETE FROM agency_memory_chunks' in sql_texts[1]
    assert '"expiresAt" < NOW()' in sql_texts[1]
    assert 'DELETE FROM agency_run_traces' in sql_texts[2]
    assert '"createdAt" < NOW() - INTERVAL \'30 days\'' in sql_texts[2]
    session.commit.assert_awaited_once()


def test_purge_task_logs_result_counts():
    result = {"memories_purged": 1, "chunks_purged": 2, "traces_purged": 3}

    with patch("app.tasks.memory_purge_task._run_purge", AsyncMock(return_value=result)), \
         patch("app.tasks.memory_purge_task.logger.info") as mock_info:
        output = purge_expired_memories.run()

    assert output == result
    mock_info.assert_called_once()
    assert mock_info.call_args.kwargs["extra"] == result


def test_purge_task_registered_in_beat_schedule():
    from app.core.celery_app import celery_app

    schedule = celery_app.conf.beat_schedule["purge-expired-agency-memories"]
    assert schedule["task"] == "agency.purge_expired_memories"
    assert "0 5 * * *" in str(schedule["schedule"])
