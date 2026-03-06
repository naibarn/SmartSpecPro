"""Redis-backed cache for verified Playwright selector action lists."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    import redis.asyncio as aioredis


class SelectorCacheEntry(BaseModel):
    """Cached selector data for a URL + goal combination."""

    url: str
    goal: str
    actions: list  # list of PlaywrightAction dicts
    success_count: int = 0
    fail_count: int = 0
    heal_count: int = 0
    last_verified: datetime | None = None
    last_healed: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SelectorCache:
    """Redis cache for verified Playwright selectors.

    TTL: 7 days (604800 seconds), reset on successful use or heal.
    No PostgreSQL backup — cache miss triggers regeneration.
    """

    CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # 604800

    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client

    def _build_key(self, tenant_id: str, url: str, goal: str) -> str:
        url_hash = hashlib.sha256(url.encode()).hexdigest()[:32]
        goal_hash = hashlib.sha256(goal.encode()).hexdigest()[:32]
        return f"selcache:{tenant_id}:{url_hash}:{goal_hash}"

    async def get(self, tenant_id: str, url: str, goal: str) -> SelectorCacheEntry | None:
        key = self._build_key(tenant_id, url, goal)
        raw = await self._redis.get(key)
        if raw is None:
            return None
        return SelectorCacheEntry.model_validate(json.loads(raw))

    async def put(
        self, tenant_id: str, url: str, goal: str, actions: list
    ) -> None:
        key = self._build_key(tenant_id, url, goal)
        entry = SelectorCacheEntry(url=url, goal=goal, actions=actions)
        await self._redis.set(
            key,
            json.dumps(entry.model_dump(mode="json")),
            ex=self.CACHE_TTL_SECONDS,
        )

    async def mark_heal(
        self, tenant_id: str, url: str, goal: str, new_actions: list
    ) -> None:
        key = self._build_key(tenant_id, url, goal)
        raw = await self._redis.get(key)
        if raw is not None:
            entry = SelectorCacheEntry.model_validate(json.loads(raw))
            entry.actions = new_actions
            entry.heal_count += 1
            entry.last_healed = datetime.utcnow()
        else:
            entry = SelectorCacheEntry(
                url=url,
                goal=goal,
                actions=new_actions,
                heal_count=1,
                last_healed=datetime.utcnow(),
            )
        await self._redis.set(
            key,
            json.dumps(entry.model_dump(mode="json")),
            ex=self.CACHE_TTL_SECONDS,
        )

    async def invalidate(self, tenant_id: str, url: str, goal: str) -> None:
        key = self._build_key(tenant_id, url, goal)
        await self._redis.delete(key)
