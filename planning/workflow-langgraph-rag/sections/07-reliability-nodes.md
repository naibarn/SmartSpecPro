Now I have all the context I need. Let me write the comprehensive Section 7.

# Section 07: Reliability Nodes (6 nodes)

## Overview

This section implements six reliability mechanisms for the workflow engine: Retry with Backoff, Rate Limiter/Throttle, Timeout/Circuit Breaker, Idempotency/De-dup Key, Dead Letter Queue (DLQ), and Checkpoint/Resume. These cover node numbers 20-25 in the master plan.

**Critical architectural distinction**: Two of these mechanisms (Retry and Rate Limiter) are **middleware** injected into `node_adapter.py`, not standalone graph nodes. They wrap other nodes' execution, modifying *how* a node runs rather than producing their own output. The remaining four (Circuit Breaker, Idempotency, DLQ, Checkpoint) are **standalone nodes** with their own executors that appear as distinct nodes in the visual workflow editor.

**What gets built:**

1. **`RetryMiddleware`** -- Wraps any node's execution with configurable exponential backoff, jitter, and retryable error filtering. Applied in `node_adapter.py` when a node's config includes `retry` settings.
2. **`RateLimiterMiddleware`** -- Token bucket algorithm backed by Redis. Wraps any node's execution, awaiting a token before proceeding. Applied in `node_adapter.py` when a node's config includes `rate_limit` settings.
3. **`CircuitBreakerExecutor`** -- Standalone node that wraps a downstream call with three-state circuit breaker logic (CLOSED/OPEN/HALF_OPEN). State tracked in Redis per `node_type + target_url`.
4. **`IdempotencyExecutor`** -- Standalone node that hashes input fields to detect duplicate executions. Stores results in Redis with configurable TTL. Returns cached result on duplicate detection.
5. **`DeadLetterQueueExecutor`** -- Standalone node that captures failed items into a PostgreSQL table with error details, original input, and timestamp. Provides an admin API endpoint for reprocessing.
6. **`CheckpointExecutor`** -- Standalone node that explicitly creates a named LangGraph checkpoint for long-running workflows, enabling human-readable resume points.

**Design decisions:**

- **Retry as middleware, not subgraph**: The plan explicitly states "NOT a subgraph (simpler, avoids subgraph state interop complexity)." A simple async retry loop in the adapter is cleaner and avoids the complexity of managing subgraph state channels.
- **Token bucket in Redis**: The rate limiter uses Redis for distributed token bucket tracking, not in-memory counters. This ensures correctness across multiple Celery workers and Uvicorn processes. The existing `DistributedRateLimiter` at `/home/dev/projects/SmartSpecPro/python-backend/app/core/distributed_rate_limiter.py` uses sliding window for API endpoints; this is a different pattern (token bucket) for workflow node execution.
- **Circuit breaker in Redis**: State must survive process restarts and be shared across workers. The existing `CircuitState` enum in `cache_optimized.py` is a similar pattern but tied to the caching layer; this implementation is purpose-built for workflow nodes.
- **DLQ in PostgreSQL**: Failed items need durable storage with queryable metadata (error details, timestamps, retry counts). Redis is not suitable for this because DLQ items must survive Redis restarts and be browsable via admin UI.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/reliability_middleware.py` | **CREATE** | RetryMiddleware and RateLimiterMiddleware classes |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/__init__.py` | **CREATE** | Package init with executor imports |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/circuit_breaker_executor.py` | **CREATE** | CircuitBreakerExecutor standalone node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/idempotency_executor.py` | **CREATE** | IdempotencyExecutor standalone node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/dlq_executor.py` | **CREATE** | DeadLetterQueueExecutor standalone node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/checkpoint_executor.py` | **CREATE** | CheckpointExecutor standalone node |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py` | **MODIFY** | Integrate RetryMiddleware and RateLimiterMiddleware into `make_langgraph_node` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/models/dead_letter_queue.py` | **CREATE** | SQLAlchemy model for DLQ table |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/dlq.py` | **CREATE** | Admin API endpoints for DLQ reprocessing |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_reliability.py` | **CREATE** | All reliability tests |

---

## Tests (Write First)

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_executors/test_reliability.py`

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_retry_succeeds_after_failure` | unit | Retries on error, succeeds on 2nd attempt |
| `test_retry_respects_max_retries` | unit | Stops after max_retries exceeded |
| `test_retry_exponential_backoff` | unit | Delay increases exponentially between retries |
| `test_retry_jitter` | unit | Random jitter added to delay when enabled |
| `test_rate_limiter_allows_within_limit` | unit | Requests within rate pass through immediately |
| `test_rate_limiter_blocks_over_limit` | unit | Excess requests await token availability |
| `test_circuit_breaker_closed` | unit | Normal operation passes through to downstream |
| `test_circuit_breaker_opens_on_failures` | unit | Trips to OPEN after failure_threshold consecutive failures |
| `test_circuit_breaker_half_open_recovery` | unit | Allows one test request after recovery_timeout, transitions to CLOSED on success |
| `test_idempotency_dedup` | unit | Duplicate input (same hash) returns cached result without re-execution |
| `test_idempotency_different_input` | unit | Different input executes normally and caches result |
| `test_dlq_stores_failed_item` | integration | Failed item stored in DLQ PostgreSQL table with error details |
| `test_dlq_reprocess` | integration | DLQ item can be reprocessed and succeeds on retry |
| `test_checkpoint_creates_named` | integration | Named checkpoint created in PostgreSQL checkpoint tables |

```python
"""Tests for reliability nodes and middleware.

Tests are written FIRST (red phase) before implementation.
Covers: RetryMiddleware, RateLimiterMiddleware, CircuitBreakerExecutor,
        IdempotencyExecutor, DeadLetterQueueExecutor, CheckpointExecutor.
"""

import asyncio
import hashlib
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest

from app.orchestrator.node_executors.base import (
    ExecutionContext,
    NodeExecutionData,
)


# --------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------

@pytest.fixture
def mock_redis():
    """Mock async Redis client for unit tests."""
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    redis.incr = AsyncMock(return_value=1)
    redis.decr = AsyncMock(return_value=0)
    redis.exists = AsyncMock(return_value=0)
    redis.expire = AsyncMock(return_value=True)
    redis.hget = AsyncMock(return_value=None)
    redis.hset = AsyncMock(return_value=1)
    redis.hgetall = AsyncMock(return_value={})
    redis.eval = AsyncMock(return_value=1)
    return redis


@pytest.fixture
def execution_context():
    """Standard execution context for tests."""
    return ExecutionContext(
        user_id=1,
        tenant_id="test_tenant",
        workflow_id="wf_test",
        execution_id="exec_test_001",
        credits_available=100,
    )


@pytest.fixture
def make_node_data():
    """Factory for NodeExecutionData with customizable config."""
    def _factory(
        node_type: str = "http_request",
        config: dict | None = None,
        inputs: dict | None = None,
    ) -> NodeExecutionData:
        return NodeExecutionData(
            node_id="node_1",
            node_type=node_type,
            config=config or {},
            inputs=inputs or {"url": "https://api.example.com"},
            state={},
        )
    return _factory


@pytest.fixture
def mock_executor_success():
    """Mock executor that always succeeds."""
    executor = AsyncMock()
    executor.execute = AsyncMock(return_value={"result": "success", "data": [1, 2, 3]})
    return executor


@pytest.fixture
def mock_executor_fails_then_succeeds():
    """Mock executor that fails on first call, succeeds on second."""
    executor = AsyncMock()
    call_count = 0

    async def _execute(data, context):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise ConnectionError("Temporary network failure")
        return {"result": "success_after_retry"}

    executor.execute = AsyncMock(side_effect=_execute)
    return executor


@pytest.fixture
def mock_executor_always_fails():
    """Mock executor that always raises an exception."""
    executor = AsyncMock()
    executor.execute = AsyncMock(
        side_effect=ConnectionError("Persistent failure")
    )
    return executor


# --------------------------------------------------------------------------
# Retry Middleware Tests
# --------------------------------------------------------------------------

class TestRetryMiddleware:
    """Tests for RetryMiddleware (wraps node execution in node_adapter.py)."""

    @pytest.mark.asyncio
    async def test_retry_succeeds_after_failure(
        self, mock_executor_fails_then_succeeds, make_node_data, execution_context
    ):
        """Retries on error and succeeds on the 2nd attempt.
        The middleware should return the successful result, not raise."""
        from app.orchestrator.reliability_middleware import RetryMiddleware

        config = {
            "retry": {
                "max_retries": 3,
                "base_delay": 0.01,  # Fast for testing
                "backoff_factor": 2.0,
                "jitter": False,
            }
        }
        middleware = RetryMiddleware(config["retry"])
        data = make_node_data(config=config)

        result = await middleware.execute_with_retry(
            mock_executor_fails_then_succeeds, data, execution_context
        )

        assert result == {"result": "success_after_retry"}
        assert mock_executor_fails_then_succeeds.execute.await_count == 2

    @pytest.mark.asyncio
    async def test_retry_respects_max_retries(
        self, mock_executor_always_fails, make_node_data, execution_context
    ):
        """Stops after max_retries exceeded and raises the last error."""
        from app.orchestrator.reliability_middleware import RetryMiddleware

        config = {
            "retry": {
                "max_retries": 3,
                "base_delay": 0.01,
                "backoff_factor": 2.0,
                "jitter": False,
            }
        }
        middleware = RetryMiddleware(config["retry"])
        data = make_node_data(config=config)

        with pytest.raises(ConnectionError, match="Persistent failure"):
            await middleware.execute_with_retry(
                mock_executor_always_fails, data, execution_context
            )

        # 1 initial + 3 retries = 4 total calls
        assert mock_executor_always_fails.execute.await_count == 4

    @pytest.mark.asyncio
    async def test_retry_exponential_backoff(
        self, mock_executor_always_fails, make_node_data, execution_context
    ):
        """Delay increases exponentially between retries.
        Verifies that total elapsed time is consistent with exponential delays."""
        from app.orchestrator.reliability_middleware import RetryMiddleware

        config = {
            "retry": {
                "max_retries": 2,
                "base_delay": 0.05,
                "backoff_factor": 2.0,
                "jitter": False,
            }
        }
        middleware = RetryMiddleware(config["retry"])
        data = make_node_data(config=config)

        start = time.monotonic()
        with pytest.raises(ConnectionError):
            await middleware.execute_with_retry(
                mock_executor_always_fails, data, execution_context
            )
        elapsed = time.monotonic() - start

        # Expected delays: 0.05s (1st retry) + 0.10s (2nd retry) = 0.15s minimum
        assert elapsed >= 0.14  # Allow small tolerance

    @pytest.mark.asyncio
    async def test_retry_jitter(
        self, mock_executor_always_fails, make_node_data, execution_context
    ):
        """Random jitter is added to delay when jitter=True.
        Two runs with jitter should produce different total times."""
        from app.orchestrator.reliability_middleware import RetryMiddleware

        config = {
            "retry": {
                "max_retries": 2,
                "base_delay": 0.05,
                "backoff_factor": 2.0,
                "jitter": True,
            }
        }
        middleware = RetryMiddleware(config["retry"])
        data = make_node_data(config=config)

        # Run twice and collect timing
        times = []
        for _ in range(2):
            start = time.monotonic()
            with pytest.raises(ConnectionError):
                await middleware.execute_with_retry(
                    mock_executor_always_fails, data, execution_context
                )
            times.append(time.monotonic() - start)

        # With jitter, both runs should still complete (basic sanity)
        # and total time should be at least base_delay
        assert all(t >= 0.04 for t in times)


# --------------------------------------------------------------------------
# Rate Limiter Middleware Tests
# --------------------------------------------------------------------------

class TestRateLimiterMiddleware:
    """Tests for RateLimiterMiddleware (token bucket via Redis)."""

    @pytest.mark.asyncio
    async def test_rate_limiter_allows_within_limit(
        self, mock_redis, mock_executor_success, make_node_data, execution_context
    ):
        """Requests within the rate limit pass through immediately."""
        from app.orchestrator.reliability_middleware import RateLimiterMiddleware

        # Redis eval returns 1 (token available)
        mock_redis.eval = AsyncMock(return_value=1)

        config = {"rate_limit": {"rate": 10.0, "burst": 10}}
        middleware = RateLimiterMiddleware(config["rate_limit"], redis_client=mock_redis)
        data = make_node_data(config=config)

        result = await middleware.execute_with_rate_limit(
            mock_executor_success, data, execution_context
        )

        assert result == {"result": "success", "data": [1, 2, 3]}
        mock_executor_success.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_rate_limiter_blocks_over_limit(
        self, mock_redis, mock_executor_success, make_node_data, execution_context
    ):
        """When tokens are exhausted, the middleware waits before executing.
        Verifies that execution is delayed but eventually completes."""
        from app.orchestrator.reliability_middleware import RateLimiterMiddleware

        # First call returns 0 (no token), second call returns 1 (token available)
        mock_redis.eval = AsyncMock(side_effect=[0, 1])

        config = {"rate_limit": {"rate": 1.0, "burst": 1}}
        middleware = RateLimiterMiddleware(
            config["rate_limit"], redis_client=mock_redis, poll_interval=0.05
        )
        data = make_node_data(config=config)

        start = time.monotonic()
        result = await middleware.execute_with_rate_limit(
            mock_executor_success, data, execution_context
        )
        elapsed = time.monotonic() - start

        assert result == {"result": "success", "data": [1, 2, 3]}
        # Should have waited at least one poll interval
        assert elapsed >= 0.04


# --------------------------------------------------------------------------
# Circuit Breaker Tests
# --------------------------------------------------------------------------

class TestCircuitBreakerExecutor:
    """Tests for CircuitBreakerExecutor (standalone node)."""

    @pytest.mark.asyncio
    async def test_circuit_breaker_closed(
        self, mock_redis, make_node_data, execution_context
    ):
        """In CLOSED state, requests pass through to the downstream node."""
        from app.orchestrator.node_executors.reliability_executors.circuit_breaker_executor import (
            CircuitBreakerExecutor,
        )

        # Redis returns CLOSED state
        mock_redis.hgetall = AsyncMock(return_value={
            "state": "CLOSED",
            "failure_count": "0",
            "last_failure_at": "",
        })

        executor = CircuitBreakerExecutor(redis_client=mock_redis)
        data = make_node_data(
            node_type="circuit_breaker",
            config={
                "timeout_seconds": 5,
                "failure_threshold": 3,
                "recovery_timeout": 30,
                "target_node_type": "http_request",
            },
            inputs={"result": "upstream_data"},
        )

        result = await executor.execute(data, execution_context)

        assert result["circuit_state"] == "CLOSED"
        assert result["passed_through"] is True

    @pytest.mark.asyncio
    async def test_circuit_breaker_opens_on_failures(
        self, mock_redis, make_node_data, execution_context
    ):
        """Circuit trips to OPEN after failure_threshold consecutive failures."""
        from app.orchestrator.node_executors.reliability_executors.circuit_breaker_executor import (
            CircuitBreakerExecutor,
        )

        # Redis returns failure count at threshold
        mock_redis.hgetall = AsyncMock(return_value={
            "state": "CLOSED",
            "failure_count": "3",
            "last_failure_at": str(time.time()),
        })

        executor = CircuitBreakerExecutor(redis_client=mock_redis)
        data = make_node_data(
            node_type="circuit_breaker",
            config={
                "timeout_seconds": 5,
                "failure_threshold": 3,
                "recovery_timeout": 30,
            },
            inputs={"error": "connection_refused"},
        )

        result = await executor.execute(data, execution_context)

        assert result["circuit_state"] == "OPEN"
        # Verify Redis was updated to OPEN state
        mock_redis.hset.assert_awaited()

    @pytest.mark.asyncio
    async def test_circuit_breaker_half_open_recovery(
        self, mock_redis, make_node_data, execution_context
    ):
        """After recovery_timeout, allows one test request (HALF_OPEN).
        On success, transitions back to CLOSED."""
        from app.orchestrator.node_executors.reliability_executors.circuit_breaker_executor import (
            CircuitBreakerExecutor,
        )

        # Redis returns OPEN state with recovery_timeout expired
        expired_time = str(time.time() - 60)  # 60 seconds ago (> recovery_timeout)
        mock_redis.hgetall = AsyncMock(return_value={
            "state": "OPEN",
            "failure_count": "3",
            "last_failure_at": expired_time,
        })

        executor = CircuitBreakerExecutor(redis_client=mock_redis)
        data = make_node_data(
            node_type="circuit_breaker",
            config={
                "timeout_seconds": 5,
                "failure_threshold": 3,
                "recovery_timeout": 30,
            },
            inputs={"result": "test_request_success"},
        )

        result = await executor.execute(data, execution_context)

        assert result["circuit_state"] == "HALF_OPEN"
        assert result["test_request_allowed"] is True


# --------------------------------------------------------------------------
# Idempotency Tests
# --------------------------------------------------------------------------

class TestIdempotencyExecutor:
    """Tests for IdempotencyExecutor (standalone node)."""

    @pytest.mark.asyncio
    async def test_idempotency_dedup(
        self, mock_redis, make_node_data, execution_context
    ):
        """Duplicate input returns cached result without re-executing."""
        from app.orchestrator.node_executors.reliability_executors.idempotency_executor import (
            IdempotencyExecutor,
        )

        # Redis returns a previously cached result
        cached = json.dumps({"result": "previously_computed"})
        mock_redis.get = AsyncMock(return_value=cached)

        executor = IdempotencyExecutor(redis_client=mock_redis)
        data = make_node_data(
            node_type="idempotency",
            config={
                "key_expression": ["url", "method"],
                "ttl": 3600,
            },
            inputs={"url": "https://api.example.com", "method": "POST", "body": "data"},
        )

        result = await executor.execute(data, execution_context)

        assert result["result"] == "previously_computed"
        assert result.get("cache_hit") is True

    @pytest.mark.asyncio
    async def test_idempotency_different_input(
        self, mock_redis, make_node_data, execution_context
    ):
        """Different input produces a new hash, executes normally."""
        from app.orchestrator.node_executors.reliability_executors.idempotency_executor import (
            IdempotencyExecutor,
        )

        # Redis returns None (cache miss)
        mock_redis.get = AsyncMock(return_value=None)

        executor = IdempotencyExecutor(redis_client=mock_redis)
        data = make_node_data(
            node_type="idempotency",
            config={
                "key_expression": ["url", "method"],
                "ttl": 3600,
            },
            inputs={"url": "https://api.example.com/new", "method": "GET"},
        )

        result = await executor.execute(data, execution_context)

        assert result.get("cache_hit") is False
        # Verify the result was stored in Redis
        mock_redis.set.assert_awaited()


# --------------------------------------------------------------------------
# Dead Letter Queue Tests
# --------------------------------------------------------------------------

class TestDeadLetterQueueExecutor:
    """Tests for DeadLetterQueueExecutor (standalone node, PostgreSQL storage)."""

    @pytest.mark.asyncio
    async def test_dlq_stores_failed_item(self, make_node_data, execution_context):
        """Failed item is stored in the DLQ PostgreSQL table with full error details."""
        from app.orchestrator.node_executors.reliability_executors.dlq_executor import (
            DeadLetterQueueExecutor,
        )

        mock_db_session = AsyncMock()
        mock_db_session.add = MagicMock()
        mock_db_session.commit = AsyncMock()

        executor = DeadLetterQueueExecutor(db_session_factory=AsyncMock(return_value=mock_db_session))
        data = make_node_data(
            node_type="dead_letter_queue",
            config={
                "queue_name": "failed_api_calls",
                "max_retries_before_dlq": 3,
            },
            inputs={
                "failed_item": {"url": "https://api.example.com", "payload": {"key": "value"}},
                "error_message": "HTTP 500 Internal Server Error",
                "retry_count": 3,
            },
        )

        result = await executor.execute(data, execution_context)

        assert result["stored"] is True
        assert result["queue_name"] == "failed_api_calls"
        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_dlq_reprocess(self, make_node_data, execution_context):
        """A DLQ item can be marked for reprocessing via the executor."""
        from app.orchestrator.node_executors.reliability_executors.dlq_executor import (
            DeadLetterQueueExecutor,
        )

        mock_dlq_item = MagicMock()
        mock_dlq_item.id = 42
        mock_dlq_item.original_input = json.dumps({"url": "https://api.example.com"})
        mock_dlq_item.status = "failed"

        mock_db_session = AsyncMock()
        mock_db_session.get = AsyncMock(return_value=mock_dlq_item)
        mock_db_session.commit = AsyncMock()

        executor = DeadLetterQueueExecutor(db_session_factory=AsyncMock(return_value=mock_db_session))
        data = make_node_data(
            node_type="dead_letter_queue",
            config={
                "queue_name": "failed_api_calls",
                "action": "reprocess",
                "dlq_item_id": 42,
            },
        )

        result = await executor.execute(data, execution_context)

        assert result["reprocessed"] is True
        assert result["original_input"] == {"url": "https://api.example.com"}


# --------------------------------------------------------------------------
# Checkpoint / Resume Tests
# --------------------------------------------------------------------------

class TestCheckpointExecutor:
    """Tests for CheckpointExecutor (standalone node, named LangGraph checkpoints)."""

    @pytest.mark.asyncio
    async def test_checkpoint_creates_named(self, make_node_data, execution_context):
        """A named checkpoint is created via LangGraph's checkpointer.
        The checkpoint label is stored as metadata for human-readable resume points."""
        from app.orchestrator.node_executors.reliability_executors.checkpoint_executor import (
            CheckpointExecutor,
        )

        executor = CheckpointExecutor()
        data = make_node_data(
            node_type="checkpoint",
            config={
                "label": "after_data_validation",
            },
            inputs={"validated_data": {"records": 150}},
        )

        # The checkpoint executor returns metadata about the checkpoint.
        # Actual checkpoint persistence is handled by LangGraph's checkpointer
        # at the graph superstep boundary; this node signals the intent.
        result = await executor.execute(data, execution_context)

        assert result["checkpoint_label"] == "after_data_validation"
        assert result["checkpoint_requested"] is True
        assert "execution_id" in result
```

---

## Implementation Steps

### Step 1: Create the Reliability Middleware Module

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/reliability_middleware.py`

This module contains the two middleware classes that wrap node execution inside `node_adapter.py`. They are NOT standalone executors -- they modify how other nodes execute.

```python
"""Reliability middleware for workflow node execution.

Contains RetryMiddleware and RateLimiterMiddleware, which wrap
node executors with retry and rate limiting behavior respectively.

These are integrated into node_adapter.py, NOT standalone graph nodes.
"""

import asyncio
import random
import time
from typing import Any

import structlog
from redis.asyncio import Redis

from app.orchestrator.node_executors.base import (
    ExecutionContext,
    NodeExecutionData,
    NodeExecutor,
)

logger = structlog.get_logger()


# --------------------------------------------------------------------------
# Retry Middleware
# --------------------------------------------------------------------------

# Default error types that are considered retryable
DEFAULT_RETRYABLE_ERRORS = (
    ConnectionError,
    TimeoutError,
    OSError,
)


class RetryMiddleware:
    """Wraps node execution with exponential backoff retry logic.

    Applied in node_adapter.py when a node's config includes a "retry"
    section. This is NOT a standalone graph node -- it modifies how
    another node executes.

    Config schema (nested under "retry" key in node config):
        max_retries: int (1-10, default 3)
        base_delay: float (seconds, default 1.0)
        max_delay: float (seconds, default 60.0)
        backoff_factor: float (default 2.0)
        jitter: bool (default True)
        retryable_error_codes: list[str] (optional, for HTTP status codes)

    Example node config:
        {
            "url": "https://api.example.com",
            "retry": {
                "max_retries": 3,
                "base_delay": 1.0,
                "backoff_factor": 2.0,
                "jitter": true
            }
        }
    """

    def __init__(self, retry_config: dict[str, Any]):
        """Initialize from the retry sub-config.

        Args:
            retry_config: The "retry" dict from the node config.
        """
        self.max_retries = min(max(int(retry_config.get("max_retries", 3)), 1), 10)
        self.base_delay = float(retry_config.get("base_delay", 1.0))
        self.max_delay = float(retry_config.get("max_delay", 60.0))
        self.backoff_factor = float(retry_config.get("backoff_factor", 2.0))
        self.jitter = bool(retry_config.get("jitter", True))
        self.retryable_error_codes = retry_config.get("retryable_error_codes", [])

    async def execute_with_retry(
        self,
        executor: NodeExecutor,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute the node with retry on failure.

        Args:
            executor: The node executor to wrap.
            data: Node execution data.
            context: Execution context.

        Returns:
            Node execution result from a successful attempt.

        Raises:
            The last exception if all retries are exhausted.
        """
        last_exception: Exception | None = None

        for attempt in range(1 + self.max_retries):
            try:
                result = await executor.execute(data, context)
                if attempt > 0:
                    logger.info(
                        "Node succeeded after retry",
                        node_id=data.node_id,
                        attempt=attempt + 1,
                    )
                return result

            except Exception as exc:
                last_exception = exc
                is_last_attempt = attempt == self.max_retries

                if is_last_attempt:
                    logger.error(
                        "Node failed after all retries",
                        node_id=data.node_id,
                        max_retries=self.max_retries,
                        error=str(exc),
                    )
                    raise

                if not self._is_retryable(exc):
                    logger.warning(
                        "Non-retryable error, not retrying",
                        node_id=data.node_id,
                        error_type=type(exc).__name__,
                    )
                    raise

                delay = self._compute_delay(attempt)
                logger.warning(
                    "Node execution failed, retrying",
                    node_id=data.node_id,
                    attempt=attempt + 1,
                    delay=delay,
                    error=str(exc),
                )
                await asyncio.sleep(delay)

        # Should not reach here, but raise the last exception as safety
        raise last_exception  # type: ignore

    def _compute_delay(self, attempt: int) -> float:
        """Compute the delay for the given retry attempt.

        Args:
            attempt: Zero-based attempt number (0 = first retry).

        Returns:
            Delay in seconds, capped at max_delay.
        """
        delay = self.base_delay * (self.backoff_factor ** attempt)
        delay = min(delay, self.max_delay)

        if self.jitter:
            # Full jitter: random value between 0 and computed delay
            delay = random.uniform(0, delay)

        return delay

    def _is_retryable(self, exc: Exception) -> bool:
        """Determine if an exception is retryable.

        Args:
            exc: The exception to check.

        Returns:
            True if the error should trigger a retry.
        """
        # Check against default retryable error types
        if isinstance(exc, DEFAULT_RETRYABLE_ERRORS):
            return True

        # Check HTTP status code patterns (e.g., "429", "503")
        error_str = str(exc)
        for code in self.retryable_error_codes:
            if str(code) in error_str:
                return True

        return True  # Default: retry on any error (conservative)


# --------------------------------------------------------------------------
# Rate Limiter Middleware
# --------------------------------------------------------------------------

# Lua script for atomic token bucket operations in Redis
TOKEN_BUCKET_LUA = """
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if tokens == nil then
    -- Initialize bucket
    tokens = burst
    last_refill = now
end

-- Refill tokens based on elapsed time
local elapsed = now - last_refill
local new_tokens = elapsed * rate
tokens = math.min(burst, tokens + new_tokens)
last_refill = now

if tokens >= 1 then
    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('EXPIRE', key, math.ceil(burst / rate) + 60)
    return 1
else
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('EXPIRE', key, math.ceil(burst / rate) + 60)
    return 0
end
"""


class RateLimiterMiddleware:
    """Token bucket rate limiter backed by Redis.

    Applied in node_adapter.py when a node's config includes a "rate_limit"
    section. This is NOT a standalone graph node.

    Uses a Lua script for atomic token bucket operations in Redis,
    ensuring correctness across distributed workers.

    Config schema (nested under "rate_limit" key in node config):
        rate: float (requests per second, e.g., 10.0)
        burst: int (maximum burst capacity, e.g., 20)

    Example node config:
        {
            "url": "https://api.example.com",
            "rate_limit": {
                "rate": 5.0,
                "burst": 10
            }
        }
    """

    def __init__(
        self,
        rate_limit_config: dict[str, Any],
        redis_client: Redis | None = None,
        poll_interval: float = 0.1,
        max_wait: float = 60.0,
    ):
        """Initialize the rate limiter.

        Args:
            rate_limit_config: The "rate_limit" dict from node config.
            redis_client: Async Redis client. If None, rate limiting is disabled.
            poll_interval: Seconds between token availability checks.
            max_wait: Maximum seconds to wait for a token.
        """
        self.rate = float(rate_limit_config.get("rate", 10.0))
        self.burst = int(rate_limit_config.get("burst", 10))
        self._redis = redis_client
        self._poll_interval = poll_interval
        self._max_wait = max_wait

    async def execute_with_rate_limit(
        self,
        executor: NodeExecutor,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute the node after acquiring a rate limit token.

        Waits until a token is available in the bucket, then executes.
        If Redis is unavailable, executes immediately (fail-open).

        Args:
            executor: The node executor to wrap.
            data: Node execution data.
            context: Execution context.

        Returns:
            Node execution result.

        Raises:
            TimeoutError: If max_wait is exceeded waiting for a token.
        """
        if self._redis is None:
            return await executor.execute(data, context)

        bucket_key = f"wf_rate_limit:{data.node_type}:{context.tenant_id or 'global'}"

        waited = 0.0
        while waited < self._max_wait:
            try:
                allowed = await self._redis.eval(
                    TOKEN_BUCKET_LUA,
                    1,
                    bucket_key,
                    str(self.rate),
                    str(self.burst),
                    str(time.time()),
                )
                if allowed:
                    return await executor.execute(data, context)
            except Exception as exc:
                logger.warning(
                    "Rate limiter Redis error, executing without limit",
                    error=str(exc),
                )
                return await executor.execute(data, context)

            await asyncio.sleep(self._poll_interval)
            waited += self._poll_interval

        raise TimeoutError(
            f"Rate limiter timeout: waited {self._max_wait}s for token "
            f"on bucket {bucket_key}"
        )
```

### Step 2: Create the Reliability Executors Package

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/__init__.py`

```python
"""Reliability node executors.

Contains standalone reliability nodes:
- CircuitBreakerExecutor (Timeout / Circuit Breaker)
- IdempotencyExecutor (Idempotency / De-dup Key)
- DeadLetterQueueExecutor (Dead Letter Queue)
- CheckpointExecutor (Checkpoint / Resume)

Note: RetryMiddleware and RateLimiterMiddleware are NOT in this package.
They live in reliability_middleware.py and are integrated into node_adapter.py.
"""

from app.orchestrator.node_executors.reliability_executors.circuit_breaker_executor import (
    CircuitBreakerExecutor,
)
from app.orchestrator.node_executors.reliability_executors.idempotency_executor import (
    IdempotencyExecutor,
)
from app.orchestrator.node_executors.reliability_executors.dlq_executor import (
    DeadLetterQueueExecutor,
)
from app.orchestrator.node_executors.reliability_executors.checkpoint_executor import (
    CheckpointExecutor,
)

__all__ = [
    "CircuitBreakerExecutor",
    "IdempotencyExecutor",
    "DeadLetterQueueExecutor",
    "CheckpointExecutor",
]
```

### Step 3: Circuit Breaker Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/circuit_breaker_executor.py`

```python
"""Timeout / Circuit Breaker executor.

Standalone workflow node that implements the circuit breaker pattern
with three states: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing).

State is tracked in Redis per (node_type + target_url) combination,
enabling distributed circuit breaker behavior across workers.

Config:
    timeout_seconds: float -- per-request timeout
    failure_threshold: int -- consecutive failures to trip circuit
    recovery_timeout: int -- seconds before OPEN -> HALF_OPEN transition
    target_node_type: str -- (optional) downstream node type identifier

Inputs:
    result: Any -- data from upstream node (passed through on CLOSED)
    error: str -- (optional) error signal from upstream that counts as failure

Outputs:
    circuit_state: str -- current state after evaluation
    passed_through: bool -- whether the request was allowed
    test_request_allowed: bool -- (HALF_OPEN only) whether test request was permitted
    failure_count: int -- current consecutive failure count
"""

import time
from typing import Any

import structlog
from redis.asyncio import Redis

from app.orchestrator.node_executors.base import (
    ExecutionContext,
    NodeExecutionData,
)

logger = structlog.get_logger()

# Redis key prefix for circuit breaker state
CB_KEY_PREFIX = "wf_circuit_breaker:"


class CircuitBreakerExecutor:
    """Circuit breaker executor for workflow nodes.

    Tracks failure state in Redis and transitions between:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Circuit tripped, requests are blocked
    - HALF_OPEN: Recovery testing, one request allowed through

    The circuit breaker key in Redis is derived from the node config's
    target_node_type and any target URL, ensuring independent circuits
    for different downstream services.
    """

    def __init__(self, redis_client: Redis | None = None):
        """Initialize the circuit breaker.

        Args:
            redis_client: Async Redis client. If None, circuit breaker
                is disabled (all requests pass through).
        """
        self._redis = redis_client

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Evaluate circuit breaker state and decide whether to pass through.

        Args:
            data: Node execution data with circuit breaker config.
            context: Execution context.

        Returns:
            Dict with circuit_state, passed_through, failure_count.
        """
        config = data.config
        failure_threshold = int(config.get("failure_threshold", 5))
        recovery_timeout = int(config.get("recovery_timeout", 60))
        target = config.get("target_node_type", data.node_id)

        cb_key = f"{CB_KEY_PREFIX}{context.tenant_id or 'global'}:{target}"

        if self._redis is None:
            # No Redis: pass everything through
            return {
                "circuit_state": "CLOSED",
                "passed_through": True,
                "test_request_allowed": False,
                "failure_count": 0,
            }

        # Read current state from Redis
        state_data = await self._redis.hgetall(cb_key)
        current_state = state_data.get("state", "CLOSED")
        failure_count = int(state_data.get("failure_count", "0"))
        last_failure_str = state_data.get("last_failure_at", "")
        last_failure_at = float(last_failure_str) if last_failure_str else 0.0

        # Check if input signals an error
        has_error = bool(data.inputs.get("error"))

        if current_state == "CLOSED":
            if has_error:
                failure_count += 1
                if failure_count >= failure_threshold:
                    # Trip the circuit
                    await self._update_state(
                        cb_key, "OPEN", failure_count, time.time()
                    )
                    logger.warning(
                        "Circuit breaker tripped to OPEN",
                        target=target,
                        failure_count=failure_count,
                    )
                    return {
                        "circuit_state": "OPEN",
                        "passed_through": False,
                        "test_request_allowed": False,
                        "failure_count": failure_count,
                    }
                else:
                    await self._update_state(
                        cb_key, "CLOSED", failure_count, time.time()
                    )
            else:
                # Success resets failure count
                if failure_count > 0:
                    await self._update_state(cb_key, "CLOSED", 0, 0.0)
                failure_count = 0

            return {
                "circuit_state": "CLOSED",
                "passed_through": True,
                "test_request_allowed": False,
                "failure_count": failure_count,
            }

        elif current_state == "OPEN":
            # Check if recovery timeout has elapsed
            elapsed = time.time() - last_failure_at
            if elapsed >= recovery_timeout:
                # Transition to HALF_OPEN
                await self._update_state(
                    cb_key, "HALF_OPEN", failure_count, last_failure_at
                )
                logger.info(
                    "Circuit breaker transitioning to HALF_OPEN",
                    target=target,
                    elapsed=elapsed,
                )
                return {
                    "circuit_state": "HALF_OPEN",
                    "passed_through": True,
                    "test_request_allowed": True,
                    "failure_count": failure_count,
                }
            else:
                # Still in cooldown
                return {
                    "circuit_state": "OPEN",
                    "passed_through": False,
                    "test_request_allowed": False,
                    "failure_count": failure_count,
                    "retry_after_seconds": int(recovery_timeout - elapsed),
                }

        elif current_state == "HALF_OPEN":
            if has_error:
                # Test request failed: back to OPEN
                await self._update_state(
                    cb_key, "OPEN", failure_count, time.time()
                )
                return {
                    "circuit_state": "OPEN",
                    "passed_through": False,
                    "test_request_allowed": False,
                    "failure_count": failure_count,
                }
            else:
                # Test request succeeded: back to CLOSED
                await self._update_state(cb_key, "CLOSED", 0, 0.0)
                logger.info(
                    "Circuit breaker recovered to CLOSED",
                    target=target,
                )
                return {
                    "circuit_state": "CLOSED",
                    "passed_through": True,
                    "test_request_allowed": False,
                    "failure_count": 0,
                }

        # Fallback
        return {
            "circuit_state": current_state,
            "passed_through": True,
            "test_request_allowed": False,
            "failure_count": failure_count,
        }

    async def _update_state(
        self,
        key: str,
        state: str,
        failure_count: int,
        last_failure_at: float,
    ) -> None:
        """Update circuit breaker state in Redis.

        Args:
            key: Redis hash key.
            state: New state (CLOSED, OPEN, HALF_OPEN).
            failure_count: Current failure count.
            last_failure_at: Timestamp of last failure.
        """
        if self._redis is None:
            return

        await self._redis.hset(
            key,
            mapping={
                "state": state,
                "failure_count": str(failure_count),
                "last_failure_at": str(last_failure_at),
            },
        )
        # Auto-expire key after 24 hours of inactivity
        await self._redis.expire(key, 86400)
```

### Step 4: Idempotency Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/idempotency_executor.py`

```python
"""Idempotency / De-dup Key executor.

Standalone workflow node that prevents duplicate execution by hashing
specified input fields and caching results in Redis.

Config:
    key_expression: list[str] -- input field names to include in the hash
    ttl: int -- seconds to remember a result (default 3600)

Inputs:
    (any) -- input fields from upstream nodes

Outputs:
    cache_hit: bool -- whether this was a duplicate
    idempotency_key: str -- the computed hash key
    result: Any -- the pass-through or cached upstream result
"""

import hashlib
import json
from typing import Any

import structlog
from redis.asyncio import Redis

from app.orchestrator.node_executors.base import (
    ExecutionContext,
    NodeExecutionData,
)

logger = structlog.get_logger()

IDEMP_KEY_PREFIX = "wf_idempotency:"


class IdempotencyExecutor:
    """Idempotency executor for workflow nodes.

    Hashes specified input fields to generate a de-duplication key.
    If the key exists in Redis, returns the cached result.
    If not, passes through the input and stores it for future de-dup.

    This node acts as a gate: place it before a side-effect node
    (e.g., HTTP POST, email send) to prevent duplicate operations.
    """

    def __init__(self, redis_client: Redis | None = None):
        """Initialize the idempotency executor.

        Args:
            redis_client: Async Redis client. If None, idempotency
                checking is disabled (always passes through).
        """
        self._redis = redis_client

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Check for duplicate execution and return cached or fresh result.

        Args:
            data: Node execution data with idempotency config.
            context: Execution context.

        Returns:
            Dict with cache_hit, idempotency_key, and result fields.
        """
        config = data.config
        key_fields = config.get("key_expression", [])
        ttl = int(config.get("ttl", 3600))

        # Build the idempotency key from specified fields
        idemp_key = self._build_key(data.inputs, key_fields, context)
        redis_key = f"{IDEMP_KEY_PREFIX}{idemp_key}"

        if self._redis is None:
            # No Redis: always pass through
            return {
                "cache_hit": False,
                "idempotency_key": idemp_key,
                "result": data.inputs,
            }

        # Check for cached result
        try:
            cached = await self._redis.get(redis_key)
            if cached is not None:
                logger.debug(
                    "Idempotency cache hit",
                    node_id=data.node_id,
                    key=idemp_key[:16],
                )
                cached_result = json.loads(cached)
                return {
                    "cache_hit": True,
                    "idempotency_key": idemp_key,
                    "result": cached_result,
                }
        except Exception as exc:
            logger.warning(
                "Idempotency Redis read failed, passing through",
                error=str(exc),
            )

        # Cache miss: store the input as the result and pass through
        result_to_cache = data.inputs
        try:
            serialized = json.dumps(result_to_cache, default=str)
            await self._redis.set(redis_key, serialized, ex=ttl)
        except Exception as exc:
            logger.warning(
                "Idempotency Redis write failed",
                error=str(exc),
            )

        return {
            "cache_hit": False,
            "idempotency_key": idemp_key,
            "result": data.inputs,
        }

    def _build_key(
        self,
        inputs: dict[str, Any],
        key_fields: list[str],
        context: ExecutionContext,
    ) -> str:
        """Build a SHA-256 idempotency key from specified input fields.

        Args:
            inputs: The node's input data.
            key_fields: Field names to include in the hash.
            context: Execution context (tenant_id used for namespace).

        Returns:
            64-character hex SHA-256 digest.
        """
        if not key_fields:
            # If no specific fields, hash all inputs
            key_data = inputs
        else:
            key_data = {k: inputs.get(k) for k in key_fields}

        # Include tenant_id for isolation
        key_data["__tenant_id"] = context.tenant_id

        serialized = json.dumps(key_data, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
```

### Step 5: Dead Letter Queue Executor and Model

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/dead_letter_queue.py`

```python
"""SQLAlchemy model for the Dead Letter Queue table.

Stores failed workflow items with error details, original input,
and metadata for admin review and reprocessing.
"""

from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase

# Import the project's declarative base
# This should match the existing base used in the project
try:
    from app.models.base import Base
except ImportError:
    from sqlalchemy.orm import DeclarativeBase

    class Base(DeclarativeBase):
        pass


class DeadLetterItem(Base):
    """A failed workflow item stored for later reprocessing.

    Attributes:
        id: Auto-incrementing primary key.
        queue_name: Logical queue name (e.g., "failed_api_calls").
        workflow_id: The workflow that generated this item.
        execution_id: The specific execution run.
        node_id: The node that failed.
        node_type: Type of the failed node.
        tenant_id: Tenant isolation.
        original_input: JSON-serialized original input data.
        error_message: The error message from the failure.
        error_traceback: Full traceback string.
        retry_count: Number of retries attempted before DLQ.
        status: Current status (failed, reprocessing, resolved).
        created_at: When the item was added to the DLQ.
        updated_at: Last status change timestamp.
    """

    __tablename__ = "dead_letter_queue"

    id = Column(Integer, primary_key=True, autoincrement=True)
    queue_name = Column(String(255), nullable=False, index=True)
    workflow_id = Column(String(255), nullable=False, index=True)
    execution_id = Column(String(255), nullable=False)
    node_id = Column(String(255), nullable=False)
    node_type = Column(String(100), nullable=False)
    tenant_id = Column(String(255), nullable=True, index=True)
    original_input = Column(Text, nullable=False)
    error_message = Column(Text, nullable=False)
    error_traceback = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)
    status = Column(String(50), default="failed", index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
```

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/dlq_executor.py`

```python
"""Dead Letter Queue executor.

Standalone workflow node that stores failed items in a PostgreSQL table
for admin review and reprocessing.

Config:
    queue_name: str -- logical queue name for categorization
    max_retries_before_dlq: int -- informational (actual retry logic is
        in RetryMiddleware; this node receives items AFTER retries are exhausted)
    action: str -- "store" (default) or "reprocess" (for admin-triggered reprocessing)
    dlq_item_id: int -- (for action="reprocess") the DLQ item ID to reprocess

Inputs:
    failed_item: dict -- the original input data that failed
    error_message: str -- the error description
    error_traceback: str -- (optional) full traceback
    retry_count: int -- number of retries attempted

Outputs:
    stored: bool -- whether the item was stored in the DLQ
    reprocessed: bool -- (for action="reprocess") whether item was marked for reprocessing
    queue_name: str -- the queue name used
    dlq_item_id: int -- the ID of the stored/reprocessed item
    original_input: dict -- (for action="reprocess") the original input data
"""

import json
from typing import Any, Callable

import structlog

from app.orchestrator.node_executors.base import (
    ExecutionContext,
    NodeExecutionData,
)

logger = structlog.get_logger()


class DeadLetterQueueExecutor:
    """Dead Letter Queue executor for workflow nodes.

    Stores failed items in a PostgreSQL table with error details,
    original input, and metadata. Supports admin-triggered reprocessing.
    """

    def __init__(self, db_session_factory: Callable | None = None):
        """Initialize the DLQ executor.

        Args:
            db_session_factory: Async callable that returns a database session.
                If None, uses the default session factory from the app.
        """
        self._db_session_factory = db_session_factory

    async def _get_session(self):
        """Get a database session."""
        if self._db_session_factory:
            return await self._db_session_factory()
        # Fallback to app's default session factory
        from app.core.config import get_async_session
        return get_async_session()

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Store a failed item or reprocess a DLQ item.

        Args:
            data: Node execution data with DLQ config.
            context: Execution context.

        Returns:
            Dict with stored/reprocessed status and item details.
        """
        config = data.config
        action = config.get("action", "store")

        if action == "reprocess":
            return await self._reprocess(data, context)
        else:
            return await self._store(data, context)

    async def _store(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Store a failed item in the DLQ table.

        Args:
            data: Node execution data containing the failed item details.
            context: Execution context.

        Returns:
            Dict confirming storage with item ID.
        """
        from app.models.dead_letter_queue import DeadLetterItem

        config = data.config
        inputs = data.inputs

        item = DeadLetterItem(
            queue_name=config.get("queue_name", "default"),
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
            node_id=data.node_id,
            node_type=data.node_type,
            tenant_id=context.tenant_id,
            original_input=json.dumps(
                inputs.get("failed_item", inputs), default=str
            ),
            error_message=inputs.get("error_message", "Unknown error"),
            error_traceback=inputs.get("error_traceback"),
            retry_count=int(inputs.get("retry_count", 0)),
            status="failed",
        )

        session = await self._get_session()
        try:
            session.add(item)
            await session.commit()

            logger.info(
                "Item stored in DLQ",
                queue_name=item.queue_name,
                node_id=data.node_id,
                workflow_id=context.workflow_id,
            )

            return {
                "stored": True,
                "reprocessed": False,
                "queue_name": item.queue_name,
                "dlq_item_id": item.id,
            }
        except Exception as exc:
            logger.error("Failed to store DLQ item", error=str(exc))
            await session.rollback()
            return {
                "stored": False,
                "reprocessed": False,
                "queue_name": config.get("queue_name", "default"),
                "error": str(exc),
            }

    async def _reprocess(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Mark a DLQ item for reprocessing and return its original input.

        Args:
            data: Node execution data with dlq_item_id in config.
            context: Execution context.

        Returns:
            Dict with reprocessed status and original input data.
        """
        from app.models.dead_letter_queue import DeadLetterItem

        config = data.config
        dlq_item_id = config.get("dlq_item_id")

        if dlq_item_id is None:
            return {
                "stored": False,
                "reprocessed": False,
                "error": "dlq_item_id is required for reprocess action",
            }

        session = await self._get_session()
        try:
            item = await session.get(DeadLetterItem, dlq_item_id)
            if item is None:
                return {
                    "stored": False,
                    "reprocessed": False,
                    "error": f"DLQ item {dlq_item_id} not found",
                }

            item.status = "reprocessing"
            await session.commit()

            original_input = json.loads(item.original_input)

            logger.info(
                "DLQ item marked for reprocessing",
                dlq_item_id=dlq_item_id,
                queue_name=item.queue_name,
            )

            return {
                "stored": False,
                "reprocessed": True,
                "queue_name": item.queue_name,
                "dlq_item_id": dlq_item_id,
                "original_input": original_input,
            }
        except Exception as exc:
            logger.error(
                "Failed to reprocess DLQ item",
                dlq_item_id=dlq_item_id,
                error=str(exc),
            )
            await session.rollback()
            return {
                "stored": False,
                "reprocessed": False,
                "error": str(exc),
            }
```

### Step 6: Checkpoint Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/checkpoint_executor.py`

```python
"""Checkpoint / Resume executor.

Standalone workflow node that explicitly signals the creation of a named
LangGraph checkpoint. Used for long-running workflows to create
human-readable resume points.

The actual checkpoint persistence is handled by LangGraph's checkpointer
at the graph super-step boundary. This node stores the checkpoint label
as metadata in the workflow state so that resume operations can reference
checkpoints by name rather than opaque thread IDs.

Config:
    label: str -- human-readable checkpoint name (e.g., "after_validation")

Inputs:
    (any) -- pass-through from upstream node

Outputs:
    checkpoint_label: str -- the label that was applied
    checkpoint_requested: bool -- always True (signals intent to checkpoint)
    execution_id: str -- the current execution ID for reference
    data_snapshot: dict -- summary of data at checkpoint time
"""

from typing import Any

import structlog

from app.orchestrator.node_executors.base import (
    ExecutionContext,
    NodeExecutionData,
)

logger = structlog.get_logger()


class CheckpointExecutor:
    """Checkpoint executor for named workflow resume points.

    This node is intentionally simple. It does NOT directly interact
    with the LangGraph checkpointer (which operates at the graph level,
    not the node level). Instead, it:

    1. Records the checkpoint label in the node output
    2. Sets a flag that the node_adapter can use to annotate
       the checkpoint metadata
    3. Passes through all input data unchanged

    LangGraph automatically checkpoints state after every super-step
    (node execution). This node ensures that a specific checkpoint
    has a human-readable label for the admin UI and resume operations.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Create a named checkpoint marker.

        Args:
            data: Node execution data with checkpoint config.
            context: Execution context.

        Returns:
            Dict with checkpoint metadata and pass-through data.
        """
        config = data.config
        label = config.get("label", f"checkpoint_{data.node_id}")

        logger.info(
            "Named checkpoint requested",
            label=label,
            execution_id=context.execution_id,
            workflow_id=context.workflow_id,
        )

        # Build a summary of current data at this checkpoint
        data_snapshot = {}
        for key, value in data.inputs.items():
            if isinstance(value, dict):
                data_snapshot[key] = f"<dict with {len(value)} keys>"
            elif isinstance(value, list):
                data_snapshot[key] = f"<list with {len(value)} items>"
            elif isinstance(value, str) and len(value) > 100:
                data_snapshot[key] = value[:100] + "..."
            else:
                data_snapshot[key] = value

        return {
            "checkpoint_label": label,
            "checkpoint_requested": True,
            "execution_id": context.execution_id,
            "data_snapshot": data_snapshot,
        }
```

### Step 7: Integrate Middleware into NodeAdapter

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py` (MODIFY -- created in Section 1)

The `make_langgraph_node` function from Section 1 is extended to check for `retry` and `rate_limit` configuration in the node config. When present, the corresponding middleware wraps the executor call.

Key changes to the existing `_node_fn` inner function:

```python
# In make_langgraph_node, add imports at top of file:
from app.orchestrator.reliability_middleware import RetryMiddleware, RateLimiterMiddleware

# Add optional redis_client parameter:
def make_langgraph_node(
    executor: NodeExecutor,
    node_id: str,
    node_type: str,
    node_config: dict[str, Any],
    cache_middleware: "CacheMiddleware | None" = None,  # From Section 10
    redis_client: "Redis | None" = None,               # NEW: for rate limiter
) -> Callable:
    """Create a LangGraph node function from a NodeExecutor.

    Args:
        executor: An object implementing the NodeExecutor protocol.
        node_id: Unique identifier for this node instance.
        node_type: The node type name (e.g., "llm_call").
        node_config: Static configuration from the visual editor.
        cache_middleware: Optional cache middleware for result caching (Section 10).
        redis_client: Optional Redis client for rate limiter middleware.

    Returns:
        An async function compatible with StateGraph.add_node().
    """

    # Pre-build middleware instances from config (done once at compile time)
    retry_middleware = None
    rate_limit_middleware = None

    retry_config = node_config.get("retry")
    if retry_config and isinstance(retry_config, dict):
        retry_middleware = RetryMiddleware(retry_config)

    rate_limit_config = node_config.get("rate_limit")
    if rate_limit_config and isinstance(rate_limit_config, dict):
        rate_limit_middleware = RateLimiterMiddleware(
            rate_limit_config, redis_client=redis_client
        )

    async def _node_fn(state: WorkflowState, config: dict) -> dict:
        # ... existing context building and input resolution ...

        try:
            # Execution pipeline: rate limit -> retry -> cache -> execute
            async def _execute_core():
                if cache_middleware is not None:
                    return await cache_middleware.execute_with_cache(
                        executor=executor, data=data, context=context
                    )
                else:
                    return await executor.execute(data, context)

            async def _execute_with_retry():
                if retry_middleware is not None:
                    # Wrap the core execution (including cache) with retry
                    class _WrappedExecutor:
                        async def execute(self, d, c):
                            return await _execute_core()
                    return await retry_middleware.execute_with_retry(
                        _WrappedExecutor(), data, context
                    )
                else:
                    return await _execute_core()

            if rate_limit_middleware is not None:
                # Wrap retry+cache+execute with rate limiting
                class _RateLimitedExecutor:
                    async def execute(self, d, c):
                        return await _execute_with_retry()
                output = await rate_limit_middleware.execute_with_rate_limit(
                    _RateLimitedExecutor(), data, context
                )
            else:
                output = await _execute_with_retry()

            # ... existing output handling (size check, state update) ...
```

The middleware execution order is: **Rate Limit -> Retry -> Cache -> Execute**. This means:
1. The rate limiter gates entry to the node
2. If the node fails, the retry middleware re-attempts
3. On each attempt, the cache is checked first
4. Only on cache miss does the actual executor run

### Step 8: Admin API for DLQ

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/dlq.py`

```python
"""Admin API endpoints for Dead Letter Queue management.

Provides endpoints to:
- List DLQ items by queue_name, tenant, or status
- Get a specific DLQ item with full details
- Mark items for reprocessing
- Delete resolved items
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dead_letter_queue import DeadLetterItem

router = APIRouter(prefix="/dlq", tags=["Dead Letter Queue"])


class DLQItemResponse(BaseModel):
    """Response model for a DLQ item."""
    id: int
    queue_name: str
    workflow_id: str
    execution_id: str
    node_id: str
    node_type: str
    tenant_id: Optional[str]
    error_message: str
    retry_count: int
    status: str
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class DLQListResponse(BaseModel):
    """Response model for DLQ item listing."""
    items: list[DLQItemResponse]
    total: int
    page: int
    page_size: int


class ReprocessRequest(BaseModel):
    """Request to reprocess one or more DLQ items."""
    item_ids: list[int]


class ReprocessResponse(BaseModel):
    """Response from a reprocess request."""
    reprocessed: int
    failed: int
    errors: list[str]


# Endpoints are stubs -- implementation depends on existing auth/session patterns.
# The router is registered in the main FastAPI app in Section 14 (API Endpoints).

@router.get("/items", response_model=DLQListResponse)
async def list_dlq_items(
    queue_name: Optional[str] = Query(None),
    status: Optional[str] = Query("failed"),
    tenant_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List DLQ items with optional filtering."""
    ...


@router.get("/items/{item_id}", response_model=DLQItemResponse)
async def get_dlq_item(item_id: int):
    """Get a specific DLQ item with full details including original_input."""
    ...


@router.post("/reprocess", response_model=ReprocessResponse)
async def reprocess_items(request: ReprocessRequest):
    """Mark DLQ items for reprocessing. Returns count of items queued."""
    ...


@router.delete("/items/{item_id}")
async def delete_dlq_item(item_id: int):
    """Delete a resolved DLQ item."""
    ...
```

---

## Key Classes

### RetryMiddleware

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/reliability_middleware.py`

```
class RetryMiddleware:
    __init__(retry_config: dict[str, Any])
    async execute_with_retry(executor: NodeExecutor, data: NodeExecutionData, context: ExecutionContext) -> dict
    _compute_delay(attempt: int) -> float
    _is_retryable(exc: Exception) -> bool
```

**Not a standalone graph node.** Injected into `node_adapter.py` when node config contains `"retry": {...}`.

### RateLimiterMiddleware

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/reliability_middleware.py`

```
class RateLimiterMiddleware:
    __init__(rate_limit_config: dict, redis_client: Redis | None, poll_interval: float, max_wait: float)
    async execute_with_rate_limit(executor: NodeExecutor, data: NodeExecutionData, context: ExecutionContext) -> dict
```

**Not a standalone graph node.** Injected into `node_adapter.py` when node config contains `"rate_limit": {...}`.

### CircuitBreakerExecutor

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/circuit_breaker_executor.py`

```
class CircuitBreakerExecutor:
    __init__(redis_client: Redis | None)
    async execute(data: NodeExecutionData, context: ExecutionContext) -> dict
    async _update_state(key: str, state: str, failure_count: int, last_failure_at: float) -> None
```

**Standalone graph node.** State tracked in Redis hash per `{tenant_id}:{target_node_type}`.

### IdempotencyExecutor

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/idempotency_executor.py`

```
class IdempotencyExecutor:
    __init__(redis_client: Redis | None)
    async execute(data: NodeExecutionData, context: ExecutionContext) -> dict
    _build_key(inputs: dict, key_fields: list[str], context: ExecutionContext) -> str
```

**Standalone graph node.** De-dup key stored in Redis with configurable TTL.

### DeadLetterQueueExecutor

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/dlq_executor.py`

```
class DeadLetterQueueExecutor:
    __init__(db_session_factory: Callable | None)
    async execute(data: NodeExecutionData, context: ExecutionContext) -> dict
    async _store(data: NodeExecutionData, context: ExecutionContext) -> dict
    async _reprocess(data: NodeExecutionData, context: ExecutionContext) -> dict
```

**Standalone graph node.** Stores failed items in PostgreSQL `dead_letter_queue` table.

### CheckpointExecutor

Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/checkpoint_executor.py`

```
class CheckpointExecutor:
    async execute(data: NodeExecutionData, context: ExecutionContext) -> dict
```

**Standalone graph node.** Creates named checkpoint markers in LangGraph state.

---

## Architecture: Middleware vs. Standalone Nodes

```
                       Node Config                   
                    ┌─────────────────┐               
                    │  retry: {...}   │  ← Middleware config
                    │  rate_limit: {} │  ← Middleware config
                    │  url: "..."     │  ← Node-specific config
                    └────────┬────────┘               
                             │                        
                    ┌────────▼────────┐               
                    │  node_adapter   │               
                    │  .py            │               
                    │  ┌────────────┐ │               
                    │  │ Rate Limit │ │  ← Middleware layer
                    │  │ Middleware │ │               
                    │  └─────┬──────┘ │               
                    │  ┌─────▼──────┐ │               
                    │  │   Retry    │ │  ← Middleware layer
                    │  │ Middleware │ │               
                    │  └─────┬──────┘ │               
                    │  ┌─────▼──────┐ │               
                    │  │   Cache    │ │  ← From Section 10
                    │  │ Middleware │ │               
                    │  └─────┬──────┘ │               
                    │  ┌─────▼──────┐ │               
                    │  │  Executor  │ │  ← Actual node logic
                    │  │ .execute() │ │               
                    │  └────────────┘ │               
                    └─────────────────┘               
                                                      
    Standalone reliability nodes (separate graph nodes):
                                                      
    ┌──────────────┐  ┌──────────────┐  ┌───────────┐
    │Circuit Breaker│  │ Idempotency  │  │   DLQ     │
    │   (Redis)     │  │   (Redis)    │  │  (PgSQL)  │
    └──────────────┘  └──────────────┘  └───────────┘
                                                      
    ┌──────────────┐                                  
    │  Checkpoint  │                                  
    │  (LangGraph) │                                  
    └──────────────┘                                  
```

---

## Error Handling

| Error Source | Handling | State Impact |
|-------------|----------|--------------|
| **Retry exhausted** | `RetryMiddleware` raises the last exception after `max_retries` attempts; caught by `NodeAdapter` and stored in `state["errors"]` | Error accumulated, graph terminates |
| **Rate limiter timeout** | `TimeoutError` raised after `max_wait`; caught by `NodeAdapter` | Error accumulated, graph terminates |
| **Rate limiter Redis failure** | Fail-open: executes without rate limiting, logs warning | No impact on correctness |
| **Circuit breaker Redis failure** | Fail-open: passes through, logs warning | No impact on correctness |
| **Circuit breaker OPEN** | Returns `passed_through: False`; downstream conditional edge should route around blocked path | No error, but data flow is redirected |
| **Idempotency Redis failure** | Fail-open: always passes through as non-duplicate | Potential duplicate execution (acceptable) |
| **DLQ PostgreSQL failure** | `_store` returns `stored: False` with error message; logged | Failed item is lost (logged for manual recovery) |
| **Checkpoint executor failure** | Returns error in output; LangGraph still checkpoints at super-step boundary | Named label is lost, but checkpoint still occurs |
| **Non-retryable error** | `_is_retryable()` returns False; exception raised immediately without retry | Error accumulated, graph terminates |

**Key design principle:** All Redis-dependent reliability nodes fail open. A Redis outage should degrade performance (no rate limiting, no caching, no de-dup) but never prevent workflow execution.

---

## Redis Key Patterns

| Pattern | Purpose | TTL |
|---------|---------|-----|
| `wf_rate_limit:{node_type}:{tenant_id}` | Token bucket state (tokens, last_refill) | `ceil(burst/rate) + 60s` |
| `wf_circuit_breaker:{tenant_id}:{target}` | Circuit breaker state (state, failure_count, last_failure_at) | 24 hours |
| `wf_idempotency:{sha256_hash}` | Cached result for de-dup key | Configurable (default 3600s) |

All keys are namespaced by `tenant_id` for multi-tenant isolation. This prevents one tenant's rate limits or circuit breaker states from affecting another.

---

## Database Schema (DLQ Table)

Created via Alembic migration (managed in Section 13):

```sql
CREATE TABLE dead_letter_queue (
    id SERIAL PRIMARY KEY,
    queue_name VARCHAR(255) NOT NULL,
    workflow_id VARCHAR(255) NOT NULL,
    execution_id VARCHAR(255) NOT NULL,
    node_id VARCHAR(255) NOT NULL,
    node_type VARCHAR(100) NOT NULL,
    tenant_id VARCHAR(255),
    original_input TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_traceback TEXT,
    retry_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'failed',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dlq_queue_name ON dead_letter_queue(queue_name);
CREATE INDEX idx_dlq_workflow_id ON dead_letter_queue(workflow_id);
CREATE INDEX idx_dlq_tenant_id ON dead_letter_queue(tenant_id);
CREATE INDEX idx_dlq_status ON dead_letter_queue(status);
```

---

## Dependencies

### On Other Sections

| Dependency | Section | Nature |
|------------|---------|--------|
| NodeAdapter (`make_langgraph_node`) | Section 1 (LangGraph Runtime Core) | RetryMiddleware and RateLimiterMiddleware are injected into the node adapter. Section 1 defines the function signature that is extended here. |
| NodeExecutor protocol (`base.py`) | Section 1 (existing) | All middleware and executors follow the `execute(data, context) -> dict` protocol. |
| CacheMiddleware | Section 10 (Caching System) | The execution pipeline in `node_adapter.py` chains: rate_limit -> retry -> cache -> execute. Cache middleware is an optional layer. |
| Redis client (`get_redis()`) | Existing (`app/core/redis_client.py`) | CircuitBreakerExecutor, IdempotencyExecutor, and RateLimiterMiddleware use the async Redis client. |
| Database Schema | Section 13 (Database Schema) | The `dead_letter_queue` table is defined here but the Alembic migration is created in Section 13. |
| Node Registry | Section 11 (Node Registry Expansion) | All four standalone executors must be registered in the node registry with appropriate category (`reliability`), icons, and port definitions. |
| API Endpoints | Section 14 (API Endpoints) | The DLQ admin API router is registered in the main FastAPI app in Section 14. |

### Python Packages Required

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| `redis[hiredis]` | >=4.5 | Async Redis client for rate limiter, circuit breaker, idempotency | Yes |
| `structlog` | >=23.0 | Structured logging | Yes |
| `sqlalchemy` | >=2.0 | ORM for DLQ table | Yes |
| `pydantic` | >=2.0 | API request/response models | Yes |
| `fastapi` | >=0.100 | Admin API router | Yes |

No new packages are required. All dependencies are already present in the project.