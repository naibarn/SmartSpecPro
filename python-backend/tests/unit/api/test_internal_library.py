"""Unit tests for internal library API request validation."""

from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.api.internal_library import (
    LibrarySearchRequest,
    MAX_LIBRARY_SEARCH_CANDIDATES,
    get_library_reindex_status_internal,
    trigger_library_reindex_internal,
)


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
async def test_reindex_enqueue_uses_worker_jobs_idempotency(monkeypatch):
    from app.services import job_control_plane

    dispatched = {}

    def dispatch(task_name, **kwargs):
        dispatched.update(task_name=task_name, **kwargs)
        return job_control_plane.TaskDispatchRef(id="job-123", created=True)

    monkeypatch.setattr(job_control_plane, "dispatch_python_task", dispatch)
    monkeypatch.setenv("FEATURE_186_SYSTEM_TENANT_ID", "system-tenant")
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=41)

    response = await trigger_library_reindex_internal(session=session)

    assert response.task_id == "job-123"
    assert response.status == "started"
    assert dispatched["idempotency_key"] == "library:reindex:global:41"
    assert "legacy_task" not in dispatched


@pytest.mark.asyncio
async def test_reindex_status_reads_canonical_worker_job(monkeypatch):
    from app.services import job_control_plane

    class FakeClient:
        def latest(self, task_name, *, tenant_id):
            assert task_name.endswith("reindex_all_library_task")
            return "job-123"

        def status(self, task_id):
            assert task_id == "job-123"
            return {"status": "succeeded", "output": {"indexed": 8}}

    monkeypatch.setattr(job_control_plane, "JobControlPlaneClient", FakeClient)
    response = await get_library_reindex_status_internal(session=AsyncMock())

    assert response.task_id == "job-123"
    assert response.status == "completed"
    assert response.result == {"indexed": 8}
