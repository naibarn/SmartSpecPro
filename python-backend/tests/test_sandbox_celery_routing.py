"""Tests for Celery queue routing — sandbox tasks routed to dedicated queue."""
import pytest

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestQueueRouting:
    """Sandbox Celery tasks use the 'sandbox' queue."""

    def test_sandbox_tasks_routed_to_sandbox_queue(self):
        """The sandbox job worker task is routed to the 'sandbox' queue in task_routes."""
        from app.core.celery_app import celery_app

        routes = celery_app.conf.task_routes
        assert routes.get("app.workers.sandbox_job_worker.execute_sandbox_job") == {
            "queue": "sandbox"
        }

    def test_existing_queues_unaffected(self):
        """Existing media, video, presentation queues remain unchanged."""
        from app.core.celery_app import REQUIRED_QUEUES

        for q in ["celery", "video", "media", "presentation_export", "presentation_import"]:
            assert q in REQUIRED_QUEUES

    def test_sandbox_queue_declared(self):
        """The 'sandbox' Queue is declared in task_queues config."""
        from app.core.celery_app import celery_app

        queue_names = [q.name for q in celery_app.conf.task_queues]
        assert "sandbox" in queue_names

    def test_sandbox_in_required_queues(self):
        """Sandbox queue is in REQUIRED_QUEUES list."""
        from app.core.celery_app import REQUIRED_QUEUES

        assert "sandbox" in REQUIRED_QUEUES
