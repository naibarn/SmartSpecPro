"""Tests for automation_copilot_task — Celery tasks for Automation Copilot."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.tasks.automation_copilot_task import (
    RESULT_TTL,
    _set_status,
    get_status,
)


@pytest.fixture
def mock_redis():
    r = MagicMock()
    store = {}

    def set_side_effect(key, value, **kwargs):
        store[key] = value

    def get_side_effect(key):
        return store.get(key)

    def delete_side_effect(*keys):
        for k in keys:
            store.pop(k, None)

    r.set = MagicMock(side_effect=set_side_effect)
    r.get = MagicMock(side_effect=get_side_effect)
    r.delete = MagicMock(side_effect=delete_side_effect)
    r._store = store
    return r


class TestStatusStorage:
    def test_set_status_stores_in_redis(self, mock_redis):
        with patch("app.tasks.automation_copilot_task._get_redis", return_value=mock_redis):
            _set_status("task-1", {"status": "analyzing", "tenant_id": "t1"})

        mock_redis.set.assert_called_once()
        key = mock_redis.set.call_args[0][0]
        assert "task-1" in key

    def test_get_status_returns_stored_status(self, mock_redis):
        status = {"status": "analyzing", "tenant_id": "t1"}
        mock_redis._store["automation:task-1"] = json.dumps(status)

        with patch("app.tasks.automation_copilot_task._get_redis", return_value=mock_redis):
            result = get_status("task-1")

        assert result is not None
        assert result["status"] == "analyzing"

    def test_get_status_returns_none_for_unknown_task(self, mock_redis):
        with patch("app.tasks.automation_copilot_task._get_redis", return_value=mock_redis):
            result = get_status("unknown-task")
        assert result is None

    def test_status_ttl_is_3600(self):
        assert RESULT_TTL == 3600


class TestCancellation:
    def test_cancel_key_format(self, mock_redis):
        """Cancel key should be automation:{task_id}:cancel."""
        with patch("app.tasks.automation_copilot_task._get_redis", return_value=mock_redis):
            mock_redis.set("automation:task-1:cancel", "1", ex=3600)

        val = mock_redis._store.get("automation:task-1:cancel")
        assert val == "1"
