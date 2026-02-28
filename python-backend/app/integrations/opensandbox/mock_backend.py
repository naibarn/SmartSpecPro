"""Mock sandbox backend for testing and CI environments."""
import os
import shutil
import subprocess
import tempfile
import uuid
from typing import Protocol, runtime_checkable

from .models import CommandResult, SandboxConfig


@runtime_checkable
class SandboxBackend(Protocol):
    """Protocol defining the sandbox execution interface."""

    async def create(self, config: SandboxConfig) -> str: ...

    async def execute(
        self, sandbox_id: str, command: str, timeout: int
    ) -> CommandResult: ...

    async def write_file(
        self, sandbox_id: str, path: str, content: bytes
    ) -> None: ...

    async def read_file(self, sandbox_id: str, path: str) -> bytes: ...

    async def destroy(self, sandbox_id: str) -> None: ...


class MockSandboxBackend:
    """Mock sandbox backend using subprocess for local/CI testing.

    Uses temporary directories to simulate sandbox filesystems.
    Executes commands via subprocess.run() (NOT isolated).
    """

    def __init__(self) -> None:
        self._sandboxes: dict[str, str] = {}  # sandbox_id -> temp_dir path

    async def create(self, config: SandboxConfig) -> str:
        """Create a temp directory as a fake sandbox. Return UUID."""
        sandbox_id = str(uuid.uuid4())
        temp_dir = tempfile.mkdtemp(prefix=f"sandbox-{sandbox_id[:8]}-")
        self._sandboxes[sandbox_id] = temp_dir
        return sandbox_id

    async def execute(
        self, sandbox_id: str, command: str, timeout: int
    ) -> CommandResult:
        """Run command via subprocess.run in the sandbox temp directory."""
        temp_dir = self._sandboxes.get(sandbox_id)
        if temp_dir is None:
            return CommandResult(
                exit_code=1,
                stdout="",
                stderr=f"Sandbox {sandbox_id} not found",
            )

        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=temp_dir,
            )
            return CommandResult(
                exit_code=result.returncode,
                stdout=result.stdout,
                stderr=result.stderr,
            )
        except subprocess.TimeoutExpired:
            return CommandResult(
                exit_code=124,
                stdout="",
                stderr=f"Command timed out after {timeout}s",
            )

    async def write_file(
        self, sandbox_id: str, path: str, content: bytes
    ) -> None:
        """Write file to the sandbox temp directory."""
        temp_dir = self._sandboxes.get(sandbox_id)
        if temp_dir is None:
            raise ValueError(f"Sandbox {sandbox_id} not found")

        # Strip leading / to make relative to temp_dir
        rel_path = path.lstrip("/")
        full_path = os.path.join(temp_dir, rel_path)
        resolved = os.path.realpath(full_path)
        if not resolved.startswith(os.path.realpath(temp_dir)):
            raise ValueError(f"Path traversal detected: {path}")
        os.makedirs(os.path.dirname(resolved), exist_ok=True)
        with open(resolved, "wb") as f:
            f.write(content)

    async def read_file(self, sandbox_id: str, path: str) -> bytes:
        """Read file from the sandbox temp directory."""
        temp_dir = self._sandboxes.get(sandbox_id)
        if temp_dir is None:
            raise ValueError(f"Sandbox {sandbox_id} not found")

        rel_path = path.lstrip("/")
        full_path = os.path.join(temp_dir, rel_path)
        resolved = os.path.realpath(full_path)
        if not resolved.startswith(os.path.realpath(temp_dir)):
            raise ValueError(f"Path traversal detected: {path}")
        with open(resolved, "rb") as f:
            return f.read()

    async def destroy(self, sandbox_id: str) -> None:
        """Remove the sandbox temp directory."""
        temp_dir = self._sandboxes.pop(sandbox_id, None)
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
