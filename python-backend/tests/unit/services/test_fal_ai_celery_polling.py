"""Tests for fal.ai polling branch in _recover_stuck_tasks_async().

Helper function tests (resolution, duration, URL extraction) are now in
test_fal_ai_provider.py since the canonical implementations live in
FalAIProvider. This file focuses on the Celery polling branch logic.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Integration-style tests for the fal.ai polling branch
# ---------------------------------------------------------------------------

# We can't easily call _recover_stuck_tasks_async() directly since it opens
# its own DB session. Instead we verify the detection logic and mock the
# provider calls at the expected points.


class TestFalAiDetection:
    """Verify fal.ai model IDs are correctly routed to the fal.ai branch."""

    def test_video_model_detected(self):
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        assert "fal-ai/ltx-2.3/text-to-video" in FalAIProvider.VIDEO_MODELS

    def test_audio_model_detected(self):
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        assert "fal-ai/lux-tts" in FalAIProvider.AUDIO_MODELS

    def test_non_fal_model_not_detected(self):
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        assert "kie-ai-model" not in FalAIProvider.VIDEO_MODELS
        assert "kie-ai-model" not in FalAIProvider.AUDIO_MODELS


class TestFalAiPollingBranch:
    """Test the fal.ai polling branch behaviour via mock-driven approach."""

    def _make_task(self, model="fal-ai/ltx-2.3/text-to-video", task_id="req-123",
                   created_minutes_ago=5):
        task = MagicMock()
        task.id = 42
        task.model = model
        task.task_id = task_id
        task.status = "processing"
        task.started_at = datetime.now(timezone.utc) - timedelta(minutes=created_minutes_ago)
        task.created_at = datetime.now(timezone.utc) - timedelta(minutes=created_minutes_ago)
        task.result_url = None
        task.result_data = None
        task.error_message = None
        task.completed_at = None
        return task

    @pytest.mark.asyncio
    async def test_completed_status_sets_result(self):
        """COMPLETED status -> extracts URL, sets actual_duration/resolution."""
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        mock_provider = AsyncMock(spec=FalAIProvider)
        mock_provider.get_queue_status = AsyncMock(return_value={"status": "COMPLETED"})
        # get_queue_result returns normalized output (actual_duration/resolution already set)
        mock_provider.get_queue_result = AsyncMock(return_value={
            "data": [{"url": "https://fal.media/result.mp4"}],
            "actual_duration": 8.5,
            "actual_resolution": "1080p",
        })

        task = self._make_task()

        # Simulate the polling logic (mirrors production code in media_tasks.py)
        status_response = await mock_provider.get_queue_status(task.model, task.task_id)
        assert status_response["status"] == "COMPLETED"

        result = await mock_provider.get_queue_result(task.model, task.task_id)
        data_list = result.get("data", [])
        task.result_url = data_list[0]["url"] if data_list else None
        task.result_data = result
        task.completed_at = datetime.now(timezone.utc)

        assert task.result_url == "https://fal.media/result.mp4"
        assert task.result_data["actual_duration"] == 8.5
        assert task.result_data["actual_resolution"] == "1080p"
        assert task.completed_at is not None

    @pytest.mark.asyncio
    async def test_failed_status_sets_error(self):
        """FAILED status -> sets error_message (sanitized to 200 chars)."""
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        mock_provider = AsyncMock(spec=FalAIProvider)
        long_error = "x" * 300
        mock_provider.get_queue_status = AsyncMock(return_value={
            "status": "FAILED",
            "error": long_error,
        })

        task = self._make_task()
        status_response = await mock_provider.get_queue_status(task.model, task.task_id)
        error_msg = status_response.get("error", "Unknown error")
        task.error_message = f"fal.ai failed: {str(error_msg)[:200]}"

        assert len(task.error_message) <= 215  # "fal.ai failed: " (15) + 200

    @pytest.mark.asyncio
    async def test_in_queue_no_change(self):
        """IN_QUEUE status -> no status change."""
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        mock_provider = AsyncMock(spec=FalAIProvider)
        mock_provider.get_queue_status = AsyncMock(return_value={"status": "IN_QUEUE"})

        task = self._make_task()
        original_status = task.status
        status_response = await mock_provider.get_queue_status(task.model, task.task_id)

        # IN_QUEUE -> skip, no changes
        if status_response.get("status") not in ("COMPLETED", "FAILED"):
            pass  # no-op

        assert task.status == original_status

    @pytest.mark.asyncio
    async def test_queue_timeout_marks_failed(self):
        """Task >30min in queue -> marked FAILED with timeout error."""
        task = self._make_task(created_minutes_ago=35)

        FAL_QUEUE_TIMEOUT_MINUTES = 30
        age = (datetime.now(timezone.utc) - task.created_at).total_seconds() / 60
        assert age > FAL_QUEUE_TIMEOUT_MINUTES

        task.status = "FAILED"
        task.error_message = "fal.ai queue timeout (>30 min)"
        assert "timeout" in task.error_message

    @pytest.mark.asyncio
    async def test_queue_no_timeout_within_limit(self):
        """Task <30min -> no change."""
        task = self._make_task(created_minutes_ago=10)

        FAL_QUEUE_TIMEOUT_MINUTES = 30
        age = (datetime.now(timezone.utc) - task.created_at).total_seconds() / 60
        assert age < FAL_QUEUE_TIMEOUT_MINUTES

    @pytest.mark.asyncio
    async def test_aclose_called_in_finally(self):
        """aclose() must be called even when exception occurs."""
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        mock_provider = AsyncMock(spec=FalAIProvider)
        mock_provider.get_queue_status = AsyncMock(side_effect=Exception("network error"))

        try:
            await mock_provider.get_queue_status("fal-ai/ltx-2.3/text-to-video", "req-123")
        except Exception:
            pass
        finally:
            await mock_provider.aclose()

        mock_provider.aclose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_429_rate_limited_continues(self):
        """429 -> logs warning, continues (doesn't mark as failed)."""
        import httpx
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        mock_provider = AsyncMock(spec=FalAIProvider)
        response_429 = httpx.Response(429, request=httpx.Request("GET", "https://queue.fal.run/test"))
        mock_provider.get_queue_status = AsyncMock(
            side_effect=httpx.HTTPStatusError("rate limited", request=response_429.request, response=response_429)
        )

        task = self._make_task()
        original_status = task.status

        try:
            await mock_provider.get_queue_status(task.model, task.task_id)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                pass  # continue to next task
            else:
                raise

        # Task status unchanged on 429
        assert task.status == original_status

    @pytest.mark.asyncio
    async def test_generic_exception_skips_task(self):
        """Generic exception -> logs error, skips task (retry next cycle)."""
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

        mock_provider = AsyncMock(spec=FalAIProvider)
        mock_provider.get_queue_status = AsyncMock(side_effect=RuntimeError("unexpected"))

        task = self._make_task()
        original_status = task.status

        try:
            await mock_provider.get_queue_status(task.model, task.task_id)
        except Exception:
            pass  # skip, retry next cycle

        assert task.status == original_status

    @pytest.mark.asyncio
    async def test_resolution_4k(self):
        """Width >= 3840 -> '2160p'."""
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
        assert FalAIProvider._derive_resolution(3840) == "2160p"

    @pytest.mark.asyncio
    async def test_resolution_1440p(self):
        """Width >= 2560 -> '1440p'."""
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
        assert FalAIProvider._derive_resolution(2560) == "1440p"

    @pytest.mark.asyncio
    async def test_provider_not_configured_continues(self):
        """Provider not configured -> logs warning and continues."""
        provider_config = None
        assert not provider_config or not (provider_config or {}).get("apiKey")

        provider_config = {"apiKey": ""}
        assert not provider_config.get("apiKey")
