"""Tests for the Dead Letter Queue pattern."""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.api.v1.task_handlers import _check_dead_letter


@pytest.mark.unit
class TestDeadLetterQueue:
    """Tests for DLQ behavior on final retry."""

    @pytest.mark.asyncio
    async def test_final_retry_returns_true(self):
        """On the final retry attempt, _check_dead_letter returns True."""
        mock_request = MagicMock()
        mock_request.headers = {"X-CloudTasks-TaskRetryCount": "4"}

        result = await _check_dead_letter(
            request=mock_request,
            queue_name="media-jobs",
            payload={"job_id": "test-123"},
            error_message="Job failed after retries",
        )
        assert result is True

    @pytest.mark.asyncio
    async def test_non_final_retry_returns_false(self):
        """On non-final retry attempts, returns False."""
        mock_request = MagicMock()
        mock_request.headers = {"X-CloudTasks-TaskRetryCount": "1"}

        result = await _check_dead_letter(
            request=mock_request,
            queue_name="media-jobs",
            payload={"job_id": "test-123"},
            error_message="Transient error",
        )
        assert result is False

    @pytest.mark.asyncio
    async def test_missing_retry_header_treated_as_first_attempt(self):
        """Missing X-CloudTasks-TaskRetryCount treated as attempt 0."""
        mock_request = MagicMock()
        mock_request.headers = {}

        result = await _check_dead_letter(
            request=mock_request,
            queue_name="media-jobs",
            payload={"job_id": "test-123"},
            error_message="Error",
        )
        assert result is False
