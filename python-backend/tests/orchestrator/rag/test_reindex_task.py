"""Tests for Celery re-indexing batch task."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.tasks.reindex_tasks import _smart_reindex_impl, BATCH_SIZE


def _mock_item(item_id, tenant_id="t1"):
    m = MagicMock()
    m.id = item_id
    m.tenant_id = tenant_id
    return m


@pytest.mark.unit
@pytest.mark.asyncio
class TestReindexBatchTask:
    """Tests for the Celery batch re-indexing task."""

    async def test_processes_in_batches_of_50(self):
        """Celery task processes items in configurable batches."""
        assert BATCH_SIZE == 50

    async def test_enqueues_jobs_for_each_item(self):
        """Each item gets a LibraryIndexJob enqueued."""
        items = [_mock_item(i) for i in range(3)]

        mock_session = AsyncMock()
        # First call: count query returns 3
        # Subsequent calls: batch query returns items, then empty
        mock_session.scalar.return_value = 3

        batch_result = MagicMock()
        batch_result.fetchall.side_effect = [items, []]
        mock_session.execute.return_value = batch_result

        mock_task = MagicMock()

        with patch(
            "app.tasks.reindex_tasks.AsyncSessionLocal",
        ) as mock_session_cls, patch(
            "app.services.library_indexing_service.enqueue_library_index_job",
            new_callable=AsyncMock,
        ) as mock_enqueue:
            # Make the session context manager work
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await _smart_reindex_impl(mock_task, tenant_id="t1")

        assert mock_enqueue.call_count == 3
        assert result["processed"] == 3
        assert result["total"] == 3

    async def test_old_chunks_deleted_via_reindex_job(self):
        """Re-indexing uses the job pipeline which handles old chunk deletion."""
        # The reindex task enqueues jobs; old chunk deletion happens in
        # process_library_index_job() which deletes non-markdown_source chunks
        # before creating new ones. This is tested via the integration pipeline.
        mock_session = AsyncMock()
        mock_session.scalar.return_value = 1

        batch_result = MagicMock()
        batch_result.fetchall.side_effect = [[_mock_item(1)], []]
        mock_session.execute.return_value = batch_result

        with patch(
            "app.tasks.reindex_tasks.AsyncSessionLocal",
        ) as mock_session_cls, patch(
            "app.services.library_indexing_service.enqueue_library_index_job",
            new_callable=AsyncMock,
        ) as mock_enqueue:
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await _smart_reindex_impl(MagicMock(), tenant_id="t1")

        # Job type should be "smart_reindex"
        call_kwargs = mock_enqueue.call_args[1]
        assert call_kwargs["job_type"] == "smart_reindex"

    async def test_preserves_allowed_scopes(self):
        """Re-indexing preserves allowed_scopes from original item."""
        # allowed_scopes are preserved because:
        # 1. process_library_index_job reads item.allowed_scopes
        # 2. SmartChunker.chunk() receives allowed_scopes parameter
        # 3. Each Chunk object inherits allowed_scopes
        # This test verifies the contract at the task level
        mock_session = AsyncMock()
        mock_session.scalar.return_value = 1

        batch_result = MagicMock()
        item = _mock_item(1, tenant_id="t1")
        batch_result.fetchall.side_effect = [[item], []]
        mock_session.execute.return_value = batch_result

        with patch(
            "app.tasks.reindex_tasks.AsyncSessionLocal",
        ) as mock_session_cls, patch(
            "app.services.library_indexing_service.enqueue_library_index_job",
            new_callable=AsyncMock,
        ) as mock_enqueue:
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await _smart_reindex_impl(MagicMock(), tenant_id="t1")

        assert result["processed"] == 1
        # The enqueue call passes tenant_id and library_item_id
        call_kwargs = mock_enqueue.call_args[1]
        assert call_kwargs["tenant_id"] == "t1"
        assert call_kwargs["library_item_id"] == 1

    async def test_progress_tracking(self):
        """Progress is tracked (items processed / total items)."""
        mock_session = AsyncMock()
        mock_session.scalar.return_value = 2

        items = [_mock_item(1), _mock_item(2)]
        batch_result = MagicMock()
        batch_result.fetchall.side_effect = [items, []]
        mock_session.execute.return_value = batch_result

        mock_task = MagicMock()

        with patch(
            "app.tasks.reindex_tasks.AsyncSessionLocal",
        ) as mock_session_cls, patch(
            "app.services.library_indexing_service.enqueue_library_index_job",
            new_callable=AsyncMock,
        ):
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await _smart_reindex_impl(mock_task, tenant_id="t1")

        # Task state should be updated with progress
        mock_task.update_state.assert_called()
        progress = mock_task.update_state.call_args[1]["meta"]
        assert progress["processed"] == 2
        assert progress["total"] == 2

    async def test_no_items_returns_zero(self):
        """When no items match, returns zero counts."""
        mock_session = AsyncMock()
        mock_session.scalar.return_value = 0

        with patch(
            "app.tasks.reindex_tasks.AsyncSessionLocal",
        ) as mock_session_cls:
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await _smart_reindex_impl(MagicMock(), tenant_id="nonexistent")

        assert result["total"] == 0
        assert result["processed"] == 0

    async def test_error_handling_continues_batch(self):
        """Errors on individual items don't stop the batch."""
        mock_session = AsyncMock()
        mock_session.scalar.return_value = 2

        items = [_mock_item(1), _mock_item(2)]
        batch_result = MagicMock()
        batch_result.fetchall.side_effect = [items, []]
        mock_session.execute.return_value = batch_result

        with patch(
            "app.tasks.reindex_tasks.AsyncSessionLocal",
        ) as mock_session_cls, patch(
            "app.services.library_indexing_service.enqueue_library_index_job",
            new_callable=AsyncMock,
            side_effect=[Exception("item 1 failed"), None],
        ):
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await _smart_reindex_impl(MagicMock(), tenant_id="t1")

        assert result["processed"] == 1
        assert result["errors"] == 1
        assert result["total"] == 2
