"""Tests for SandboxMediaRunner — the sandbox execution wrapper for FFmpeg commands.

All tests mock the OpenSandbox client. No real sandbox containers needed.
"""

import subprocess
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.integrations.opensandbox.models import CommandResult

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


@pytest.fixture
def mock_settings_enabled():
    """Patch opensandbox_settings to be enabled."""
    with patch(
        "app.video.sandbox_runner.opensandbox_settings"
    ) as mock_settings:
        mock_settings.is_enabled = True
        mock_settings.OPENSANDBOX_ENABLED = True
        mock_settings.OPENSANDBOX_BASE_URL = "http://localhost:8080"
        mock_settings.OPENSANDBOX_MEDIA_IMAGE = "jrottenberg/ffmpeg:6-ubuntu"
        mock_settings.OPENSANDBOX_DISPATCH_MODE = "optional"
        mock_settings.SANDBOX_REQUIRE_FOR_MEDIA = False
        yield mock_settings


@pytest.fixture
def mock_settings_disabled():
    """Patch opensandbox_settings to be disabled."""
    with patch(
        "app.video.sandbox_runner.opensandbox_settings"
    ) as mock_settings:
        mock_settings.is_enabled = False
        mock_settings.OPENSANDBOX_ENABLED = False
        yield mock_settings


@pytest.fixture
def mock_client():
    """Create a mock OpenSandboxClient."""
    client = AsyncMock()
    client.run_command.return_value = CommandResult(
        exit_code=0, stdout="ok", stderr=""
    )
    client.write_file = AsyncMock()
    client.read_file = AsyncMock(return_value=b"file-content")
    return client


@pytest.fixture
def mock_lifecycle(mock_client):
    """Create a mock SandboxLifecycleManager."""
    lifecycle = AsyncMock()
    lifecycle.provision_sandbox.return_value = "sandbox-abc-123"
    lifecycle.destroy_sandbox = AsyncMock()
    return lifecycle


class TestSandboxMediaRunner:
    """Tests for the SandboxMediaRunner class in app/video/sandbox_runner.py."""

    @pytest.mark.asyncio
    async def test_run_command_uses_sandbox_when_enabled(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """When OPENSANDBOX_ENABLED=true, FFmpeg commands execute via sandbox."""
        with patch(
            "app.integrations.opensandbox.client.OpenSandboxClient",
            return_value=mock_client,
        ), patch(
            "app.video.sandbox_runner.SandboxConfig",
        ) as mock_config_cls, patch(
            "app.integrations.opensandbox.lifecycle.SandboxLifecycleManager",
            return_value=mock_lifecycle,
        ), patch(
            "app.integrations.opensandbox.execution.run_command",
            new_callable=AsyncMock,
            return_value=CommandResult(exit_code=0, stdout="done", stderr=""),
        ) as mock_run:
            # Need to patch the deferred imports at their source
            with patch(
                "app.video.sandbox_runner.OpenSandboxClient",
                create=True,
            ) as _:
                pass

            # Instead, patch the imports where they are used
            from app.video.sandbox_runner import SandboxMediaRunner

            runner = SandboxMediaRunner(profile="media-processing")
            # Manually wire up the mocks since __aenter__ imports locally
            runner._enabled = True
            runner._client = mock_client
            runner._lifecycle = mock_lifecycle
            runner._sandbox_id = "sandbox-abc-123"

            result = await runner.run_command(["ffprobe", "-v", "quiet", "test.mp4"])

            assert result.returncode == 0
            assert result.stdout == "done"
            mock_run.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_command_falls_back_to_subprocess_when_disabled(
        self, mock_settings_disabled
    ):
        """When OPENSANDBOX_ENABLED=false, FFmpeg commands execute via subprocess.run()."""
        from app.video.sandbox_runner import SandboxMediaRunner

        mock_result = subprocess.CompletedProcess(
            args=["echo", "test"], returncode=0, stdout="test\n", stderr=""
        )

        with patch("asyncio.to_thread", new_callable=AsyncMock, return_value=mock_result):
            runner = SandboxMediaRunner()
            result = await runner.run_command(["echo", "test"])

            assert result.returncode == 0
            assert result.stdout == "test\n"

    @pytest.mark.asyncio
    async def test_session_context_manager_creates_and_destroys_sandbox(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Session context manager creates sandbox on enter and destroys on exit."""
        with patch(
            "app.video.sandbox_runner.SandboxConfig",
        ), patch(
            "app.integrations.opensandbox.client.OpenSandboxClient",
            return_value=mock_client,
        ), patch(
            "app.integrations.opensandbox.lifecycle.SandboxLifecycleManager",
            return_value=mock_lifecycle,
        ):
            from app.video.sandbox_runner import SandboxMediaRunner

            # Patch the deferred imports to return our mocks
            with patch.dict("sys.modules", {}):
                pass

            runner = SandboxMediaRunner.session(profile="media-processing")
            # Directly test __aenter__ and __aexit__ with mocked internals
            runner._enabled = True

            # Simulate __aenter__ behavior
            runner._client = mock_client
            runner._lifecycle = mock_lifecycle
            runner._sandbox_id = "sandbox-abc-123"

            # Now test __aexit__
            await runner.__aexit__(None, None, None)

            mock_lifecycle.destroy_sandbox.assert_called_once_with("sandbox-abc-123")

    @pytest.mark.asyncio
    async def test_session_falls_back_to_subprocess_when_optional_sandbox_unavailable(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Optional OpenSandbox failures should not fail media rendering."""
        mock_lifecycle.provision_sandbox.side_effect = RuntimeError("sandbox offline")
        mock_result = subprocess.CompletedProcess(
            args=["echo", "ok"], returncode=0, stdout="ok\n", stderr=""
        )

        with patch(
            "app.integrations.opensandbox.client.OpenSandboxClient",
            return_value=mock_client,
        ), patch(
            "app.integrations.opensandbox.lifecycle.SandboxLifecycleManager",
            return_value=mock_lifecycle,
        ), patch("asyncio.to_thread", new_callable=AsyncMock, return_value=mock_result):
            from app.video.sandbox_runner import SandboxMediaRunner

            async with SandboxMediaRunner.session(profile="media-processing", job_id="job-1") as runner:
                result = await runner.run_command(["echo", "ok"])

        assert result.returncode == 0
        assert result.stdout == "ok\n"
        assert runner._enabled is False
        assert runner._sandbox_id is None

    @pytest.mark.asyncio
    async def test_session_raises_when_required_sandbox_unavailable(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Required OpenSandbox failures should still fail fast."""
        mock_settings_enabled.OPENSANDBOX_DISPATCH_MODE = "required"
        mock_lifecycle.provision_sandbox.side_effect = RuntimeError("sandbox offline")

        with patch(
            "app.integrations.opensandbox.client.OpenSandboxClient",
            return_value=mock_client,
        ), patch(
            "app.integrations.opensandbox.lifecycle.SandboxLifecycleManager",
            return_value=mock_lifecycle,
        ):
            from app.video.sandbox_runner import SandboxMediaRunner

            with pytest.raises(RuntimeError, match="sandbox offline"):
                async with SandboxMediaRunner.session(profile="media-processing", job_id="job-1"):
                    pass

    @pytest.mark.asyncio
    async def test_run_command_falls_back_when_optional_sandbox_command_unavailable(
        self, mock_settings_enabled
    ):
        """Optional command execution failures should fall back to subprocess."""
        from app.integrations.opensandbox.client import SandboxAPIError
        from app.video.sandbox_runner import SandboxMediaRunner

        mock_result = subprocess.CompletedProcess(
            args=["echo", "ok"], returncode=0, stdout="ok\n", stderr=""
        )
        runner = SandboxMediaRunner(profile="media-processing", job_id="job-1")
        runner._enabled = True
        runner._sandbox_id = "sandbox-abc-123"

        with patch.object(
            runner,
            "_run_in_sandbox",
            new_callable=AsyncMock,
            side_effect=SandboxAPIError(404, "commands endpoint unavailable"),
        ), patch.object(
            runner,
            "_run_subprocess",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_subprocess:
            result = await runner.run_command(["echo", "ok"])

        assert result.returncode == 0
        assert result.stdout == "ok\n"
        mock_subprocess.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_command_raises_when_required_sandbox_command_unavailable(
        self, mock_settings_enabled
    ):
        """Required command execution failures should not fall back."""
        from app.video.sandbox_runner import SandboxMediaRunner

        mock_settings_enabled.OPENSANDBOX_DISPATCH_MODE = "required"
        runner = SandboxMediaRunner(profile="media-processing", job_id="job-1")
        runner._enabled = True
        runner._sandbox_id = "sandbox-abc-123"

        with patch.object(
            runner,
            "_run_in_sandbox",
            new_callable=AsyncMock,
            side_effect=RuntimeError("commands endpoint unavailable"),
        ), pytest.raises(RuntimeError, match="commands endpoint unavailable"):
            await runner.run_command(["echo", "ok"])

    def test_run_command_sync_falls_back_when_optional_sandbox_command_closes_loop(
        self, mock_settings_enabled
    ):
        """Sync command execution should fall back for latest OpenSandbox HTTP close errors."""
        from app.video.sandbox_runner import SandboxMediaRunner

        mock_result = subprocess.CompletedProcess(
            args=["echo", "ok"], returncode=0, stdout="ok\n", stderr=""
        )
        runner = SandboxMediaRunner(profile="media-processing", job_id="job-1")
        runner._enabled = True
        runner._sandbox_id = "sandbox-abc-123"

        with patch(
            "asyncio.run",
            side_effect=RuntimeError("Event loop is closed"),
        ), patch(
            "subprocess.run",
            return_value=mock_result,
        ) as mock_subprocess:
            result = runner.run_command_sync(["echo", "ok"])

        assert result.returncode == 0
        assert result.stdout == "ok\n"
        mock_subprocess.assert_called_once()

    def test_run_command_sync_raises_when_required_sandbox_command_closes_loop(
        self, mock_settings_enabled
    ):
        """Required mode should still fail if command execution cannot use OpenSandbox."""
        from app.video.sandbox_runner import SandboxMediaRunner

        mock_settings_enabled.OPENSANDBOX_DISPATCH_MODE = "required"
        runner = SandboxMediaRunner(profile="media-processing", job_id="job-1")
        runner._enabled = True
        runner._sandbox_id = "sandbox-abc-123"

        with patch(
            "asyncio.run",
            side_effect=RuntimeError("Event loop is closed"),
        ), pytest.raises(RuntimeError, match="Event loop is closed"):
            runner.run_command_sync(["echo", "ok"])

    @pytest.mark.asyncio
    async def test_session_reuse_single_sandbox(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Multiple run_command calls within a session reuse the same sandbox_id."""
        with patch(
            "app.integrations.opensandbox.execution.run_command",
            new_callable=AsyncMock,
            return_value=CommandResult(exit_code=0, stdout="", stderr=""),
        ) as mock_run:
            from app.video.sandbox_runner import SandboxMediaRunner

            runner = SandboxMediaRunner()
            runner._enabled = True
            runner._client = mock_client
            runner._lifecycle = mock_lifecycle
            runner._sandbox_id = "sandbox-abc-123"

            await runner.run_command(["ffprobe", "a.mp4"])
            await runner.run_command(["ffmpeg", "-i", "a.mp4", "b.mp4"])

            assert mock_run.call_count == 2

    @pytest.mark.asyncio
    async def test_session_cleanup_on_exception(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Sandbox is destroyed even when an exception occurs during execution."""
        with patch(
            "app.integrations.opensandbox.execution.run_command",
            new_callable=AsyncMock,
            side_effect=RuntimeError("ffmpeg crashed"),
        ):
            from app.video.sandbox_runner import SandboxMediaRunner

            runner = SandboxMediaRunner()
            runner._enabled = True
            runner._client = mock_client
            runner._lifecycle = mock_lifecycle
            runner._sandbox_id = "sandbox-abc-123"

            with pytest.raises(RuntimeError, match="ffmpeg crashed"):
                await runner.run_command(["ffmpeg", "bad"])

            # Cleanup via __aexit__
            await runner.__aexit__(RuntimeError, RuntimeError("ffmpeg crashed"), None)
            mock_lifecycle.destroy_sandbox.assert_called_once()

    @pytest.mark.asyncio
    async def test_sandbox_config_uses_media_processing_profile(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Sandbox creation uses correct config for media-processing profile."""
        with patch(
            "app.video.sandbox_runner.SandboxConfig",
        ) as mock_config_cls:
            from app.video.sandbox_runner import SandboxMediaRunner

            runner = SandboxMediaRunner(profile="media-processing")
            runner._enabled = True

            # Patch the deferred imports within __aenter__
            with patch(
                "app.video.sandbox_runner.OpenSandboxClient",
                create=True,
                return_value=mock_client,
            ):
                pass

            # Directly verify SandboxConfig is called with expected params
            # by calling __aenter__ with patched imports
            mock_config_cls.return_value = MagicMock()

            with patch(
                "app.integrations.opensandbox.client.OpenSandboxClient",
                return_value=mock_client,
            ), patch(
                "app.integrations.opensandbox.lifecycle.SandboxLifecycleManager",
                return_value=mock_lifecycle,
            ):
                await runner.__aenter__()

            call_args = mock_config_cls.call_args
            assert call_args.kwargs["image"] == "jrottenberg/ffmpeg:6-ubuntu"
            assert call_args.kwargs["cpu_limit"] == "2000m"
            assert call_args.kwargs["memory_limit_mb"] == 4096

            # Cleanup
            await runner.__aexit__(None, None, None)

    @pytest.mark.asyncio
    async def test_ffmpeg_args_converted_to_shell_command_string(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Subprocess-style list args are joined into a shell command string."""
        with patch(
            "app.integrations.opensandbox.execution.run_command",
            new_callable=AsyncMock,
            return_value=CommandResult(exit_code=0, stdout="", stderr=""),
        ) as mock_run:
            from app.video.sandbox_runner import SandboxMediaRunner

            runner = SandboxMediaRunner()
            runner._enabled = True
            runner._client = mock_client
            runner._lifecycle = mock_lifecycle
            runner._sandbox_id = "sandbox-abc-123"

            await runner.run_command(
                ["ffmpeg", "-i", "input file.mp4", "-y", "output.mp4"]
            )

            # Check the shell command string was properly escaped
            call_args = mock_run.call_args
            shell_cmd = call_args[0][2]  # Third positional arg is the command string
            assert "ffmpeg" in shell_cmd
            assert "'input file.mp4'" in shell_cmd or "input\\ file.mp4" in shell_cmd

    @pytest.mark.asyncio
    async def test_command_failure_raises_runtime_error(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Non-zero exit code with check=True raises RuntimeError."""
        with patch(
            "app.integrations.opensandbox.execution.run_command",
            new_callable=AsyncMock,
            return_value=CommandResult(
                exit_code=1, stdout="", stderr="Error: invalid input"
            ),
        ):
            from app.video.sandbox_runner import SandboxMediaRunner

            runner = SandboxMediaRunner()
            runner._enabled = True
            runner._client = mock_client
            runner._lifecycle = mock_lifecycle
            runner._sandbox_id = "sandbox-abc-123"

            with pytest.raises(RuntimeError, match="Sandbox command failed"):
                await runner.run_command(["ffmpeg", "bad"], check=True)

    @pytest.mark.asyncio
    async def test_command_failure_returns_result_without_check(
        self, mock_settings_enabled, mock_client, mock_lifecycle
    ):
        """Non-zero exit code without check=True returns the result normally."""
        with patch(
            "app.integrations.opensandbox.execution.run_command",
            new_callable=AsyncMock,
            return_value=CommandResult(exit_code=1, stdout="", stderr="err"),
        ):
            from app.video.sandbox_runner import SandboxMediaRunner

            runner = SandboxMediaRunner()
            runner._enabled = True
            runner._client = mock_client
            runner._lifecycle = mock_lifecycle
            runner._sandbox_id = "sandbox-abc-123"

            result = await runner.run_command(["ffmpeg", "bad"])
            assert result.returncode == 1
            assert result.stderr == "err"
