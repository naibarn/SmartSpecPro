"""
Redis Streams Queue Consumer for queue_trigger workflow nodes.

This service monitors Redis Streams and triggers workflows when messages arrive.
Run as a background worker: python -m app.services.queue_consumer
"""
import asyncio
import signal
import sys
from datetime import datetime
from typing import Any

import structlog
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db_context
from app.models.workflow import Workflow
from app.tasks.workflow_tasks import process_queue_message

logger = structlog.get_logger(__name__)


class QueueConsumer:
    """Redis Streams consumer for queue_trigger nodes."""

    def __init__(self):
        self.redis: Redis | None = None
        self.running = False
        self.consumer_group = "workflow-queue-consumers"
        self.consumer_name = f"consumer-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        # Queues to monitor (in production, this would be dynamic based on workflows)
        self.monitored_queues = ["workflow-queue", "default-queue"]

    async def connect(self):
        """Connect to Redis."""
        redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
        self.redis = Redis.from_url(redis_url, decode_responses=True)
        logger.info("queue_consumer_connected", redis_url=redis_url)

    async def ensure_consumer_groups(self):
        """Create consumer groups for all monitored queues if they don't exist."""
        for queue_name in self.monitored_queues:
            try:
                # Try to create the stream and consumer group
                await self.redis.xgroup_create(
                    name=queue_name,
                    groupname=self.consumer_group,
                    id="0",
                    mkstream=True,
                )
                logger.info(
                    "consumer_group_created",
                    queue=queue_name,
                    group=self.consumer_group,
                )
            except Exception as e:
                # Group already exists, which is fine
                if "BUSYGROUP" in str(e):
                    logger.info(
                        "consumer_group_exists",
                        queue=queue_name,
                        group=self.consumer_group,
                    )
                else:
                    logger.error(
                        "consumer_group_creation_failed",
                        queue=queue_name,
                        error=str(e),
                    )

    async def consume_messages(self, queue_name: str):
        """
        Consume messages from a single Redis Stream.

        Uses XREADGROUP to read messages from the consumer group,
        ensuring at-least-once delivery with manual ACK.
        """
        while self.running:
            try:
                # Read messages from stream (block for 1 second if no messages)
                messages = await self.redis.xreadgroup(
                    groupname=self.consumer_group,
                    consumername=self.consumer_name,
                    streams={queue_name: ">"},
                    count=10,  # Process up to 10 messages at a time
                    block=1000,  # Block for 1 second
                )

                if not messages:
                    continue

                # Process messages for this queue
                for stream_name, stream_messages in messages:
                    if not stream_messages:
                        continue

                    # Extract message data
                    message_list = []
                    message_ids = []

                    for message_id, message_data in stream_messages:
                        message_list.append({
                            "id": message_id,
                            "data": message_data,
                            "queue": stream_name,
                        })
                        message_ids.append(message_id)

                    logger.info(
                        "messages_received",
                        queue=queue_name,
                        count=len(message_list),
                    )

                    # Trigger workflow via Celery
                    try:
                        process_queue_message.delay(
                            queue_name=queue_name,
                            messages=message_list,
                        )

                        # ACK messages after successful queueing
                        for msg_id in message_ids:
                            await self.redis.xack(queue_name, self.consumer_group, msg_id)

                        logger.info(
                            "messages_acked",
                            queue=queue_name,
                            count=len(message_ids),
                        )

                    except Exception as e:
                        logger.exception(
                            "message_processing_failed",
                            queue=queue_name,
                            error=str(e),
                        )
                        # Don't ACK on error - message will be redelivered

            except asyncio.CancelledError:
                logger.info("consume_task_cancelled", queue=queue_name)
                break
            except Exception as e:
                logger.exception("consume_loop_error", queue=queue_name, error=str(e))
                await asyncio.sleep(5)  # Back off on error

    async def start(self):
        """Start the queue consumer."""
        await self.connect()
        await self.ensure_consumer_groups()

        self.running = True
        logger.info(
            "queue_consumer_started",
            queues=self.monitored_queues,
            consumer_name=self.consumer_name,
        )

        # Create consume tasks for each queue
        tasks = [
            asyncio.create_task(self.consume_messages(queue))
            for queue in self.monitored_queues
        ]

        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            logger.info("consumer_tasks_cancelled")
        finally:
            await self.stop()

    async def stop(self):
        """Stop the queue consumer."""
        self.running = False
        if self.redis:
            await self.redis.close()
        logger.info("queue_consumer_stopped")


# Global consumer instance
consumer = QueueConsumer()


def handle_signal(sig, frame):
    """Handle shutdown signals."""
    logger.info("shutdown_signal_received", signal=sig)
    consumer.running = False


async def main():
    """Main entry point for the queue consumer."""
    # Register signal handlers
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    logger.info("queue_consumer_starting")

    try:
        await consumer.start()
    except KeyboardInterrupt:
        logger.info("keyboard_interrupt_received")
    except Exception as e:
        logger.exception("consumer_fatal_error", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
