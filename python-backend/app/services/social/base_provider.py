from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class SocialProviderClient(Protocol):
    async def send_message(self, recipient_id: str, text: str) -> dict[str, Any]: ...

    async def create_post(
        self,
        message: str,
        link: str | None = None,
        scheduled_at: int | None = None,
    ) -> dict[str, Any]: ...

    async def get_comments(self, object_id: str, limit: int = 25, after: str | None = None) -> dict[str, Any]: ...

    async def close(self) -> None: ...
