"""Redis deduplication helpers for Meta webhook deliveries."""

from __future__ import annotations

from typing import Any

from app.core.redis_client import get_cache_redis


class SocialWebhookDedupService:
    """Redis-backed webhook deduplication for delivery and message events."""

    def __init__(self, redis_client: Any | None = None) -> None:
        self._redis = redis_client

    async def _get_redis(self) -> Any | None:
        if self._redis is None:
            self._redis = await get_cache_redis()
        return self._redis

    @staticmethod
    def delivery_key(delivery_id: str) -> str:
        return f"social:webhook:delivery:{delivery_id}"

    @staticmethod
    def message_key(dedup_key: str) -> str:
        return f"social:webhook:message:{dedup_key}"

    @staticmethod
    def build_message_dedup_key(entry: dict, message: dict, index: int) -> str:
        entry_id = str(entry.get("id") or entry.get("page_id") or "unknown")
        message_payload_raw = message.get("message")
        message_payload = message_payload_raw if isinstance(message_payload_raw, dict) else {}
        mid = message_payload.get("mid") or message.get("mid")
        if mid:
            return f"{entry_id}_{mid}"

        timestamp = (
            message.get("timestamp")
            or message.get("time")
            or entry.get("time")
            or message.get("created_time")
            or 0
        )
        return f"{entry_id}_{timestamp}_{index}"

    @staticmethod
    def build_delivery_id(payload: dict) -> str:
        entries = payload.get("entry") or []
        if not isinstance(entries, list):
            entries = []

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            entry_id = str(entry.get("id") or entry.get("page_id") or "unknown")
            messaging = entry.get("messaging") or []
            if isinstance(messaging, list) and messaging:
                for index, message in enumerate(messaging):
                    if not isinstance(message, dict):
                        continue
                    message_payload_raw = message.get("message")
                    message_payload = message_payload_raw if isinstance(message_payload_raw, dict) else {}
                    mid = message_payload.get("mid") or message.get("mid")
                    if mid:
                        return f"{entry_id}_{mid}"
                    timestamp = (
                        message.get("timestamp")
                        or message.get("time")
                        or entry.get("time")
                        or message.get("created_time")
                        or 0
                    )
                    return f"{entry_id}_{timestamp}_{index}"

            changes = entry.get("changes") or []
            if isinstance(changes, list) and changes:
                for index, change in enumerate(changes):
                    if not isinstance(change, dict):
                        continue
                    value = change.get("value") or {}
                    if not isinstance(value, dict):
                        value = {}
                    comment_id = value.get("comment_id") or value.get("id")
                    if comment_id:
                        return f"{entry_id}_{comment_id}"
                    timestamp = entry.get("time") or value.get("created_time") or 0
                    return f"{entry_id}_{timestamp}_{index}"

        return "unknown_0_0"

    async def is_duplicate(self, delivery_id: str) -> bool:
        redis = await self._get_redis()
        if redis is None:
            return False
        return bool(await redis.exists(self.delivery_key(delivery_id)))

    async def mark_processed(self, delivery_id: str, *, ttl_seconds: int = 24 * 60 * 60) -> None:
        redis = await self._get_redis()
        if redis is None:
            return
        await redis.set(self.delivery_key(delivery_id), "1", ex=ttl_seconds)

    async def is_message_duplicate(self, dedup_key: str) -> bool:
        redis = await self._get_redis()
        if redis is None:
            return False
        return bool(await redis.exists(self.message_key(dedup_key)))

    async def mark_message_processed(self, dedup_key: str, *, ttl_seconds: int = 24 * 60 * 60) -> None:
        redis = await self._get_redis()
        if redis is None:
            return
        await redis.set(self.message_key(dedup_key), "1", ex=ttl_seconds)
