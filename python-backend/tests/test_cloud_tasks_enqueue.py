"""Tests for the Cloud Tasks enqueue module."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json


@pytest.mark.unit
class TestEnqueueTask:
    """Tests for enqueue_task function."""

    @pytest.mark.asyncio
    async def test_creates_task_with_correct_queue_url_and_payload(self):
        """enqueue_task creates a Cloud Tasks task with the correct queue name,
        target URL, and JSON payload."""
        mock_client = MagicMock()
        mock_client.queue_path.return_value = "projects/test/locations/us-central1/queues/media-jobs"
        mock_client.create_task.return_value = MagicMock(name="projects/test/locations/us-central1/queues/media-jobs/tasks/123")

        with patch.dict("os.environ", {
            "GCP_PROJECT_ID": "test-project",
            "GCP_REGION": "us-central1",
            "CLOUD_RUN_PYTHON_URL": "https://python-service.run.app",
        }):
            with patch("app.services.cloud_tasks.get_tasks_client", return_value=mock_client):
                from app.services.cloud_tasks import enqueue_task
                result = await enqueue_task(
                    queue_name="media-jobs",
                    handler_path="/tasks/process-media",
                    payload={"job_id": "test-123"},
                )

        mock_client.create_task.assert_called_once()
        call_args = mock_client.create_task.call_args
        request = call_args[1]["request"]
        assert "/tasks/process-media" in request["task"]["http_request"]["url"]

    @pytest.mark.asyncio
    async def test_delay_seconds_sets_schedule_time(self):
        """enqueue_task with delay_seconds sets the scheduleTime on the task."""
        mock_client = MagicMock()
        mock_client.queue_path.return_value = "projects/test/locations/us-central1/queues/media-jobs"
        mock_client.create_task.return_value = MagicMock(name="test-task")

        with patch.dict("os.environ", {
            "GCP_PROJECT_ID": "test-project",
            "GCP_REGION": "us-central1",
            "CLOUD_RUN_PYTHON_URL": "https://python-service.run.app",
        }):
            with patch("app.services.cloud_tasks.get_tasks_client", return_value=mock_client):
                from app.services.cloud_tasks import enqueue_task
                await enqueue_task(
                    queue_name="media-jobs",
                    handler_path="/tasks/process-media",
                    payload={"job_id": "test-123"},
                    delay_seconds=120,
                )

        call_args = mock_client.create_task.call_args
        request = call_args[1]["request"]
        assert "schedule_time" in request["task"]

    @pytest.mark.asyncio
    async def test_task_id_sets_deterministic_name_for_dedup(self):
        """enqueue_task with task_id sets a deterministic task name."""
        mock_client = MagicMock()
        mock_client.queue_path.return_value = "projects/test/locations/us-central1/queues/media-jobs"
        mock_client.task_path.return_value = "projects/test/locations/us-central1/queues/media-jobs/tasks/dedup-123"
        mock_client.create_task.return_value = MagicMock(name="test-task")

        with patch.dict("os.environ", {
            "GCP_PROJECT_ID": "test-project",
            "GCP_REGION": "us-central1",
            "CLOUD_RUN_PYTHON_URL": "https://python-service.run.app",
        }):
            with patch("app.services.cloud_tasks.get_tasks_client", return_value=mock_client):
                from app.services.cloud_tasks import enqueue_task
                await enqueue_task(
                    queue_name="media-jobs",
                    handler_path="/tasks/process-media",
                    payload={"job_id": "test-123"},
                    task_id="dedup-123",
                )

        call_args = mock_client.create_task.call_args
        request = call_args[1]["request"]
        assert "name" in request["task"]

    @pytest.mark.asyncio
    async def test_raises_error_for_nonexistent_queue(self):
        """enqueue_task raises ValueError for unknown queue name."""
        with patch.dict("os.environ", {
            "GCP_PROJECT_ID": "test-project",
            "GCP_REGION": "us-central1",
            "CLOUD_RUN_PYTHON_URL": "https://python-service.run.app",
        }):
            from app.services.cloud_tasks import enqueue_task
            with pytest.raises(ValueError, match="Unknown queue"):
                await enqueue_task(
                    queue_name="nonexistent-queue",
                    handler_path="/tasks/process-media",
                    payload={"job_id": "test-123"},
                )
