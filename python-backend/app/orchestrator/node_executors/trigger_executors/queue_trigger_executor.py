"""Queue Trigger Executor - Start workflow from Redis Streams message queue."""
from datetime import datetime, timezone
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class QueueTriggerExecutor:
    """Executor for message queue trigger nodes.

    Consumes messages from a Redis Stream using consumer groups.
    The actual message polling is handled by a Celery periodic task
    that monitors configured queue triggers and spawns workflow executions
    when messages arrive.

    This executor runs WHEN a message is consumed and produces the
    message data for downstream nodes.

    Output ports:
        - messages (array): List of consumed message dictionaries.
        - messageCount (number): Number of messages in this batch.
        - queueName (text): The Redis Stream key that was consumed.
        - consumedAt (text): ISO 8601 timestamp of consumption.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute queue trigger - returns consumed messages from Redis Stream.

        Args:
            data: Node execution data with config (queueName, consumerGroup, batchSize, ackMode).
            context: Execution context with queue_messages in extra_data.

        Returns:
            Dictionary with messages, messageCount, queueName, and consumedAt.

        Raises:
            ValueError: If queue_messages data is missing from context, or if
                        queueName config is missing.
        """
        # Get queue messages from context (injected by queue poller task)
        queue_data = context.extra_data.get("queue_messages", {})

        if not queue_data:
            raise ValueError(
                "No queue message data provided. This trigger must be "
                "invoked by the queue poller task."
            )

        messages = queue_data.get("messages", [])
        queue_name = queue_data.get("queue_name", "")
        consumed_at = queue_data.get("consumed_at", datetime.now(timezone.utc).isoformat())

        # Validate queue name matches config
        configured_queue = data.config.get("queueName", "")
        if configured_queue and queue_name != configured_queue:
            raise ValueError(
                f"Queue name mismatch. Expected '{configured_queue}', "
                f"got '{queue_name}' from queue poller."
            )

        # Extract configuration for logging
        consumer_group = data.config.get("consumerGroup", "default")
        batch_size = data.config.get("batchSize", 10)
        ack_mode = data.config.get("ackMode", "after_process")

        logger.info(
            "queue_trigger_executed",
            queue_name=queue_name,
            consumer_group=consumer_group,
            message_count=len(messages),
            batch_size=batch_size,
            ack_mode=ack_mode,
        )

        # Validate batch size limit
        max_batch = 100
        if len(messages) > max_batch:
            logger.warning(
                "queue_batch_size_exceeded",
                received=len(messages),
                max_allowed=max_batch,
            )
            messages = messages[:max_batch]

        return {
            "messages": messages,
            "messageCount": len(messages),
            "queueName": queue_name or configured_queue,
            "consumedAt": consumed_at,
        }
