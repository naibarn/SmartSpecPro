from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.workflows import get_connected_pages


@pytest.mark.asyncio
async def test_get_connected_pages_returns_active_pages() -> None:
    db = AsyncMock()
    result = MagicMock()
    result.fetchall.return_value = [
        (11, "Support Page", "provider-11", "active"),
        (12, None, "provider-12", "active"),
    ]
    db.execute = AsyncMock(return_value=result)

    payload = await get_connected_pages(
        current_user=SimpleNamespace(currentTenantId="tenant-1"),
        db=db,
    )

    assert payload == {
        "pages": [
            {"label": "Support Page", "value": "11"},
            {"label": "provider-12", "value": "12"},
        ]
    }
