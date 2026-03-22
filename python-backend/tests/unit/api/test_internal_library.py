"""Unit tests for internal library API request validation."""

from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.api.internal_library import (
    LibrarySearchRequest,
    MAX_LIBRARY_SEARCH_CANDIDATES,
    _build_reindex_batch_summary,
    _determine_reindex_status,
)


class _GroupedRowsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


def test_library_search_request_normalizes_query_and_dedupes_candidates():
    request = LibrarySearchRequest(
        tenant_id="tenant-1",
        query="  launch plan  ",
        candidate_item_ids=[5, 7, 5, 9],
    )

    assert request.query == "launch plan"
    assert request.candidate_item_ids == [5, 7, 9]


def test_library_search_request_rejects_blank_query():
    with pytest.raises(ValidationError):
        LibrarySearchRequest(
            tenant_id="tenant-1",
            query="   ",
            candidate_item_ids=[1],
        )


def test_library_search_request_rejects_non_positive_candidate_ids():
    with pytest.raises(ValidationError):
        LibrarySearchRequest(
            tenant_id="tenant-1",
            query="launch",
            candidate_item_ids=[1, 0, -2],
        )


def test_library_search_request_rejects_excessive_candidate_ids():
    with pytest.raises(ValidationError):
        LibrarySearchRequest(
            tenant_id="tenant-1",
            query="launch",
            candidate_item_ids=list(range(1, MAX_LIBRARY_SEARCH_CANDIDATES + 2)),
        )


@pytest.mark.asyncio
async def test_reindex_batch_summary_counts_active_jobs():
    session = AsyncMock()
    session.execute = AsyncMock(
        return_value=_GroupedRowsResult(
            [
                ("pending", 4),
                ("processing", 2),
                ("completed", 7),
                ("failed", 1),
            ]
        )
    )

    summary = await _build_reindex_batch_summary(
        session,
        {"baseline_job_id": 41, "tenant_id": None, "requested_at": "2026-03-20T00:00:00"},
    )

    assert summary == {
        "baseline_job_id": 41,
        "requested_at": "2026-03-20T00:00:00",
        "tenant_id": None,
        "total_jobs": 14,
        "pending_jobs": 4,
        "retry_pending_jobs": 0,
        "processing_jobs": 2,
        "completed_jobs": 7,
        "failed_jobs": 1,
        "active_jobs": 6,
    }


@pytest.mark.asyncio
async def test_reindex_batch_summary_ignores_legacy_metadata_without_baseline():
    session = AsyncMock()

    summary = await _build_reindex_batch_summary(
        session,
        {"task_id": "legacy-task-id"},
    )

    assert summary is None
    session.execute.assert_not_called()


def test_determine_reindex_status_stays_running_until_all_expected_jobs_exist():
    status = _determine_reindex_status(
        queue_state="SUCCESS",
        batch_summary={
            "total_jobs": 60,
            "active_jobs": 0,
            "failed_jobs": 0,
        },
        batch_metadata={
            "baseline_job_id": 100,
            "expected_total_items": 80,
            "expected_enqueued_jobs": 80,
            "enqueue_errors": 0,
        },
        task_result={
            "total_items": 80,
            "enqueued_jobs": 80,
            "errors": 0,
        },
    )

    assert status == "running"


def test_determine_reindex_status_marks_completed_with_errors_for_enqueue_failures():
    status = _determine_reindex_status(
        queue_state="SUCCESS",
        batch_summary={
            "total_jobs": 72,
            "active_jobs": 0,
            "failed_jobs": 0,
        },
        batch_metadata={
            "baseline_job_id": 100,
            "expected_total_items": 80,
            "expected_enqueued_jobs": 72,
            "enqueue_errors": 8,
        },
        task_result={
            "total_items": 80,
            "enqueued_jobs": 72,
            "errors": 8,
        },
    )

    assert status == "completed_with_errors"


def test_determine_reindex_status_treats_legacy_success_without_batch_tracking_as_completed():
    status = _determine_reindex_status(
        queue_state="SUCCESS",
        batch_summary=None,
        batch_metadata={"task_id": "legacy-task-id"},
        task_result={
            "total_items": 80,
            "enqueued_jobs": 80,
            "errors": 0,
        },
    )

    assert status == "completed"
