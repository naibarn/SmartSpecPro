"""PostgreSQL TTL cache for verified Playwright selector action lists."""

from __future__ import annotations

import hashlib
from datetime import datetime

from pydantic import BaseModel, Field

from app.services.postgres_ephemeral_store import delete_value, put_value, read_value


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
    """PostgreSQL ephemeral cache for verified Playwright selectors.

    TTL: 7 days (604800 seconds), reset on successful use or heal.
    Cache miss triggers regeneration; durable job state stays in worker_jobs.
    """

    CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # 604800

    def _build_key(self, tenant_id: str, url: str, goal: str) -> str:
        url_hash = hashlib.sha256(url.encode()).hexdigest()[:32]
        goal_hash = hashlib.sha256(goal.encode()).hexdigest()[:32]
        return f"{tenant_id}:{url_hash}:{goal_hash}"

    async def get(self, tenant_id: str, url: str, goal: str) -> SelectorCacheEntry | None:
        entry = await read_value("playwright_selector_cache", self._build_key(tenant_id, url, goal))
        if entry is None:
            return None
        return SelectorCacheEntry.model_validate(entry)

    async def put(
        self, tenant_id: str, url: str, goal: str, actions: list
    ) -> None:
        key = self._build_key(tenant_id, url, goal)
        entry = SelectorCacheEntry(url=url, goal=goal, actions=actions)
        await put_value("playwright_selector_cache", key, entry.model_dump(mode="json"), self.CACHE_TTL_SECONDS)

    async def mark_heal(
        self, tenant_id: str, url: str, goal: str, new_actions: list
    ) -> None:
        key = self._build_key(tenant_id, url, goal)
        raw = await read_value("playwright_selector_cache", key)
        if raw is not None:
            entry = SelectorCacheEntry.model_validate(raw)
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
        await put_value("playwright_selector_cache", key, entry.model_dump(mode="json"), self.CACHE_TTL_SECONDS)

    async def invalidate(self, tenant_id: str, url: str, goal: str) -> None:
        await delete_value("playwright_selector_cache", self._build_key(tenant_id, url, goal))
