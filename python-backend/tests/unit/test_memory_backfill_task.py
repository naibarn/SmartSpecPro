"""Tests for agency memory embedding backfill."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.long_term_memory import LongTermMemoryService
from app.tasks.memory_backfill_task import BACKFILL_BATCH_SIZE, backfill_memory_embeddings

pytestmark = [pytest.mark.unit]


def _row(row_id: int, content: str):
    row = MagicMock()
    row.id = row_id
    row.content = content
    row.embedding = None
    row.is_active = True
    return row


def _make_result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


@pytest.mark.asyncio
async def test_backfill_processes_missing_embeddings_in_batches():
    session = AsyncMock()
    session.commit = AsyncMock()
    row1 = _row(1, "alpha")
    row2 = _row(2, "beta")
    row3 = _row(3, "gamma")
    vec_a = [0.1] * 1536
    vec_b = [0.2] * 1536
    vec_c = [0.3] * 1536
    session.execute = AsyncMock(
        side_effect=[
            _make_result([row1, row2]),
            _make_result([row3]),
            _make_result([]),
        ]
    )

    embedding_service = AsyncMock()
    embedding_service.embed_batch = AsyncMock(
        side_effect=[
            [vec_a, vec_b],
            [vec_c],
        ]
    )

    service = LongTermMemoryService(session, embedding_service=embedding_service)
    result = await service.backfill_missing_embeddings(batch_size=2)

    assert result == {"processed": 3, "errors": 0, "batches": 2}
    assert session.commit.await_count == 2
    assert row1.embedding == vec_a
    assert row2.embedding == vec_b
    assert row3.embedding == vec_c
    first_batch = session.execute.call_args_list[0]
    assert "agency_agent_memories" in str(first_batch.args[0])
    assert "embedding IS NULL" in str(first_batch.args[0])


@pytest.mark.asyncio
async def test_backfill_handles_embedding_service_errors_gracefully():
    session = AsyncMock()
    session.commit = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            _make_result([_row(1, "alpha"), _row(2, "beta")]),
            _make_result([]),
        ]
    )

    embedding_service = AsyncMock()
    embedding_service.embed_batch = AsyncMock(side_effect=RuntimeError("boom"))

    service = LongTermMemoryService(session, embedding_service=embedding_service)
    result = await service.backfill_missing_embeddings(batch_size=BACKFILL_BATCH_SIZE)

    assert result["processed"] == 0
    assert result["errors"] == 2
    assert session.commit.await_count == 1


def test_backfill_task_wrapper_logs_result():
    result = {"processed": 1, "errors": 0, "batches": 1}

    with patch("app.tasks.memory_backfill_task._run_backfill", AsyncMock(return_value=result)), \
         patch("app.tasks.memory_backfill_task.logger.info") as mock_info:
        output = backfill_memory_embeddings.run()

    assert output == result
    mock_info.assert_called_once()
    assert mock_info.call_args.kwargs["extra"] == result
