# Dead Letter Queue (DLQ) Node Executor - Implementation Plan

## Problem Statement

Workflow executions that fail need a reliable mechanism to capture failed messages for later inspection, retry, or cleanup. Currently, when a workflow node fails, the error is logged but the original payload is lost. A Dead Letter Queue (DLQ) node provides three operations -- `send_to_dlq`, `read_from_dlq`, and `delete_from_dlq` -- backed by Redis Streams for durable, ordered, and auto-trimming storage.

## Affected Files

### New Files (3)
| File | Purpose |
|------|---------|
| `python-backend/app/orchestrator/node_executors/flow_executors/dlq_executor.py` | DLQ executor class |
| `python-backend/tests/test_dlq_executor.py` | Unit tests |
| `planning/workflow-dead-letter-queue-node/plan.md` | This plan |

### Modified Files (2)
| File | Change |
|------|--------|
| `python-backend/app/orchestrator/node_registry.py` | Register `dead_letter_queue` node type |
| `python-backend/app/orchestrator/node_executors/flow_executors/__init__.py` | Export `DLQExecutor` |

## Architecture

### Redis Streams Key Design

```
dlq:{tenant_id}:{queue_name}
```

- **Namespace prefix**: `dlq:` to avoid key collisions with other Redis usage
- **Tenant isolation**: Each tenant's DLQ is isolated via `tenant_id` in the key
- **Queue name**: User-configurable identifier (default: `default-dlq`)

Example keys:
```
dlq:tenant_abc:default-dlq
dlq:tenant_abc:llm-failures
dlq:tenant_abc:media-generation-errors
```

### Message Schema (stored as Redis Stream fields)

Each XADD entry contains these flat string fields (Redis Streams require string values):

| Field | Type | Description |
|-------|------|-------------|
| `original_data` | JSON string | The original message/payload that failed |
| `error` | string | Error message from the failure |
| `error_type` | string | Classification: timeout, validation, connection, etc. |
| `failed_at` | ISO 8601 string | Timestamp of when the failure occurred |
| `workflow_id` | string | ID of the workflow that failed |
| `node_id` | string | ID of the node that failed |
| `execution_id` | string | ID of the execution run |
| `user_id` | string | User who triggered the workflow |
| `attempt_count` | string (int) | Number of retry attempts before DLQ (default "1") |

### Redis Streams Operations Mapping

| DLQ Operation | Redis Command | Details |
|---------------|---------------|---------|
| `send_to_dlq` | `XADD key MAXLEN ~ 10000 * field1 val1 ...` | Approximate trimming with `~` for performance |
| `read_from_dlq` | `XRANGE key - + COUNT batchSize` | Read oldest-first, respects batch size |
| `delete_from_dlq` | `XDEL key messageId` | Remove specific message after successful retry |
| Queue depth | `XLEN key` | O(1) stream length |
| Age-based cleanup | `XRANGE key - (maxAge_timestamp) COUNT 1000` + `XDEL` | Periodic cleanup of expired messages |

### Why `XRANGE` Instead of `XREAD` with Consumer Groups

For DLQ read operations, `XRANGE` is preferred over `XREAD` with consumer groups because:

1. **DLQ reads are inspection/retry operations**, not competing-consumer patterns
2. **Multiple reads of the same messages** are expected (inspect, then retry, then delete)
3. **No acknowledgment lifecycle needed** -- messages are explicitly deleted via `delete_from_dlq`
4. **Simpler implementation** -- no consumer group creation/management overhead
5. The queue_trigger executor already handles consumer groups for the production queue pattern

## Detailed Implementation

### Step 1: DLQ Executor (`dlq_executor.py`)

```python
# File: python-backend/app/orchestrator/node_executors/flow_executors/dlq_executor.py

"""Dead Letter Queue Executor - manage failed messages via Redis Streams.

Provides three operations:
- send_to_dlq: Capture a failed message with metadata
- read_from_dlq: Retrieve messages for inspection/retry
- delete_from_dlq: Remove a message after successful retry

Storage: Redis Streams with approximate MAXLEN trimming at 10,000 entries.
"""
import json
import time
from datetime import datetime, timezone
from typing import Any

import structlog
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.core.config import settings
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)
```

#### Class Structure

```python
class DLQExecutor:
    """Executor for dead_letter_queue nodes.

    Manages failed workflow messages using Redis Streams. Supports three
    operations: send_to_dlq, read_from_dlq, and delete_from_dlq.

    Redis key format: dlq:{tenant_id}:{queue_name}

    Safety:
    - Fail-closed: Redis connection errors raise exceptions
    - MAXLEN ~10000: Approximate trimming prevents unbounded growth
    - Tenant-isolated keys prevent cross-tenant data access
    - Queue name sanitization prevents Redis key injection
    """

    # Safety limits
    MAX_STREAM_LEN = 10_000       # MAXLEN for XADD trimming
    MAX_BATCH_SIZE = 100          # Max messages per read
    MAX_QUEUE_NAME_LEN = 128      # Queue name length limit
    MAX_MESSAGE_SIZE_BYTES = 1_048_576  # 1 MB max per message payload
    DEFAULT_MAX_AGE_SECONDS = 604_800   # 7 days
    REDIS_KEY_PREFIX = "dlq"
    VALID_OPERATIONS = {"send_to_dlq", "read_from_dlq", "delete_from_dlq"}
    # Only allow safe characters in queue names
    SAFE_QUEUE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,128}$")
```

#### Redis Connection (same pattern as RateLimiterExecutor)

```python
    def __init__(self) -> None:
        self._redis: Redis | None = None

    async def _get_redis(self) -> Redis:
        """Get or create async Redis connection. Fail-closed on error."""
        if self._redis is None:
            redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
            self._redis = Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
            )
            try:
                await self._redis.ping()
            except (RedisConnectionError, RedisTimeoutError, OSError) as e:
                self._redis = None
                raise ConnectionError(
                    f"Cannot connect to Redis at {redis_url} for DLQ: {e}"
                ) from e
        return self._redis
```

#### Key Construction

```python
    def _build_stream_key(self, tenant_id: str | None, queue_name: str) -> str:
        """Build Redis Stream key with tenant isolation.

        Args:
            tenant_id: Tenant identifier (uses "global" if None).
            queue_name: DLQ name (validated against SAFE_QUEUE_NAME_PATTERN).

        Returns:
            Redis key like "dlq:tenant_abc:my-queue".

        Raises:
            ValueError: If queue_name contains invalid characters.
        """
        if not self.SAFE_QUEUE_NAME_PATTERN.match(queue_name):
            raise ValueError(
                f"Invalid queue name '{queue_name}'. "
                f"Must match pattern: alphanumeric, hyphens, underscores, "
                f"max {self.MAX_QUEUE_NAME_LEN} chars."
            )
        safe_tenant = tenant_id or "global"
        return f"{self.REDIS_KEY_PREFIX}:{safe_tenant}:{queue_name}"
```

#### Main Execute Method (operation dispatch)

```python
    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute DLQ operation based on config.operation.

        Args:
            data: Node execution data with config and inputs.
            context: Execution context (user, workflow, execution IDs).

        Returns:
            dict with messageId, messages, success, queueDepth.

        Raises:
            ValueError: On invalid operation or configuration.
            ConnectionError: If Redis is unreachable (fail-closed).
        """
        config = data.config
        inputs = data.inputs

        # Determine operation
        operation = inputs.get("operation", config.get("operation"))
        if not operation or operation not in self.VALID_OPERATIONS:
            raise ValueError(
                f"Invalid DLQ operation: '{operation}'. "
                f"Must be one of: {', '.join(sorted(self.VALID_OPERATIONS))}"
            )

        # Common config
        queue_name = str(
            inputs.get("queueName", config.get("queueName", "default-dlq"))
        )

        # Build key with tenant isolation
        stream_key = self._build_stream_key(context.tenant_id, queue_name)

        # Get Redis connection (fail-closed)
        try:
            redis = await self._get_redis()
        except ConnectionError:
            raise
        except (RedisError, OSError) as e:
            raise ConnectionError(f"Redis error for DLQ: {e}") from e

        # Dispatch to operation handler
        if operation == "send_to_dlq":
            return await self._send_to_dlq(redis, stream_key, queue_name, data, context)
        elif operation == "read_from_dlq":
            return await self._read_from_dlq(redis, stream_key, queue_name, config, inputs)
        elif operation == "delete_from_dlq":
            return await self._delete_from_dlq(redis, stream_key, queue_name, config, inputs)
        else:
            # Should not reach here due to validation above
            raise ValueError(f"Unhandled operation: {operation}")
```

#### send_to_dlq Operation

```python
    async def _send_to_dlq(
        self,
        redis: Redis,
        stream_key: str,
        queue_name: str,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Send a failed message to the DLQ via XADD.

        Stores the message with metadata (error, timestamps, IDs) and
        trims the stream to MAX_STREAM_LEN using approximate trimming.

        Args:
            redis: Redis connection.
            stream_key: Full Redis Stream key.
            queue_name: Human-readable queue name.
            data: Node execution data (contains message and error info).
            context: Execution context.

        Returns:
            dict with messageId, success, queueDepth.
        """
        config = data.config
        inputs = data.inputs

        # Get the message payload
        message = inputs.get("message", config.get("message"))
        if message is None:
            raise ValueError("send_to_dlq requires a 'message' input")

        # Serialize message to JSON string
        message_json = json.dumps(message, default=str)

        # Enforce size limit
        if len(message_json.encode("utf-8")) > self.MAX_MESSAGE_SIZE_BYTES:
            raise ValueError(
                f"Message exceeds maximum size of "
                f"{self.MAX_MESSAGE_SIZE_BYTES // 1024}KB"
            )

        # Get error information from inputs or context
        error_info = inputs.get("error", config.get("error", "Unknown error"))
        error_type = inputs.get("errorType", config.get("errorType", "unknown"))
        attempt_count = str(inputs.get("attemptCount", config.get("attemptCount", 1)))

        # Build stream entry fields
        fields: dict[str, str] = {
            "original_data": message_json,
            "error": str(error_info),
            "error_type": str(error_type),
            "failed_at": datetime.now(timezone.utc).isoformat(),
            "workflow_id": context.workflow_id,
            "node_id": data.node_id,
            "execution_id": context.execution_id,
            "user_id": str(context.user_id),
            "attempt_count": str(attempt_count),
        }

        try:
            # XADD with approximate MAXLEN trimming
            message_id = await redis.xadd(
                stream_key,
                fields,
                maxlen=self.MAX_STREAM_LEN,
                approximate=True,
            )

            # Get current queue depth
            queue_depth = await redis.xlen(stream_key)

            logger.info(
                "dlq_message_sent",
                node_id=data.node_id,
                queue_name=queue_name,
                stream_key=stream_key,
                message_id=message_id,
                queue_depth=queue_depth,
                error_type=error_type,
            )

            return {
                "messageId": message_id,
                "messages": [],
                "success": True,
                "queueDepth": queue_depth,
            }

        except (RedisError, OSError) as e:
            raise ConnectionError(
                f"Failed to send message to DLQ '{queue_name}': {e}"
            ) from e
```

#### read_from_dlq Operation

```python
    async def _read_from_dlq(
        self,
        redis: Redis,
        stream_key: str,
        queue_name: str,
        config: dict[str, Any],
        inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """Read messages from the DLQ via XRANGE.

        Reads oldest-first, up to batchSize messages. Optionally filters
        out messages older than maxAge seconds.

        Args:
            redis: Redis connection.
            stream_key: Full Redis Stream key.
            queue_name: Human-readable queue name.
            config: Node config with batchSize, maxAge.
            inputs: Resolved inputs.

        Returns:
            dict with messages (array), success, queueDepth.
        """
        batch_size = min(
            int(inputs.get("batchSize", config.get("batchSize", 10))),
            self.MAX_BATCH_SIZE,
        )
        max_age = int(
            inputs.get("maxAge", config.get("maxAge", self.DEFAULT_MAX_AGE_SECONDS))
        )

        try:
            # Read oldest messages first
            raw_messages = await redis.xrange(
                stream_key,
                min="-",
                max="+",
                count=batch_size,
            )

            # Parse messages and filter by age
            now = time.time()
            messages = []
            expired_ids = []

            for msg_id, fields in raw_messages:
                # Parse the failed_at timestamp to check age
                failed_at_str = fields.get("failed_at", "")
                try:
                    failed_at = datetime.fromisoformat(failed_at_str)
                    age_seconds = now - failed_at.timestamp()
                except (ValueError, TypeError):
                    age_seconds = 0  # Cannot determine age; include

                if max_age > 0 and age_seconds > max_age:
                    # Message expired -- collect for cleanup
                    expired_ids.append(msg_id)
                    continue

                # Parse original_data back from JSON
                original_data = fields.get("original_data", "{}")
                try:
                    parsed_data = json.loads(original_data)
                except json.JSONDecodeError:
                    parsed_data = original_data

                messages.append({
                    "messageId": msg_id,
                    "originalData": parsed_data,
                    "error": fields.get("error", ""),
                    "errorType": fields.get("error_type", "unknown"),
                    "failedAt": failed_at_str,
                    "workflowId": fields.get("workflow_id", ""),
                    "nodeId": fields.get("node_id", ""),
                    "executionId": fields.get("execution_id", ""),
                    "userId": fields.get("user_id", ""),
                    "attemptCount": int(fields.get("attempt_count", "1")),
                })

            # Clean up expired messages in the background
            if expired_ids:
                await redis.xdel(stream_key, *expired_ids)
                logger.info(
                    "dlq_expired_messages_cleaned",
                    queue_name=queue_name,
                    cleaned_count=len(expired_ids),
                )

            queue_depth = await redis.xlen(stream_key)

            logger.info(
                "dlq_messages_read",
                node_id="read_op",
                queue_name=queue_name,
                read_count=len(messages),
                expired_cleaned=len(expired_ids),
                queue_depth=queue_depth,
            )

            return {
                "messageId": "",
                "messages": messages,
                "success": True,
                "queueDepth": queue_depth,
            }

        except (RedisError, OSError) as e:
            raise ConnectionError(
                f"Failed to read from DLQ '{queue_name}': {e}"
            ) from e
```

#### delete_from_dlq Operation

```python
    async def _delete_from_dlq(
        self,
        redis: Redis,
        stream_key: str,
        queue_name: str,
        config: dict[str, Any],
        inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """Delete a message from the DLQ via XDEL.

        Used after a message has been successfully retried and should
        no longer remain in the queue.

        Args:
            redis: Redis connection.
            stream_key: Full Redis Stream key.
            queue_name: Human-readable queue name.
            config: Node config with messageId.
            inputs: Resolved inputs.

        Returns:
            dict with success boolean and queueDepth.

        Raises:
            ValueError: If messageId is missing.
        """
        message_id = inputs.get("messageId", config.get("messageId"))
        if not message_id:
            raise ValueError(
                "delete_from_dlq requires a 'messageId' input"
            )

        # Validate message ID format (Redis Stream IDs are "timestamp-seq")
        message_id = str(message_id).strip()
        if not re.match(r"^\d+-\d+$", message_id):
            raise ValueError(
                f"Invalid message ID format: '{message_id}'. "
                f"Expected format: 'timestamp-sequence' (e.g., '1707000000000-0')"
            )

        try:
            deleted_count = await redis.xdel(stream_key, message_id)

            queue_depth = await redis.xlen(stream_key)

            success = deleted_count > 0

            logger.info(
                "dlq_message_deleted",
                queue_name=queue_name,
                message_id=message_id,
                deleted=success,
                queue_depth=queue_depth,
            )

            return {
                "messageId": message_id if success else "",
                "messages": [],
                "success": success,
                "queueDepth": queue_depth,
            }

        except (RedisError, OSError) as e:
            raise ConnectionError(
                f"Failed to delete message '{message_id}' "
                f"from DLQ '{queue_name}': {e}"
            ) from e
```

### Step 2: Node Registry Spec

Add to `_register_core_nodes()` in `node_registry.py`, after the existing flow control nodes:

```python
        # Dead Letter Queue
        self.register_node_type(
            NodeTypeSpec(
                type="dead_letter_queue",
                display_name="Dead Letter Queue",
                description="Manage failed workflow messages: send to DLQ, read for retry, or delete after successful retry",
                icon="inbox",
                color="red",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="operation",
                        display_name="Operation",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="send_to_dlq",
                        options=[
                            {"label": "Send to DLQ", "value": "send_to_dlq"},
                            {"label": "Read from DLQ", "value": "read_from_dlq"},
                            {"label": "Delete from DLQ", "value": "delete_from_dlq"},
                        ],
                    ),
                    InputSpec(
                        name="queueName",
                        display_name="Queue Name",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default="default-dlq",
                        placeholder="my-error-queue",
                        validation={"pattern": r"^[a-zA-Z0-9_\-]{1,128}$"},
                    ),
                    InputSpec(
                        name="message",
                        display_name="Message (send_to_dlq)",
                        data_type="any",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Data to send to DLQ (required for send_to_dlq)...",
                    ),
                    InputSpec(
                        name="error",
                        display_name="Error Message (send_to_dlq)",
                        data_type="text",
                        ui_type="textarea",
                        required=False,
                        accepts_connection=True,
                        placeholder="Error description for this failure...",
                    ),
                    InputSpec(
                        name="errorType",
                        display_name="Error Type (send_to_dlq)",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="unknown",
                        options=[
                            {"label": "Unknown", "value": "unknown"},
                            {"label": "Timeout", "value": "timeout"},
                            {"label": "Validation", "value": "validation"},
                            {"label": "Rate Limit", "value": "rate_limit"},
                            {"label": "Server Error", "value": "server_error"},
                            {"label": "Connection Error", "value": "connection"},
                        ],
                    ),
                    InputSpec(
                        name="messageId",
                        display_name="Message ID (delete_from_dlq)",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="Redis Stream message ID (e.g., 1707000000000-0)",
                    ),
                    InputSpec(
                        name="maxAge",
                        display_name="Max Age (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=604800,
                        validation={"min": 60, "max": 2592000},
                    ),
                    InputSpec(
                        name="batchSize",
                        display_name="Batch Size (read_from_dlq)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=10,
                        validation={"min": 1, "max": 100},
                    ),
                    InputSpec(
                        name="attemptCount",
                        display_name="Attempt Count (send_to_dlq)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=True,
                        default=1,
                        validation={"min": 1, "max": 100},
                    ),
                ],
                outputs=[
                    OutputSpec(
                        name="messageId",
                        display_name="Message ID",
                        data_type="text",
                    ),
                    OutputSpec(
                        name="messages",
                        display_name="Messages",
                        data_type="array",
                    ),
                    OutputSpec(
                        name="success",
                        display_name="Success",
                        data_type="boolean",
                    ),
                    OutputSpec(
                        name="queueDepth",
                        display_name="Queue Depth",
                        data_type="number",
                    ),
                ],
                executor="app.orchestrator.node_executors.flow_executors.dlq_executor.DLQExecutor",
            )
        )
```

### Step 3: Update `__init__.py`

Add to `python-backend/app/orchestrator/node_executors/flow_executors/__init__.py`:

```python
from app.orchestrator.node_executors.flow_executors.dlq_executor import (
    DLQExecutor,
)
```

And add `"DLQExecutor"` to `__all__`.

### Step 4: Tests (`test_dlq_executor.py`)

Test categories:

| # | Test | What It Verifies |
|---|------|-----------------|
| 1 | `test_send_to_dlq_basic` | XADD is called with correct fields, returns messageId |
| 2 | `test_send_to_dlq_message_size_limit` | Rejects messages > 1MB |
| 3 | `test_send_to_dlq_requires_message` | ValueError when message is missing |
| 4 | `test_read_from_dlq_basic` | XRANGE returns parsed messages |
| 5 | `test_read_from_dlq_batch_size_capped` | Batch size capped at 100 |
| 6 | `test_read_from_dlq_expired_cleanup` | Messages older than maxAge are deleted |
| 7 | `test_read_from_dlq_empty_queue` | Returns empty array, depth=0 |
| 8 | `test_delete_from_dlq_basic` | XDEL removes message, returns success=True |
| 9 | `test_delete_from_dlq_not_found` | Returns success=False when ID does not exist |
| 10 | `test_delete_from_dlq_invalid_id_format` | ValueError on malformed message ID |
| 11 | `test_delete_from_dlq_requires_message_id` | ValueError when messageId missing |
| 12 | `test_invalid_operation` | ValueError on unknown operation |
| 13 | `test_invalid_queue_name` | ValueError on unsafe characters |
| 14 | `test_tenant_isolation_key` | Stream key includes tenant_id |
| 15 | `test_redis_connection_failure` | ConnectionError raised (fail-closed) |
| 16 | `test_redis_error_during_xadd` | ConnectionError on XADD failure |
| 17 | `test_default_config_values` | Default queueName, maxAge, batchSize applied |
| 18 | `test_maxlen_trimming` | XADD called with approximate=True, maxlen=10000 |

Test structure using `unittest.mock.AsyncMock` to mock Redis:

```python
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.flow_executors.dlq_executor import DLQExecutor


@pytest.fixture
def dlq_executor():
    return DLQExecutor()


@pytest.fixture
def mock_redis():
    redis = AsyncMock()
    redis.ping = AsyncMock(return_value=True)
    redis.xadd = AsyncMock(return_value="1707000000000-0")
    redis.xrange = AsyncMock(return_value=[])
    redis.xdel = AsyncMock(return_value=1)
    redis.xlen = AsyncMock(return_value=5)
    return redis


@pytest.fixture
def context():
    return ExecutionContext(
        user_id=42,
        tenant_id="tenant_abc",
        workflow_id="wf-123",
        execution_id="exec-456",
    )


@pytest.fixture
def base_data():
    return NodeExecutionData(
        node_id="dlq-node-1",
        node_type="dead_letter_queue",
        config={},
        inputs={},
        state={},
    )
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Redis unavailable | Medium | High | Fail-closed: ConnectionError raised, workflow fails clearly |
| Unbounded stream growth | Low | Medium | MAXLEN ~10000 approximate trimming on every XADD |
| Cross-tenant data leak | Low | Critical | Tenant ID embedded in Redis key, validated |
| Message payload too large | Low | Medium | 1MB size limit enforced before XADD |
| Redis key injection | Low | High | Queue name regex validation (alphanumeric + hyphens + underscores) |
| Message ID format injection | Low | Medium | Regex validation for Redis Stream ID format |
| Stale messages consuming memory | Medium | Low | maxAge-based cleanup during reads + MAXLEN cap |

## Verification Steps

1. **Unit tests pass**: `pytest python-backend/tests/test_dlq_executor.py -v`
2. **Type check passes**: `mypy python-backend/app/orchestrator/node_executors/flow_executors/dlq_executor.py`
3. **Linter passes**: `ruff check python-backend/app/orchestrator/node_executors/flow_executors/dlq_executor.py`
4. **Formatter passes**: `black --check python-backend/app/orchestrator/node_executors/flow_executors/dlq_executor.py`
5. **Node registry loads**: Python REPL -- `NodeRegistry.get_instance().get_node_type("dead_letter_queue")` returns the spec
6. **Full test suite**: `pytest python-backend/` passes without regressions
7. **Integration test** (manual): Start Redis, run send/read/delete cycle through workflow executor

## Use Case Workflows

### Workflow A: Automatic DLQ on Failure

```
[LLM Call] --error--> [Retry] --exhausted--> [Dead Letter Queue (send_to_dlq)]
                                                   |
                                              [Send Notification]
                                              "Alert: message sent to DLQ"
```

The Retry node exhausts all attempts. Its `succeeded=false` output feeds into the DLQ node which captures the original payload + error for later investigation.

### Workflow B: Manual Retry from DLQ

```
[Manual Trigger] --> [Dead Letter Queue (read_from_dlq)]
                          |
                     [Loop over messages]
                          |
                     [LLM Call (retry)]
                          |
                     [Conditional: success?]
                      /         \
                   true        false
                    |            |
            [DLQ delete]    [Log failure]
```

An operator manually triggers a retry workflow that reads DLQ messages, re-executes them, and deletes successfully retried messages.

### Workflow C: DLQ Monitoring Dashboard

```
[Schedule Trigger (every 5min)] --> [Dead Letter Queue (read_from_dlq, batchSize=1)]
                                          |
                                    [Conditional: queueDepth > threshold?]
                                      /         \
                                   true        false
                                    |            |
                              [Send Alert]   [No-op]
```

A scheduled workflow that periodically checks queue depth and alerts when it exceeds a threshold.

## Implementation Order

- [ ] Step 1: Create `dlq_executor.py` with DLQExecutor class
- [ ] Step 2: Register `dead_letter_queue` in `node_registry.py`
- [ ] Step 3: Update `flow_executors/__init__.py` with export
- [ ] Step 4: Create `test_dlq_executor.py` with all 18 test cases
- [ ] Step 5: Run linter, formatter, type checker
- [ ] Step 6: Run full pytest suite to verify no regressions
