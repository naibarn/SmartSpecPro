"""PostgreSQL adapter tests for Python distributed rate limiting."""

from unittest.mock import AsyncMock, patch

import pytest

from app.core.distributed_rate_limiter import DistributedRateLimiter, get_distributed_rate_limiter
from app.services.postgres_rate_limit import SlidingWindowDecision


@pytest.mark.asyncio
async def test_allowed_request_uses_shared_postgres_sliding_window():
    with patch(
        "app.core.distributed_rate_limiter.consume_sliding_window",
        new=AsyncMock(return_value=SlidingWindowDecision(True, 3, 1, 0)),
    ) as consume:
        result = await DistributedRateLimiter().check_rate_limit("tenant:user", 5, 60)

    consume.assert_awaited_once_with("python_api_rate_limit", "tenant:user", 5, 60)
    assert result.allowed is True
    assert result.remaining == 1


@pytest.mark.asyncio
async def test_blocked_request_propagates_retry_after():
    with patch(
        "app.core.distributed_rate_limiter.consume_sliding_window",
        new=AsyncMock(return_value=SlidingWindowDecision(False, 5, 0, 12)),
    ):
        result = await DistributedRateLimiter().check_rate_limit("tenant:user", 5, 60)

    assert result.allowed is False
    assert result.retry_after == 12


@pytest.mark.asyncio
async def test_database_error_preserves_fail_open_policy():
    with patch(
        "app.core.distributed_rate_limiter.consume_sliding_window",
        new=AsyncMock(side_effect=RuntimeError("database unavailable")),
    ):
        result = await DistributedRateLimiter().check_rate_limit("tenant:user", 5, 60)

    assert result.allowed is True


def test_getter_returns_singleton_without_external_cache_configuration():
    import app.core.distributed_rate_limiter as module

    module._distributed_rate_limiter = None
    first = get_distributed_rate_limiter()
    second = get_distributed_rate_limiter()
    module._distributed_rate_limiter = None

    assert first is second


def test_endpoint_rate_limit_config_matches_exact_and_prefix_paths():
    limiter = DistributedRateLimiter()
    assert limiter.get_rate_limit_config("/api/v1/auth/login")["max_requests"] == 5
    assert limiter.get_rate_limit_config("/api/v1/unknown")["max_requests"] == 100
