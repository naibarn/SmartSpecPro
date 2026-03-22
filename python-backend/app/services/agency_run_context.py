"""
AgencyRunContext — thread-safe shared state for a single agency run.

All agents, tools, and node handlers in the same run share one instance.
Access is serialized via asyncio.Lock to prevent concurrent mutation issues.

No imports from agency-swarm — isolation pattern preserved.
"""

from __future__ import annotations

import asyncio
import copy
from typing import Any


class AgencyRunContext:
    """Thread-safe shared state for a single agency run.

    All agents, tools, and node handlers in the same run share one instance.
    Access is serialized via asyncio.Lock to prevent concurrent mutation issues.
    """

    def __init__(self, initial_data: dict[str, Any] | None = None) -> None:
        self._data: dict[str, Any] = dict(initial_data) if initial_data else {}
        self._lock = asyncio.Lock()

    async def get(self, key: str, default: Any = None) -> Any:
        """Read a value by key. Returns default if missing."""
        async with self._lock:
            return self._data.get(key, default)

    async def set(self, key: str, value: Any) -> None:
        """Write a value by key. Overwrites existing."""
        async with self._lock:
            self._data[key] = value

    async def get_all(self) -> dict[str, Any]:
        """Return a shallow copy of all key-value pairs."""
        async with self._lock:
            return dict(self._data)

    def snapshot(self) -> dict[str, Any]:
        """Return a deep copy for persistence (synchronous, used at run end).

        MUST only be called after all async operations on this context have
        completed. For mid-run reads, use ``await get_all()`` instead.
        """
        return copy.deepcopy(self._data)

    # ── Sync helpers for agency-swarm tool run() methods ──────────────
    # These bypass the asyncio.Lock and are ONLY safe when no concurrent
    # async writes are in progress (i.e., single-threaded sequential execution).
    # Section-18 parallel fan-out callers must use the async methods instead.

    def get_sync(self, key: str, default: Any = None) -> Any:
        """Synchronous read — only safe when no concurrent async writes."""
        return self._data.get(key, default)

    def set_sync(self, key: str, value: Any) -> None:
        """Synchronous write — only safe when no concurrent async writes."""
        self._data[key] = value
