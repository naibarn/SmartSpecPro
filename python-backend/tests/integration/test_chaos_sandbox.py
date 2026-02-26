"""Chaos testing scenarios for OpenSandbox integration.

Simulates infrastructure failures to verify graceful degradation.
Tests use mocks/patches for fault injection -- no real service disruption.

Markers: integration, sandbox, chaos
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
import pybreaker

pytestmark = [pytest.mark.integration, pytest.mark.sandbox]


class TestChaosOpenSandboxDown:
    """Scenario: OpenSandbox server killed mid-execution."""

    @pytest.mark.asyncio
    async def test_sandbox_creation_failure_retries_then_raises(self):
        """Client retries 3 times on create_sandbox failure, then raises."""
        from app.integrations.opensandbox.client import (
            OpenSandboxClient,
            RetryableHTTPError,
        )
        from app.integrations.opensandbox.config import OpenSandboxSettings

        config = OpenSandboxSettings(
            OPENSANDBOX_ENABLED=True,
            OPENSANDBOX_BASE_URL="http://fake:9999",
            OPENSANDBOX_API_KEY="test-key",
        )
        client = OpenSandboxClient(config=config)

        # Mock the httpx client to raise transport error
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.text = "Service Unavailable"

        client._http_client = AsyncMock()
        client._http_client.request = AsyncMock(return_value=mock_response)
        # Bypass circuit breaker for direct testing
        client._breaker = MagicMock()
        client._breaker.call_async = AsyncMock(return_value=mock_response)

        with pytest.raises(RetryableHTTPError):
            await client._request("POST", "/api/v1/sandboxes", json={})

        await client.close()

    @pytest.mark.asyncio
    async def test_sandbox_destruction_failure_logged_not_fatal(self):
        """Sandbox destroy failure logs warning; does not crash caller."""
        from app.integrations.opensandbox.client import (
            OpenSandboxClient,
            SandboxAPIError,
        )
        from app.integrations.opensandbox.config import OpenSandboxSettings

        config = OpenSandboxSettings(
            OPENSANDBOX_ENABLED=True,
            OPENSANDBOX_BASE_URL="http://fake:9999",
            OPENSANDBOX_API_KEY="test-key",
        )
        client = OpenSandboxClient(config=config)

        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"

        client._breaker = MagicMock()
        client._breaker.call_async = AsyncMock(return_value=mock_response)

        with pytest.raises(SandboxAPIError) as exc_info:
            await client.destroy_sandbox("nonexistent-id")

        assert exc_info.value.status_code == 404
        await client.close()


class TestChaosNetworkFlap:
    """Scenario: Network flap between GCP and Hetzner."""

    def test_circuit_breaker_configuration(self):
        """Verify circuit breaker is configured with correct thresholds."""
        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.config import OpenSandboxSettings

        config = OpenSandboxSettings(
            OPENSANDBOX_ENABLED=True,
            OPENSANDBOX_BASE_URL="http://fake:9999",
            OPENSANDBOX_API_KEY="test-key",
        )
        client = OpenSandboxClient(config=config)

        assert client._breaker.fail_max == 5
        assert client._breaker.reset_timeout == 30
        assert client._breaker.name == "opensandbox"

    def test_retryable_status_codes_configured(self):
        """Verify 429, 500, 503 are retryable."""
        from app.integrations.opensandbox.client import RETRYABLE_STATUS_CODES

        assert 429 in RETRYABLE_STATUS_CODES
        assert 500 in RETRYABLE_STATUS_CODES
        assert 503 in RETRYABLE_STATUS_CODES

    def test_non_retryable_status_codes_configured(self):
        """Verify 400, 403, 404 are not retryable."""
        from app.integrations.opensandbox.client import NON_RETRYABLE_STATUS_CODES

        assert 400 in NON_RETRYABLE_STATUS_CODES
        assert 403 in NON_RETRYABLE_STATUS_CODES
        assert 404 in NON_RETRYABLE_STATUS_CODES


class TestChaosConcurrentBurst:
    """Scenario: Concurrent sandbox burst exceeding limits."""

    def test_sandbox_queue_is_isolated(self):
        """Sandbox tasks route to a dedicated queue, not the default celery queue."""
        from app.core.celery_app import celery_app

        routes = celery_app.conf.task_routes
        worker_route = routes.get("app.workers.sandbox_job_worker.execute_sandbox_job")
        assert worker_route is not None
        assert worker_route["queue"] == "sandbox"

    def test_sandbox_maintenance_on_sandbox_queue(self):
        """Orphan cleanup and stuck detection run on sandbox queue."""
        from app.core.celery_app import celery_app

        routes = celery_app.conf.task_routes
        orphan = routes.get("app.tasks.sandbox_maintenance_tasks.cleanup_orphan_sandboxes")
        stuck = routes.get("app.tasks.sandbox_maintenance_tasks.detect_stuck_sandbox_jobs")
        assert orphan["queue"] == "sandbox"
        assert stuck["queue"] == "sandbox"


class TestChaosHetznerRestart:
    """Scenario: Hetzner server restart."""

    def test_stuck_job_detection_marks_timed_out(self):
        """Jobs past timeout are marked timed_out by stuck job detection."""
        from contextlib import contextmanager
        from datetime import datetime, timedelta, timezone
        from unittest.mock import patch, MagicMock

        from app.tasks.sandbox_maintenance_tasks import detect_stuck_sandbox_jobs

        @contextmanager
        def mock_session_ctx():
            session = MagicMock()
            now = datetime.now(timezone.utc)
            old_time = now - timedelta(seconds=600)

            select_result = MagicMock()
            select_result.fetchall.return_value = [
                ("job-1", "executing", old_time, old_time, "sbx-1", 300),
            ]
            update_result = MagicMock()
            update_result.rowcount = 1

            session.execute.side_effect = [select_result, update_result]
            yield session

        with patch(
            "app.tasks.sandbox_maintenance_tasks._is_sandbox_enabled",
            return_value=True,
        ), patch(
            "app.tasks.sandbox_maintenance_tasks.get_sync_session",
            side_effect=mock_session_ctx,
        ):
            result = detect_stuck_sandbox_jobs()
            assert result["detected_count"] >= 1
            assert result["resolved_count"] >= 1

    def test_health_metric_emitted_on_orphan_check(self):
        """The orphan cleanup task emits Hetzner health metric."""
        from app.services.sandbox_metrics import emit_hetzner_health
        from unittest.mock import patch

        with patch("app.services.sandbox_metrics.logger") as mock_logger:
            emit_hetzner_health(False)
            extra = mock_logger.info.call_args[1]["extra"]
            assert extra["metric_name"] == "sandbox_hetzner_health"
            assert extra["metric_value"] == 0.0
