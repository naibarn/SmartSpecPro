"""Tests for OpenSandbox lifecycle management."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxLifecycle:
    """Tests for provision, destroy, and idempotent get_or_create."""

    def _make_settings(self):
        from app.integrations.opensandbox.config import OpenSandboxSettings

        return OpenSandboxSettings(
            OPENSANDBOX_ENABLED=True,
            OPENSANDBOX_BASE_URL="http://sandbox.test:8080",
            OPENSANDBOX_API_KEY="test-key",
            OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=5,
            OPENSANDBOX_CREATE_TIMEOUT_SECONDS=10,
            OPENSANDBOX_READY_POLL_INTERVAL_MS=100,
            _env_file=None,
        )

    async def test_provision_sandbox_creates_and_polls_until_ready(self):
        """provision_sandbox() calls create, then polls status until 'running'."""
        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
        from app.integrations.opensandbox.models import SandboxConfig, SandboxStatus

        mock_client = AsyncMock()
        mock_client.create_sandbox = AsyncMock(return_value="sb-new-1")
        mock_client.get_sandbox_status = AsyncMock(
            side_effect=[
                SandboxStatus(id="sb-new-1", status="creating"),
                SandboxStatus(id="sb-new-1", status="running"),
            ]
        )

        config = self._make_settings()
        manager = SandboxLifecycleManager(mock_client, config)
        sandbox_id = await manager.provision_sandbox(SandboxConfig(), "job-1")

        assert sandbox_id == "sb-new-1"
        mock_client.create_sandbox.assert_called_once()
        assert mock_client.get_sandbox_status.call_count == 2

    async def test_provision_sandbox_fails_after_max_poll_attempts(self):
        """provision_sandbox() raises after exhausting poll attempts."""
        from app.integrations.opensandbox.client import SandboxProvisionError
        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
        from app.integrations.opensandbox.models import SandboxConfig, SandboxStatus

        mock_client = AsyncMock()
        mock_client.create_sandbox = AsyncMock(return_value="sb-stuck")
        # Always return 'creating' -- never reaches 'running'
        mock_client.get_sandbox_status = AsyncMock(
            return_value=SandboxStatus(id="sb-stuck", status="creating")
        )

        config = self._make_settings()
        # Very short timeout so test doesn't hang
        config.OPENSANDBOX_CREATE_TIMEOUT_SECONDS = 1
        config.OPENSANDBOX_READY_POLL_INTERVAL_MS = 100
        manager = SandboxLifecycleManager(mock_client, config)

        with pytest.raises(SandboxProvisionError):
            await manager.provision_sandbox(SandboxConfig(), "job-stuck")

    async def test_destroy_sandbox_calls_client_destroy(self):
        """destroy_sandbox() delegates to client and handles success."""
        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager

        mock_client = AsyncMock()
        mock_client.destroy_sandbox = AsyncMock(return_value=None)

        config = self._make_settings()
        manager = SandboxLifecycleManager(mock_client, config)
        await manager.destroy_sandbox("sb-del-1")
        mock_client.destroy_sandbox.assert_called_once_with("sb-del-1")

    async def test_destroy_already_destroyed_sandbox_is_graceful(self):
        """destroy_sandbox() handles 404 (already gone) without raising."""
        from app.integrations.opensandbox.client import SandboxAPIError
        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager

        mock_client = AsyncMock()
        mock_client.destroy_sandbox = AsyncMock(
            side_effect=SandboxAPIError(404, "not found")
        )

        config = self._make_settings()
        manager = SandboxLifecycleManager(mock_client, config)
        # Should not raise
        await manager.destroy_sandbox("sb-already-gone")

    async def test_get_or_create_returns_existing_for_same_job_id(self):
        """get_or_create() with same job_id returns the cached sandbox."""
        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
        from app.integrations.opensandbox.models import SandboxConfig, SandboxStatus

        mock_client = AsyncMock()
        mock_client.create_sandbox = AsyncMock(return_value="sb-cached")
        mock_client.get_sandbox_status = AsyncMock(
            return_value=SandboxStatus(id="sb-cached", status="running")
        )

        config = self._make_settings()
        manager = SandboxLifecycleManager(mock_client, config)
        sb_config = SandboxConfig()

        # First call provisions
        id1 = await manager.get_or_create(sb_config, "job-same")
        # Second call returns cached
        id2 = await manager.get_or_create(sb_config, "job-same")

        assert id1 == id2
        # create_sandbox called only once
        assert mock_client.create_sandbox.call_count == 1

    async def test_get_or_create_creates_new_for_different_job_id(self):
        """get_or_create() with different job_id provisions a new sandbox."""
        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
        from app.integrations.opensandbox.models import SandboxConfig, SandboxStatus

        call_count = 0

        async def mock_create(config):
            nonlocal call_count
            call_count += 1
            return f"sb-{call_count}"

        mock_client = AsyncMock()
        mock_client.create_sandbox = AsyncMock(side_effect=mock_create)
        mock_client.get_sandbox_status = AsyncMock(
            side_effect=lambda sid: SandboxStatus(id=sid, status="running")
        )

        config = self._make_settings()
        manager = SandboxLifecycleManager(mock_client, config)
        sb_config = SandboxConfig()

        id1 = await manager.get_or_create(sb_config, "job-a")
        id2 = await manager.get_or_create(sb_config, "job-b")

        assert id1 != id2
        assert mock_client.create_sandbox.call_count == 2
