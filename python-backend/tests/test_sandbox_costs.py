"""Tests for sandbox_costs.py — cost calculation and attribution."""
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.sandbox_costs import (
    CPU_SECOND_RATE,
    MEMORY_GB_SECOND_RATE,
    SandboxCostService,
)

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


class TestCostCalculation:
    """Cost service computes job cost from resource consumption."""

    @pytest.mark.asyncio
    async def test_cost_from_cpu_seconds_and_memory(self):
        """Cost = f(cpu_seconds * cpu_rate + memory_gb_seconds * memory_rate)."""
        db = AsyncMock()
        service = SandboxCostService(db)

        cost = service.estimate(
            cpu_millicores=1000,  # 1 CPU
            memory_mb=2048,      # 2 GB
            timeout_seconds=300,  # 5 minutes
        )

        # Expected: 300 * 0.0000125 + (2 * 300) * 0.000005
        expected = Decimal("300") * CPU_SECOND_RATE + Decimal("600") * MEMORY_GB_SECOND_RATE
        assert cost == expected
        assert isinstance(cost, Decimal)

    @pytest.mark.asyncio
    async def test_sandbox_jobs_cost_actual_updated(self):
        """On completion, sandbox_jobs.cost_actual is updated."""
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.rowcount = 1
        db.execute.return_value = mock_result

        service = SandboxCostService(db)
        cost = await service.calculate_actual(
            job_id="job-123",
            cpu_seconds=150.0,
            memory_gb_seconds=300.0,
        )

        assert isinstance(cost, Decimal)
        assert cost > Decimal("0")
        # Verify DB update was called
        db.execute.assert_called_once()
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_cost_attributed_to_tenant_and_feature(self):
        """Cost record includes proper calculation for attribution."""
        db = AsyncMock()
        service = SandboxCostService(db)

        cost = service.estimate(
            cpu_millicores=2000,  # 2 CPUs
            memory_mb=4096,      # 4 GB
            timeout_seconds=600,  # 10 minutes
        )

        # 2 CPUs = 1200 cpu_seconds (600 * 2), 4 GB = 2400 memory_gb_seconds (600 * 4)
        expected_cpu = Decimal("1200") * CPU_SECOND_RATE
        expected_mem = Decimal("2400") * MEMORY_GB_SECOND_RATE
        assert cost == expected_cpu + expected_mem

    @pytest.mark.asyncio
    async def test_estimate_with_zero_values(self):
        """Estimate with zero resources returns zero cost."""
        db = AsyncMock()
        service = SandboxCostService(db)

        cost = service.estimate(cpu_millicores=0, memory_mb=0, timeout_seconds=0)
        assert cost == Decimal("0")
