"""Tests for agency observability metrics."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import time

from app.services.agency_metrics import (
    record_run_metrics,
    get_agency_metrics,
    check_alert_thresholds,
)


@pytest.mark.unit
@pytest.mark.agency
class TestRecordRunMetrics:
    """Tests for record_run_metrics."""

    @pytest.mark.asyncio
    async def test_records_success(self):
        with patch("app.services.agency_metrics._get_redis", new_callable=AsyncMock) as mock_redis:
            mock_conn = AsyncMock()
            mock_redis.return_value = mock_conn
            await record_run_metrics(
                agency_id="agency-1",
                status="completed",
                duration_ms=5000,
            )
            # Should have added entries to Redis sorted sets
            assert mock_conn.zadd.call_count >= 1

    @pytest.mark.asyncio
    async def test_records_failure(self):
        with patch("app.services.agency_metrics._get_redis", new_callable=AsyncMock) as mock_redis:
            mock_conn = AsyncMock()
            mock_redis.return_value = mock_conn
            await record_run_metrics(
                agency_id="agency-1",
                status="failed",
                duration_ms=3000,
                error_type="permanent",
            )
            assert mock_conn.zadd.call_count >= 1

    @pytest.mark.asyncio
    async def test_records_retry_count(self):
        with patch("app.services.agency_metrics._get_redis", new_callable=AsyncMock) as mock_redis:
            mock_conn = AsyncMock()
            mock_redis.return_value = mock_conn
            await record_run_metrics(
                agency_id="agency-1",
                status="completed",
                retry_count=3,
            )
            assert mock_conn.zadd.call_count >= 1


@pytest.mark.unit
@pytest.mark.agency
class TestGetAgencyMetrics:
    """Tests for get_agency_metrics."""

    @pytest.mark.asyncio
    async def test_returns_aggregated_stats(self):
        with patch("app.services.agency_metrics._get_redis", new_callable=AsyncMock) as mock_redis:
            mock_conn = AsyncMock()
            # Return completed:timestamp entries for runs sorted set
            now = time.time()
            mock_conn.zrangebyscore.side_effect = [
                # runs: status:timestamp entries
                [f"completed:{now - 100}", f"completed:{now - 200}", f"failed:{now - 300}"],
                # latency: duration entries
                [f"5000:{now - 100}", f"3000:{now - 200}", f"8000:{now - 300}"],
                # retries: retry_count entries
                [f"0:{now - 100}", f"1:{now - 200}", f"2:{now - 300}"],
            ]
            mock_redis.return_value = mock_conn

            result = await get_agency_metrics("agency-1", window_hours=1)
            assert "success_rate" in result
            assert "p95_latency_ms" in result
            assert "total_runs" in result
            assert "failed_runs" in result
            assert result["total_runs"] == 3
            assert result["failed_runs"] == 1

    @pytest.mark.asyncio
    async def test_empty_metrics(self):
        with patch("app.services.agency_metrics._get_redis", new_callable=AsyncMock) as mock_redis:
            mock_conn = AsyncMock()
            mock_conn.zrangebyscore.return_value = []
            mock_redis.return_value = mock_conn

            result = await get_agency_metrics("agency-1", window_hours=1)
            assert result["total_runs"] == 0
            assert result["success_rate"] == 0.0


@pytest.mark.unit
@pytest.mark.agency
class TestCheckAlertThresholds:
    """Tests for check_alert_thresholds."""

    @pytest.mark.asyncio
    async def test_fires_alert_when_success_rate_low(self):
        with patch("app.services.agency_metrics.get_agency_metrics", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "success_rate": 0.8,
                "p95_latency_ms": 5000,
                "total_runs": 10,
                "failed_runs": 2,
                "avg_step_count": 3.0,
                "avg_retry_count": 0.5,
                "credit_mismatches": 0,
            }
            alerts = await check_alert_thresholds(agency_id="agency-1")
            # 80% < 90% threshold: should fire
            success_alerts = [a for a in alerts if a["metric"] == "success_rate"]
            assert len(success_alerts) == 1
            assert success_alerts[0]["value"] == 0.8

    @pytest.mark.asyncio
    async def test_no_alerts_when_healthy(self):
        with patch("app.services.agency_metrics.get_agency_metrics", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "success_rate": 0.95,
                "p95_latency_ms": 5000,
                "total_runs": 20,
                "failed_runs": 1,
                "avg_step_count": 3.0,
                "avg_retry_count": 0.5,
                "credit_mismatches": 0,
            }
            alerts = await check_alert_thresholds(agency_id="agency-1")
            assert len(alerts) == 0
