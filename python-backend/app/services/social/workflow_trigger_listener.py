"""Realtime listener for social workflow trigger streams."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

import structlog
from redis.asyncio import Redis
from sqlalchemy import text

from app.core.database import get_db_context
from app.core.redis_client import get_realtime_redis
from app.tasks.social_workflow_trigger_task import process_social_workflow_message

logger = structlog.get_logger(__name__)


class SocialTriggerListener:
    """Listen to Redis Streams and enqueue workflow trigger tasks."""

    def __init__(self) -> None:
        self._redis: Redis | None = None
        self._running = False
        self._page_tasks: dict[int, asyncio.Task] = {}
        self._refresh_task: asyncio.Task | None = None
        self._consumer_group = "social-workflow-triggers"
        self._consumer_name = f"social-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    async def _load_active_pages(self) -> list[int]:
        async with get_db_context() as db:
            result = await db.execute(
                text(
                    """
                    SELECT id
                    FROM social_pages
                    WHERE status = 'active'
                    ORDER BY id ASC
                    """
                )
            )
            return [int(row[0]) for row in result.fetchall()]

    async def _ensure_consumer_group(self, page_id: int) -> None:
        if self._redis is None:
            return
        stream_key = f"social:stream:{page_id}"
        try:
            await self._redis.xgroup_create(
                name=stream_key,
                groupname=self._consumer_group,
                id="0",
                mkstream=True,
            )
        except Exception as exc:
            if "BUSYGROUP" not in str(exc):
                logger.warning("social_trigger_group_create_failed", page_id=page_id, error=str(exc))

    async def _consume_page_stream(self, page_id: int) -> None:
        if self._redis is None:
            return

        stream_key = f"social:stream:{page_id}"
        await self._ensure_consumer_group(page_id)

        while self._running:
            try:
                messages = await self._redis.xreadgroup(
                    groupname=self._consumer_group,
                    consumername=self._consumer_name,
                    streams={stream_key: ">"},
                    count=10,
                    block=1000,
                )
                if not messages:
                    continue

                for _, stream_messages in messages:
                    if not stream_messages:
                        continue

                    ack_ids: list[str] = []
                    for message_id, message_data in stream_messages:
                        payload = {str(key): str(value) for key, value in message_data.items()}
                        social_message_id = payload.get("message_id")
                        if social_message_id:
                            process_social_workflow_message.delay(
                                message_id=int(social_message_id),
                                page_id=page_id,
                                trigger_mode="realtime",
                            )
                            ack_ids.append(message_id)

                    if ack_ids:
                        await self._redis.xack(stream_key, self._consumer_group, *ack_ids)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("social_trigger_stream_loop_error", page_id=page_id, error=str(exc))
                await asyncio.sleep(5)

    async def _refresh_pages(self) -> None:
        while self._running:
            try:
                active_pages = set(await self._load_active_pages())
                current_pages = set(self._page_tasks.keys())

                for page_id in active_pages - current_pages:
                    task = asyncio.create_task(self._consume_page_stream(page_id))
                    self._page_tasks[page_id] = task
                    logger.info("social_trigger_listener_page_started", page_id=page_id)

                for page_id in current_pages - active_pages:
                    task = self._page_tasks.pop(page_id, None)
                    if task:
                        task.cancel()
                        logger.info("social_trigger_listener_page_stopped", page_id=page_id)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("social_trigger_listener_refresh_failed", error=str(exc))

            await asyncio.sleep(30)

    async def run(self) -> None:
        self._redis = await get_realtime_redis()
        if self._redis is None:
            logger.warning("social_trigger_listener_no_redis")
            return

        self._running = True
        logger.info("social_trigger_listener_started")
        self._refresh_task = asyncio.create_task(self._refresh_pages())
        try:
            await self._refresh_task
        except asyncio.CancelledError:
            pass
        finally:
            await self.stop()

    async def stop(self) -> None:
        self._running = False
        if self._refresh_task:
            self._refresh_task.cancel()
            self._refresh_task = None
        for page_id, task in list(self._page_tasks.items()):
            task.cancel()
            self._page_tasks.pop(page_id, None)
        if self._redis is not None:
            try:
                await self._redis.close()
            except Exception:
                pass
            self._redis = None
        logger.info("social_trigger_listener_stopped")


_listener = SocialTriggerListener()


def get_social_trigger_listener() -> SocialTriggerListener:
    return _listener
