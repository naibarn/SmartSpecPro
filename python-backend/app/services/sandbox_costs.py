"""Sandbox Cost Service — compute and attribute job costs."""

from decimal import Decimal
from typing import Optional

import structlog
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sandbox import SandboxJob

logger = structlog.get_logger()

# Cost rates (USD per unit)
CPU_SECOND_RATE = Decimal("0.0000125")  # ~$0.045/CPU-hour
MEMORY_GB_SECOND_RATE = Decimal("0.000005")  # ~$0.018/GB-hour
STORAGE_GB_RATE = Decimal("0.023")  # per GB-month (S3 standard)
NETWORK_EGRESS_GB_RATE = Decimal("0.09")  # per GB


class SandboxCostService:
    """Calculate and attribute sandbox job costs."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def estimate(self, cpu_millicores: int, memory_mb: int, timeout_seconds: int) -> Decimal:
        """Estimate job cost before execution based on profile defaults.

        Returns estimated cost in USD (used for credit pre-check).
        Assumes worst case: full timeout duration at full resource allocation.
        """
        cpu_cores = Decimal(cpu_millicores) / Decimal("1000")
        cpu_seconds = cpu_cores * Decimal(timeout_seconds)
        memory_gb = Decimal(memory_mb) / Decimal("1024")
        memory_gb_seconds = memory_gb * Decimal(timeout_seconds)

        cost = (cpu_seconds * CPU_SECOND_RATE) + (memory_gb_seconds * MEMORY_GB_SECOND_RATE)

        logger.info(
            "sandbox_cost_estimate",
            cpu_millicores=cpu_millicores,
            memory_mb=memory_mb,
            timeout_seconds=timeout_seconds,
            estimated_usd=str(cost),
        )

        return cost

    async def calculate_actual(
        self,
        job_id: str,
        cpu_seconds: float,
        memory_gb_seconds: float,
        storage_written_bytes: int = 0,
        network_egress_bytes: int = 0,
    ) -> Decimal:
        """Calculate actual cost from metered resource consumption.

        Updates sandbox_jobs.cost_actual and returns the cost in USD.
        """
        cost = (Decimal(str(cpu_seconds)) * CPU_SECOND_RATE) + (
            Decimal(str(memory_gb_seconds)) * MEMORY_GB_SECOND_RATE
        )

        # Add storage cost if applicable
        if storage_written_bytes > 0:
            storage_gb = Decimal(storage_written_bytes) / Decimal("1073741824")
            cost += storage_gb * STORAGE_GB_RATE

        # Add network egress cost if applicable
        if network_egress_bytes > 0:
            egress_gb = Decimal(network_egress_bytes) / Decimal("1073741824")
            cost += egress_gb * NETWORK_EGRESS_GB_RATE

        await self._update_job_cost(job_id, cost)

        logger.info(
            "sandbox_cost_actual",
            job_id=job_id,
            cpu_seconds=cpu_seconds,
            memory_gb_seconds=memory_gb_seconds,
            cost_usd=str(cost),
        )

        return cost

    async def _update_job_cost(self, job_id: str, cost: Decimal) -> None:
        """Update sandbox_jobs.cost_actual for the given job."""
        stmt = update(SandboxJob).where(SandboxJob.id == job_id).values(cost_actual=cost)
        await self.db.execute(stmt)
        await self.db.commit()
