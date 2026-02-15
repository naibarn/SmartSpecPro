"""Tests for the cleanup-redis-stale periodic handler.

This handler replaces the Node.js setInterval in mediaJobs.ts
that cleaned stale entries from Redis active-job sets.
"""

import json
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.v1.task_handlers import _cleanup_redis_stale_impl


class FakeRedis:
    """Fake Redis client for testing stale cleanup logic."""

    def __init__(self):
        self._data: dict[str, str | None] = {}
        self._sets: dict[str, set[str]] = {}

    async def scan(self, cursor, match=None, count=100):
        """Simulate SCAN to find active-job set keys."""
        if cursor != 0:
            return (0, [])
        keys = [k for k in self._sets if match is None or self._matches(k, match)]
        return (0, keys)

    async def smembers(self, key: str) -> set[bytes]:
        return {m.encode() for m in self._sets.get(key, set())}

    async def srem(self, key: str, member) -> int:
        member_str = member.decode() if isinstance(member, bytes) else str(member)
        s = self._sets.get(key, set())
        if member_str in s:
            s.discard(member_str)
            return 1
        return 0

    async def get(self, key: str) -> str | None:
        val = self._data.get(key)
        if val is None:
            return None
        return val.encode() if isinstance(val, str) else val

    async def set(self, key: str, value: str, **kwargs):
        self._data[key] = value

    async def aclose(self):
        pass

    def _matches(self, key: str, pattern: str) -> bool:
        import fnmatch
        return fnmatch.fnmatch(key, pattern)

    # Helper methods for test setup
    def add_active_job(self, user_id: str, job_id: str):
        key = f"media-jobs:user:{user_id}:active"
        if key not in self._sets:
            self._sets[key] = set()
        self._sets[key].add(job_id)

    def set_job_status(self, job_id: str, status_data: dict):
        self._data[f"media-job:{job_id}:status"] = json.dumps(status_data)

    def set_job_meta(self, job_id: str, meta_data: dict):
        self._data[f"media-job:{job_id}:meta"] = json.dumps(meta_data)


@pytest.mark.unit
class TestCleanupRedisStale:
    """Tests for the cleanup-redis-stale handler implementation."""

    @pytest.mark.asyncio
    async def test_removes_entries_with_expired_redis_keys(self):
        """Active set entries whose Redis status keys have expired
        are removed from the set."""
        redis = FakeRedis()
        redis.add_active_job("user1", "job-expired")
        # No status key set -> simulates expired key

        result = await _cleanup_redis_stale_impl(redis)

        assert result["cleaned_count"] >= 1
        remaining = await redis.smembers("media-jobs:user:user1:active")
        assert b"job-expired" not in remaining

    @pytest.mark.asyncio
    async def test_removes_done_jobs(self):
        """Jobs in 'done' state are removed from the active set."""
        redis = FakeRedis()
        redis.add_active_job("user1", "job-done")
        redis.set_job_status("job-done", {"status": "done"})

        result = await _cleanup_redis_stale_impl(redis)

        assert result["cleaned_count"] >= 1
        remaining = await redis.smembers("media-jobs:user:user1:active")
        assert b"job-done" not in remaining

    @pytest.mark.asyncio
    async def test_removes_error_jobs(self):
        """Jobs in 'error' state are removed from the active set."""
        redis = FakeRedis()
        redis.add_active_job("user1", "job-error")
        redis.set_job_status("job-error", {"status": "error"})

        result = await _cleanup_redis_stale_impl(redis)

        assert result["cleaned_count"] >= 1

    @pytest.mark.asyncio
    async def test_removes_canceled_jobs(self):
        """Jobs in 'canceled' state are removed from the active set."""
        redis = FakeRedis()
        redis.add_active_job("user1", "job-canceled")
        redis.set_job_status("job-canceled", {"status": "canceled"})

        result = await _cleanup_redis_stale_impl(redis)

        assert result["cleaned_count"] >= 1

    @pytest.mark.asyncio
    async def test_removes_stale_queued_jobs(self):
        """Jobs in 'queued' status for >10 minutes are marked as errors
        and removed from the active set."""
        redis = FakeRedis()
        redis.add_active_job("user1", "job-stale-queued")
        redis.set_job_status("job-stale-queued", {"status": "queued"})
        # submittedAt more than 10 minutes ago
        stale_time = int((time.time() - 700) * 1000)  # 700 seconds ago in ms
        redis.set_job_meta("job-stale-queued", {"submittedAt": stale_time})

        result = await _cleanup_redis_stale_impl(redis)

        assert result["cleaned_count"] >= 1
        # Verify the job was marked as error
        status_raw = await redis.get("media-job:job-stale-queued:status")
        assert status_raw is not None
        status = json.loads(status_raw)
        assert status["status"] == "error"

    @pytest.mark.asyncio
    async def test_removes_stale_processing_jobs(self):
        """Jobs in 'processing' status for >60 minutes are marked as errors
        and removed from the active set."""
        redis = FakeRedis()
        redis.add_active_job("user1", "job-stale-proc")
        redis.set_job_status("job-stale-proc", {"status": "processing"})
        # submittedAt more than 60 minutes ago
        stale_time = int((time.time() - 3700) * 1000)  # 3700 seconds ago in ms
        redis.set_job_meta("job-stale-proc", {"submittedAt": stale_time})

        result = await _cleanup_redis_stale_impl(redis)

        assert result["cleaned_count"] >= 1
        status_raw = await redis.get("media-job:job-stale-proc:status")
        status = json.loads(status_raw)
        assert status["status"] == "error"

    @pytest.mark.asyncio
    async def test_ignores_healthy_jobs(self):
        """Jobs that are actively queued or processing within
        acceptable timeframes are not touched."""
        redis = FakeRedis()
        redis.add_active_job("user1", "job-healthy")
        redis.set_job_status("job-healthy", {"status": "processing"})
        # submittedAt just 1 minute ago
        recent_time = int((time.time() - 60) * 1000)
        redis.set_job_meta("job-healthy", {"submittedAt": recent_time})

        result = await _cleanup_redis_stale_impl(redis)

        assert result["cleaned_count"] == 0
        remaining = await redis.smembers("media-jobs:user:user1:active")
        assert b"job-healthy" in remaining

    @pytest.mark.asyncio
    async def test_returns_cleanup_count(self):
        """Handler returns a dict with the number of stale entries cleaned."""
        redis = FakeRedis()
        redis.add_active_job("user1", "j1")
        redis.add_active_job("user1", "j2")
        redis.add_active_job("user1", "j3")
        redis.set_job_status("j1", {"status": "done"})
        redis.set_job_status("j2", {"status": "error"})
        # j3 has no status key (expired)

        result = await _cleanup_redis_stale_impl(redis)

        assert result["cleaned_count"] == 3
        assert "status" in result
        assert result["status"] == "success"
