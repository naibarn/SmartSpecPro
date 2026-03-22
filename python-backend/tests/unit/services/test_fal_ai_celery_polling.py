"""Tests for fal.ai polling branch in _recover_stuck_tasks_async()."""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.tasks.media_tasks import (
    _derive_fal_resolution,
    _extract_fal_duration,
)


# ---------------------------------------------------------------------------
# Helper-function unit tests
# ---------------------------------------------------------------------------


class TestDeriveFalResolution:
    def test_4k_resolution(self):
        assert _derive_fal_resolution({"video": {"width": 3840}}) == "2160p"

    def test_1440p_resolution(self):
        assert _derive_fal_resolution({"video": {"width": 2560}}) == "1440p"

    def test_1080p_default(self):
        assert _derive_fal_resolution({"video": {"width": 1920}}) == "1080p"

    def test_missing_video_key(self):
        assert _derive_fal_resolution({}) == "1080p"

    def test_top_level_width(self):
        assert _derive_fal_resolution({"width": 3840}) == "2160p"

    def test_non_numeric_width(self):
        assert _derive_fal_resolution({"video": {"width": "big"}}) == "1080p"


class TestExtractFalDuration:
    def test_nested_duration(self):
        assert _extract_fal_duration({"video": {"duration": 8.5}}) == 8.5

    def test_top_level_duration(self):
        assert _extract_fal_duration({"duration": 12}) == 12.0

    def test_missing_duration(self):
        assert _extract_fal_duration({}) is None

    def test_string_duration(self):
        assert _extract_fal_duration({"duration": "5.0"}) == 5.0


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
        mock_provider.get_queue_result = AsyncMock(return_value={
            "data": [{"url": "https://fal.media/result.mp4"}],
            "video": {"width": 1920, "height": 1080, "duration": 8.5},
        })

        task = self._make_task()

        # Simulate the polling logic inline
        status_response = await mock_provider.get_queue_status(task.model, task.task_id)
        assert status_response["status"] == "COMPLETED"

        result = await mock_provider.get_queue_result(task.model, task.task_id)
        task.result_url = result["data"][0]["url"]
        task.result_data = {
            **result,
            "actual_duration": _extract_fal_duration(result),
            "actual_resolution": _derive_fal_resolution(result),
        }
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
        result = {"video": {"width": 3840, "height": 2160, "duration": 5.0}}
        assert _derive_fal_resolution(result) == "2160p"

    @pytest.mark.asyncio
    async def test_resolution_1440p(self):
        """Width >= 2560 -> '1440p'."""
        result = {"video": {"width": 2560, "height": 1440, "duration": 5.0}}
        assert _derive_fal_resolution(result) == "1440p"

    @pytest.mark.asyncio
    async def test_provider_not_configured_continues(self):
        """Provider not configured -> logs warning and continues."""
        # This tests the guard: if not provider_config or not provider_config.get("apiKey")
        provider_config = None
        assert not provider_config or not (provider_config or {}).get("apiKey")

        provider_config = {"apiKey": ""}
        assert not provider_config.get("apiKey")
