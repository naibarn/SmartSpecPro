"""High-level sandbox lifecycle management."""
import asyncio
from typing import Optional

import structlog

from .client import OpenSandboxClient, SandboxAPIError, SandboxProvisionError
from .config import OpenSandboxSettings, opensandbox_settings
from .models import SandboxConfig

logger = structlog.get_logger(__name__)


class SandboxLifecycleManager:
    """Manages sandbox creation, readiness polling, and destruction."""

    def __init__(
        self,
        client: OpenSandboxClient,
        config: Optional[OpenSandboxSettings] = None,
    ):
        self._client = client
        self._config = config or opensandbox_settings
        self._job_sandbox_map: dict[str, str] = {}

    async def provision_sandbox(
        self, sandbox_config: SandboxConfig, job_id: str
    ) -> str:
        """Create sandbox and poll until status is 'running'.

        Polls every OPENSANDBOX_READY_POLL_INTERVAL_MS.
        Times out after OPENSANDBOX_CREATE_TIMEOUT_SECONDS.
        Returns sandbox_id.
        Raises SandboxProvisionError on timeout.
        """
        sandbox_id = await self._client.create_sandbox(sandbox_config)
        logger.info(
            "sandbox_provisioning",
            sandbox_id=sandbox_id,
            job_id=job_id,
        )

        poll_interval_s = self._config.OPENSANDBOX_READY_POLL_INTERVAL_MS / 1000.0
        timeout_s = self._config.OPENSANDBOX_CREATE_TIMEOUT_SECONDS
        loop = asyncio.get_event_loop()
        start_time = loop.time()
        last_status = "unknown"

        while (loop.time() - start_time) < timeout_s:
            status = await self._client.get_sandbox_status(sandbox_id)
            last_status = status.status
            if status.status == "running":
                elapsed = loop.time() - start_time
                logger.info(
                    "sandbox_ready",
                    sandbox_id=sandbox_id,
                    job_id=job_id,
                    elapsed_s=round(elapsed, 2),
                )
                self._job_sandbox_map[job_id] = sandbox_id
                return sandbox_id

            if status.status == "error":
                raise SandboxProvisionError(
                    f"Sandbox {sandbox_id} entered error state"
                )

            await asyncio.sleep(poll_interval_s)

        raise SandboxProvisionError(
            f"Sandbox {sandbox_id} did not reach 'running' state within "
            f"{timeout_s}s (last status: {last_status})"
        )

    async def destroy_sandbox(self, sandbox_id: str) -> None:
        """Destroy sandbox gracefully. Handles 404 (already gone) without raising."""
        try:
            await self._client.destroy_sandbox(sandbox_id)
        except SandboxAPIError as e:
            if e.status_code == 404:
                logger.info(
                    "sandbox_already_destroyed",
                    sandbox_id=sandbox_id,
                )
            else:
                raise

        # Remove from cache
        self._job_sandbox_map = {
            k: v for k, v in self._job_sandbox_map.items() if v != sandbox_id
        }

    async def get_or_create(
        self, sandbox_config: SandboxConfig, job_id: str
    ) -> str:
        """Idempotent sandbox provisioning.

        Maintains an in-memory dict mapping job_id -> sandbox_id.
        If job_id already has a sandbox, returns it.
        Otherwise provisions a new one.
        """
        if job_id in self._job_sandbox_map:
            existing_id = self._job_sandbox_map[job_id]
            logger.info(
                "sandbox_cache_hit",
                sandbox_id=existing_id,
                job_id=job_id,
            )
            return existing_id

        return await self.provision_sandbox(sandbox_config, job_id)
