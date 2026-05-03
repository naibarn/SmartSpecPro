"""SandboxMediaRunner — routes FFmpeg/ffprobe commands through OpenSandbox or subprocess.

Usage as sync context manager (Celery tasks):

    with SandboxMediaRunner.session(profile="media-processing") as runner:
        result = runner.run_command_sync(["ffprobe", ...])
        result2 = runner.run_command_sync(["ffmpeg", ...])
    # sandbox destroyed on exit

Usage as async context manager:

    async with SandboxMediaRunner.session(profile="media-processing") as runner:
        result = await runner.run_command(["ffprobe", ...])
        result2 = await runner.run_command(["ffmpeg", ...])
    # sandbox destroyed on exit
"""

from __future__ import annotations

import asyncio
import os
import shlex
import subprocess
from typing import Any

import structlog

from app.integrations.opensandbox.client import SandboxAPIError
from app.integrations.opensandbox.config import opensandbox_settings
from app.integrations.opensandbox.models import SandboxConfig

logger = structlog.get_logger(__name__)


class SandboxMediaRunner:
    """Routes FFmpeg/ffprobe commands through OpenSandbox or subprocess.

    When OPENSANDBOX_ENABLED is true, commands execute inside an isolated
    sandbox container. When false, commands execute via subprocess.run()
    for backward compatibility.
    """

    def __init__(
        self,
        profile: str = "media-processing",
        job_id: str | None = None,
    ):
        self._profile = profile
        self._job_id = job_id
        self._enabled = opensandbox_settings.is_enabled
        self._sandbox_id: str | None = None
        self._client: Any = None
        self._lifecycle: Any = None

    def _sandbox_required(self) -> bool:
        return (
            opensandbox_settings.OPENSANDBOX_DISPATCH_MODE == "required"
            or opensandbox_settings.SANDBOX_REQUIRE_FOR_MEDIA
        )

    def _can_fallback_from_command_error(self, exc: Exception) -> bool:
        if self._sandbox_required():
            return False
        if isinstance(exc, SandboxAPIError) and exc.status_code == 404:
            return True
        return isinstance(exc, RuntimeError) and str(exc) == "Event loop is closed"

    @classmethod
    def session(
        cls,
        profile: str = "media-processing",
        job_id: str | None = None,
    ) -> "SandboxMediaRunner":
        """Create a runner for use as async context manager with session reuse."""
        return cls(profile=profile, job_id=job_id)

    async def __aenter__(self) -> "SandboxMediaRunner":
        """Create sandbox container (if enabled). Store sandbox_id for reuse."""
        if not self._enabled:
            return self

        from app.integrations.opensandbox.client import OpenSandboxClient
        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager

        self._client = OpenSandboxClient()
        self._lifecycle = SandboxLifecycleManager(self._client)

        config = SandboxConfig(
            image=opensandbox_settings.OPENSANDBOX_MEDIA_IMAGE,
            timeout_seconds=1800,
            cpu_limit="2000m",
            memory_limit_mb=4096,
            disk_limit_mb=10240,
            network_action="deny",
            metadata={"profile": self._profile, "job_id": self._job_id or ""},
        )

        job_key = self._job_id or f"session-{id(self)}"
        try:
            self._sandbox_id = await self._lifecycle.provision_sandbox(config, job_key)
        except Exception:
            if self._sandbox_required():
                raise
            logger.warning(
                "sandbox_session_provision_failed_falling_back_to_subprocess",
                profile=self._profile,
                job_id=self._job_id,
                exc_info=True,
            )
            self._enabled = False
            self._sandbox_id = None
            self._client = None
            self._lifecycle = None
            return self
        logger.info(
            "sandbox_session_started",
            sandbox_id=self._sandbox_id,
            profile=self._profile,
            job_id=self._job_id,
        )
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Destroy sandbox container. Always runs, even on exception."""
        if self._sandbox_id and self._lifecycle:
            try:
                await self._lifecycle.destroy_sandbox(self._sandbox_id)
                logger.info(
                    "sandbox_session_ended",
                    sandbox_id=self._sandbox_id,
                    had_exception=exc_type is not None,
                )
            except Exception:
                logger.warning(
                    "sandbox_destroy_failed",
                    sandbox_id=self._sandbox_id,
                    exc_info=True,
                )
            self._sandbox_id = None

    # --- Sync context manager for Celery tasks ---

    def __enter__(self) -> "SandboxMediaRunner":
        """Sync context manager entry — provisions sandbox if enabled."""
        if not self._enabled:
            return self
        asyncio.run(self.__aenter__())
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Sync context manager exit — destroys sandbox."""
        if self._sandbox_id and self._lifecycle:
            asyncio.run(self.__aexit__(exc_type, exc_val, exc_tb))

    def run_command_sync(
        self,
        cmd: list[str],
        timeout: int = 1800,
        capture_output: bool = True,
        text: bool = True,
        check: bool = False,
        cwd: str | None = None,
    ) -> subprocess.CompletedProcess:
        """Synchronous version of run_command for Celery tasks.

        When sandbox is disabled, calls subprocess.run() directly.
        When sandbox is enabled, bridges to the async sandbox client.
        """
        if not self._enabled or not self._sandbox_id:
            return subprocess.run(
                cmd,
                capture_output=capture_output,
                text=text,
                check=check,
                timeout=timeout,
                cwd=cwd,
            )
        try:
            return asyncio.run(self._run_in_sandbox(cmd, timeout=timeout, check=check, text=text))
        except Exception as exc:
            if not self._can_fallback_from_command_error(exc):
                raise
            logger.warning(
                "sandbox_command_failed_falling_back_to_subprocess",
                profile=self._profile,
                job_id=self._job_id,
                error=str(exc),
            )
            return subprocess.run(
                cmd,
                capture_output=capture_output,
                text=text,
                check=check,
                timeout=timeout,
                cwd=cwd,
            )

    async def run_command(
        self,
        cmd: list[str],
        timeout: int = 1800,
        capture_output: bool = True,
        text: bool = True,
        check: bool = False,
        cwd: str | None = None,
    ) -> subprocess.CompletedProcess:
        """Execute command via sandbox (if enabled) or subprocess (if disabled).

        Returns a subprocess.CompletedProcess-compatible object for backward
        compatibility with existing handler code.
        """
        if not self._enabled or not self._sandbox_id:
            return await self._run_subprocess(
                cmd,
                timeout=timeout,
                capture_output=capture_output,
                text=text,
                check=check,
                cwd=cwd,
            )

        try:
            return await self._run_in_sandbox(cmd, timeout=timeout, check=check)
        except Exception as exc:
            if not self._can_fallback_from_command_error(exc):
                raise
            logger.warning(
                "sandbox_command_failed_falling_back_to_subprocess",
                profile=self._profile,
                job_id=self._job_id,
                error=str(exc),
            )
            return await self._run_subprocess(
                cmd,
                timeout=timeout,
                capture_output=capture_output,
                text=text,
                check=check,
                cwd=cwd,
            )

    async def _run_subprocess(
        self,
        cmd: list[str],
        timeout: int = 1800,
        capture_output: bool = True,
        text: bool = True,
        check: bool = False,
        cwd: str | None = None,
    ) -> subprocess.CompletedProcess:
        """Legacy subprocess execution path."""
        return await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=capture_output,
            text=text,
            check=check,
            timeout=timeout,
            cwd=cwd,
        )

    async def _run_in_sandbox(
        self,
        cmd: list[str],
        timeout: int = 1800,
        check: bool = False,
        text: bool = True,
    ) -> subprocess.CompletedProcess:
        """Execute command inside sandbox container."""
        from app.integrations.opensandbox.execution import run_command

        shell_cmd = shlex.join(cmd)
        logger.info(
            "sandbox_command_exec",
            sandbox_id=self._sandbox_id,
            command=shell_cmd[:200],
            timeout=timeout,
        )

        result = await run_command(
            self._client,
            self._sandbox_id,
            shell_cmd,
            timeout=timeout,
        )

        stdout_val = result.stdout
        stderr_val = result.stderr
        if not text:
            # Caller expects bytes (e.g., PCM waveform data)
            stdout_val = stdout_val.encode("utf-8") if isinstance(stdout_val, str) else stdout_val
            stderr_val = stderr_val.encode("utf-8") if isinstance(stderr_val, str) else stderr_val

        completed = subprocess.CompletedProcess(
            args=cmd,
            returncode=result.exit_code,
            stdout=stdout_val,
            stderr=stderr_val,
        )

        if check and completed.returncode != 0:
            raise RuntimeError(
                f"Sandbox command failed (exit {completed.returncode}): "
                f"{result.stderr[:500]}"
            )

        return completed

    async def stage_files(self, file_paths: list[str]) -> dict[str, str]:
        """Stage local files into sandbox. Returns mapping of local_path -> sandbox_path."""
        if not self._enabled or not self._sandbox_id or not self._client:
            return {}

        mapping: dict[str, str] = {}
        for path in file_paths:
            if not os.path.exists(path):
                continue
            filename = os.path.basename(path)
            sandbox_path = f"/workspace/{filename}"
            with open(path, "rb") as f:
                content = f.read()
            await self._client.write_file(self._sandbox_id, sandbox_path, content)
            mapping[path] = sandbox_path
            logger.info(
                "sandbox_file_staged_local",
                sandbox_id=self._sandbox_id,
                local_path=path,
                sandbox_path=sandbox_path,
                size_bytes=len(content),
            )
        return mapping

    async def collect_files(
        self, sandbox_paths: list[str], local_dir: str
    ) -> list[str]:
        """Collect files from sandbox to local directory. Returns list of local paths."""
        if not self._enabled or not self._sandbox_id or not self._client:
            return []

        collected: list[str] = []
        for sandbox_path in sandbox_paths:
            filename = os.path.basename(sandbox_path)
            local_path = os.path.join(local_dir, filename)
            content = await self._client.read_file(self._sandbox_id, sandbox_path)
            with open(local_path, "wb") as f:
                f.write(content)
            collected.append(local_path)
            logger.info(
                "sandbox_file_collected_local",
                sandbox_id=self._sandbox_id,
                sandbox_path=sandbox_path,
                local_path=local_path,
                size_bytes=len(content),
            )
        return collected
