"""Tests for virtual_admin Celery health endpoint."""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


@pytest.mark.unit
class TestCeleryHealth:
    """Test GET /api/internal/virtual-admin/celery-health."""

    @pytest.mark.asyncio
    async def test_healthy_response_structure(self):
        """Returns expected keys when Celery inspect succeeds."""
        mock_inspect = MagicMock()
        mock_inspect.active.return_value = {"worker1@host": [{"id": "task-1"}]}
        mock_inspect.stats.return_value = {"worker1@host": {}}

        mock_celery = MagicMock()
        mock_celery.control.inspect.return_value = mock_inspect
        mock_celery.conf.broker_url = None  # Skip Redis queue length path

        with patch("app.api.virtual_admin.celery_app", mock_celery, create=True):
            from app.api.virtual_admin import celery_health

            result = await celery_health()

        assert "workers" in result
        assert "activeTasks" in result
        assert "queueLengths" in result
        assert "healthy" in result
        assert result["workers"] == 1
        assert result["activeTasks"] == 1
        assert result["healthy"] is True

    @pytest.mark.asyncio
    async def test_unhealthy_when_no_workers(self):
        """healthy=False when no workers respond to inspect."""
        mock_inspect = MagicMock()
        mock_inspect.active.return_value = {}
        mock_inspect.stats.return_value = {}

        mock_celery = MagicMock()
        mock_celery.control.inspect.return_value = mock_inspect
        mock_celery.conf.broker_url = None

        with patch("app.api.virtual_admin.celery_app", mock_celery, create=True):
            from app.api.virtual_admin import celery_health

            result = await celery_health()

        assert result["workers"] == 0
        assert result["healthy"] is False

    @pytest.mark.asyncio
    async def test_response_does_not_leak_exception_details(self):
        """Error response uses generic message, not the raw exception string."""
        mock_celery = MagicMock()
        mock_celery.control.inspect.side_effect = RuntimeError("redis://secret-host:6379/0 connection refused")

        with patch("app.api.virtual_admin.celery_app", mock_celery, create=True):
            from app.api.virtual_admin import celery_health

            result = await celery_health()

        assert result["healthy"] is False
        assert result.get("error") == "health check unavailable"
        # Must not expose broker URL or internal exception text
        assert "secret-host" not in str(result)
        assert "redis://" not in str(result)

    @pytest.mark.asyncio
    async def test_restart_worker_sends_shutdown_broadcast(self):
        """POST /restart-worker broadcasts shutdown to the named worker."""
        mock_celery = MagicMock()

        with patch("app.api.virtual_admin.celery_app", mock_celery, create=True):
            from app.api.virtual_admin import restart_worker
            from unittest.mock import AsyncMock as AM
            from starlette.testclient import TestClient
            import json

            # Test via direct call with a mock Request
            mock_request = AsyncMock()
            mock_request.json = AsyncMock(return_value={"worker_name": "celery@worker1"})

            result = await restart_worker(mock_request)

        assert result["success"] is True
        mock_celery.control.broadcast.assert_called_once_with(
            "shutdown", destination=["celery@worker1"]
        )

    @pytest.mark.asyncio
    async def test_restart_worker_broadcasts_to_all_when_no_name(self):
        """POST /restart-worker broadcasts to all workers when worker_name omitted."""
        mock_celery = MagicMock()

        with patch("app.api.virtual_admin.celery_app", mock_celery, create=True):
            from app.api.virtual_admin import restart_worker

            mock_request = AsyncMock()
            mock_request.json = AsyncMock(return_value={})

            result = await restart_worker(mock_request)

        assert result["success"] is True
        mock_celery.control.broadcast.assert_called_once_with("shutdown")

    @pytest.mark.asyncio
    async def test_restart_worker_returns_generic_error_on_failure(self):
        """POST /restart-worker returns generic error message, not exception details."""
        mock_celery = MagicMock()
        mock_celery.control.broadcast.side_effect = Exception("AMQP connection to secret-broker failed")

        with patch("app.api.virtual_admin.celery_app", mock_celery, create=True):
            from app.api.virtual_admin import restart_worker

            mock_request = AsyncMock()
            mock_request.json = AsyncMock(return_value={"worker_name": "celery@worker1"})

            result = await restart_worker(mock_request)

        assert result["success"] is False
        assert result.get("error") == "restart failed"
        assert "secret-broker" not in str(result)

    @pytest.mark.asyncio
    async def test_revoke_task_requires_task_id(self):
        """POST /revoke-task returns error when task_id missing."""
        from app.api.virtual_admin import revoke_task

        mock_request = AsyncMock()
        mock_request.json = AsyncMock(return_value={})

        result = await revoke_task(mock_request)

        assert result["success"] is False
        assert result.get("error") == "task_id required"

    @pytest.mark.asyncio
    async def test_revoke_task_calls_celery_revoke(self):
        """POST /revoke-task calls celery_app.control.revoke with correct args."""
        mock_celery = MagicMock()

        with patch("app.api.virtual_admin.celery_app", mock_celery, create=True):
            from app.api.virtual_admin import revoke_task

            mock_request = AsyncMock()
            mock_request.json = AsyncMock(return_value={"task_id": "abc-123", "terminate": True})

            result = await revoke_task(mock_request)

        assert result["success"] is True
        mock_celery.control.revoke.assert_called_once_with("abc-123", terminate=True)

    @pytest.mark.asyncio
    async def test_revoke_task_returns_generic_error_on_failure(self):
        """POST /revoke-task error response does not expose exception internals."""
        mock_celery = MagicMock()
        mock_celery.control.revoke.side_effect = Exception("connection to redis://secret:6379 failed")

        with patch("app.api.virtual_admin.celery_app", mock_celery, create=True):
            from app.api.virtual_admin import revoke_task

            mock_request = AsyncMock()
            mock_request.json = AsyncMock(return_value={"task_id": "abc-123", "terminate": False})

            result = await revoke_task(mock_request)

        assert result["success"] is False
        assert result.get("error") == "revoke failed"
        assert "secret" not in str(result)
