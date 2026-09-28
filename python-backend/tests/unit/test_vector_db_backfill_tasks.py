"""Unit tests for durable Vectorize backfill task orchestration."""

import asyncio

from app.tasks import vector_db_backfill_tasks as task_module


class _FakeSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, *_args):
        return False


def test_campaign_task_completes_after_bounded_batches(monkeypatch):
    results = iter(
        [
            {"campaign_id": 12, "status": "running"},
            {"campaign_id": 12, "status": "completed", "counters": {"queued": 2}},
        ]
    )
    calls = []

    async def fake_run_batch(*_args, **kwargs):
        calls.append(kwargs)
        return next(results)

    monkeypatch.setattr(task_module, "AsyncSessionLocal", lambda: _FakeSessionContext())
    monkeypatch.setattr(task_module, "run_backfill_campaign_batch", fake_run_batch)

    result = asyncio.run(task_module._run_campaign(12))

    assert result["status"] == "completed"
    assert len(calls) == 2
    assert all(call["dry_run"] is False for call in calls)
    assert all(call["max_enqueue"] == task_module.BACKFILL_MAX_ENQUEUE for call in calls)


def test_campaign_task_reschedules_after_batch_budget(monkeypatch):
    async def fake_run_batch(*_args, **_kwargs):
        return {"campaign_id": 13, "status": "running"}

    scheduled = []
    monkeypatch.setattr(task_module, "AsyncSessionLocal", lambda: _FakeSessionContext())
    monkeypatch.setattr(task_module, "run_backfill_campaign_batch", fake_run_batch)
    monkeypatch.setattr(
        task_module.run_vector_db_backfill_campaign,
        "apply_async",
        lambda **kwargs: scheduled.append(kwargs),
    )

    result = asyncio.run(task_module._run_campaign(13))

    assert result == {
        "status": "rescheduled",
        "campaign_id": 13,
        "last_batch": {"campaign_id": 13, "status": "running"},
    }
    assert scheduled == [{"args": [13], "countdown": task_module.RESCHEDULE_SECONDS}]
