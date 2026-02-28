"""Tests for MockSandboxBackend."""
import pytest
import os
import tempfile


@pytest.mark.unit
@pytest.mark.sandbox
class TestMockSandboxBackend:
    """Tests that MockSandboxBackend implements the SandboxBackend protocol."""

    def test_implements_sandbox_backend_protocol(self):
        """MockSandboxBackend is runtime-compatible with SandboxBackend protocol."""
        from app.integrations.opensandbox.mock_backend import (
            MockSandboxBackend,
            SandboxBackend,
        )

        backend = MockSandboxBackend()
        assert isinstance(backend, SandboxBackend)

    async def test_create_returns_sandbox_id(self):
        """Mock create() returns a UUID-format sandbox ID."""
        import uuid

        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
        from app.integrations.opensandbox.models import SandboxConfig

        backend = MockSandboxBackend()
        sandbox_id = await backend.create(SandboxConfig())
        assert isinstance(sandbox_id, str)
        # Should be a valid UUID
        uuid.UUID(sandbox_id)

    async def test_execute_runs_command_and_returns_result(self):
        """Mock execute() runs command and returns result."""
        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
        from app.integrations.opensandbox.models import SandboxConfig

        backend = MockSandboxBackend()
        sandbox_id = await backend.create(SandboxConfig())
        result = await backend.execute(sandbox_id, "echo hello", timeout=10)
        assert result.exit_code == 0
        assert "hello" in result.stdout

    async def test_execute_captures_stderr(self):
        """Mock execute() captures stderr from subprocess."""
        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
        from app.integrations.opensandbox.models import SandboxConfig

        backend = MockSandboxBackend()
        sandbox_id = await backend.create(SandboxConfig())
        result = await backend.execute(sandbox_id, "echo error >&2", timeout=10)
        assert "error" in result.stderr

    async def test_write_file_stores_in_temp_directory(self):
        """Mock write_file() writes bytes to a temporary directory."""
        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
        from app.integrations.opensandbox.models import SandboxConfig

        backend = MockSandboxBackend()
        sandbox_id = await backend.create(SandboxConfig())
        await backend.write_file(sandbox_id, "/workspace/test.txt", b"hello test")

        # Verify file exists in the sandbox temp dir
        data = await backend.read_file(sandbox_id, "/workspace/test.txt")
        assert data == b"hello test"

    async def test_read_file_returns_from_temp_directory(self):
        """Mock read_file() reads bytes from the temporary directory."""
        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
        from app.integrations.opensandbox.models import SandboxConfig

        backend = MockSandboxBackend()
        sandbox_id = await backend.create(SandboxConfig())
        content = b"read me back"
        await backend.write_file(sandbox_id, "/data/file.bin", content)
        result = await backend.read_file(sandbox_id, "/data/file.bin")
        assert result == content

    async def test_destroy_cleans_up_temp_directory(self):
        """Mock destroy() removes the sandbox's temporary directory."""
        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
        from app.integrations.opensandbox.models import SandboxConfig

        backend = MockSandboxBackend()
        sandbox_id = await backend.create(SandboxConfig())
        # Get the temp dir path before destroy
        temp_dir = backend._sandboxes[sandbox_id]
        assert os.path.exists(temp_dir)

        await backend.destroy(sandbox_id)
        assert not os.path.exists(temp_dir)
        assert sandbox_id not in backend._sandboxes

    async def test_path_traversal_write_raises(self):
        """write_file rejects path traversal attempts."""
        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
        from app.integrations.opensandbox.models import SandboxConfig

        backend = MockSandboxBackend()
        sandbox_id = await backend.create(SandboxConfig())
        with pytest.raises(ValueError, match="Path traversal"):
            await backend.write_file(sandbox_id, "../../etc/passwd", b"bad")

    async def test_path_traversal_read_raises(self):
        """read_file rejects path traversal attempts."""
        from app.integrations.opensandbox.mock_backend import MockSandboxBackend
        from app.integrations.opensandbox.models import SandboxConfig

        backend = MockSandboxBackend()
        sandbox_id = await backend.create(SandboxConfig())
        with pytest.raises(ValueError, match="Path traversal"):
            await backend.read_file(sandbox_id, "../../etc/passwd")


@pytest.mark.unit
@pytest.mark.sandbox
class TestSandboxBackendProtocol:
    """Verify both real and mock backends implement SandboxBackend."""

    def test_adapter_implements_protocol(self):
        """OpenSandboxBackendAdapter satisfies SandboxBackend protocol."""
        from unittest.mock import MagicMock

        from app.integrations.opensandbox.client import OpenSandboxBackendAdapter
        from app.integrations.opensandbox.mock_backend import SandboxBackend

        mock_client = MagicMock()
        adapter = OpenSandboxBackendAdapter(mock_client)
        assert isinstance(adapter, SandboxBackend)

    def test_mock_backend_implements_protocol(self):
        """MockSandboxBackend satisfies SandboxBackend protocol."""
        from app.integrations.opensandbox.mock_backend import (
            MockSandboxBackend,
            SandboxBackend,
        )

        backend = MockSandboxBackend()
        assert isinstance(backend, SandboxBackend)
