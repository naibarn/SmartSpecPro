"""Tests for AgencyEventEmitter — Redis pub/sub event publishing."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services.agency_event_emitter import (
    AgencyEventEmitter,
    REPLAY_LIST_TTL,
    check_cancelled,
)


@pytest.fixture
def mock_redis():
    """Create a mock async Redis client."""
    r = AsyncMock()
    r.publish = AsyncMock(return_value=1)
    r.rpush = AsyncMock(return_value=1)
    r.expire = AsyncMock(return_value=True)
    r.get = AsyncMock(return_value=None)
    return r


@pytest.fixture
def emitter(mock_redis):
    return AgencyEventEmitter(
        redis_client=mock_redis,
        run_id="run_001",
        agency_id="agency_abc",
    )


class TestAgencyEventEmitter:
    @pytest.mark.asyncio
    async def test_emit_publishes_to_redis_channel(self, emitter, mock_redis):
        """AgencyEventEmitter publishes to Redis channel."""
        await emitter.emit("text_delta", {"agentName": "Agent1", "delta": "Hello"})

        mock_redis.publish.assert_called_once()
        call_args = mock_redis.publish.call_args
        assert call_args[0][0] == "agency:stream:run_001"

        published_json = call_args[0][1]
        envelope = json.loads(published_json)
        assert envelope["event"] == "text_delta"
        assert envelope["data"]["agentName"] == "Agent1"
        assert envelope["data"]["delta"] == "Hello"

    @pytest.mark.asyncio
    async def test_emit_persists_to_replay_list(self, emitter, mock_redis):
        """AgencyEventEmitter persists events to Redis list for replay."""
        await emitter.emit("tool_start", {
            "agentName": "Agent1",
            "toolName": "search",
            "toolCallId": "tc_001",
        })

        mock_redis.rpush.assert_called_once()
        call_args = mock_redis.rpush.call_args
        assert call_args[0][0] == "agency:stream:run_001:events"

        mock_redis.expire.assert_called_once_with(
            "agency:stream:run_001:events", REPLAY_LIST_TTL,
        )

    @pytest.mark.asyncio
    async def test_emit_assigns_monotonic_event_ids(self, emitter, mock_redis):
        """AgencyEventEmitter assigns monotonic event IDs."""
        await emitter.emit("text_delta", {"agentName": "A", "delta": "1"})
        await emitter.emit("text_delta", {"agentName": "A", "delta": "2"})
        await emitter.emit("text_delta", {"agentName": "A", "delta": "3"})

        assert mock_redis.publish.call_count == 3

        ids = []
        for call in mock_redis.publish.call_args_list:
            envelope = json.loads(call[0][1])
            ids.append(envelope["id"])

        assert ids == ["1", "2", "3"]

    @pytest.mark.asyncio
    async def test_emit_meta(self, emitter, mock_redis):
        """emit_meta sends meta event with runId and agencyId."""
        await emitter.emit_meta()

        envelope = json.loads(mock_redis.publish.call_args[0][1])
        assert envelope["event"] == "meta"
        assert envelope["data"]["runId"] == "run_001"
        assert envelope["data"]["agencyId"] == "agency_abc"

    @pytest.mark.asyncio
    async def test_emit_complete(self, emitter, mock_redis):
        """emit_complete sends run_complete event with usage."""
        await emitter.emit_complete({"tokens": 500, "cost": 0.05})

        envelope = json.loads(mock_redis.publish.call_args[0][1])
        assert envelope["event"] == "run_complete"
        assert envelope["data"]["runId"] == "run_001"
        assert envelope["data"]["usage"]["tokens"] == 500

    @pytest.mark.asyncio
    async def test_emit_error(self, emitter, mock_redis):
        """emit_error sends error event."""
        await emitter.emit_error("timeout", "Run timed out")

        envelope = json.loads(mock_redis.publish.call_args[0][1])
        assert envelope["event"] == "error"
        assert envelope["data"]["code"] == "timeout"
        assert envelope["data"]["message"] == "Run timed out"

    @pytest.mark.asyncio
    async def test_envelope_has_timestamp(self, emitter, mock_redis):
        """Emitted events include ISO timestamp."""
        await emitter.emit("meta", {"runId": "run_001", "agencyId": "agency_abc"})

        envelope = json.loads(mock_redis.publish.call_args[0][1])
        assert "ts" in envelope
        assert envelope["ts"].endswith("Z")

    @pytest.mark.asyncio
    async def test_emit_graceful_on_redis_failure(self, mock_redis):
        """Emitter does not raise if Redis publish fails."""
        mock_redis.publish.side_effect = ConnectionError("Redis down")
        emitter = AgencyEventEmitter(mock_redis, "run_fail", "agency_fail")

        # Should not raise
        await emitter.emit("error", {"code": "test", "message": "test"})


class TestCheckCancelled:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_cancel(self, mock_redis):
        """Returns None when no cancellation key exists."""
        mock_redis.get.return_value = None
        result = await check_cancelled(mock_redis, "run_001")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_mode_when_cancelled(self, mock_redis):
        """Returns cancellation mode when key exists."""
        mock_redis.get.return_value = "immediate"
        result = await check_cancelled(mock_redis, "run_001")
        assert result == "immediate"

    @pytest.mark.asyncio
    async def test_returns_none_when_redis_is_none(self):
        """Returns None when redis_client is None."""
        result = await check_cancelled(None, "run_001")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_redis_error(self, mock_redis):
        """Returns None if Redis get fails."""
        mock_redis.get.side_effect = ConnectionError("down")
        result = await check_cancelled(mock_redis, "run_001")
        assert result is None
