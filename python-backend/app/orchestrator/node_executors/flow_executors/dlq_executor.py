"""Dead Letter Queue Executor - manage failed messages via Redis Streams.

Provides three operations:
- send_to_dlq: Capture a failed message with metadata
- read_from_dlq: Retrieve messages for inspection/retry
- delete_from_dlq: Remove a message after successful retry

Storage: Redis Streams with approximate MAXLEN trimming at 10,000 entries.
"""
import json
import re
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
    MAX_STREAM_LEN = 10_000  # MAXLEN for XADD trimming
    MAX_BATCH_SIZE = 100  # Max messages per read
    MAX_QUEUE_NAME_LEN = 128  # Queue name length limit
    MAX_MESSAGE_SIZE_BYTES = 1_048_576  # 1 MB max per message payload
    DEFAULT_MAX_AGE_SECONDS = 604_800  # 7 days
    REDIS_KEY_PREFIX = "dlq"
    VALID_OPERATIONS = {"send_to_dlq", "read_from_dlq", "delete_from_dlq"}
    # Only allow safe characters in queue names
    SAFE_QUEUE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,128}$")

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
        queue_name = str(inputs.get("queueName", config.get("queueName", "default-dlq")))

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
                f"Message exceeds maximum size of {self.MAX_MESSAGE_SIZE_BYTES // 1024}KB"
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
            raise ConnectionError(f"Failed to send message to DLQ '{queue_name}': {e}") from e

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
        max_age = int(inputs.get("maxAge", config.get("maxAge", self.DEFAULT_MAX_AGE_SECONDS)))

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

                messages.append(
                    {
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
                    }
                )

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
            raise ConnectionError(f"Failed to read from DLQ '{queue_name}': {e}") from e

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
            raise ValueError("delete_from_dlq requires a 'messageId' input")

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
                f"Failed to delete message '{message_id}' from DLQ '{queue_name}': {e}"
            ) from e
